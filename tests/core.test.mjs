/**
 * Core engine tests — run with:  node --test tests/
 * Pure ESM, no dependencies, no build step needed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Mesh } from '../src/core/mesh.js';
import { pushPull, isClosedSolid } from '../src/core/pushpull.js';
import { CadModel } from '../src/core/model.js';
import { inferPoint } from '../src/core/inference.js';
import { triangulateLoop } from '../src/core/triangulate.js';
import { exportOBJ } from '../src/core/exporters/obj.js';
import { exportSTL } from '../src/core/exporters/stl.js';
import { exportGLB } from '../src/core/exporters/glb.js';
import { distance, normalize } from '../src/core/math3.js';

function drawSquare(mesh, size = 1, y = 0) {
  // wound so the face normal points +Y (up)
  const a = [0, y, 0], b = [0, y, size], c = [size, y, size], d = [size, y, 0];
  mesh.drawLine(a, b);
  mesh.drawLine(b, c);
  mesh.drawLine(c, d);
  return mesh.drawLine(d, a); // closing edge
}

// ── line → face ───────────────────────────────────────────────────────────────

test('closing a planar loop auto-creates exactly one face', () => {
  const m = new Mesh();
  const res = drawSquare(m);
  assert.equal(res.createdFaces.length, 1);
  assert.equal(m.faces.size, 1);
  assert.equal(m.vertices.size, 4);
  assert.equal(m.edges.size, 4);
  const f = m.faces.get(res.createdFaces[0]);
  assert.equal(f.loop.length, 4);
  assert.ok(Math.abs(Math.abs(f.normal[1]) - 1) < 1e-9, 'normal is vertical');
});

test('open polyline creates no face', () => {
  const m = new Mesh();
  m.drawLine([0, 0, 0], [1, 0, 0]);
  m.drawLine([1, 0, 0], [1, 0, 1]);
  assert.equal(m.faces.size, 0);
});

test('non-planar loop creates no face', () => {
  const m = new Mesh();
  m.drawLine([0, 0, 0], [1, 0, 0]);
  m.drawLine([1, 0, 0], [1, 1, 1]);
  m.drawLine([1, 1, 1], [0, 0.5, 1]);
  const res = m.drawLine([0, 0.5, 1], [0, 0, 0]);
  assert.equal(res.createdFaces.length, 0);
  assert.equal(m.faces.size, 0);
});

test('triangle drawn in a vertical plane creates a face', () => {
  const m = new Mesh();
  m.drawLine([0, 0, 0], [2, 0, 0]);
  m.drawLine([2, 0, 0], [1, 2, 0]);
  const res = m.drawLine([1, 2, 0], [0, 0, 0]);
  assert.equal(res.createdFaces.length, 1);
});

test('outer loop closes into one face, divider chord splits it in two', () => {
  const m = new Mesh();
  // 2x1 rectangle border with midpoint vertices on the long sides
  m.drawLine([0, 0, 0], [1, 0, 0]);
  m.drawLine([1, 0, 0], [2, 0, 0]);
  m.drawLine([2, 0, 0], [2, 0, 1]);
  m.drawLine([2, 0, 1], [1, 0, 1]);
  m.drawLine([1, 0, 1], [0, 0, 1]);
  assert.equal(m.faces.size, 0, 'still open');
  m.drawLine([0, 0, 1], [0, 0, 0]);
  assert.equal(m.faces.size, 1, 'closing the outline creates the face');
  const res = m.drawLine([1, 0, 0], [1, 0, 1]); // divider across the middle
  assert.ok(res.splitFace, 'divider is a chord → splits the face');
  assert.equal(m.faces.size, 2);
  for (const f of m.faces.values()) assert.equal(f.loop.length, 4);
});

test('vertex welding: drawing onto an existing point reuses it', () => {
  const m = new Mesh();
  m.drawLine([0, 0, 0], [1, 0, 0]);
  m.drawLine([1 + 1e-6, 0, 0], [2, 0, 0]); // endpoint within weld tolerance
  assert.equal(m.vertices.size, 3);
});

// ── face splitting ────────────────────────────────────────────────────────────

test('edge across a face splits it into two faces', () => {
  const m = new Mesh();
  drawSquare(m, 2);
  assert.equal(m.faces.size, 1);
  // split midpoints of two opposite edges first (draw across the middle)
  const e1 = m.edgeBetween(
    m.findVertexNear([0, 0, 0]).id, m.findVertexNear([2, 0, 0]).id,
  );
  const e2 = m.edgeBetween(
    m.findVertexNear([2, 0, 2]).id, m.findVertexNear([0, 0, 2]).id,
  );
  const va = m.splitEdge(e1, [1, 0, 0]);
  const vb = m.splitEdge(e2, [1, 0, 2]);
  assert.equal(m.faces.size, 1, 'face survives edge splits');
  assert.equal([...m.faces.values()][0].loop.length, 6, 'loop now has 6 vertices');

  const res = m.addEdge(va.id, vb.id);
  assert.ok(res.splitFace, 'chord split the face');
  assert.equal(m.faces.size, 2);
  for (const f of m.faces.values()) assert.equal(f.loop.length, 4);
});

// ── push/pull ─────────────────────────────────────────────────────────────────

test('push/pull a standalone square → closed box solid', () => {
  const m = new Mesh();
  const res = drawSquare(m, 1);
  const out = pushPull(m, res.createdFaces[0], 1);
  assert.ok(out.topFaceId);
  assert.equal(m.vertices.size, 8);
  assert.equal(m.edges.size, 12);
  assert.equal(m.faces.size, 6);
  assert.ok(isClosedSolid(m), 'box is a closed manifold');
});

test('push/pull with negative distance also yields a closed box', () => {
  const m = new Mesh();
  const res = drawSquare(m, 1);
  pushPull(m, res.createdFaces[0], -0.5);
  assert.equal(m.faces.size, 6);
  assert.ok(isClosedSolid(m));
});

test('pulling the top of a box grows it without leftover interior face', () => {
  const m = new Mesh();
  const res = drawSquare(m, 1);
  const box = pushPull(m, res.createdFaces[0], 1);
  const grown = pushPull(m, box.topFaceId, 0.5);
  assert.ok(grown.removedOriginal, 'embedded face removed');
  assert.ok(grown.topFaceId);
  assert.ok(isClosedSolid(m), 'grown box still a closed manifold');
  // highest vertices should be at y = 1.5
  const ys = [...m.vertices.values()].map((v) => v.p[1]);
  assert.equal(Math.max(...ys), 1.5);
});

test('push/pull respects concave faces', () => {
  const m = new Mesh();
  // L-shaped outline
  const pts = [
    [0, 0, 0], [2, 0, 0], [2, 0, 1], [1, 0, 1], [1, 0, 2], [0, 0, 2],
  ];
  let res;
  for (let i = 0; i < pts.length; i++) {
    res = m.drawLine(pts[i], pts[(i + 1) % pts.length]);
  }
  assert.equal(m.faces.size, 1, 'L-outline closes into one face');
  pushPull(m, res.createdFaces[0], 1);
  assert.equal(m.faces.size, 8);
  assert.ok(isClosedSolid(m));
});

// ── triangulation ─────────────────────────────────────────────────────────────

test('ear clipping triangulates concave polygons fully', () => {
  const pts = [
    [0, 0, 0], [2, 0, 0], [2, 0, 1], [1, 0, 1], [1, 0, 2], [0, 0, 2],
  ];
  const tris = triangulateLoop(pts);
  assert.equal(tris.length, pts.length - 2);
});

// ── model: groups & components ────────────────────────────────────────────────

function buildBoxModel() {
  const model = new CadModel();
  const mesh = model.activeMesh();
  const res = drawSquare(mesh, 1);
  pushPull(mesh, res.createdFaces[0], 1);
  return model;
}

test('make group moves geometry out of the root context', () => {
  const model = buildBoxModel();
  const allIds = [
    ...model.activeMesh().faces.keys(),
    ...model.activeMesh().edges.keys(),
  ];
  const inst = model.transact(() =>
    model.makeInstanceFromEntities(allIds, { name: 'Box' }),
  );
  assert.ok(inst);
  assert.ok(model.activeMesh().isEmpty(), 'root mesh now empty');
  assert.equal(model.root().children.length, 1);
  const def = model.definitions.get(inst.definitionId);
  assert.equal(def.mesh.faces.size, 6);
  assert.ok(isClosedSolid(def.mesh), 'geometry intact inside the group');
});

test('components share definitions; editing one updates all instances', () => {
  const model = buildBoxModel();
  const ids = [...model.activeMesh().faces.keys(), ...model.activeMesh().edges.keys()];
  const inst1 = model.makeInstanceFromEntities(ids, { name: 'Crate', isComponent: true });
  const inst2 = model.insertInstance(inst1.definitionId, [
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 0, 0, 1, // translated +5 X
  ]);
  assert.equal(inst2.definitionId, inst1.definitionId, 'definition shared');

  // edit inside instance 1's context: pull the top face up
  model.enterContext(inst1.id);
  const mesh = model.activeMesh();
  const topFace = [...mesh.faces.values()].find((f) => f.normal[1] > 0.9);
  pushPull(mesh, topFace.id, 1);
  model.exitContext();

  // both instances reflect the change because they share the definition
  const ys = model.collectWorldFaces()
    .filter((wf) => wf.instancePath[0] === inst2.id)
    .flatMap((wf) => wf.points.map((p) => p[1]));
  assert.equal(Math.max(...ys), 2, 'second instance grew too');
});

test('editing a group with copies makes it unique first', () => {
  const model = buildBoxModel();
  const ids = [...model.activeMesh().faces.keys(), ...model.activeMesh().edges.keys()];
  const g1 = model.makeInstanceFromEntities(ids, { name: 'G' });
  const g2 = model.insertInstance(g1.definitionId);
  assert.equal(g1.definitionId, g2.definitionId);
  model.enterContext(g1.id);
  model.exitContext();
  const found = model.findInstance(g1.id);
  assert.notEqual(found.instance.definitionId, g2.definitionId, 'group made unique on edit');
});

test('explode merges a group back into its parent context', () => {
  const model = buildBoxModel();
  const ids = [...model.activeMesh().faces.keys(), ...model.activeMesh().edges.keys()];
  const inst = model.makeInstanceFromEntities(ids, { name: 'Box' });
  model.explodeInstance(inst.id);
  assert.equal(model.root().children.length, 0);
  assert.equal(model.activeMesh().faces.size, 6);
  assert.ok(isClosedSolid(model.activeMesh()));
});

test('undo/redo round-trips a change', () => {
  const model = new CadModel();
  model.transact(() => model.activeMesh().drawLine([0, 0, 0], [1, 0, 0]));
  assert.equal(model.activeMesh().edges.size, 1);
  model.undo();
  assert.equal(model.activeMesh().edges.size, 0);
  model.redo();
  assert.equal(model.activeMesh().edges.size, 1);
});

test('model JSON save/load round-trip preserves everything', () => {
  const model = buildBoxModel();
  const ids = [...model.activeMesh().faces.keys()];
  model.makeInstanceFromEntities([ids[0]], { name: 'Panel', isComponent: true });
  const json = JSON.stringify(model.toJSON());
  const loaded = CadModel.fromJSON(JSON.parse(json));
  assert.equal(JSON.stringify(loaded.toJSON()), json, 'lossless round-trip');
});

// ── inference ─────────────────────────────────────────────────────────────────

test('inference snaps to endpoints, midpoints and faces', () => {
  const model = buildBoxModel();
  // ray straight down at the box corner (0,1,0) — top corner after pull
  const corner = inferPoint(model, { origin: [0.01, 5, 0.01], dir: [0, -1, 0] }, { radius: 0.1 });
  assert.equal(corner.type, 'endpoint');
  assert.ok(distance(corner.point, [0, 1, 0]) < 1e-6);

  const mid = inferPoint(model, { origin: [0.5, 5, 0.02], dir: [0, -1, 0] }, { radius: 0.1 });
  assert.equal(mid.type, 'midpoint');

  const face = inferPoint(model, { origin: [0.4, 5, 0.6], dir: [0, -1, 0] }, { radius: 0.05 });
  assert.equal(face.type, 'on-face');
  assert.ok(Math.abs(face.point[1] - 1) < 1e-6, 'hit the top face');

  const ground = inferPoint(model, { origin: [4, 5, 4], dir: [0, -1, 0] }, { radius: 0.05 });
  assert.equal(ground.type, 'ground');
});

test('axis lock constrains the point to the axis through the anchor', () => {
  const model = new CadModel();
  const inf = inferPoint(
    model,
    { origin: [3, 5, 2.5], dir: normalize([0, -1, 0]) },
    { radius: 0.1, axisLock: 'x', anchor: [0, 0, 0] },
  );
  assert.equal(inf.type, 'axis');
  assert.equal(inf.axis, 'x');
  assert.ok(Math.abs(inf.point[1]) < 1e-9 && Math.abs(inf.point[2]) < 1e-9);
  assert.ok(Math.abs(inf.point[0] - 3) < 1e-6);
});

// ── exporters ─────────────────────────────────────────────────────────────────

test('OBJ export contains welded vertices and all faces', () => {
  const model = buildBoxModel();
  const obj = exportOBJ(model, 'box');
  const vCount = (obj.match(/^v /gm) || []).length;
  const fCount = (obj.match(/^f /gm) || []).length;
  assert.equal(vCount, 8, 'box has 8 unique vertices');
  assert.equal(fCount, 6, 'box has 6 faces');
});

test('STL export is a valid binary STL with 12 triangles for a box', () => {
  const model = buildBoxModel();
  const stl = exportSTL(model);
  const view = new DataView(stl);
  const triCount = view.getUint32(80, true);
  assert.equal(triCount, 12);
  assert.equal(stl.byteLength, 84 + 12 * 50);
});

test('GLB export has a valid header and parseable JSON chunk', () => {
  const model = buildBoxModel();
  const glb = exportGLB(model);
  const view = new DataView(glb);
  assert.equal(view.getUint32(0, true), 0x46546c67, 'glTF magic');
  assert.equal(view.getUint32(4, true), 2, 'glTF version 2');
  assert.equal(view.getUint32(8, true), glb.byteLength, 'declared length matches');
  const jsonLen = view.getUint32(12, true);
  assert.equal(view.getUint32(16, true), 0x4e4f534a, 'JSON chunk tag');
  const jsonText = new TextDecoder().decode(new Uint8Array(glb, 20, jsonLen));
  const gltf = JSON.parse(jsonText);
  assert.equal(gltf.asset.version, '2.0');
  assert.equal(gltf.meshes[0].primitives.length, 1, 'one color → one primitive');
  assert.ok(gltf.accessors[0].min && gltf.accessors[0].max, 'position accessor has bounds');
  // binary chunk alignment
  assert.equal(jsonLen % 4, 0);
});

// ── AI introspection ──────────────────────────────────────────────────────────

test('describeForAI returns structured, actionable scene data', () => {
  const model = buildBoxModel();
  const ids = [...model.activeMesh().faces.keys(), ...model.activeMesh().edges.keys()];
  model.makeInstanceFromEntities(ids, { name: 'Crate', isComponent: true });
  const desc = model.describeForAI();
  assert.equal(desc.units, 'meters');
  const root = desc.definitions.find((d) => d.kind === 'root');
  assert.equal(root.instances.length, 1);
  assert.equal(root.instances[0].name, 'Crate');
  const crate = desc.definitions.find((d) => d.name === 'Crate');
  assert.equal(crate.counts.faces, 6);
  assert.equal(crate.faces.length, 6);
  // ids in the description are real, usable entity ids
  const def = model.definitions.get(root.instances[0].definitionId);
  assert.ok(def.mesh.faces.has(crate.faces[0].id));
});
