/**
 * pushpull.js — SketchUp-style Push/Pull: extrude a face along its normal,
 * auto-creating side walls and the moved cap face, with orientation chosen so
 * a standalone face becomes a closed, outward-oriented solid.
 *
 * Behaviors:
 *  - standalone face (no edge shared with another face): the original face is
 *    kept as the opposite cap and flipped so the result is a closed manifold
 *  - embedded face (every edge shared with another face, e.g. the top of a
 *    box): the original face is deleted so the solid grows seamlessly
 *  - mixed attachment: the original face is kept as-is
 */

import { add, scale, neg, WELD_TOL } from './math3.js';

/**
 * @param {import('./mesh.js').Mesh} mesh
 * @param {string} faceId
 * @param {number} dist — signed distance along the face normal
 * @returns {{ topFaceId: string|null, sideFaceIds: string[], removedOriginal: boolean } | null}
 */
export function pushPull(mesh, faceId, dist) {
  const f = mesh.faces.get(faceId);
  if (!f || Math.abs(dist) < WELD_TOL) return null;

  const n = f.normal;
  const loop = [...f.loop];
  const offset = scale(n, dist);

  // classify attachment before we add geometry
  const edgeIds = mesh.faceEdgeIds(faceId);
  const shareCounts = edgeIds.map((eid) => mesh.edgeFaces(eid).size);
  const embedded = shareCounts.length > 0 && shareCounts.every((c) => c >= 2);
  const standalone = shareCounts.every((c) => c <= 1);

  // 1. offset copies of the loop vertices (welded onto coincident geometry)
  const topIds = loop.map((vid) => {
    const p = mesh.vertices.get(vid).p;
    return mesh.addVertex(add(p, offset)).id;
  });

  // degenerate extrusion (welded back onto itself)
  if (topIds.every((tid, i) => tid === loop[i])) return null;

  // 2. side walls
  const sideFaceIds = [];
  const m = loop.length;
  for (let i = 0; i < m; i++) {
    const b0 = loop[i], b1 = loop[(i + 1) % m];
    const t0 = topIds[i], t1 = topIds[(i + 1) % m];

    if (t0 !== b0) mesh.addEdge(b0, t0, { detectFaces: false });
    if (t0 !== t1) mesh.addEdge(t0, t1, { detectFaces: false });

    // outward winding: pulls (+dist) wind bottom→top, pushes reverse
    const quad = dist > 0 ? [b0, b1, t1, t0] : [b1, b0, t0, t1];
    const unique = [...new Set(quad)];
    if (unique.length < 3) continue; // collapsed wall
    if (mesh._faceExistsForLoop(unique)) continue;
    const wall = mesh._createFace(unique.length === 4 ? quad : unique, f.color);
    sideFaceIds.push(wall.id);
  }

  // 3. moved cap face
  let topFaceId = null;
  const topLoop = dist > 0 ? topIds : [...topIds].reverse();
  if (new Set(topIds).size >= 3 && !mesh._faceExistsForLoop(topLoop)) {
    topFaceId = mesh._createFace(topLoop, f.color).id;
  }

  // 4. original face
  let removedOriginal = false;
  if (embedded) {
    mesh.eraseFaceOnly(faceId);
    removedOriginal = true;
  } else if (standalone && dist > 0) {
    // flip so it becomes the outward-facing bottom cap of the new solid
    f.loop.reverse();
    f.normal = neg(n);
    mesh._reindexFaceEdges(faceId);
  }
  // (standalone push (dist<0): original cap already faces outward; mixed: leave as-is)

  return { topFaceId, sideFaceIds, removedOriginal };
}

/**
 * Validate that a set of faces forms a closed manifold shell: every edge used
 * by faces in the mesh borders exactly two of them. Used by tests/diagnostics.
 */
export function isClosedSolid(mesh) {
  const counts = new Map();
  for (const f of mesh.faces.values()) {
    const m = f.loop.length;
    for (let i = 0; i < m; i++) {
      const a = f.loop[i], b = f.loop[(i + 1) % m];
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  if (counts.size === 0) return false;
  for (const c of counts.values()) if (c !== 2) return false;
  return true;
}
