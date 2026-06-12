/**
 * fileio.js — browser-side save / open / export plumbing.
 */

import { exportOBJ, exportSTL, exportGLB } from '../core/exporters/index.js';
import { CadModel } from '../core/model.js';

export function downloadBlob(data, filename, mime) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function saveModelJSON(model, name = 'model') {
  downloadBlob(JSON.stringify(model.toJSON(), null, 2), `${name}.lakar.json`, 'application/json');
}

export function exportModel(model, format, name = 'model') {
  switch (format) {
    case 'obj':
      downloadBlob(exportOBJ(model, name), `${name}.obj`, 'text/plain');
      break;
    case 'stl':
      downloadBlob(exportSTL(model, name), `${name}.stl`, 'application/octet-stream');
      break;
    case 'glb':
      downloadBlob(exportGLB(model, name), `${name}.glb`, 'model/gltf-binary');
      break;
    default:
      throw new Error(`Unknown export format: ${format}`);
  }
}

/** Prompt the user for a .lakar.json file and parse it into a CadModel. */
export function openModelJSON() {
  return new Promise((resolve, reject) => {
    const input = Object.assign(document.createElement('input'), {
      type: 'file',
      accept: '.json,application/json',
    });
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => {
        try {
          resolve(CadModel.fromJSON(JSON.parse(reader.result)));
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    };
    input.click();
  });
}
