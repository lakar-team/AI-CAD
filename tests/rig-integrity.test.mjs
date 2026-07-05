/**
 * Headless Node.js test of the "no silently-broken driven bone" fix in
 * boneDetection.js: MIXAMO_TO_MEDIAPIPE joint pairs must all be valid
 * FKPositions keys (matching vtube's GlbBoneDriver.ts), buildBoneRig() must
 * auto-lock anything that ends up without a usable pair, and
 * detectFacingYawOffset() must correctly read facing from the shoulder line.
 *
 * Run against the local-disk MIRROR copy (after `.\build.ps1`) since
 * boneDetection.js imports `three` (no node_modules on Google Drive):
 *
 *   node "$env:LOCALAPPDATA\AI CAD-build\tests\rig-integrity.test.mjs"
 *
 * Exercises TWO differently-named skeletons (a Mixamo-style rig and a
 * Bip01-style rig routed through BONE_ALIASES) to check the fix generalizes
 * beyond one specific model, since only one real sample GLB (Soldier.glb)
 * is available in this repo to test against in the browser.
 */

import * as THREE from 'three';
import { buildBoneRig, detectFacingYawOffset } from '../src/character/boneDetection.js';

function fail(msg) { console.log(`✗ FAIL — ${msg}`); process.exitCode = 1; }
function pass(msg) { console.log(`✓ PASS — ${msg}`); }

function makeBone(name, parent, localPos) {
  const bone = new THREE.Bone();
  bone.name = name;
  bone.position.set(...(localPos || [0, 0.1, 0]));
  if (parent) parent.add(bone);
  return bone;
}

// ── Build a synthetic Soldier-like T-pose skeleton (Mixamo names) ───────────

function buildMixamoRig() {
  const hips = makeBone('mixamorigHips', null);
  const spine = makeBone('mixamorigSpine', hips, [0, 0.12, 0]);
  const spine1 = makeBone('mixamorigSpine1', spine, [0, 0.12, 0]);
  const spine2 = makeBone('mixamorigSpine2', spine1, [0, 0.12, 0]);
  const neck = makeBone('mixamorigNeck', spine2, [0, 0.05, 0]);
  const head = makeBone('mixamorigHead', neck, [0, 0.08, 0]);
  const lSh = makeBone('mixamorigLeftShoulder', spine2, [0.05, 0.1, 0]);
  const lArm = makeBone('mixamorigLeftArm', lSh, [0.1, 0, 0]);
  const lFore = makeBone('mixamorigLeftForeArm', lArm, [0.25, 0, 0]);
  const lHand = makeBone('mixamorigLeftHand', lFore, [0.25, 0, 0]);
  const rSh = makeBone('mixamorigRightShoulder', spine2, [-0.05, 0.1, 0]);
  const rArm = makeBone('mixamorigRightArm', rSh, [-0.1, 0, 0]);
  const rFore = makeBone('mixamorigRightForeArm', rArm, [-0.25, 0, 0]);
  const rHand = makeBone('mixamorigRightHand', rFore, [-0.25, 0, 0]);
  const lUpLeg = makeBone('mixamorigLeftUpLeg', hips, [0.1, -0.05, 0]);
  const lLeg = makeBone('mixamorigLeftLeg', lUpLeg, [0, -0.4, 0]);
  const lFoot = makeBone('mixamorigLeftFoot', lLeg, [0, -0.4, 0]);
  const lToe = makeBone('mixamorigLeftToeBase', lFoot, [0, 0, 0.15]);
  const rUpLeg = makeBone('mixamorigRightUpLeg', hips, [-0.1, -0.05, 0]);
  const rLeg = makeBone('mixamorigRightLeg', rUpLeg, [0, -0.4, 0]);
  const rFoot = makeBone('mixamorigRightFoot', rLeg, [0, -0.4, 0]);
  const rToe = makeBone('mixamorigRightToeBase', rFoot, [0, 0, 0.15]);

  const scene = new THREE.Scene();
  scene.add(hips);
  scene.updateMatrixWorld(true);

  const allObjs = [hips, spine, spine1, spine2, neck, head, lSh, lArm, lFore, lHand, rSh, rArm, rFore, rHand, lUpLeg, lLeg, lFoot, lToe, rUpLeg, rLeg, rFoot, rToe];
  const bones = allObjs.map((obj) => ({ id: obj.uuid, name: obj.name, object: obj }));
  return { scene, bones };
}

