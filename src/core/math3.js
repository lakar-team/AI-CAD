/**
 * math3.js — dependency-free 3D vector / plane math for the CAD core.
 *
 * Vectors are plain arrays [x, y, z] so the entire model state stays
 * JSON-serializable and introspectable (no class instances in the data).
 * All functions are pure.
 */

export const EPS = 1e-7;          // numeric noise threshold
export const WELD_TOL = 1e-4;     // vertices closer than this are the same point (0.1 mm)
export const PLANE_TOL = 1e-4;    // max distance from plane to count as coplanar

// ── basic ops ────────────────────────────────────────────────────────────────
export const vec = (x = 0, y = 0, z = 0) => [x, y, z];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const neg = (a) => [-a[0], -a[1], -a[2]];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const lengthSq = (a) => dot(a, a);
export const length = (a) => Math.sqrt(lengthSq(a));
export const distance = (a, b) => length(sub(a, b));
export const distanceSq = (a, b) => lengthSq(sub(a, b));
export const lerp = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
export const midpoint = (a, b) => lerp(a, b, 0.5);
export const clone = (a) => [a[0], a[1], a[2]];
export const min3 = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])];
export const max3 = (a, b) => [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])];
export const equals = (a, b, tol = WELD_TOL) => distanceSq(a, b) <= tol * tol;

export function normalize(a) {
  const l = length(a);
  return l < EPS ? [0, 0, 0] : [a[0] / l, a[1] / l, a[2] / l];
}

// ── lines / segments / rays ─────────────────────────────────────────────────

/** Closest point on infinite line (origin `o`, unit dir `d`) to point `p`. */
export function closestPointOnLine(o, d, p) {
  const t = dot(sub(p, o), d);
  return add(o, scale(d, t));
}

/** Closest point on segment [a,b] to point p. Returns { point, t }. */
export function closestPointOnSegment(a, b, p) {
  const ab = sub(b, a);
  const len2 = lengthSq(ab);
  if (len2 < EPS) return { point: clone(a), t: 0 };
  let t = dot(sub(p, a), ab) / len2;
  t = Math.max(0, Math.min(1, t));
  return { point: add(a, scale(ab, t)), t };
}

/**
 * Closest points between a ray (o, unit d) and a segment [a, b].
 * Returns { rayT, segT, rayPoint, segPoint, dist }.
 */
export function raySegmentClosest(o, d, a, b) {
  const u = d;
  const v = sub(b, a);
  const w0 = sub(o, a);
  const A = dot(u, u), B = dot(u, v), C = dot(v, v);
  const D = dot(u, w0), E = dot(v, w0);
  const denom = A * C - B * B;
  let tc = denom < EPS
    ? (C > EPS ? E / C : 0) // parallel
    : (A * E - B * D) / denom;
  tc = Math.max(0, Math.min(1, tc));
  // refine after clamping: closest ray point to the clamped segment point
  const segPoint = add(a, scale(v, tc));
  const sc = Math.max(0, dot(sub(segPoint, o), u));
  const rayPoint = add(o, scale(u, sc));
  const { point: segPoint2, t: tc2 } = closestPointOnSegment(a, b, rayPoint);
  return {
    rayT: sc,
    segT: tc2,
    rayPoint,
    segPoint: segPoint2,
    dist: distance(rayPoint, segPoint2),
  };
}

/** Closest point pair between ray (o,d) and infinite line (lo,ld). Returns { rayT, lineT } or null if parallel. */
export function rayLineClosest(o, d, lo, ld) {
  const A = dot(d, d), B = dot(d, ld), C = dot(ld, ld);
  const w0 = sub(o, lo);
  const D = dot(d, w0), E = dot(ld, w0);
  const denom = A * C - B * B;
  if (Math.abs(denom) < EPS) return null;
  return {
    rayT: (B * E - C * D) / denom,
    lineT: (A * E - B * D) / denom,
  };
}

/** Intersect ray with plane { normal, d } where plane is n·p = d. Returns point or null. */
export function rayPlane(o, dir, normal, d) {
  const denom = dot(dir, normal);
  if (Math.abs(denom) < EPS) return null;
  const t = (d - dot(o, normal)) / denom;
  if (t < 0) return null;
  return add(o, scale(dir, t));
}

// ── planes ───────────────────────────────────────────────────────────────────

/** Plane from normal + point: stored as { normal:[x,y,z] (unit), d } with n·p = d. */
export function planeFromNormalPoint(normal, point) {
  const n = normalize(normal);
  return { normal: n, d: dot(n, point) };
}

