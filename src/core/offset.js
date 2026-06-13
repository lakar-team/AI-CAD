/**
 * Edge offset (inset/outset) for face loops.
 *
 * Given a face id and an offset distance (positive = inset, negative = outset),
 * creates a new loop of edges parallel to the face boundary inside the face
 * and connects them with "frame" edges to the boundary.
 */

import { add, sub, scale, normalize, cross, dot, distance } from './math3.js';

const EPS = 1e-8;

/**
 * Compute the 2D line-line intersection (lines are coplanar in 3D).
 * L1: p + t*d1,  L2: q + s*d2.
 * Returns the 3D intersection point or null if parallel.
 */
function lineLine3(p, d1, q, d2) {
  const n = cross(d1, d2);
  const nLen = Math.hypot(...n);
  if (nLen < EPS) return null;                   // parallel
  const nHat = scale(n, 1 / nLen);
  const t = dot(cross(sub(q, p), d2), nHat) / dot(n, nHat);
  return add(p, scale(d1, t));
}

/**
 * Offset the boundary loop of `faceId` by `dist` meters (>0 = inset).
 * Operates on the given Mesh directly (must be called inside transact).
 * Returns the new inner vertex ids in loop order, or null on failure.
 */
export function offsetFace(mesh, faceId, dist) {
  const face = mesh.faces.get(faceId);
  if (!face || face.loop.length < 3) return null;

  const N = face.normal;
  const pts = face.loop.map((vid) => mesh.vertices.get(vid).p);
  const n = pts.length;

  // Compute offset origin + direction for each edge
  const offsetEdges = pts.map((p, i) => {
    const q = pts[(i + 1) % n];
    const d = normalize(sub(q, p));
    const inward = normalize(cross(d, N));            // points into polygon
    const origin = add(p, scale(inward, dist));       // move edge inward
    return { origin, dir: d };
  });

  // Find corner points = intersections of adjacent offset edges
  const innerPts = offsetEdges.map((e, i) => {
    const prev = offsetEdges[(i + n - 1) % n];
    const pt = lineLine3(prev.origin, prev.dir, e.origin, e.dir);
    if (!pt) {
      // Parallel edges (rectangle corner): just slide along edge
      return add(e.origin, scale(e.dir, -dist));
    }
    return pt;
  });

  // Sanity check: if any inner point is farther than original from centroid
  // the offset is too large (collapsed)
  const centroid = pts.reduce((acc, p) => add(acc, scale(p, 1 / n)), [0, 0, 0]);
  for (const p of innerPts) {
    if (distance(p, centroid) > distance(pts[0], centroid) * 2) return null;
  }

  // Add inner vertices
  const innerVids = innerPts.map((p) => mesh.addVertex(p).id);

  // Add inner edges (the offset loop)
  for (let i = 0; i < n; i++) {
    mesh.addEdge(innerVids[i], innerVids[(i + 1) % n], { detectFaces: false });
  }

  // Add "frame" edges connecting outer loop to inner loop
  for (let i = 0; i < n; i++) {
    mesh.addEdge(face.loop[i], innerVids[i]);
  }

  return innerVids;
}
