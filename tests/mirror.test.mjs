/**
 * Headless Node.js test of src/character/mirror.js (mirrorCharacterX).
 *
 * Imports the real module — must be run against the local-disk MIRROR copy
 * (after `.\build.ps1`) so the bare `import * as THREE from 'three'` inside
 * mirror.js can resolve (no node_modules on Google Drive):
 *
 *   node "$env:LOCALAPPDATA\AI CAD-build\tests\mirror.test.mjs"
 *
 * Builds a small synthetic rig (2 bones + a quad SkinnedMesh, all with
 * non-trivial world transforms so identity-matrix bugs can't hide) and
 * checks the mirror math directly against a synthetic geometric model, not
 * merely by re-running the function and eyeballing output.
 */

import * as THREE from 'three';
import { mirrorCharacterX } from '../src/character/mirror.js';

function fail(msg) {
  console.log(`✗ FAIL — ${msg}`);
  process.exitCode = 1;
}
function pass(msg) {
  console.log(`✓ PASS — ${msg}`);
}

// ── Build synthetic scene ────────────────────────────────────────────────────

const scene = new THREE.Scene();

const rootBone = new THREE.Bone();
rootBone.name = 'Root';
rootBone.position.set(0.5, 1.0, 0.1);
rootBone.quaternion.setFromEuler(new THREE.Euler(0.1, 0.2, 0.3));
scene.add(rootBone);

const childBone = new THREE.Bone();
childBone.name = 'Child';
childBone.position.set(0, 0.4, 0);
childBone.quaternion.setFromEuler(new THREE.Euler(-0.1, 0.05, 0));
rootBone.add(childBone);

// Quad, 2 triangles, indexed, CCW winding, normal +Z in local space.
const positions = new Float32Array([
  -0.1, -0.1, 0,
   0.1, -0.1, 0,
   0.1,  0.1, 0,
  -0.1,  0.1, 0,
]);
const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
const skinIndex = new Float32Array(16);
const skinWeight = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
const indices = [0, 1, 2, 0, 2, 3];

const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
geometry.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
geometry.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
geometry.setIndex(indices);

const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
mesh.position.set(0.2, 0, 0.3);
mesh.quaternion.setFromEuler(new THREE.Euler(0, 0.15, 0));
scene.add(mesh); // sibling of the armature — realistic (not parented under a bone)

scene.updateMatrixWorld(true);
const skeleton = new THREE.Skeleton([rootBone, childBone]);
mesh.bind(skeleton);
scene.updateMatrixWorld(true);

// ── Snapshot BEFORE ───────────────────────────────────────────────────────────

function vertexWorldPositions() {
  const mw = mesh.matrixWorld;
  const pts = [];
  for (let i = 0; i < 4; i++) {
    pts.push(new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, i).applyMatrix4(mw));
  }
  return pts;
}
function dist(a, b) { return a.distanceTo(b); }

const beforePts = vertexWorldPositions();
const beforeDists = [
  dist(beforePts[0], beforePts[1]),
  dist(beforePts[1], beforePts[2]),
  dist(beforePts[2], beforePts[3]),
  dist(beforePts[0], beforePts[2]),
];
const beforeIndex = [...geometry.index.array];
const beforeRootLocalPos = rootBone.position.clone();
const beforeRootLocalQuat = rootBone.quaternion.clone();
const beforeChildLocalPos = childBone.position.clone();
const beforeChildLocalQuat = childBone.quaternion.clone();
const beforeRootWorldPos = new THREE.Vector3(); rootBone.getWorldPosition(beforeRootWorldPos);
const beforeChildWorldPos = new THREE.Vector3(); childBone.getWorldPosition(beforeChildWorldPos);
const beforeNormal0 = new THREE.Vector3().fromBufferAttribute(geometry.attributes.normal, 0).clone();

// ── Mirror once ───────────────────────────────────────────────────────────────

mirrorCharacterX(scene);

// 1. Winding reversed
const afterIndex1 = [...geometry.index.array];
const expectedIndex1 = [0, 2, 1, 0, 3, 2];
if (JSON.stringify(afterIndex1) === JSON.stringify(expectedIndex1)) {
  pass(`winding reversed correctly: [${afterIndex1}]`);
} else {
  fail(`winding not reversed as expected — got [${afterIndex1}], expected [${expectedIndex1}]`);
}

// 2. Isometry: pairwise world-space distances preserved (mesh.matrixWorld is
//    unchanged since mesh isn't parented to a bone)
const afterPts = vertexWorldPositions();
const afterDists = [
  dist(afterPts[0], afterPts[1]),
  dist(afterPts[1], afterPts[2]),
  dist(afterPts[2], afterPts[3]),
  dist(afterPts[0], afterPts[2]),
];
let maxDistErr = 0;
for (let i = 0; i < beforeDists.length; i++) maxDistErr = Math.max(maxDistErr, Math.abs(beforeDists[i] - afterDists[i]));
console.log(`Pairwise distance max deviation: ${maxDistErr.toExponential(2)}`);
if (maxDistErr < 1e-6) pass('mirror is an isometry (pairwise distances preserved)');
else fail('pairwise distances changed — mirror is not a rigid reflection');

