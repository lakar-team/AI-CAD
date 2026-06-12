/**
 * triangulate.js — ear-clipping triangulation of simple planar polygons.
 * Handles convex and concave faces. Returns triangles as index triples
 * into the input loop, wound the same way as the loop.
 */

import { planeFromPoints, planeBasis, projectTo2D, signedArea2D } from './math3.js';

/**
 * @param {Array<[number,number,number]>} points — polygon loop (3D, planar-ish)
 * @returns {Array<[number,number,number]>} triangles as loop-index triples
 */
export function triangulateLoop(points) {
  const n = points.length;
  if (n < 3) return [];
  if (n === 3) return [[0, 1, 2]];

  const plane = planeFromPoints(points);
  if (!plane) return [];
  const { u, v } = planeBasis(plane.normal);
  let pts2 = points.map((p) => projectTo2D(p, points[0], u, v));

  // ensure CCW for the ear test, remember if we flipped
  const flipped = signedArea2D(pts2) < 0;
  if (flipped) pts2 = pts2.map(([x, y]) => [x, -y]);

  const idx = Array.from({ length: n }, (_, i) => i);
  const tris = [];
  let guard = 0;

  while (idx.length > 3 && guard++ < 10000) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const i0 = idx[(i - 1 + idx.length) % idx.length];
      const i1 = idx[i];
      const i2 = idx[(i + 1) % idx.length];
      if (isEar(pts2, idx, i0, i1, i2)) {
        tris.push([i0, i1, i2]);
        idx.splice(i, 1);
        clipped = true;
        break;
      }
    }
    if (!clipped) {
      // degenerate input — fall back to a fan so we always render something
      for (let i = 1; i < idx.length - 1; i++) tris.push([idx[0], idx[i], idx[i + 1]]);
      idx.length = 0;
      break;
    }
  }
  if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);

  // restore original winding if we mirrored
  return flipped ? tris.map(([a, b, c]) => [c, b, a]) : tris;
}

function isEar(pts, idx, i0, i1, i2) {
  const a = pts[i0], b = pts[i1], c = pts[i2];
  // convex corner? (CCW polygon → positive cross)
  const cx = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  if (cx <= 1e-12) return false;
  // no other active vertex inside the candidate triangle
  for (const j of idx) {
    if (j === i0 || j === i1 || j === i2) continue;
    if (pointInTri(pts[j], a, b, c)) return false;
  }
  return true;
}

function pointInTri(p, a, b, c) {
  const s1 = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  const s2 = (c[0] - b[0]) * (p[1] - b[1]) - (c[1] - b[1]) * (p[0] - b[0]);
  const s3 = (a[0] - c[0]) * (p[1] - c[1]) - (a[1] - c[1]) * (p[0] - c[0]);
  return s1 >= -1e-12 && s2 >= -1e-12 && s3 >= -1e-12;
}
