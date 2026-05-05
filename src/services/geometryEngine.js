import * as THREE from 'three';
import { v4 as uuidv4 } from 'uuid';

// ─────────────────────────────────────────────────────────────
// DATA FACTORIES
// ─────────────────────────────────────────────────────────────

export function makeVertex(x, y, z) {
  return { id: uuidv4(), type: 'vertex', x, y, z };
}

export function makeEdge(v1Id, v2Id) {
  return { id: uuidv4(), type: 'edge', v1: v1Id, v2: v2Id };
}

/**
 * A face is a planar polygon defined by an ordered list of vertex IDs.
 * normal: THREE.Vector3 (unit vector perpendicular to face, pointing outward)
 */
export function makeFace(vertexIds, normal, color = '#d8d8c8') {
  return {
    id: uuidv4(),
    type: 'face',
    vertices: vertexIds,   // ordered vertex IDs forming the polygon boundary
    normal: { x: normal.x, y: normal.y, z: normal.z },
    color,
  };
}

// ─────────────────────────────────────────────────────────────
// SCENE STATE
// ─────────────────────────────────────────────────────────────

export function createScene() {
  return {
    vertices: {},  // id -> vertex
    edges:    {},  // id -> edge
    faces:    {},  // id -> face
  };
}

// ─────────────────────────────────────────────────────────────
// IMMUTABLE SCENE MUTATIONS
// ─────────────────────────────────────────────────────────────

/**
 * Add a vertex. Returns { scene, vertexId }
 * Snaps to existing vertex within tolerance.
 */
export function addVertex(scene, x, y, z, snapTolerance = 0.05) {
  // Check for nearby existing vertex (vertex welding)
  const pt = new THREE.Vector3(x, y, z);
  for (const v of Object.values(scene.vertices)) {
    if (new THREE.Vector3(v.x, v.y, v.z).distanceTo(pt) < snapTolerance) {
      return { scene, vertexId: v.id };
    }
  }
  const v = makeVertex(x, y, z);
  return {
    scene: { ...scene, vertices: { ...scene.vertices, [v.id]: v } },
    vertexId: v.id,
  };
}

/**
 * Add an edge between two vertex IDs.
 * Returns { scene, edgeId, faceCreated? }
 * Automatically detects and creates faces if a loop closes.
 */
export function addEdge(scene, v1Id, v2Id) {
  if (v1Id === v2Id) return { scene, edgeId: null };

  // Deduplicate edges
  for (const e of Object.values(scene.edges)) {
    if ((e.v1 === v1Id && e.v2 === v2Id) || (e.v1 === v2Id && e.v2 === v1Id)) {
      return { scene, edgeId: e.id };
    }
  }

  const edge = makeEdge(v1Id, v2Id);
  let newScene = { ...scene, edges: { ...scene.edges, [edge.id]: edge } };

  // Now detect if any closed loop formed
  const loops = findClosedLoops(newScene, v1Id, v2Id);
  for (const loop of loops) {
    const face = buildFace(newScene, loop);
    if (face) {
      newScene = { ...newScene, faces: { ...newScene.faces, [face.id]: face } };
    }
  }

  return { scene: newScene, edgeId: edge.id };
}

export function moveVertex(scene, vertexId, dx, dy, dz) {
  const v = scene.vertices[vertexId];
  if (!v) return scene;
  return {
    ...scene,
    vertices: {
      ...scene.vertices,
      [vertexId]: { ...v, x: v.x + dx, y: v.y + dy, z: v.z + dz },
    },
    // Invalidate faces that use this vertex — they need recalculation
    faces: Object.fromEntries(
      Object.entries(scene.faces).map(([id, f]) => {
        if (!f.vertices.includes(vertexId)) return [id, f];
        const verts = f.vertices.map(vid =>
          vid === vertexId
            ? { ...scene.vertices[vid], x: scene.vertices[vid].x + dx, y: scene.vertices[vid].y + dy, z: scene.vertices[vid].z + dz }
            : scene.vertices[vid]
        );
        const normal = computeNormal(verts.map(v => new THREE.Vector3(v.x, v.y, v.z)));
        return [id, { ...f, normal: { x: normal.x, y: normal.y, z: normal.z } }];
      })
    ),
  };
}