// 3. Not inside-out: mirrored+rewound triangle's geometric normal should
//    point the same general direction as the mirrored original normal.
const e1 = afterPts[2].clone().sub(afterPts[0]); // v2' - v0'  (post-winding-reversal order: 0,2,1)
const e2 = afterPts[1].clone().sub(afterPts[0]); // v1' - v0'
const geomNormalAfter = e1.cross(e2).normalize();
const expectedMirroredNormal = beforeNormal0.clone();
// normal was in local space; approximate world-space check via the mesh's
// (unchanged) rotation — mirror the world-space normal's X sign as a coarse
// consistency check against the buffer that mirrorCharacterX wrote.
const bufNormalAfter = new THREE.Vector3().fromBufferAttribute(geometry.attributes.normal, 0);
const dotBufVsGeom = (() => {
  // Transform buffer normal to world space via mesh's linear part (unchanged matrixWorld).
  const linear = new THREE.Matrix3().setFromMatrix4(mesh.matrixWorld);
  const worldBufNormal = bufNormalAfter.clone().applyMatrix3(linear).normalize();
  return worldBufNormal.dot(geomNormalAfter);
})();
console.log(`Winding-vs-normal consistency dot product: ${dotBufVsGeom.toFixed(4)} (want > 0.9, i.e. same-facing)`);
if (dotBufVsGeom > 0.9) pass('mesh is not inside-out after mirror (winding matches mirrored normal direction)');
else fail(`mesh appears inside-out — winding/normal mismatch (dot=${dotBufVsGeom.toFixed(4)})`);
void expectedMirroredNormal;

// 4. Bone world position X negated
const afterRootWorldPos = new THREE.Vector3(); rootBone.getWorldPosition(afterRootWorldPos);
const afterChildWorldPos = new THREE.Vector3(); childBone.getWorldPosition(afterChildWorldPos);
const rootXErr = Math.abs(afterRootWorldPos.x - (-beforeRootWorldPos.x));
const rootYZErr = Math.max(Math.abs(afterRootWorldPos.y - beforeRootWorldPos.y), Math.abs(afterRootWorldPos.z - beforeRootWorldPos.z));
const childXErr = Math.abs(afterChildWorldPos.x - (-beforeChildWorldPos.x));
const childYZErr = Math.max(Math.abs(afterChildWorldPos.y - beforeChildWorldPos.y), Math.abs(afterChildWorldPos.z - beforeChildWorldPos.z));
console.log(`Root world pos: before=[${beforeRootWorldPos.toArray().map(v=>v.toFixed(4))}] after=[${afterRootWorldPos.toArray().map(v=>v.toFixed(4))}]`);
console.log(`Child world pos: before=[${beforeChildWorldPos.toArray().map(v=>v.toFixed(4))}] after=[${afterChildWorldPos.toArray().map(v=>v.toFixed(4))}]`);
if (rootXErr < 1e-6 && rootYZErr < 1e-6 && childXErr < 1e-6 && childYZErr < 1e-6) {
  pass('bone world positions mirrored correctly (X negated, Y/Z unchanged)');
} else {
  fail(`bone world position mirror incorrect (rootXErr=${rootXErr.toExponential(2)}, childXErr=${childXErr.toExponential(2)})`);
}

// 5. Quaternion stays proper (unit length) after mirror
const qRoot = rootBone.quaternion;
const qLenErr = Math.abs(Math.hypot(qRoot.x, qRoot.y, qRoot.z, qRoot.w) - 1);
console.log(`Root quaternion unit-length error: ${qLenErr.toExponential(2)}`);
if (qLenErr < 1e-6) pass('mirrored bone quaternion is a proper unit rotation');
else fail('mirrored bone quaternion is not unit length — reflection leaked into rotation');

// ── Mirror again — should return to original (within tolerance) ─────────────

mirrorCharacterX(scene);

const afterIndex2 = [...geometry.index.array];
const afterRootLocalPos = rootBone.position.clone();
const afterRootLocalQuat = rootBone.quaternion.clone();
const afterChildLocalPos = childBone.position.clone();
const afterChildLocalQuat = childBone.quaternion.clone();
const afterPts2 = vertexWorldPositions();

let maxPosErr = 0;
for (let i = 0; i < 4; i++) maxPosErr = Math.max(maxPosErr, beforePts[i].distanceTo(afterPts2[i]));
const rootLocalPosErr = beforeRootLocalPos.distanceTo(afterRootLocalPos);
const childLocalPosErr = beforeChildLocalPos.distanceTo(afterChildLocalPos);
const rootQuatErr = Math.max(
  Math.abs(beforeRootLocalQuat.x - afterRootLocalQuat.x), Math.abs(beforeRootLocalQuat.y - afterRootLocalQuat.y),
  Math.abs(beforeRootLocalQuat.z - afterRootLocalQuat.z), Math.abs(beforeRootLocalQuat.w - afterRootLocalQuat.w),
);
const childQuatErr = Math.max(
  Math.abs(beforeChildLocalQuat.x - afterChildLocalQuat.x), Math.abs(beforeChildLocalQuat.y - afterChildLocalQuat.y),
  Math.abs(beforeChildLocalQuat.z - afterChildLocalQuat.z), Math.abs(beforeChildLocalQuat.w - afterChildLocalQuat.w),
);
const indexMatches = JSON.stringify(afterIndex2) === JSON.stringify(beforeIndex);

console.log(`\nDouble-mirror max vertex position deviation: ${maxPosErr.toExponential(2)}`);
console.log(`Double-mirror root local pos/quat deviation: ${rootLocalPosErr.toExponential(2)} / ${rootQuatErr.toExponential(2)}`);
console.log(`Double-mirror child local pos/quat deviation: ${childLocalPosErr.toExponential(2)} / ${childQuatErr.toExponential(2)}`);
console.log(`Double-mirror index array restored: ${indexMatches}`);

if (maxPosErr < 1e-5 && rootLocalPosErr < 1e-5 && childLocalPosErr < 1e-5 && rootQuatErr < 1e-5 && childQuatErr < 1e-5 && indexMatches) {
  pass('double-mirror returns to original within 1e-5');
} else {
  fail('double-mirror did not return to original within tolerance');
}

console.log(process.exitCode ? '\nSome checks FAILED.' : '\nAll checks passed.');
