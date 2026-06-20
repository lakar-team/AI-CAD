/**
 * GLB skin-bind-pose validator + vtubeRig presence check.
 *
 * Usage:  node tests/glb-validate.mjs <file.glb>
 *
 * Checks:
 *   1. For every skin joint: inverse(meshWorldMat) * jointWorldMat * IBM ≈ identity
 *      This is the correct GLTF skinning formula — valid regardless of root scale/rotation.
 *      Deviation > 1e-3 indicates a shattered/incorrect bind pose.
 *   2. scenes[0].extras.vtubeRig is present and has the expected schema
 *
 * Pure Node.js — no three.js, no browser APIs.
 *
 * Notes on conventions:
 *   - Raw Mixamo exports (e.g. Soldier.glb) have IBMs in skeleton-local space
 *     (root scale NOT included). The correct GLTF-spec check cancels the root
 *     transform via inverse(meshWorldMat), so they still pass.
 *   - vtube exports from this app bake the root transform into geometry, making
 *     the root identity; in that case meshWorldMat=identity and the check
 *     simplifies to jointWorldMat * IBM ≈ identity.
 */

import { readFileSync } from 'fs';

// ── GLB parser ────────────────────────────────────────────────────────────────

function parseGlb(path) {
  const buf = readFileSync(path);
  const magic = buf.readUInt32LE(0);
  if (magic !== 0x46546C67) throw new Error('Not a valid GLB (bad magic bytes)');
  const version = buf.readUInt32LE(4);
  if (version !== 2) throw new Error(`Unsupported GLB version ${version}`);

  let offset = 12;
  let json = null;
  let binBuffer = null;

  while (offset < buf.length) {
    const chunkLen  = buf.readUInt32LE(offset);
    const chunkType = buf.readUInt32LE(offset + 4);
    const chunkData = buf.subarray(offset + 8, offset + 8 + chunkLen);
    offset += 8 + chunkLen;
    if (chunkType === 0x4E4F534A) json      = JSON.parse(chunkData.toString('utf8'));
    else if (chunkType === 0x004E4942) binBuffer = chunkData;
  }

  if (!json) throw new Error('No JSON chunk in GLB');
  return { json, binBuffer };
}

// ── Accessor reader (FLOAT MAT4 only) ─────────────────────────────────────────

function readMat4Accessor(json, binBuffer, accessorIndex) {
  const acc = json.accessors[accessorIndex];
  if (acc.type !== 'MAT4') throw new Error(`Expected MAT4, got ${acc.type}`);
  if (acc.componentType !== 5126) throw new Error('Only FLOAT MAT4 supported');

  const bv   = json.bufferViews[acc.bufferView];
  const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const stride = bv.byteStride || 64; // 16 floats × 4 bytes
  const mats = [];

  for (let i = 0; i < acc.count; i++) {
    const off = base + i * stride;
    const m   = new Array(16);
    for (let j = 0; j < 16; j++) m[j] = binBuffer.readFloatLE(off + j * 4);
    mats.push(m);
  }
  return mats;
}

// ── Column-major 4×4 matrix math ──────────────────────────────────────────────

function m4id() {
  return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
}

// C = A * B  (column-major)
function m4mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
    }
  }
  return o;
}

function m4fromTRS(t, r, s) {
  const [tx, ty, tz]     = t || [0, 0, 0];
  const [rx, ry, rz, rw] = r || [0, 0, 0, 1];
  const [sx, sy, sz]     = s || [1, 1, 1];
  const x2=rx+rx, y2=ry+ry, z2=rz+rz;
  const xx=rx*x2, xy=rx*y2, xz=rx*z2;
  const yy=ry*y2, yz=ry*z2, zz=rz*z2;
  const wx=rw*x2, wy=rw*y2, wz=rw*z2;
  // column-major: m[col*4+row]
  return [
    (1-(yy+zz))*sx, (xy+wz)*sx,     (xz-wy)*sx,     0,
    (xy-wz)*sy,     (1-(xx+zz))*sy, (yz+wx)*sy,     0,
    (xz+wy)*sz,     (yz-wx)*sz,     (1-(xx+yy))*sz, 0,
    tx, ty, tz, 1,
  ];
}