export function deleteEntity(scene, id) {
  const nv = { ...scene.vertices };
  const ne = { ...scene.edges };
  const nf = { ...scene.faces };
  delete nv[id]; delete ne[id]; delete nf[id];
  // Also remove faces that used deleted vertex/edge
  for (const [fid, f] of Object.entries(nf)) {
    if (f.vertices.includes(id)) delete nf[fid];
  }
  return { ...scene, vertices: nv, edges: ne, faces: nf };
}

// ─────────────────────────────────────────────────────────────
// PUSH / PULL (EXTRUSION)
// ─────────────────────────────────────────────────────────────

/**
 * Extrudes a face by `depth` along its normal.
 * Returns a new scene with the solid geometry added.
 */
export function extrudeFace(scene, faceId, depth) {
  const face = scene.faces[faceId];
  if (!face || face.vertices.length < 3) return scene;

  const normal = new THREE.Vector3(face.normal.x, face.normal.y, face.normal.z);
  const offset = normal.clone().multiplyScalar(depth);

  let s = scene;

  // 1. Create new top vertices (offset copies)
  const topIds = [];
  for (const vid of face.vertices) {
    const v = s.vertices[vid];
    if (!v) continue;
    const result = addVertex(s, v.x + offset.x, v.y + offset.y, v.z + offset.z, 0.001);
    s = result.scene;
    topIds.push(result.vertexId);
  }

  // 2. Connect bottom ↔ top with vertical edges + side faces
  const bottomIds = face.vertices;
  for (let i = 0; i < bottomIds.length; i++) {
    const b0 = bottomIds[i];
    const b1 = bottomIds[(i + 1) % bottomIds.length];
    const t0 = topIds[i];
    const t1 = topIds[(i + 1) % bottomIds.length];

    // Vertical edge
    const r1 = addEdge(s, b0, t0); s = r1.scene;
    // Top edge
    const r2 = addEdge(s, t0, t1); s = r2.scene;

    // Side face (quad)
    const sideVerts = [b0, b1, t1, t0];
    const sidePositions = sideVerts.map(id => {
      const v = s.vertices[id];
      return new THREE.Vector3(v.x, v.y, v.z);
    });
    const sideNormal = computeNormal(sidePositions);
    const sideFace = makeFace(sideVerts, sideNormal, face.color);
    s = { ...s, faces: { ...s.faces, [sideFace.id]: sideFace } };
  }

  // 3. Top face
  const topNormal = normal.clone();
  const topFace = makeFace(topIds, topNormal, face.color);
  s = { ...s, faces: { ...s.faces, [topFace.id]: topFace } };

  // 4. Remove original bottom face (it's now interior if extruding up,
  //    or keep as bottom cap if extruding away from origin)
  // SketchUp keeps the bottom face — we keep it too.

  return s;
}

// ─────────────────────────────────────────────────────────────
// CLOSED LOOP DETECTION
// ─────────────────────────────────────────────────────────────

/**
 * After adding edge (v1Id, v2Id), find all simple cycles that now close.
 * Returns arrays of vertex IDs (ordered polygon boundaries).
 */
function findClosedLoops(scene, newV1, newV2) {
  // Build adjacency (undirected)
  const adj = {};
  for (const vid of Object.keys(scene.vertices)) adj[vid] = [];
  for (const e of Object.values(scene.edges)) {
    adj[e.v1]?.push(e.v2);
    adj[e.v2]?.push(e.v1);
  }

  const loops = [];

  // Find shortest path from newV2 back to newV1 WITHOUT going through the new edge directly
  // (BFS for shortest path)
  const path = bfsPath(adj, newV2, newV1, null, 20);
  if (path && path.length >= 3) {
    loops.push(path);
  }

  return loops;
}

/**
 * BFS to find shortest path from `start` to `end`.
 * `skipNeighbor` can be used to avoid direct connection (avoid using the new edge).
 */
