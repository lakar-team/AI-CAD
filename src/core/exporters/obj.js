/**
 * obj.js — Wavefront OBJ exporter. Y-up, meters, polygon faces preserved.
 * OBJ is read by practically everything (Blender, Maya, 3ds Max, FreeCAD...).
 */

import { newellNormal, normalize } from '../math3.js';

/**
 * @param {import('../model.js').CadModel} model
 * @returns {string} OBJ file contents
 */
export function exportOBJ(model, name = 'lakar-model') {
  const lines = [
    `# ${name} — exported by Lakar CAD`,
    '# units: meters, Y-up',
    `o ${sanitize(name)}`,
  ];

  const vertexIndex = new Map(); // "x y z" -> 1-based OBJ index
  const vLines = [];
  const nLines = [];
  const fLines = [];
  const normalIndex = new Map();

  const indexOfVertex = (p) => {
    const key = p.map((x) => fmt(x)).join(' ');
    if (!vertexIndex.has(key)) {
      vertexIndex.set(key, vertexIndex.size + 1);
      vLines.push(`v ${key}`);
    }
    return vertexIndex.get(key);
  };
  const indexOfNormal = (n) => {
    const key = n.map((x) => fmt(x)).join(' ');
    if (!normalIndex.has(key)) {
      normalIndex.set(key, normalIndex.size + 1);
      nLines.push(`vn ${key}`);
    }
    return normalIndex.get(key);
  };

  for (const wf of model.collectWorldFaces()) {
    if (wf.points.length < 3) continue;
    const n = normalize(newellNormal(wf.points));
    const ni = indexOfNormal(n);
    const refs = wf.points.map((p) => `${indexOfVertex(p)}//${ni}`);
    fLines.push(`f ${refs.join(' ')}`);
  }

  return [...lines, ...vLines, ...nLines, ...fLines, ''].join('\n');
}

const fmt = (x) => (Object.is(x, -0) ? 0 : Math.round(x * 1e6) / 1e6).toString();
const sanitize = (s) => s.replace(/[^\w.-]+/g, '_');