const { bones: mixamoBones } = buildMixamoRig();
const mixamoRig = buildBoneRig(mixamoBones);

console.log('\n--- Mixamo-named rig: buildBoneRig() results ---');
const expectations = [
  ['mixamorigHips', 'locked', null, null],
  ['mixamorigSpine', 'driven', 'hipMid', 'shMid'],
  ['mixamorigSpine1', 'driven', 'hipMid', 'shMid'],
  ['mixamorigSpine2', 'driven', 'hipMid', 'shMid'],
  ['mixamorigNeck', 'driven', 'shMid', 'headC'],
  ['mixamorigHead', 'locked', null, null],
  ['mixamorigLeftArm', 'driven', 'shL', 'elL'],
  ['mixamorigRightArm', 'driven', 'shR', 'elR'],
  ['mixamorigLeftToeBase', 'locked', null, null],
  ['mixamorigRightToeBase', 'locked', null, null],
];

let allOk = true;
for (const [name, role, jointFrom, jointTo] of expectations) {
  const e = mixamoRig[name];
  const ok = e?.role === role && (role === 'locked' || (e.jointFrom === jointFrom && e.jointTo === jointTo));
  console.log(`  ${name}: ${JSON.stringify(e)} ${ok ? 'OK' : 'MISMATCH (expected role=' + role + ' ' + jointFrom + '->' + jointTo + ')'}`);
  if (!ok) allOk = false;
}
if (allOk) pass('Mixamo rig: Hips/Head/ToeBase locked, Spine chain hipMid->shMid, Neck shMid->headC, arms unaffected');
else fail('Mixamo rig: one or more bones did not match expected role/joint pair');

// No entry anywhere in the compiled rig should be role:"driven" with an
// incomplete jointFrom/jointTo pair and no hand mapping (the original bug).
let anyBroken = false;
for (const [name, e] of Object.entries(mixamoRig)) {
  if (e.role === 'driven' && !e.lmPair && !(e.jointFrom && e.jointTo)) {
    console.log(`  BROKEN: ${name} is driven with no usable pair: ${JSON.stringify(e)}`);
    anyBroken = true;
  }
}
if (!anyBroken) pass('No bone ends up "driven" with an unusable joint pair');
else fail('Found bone(s) still driven with an unusable joint pair');

// ── Second rig: differently-named (Bip01-style), routed through BONE_ALIASES ─

function buildBipRig() {
  const hips = makeBone('Bip01 Pelvis', null);
  const spine = makeBone('Bip01 Spine', hips, [0, 0.12, 0]);
  const head = makeBone('Bip01 Head', spine, [0, 0.2, 0]);
  const lToe = makeBone('Bip01 L ToeBase', hips, [0.1, -0.9, 0.15]);
  const scene = new THREE.Scene();
  scene.add(hips);
  scene.updateMatrixWorld(true);
  const allObjs = [hips, spine, head, lToe];
  return allObjs.map((obj) => ({ id: obj.uuid, name: obj.name, object: obj }));
}

const bipBones = buildBipRig();
const bipRig = buildBoneRig(bipBones);
console.log('\n--- Bip01-named rig (aliased): buildBoneRig() results ---');
for (const b of bipBones) console.log(`  ${b.name}: ${JSON.stringify(bipRig[b.name])}`);

const bipHipsLocked = bipRig['Bip01 Pelvis']?.role === 'locked';
const bipSpineDriven = bipRig['Bip01 Spine']?.role === 'driven'
  && bipRig['Bip01 Spine']?.jointFrom === 'hipMid' && bipRig['Bip01 Spine']?.jointTo === 'shMid';
