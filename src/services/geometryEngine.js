import * as THREE from 'three';
import { v4 as uuidv4 } from 'uuid';

/**
 * Lakar CAD — Geometry Engine (SketchUp-style Manifold)
 *
 * Core data model matches SketchUp's topology:
 *   • Vertex  — a 3D point
 *   • Edge    — a line between two vertices
 *   • Face    — a closed loop of edges forming a planar polygon
 *   • Group   — a named container of entities (vertices/edges/faces)
 *
 * State is stored as plain immutable objects so React can diff them.
 */

// ─── Factory Functions ──────────────────────────────────────

export function makeVertex(x, y, z) {
  return { id: uuidv4(), type: 'vertex', x, y, z };
}

export function makeEdge(v1Id, v2Id) {
  return { id: uuidv4(), type: 'edge', v1: v1Id, v2: v2Id };
}

export function makeFace(edgeIds, color = '#c8c8c8') {
  return { id: uuidv4(), type: 'face', edges: edgeIds, color };
}

export function makeGroup(name = 'Group', parentId = null) {
  return { id: uuidv4(), type: 'group', name, parentId, childIds: [] };
}

// ─── Scene State ────────────────────────────────────────────

/**
 * Returns a fresh, empty scene state.
 */
export function createScene() {
  return {
    vertices: {},   // id -> vertex
    edges:    {},   // id -> edge
    faces:    {},   // id -> face
    groups:   {},   // id -> group
    // top-level entities that don't belong to a group
    topLevel: [],   // [entityId, ...]
  };
}

// ─── Mutation helpers (return NEW state objects) ────────────

export function addVertex(scene, x, y, z) {
  const v = makeVertex(x, y, z);
  return {
    ...scene,
    vertices: { ...scene.vertices, [v.id]: v },
    topLevel: [...scene.topLevel, v.id],
    _added: v,
  };
}

export function addEdge(scene, v1Id, v2Id) {
  // Deduplicate: don't add edge if same pair already exists
  for (const e of Object.values(scene.edges)) {
    if ((e.v1 === v1Id && e.v2 === v2Id) || (e.v1 === v2Id && e.v2 === v1Id)) {
      return { ...scene, _added: e };
    }
  }
  const e = makeEdge(v1Id, v2Id);
  return {
    ...scene,
    edges: { ...scene.edges, [e.id]: e },
    topLevel: [...scene.topLevel, e.id],
    _added: e,
  };
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
  };
}

export function deleteEntity(scene, id) {
  const newVertices = { ...scene.vertices };
  const newEdges    = { ...scene.edges };
  const newFaces    = { ...scene.faces };
  delete newVertices[id];
  delete newEdges[id];
  delete newFaces[id];
  return {
    ...scene,
    vertices: newVertices,
    edges:    newEdges,
    faces:    newFaces,
    topLevel: scene.topLevel.filter(i => i !== id),
  };
}

// ─── Inference Engine ───────────────────────────────────────

/**
 * Given a raw pointer position, return the best snapped point.
 * Priority: endpoint > midpoint > on-axis
 */
export function getInference(rawPoint, scene, threshold = 0.25) {
  let best = { point: rawPoint.clone(), type: 'free', snapId: null };
  let minDist = threshold;

  // 1. Endpoint snapping
  for (const v of Object.values(scene.vertices)) {
    const vp = new THREE.Vector3(v.x, v.y, v.z);
    const d  = rawPoint.distanceTo(vp);
    if (d < minDist) {
      minDist = d;
      best = { point: vp, type: 'endpoint', snapId: v.id };
    }
  }

  // 2. Midpoint snapping
  for (const e of Object.values(scene.edges)) {
    const v1 = scene.vertices[e.v1];
    const v2 = scene.vertices[e.v2];
    if (!v1 || !v2) continue;
    const mid = new THREE.Vector3(
      (v1.x + v2.x) / 2,
      (v1.y + v2.y) / 2,
      (v1.z + v2.z) / 2,
    );
    const d = rawPoint.distanceTo(mid);
    if (d < minDist) {
      minDist = d;
      best = { point: mid, type: 'midpoint', snapId: e.id };
    }
  }

  // 3. Axis snapping (green/red/blue lines from origin or from a reference point)
  // If no close snap found, snap to nearest grid unit
  if (best.type === 'free') {
    const snapped = rawPoint.clone();
    snapped.x = Math.round(snapped.x * 4) / 4; // 0.25m grid
    snapped.y = Math.round(snapped.y * 4) / 4;
    snapped.z = Math.round(snapped.z * 4) / 4;
    best = { point: snapped, type: 'grid', snapId: null };
  }

  return best;
}

// ─── Closed Loop Detection ──────────────────────────────────

/**
 * After adding an edge, check whether any subset of edges now forms
 * a closed polygon. Returns an array of vertex positions (in order)
 * if a loop is found, otherwise null.
 */
export function detectClosedLoop(scene, maxVertices = 20) {
  // Build adjacency map
  const adj = {};
  for (const v of Object.keys(scene.vertices)) adj[v] = [];
  for (const e of Object.values(scene.edges)) {
    adj[e.v1]?.push({ via: e.id, to: e.v2 });
    adj[e.v2]?.push({ via: e.id, to: e.v1 });
  }

  // DFS looking for a cycle of 3+ vertices
  function dfs(startId, currentId, visited, path) {
    for (const neighbor of (adj[currentId] || [])) {
      if (neighbor.to === startId && path.length >= 3) {
        return [...path]; // Found cycle
      }
      if (!visited.has(neighbor.to) && path.length < maxVertices) {
        visited.add(neighbor.to);
        const result = dfs(startId, neighbor.to, visited, [...path, neighbor.to]);
        if (result) return result;
        visited.delete(neighbor.to);
      }
    }
    return null;
  }

  for (const startId of Object.keys(scene.vertices)) {
    const loop = dfs(startId, startId, new Set([startId]), [startId]);
    if (loop) {
      return loop.map(id => {
        const v = scene.vertices[id];
        return new THREE.Vector3(v.x, v.y, v.z);
      });
    }
  }
  return null;
}

// ─── AI Serialization ───────────────────────────────────────

export function serializeForAI(scene) {
  const vList = Object.values(scene.vertices).map(v => `${v.id.slice(0,6)} (${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`);
  const eList = Object.values(scene.edges).map(e => `${e.id.slice(0,6)}: ${e.v1.slice(0,6)} → ${e.v2.slice(0,6)}`);
  const fList = Object.values(scene.faces).map(f => `${f.id.slice(0,6)} [${f.edges.join(', ')}]`);
  return [
    `Vertices (${vList.length}): ${vList.join('; ') || 'none'}`,
    `Edges    (${eList.length}): ${eList.join('; ') || 'none'}`,
    `Faces    (${fList.length}): ${fList.join('; ') || 'none'}`,
  ].join('\n');
}