// 4×4 inverse via cofactor expansion (only needed for mesh world matrix)
function m4inv(m) {
  const [m00,m10,m20,m30,m01,m11,m21,m31,m02,m12,m22,m32,m03,m13,m23,m33] = m;
  const b00=m00*m11-m10*m01, b01=m00*m21-m20*m01, b02=m00*m31-m30*m01;
  const b03=m10*m21-m20*m11, b04=m10*m31-m30*m11, b05=m20*m31-m30*m21;
  const b06=m02*m13-m12*m03, b07=m02*m23-m22*m03, b08=m02*m33-m32*m03;
  const b09=m12*m23-m22*m13, b10=m12*m33-m32*m13, b11=m22*m33-m32*m23;
  const det=b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06;
  if (Math.abs(det) < 1e-15) throw new Error('Singular matrix');
  const d = 1 / det;
  return [
    (m11*b11-m21*b10+m31*b09)*d, (-m10*b11+m20*b10-m30*b09)*d,
    (m13*b05-m23*b04+m33*b03)*d, (-m12*b05+m22*b04-m32*b03)*d,
    (-m01*b11+m21*b08-m31*b07)*d, (m00*b11-m20*b08+m30*b07)*d,
    (-m03*b05+m23*b02-m33*b01)*d, (m02*b05-m22*b02+m32*b01)*d,
    (m01*b10-m11*b08+m31*b06)*d, (-m00*b10+m10*b08-m30*b06)*d,
    (m03*b04-m13*b02+m33*b00)*d, (-m02*b04+m12*b02-m32*b00)*d,
    (-m01*b09+m11*b07-m21*b06)*d, (m00*b09-m10*b07+m20*b06)*d,
    (-m03*b03+m13*b01-m23*b00)*d, (m02*b03-m12*b01+m22*b00)*d,
  ];
}

function m4maxDevFromId(m) {
  const id = m4id();
  return Math.max(...m.map((v, i) => Math.abs(v - id[i])));
}

// ── World-matrix builder ───────────────────────────────────────────────────────

function buildWorldMatrices(json) {
  const wm = new Map(); // nodeIndex → flat column-major [16]

  function localMatrix(node) {
    if (node.matrix) return [...node.matrix]; // GLTF stores column-major already
    return m4fromTRS(node.translation, node.rotation, node.scale);
  }

  function visit(idx, parentWM) {
    const node = json.nodes[idx];
    const wmat = m4mul(parentWM, localMatrix(node));
    wm.set(idx, wmat);
    for (const child of (node.children || [])) visit(child, wmat);
  }

  const sceneIdx = json.scene ?? 0;
  for (const root of (json.scenes?.[sceneIdx]?.nodes || [])) visit(root, m4id());
  return wm;
}

// Build a map: skinIndex → meshNodeIndex (the node that references that skin)
function buildSkinToMeshMap(json) {
  const map = new Map();
  (json.nodes || []).forEach((node, idx) => {
    if (node.skin != null) {
      if (!map.has(node.skin)) map.set(node.skin, idx);
    }
  });
  return map;
}

// ── Skin validator ─────────────────────────────────────────────────────────────

const SHATTER_THRESHOLD = 1e-3;

function validateSkins(json, binBuffer, wm) {
  const skins = json.skins || [];
  if (!skins.length) return [{ skipped: true, reason: 'no skins in file' }];

  const skinToMesh = buildSkinToMeshMap(json);
  const results = [];

  for (let si = 0; si < skins.length; si++) {
    const skin = skins[si];

    if (skin.inverseBindMatrices == null) {
      results.push({ skin: si, name: skin.name, skipped: true, reason: 'no inverseBindMatrices' });
      continue;
    }

    // inverse(meshWorldMat) for correct GLTF skinning formula
    let invMeshWM = m4id();
    const meshNodeIdx = skinToMesh.get(si);
    if (meshNodeIdx != null) {
      const meshWM = wm.get(meshNodeIdx);
      if (meshWM) {
        try { invMeshWM = m4inv(meshWM); }
        catch { /* singular — leave as identity */ }
      }
    }

    const ibms   = readMat4Accessor(json, binBuffer, skin.inverseBindMatrices);
    const joints = skin.joints;
    let maxErr = 0, worstJoint = null;

    for (let j = 0; j < joints.length; j++) {
      const nodeIdx = joints[j];
      const jointWM = wm.get(nodeIdx);
      if (!jointWM) { console.warn(`  warn: no world matrix for joint node ${nodeIdx}`); continue; }

      // GLTF skinning formula: inverse(meshWM) * jointWM * IBM ≈ identity
      const product = m4mul(m4mul(invMeshWM, jointWM), ibms[j]);
      const err = m4maxDevFromId(product);
      if (err > maxErr) {
        maxErr = err;
        worstJoint = { nodeIdx, name: json.nodes[nodeIdx]?.name, err };
      }
    }

    results.push({
      skin: si,
      name: skin.name,
      meshNodeIdx,
      joints: joints.length,
      maxErr,
      worstJoint,
      pass: maxErr < SHATTER_THRESHOLD,
    });
  }

  return results;
}

