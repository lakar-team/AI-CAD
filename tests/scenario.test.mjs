/**
 * Scenario tests — simulate the exact pipeline the UI runs for a typical
 * modeling session: camera rays → inference → tool helpers → mesh operations.
 * Everything except literal WebGL rendering.
 *
 * Run with: node --test tests/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CadModel } from '../src/core/model.js';
import { inferPoint } from '../src/core/inference.js';
import { rectCorners, circlePoints } from '../src/core/shapes.js';
import { pushPull, isClosedSolid } from '../src/core/pushpull.js';
import { sub, normalize, transformPoint, rayLineClosest } from '../src/core/math3.js';
import { exportOBJ } from '../src/core/exporters/obj.js';

/** Pretend camera: rays from a SketchUp-like home position toward a target. */
const CAMERA = [9, 7, 9];
const rayTo = (target) => ({ origin: CAMERA, dir: normalize(sub(target, CAMERA)) });
const SNAP = 0.08;

test('full session: rect tool → push/pull → group → move → export', () => {
  const model = new CadModel();
  const toLocal = (p) => transformPoint(model.activeMatrixInverse(), p);

  // ── rectangle tool: click near (0,0,0), then near (2,0,1.5) on the ground
  const inf1 = inferPoint(model, rayTo([0.02, 0, 0.03]), { radius: SNAP });
  assert.equal(inf1.type, 'ground');
  const anchor = { point: inf1.point, planeNormal: inf1.planeNormal };

  const inf2 = inferPoint(model, rayTo([2, 0, 1.5]), { radius: SNAP, anchor: anchor.point });
  const corners = rectCorners(anchor, inf2.point);
  assert.equal(corners.length, 4);

  model.transact(() => {
    const mesh = model.activeMesh();
    const vids = corners.map((p) => mesh.addVertex(toLocal(p)).id);
    for (let i = 0; i < 4; i++) mesh.addEdge(vids[i], vids[(i + 1) % 4]);
  });
  assert.equal(model.activeMesh().faces.size, 1, 'rectangle face auto-created');

  // ── push/pull: click the face, drag up along its normal (like the tool does)
  const face = [...model.activeMesh().faces.values()][0];
  const centroid = model.activeMesh().faceCentroid(face.id);
  const normalWorld = face.normal;
  // cursor moved to a point "above" — project that ray onto the normal axis
  const dragRay = rayTo([1, 1.8, 0.75]);
  const hit = rayLineClosest(dragRay.origin, dragRay.dir, centroid, normalWorld);
  assert.ok(hit, 'drag projects onto the extrusion axis');
  model.transact(() => pushPull(model.activeMesh(), face.id, hit.lineT));
  assert.equal(model.activeMesh().faces.size, 6, 'solid box');
  assert.ok(isClosedSolid(model.activeMesh()), 'closed manifold after drag extrude');

  // ── snap onto the new geometry: corner of the raised box
  const top = [...model.activeMesh().vertices.values()]
    .map((v) => v.p).filter((p) => Math.abs(p[1]) > 1e-6);
  assert.ok(top.length === 4, 'four raised vertices');
  const cornerSnap = inferPoint(model, rayTo(top[0]), { radius: SNAP });
  assert.equal(cornerSnap.type, 'endpoint', 'endpoint inference on extruded corner');

  // ── group it and move the instance (like the move tool on a selection)
  const ids = [
    ...model.activeMesh().faces.keys(),
    ...model.activeMesh().edges.keys(),
  ];
  const inst = model.transact(() => model.makeInstanceFromEntities(ids, { name: 'Box' }));
  model.transact(() => model.translateInstance(inst.id, [5, 0, 0]));

  const bounds = model.bounds();
  assert.ok(bounds.min[0] >= 4.9, 'box moved +5 on X');

  // ── snapping still works through the instance transform
  const moved = inferPoint(model, rayTo([5, 0, 0]), { radius: SNAP });
  assert.equal(moved.type, 'endpoint', 'inference reaches inside groups');

  // ── face inference on top of the moved box (e.g. drawing on a face)
  const topY = top[0][1]; // height of the raised cap
  const topFaceHit = inferPoint(model, rayTo([6, topY, 0.75]), { radius: 0.01 });
  assert.equal(topFaceHit.type, 'on-face', 'face inference through group');

  // ── export still works after all of it
  const obj = exportOBJ(model);
  assert.ok((obj.match(/^f /gm) || []).length >= 6);
});

test('circle helper produces a closed planar loop that becomes a face', () => {
  const model = new CadModel();
  const pts = circlePoints({ point: [0, 0, 0], planeNormal: [0, 1, 0] }, 1.5);
  model.transact(() => {
    const mesh = model.activeMesh();
    const vids = pts.map((p) => mesh.addVertex(p).id);
    for (let i = 0; i < vids.length; i++) mesh.addEdge(vids[i], vids[(i + 1) % vids.length]);
  });
  const mesh = model.activeMesh();
  assert.equal(mesh.faces.size, 1, 'circle face created');
  assert.equal([...mesh.faces.values()][0].loop.length, 24);
  // and it extrudes into a closed cylinder
  const f = [...mesh.faces.values()][0];
  model.transact(() => pushPull(mesh, f.id, f.normal[1] > 0 ? 2 : -2));
  assert.ok(isClosedSolid(mesh), 'cylinder is a closed manifold');
  assert.equal(mesh.faces.size, 26);
});

test('drawing a vertical face off an existing edge (3D line work)', () => {
  const model = new CadModel();
  const mesh = model.activeMesh();
  // ground square
  const pts = [[0, 0, 0], [0, 0, 2], [2, 0, 2], [2, 0, 0]];
  model.transact(() => {
    const vids = pts.map((p) => mesh.addVertex(p).id);
    for (let i = 0; i < 4; i++) mesh.addEdge(vids[i], vids[(i + 1) % 4]);
  });
  // draw a vertical triangle on one edge: (0,0,0) → (0,2,1) → (0,0,2)
  model.transact(() => {
    mesh.drawLine([0, 0, 0], [0, 2, 1]);
    mesh.drawLine([0, 2, 1], [0, 0, 2]);
  });
  assert.equal(mesh.faces.size, 2, 'vertical face closes against the shared ground edge');
});
