/**
 * glb.js — glTF 2.0 binary (.glb) exporter, hand-rolled with no dependencies.
 *
 * Produces a single scene/node/mesh. Triangles are grouped by face color into
 * one primitive per color, each with its own PBR material. Flat shading via
 * per-face vertex duplication. Y-up, meters — exactly glTF's conventions.
 */

import { newellNormal, normalize } from '../math3.js';
import { triangulateLoop } from '../triangulate.js';

/**
 * @param {import('../model.js').CadModel} model
 * @returns {ArrayBuffer} GLB container
 */
export function exportGLB(model, name = 'lakar-model') {
  // ── gather triangles grouped by color ────────────────────────────────────
  const groups = new Map(); // color -> { positions:[], normals:[], indices:[] }
  for (const wf of model.collectWorldFaces()) {
    if (wf.points.length < 3) continue;
    const color = wf.color || '#d9d9cc';
    if (!groups.has(color)) groups.set(color, { positions: [], normals: [], indices: [] });
    const g = groups.get(color);
    const n = normalize(newellNormal(wf.points));
    const base = g.positions.length / 3;
    for (const p of wf.points) {
      g.positions.push(p[0], p[1], p[2]);
      g.normals.push(n[0], n[1], n[2]);
    }
    for (const [a, b, c] of triangulateLoop(wf.points)) {
      g.indices.push(base + a, base + b, base + c);
    }
  }

  // ── build binary buffer + accessors ──────────────────────────────────────
  const binParts = [];
  let binLength = 0;
  const bufferViews = [];
  const accessors = [];
  const materials = [];
  const primitives = [];

  const pushView = (typedArray, target) => {
    const byteOffset = binLength;
    binParts.push(typedArray);
    binLength += typedArray.byteLength;
    const pad = (4 - (binLength % 4)) % 4;
    if (pad) {
      binParts.push(new Uint8Array(pad));
      binLength += pad;
    }
    bufferViews.push({ buffer: 0, byteOffset, byteLength: typedArray.byteLength, target });
    return bufferViews.length - 1;
  };

  for (const [color, g] of groups) {
    if (g.indices.length === 0) continue;
    const pos = new Float32Array(g.positions);
    const nor = new Float32Array(g.normals);
    const idx = new Uint32Array(g.indices);

    const posView = pushView(pos, 34962 /* ARRAY_BUFFER */);
    const norView = pushView(nor, 34962);
    const idxView = pushView(idx, 34963 /* ELEMENT_ARRAY_BUFFER */);

    const { min, max } = minMax(pos);
    accessors.push({ bufferView: posView, componentType: 5126, count: pos.length / 3, type: 'VEC3', min, max });
    const posAcc = accessors.length - 1;
    accessors.push({ bufferView: norView, componentType: 5126, count: nor.length / 3, type: 'VEC3' });
    const norAcc = accessors.length - 1;
    accessors.push({ bufferView: idxView, componentType: 5125, count: idx.length, type: 'SCALAR' });
    const idxAcc = accessors.length - 1;

    materials.push({
      name: `mat_${color.replace('#', '')}`,
      pbrMetallicRoughness: {
        baseColorFactor: [...hexToRgb(color), 1],
        metallicFactor: 0,
        roughnessFactor: 0.9,
      },
      doubleSided: true,
    });

    primitives.push({
      attributes: { POSITION: posAcc, NORMAL: norAcc },
      indices: idxAcc,
      material: materials.length - 1,
      mode: 4, // TRIANGLES
    });
  }

  const gltf = {
    asset: { version: '2.0', generator: 'Lakar CAD' },
    scene: 0,
    scenes: [{ name: name, nodes: primitives.length ? [0] : [] }],
    nodes: primitives.length ? [{ name: name, mesh: 0 }] : [],
    meshes: primitives.length ? [{ name: name, primitives }] : [],
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: binLength }],
  };
  if (!primitives.length) {
    delete gltf.meshes;
    delete gltf.materials;
    delete gltf.accessors;
    delete gltf.bufferViews;
    delete gltf.buffers;
    gltf.nodes = [];
  }

  // ── assemble GLB container ───────────────────────────────────────────────
  const jsonBytes = new TextEncoder().encode(JSON.stringify(gltf));
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  const jsonLen = jsonBytes.length + jsonPad;
  const binLen = binLength; // already 4-aligned by pushView
  const hasBin = binLen > 0;

  const total = 12 + 8 + jsonLen + (hasBin ? 8 + binLen : 0);
  const out = new ArrayBuffer(total);
  const view = new DataView(out);
  const bytes = new Uint8Array(out);

  view.setUint32(0, 0x46546c67, true); // 'glTF'
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);

  view.setUint32(12, jsonLen, true);
  view.setUint32(16, 0x4e4f534a, true); // 'JSON'
  bytes.set(jsonBytes, 20);
  for (let i = 0; i < jsonPad; i++) bytes[20 + jsonBytes.length + i] = 0x20; // pad with spaces

  if (hasBin) {
    let off = 20 + jsonLen;
    view.setUint32(off, binLen, true);
    view.setUint32(off + 4, 0x004e4942, true); // 'BIN'
    off += 8;
    for (const part of binParts) {
      bytes.set(new Uint8Array(part.buffer || part, part.byteOffset || 0, part.byteLength), off);
      off += part.byteLength;
    }
  }
  return out;
}

function minMax(positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], positions[i + k]);
      max[k] = Math.max(max[k], positions[i + k]);
    }
  }
  return { min, max };
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  // sRGB → linear (glTF expects linear baseColorFactor)
  const toLinear = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return [toLinear((n >> 16) & 255), toLinear((n >> 8) & 255), toLinear(n & 255)];
}