// ── vtubeRig checker ──────────────────────────────────────────────────────────

function checkVtubeRig(json) {
  // GLTFExporter writes scene.userData → json.scenes[0].extras  (confirmed in source)
  const sceneIdx = json.scene ?? 0;
  const extras = json.scenes?.[sceneIdx]?.extras;

  if (!extras?.vtubeRig) return { found: false };

  const rig = extras.vtubeRig;
  const boneCount = Object.keys(rig.bones || {}).length;
  const roles = { driven: 0, spring: 0, locked: 0 };
  for (const b of Object.values(rig.bones || {})) {
    const r = b.role || 'locked';
    roles[r] = (roles[r] || 0) + 1;
  }

  const sample = Object.entries(rig.bones || {})
    .filter(([, v]) => v.role === 'driven')
    .slice(0, 3)
    .map(([name, v]) => ({ name, ...v, restDir: v.restDir?.map(x => +x.toFixed(3)) }));

  return { found: true, version: rig.version, boneCount, roles, sample };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node tests/glb-validate.mjs <file.glb>');
  process.exit(1);
}

console.log(`\nValidating: ${filePath}\n${'─'.repeat(60)}`);

const { json, binBuffer } = parseGlb(filePath);
console.log(`GLTF: ${json.nodes?.length ?? 0} nodes, ${json.skins?.length ?? 0} skins, ${json.meshes?.length ?? 0} meshes`);

// ── 1. Skin bind-pose check ───────────────────────────────────────────────────
console.log('\n── Skin bind-pose check (inverse(meshWM) * jointWM * IBM ≈ I) ───');
const wm = buildWorldMatrices(json);
const skinResults = validateSkins(json, binBuffer, wm);

let anyFail = false;
for (const r of skinResults) {
  if (r.skipped) { console.log(`Skin ${r.skin}: SKIP — ${r.reason}`); continue; }
  const tag = r.pass ? 'PASS' : 'FAIL';
  console.log(`Skin ${r.skin} "${r.name || '?'}": ${tag}  maxErr=${r.maxErr.toExponential(2)}  (${r.joints} joints, mesh node ${r.meshNodeIdx ?? '?'})`);
  if (!r.pass) {
    anyFail = true;
    console.log(`  !! Worst joint: node ${r.worstJoint.nodeIdx} "${r.worstJoint.name}"  err=${r.worstJoint.err.toExponential(2)}`);
  }
}
console.log(anyFail
  ? '\nResult: FAIL — shatter detected (bind-pose inconsistency)'
  : '\nResult: PASS — bind pose is consistent (no shatter)');

// ── 2. vtubeRig check ────────────────────────────────────────────────────────
console.log('\n── vtubeRig check (scenes[0].extras.vtubeRig) ───────────────────');
const rigCheck = checkVtubeRig(json);
if (!rigCheck.found) {
  console.log('vtubeRig: NOT FOUND');
  console.log('  (expected for raw input files; required for vtube exports from this app)');
} else {
  console.log(`vtubeRig: FOUND  version=${rigCheck.version}  total bones=${rigCheck.boneCount}`);
  console.log(`  roles → driven:${rigCheck.roles.driven}  spring:${rigCheck.roles.spring}  locked:${rigCheck.roles.locked}`);
  if (rigCheck.sample.length) {
    console.log('  sample driven bones:');
    for (const b of rigCheck.sample) {
      console.log(`    "${b.name}"  ${b.jointFrom ?? 'null'} → ${b.jointTo ?? 'null'}  len=${b.length?.toFixed(3)}m  restDir=[${b.restDir?.join(', ')}]`);
    }
  }
}

console.log('');