const bipToeLocked = bipRig['Bip01 L ToeBase']?.role === 'locked';
if (bipHipsLocked && bipSpineDriven && bipToeLocked) {
  pass('Aliased Bip01-style rig: same auto-lock/auto-drive behavior applies (not Mixamo-name-specific)');
} else {
  fail(`Aliased rig mismatch — Pelvis locked=${bipHipsLocked}, Spine driven=${bipSpineDriven}, ToeBase locked=${bipToeLocked}`);
}

// ── detectFacingYawOffset: synthetic shoulder-line facing detection ─────────

console.log('\n--- detectFacingYawOffset ---');

function testFacing(label, yDegRotation, expectedDeg) {
  const hips = makeBone('mixamorigHips', null);
  const spine2 = makeBone('mixamorigSpine2', hips, [0, 0.3, 0]);
  const lArm = makeBone('mixamorigLeftArm', spine2, [-0.2, 0, 0]);
  const rArm = makeBone('mixamorigRightArm', spine2, [0.2, 0, 0]);
  const scene = new THREE.Scene();
  scene.add(hips);
  scene.rotation.y = THREE.MathUtils.degToRad(yDegRotation);
  scene.updateMatrixWorld(true);

  const bones = [hips, spine2, lArm, rArm].map((obj) => ({ id: obj.uuid, name: obj.name, object: obj }));
  const rig = buildBoneRig(bones);
  const yawOffset = detectFacingYawOffset(bones, rig);
  const yawDeg = THREE.MathUtils.radToDeg(yawOffset);
  const err = Math.abs(((yawDeg - expectedDeg + 540) % 360) - 180);
  console.log(`  ${label}: rotation.y=${yDegRotation}°, detected yawOffset=${yawDeg.toFixed(2)}° (expected ~${expectedDeg}°)`);
  return err < 1;
}

const f0 = testFacing('facing +Z (correct, no rotation)', 0, 0);
const f90 = testFacing('rotated +90° off', 90, 90);
const f180 = testFacing('facing backward (-Z)', 180, 180);
const fm90 = testFacing('rotated -90° off', -90, -90);

if (f0 && f90 && f180 && fm90) {
  pass('detectFacingYawOffset correctly measures deviation from +Z at 0/±90/180°');
} else {
  fail(`detectFacingYawOffset mismatch — 0°:${f0} 90°:${f90} 180°:${f180} -90°:${fm90}`);
}

// Verify applying the correction actually brings the model to face +Z.
{
  const hips = makeBone('mixamorigHips', null);
  const spine2 = makeBone('mixamorigSpine2', hips, [0, 0.3, 0]);
  const lArm = makeBone('mixamorigLeftArm', spine2, [-0.2, 0, 0]);
  const rArm = makeBone('mixamorigRightArm', spine2, [0.2, 0, 0]);
  const scene = new THREE.Scene();
  scene.add(hips);
  scene.rotation.y = THREE.MathUtils.degToRad(65); // beyond the 45° threshold
  scene.updateMatrixWorld(true);
  const bones = [hips, spine2, lArm, rArm].map((obj) => ({ id: obj.uuid, name: obj.name, object: obj }));
  const rig = buildBoneRig(bones);
  const yawOffset = detectFacingYawOffset(bones, rig);

  scene.rotation.y -= yawOffset;
  scene.updateMatrixWorld(true);
  const bones2 = [hips, spine2, lArm, rArm].map((obj) => ({ id: obj.uuid, name: obj.name, object: obj }));
  const rig2 = buildBoneRig(bones2);
  const residual = detectFacingYawOffset(bones2, rig2);
  const residualDeg = Math.abs(THREE.MathUtils.radToDeg(residual));
  console.log(`  After applying correction for 65° deviation: residual = ${residualDeg.toFixed(4)}°`);
  if (residualDeg < 0.01) pass('Applying the detected correction brings the model to face +Z (residual < 0.01°)');
  else fail(`Residual after correction too large: ${residualDeg}°`);
}

console.log(process.exitCode ? '\nSome checks FAILED.' : '\nAll checks passed.');
