/**
 * shapes.js — pure geometry helpers shared by the interactive tools (and any
 * future AI layer): axis-aligned rectangles and circles in arbitrary planes.
 */

import {
  add, sub, scale, dot, cross, normalize,
  planeBasis, X_AXIS, Y_AXIS, Z_AXIS,
} from './math3.js';

export const DEFAULT_CIRCLE_SEGMENTS = 24;

/**
 * Axis-aligned rectangle corners in the anchor's plane, from the anchor to an
 * opposite corner (projected into the plane). `anchor` = { point, planeNormal }.
 * Returns 4 world points or null when degenerate.
 */
export function rectCorners(anchor, oppositeWorld) {
  const n = normalize(anchor.planeNormal || Y_AXIS);
  // prefer world axes that lie in the plane (ground → X/Z)
  const u = pickPerp(n, [X_AXIS, Z_AXIS, Y_AXIS]);
  const v = normalize(cross(n, u));
  const dvec = sub(oppositeWorld, anchor.point);
  const du = dot(dvec, u);
  const dv = dot(dvec, v);
  if (Math.abs(du) < 1e-6 || Math.abs(dv) < 1e-6) return null;
  const a = anchor.point;
  const b = add(a, scale(u, du));
  const c = add(b, scale(v, dv));
  const d = add(a, scale(v, dv));
  return [a, b, c, d];
}

/** N-gon approximating a circle around the anchor point in its plane. */
export function circlePoints(anchor, radius, segments = DEFAULT_CIRCLE_SEGMENTS) {
  const n = normalize(anchor.planeNormal || Y_AXIS);
  const { u, v } = planeBasis(n);
  const pts = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push(add(anchor.point, add(scale(u, Math.cos(a) * radius), scale(v, Math.sin(a) * radius))));
  }
  return pts;
}

/** Unit vector perpendicular to n, picked from the candidate directions. */
export function pickPerp(n, candidates) {
  for (const c of candidates) {
    if (Math.abs(dot(n, c)) < 0.99) {
      return normalize(sub(c, scale(n, dot(c, n))));
    }
  }
  return [1, 0, 0];
}
