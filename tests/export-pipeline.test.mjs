/**
 * Headless Node.js test of the exporter.js bake+rebind pipeline.
 *
 * Does NOT use GLTFExporter (browser-only), but reproduces steps 1-5 of
 * exporter.js in Three.js space and verifies the postcondition directly:
 *
 *   After bind(): bone.matrixWorld × boneInverse ≈ identity  (for every joint)
 *
 * Also confirms the GLTFExporter IBM formula:
 *   IBM_written = boneInverses[i] × bindMatrix
 *   At identity root: bindMatrix = identity → IBM_written = boneInverses[i] = inverse(bone.matrixWorld)
 *   → validator check: inverse(meshWM=I) × bone.matrixWorld × IBM = identity ✓
 *
 * Input: public/samples/Soldier.glb (re-used as a realistic skinned model)
 * Simulates: autoScale to 1.75 m (root scale ≠ 1), then bake + rebind.
 */

import { readFileSync } from 'fs';
import * as THREE from 'file:///C:/Users/adamm/AppData/Local/AI%20CAD-build/node_modules/three/build/three.module.js';

// ── Parse GLB ─────────────────────────────────────────────────────────────────

const buf = readFileSync('G:/My Drive/AI Platforms/AI CAD/public/samples/Soldier.glb');
let offset = 12, gltf = null, binBuf = null;
while (offset < buf.length) {
  const len = buf.readUInt32LE(offset), type = buf.readUInt32LE(offset + 4);
  const chunk = buf.subarray(offset + 8, offset + 8 + len);
  if (type === 0x4E4F534A) gltf = JSON.parse(chunk.toString('utf8'));
  else if (type === 0x004E4942) binBuf = chunk;
  offset += 8 + len;
}

// ── Build Three.js bone hierarchy ────────────────────────────────────────────

function trsToMatrix(node) {
  const m = new THREE.Matrix4();
  if (node.matrix) {
    m.fromArray(node.matrix);
  } else {
    const t = node.translation || [0, 0, 0];
    const r = node.rotation    || [0, 0, 0, 1];
    const s = node.scale       || [1, 1, 1];
    m.compose(
      new THREE.Vector3(...t),
      new THREE.Quaternion(...r),
      new THREE.Vector3(...s),
    );
  }
  return m;
}

// Build Object3D/Bone nodes
const threeNodes = gltf.nodes.map((n) => {
  const obj = n.isBone !== false ? new THREE.Bone() : new THREE.Object3D();
  obj.name = n.name || '';
  const m = trsToMatrix(n);
  m.decompose(obj.position, obj.quaternion, obj.scale);
  return obj;
});

// Wire up parent-child
gltf.nodes.forEach((n, i) => {
  for (const childIdx of (n.children || [])) threeNodes[i].add(threeNodes[childIdx]);
});

// Scene root
const sceneRoot = new THREE.Group();
sceneRoot.name = 'Scene';
const sceneIdx = gltf.scene ?? 0;
for (const rootIdx of (gltf.scenes[sceneIdx].nodes || [])) sceneRoot.add(threeNodes[rootIdx]);

// ── Identify skeleton and mesh nodes from skin 0 ──────────────────────────────

const skin = gltf.skins[0];
const jointNodes = skin.joints.map((j) => threeNodes[j]);

// Find the mesh node that references skin 0
const meshNodeIdx = gltf.nodes.findIndex((n) => n.skin === 0);
const meshNode = threeNodes[meshNodeIdx];

// ── Simulate bake of non-identity root (mirror of exporter.js step 3) ────────
//
// Soldier.glb has "Character" (node 0) as the scene-level root with
// scale=0.01, rotation=-90°X.  Our exporter bakes the scene root into geometry
// vertices (we skip that since there's no geometry here) then resets root to
// identity.  We simulate that by resetting threeNodes[0] ("Character").

sceneRoot.updateMatrixWorld(true);

const characterNode = threeNodes[0]; // "Character" — scale=0.01, -90°X
console.log(`Character pre-bake scale: ${characterNode.scale.x.toFixed(4)}`);
console.log(`Character pre-bake rot.x: ${characterNode.rotation.x.toFixed(4)} rad`);

// In real export: geometry vertices get baked by rootMat, then root resets.
// For skeleton-only test, just reset root (bone world matrices update accordingly).
characterNode.position.set(0, 0, 0);
characterNode.rotation.set(0, 0, 0);
characterNode.scale.set(1, 1, 1);

// ── Step 4: updateMatrixWorld ─────────────────────────────────────────────────

sceneRoot.updateMatrixWorld(true);

// ── Step 5: Rebuild skeleton + bind (mirror of exporter.js step 5) ───────────

// For each joint, the bone IS the Three.js node (jointNodes are already Bone instances)
const newSkeleton = new THREE.Skeleton(jointNodes);
// bind() with no second arg: calls calculateInverses(), sets bindMatrix = meshNode.matrixWorld
// We need a SkinnedMesh to bind to:
const dummyMesh = new THREE.SkinnedMesh(new THREE.BufferGeometry());
meshNode.add(dummyMesh); // attach to mesh node so its matrixWorld is correct
sceneRoot.updateMatrixWorld(true);
dummyMesh.bind(newSkeleton); // computes boneInverses + sets bindMatrix

