import * as THREE from 'three';
import { MIXAMO_JOINTS } from './mixamoSpec.js';

let charIdSeq = 0;

export const BONE_ALIASES = {
  // Hips / root
  hips: 'mixamorigHips', hip: 'mixamorigHips', pelvis: 'mixamorigHips',
  root: 'mixamorigHips', cog: 'mixamorigHips',
  bip01pelvis: 'mixamorigHips', bip001pelvis: 'mixamorigHips',
  // Spine
  spine: 'mixamorigSpine', spine01: 'mixamorigSpine', spinebase: 'mixamorigSpine',
  spine1: 'mixamorigSpine1', spine02: 'mixamorigSpine1', spinemid: 'mixamorigSpine1',
  spine2: 'mixamorigSpine2', spine03: 'mixamorigSpine2',
  chest: 'mixamorigSpine2', upperchest: 'mixamorigSpine2',
  // Neck / Head
  neck: 'mixamorigNeck', neck1: 'mixamorigNeck', neck01: 'mixamorigNeck',
  head: 'mixamorigHead',
  // Left arm
  leftshoulder: 'mixamorigLeftShoulder', lshoulder: 'mixamorigLeftShoulder',
  shoulderl: 'mixamorigLeftShoulder', clavicle_l: 'mixamorigLeftShoulder',
  claviclel: 'mixamorigLeftShoulder',
  leftarm: 'mixamorigLeftArm', larm: 'mixamorigLeftArm',
  upperarml: 'mixamorigLeftArm', arml: 'mixamorigLeftArm', lupperarm: 'mixamorigLeftArm',
  leftforearm: 'mixamorigLeftForeArm', lforearm: 'mixamorigLeftForeArm',
  forearml: 'mixamorigLeftForeArm', lowerarml: 'mixamorigLeftForeArm', lforearm1: 'mixamorigLeftForeArm',
  lefthand: 'mixamorigLeftHand', lhand: 'mixamorigLeftHand',
  handl: 'mixamorigLeftHand', lhand1: 'mixamorigLeftHand',
  // Right arm
  rightshoulder: 'mixamorigRightShoulder', rshoulder: 'mixamorigRightShoulder',
  shoulderr: 'mixamorigRightShoulder', clavicle_r: 'mixamorigRightShoulder',
  clavicler: 'mixamorigRightShoulder',
  rightarm: 'mixamorigRightArm', rarm: 'mixamorigRightArm',
  upperarmr: 'mixamorigRightArm', armr: 'mixamorigRightArm', rupperarm: 'mixamorigRightArm',
  rightforearm: 'mixamorigRightForeArm', rforearm: 'mixamorigRightForeArm',
  forearmr: 'mixamorigRightForeArm', lowerarmr: 'mixamorigRightForeArm',
  righthand: 'mixamorigRightHand', rhand: 'mixamorigRightHand',
  handr: 'mixamorigRightHand',
  // Left leg
  leftupleg: 'mixamorigLeftUpLeg', lupleg: 'mixamorigLeftUpLeg',
  thighl: 'mixamorigLeftUpLeg', upperlegl: 'mixamorigLeftUpLeg', lthigh: 'mixamorigLeftUpLeg',
  leftleg: 'mixamorigLeftLeg', lleg: 'mixamorigLeftLeg',
  calfl: 'mixamorigLeftLeg', lowerlegl: 'mixamorigLeftLeg', shinl: 'mixamorigLeftLeg',
  leftfoot: 'mixamorigLeftFoot', lfoot: 'mixamorigLeftFoot',
  footl: 'mixamorigLeftFoot',
  lefttoebase: 'mixamorigLeftToeBase', ltoebase: 'mixamorigLeftToeBase', toel: 'mixamorigLeftToeBase',
  // Right leg
  rightupleg: 'mixamorigRightUpLeg', rupleg: 'mixamorigRightUpLeg',
  thighr: 'mixamorigRightUpLeg', upperlegr: 'mixamorigRightUpLeg', rthigh: 'mixamorigRightUpLeg',
  rightleg: 'mixamorigRightLeg', rleg: 'mixamorigRightLeg',
  calfr: 'mixamorigRightLeg', lowerlegr: 'mixamorigRightLeg', shinr: 'mixamorigRightLeg',
  rightfoot: 'mixamorigRightFoot', rfoot: 'mixamorigRightFoot',
  footr: 'mixamorigRightFoot',
  righttoebase: 'mixamorigRightToeBase', rtoebase: 'mixamorigRightToeBase', toer: 'mixamorigRightToeBase',
};

