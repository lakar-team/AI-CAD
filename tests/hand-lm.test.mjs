/**
 * Headless Node.js test of explicit lmHand/lmPair export for finger bones
 * (src/character/boneDetection.js: handLmFields, buildBoneRig, flipJointSide).
 *
 * Run against the local-disk MIRROR copy (after `.\build.ps1`) since
 * boneDetection.js imports `three` (no node_modules on Google Drive):
 *
 *   node "$env:LOCALAPPDATA\AI CAD-build\tests\hand-lm.test.mjs"
 */

import * as THREE from 'three';
import { buildBoneRig, handLmFields, flipJointSide } from '../src/character/boneDetection.js';

function fail(msg) { console.log(`✗ FAIL — ${msg}`); process.exitCode = 1; }
function pass(msg) { console.log(`✓ PASS — ${msg}`); }

// ── handLmFields: direct mapping checks ──────────────────────────────────────

const cases = [
  ['mixamorigLeftHand', { lmHand: 'L', lmPair: [0, 9] }],
  ['mixamorigRightHand', { lmHand: 'R', lmPair: [0, 9] }],
  ['mixamorigLeftHandThumb1', { lmHand: 'L', lmPair: [1, 2] }],
  ['mixamorigRightHandThumb3', { lmHand: 'R', lmPair: [3, 4] }],
  ['mixamorigLeftHandIndex2', { lmHand: 'L', lmPair: [6, 7] }],
  ['mixamorigRightHandMiddle3', { lmHand: 'R', lmPair: [11, 12] }],
  ['mixamorigLeftHandRing1', { lmHand: 'L', lmPair: [13, 14] }],
  ['mixamorigRightHandPinky2', { lmHand: 'R', lmPair: [18, 19] }],
  ['mixamorigHips', null], // non-hand bone: no fields
  ['mixamorigLeftArm', null], // arm, not hand
];

let allOk = true;
for (const [name, expected] of cases) {
  const got = handLmFields(name);
  const ok = expected === null
    ? got === null
    : got && got.lmHand === expected.lmHand && JSON.stringify(got.lmPair) === JSON.stringify(expected.lmPair);
  console.log(`${name}: expected=${JSON.stringify(expected)} got=${JSON.stringify(got)} ${ok ? 'OK' : 'MISMATCH'}`);
  if (!ok) allOk = false;
}
if (allOk) pass('handLmFields mapping matches spec for all sample joints');
else fail('handLmFields produced unexpected values for at least one joint');

// ── flipJointSide on lmHand values (single-char L/R) ─────────────────────────

if (flipJointSide('L') === 'R' && flipJointSide('R') === 'L') {
  pass('flipJointSide correctly flips bare L/R lmHand values');
} else {
  fail(`flipJointSide('L')=${flipJointSide('L')}, flipJointSide('R')=${flipJointSide('R')}`);
}

// ── buildBoneRig: finger bones get explicit non-empty lmHand/lmPair ──────────

function makeBone(name, parent) {
  const bone = new THREE.Bone();
  bone.name = name;
  bone.position.set(0, 0.1, 0);
  if (parent) parent.add(bone);
  return bone;
}

const hips = makeBone('mixamorigHips', null);
const leftHand = makeBone('mixamorigLeftHand', hips);
const leftThumb1 = makeBone('mixamorigLeftHandThumb1', leftHand);
const leftThumb2 = makeBone('mixamorigLeftHandThumb2', leftThumb1);
const rightHand = makeBone('mixamorigRightHand', hips);
const rightIndex1 = makeBone('mixamorigRightHandIndex1', rightHand);

const scene = new THREE.Scene();
scene.add(hips);
scene.updateMatrixWorld(true);

const bones = [hips, leftHand, leftThumb1, leftThumb2, rightHand, rightIndex1].map((obj) => ({
  id: obj.uuid, name: obj.name, object: obj,
}));

const rig = buildBoneRig(bones);

console.log('\nbuildBoneRig output for finger bones:');
for (const b of ['mixamorigLeftHand', 'mixamorigLeftHandThumb1', 'mixamorigLeftHandThumb2', 'mixamorigRightHandIndex1']) {
  console.log(`  ${b}: ${JSON.stringify(rig[b])}`);
}

const checks = [
  rig.mixamorigLeftHand?.lmHand === 'L' && JSON.stringify(rig.mixamorigLeftHand?.lmPair) === '[0,9]',
  rig.mixamorigLeftHandThumb1?.lmHand === 'L' && JSON.stringify(rig.mixamorigLeftHandThumb1?.lmPair) === '[1,2]',
  rig.mixamorigLeftHandThumb2?.lmHand === 'L' && JSON.stringify(rig.mixamorigLeftHandThumb2?.lmPair) === '[2,3]',
  rig.mixamorigRightHandIndex1?.lmHand === 'R' && JSON.stringify(rig.mixamorigRightHandIndex1?.lmPair) === '[5,6]',
];
if (checks.every(Boolean)) {
  pass('buildBoneRig emits explicit non-empty lmHand/lmPair for all finger bones');
} else {
  fail('buildBoneRig did not emit expected lmHand/lmPair for one or more finger bones');
}

// ── Simulated swapBoneSides: lmHand must flip alongside jointFrom/jointTo ────
// (mirrors the logic added to useCharacterEngine.js's swapBoneSides)

function simulateSwap(entry) {
  const next = { ...entry, jointFrom: flipJointSide(entry.jointFrom), jointTo: flipJointSide(entry.jointTo) };
  if ('lmHand' in entry) next.lmHand = flipJointSide(entry.lmHand);
  return next;
}

const swapped = simulateSwap(rig.mixamorigLeftHandThumb1);
console.log(`\nSimulated swap of mixamorigLeftHandThumb1: ${JSON.stringify(swapped)}`);
if (swapped.lmHand === 'R' && JSON.stringify(swapped.lmPair) === '[1,2]') {
  pass('swap flips lmHand (L->R) while leaving lmPair unchanged (landmark indices are hand-relative, not L/R-specific)');
} else {
  fail('swap did not flip lmHand correctly, or incorrectly altered lmPair');
}

console.log(process.exitCode ? '\nSome checks FAILED.' : '\nAll checks passed.');
