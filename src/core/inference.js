/**
 * inference.js — SketchUp-style inference & snapping engine.
 *
 * Given a pick ray in world space, finds the best point to snap to, in
 * priority order:
 *
 *   1. axis lock (when the user locks to X/Y/Z with arrow keys)
 *   2. endpoint        — existing vertices
 *   3. midpoint        — middles of edges
 *   4. on-edge         — anywhere along an edge
 *   5. on-face         — a point on an existing face
 *   6. axis direction  — line from the anchor is nearly parallel to an axis
 *   7. ground plane    — y = 0
 *
 * Everything works on the model's world-space geometry (instances included),
 * so snapping works across groups/components.
 */

import {
  add, sub, scale, dot, normalize, distance,
  closestPointOnLine, raySegmentClosest, rayLineClosest, rayPlane,
  planeFromPoints, planeBasis, projectTo2D, pointInPolygon2D,
  midpoint, transformPoint, multiplyM4, identityM4,
  X_AXIS, Y_AXIS, Z_AXIS,
} from './math3.js';

export const AXES = { x: X_AXIS, y: Y_AXIS, z: Z_AXIS };

// SketchUp's axis colors: X = red, Y(up) = blue, Z(green). We are Y-up, with
// the ground spanned by X (red) and Z (green); the vertical Y axis is blue.
export const AXIS_COLORS = { x: '#d22', y: '#22d', z: '#2a2' };

const AXIS_ANGLE_COS = Math.cos((7 * Math.PI) / 180); // direction inference tolerance

/**
 * @param {import('./model.js').CadModel} model
 * @param {{origin:[number,number,number], dir:[number,number,number]}} ray (dir unit)
 * @param {object} opts
 *   radius      — world-space snap radius (caller scales by pixel size)
 *   axisLock    — 'x' | 'y' | 'z' | null
 *   anchor      — [x,y,z] start point of the current operation (or null)
 *   excludeFace — faceId to ignore for on-face hits (e.g. while push/pulling)
 * @returns {{point, type, axis, entityId, faceRef, planeNormal}}
 */
export function inferPoint(model, ray, opts = {}) {
  const { radius = 0.12, axisLock = null, anchor = null, excludeFace = null } = opts;
  const o = ray.origin;
  const d = normalize(ray.dir);

  // ── 1. axis lock ────────────────────────────────────────────────────────
  if (axisLock && anchor) {
    const axis = AXES[axisLock];
    const hit = rayLineClosest(o, d, anchor, axis);
    const t = hit ? hit.lineT : 0;
    let point = add(anchor, scale(axis, t));
    // still allow snapping the locked length to nearby endpoints
    const vtx = nearestVertexToRay(model, o, d, radius * 2);
    if (vtx) {
      const proj = closestPointOnLine(anchor, axis, vtx.point);
      if (distance(proj, point) < radius * 2) point = proj;
    }
    return result(point, 'axis', { axis: axisLock });
  }

  // ── 2. endpoints ────────────────────────────────────────────────────────
  const vtx = nearestVertexToRay(model, o, d, radius);
  if (vtx) return result(vtx.point, 'endpoint', { entityId: vtx.id, instancePath: vtx.path });

  // ── 3 & 4. midpoints / on-edge ──────────────────────────────────────────
  let bestMid = null;
  let bestEdge = null;
  for (const e of model.collectWorldEdges()) {
    const mid = midpoint(e.a, e.b);
    const cm = raySegmentClosest(o, d, mid, mid);
    if (cm.dist <= radius && (!bestMid || cm.dist < bestMid.dist)) {
      bestMid = { dist: cm.dist, point: mid, id: e.edgeId, path: e.instancePath };
    }
    const ce = raySegmentClosest(o, d, e.a, e.b);
    if (ce.dist <= radius && (!bestEdge || ce.dist < bestEdge.dist)) {
      bestEdge = { dist: ce.dist, point: ce.segPoint, id: e.edgeId, path: e.instancePath };
    }
  }
  if (bestMid) return result(bestMid.point, 'midpoint', { entityId: bestMid.id, instancePath: bestMid.path });
  if (bestEdge) return result(bestEdge.point, 'on-edge', { entityId: bestEdge.id, instancePath: bestEdge.path });

  // ── 5. on-face ──────────────────────────────────────────────────────────
  const faceHit = raycastFaces(model, o, d, excludeFace);
  let candidate = null;
  if (faceHit) {
    candidate = result(faceHit.point, 'on-face', {
      entityId: faceHit.faceId,
      instancePath: faceHit.instancePath,
      faceRef: { defId: faceHit.defId, faceId: faceHit.faceId, instancePath: faceHit.instancePath },
      planeNormal: faceHit.normal,
    });
  } else {
    // ── 7. ground plane ──────────────────────────────────────────────────
    const g = rayPlane(o, d, Y_AXIS, 0);
    if (g) candidate = result(g, 'ground', { planeNormal: [0, 1, 0] });
  }
  if (!candidate) {
    // looking at the sky: free point at a fixed distance
    candidate = result(add(o, scale(d, 10)), 'free', {});
  }

  // ── 6. axis-direction inference from anchor ────────────────────────────
  if (anchor && (candidate.type === 'ground' || candidate.type === 'free' || candidate.type === 'on-face')) {
    const dir = sub(candidate.point, anchor);
    const len = distance(candidate.point, anchor);
    if (len > 1e-6) {
      const u = scale(dir, 1 / len);
      for (const [name, axis] of Object.entries(AXES)) {
        if (Math.abs(dot(u, axis)) >= AXIS_ANGLE_COS) {
          const hit = rayLineClosest(o, d, anchor, axis);
          if (hit) {
            return result(add(anchor, scale(axis, hit.lineT)), 'axis', { axis: name });
          }
        }
      }
    }
  }

  return candidate;
}