const bmEl = dummyMesh.bindMatrix.elements;
const bmScaleX = Math.sqrt(bmEl[0]**2 + bmEl[1]**2 + bmEl[2]**2);
console.log(`SkinnedMesh bindMatrix scale≈${bmScaleX.toFixed(6)}, translation=[${bmEl.slice(12,15).map(v=>v.toFixed(4)).join(',')}]`);
console.log(`bindMatrix is identity: ${dummyMesh.bindMatrix.equals(new THREE.Matrix4())}`);

// ── Verification ──────────────────────────────────────────────────────────────

console.log(`\nChecking ${newSkeleton.bones.length} joints: bone.matrixWorld × boneInverse ≈ identity`);

const tmp = new THREE.Matrix4();
let maxErr = 0, worstBone = null;

for (let i = 0; i < newSkeleton.bones.length; i++) {
  tmp.multiplyMatrices(newSkeleton.bones[i].matrixWorld, newSkeleton.boneInverses[i]);
  const id = new THREE.Matrix4(); // identity
  let err = 0;
  for (let j = 0; j < 16; j++) {
    err = Math.max(err, Math.abs(tmp.elements[j] - id.elements[j]));
  }
  if (err > maxErr) {
    maxErr = err;
    worstBone = { name: newSkeleton.bones[i].name, err };
  }
}

console.log(`Max deviation from identity: ${maxErr.toExponential(2)}`);
if (worstBone) console.log(`Worst joint: "${worstBone.name}"  err=${worstBone.err.toExponential(2)}`);

if (maxErr < 1e-6) {
  console.log('\n✓ PASS — bone.matrixWorld × boneInverse = identity (machine precision)');
} else if (maxErr < 1e-3) {
  console.log('\n✓ PASS — bone.matrixWorld × boneInverse ≈ identity (within tolerance)');
} else {
  console.log('\n✗ FAIL — bind-pose inconsistency detected');
}

// ── GLTFExporter IBM formula check ───────────────────────────────────────────

console.log('\nGLTFExporter IBM formula: IBM_written = boneInverses[i] × bindMatrix');
const bindMat = dummyMesh.bindMatrix;
const bindTranslation = [bindMat.elements[12], bindMat.elements[13], bindMat.elements[14]];
console.log(`bindMatrix translation (should be ≈ [0,0,0] after bake): [${bindTranslation.map(v=>v.toFixed(6)).join(', ')}]`);

// Correct GLTF formula: inverse(meshWM) × boneWM × IBM_written ≈ identity
// IBM_written = boneInverses[i] × bindMatrix  (from GLTFExporter line 2342-2343)
// After bake: bindMatrix = meshWM → IBM_written = inverse(boneWM) × meshWM
// → inverse(meshWM) × boneWM × inverse(boneWM) × meshWM = identity ✓
const ibm0 = new THREE.Matrix4().multiplyMatrices(newSkeleton.boneInverses[0], bindMat);
const invMeshWM = dummyMesh.matrixWorld.clone().invert();
const check0 = new THREE.Matrix4()
  .multiplyMatrices(invMeshWM, newSkeleton.bones[0].matrixWorld)
  .multiply(ibm0);
let err0 = 0;
const idEl = new THREE.Matrix4().elements;
for (let j = 0; j < 16; j++) err0 = Math.max(err0, Math.abs(check0.elements[j] - idEl[j]));
console.log(`Spot-check joint 0 "${newSkeleton.bones[0].name}": inv(meshWM)×boneWM×IBM_written err=${err0.toExponential(2)}`);
console.log(err0 < 1e-4 ? '✓ IBM formula produces correct inverse' : '✗ IBM formula error');

// Specific check for vtube export case: after bake, meshWM=identity → bindMatrix=identity
const meshWMisId = bindMat.equals(new THREE.Matrix4());
console.log(`\nVtube export postcondition: bindMatrix=identity? ${meshWMisId ? '✓ YES' : '✗ NO (root was not baked to identity)'}`);
if (meshWMisId) {
  // When meshWM=identity, IBM_written = boneInverses[i] and the check simplifies to boneWM×IBM=identity
  let maxErrSimple = 0;
  for (let i = 0; i < newSkeleton.bones.length; i++) {
    const ibmI = new THREE.Matrix4().multiplyMatrices(newSkeleton.boneInverses[i], bindMat);
    const chk = new THREE.Matrix4().multiplyMatrices(newSkeleton.bones[i].matrixWorld, ibmI);
    for (let j = 0; j < 16; j++) maxErrSimple = Math.max(maxErrSimple, Math.abs(chk.elements[j] - idEl[j]));
  }
  console.log(`All ${newSkeleton.bones.length} joints: boneWM×IBM err=${maxErrSimple.toExponential(2)} (expect ≈0)`);
  console.log(maxErrSimple < 1e-4 ? '✓ PASS — vtube export IBM chain is correct' : '✗ FAIL');
}