function bfsPath(adj, start, end, skipNeighbor, maxLen) {
  const queue = [[start, [start]]];
  const visited = new Set([start]);

  while (queue.length > 0) {
    const [node, path] = queue.shift();
    if (path.length > maxLen) continue;

    for (const neighbor of (adj[node] || [])) {
      // On the first step from start, skip the direct edge to end if told to
      if (path.length === 1 && neighbor === end && skipNeighbor === end) continue;

      if (neighbor === end && path.length >= 2) {
        return [...path, end];
      }
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push([neighbor, [...path, neighbor]]);
      }
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// FACE CONSTRUCTION
// ─────────────────────────────────────────────────────────────

function buildFace(scene, vertexIds) {
  if (vertexIds.length < 3) return null;

  // Get positions
  const positions = vertexIds.map(id => {
    const v = scene.vertices[id];
    return v ? new THREE.Vector3(v.x, v.y, v.z) : null;
  }).filter(Boolean);

  if (positions.length < 3) return null;

  // Check planarity (all vertices within 0.01m of the plane)
  const normal = computeNormal(positions);
  if (normal.length() < 0.0001) return null; // degenerate

  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, positions[0]);
  for (const p of positions) {
    if (Math.abs(plane.distanceToPoint(p)) > 0.05) return null; // not planar
  }

  // Check that this face doesn't already exist
  // (same vertex set regardless of order)
  const vSet = new Set(vertexIds);

  return makeFace(vertexIds, normal);
}

// ─────────────────────────────────────────────────────────────
// GEOMETRY UTILITIES
// ─────────────────────────────────────────────────────────────

/**
 * Compute face normal using Newell's method (handles non-triangular polygons).
 */
export function computeNormal(positions) {
  const n = new THREE.Vector3();
  const count = positions.length;
  for (let i = 0; i < count; i++) {
    const curr = positions[i];
    const next = positions[(i + 1) % count];
    n.x += (curr.y - next.y) * (curr.z + next.z);
    n.y += (curr.z - next.z) * (curr.x + next.x);
    n.z += (curr.x - next.x) * (curr.y + next.y);
  }
  return n.normalize();
}

/**
 * Triangulate a convex/simple polygon for Three.js BufferGeometry.
 * Returns flat Float32Array of xyz triples.
 */
export function triangulateFace(positions) {
  const tris = [];
  for (let i = 1; i < positions.length - 1; i++) {
    tris.push(positions[0], positions[i], positions[i + 1]);
  }
  const arr = new Float32Array(tris.length * 3);
  tris.forEach((p, i) => { arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z; });
  return arr;
}

// ─────────────────────────────────────────────────────────────
// INFERENCE ENGINE
// ─────────────────────────────────────────────────────────────

export function getInference(rawPoint, scene, threshold = 0.3) {
  let best = { point: rawPoint.clone(), type: 'free', snapId: null };
  let minDist = threshold;

  // 1. Endpoint snap
  for (const v of Object.values(scene.vertices)) {
    const vp = new THREE.Vector3(v.x, v.y, v.z);
    const d = rawPoint.distanceTo(vp);
    if (d < minDist) {
      minDist = d;
      best = { point: vp.clone(), type: 'endpoint', snapId: v.id };
    }
  }

  // 2. Midpoint snap
  if (best.type === 'free') {
    for (const e of Object.values(scene.edges)) {
      const v1 = scene.vertices[e.v1];
      const v2 = scene.vertices[e.v2];
      if (!v1 || !v2) continue;
      const mid = new THREE.Vector3(
        (v1.x + v2.x) / 2, (v1.y + v2.y) / 2, (v1.z + v2.z) / 2
      );
      const d = rawPoint.distanceTo(mid);
      if (d < minDist) {
        minDist = d;
        best = { point: mid.clone(), type: 'midpoint', snapId: e.id };
      }
    }
  }

  // 3. Grid snap (0.25m)
  if (best.type === 'free') {
    const snapped = rawPoint.clone();
    snapped.x = Math.round(snapped.x * 4) / 4;
    snapped.y = Math.round(snapped.y * 4) / 4;
    snapped.z = Math.round(snapped.z * 4) / 4;
    best = { point: snapped, type: 'grid', snapId: null };
  }

  return best;
}

// ─────────────────────────────────────────────────────────────
// AI SERIALIZATION
// ─────────────────────────────────────────────────────────────

export function serializeForAI(scene) {
  const vCount = Object.keys(scene.vertices).length;
  const eCount = Object.keys(scene.edges).length;
  const fCount = Object.keys(scene.faces).length;

  const lines = [
    `Model: ${vCount} vertices, ${eCount} edges, ${fCount} faces.`,
  ];

  if (fCount > 0) {
    for (const f of Object.values(scene.faces)) {
      const verts = f.vertices.map(id => {
        const v = scene.vertices[id];
        return v ? `(${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)})` : '?';
      });
      lines.push(`Face ${f.id.slice(0,6)}: [${verts.join(' ')}]`);
    }
  }

  return lines.join('\n');
}