/** Ray vs all world-space faces; nearest hit. */
export function raycastFaces(model, o, d, excludeFace = null) {
  let best = null;
  for (const wf of model.collectWorldFaces()) {
    if (excludeFace && wf.faceId === excludeFace) continue;
    if (wf.points.length < 3) continue;
    const plane = planeFromPoints(wf.points);
    if (!plane) continue;
    const hit = rayPlane(o, d, plane.normal, plane.d);
    if (!hit) continue;
    const t = dot(sub(hit, o), d);
    if (best && t >= best.t) continue;
    const { u, v } = planeBasis(plane.normal);
    const poly2 = wf.points.map((p) => projectTo2D(p, wf.points[0], u, v));
    const hit2 = projectTo2D(hit, wf.points[0], u, v);
    if (!pointInPolygon2D(hit2, poly2)) continue;
    best = {
      t, point: hit, normal: plane.normal,
      faceId: wf.faceId, defId: wf.defId, instancePath: wf.instancePath,
    };
  }
  return best;
}

function nearestVertexToRay(model, o, d, radius) {
  let best = null;
  const walk = (def, matrix, path) => {
    for (const v of def.mesh.vertices.values()) {
      const p = transformPoint(matrix, v.p);
      const t = Math.max(0, dot(sub(p, o), d));
      const dist = distance(add(o, scale(d, t)), p);
      if (dist > radius) continue;
      // prefer the candidate nearest the camera (smallest t); tie-break on dist
      if (!best || t < best.t - 1e-9 || (Math.abs(t - best.t) <= 1e-9 && dist < best.dist)) {
        best = { dist, t, point: p, id: v.id, path };
      }
    }
    for (const inst of def.children) {
      walk(model.definitions.get(inst.definitionId), multiplyM4(matrix, inst.transform), [...path, inst.id]);
    }
  };
  walk(model.root(), identityM4(), []);
  return best;
}

function result(point, type, extra = {}) {
  return {
    point,
    type,
    axis: extra.axis || null,
    entityId: extra.entityId || null,
    instancePath: extra.instancePath || [],
    faceRef: extra.faceRef || null,
    planeNormal: extra.planeNormal || null,
  };
}