export function matchFingerBone(raw) {
  const n = raw.toLowerCase().replace(/[\s\-]/g, '');
  const sideRe = /^(left|l|right|r)/;
  const trailRe = /(left|l|right|r)$/;
  let side = null;
  if (/left|_l\b|\.l\b/i.test(raw)) side = 'Left';
  else if (/right|_r\b|\.r\b/i.test(raw)) side = 'Right';
  else {
    const sm = n.match(sideRe) || n.match(trailRe);
    if (sm) side = (sm[1] === 'left' || sm[1] === 'l') ? 'Left' : 'Right';
  }
  if (!side) return null;

  const fingerMap = { thumb: 'Thumb', index: 'Index', middle: 'Middle', ring: 'Ring', pinky: 'Pinky', little: 'Pinky' };
  let finger = null;
  for (const [k, v] of Object.entries(fingerMap)) {
    if (n.includes(k)) { finger = v; break; }
  }
  if (!finger) return null;

  const digitMatch = n.match(/(\d+)$/);
  const digit = digitMatch ? Math.min(3, Math.max(1, parseInt(digitMatch[1], 10))) : null;
  if (!digit) return null;

  return `mixamorig${side}Hand${finger}${digit}`;
}

export function autoDetectMapping(bones) {
  const result = {};
  const usedSource = new Set();
  const usedMixamo = new Set();

  const tryMap = (mixamoName, sourceName) => {
    if (usedMixamo.has(mixamoName) || usedSource.has(sourceName)) return false;
    result[mixamoName] = { sourceName, status: 'auto' };
    usedMixamo.add(mixamoName);
    usedSource.add(sourceName);
    return true;
  };

  // Pass 1: exact Mixamo name match
  for (const bone of bones) {
    if (MIXAMO_JOINTS.includes(bone.name)) tryMap(bone.name, bone.name);
  }

  // Pass 2: colon variant  mixamorig:Hips → mixamorigHips
  for (const bone of bones) {
    if (usedSource.has(bone.name)) continue;
    if (bone.name.startsWith('mixamorig:')) {
      const normalized = 'mixamorig' + bone.name.slice('mixamorig:'.length);
      if (MIXAMO_JOINTS.includes(normalized)) tryMap(normalized, bone.name);
    }
  }

  // Pass 3: alias table
  for (const bone of bones) {
    if (usedSource.has(bone.name)) continue;
    const key = bone.name.toLowerCase().replace(/[\s_\.\-]/g, '');
    const target = BONE_ALIASES[key];
    if (target) tryMap(target, bone.name);
  }

  // Pass 4: case-insensitive suffix match against Mixamo suffixes
  for (const bone of bones) {
    if (usedSource.has(bone.name)) continue;
    const lower = bone.name.toLowerCase().replace(/[\s_\.\-]/g, '');
    for (const joint of MIXAMO_JOINTS) {
      if (usedMixamo.has(joint)) continue;
      const suffix = joint.replace('mixamorig', '').toLowerCase();
      if (suffix.length >= 4 && lower.includes(suffix)) {
        tryMap(joint, bone.name);
        break;
      }
    }
  }

  // Pass 5: finger pattern detection
  for (const bone of bones) {
    if (usedSource.has(bone.name)) continue;
    const fingerTarget = matchFingerBone(bone.name);
    if (fingerTarget && !usedMixamo.has(fingerTarget)) tryMap(fingerTarget, bone.name);
  }

  // Fill remaining Mixamo joints as unmapped
  for (const joint of MIXAMO_JOINTS) {
    if (!result[joint]) result[joint] = { sourceName: null, status: 'unmapped' };
  }

  return result;
}

export function detectPoseType(bones, boneRig) {
  const leftArmEntry = Object.entries(boneRig).find(
    ([, v]) => v.role === 'driven' && v.jointFrom === 'shL' && v.jointTo === 'elL',
  );
  if (!leftArmEntry) return null;
  const leftArmBone = bones.find((b) => b.name === leftArmEntry[0]);
  if (!leftArmBone) return null;
  const leftForeEntry = Object.entries(boneRig).find(
    ([, v]) => v.role === 'driven' && v.jointFrom === 'elL' && v.jointTo === 'wrL',
  );
  const forearmBone = leftForeEntry ? bones.find((b) => b.name === leftForeEntry[0]) : null;
  const childObj = forearmBone?.object || leftArmBone.object.children.find((c) => c.isBone);
  if (!childObj) return null;
  const armWp = new THREE.Vector3();
  const foreWp = new THREE.Vector3();
  leftArmBone.object.getWorldPosition(armWp);
  (forearmBone ? forearmBone.object : childObj).getWorldPosition(foreWp);
  const dir = foreWp.sub(armWp).normalize();
  const absY = Math.abs(dir.y);
  if (absY < 0.15) return 'tpose';
  if (absY < 0.6) return 'apose';
  return 'other';
}