export const distToPlane = (plane, p) => dot(plane.normal, p) - plane.d;

/**
 * Newell's method polygon normal (works for concave / slightly non-planar loops).
 * `points` is an array of [x,y,z]. Returns a non-normalized normal whose length
 * is 2x the polygon area.
 */
export function newellNormal(points) {
  const n = [0, 0, 0];
  for (let i = 0; i < points.length; i++) {
    const c = points[i];
    const x = points[(i + 1) % points.length];
    n[0] += (c[1] - x[1]) * (c[2] + x[2]);
    n[1] += (c[2] - x[2]) * (c[0] + x[0]);
    n[2] += (c[0] - x[0]) * (c[1] + x[1]);
  }
  return n;
}

/** Best-fit plane of a polygon loop, or null if degenerate. */
export function planeFromPoints(points) {
  const n = newellNormal(points);
  if (length(n) < EPS) return null;
  const centroid = scale(points.reduce((s, p) => add(s, p), [0, 0, 0]), 1 / points.length);
  return planeFromNormalPoint(n, centroid);
}

/** True if all points lie within `tol` of the plane. */
export function pointsArePlanar(points, plane, tol = PLANE_TOL) {
  return points.every((p) => Math.abs(distToPlane(plane, p)) <= tol);
}

/** Orthonormal basis (u, v) spanning the plane with the given unit normal. */
export function planeBasis(normal) {
  const ref = Math.abs(normal[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = normalize(cross(normal, ref));
  const v = cross(normal, u); // already unit
  return { u, v };
}

/** Project 3D point to 2D coords [s, t] in the plane basis. */
export const projectTo2D = (p, origin, u, v) => [dot(sub(p, origin), u), dot(sub(p, origin), v)];

/** Signed area of a 2D polygon (positive = counter-clockwise). */
export function signedArea2D(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/** Point-in-polygon test (2D, winding-agnostic ray cast). */
export function pointInPolygon2D(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    if (((yi > pt[1]) !== (yj > pt[1])) &&
        (pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

// ── 4x4 matrices (column-major, same layout as three.js / glTF) ─────────────

export const identityM4 = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export const translationM4 = (t) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, t[0], t[1], t[2], 1];

export function multiplyM4(a, b) {
  const r = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let rw = 0; rw < 4; rw++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + rw] * b[c * 4 + k];
      r[c * 4 + rw] = s;
    }
  }
  return r;
}

export function transformPoint(m, p) {
  const x = p[0], y = p[1], z = p[2];
  const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
  return [
    (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
    (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
    (m[2] * x + m[6] * y + m[10] * z + m[14]) / w,
  ];
}

export function transformDirection(m, d) {
  return [
    m[0] * d[0] + m[4] * d[1] + m[8] * d[2],
    m[1] * d[0] + m[5] * d[1] + m[9] * d[2],
    m[2] * d[0] + m[6] * d[1] + m[10] * d[2],
  ];
}

/** General 4x4 inverse. Returns identity for singular matrices. */
export function invertM4(m) {
  // adapted from the classic gl-matrix implementation (MIT)
  const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
  const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
  const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
  const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];

  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;

  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (Math.abs(det) < EPS) return identityM4();
  det = 1.0 / det;

  return [
    (a11 * b11 - a12 * b10 + a13 * b09) * det,
    (a02 * b10 - a01 * b11 - a03 * b09) * det,
    (a31 * b05 - a32 * b04 + a33 * b03) * det,
    (a22 * b04 - a21 * b05 - a23 * b03) * det,
    (a12 * b08 - a10 * b11 - a13 * b07) * det,
    (a00 * b11 - a02 * b08 + a03 * b07) * det,
    (a32 * b02 - a30 * b05 - a33 * b01) * det,
    (a20 * b05 - a22 * b02 + a23 * b01) * det,
    (a10 * b10 - a11 * b08 + a13 * b06) * det,
    (a01 * b08 - a00 * b10 - a03 * b06) * det,
    (a30 * b04 - a31 * b02 + a33 * b00) * det,
    (a21 * b02 - a20 * b04 - a23 * b00) * det,
    (a11 * b07 - a10 * b09 - a12 * b06) * det,
    (a00 * b09 - a01 * b07 + a02 * b06) * det,
    (a31 * b01 - a30 * b03 - a32 * b00) * det,
    (a20 * b03 - a21 * b01 + a22 * b00) * det,
  ];
}

export const X_AXIS = [1, 0, 0];
export const Y_AXIS = [0, 1, 0];
export const Z_AXIS = [0, 0, 1];
