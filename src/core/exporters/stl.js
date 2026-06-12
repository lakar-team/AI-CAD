/**
 * stl.js — binary STL exporter (triangulated, flat normals).
 * STL is the universal 3D-printing / CAM interchange format.
 */

import { newellNormal, normalize } from '../math3.js';
import { triangulateLoop } from '../triangulate.js';

/**
 * @param {import('../model.js').CadModel} model
 * @returns {ArrayBuffer} binary STL
 */
export function exportSTL(model, name = 'lakar-model') {
  const tris = [];
  for (const wf of model.collectWorldFaces()) {
    if (wf.points.length < 3) continue;
    const n = normalize(newellNormal(wf.points));
    for (const [a, b, c] of triangulateLoop(wf.points)) {
      tris.push({ n, a: wf.points[a], b: wf.points[b], c: wf.points[c] });
    }
  }

  const buffer = new ArrayBuffer(84 + tris.length * 50);
  const view = new DataView(buffer);
  const header = `Lakar CAD ${name}`.slice(0, 80);
  for (let i = 0; i < header.length; i++) view.setUint8(i, header.charCodeAt(i));
  view.setUint32(80, tris.length, true);

  let off = 84;
  const writeVec = (v) => {
    view.setFloat32(off, v[0], true);
    view.setFloat32(off + 4, v[1], true);
    view.setFloat32(off + 8, v[2], true);
    off += 12;
  };
  for (const t of tris) {
    writeVec(t.n);
    writeVec(t.a);
    writeVec(t.b);
    writeVec(t.c);
    view.setUint16(off, 0, true); // attribute byte count
    off += 2;
  }
  return buffer;
}