export function makeArmHorizontal(armBoneData, xSign) {
  const arm = armBoneData.object;
  const childBone = arm.children.find((c) => c.isBone);
  if (!childBone) return;

  const armWp = new THREE.Vector3();
  const foreWp = new THREE.Vector3();
  arm.getWorldPosition(armWp);
  childBone.getWorldPosition(foreWp);
  const currentDir = foreWp.clone().sub(armWp).normalize();
  const targetDir = new THREE.Vector3(xSign, 0, 0);

  const correction = new THREE.Quaternion().setFromUnitVectors(currentDir, targetDir);

  const worldQ = new THREE.Quaternion();
  arm.getWorldQuaternion(worldQ);
  worldQ.premultiply(correction);

  if (arm.parent) {
    const parentQ = new THREE.Quaternion();
    arm.parent.getWorldQuaternion(parentQ);
    worldQ.premultiply(parentQ.clone().invert());
  }
  arm.quaternion.copy(worldQ);
  arm.updateMatrixWorld(true);
}

export function distPointToRay(origin, dir, pt) {
  const ox = pt[0] - origin[0], oy = pt[1] - origin[1], oz = pt[2] - origin[2];
  const dot = ox * dir[0] + oy * dir[1] + oz * dir[2];
  const px = origin[0] + dir[0] * dot;
  const py = origin[1] + dir[1] * dot;
  const pz = origin[2] + dir[2] * dot;
  return Math.hypot(pt[0] - px, pt[1] - py, pt[2] - pz);
}

export function enrichBones(rawBones) {
  const tmp = new THREE.Vector3();
  return rawBones.map((b) => {
    b.object.getWorldPosition(tmp);
    const worldPos = [tmp.x, tmp.y, tmp.z];
    const parentBone = b.object.parent?.isBone ? b.object.parent : null;
    const parentName = parentBone?.name || null;
    let lengthM = 0.1;
    const childBone = b.object.children.find((c) => c.isBone);
    if (childBone) {
      childBone.getWorldPosition(tmp);
      lengthM = Math.hypot(tmp.x - worldPos[0], tmp.y - worldPos[1], tmp.z - worldPos[2]);
    }
    return { ...b, worldPos, parentName, lengthM };
  });
}

const MIXAMO_TO_MEDIAPIPE = {
  mixamorigHips:          { jointFrom: 'hipMid', jointTo: null },
  mixamorigSpine:         { jointFrom: 'hipMid', jointTo: null },
  mixamorigSpine1:        { jointFrom: 'hipMid', jointTo: 'shMid' },
  mixamorigSpine2:        { jointFrom: 'hipMid', jointTo: 'shMid' },
  mixamorigNeck:          { jointFrom: 'shMid',  jointTo: 'headC' },
  mixamorigHead:          { jointFrom: 'headC',  jointTo: null },
  mixamorigLeftShoulder:  { jointFrom: 'shMid',  jointTo: 'shL' },
  mixamorigLeftArm:       { jointFrom: 'shL',    jointTo: 'elL' },
  mixamorigLeftForeArm:   { jointFrom: 'elL',    jointTo: 'wrL' },
  mixamorigLeftHand:      { jointFrom: 'wrL',    jointTo: null },
  mixamorigRightShoulder: { jointFrom: 'shMid',  jointTo: 'shR' },
  mixamorigRightArm:      { jointFrom: 'shR',    jointTo: 'elR' },
  mixamorigRightForeArm:  { jointFrom: 'elR',    jointTo: 'wrR' },
  mixamorigRightHand:     { jointFrom: 'wrR',    jointTo: null },
  mixamorigLeftUpLeg:     { jointFrom: 'hipMid', jointTo: 'knL' },
  mixamorigLeftLeg:       { jointFrom: 'knL',    jointTo: 'anL' },
  mixamorigLeftFoot:      { jointFrom: 'anL',    jointTo: 'toeL' },
  mixamorigLeftToeBase:   { jointFrom: 'toeL',   jointTo: null },
  mixamorigRightUpLeg:    { jointFrom: 'hipMid', jointTo: 'knR' },
  mixamorigRightLeg:      { jointFrom: 'knR',    jointTo: 'anR' },
  mixamorigRightFoot:     { jointFrom: 'anR',    jointTo: 'toeR' },
  mixamorigRightToeBase:  { jointFrom: 'toeR',   jointTo: null },
};

export function flipJointSide(joint) {
  if (!joint) return joint;
  if (joint.endsWith('L')) return joint.slice(0, -1) + 'R';
  if (joint.endsWith('R')) return joint.slice(0, -1) + 'L';
  return joint;
}

// MediaPipe hand-landmark index pairs (0-20) for palm + finger segments.
// Keyed by the Mixamo joint name with the "mixamorig"/"Left"/"Right" prefix
// stripped, e.g. mixamorigLeftHandThumb1 -> HandThumb1.
const HAND_LM_PAIRS = {
  Hand: [0, 9],
  HandThumb1: [1, 2], HandThumb2: [2, 3], HandThumb3: [3, 4],
  HandIndex1: [5, 6], HandIndex2: [6, 7], HandIndex3: [7, 8],
  HandMiddle1: [9, 10], HandMiddle2: [10, 11], HandMiddle3: [11, 12],
  HandRing1: [13, 14], HandRing2: [14, 15], HandRing3: [15, 16],
  HandPinky1: [17, 18], HandPinky2: [18, 19], HandPinky3: [19, 20],
};

export function handLmFields(mixamoName) {
  const side = mixamoName.includes('Left') ? 'L' : mixamoName.includes('Right') ? 'R' : null;
  if (!side) return null;
  const base = mixamoName.replace('mixamorig', '').replace(/^(Left|Right)/, '');
  const lmPair = HAND_LM_PAIRS[base];
  if (!lmPair) return null;
  return { lmHand: side, lmPair };
}

export function computeRestDirLength(boneObj) {
  const childBone = boneObj.children.find((c) => c.isBone);
  if (!childBone) return { restDir: null, length: null };
  const boneWPos = new THREE.Vector3();
  const childWPos = new THREE.Vector3();
  boneObj.getWorldPosition(boneWPos);
  childBone.getWorldPosition(childWPos);
  const length = boneWPos.distanceTo(childWPos);
  if (length < 1e-6) return { restDir: null, length: 0 };
  const worldDir = childWPos.clone().sub(boneWPos).normalize();
  const worldQ = new THREE.Quaternion();
  boneObj.getWorldQuaternion(worldQ);
  const localDir = worldDir.applyQuaternion(worldQ.clone().invert());
  return { restDir: [localDir.x, localDir.y, localDir.z], length };
}

export function buildBoneRig(bones) {
  const detected = autoDetectMapping(bones);
  const sourceToMixamo = {};
  for (const [mixamoName, entry] of Object.entries(detected)) {
    if (entry.sourceName && entry.status !== 'unmapped') {
      sourceToMixamo[entry.sourceName] = mixamoName;
    }
  }
  const boneRig = {};
  for (const bone of bones) {
    const mixamoName = sourceToMixamo[bone.name];
    if (mixamoName) {
      const mp = MIXAMO_TO_MEDIAPIPE[mixamoName] || { jointFrom: null, jointTo: null };
      const { restDir, length } = computeRestDirLength(bone.object);
      const entry = { role: 'driven', jointFrom: mp.jointFrom, jointTo: mp.jointTo, restDir, length };
      const hand = handLmFields(mixamoName);
      if (hand) Object.assign(entry, hand);
      boneRig[bone.name] = entry;
    } else {
      boneRig[bone.name] = { role: 'locked' };
    }
  }
  return boneRig;
}

export function processGltf(gltf, name) {
  gltf.scene.updateMatrixWorld(true);
  const rawBones = [];
  const meshes = [];
  gltf.scene.traverse((obj) => {
    if (obj.isBone) rawBones.push({ id: obj.uuid, name: obj.name, object: obj });
    if (obj.isMesh) meshes.push({ id: obj.uuid, name: obj.name, object: obj });
  });
  return {
    id: `char_${charIdSeq++}`,
    name,
    scene: gltf.scene,
    animations: gltf.animations,
    bones: enrichBones(rawBones),
    meshes,
  };
}
