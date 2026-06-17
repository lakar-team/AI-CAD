import { useState, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

let charIdSeq = 0;

// ─── Constants ────────────────────────────────────────────────────────────────

export const MIXAMO_JOINTS = [
  'mixamorigHips',
  'mixamorigSpine', 'mixamorigSpine1', 'mixamorigSpine2',
  'mixamorigNeck', 'mixamorigHead',
  'mixamorigLeftShoulder', 'mixamorigRightShoulder',
  'mixamorigLeftArm', 'mixamorigRightArm',
  'mixamorigLeftForeArm', 'mixamorigRightForeArm',
  'mixamorigLeftHand', 'mixamorigRightHand',
  'mixamorigLeftHandThumb1', 'mixamorigLeftHandThumb2', 'mixamorigLeftHandThumb3',
  'mixamorigLeftHandIndex1', 'mixamorigLeftHandIndex2', 'mixamorigLeftHandIndex3',
  'mixamorigLeftHandMiddle1', 'mixamorigLeftHandMiddle2', 'mixamorigLeftHandMiddle3',
  'mixamorigLeftHandRing1', 'mixamorigLeftHandRing2', 'mixamorigLeftHandRing3',
  'mixamorigLeftHandPinky1', 'mixamorigLeftHandPinky2', 'mixamorigLeftHandPinky3',
  'mixamorigRightHandThumb1', 'mixamorigRightHandThumb2', 'mixamorigRightHandThumb3',
  'mixamorigRightHandIndex1', 'mixamorigRightHandIndex2', 'mixamorigRightHandIndex3',
  'mixamorigRightHandMiddle1', 'mixamorigRightHandMiddle2', 'mixamorigRightHandMiddle3',
  'mixamorigRightHandRing1', 'mixamorigRightHandRing2', 'mixamorigRightHandRing3',
  'mixamorigRightHandPinky1', 'mixamorigRightHandPinky2', 'mixamorigRightHandPinky3',
  'mixamorigLeftUpLeg', 'mixamorigRightUpLeg',
  'mixamorigLeftLeg', 'mixamorigRightLeg',
  'mixamorigLeftFoot', 'mixamorigRightFoot',
  'mixamorigLeftToeBase', 'mixamorigRightToeBase',
];

export const ARKIT_BLENDSHAPES = [
  'jawOpen', 'jawLeft', 'jawRight',
  'eyeBlinkLeft', 'eyeBlinkRight',
  'eyeLookUpLeft', 'eyeLookDownLeft', 'eyeLookInLeft', 'eyeLookOutLeft',
  'eyeLookUpRight', 'eyeLookDownRight', 'eyeLookInRight', 'eyeLookOutRight',
  'browDownLeft', 'browDownRight', 'browInnerUp', 'browOuterUpLeft', 'browOuterUpRight',
  'mouthSmileLeft', 'mouthSmileRight', 'mouthFrownLeft', 'mouthFrownRight',
  'cheekPuff', 'cheekSquintLeft', 'cheekSquintRight',
  'noseSneerLeft', 'noseSneerRight', 'tongueOut',
];

// ─── Bone alias table (normalized lowercase → Mixamo joint name) ───────────

const BONE_ALIASES = {
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

// Try to match finger bones via pattern detection
function matchFingerBone(raw) {
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

// ─── Auto bone detection ──────────────────────────────────────────────────────

function autoDetectMapping(bones) {
  const result = {}; // mixamoName → { sourceName, status }
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

// ─── Pose detection ───────────────────────────────────────────────────────────

function detectPoseType(bones, mapping) {
  const leftArmEntry = mapping['mixamorigLeftArm'];
  if (!leftArmEntry?.sourceName) return null;
  const leftArmBone = bones.find((b) => b.name === leftArmEntry.sourceName);
  if (!leftArmBone) return null;

  const forearmEntry = mapping['mixamorigLeftForeArm'];
  const forearmBone = forearmEntry?.sourceName
    ? bones.find((b) => b.name === forearmEntry.sourceName)
    : null;
  const childBone = forearmBone || (leftArmBone.object.children.find((c) => c.isBone)
    ? { object: leftArmBone.object.children.find((c) => c.isBone) }
    : null);
  if (!childBone) return null;

  const armWp = new THREE.Vector3();
  const foreWp = new THREE.Vector3();
  leftArmBone.object.getWorldPosition(armWp);
  childBone.object.getWorldPosition(foreWp);
  const dir = foreWp.sub(armWp).normalize();
  const absY = Math.abs(dir.y);

  if (absY < 0.15) return 'tpose';
  if (absY < 0.6) return 'apose';
  return 'other';
}

// ─── T-pose normalization helper ──────────────────────────────────────────────

function makeArmHorizontal(armBoneData, xSign) {
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

// ─── GLTF processing ─────────────────────────────────────────────────────────

function distPointToRay(origin, dir, pt) {
  const ox = pt[0] - origin[0], oy = pt[1] - origin[1], oz = pt[2] - origin[2];
  const dot = ox * dir[0] + oy * dir[1] + oz * dir[2];
  const px = origin[0] + dir[0] * dot;
  const py = origin[1] + dir[1] * dot;
  const pz = origin[2] + dir[2] * dot;
  return Math.hypot(pt[0] - px, pt[1] - py, pt[2] - pz);
}

function enrichBones(rawBones) {
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

function processGltf(gltf, name) {
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

// ─── Main hook ────────────────────────────────────────────────────────────────

export function useCharacterEngine() {
  const [characters, setCharacters] = useState([]);
  const [selectedCharId, setSelectedCharId] = useState(null);
  const [selectedBoneId, setSelectedBoneId] = useState(null);
  const [activeTool, setActiveTool] = useState('select');

  // Prep pipeline state
  const [charPrepTool, setCharPrepTool] = useState(null); // null | 'mapbones' | 'prep' | 'facesetup'
  const [boneMapping, setBoneMapping] = useState({}); // { mixamoName: { sourceName, status } }
  const [selectedMixamoJoint, setSelectedMixamoJoint] = useState(null);
  const [prepState, setPrepState] = useState({
    poseType: null, scaleFactor: 1, grounded: false, facingFixed: false,
  });
  const [faceSetup, setFaceSetup] = useState({
    mode: 'off', blendshapeMap: {}, faceMeshId: null,
  });
  const [isAiMappingBones, setIsAiMappingBones] = useState(false);

  // Auto-map when both sides selected in mapbones mode
  useEffect(() => {
    if (charPrepTool !== 'mapbones') return;
    if (!selectedBoneId || !selectedMixamoJoint) return;
    setCharacters((prev) => {
      const char = prev.find((c) => c.id === selectedCharId);
      const bone = char?.bones.find((b) => b.id === selectedBoneId);
      if (!bone) return prev;
      setBoneMapping((m) => ({
        ...m,
        [selectedMixamoJoint]: { sourceName: bone.name, status: 'auto' },
      }));
      setSelectedBoneId(null);
      setSelectedMixamoJoint(null);
      return prev;
    });
  }, [charPrepTool, selectedBoneId, selectedMixamoJoint, selectedCharId]);

  // ── Import / load ───────────────────────────────────────────────────────────

  const importGLB = useCallback(async (file) => {
    const url = URL.createObjectURL(file);
    const loader = new GLTFLoader();
    let gltf;
    try {
      gltf = await loader.loadAsync(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    const charData = processGltf(gltf, file.name);
    setCharacters([charData]);
    setSelectedCharId(charData.id);
    setSelectedBoneId(null);
    setSelectedMixamoJoint(null);
    const autoMap = autoDetectMapping(charData.bones);
    setBoneMapping(autoMap);
    const poseType = detectPoseType(charData.bones, autoMap);
    setPrepState({ poseType, scaleFactor: 1, grounded: false, facingFixed: false });
    setFaceSetup({ mode: 'off', blendshapeMap: {}, faceMeshId: null });
  }, []);

  const loadSampleModel = useCallback(async (url, name) => {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    const charData = processGltf(gltf, name);
    setCharacters((prev) => [...prev, charData]);
    setSelectedCharId(charData.id);
    setSelectedBoneId(null);
    const autoMap = autoDetectMapping(charData.bones);
    setBoneMapping(autoMap);
    const poseType = detectPoseType(charData.bones, autoMap);
    setPrepState({ poseType, scaleFactor: 1, grounded: false, facingFixed: false });
  }, []);

  const removeCharacter = useCallback((id) => {
    setCharacters((prev) => prev.filter((c) => c.id !== id));
    setSelectedCharId((prev) => (prev === id ? null : prev));
    setSelectedBoneId(null);
    setBoneMapping({});
  }, []);

  // ── Bone transform edit ─────────────────────────────────────────────────────

  const setBoneTransform = useCallback((boneId, { worldPos, rotation }) => {
    setCharacters((prev) => {
      const char = prev.find((c) => c.bones.some((b) => b.id === boneId));
      if (!char) return prev;
      const boneData = char.bones.find((b) => b.id === boneId);
      const obj = boneData.object;
      if (worldPos) {
        const wv = new THREE.Vector3(worldPos[0], worldPos[1], worldPos[2]);
        if (obj.parent) obj.parent.worldToLocal(wv);
        obj.position.copy(wv);
        obj.updateMatrixWorld(true);
      }
      if (rotation) {
        obj.rotation.set(rotation[0], rotation[1], rotation[2]);
        obj.updateMatrixWorld(true);
      }
      return [...prev];
    });
  }, []);

  // ── Viewport click ──────────────────────────────────────────────────────────

  const onCharacterClick = useCallback((ray, radius) => {
    let char = null;
    setCharacters((prev) => { char = prev.find((c) => c.id === selectedCharId) || null; return prev; });
    if (!char || !char.bones.length) return;
    const threshold = Math.max(radius * 6, 0.06);
    let closest = null, closestDist = threshold;
    const tmp = new THREE.Vector3();
    for (const bone of char.bones) {
      bone.object.getWorldPosition(tmp);
      const d = distPointToRay(ray.origin, ray.dir, [tmp.x, tmp.y, tmp.z]);
      if (d < closestDist) { closestDist = d; closest = bone; }
    }
    setSelectedBoneId(closest ? closest.id : null);
  }, [selectedCharId]);

  // ── Add child bone ──────────────────────────────────────────────────────────

  const addChildBone = useCallback(() => {
    setCharacters((prev) => {
      const char = prev.find((c) => c.id === selectedCharId);
      if (!char) return prev;
      const parent = char.bones.find((b) => b.id === selectedBoneId);
      if (!parent) return prev;
      const newBone = new THREE.Bone();
      newBone.name = `${parent.name || 'Bone'}.child`;
      newBone.position.set(0, parent.lengthM, 0);
      parent.object.add(newBone);
      parent.object.updateMatrixWorld(true);
      const tmp = new THREE.Vector3();
      newBone.getWorldPosition(tmp);
      const newBoneData = {
        id: newBone.uuid, name: newBone.name, object: newBone,
        worldPos: [tmp.x, tmp.y, tmp.z], parentName: parent.name, lengthM: 0.1,
      };
      const updatedChar = { ...char, bones: [...char.bones, newBoneData] };
      setSelectedBoneId(newBone.uuid);
      return prev.map((c) => (c.id === selectedCharId ? updatedChar : c));
    });
  }, [selectedCharId, selectedBoneId]);

  // ── Bone mapping ────────────────────────────────────────────────────────────

  const confirmBoneMapping = useCallback((mixamoName) => {
    setBoneMapping((m) => ({
      ...m,
      [mixamoName]: { ...m[mixamoName], status: 'confirmed' },
    }));
  }, []);

  const confirmAllMappings = useCallback(() => {
    setBoneMapping((m) => {
      const updated = {};
      for (const [k, v] of Object.entries(m)) {
        updated[k] = v.sourceName ? { ...v, status: 'confirmed' } : v;
      }
      return updated;
    });
  }, []);

  const clearBoneMappingEntry = useCallback((mixamoName) => {
    setBoneMapping((m) => ({ ...m, [mixamoName]: { sourceName: null, status: 'unmapped' } }));
  }, []);

  const setBoneMappingEntry = useCallback((mixamoName, sourceName) => {
    setBoneMapping((m) => ({ ...m, [mixamoName]: { sourceName, status: 'auto' } }));
  }, []);

  const aiMapBones = useCallback(async (aiConfig) => {
    const char = characters.find((c) => c.id === selectedCharId);
    if (!char) return;
    setIsAiMappingBones(true);
    try {
      const unmapped = MIXAMO_JOINTS.filter((j) => !boneMapping[j]?.sourceName);
      const usedSources = new Set(
        Object.values(boneMapping).filter((e) => e.sourceName).map((e) => e.sourceName),
      );
      const available = char.bones.map((b) => b.name).filter((n) => !usedSources.has(n));
      if (!unmapped.length || !available.length) return;
      const { callAIBoneMapping } = await import('../services/aiService.js');
      const result = await callAIBoneMapping(aiConfig, unmapped, available);
      setBoneMapping((m) => {
        const updated = { ...m };
        for (const [mixamoName, sourceName] of Object.entries(result)) {
          if (MIXAMO_JOINTS.includes(mixamoName) && sourceName && typeof sourceName === 'string') {
            if (!updated[mixamoName]?.sourceName) {
              updated[mixamoName] = { sourceName, status: 'auto' };
            }
          }
        }
        return updated;
      });
    } catch (err) {
      alert(`AI bone mapping failed: ${err.message}`);
    } finally {
      setIsAiMappingBones(false);
    }
  }, [characters, selectedCharId, boneMapping]);

  // ── Prep: scale / ground / facing / T-pose ──────────────────────────────────

  const autoScale = useCallback((targetHeightCm = 175) => {
    setCharacters((prev) => {
      const char = prev.find((c) => c.id === selectedCharId);
      if (!char) return prev;
      const box = new THREE.Box3().setFromObject(char.scene);
      const height = box.max.y - box.min.y;
      if (height < 1e-6) return prev;
      const scaleFactor = (targetHeightCm / 100) / height;
      char.scene.scale.setScalar(scaleFactor);
      char.scene.updateMatrixWorld(true);
      setPrepState((s) => ({ ...s, scaleFactor }));
      return [...prev];
    });
  }, [selectedCharId]);

  const groundModel = useCallback(() => {
    setCharacters((prev) => {
      const char = prev.find((c) => c.id === selectedCharId);
      if (!char) return prev;
      const box = new THREE.Box3().setFromObject(char.scene);
      char.scene.position.y += -box.min.y;
      char.scene.updateMatrixWorld(true);
      setPrepState((s) => ({ ...s, grounded: true }));
      return [...prev];
    });
  }, [selectedCharId]);

  const fixFacing = useCallback(() => {
    setCharacters((prev) => {
      const char = prev.find((c) => c.id === selectedCharId);
      if (!char) return prev;
      char.scene.rotation.y += Math.PI;
      char.scene.updateMatrixWorld(true);
      setPrepState((s) => ({ ...s, facingFixed: !s.facingFixed }));
      return [...prev];
    });
  }, [selectedCharId]);

  const normalizeTpose = useCallback(() => {
    setCharacters((prev) => {
      const char = prev.find((c) => c.id === selectedCharId);
      if (!char) return prev;

      const leftArmName = boneMapping['mixamorigLeftArm']?.sourceName;
      const rightArmName = boneMapping['mixamorigRightArm']?.sourceName;
      const leftArmData = leftArmName ? char.bones.find((b) => b.name === leftArmName) : null;
      const rightArmData = rightArmName ? char.bones.find((b) => b.name === rightArmName) : null;

      if (leftArmData) makeArmHorizontal(leftArmData, -1);
      if (rightArmData) makeArmHorizontal(rightArmData, 1);

      // Recalculate bind pose inverses so skinning remains correct
      char.scene.traverse((obj) => {
        if (obj.isSkinnedMesh && obj.skeleton) obj.skeleton.calculateInverses();
      });

      setPrepState((s) => ({ ...s, poseType: 'tpose' }));
      return [...prev];
    });
  }, [selectedCharId, boneMapping]);

  // ── Face setup ──────────────────────────────────────────────────────────────

  const setFaceMode = useCallback((mode) => {
    setFaceSetup((s) => ({ ...s, mode }));
  }, []);

  const setBlendshapeMap = useCallback((arkitName, sourceName) => {
    setFaceSetup((s) => ({
      ...s,
      blendshapeMap: { ...s.blendshapeMap, [arkitName]: sourceName },
    }));
  }, []);

  const setFaceMesh = useCallback((meshId) => {
    setFaceSetup((s) => ({ ...s, faceMeshId: meshId }));
  }, []);

  // Auto-detect face blendshapes from loaded morph targets
  const autoDetectBlendshapes = useCallback(() => {
    const char = characters.find((c) => c.id === selectedCharId);
    if (!char) return;
    const morphNames = new Set();
    char.meshes.forEach((m) => {
      const keys = m.object.morphTargetDictionary;
      if (keys) Object.keys(keys).forEach((k) => morphNames.add(k));
    });
    const detected = {};
    for (const arkit of ARKIT_BLENDSHAPES) {
      // Exact match first
      if (morphNames.has(arkit)) { detected[arkit] = arkit; continue; }
      // Case-insensitive
      const lower = arkit.toLowerCase();
      for (const mName of morphNames) {
        if (mName.toLowerCase() === lower) { detected[arkit] = mName; break; }
      }
    }
    setFaceSetup((s) => ({ ...s, blendshapeMap: { ...detected, ...s.blendshapeMap } }));
  }, [characters, selectedCharId]);

  // ── Export for vtube ────────────────────────────────────────────────────────

  const exportForVtube = useCallback(async () => {
    const char = characters.find((c) => c.id === selectedCharId);
    if (!char) return;
    try {
      const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');

      // Deep-clone scene so we don't mutate the live view
      const exportScene = char.scene.clone(true);
      exportScene.updateMatrixWorld(true);

      // Rename bones according to mapping
      exportScene.traverse((obj) => {
        if (!obj.isBone) return;
        for (const [mixamoName, entry] of Object.entries(boneMapping)) {
          if (entry.sourceName === obj.name && entry.status !== 'unmapped') {
            obj.name = mixamoName;
            break;
          }
        }
      });

      // Attach vtube metadata to root userData
      exportScene.userData = {
        ...exportScene.userData,
        vtubeFaceMode: faceSetup.mode,
        ...(faceSetup.mode === 'blendshapes' ? { vtubeFaceMap: faceSetup.blendshapeMap } : {}),
        ...(faceSetup.mode === 'mesh' && faceSetup.faceMeshId
          ? { vtubeFaceMeshId: faceSetup.faceMeshId }
          : {}),
      };

      const exporter = new GLTFExporter();
      exporter.parse(
        exportScene,
        (buffer) => {
          const blob = new Blob([buffer], { type: 'application/octet-stream' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${char.name.replace(/\.[^.]+$/, '')}_vtube.glb`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        },
        (err) => { alert(`Export failed: ${err?.message || String(err)}`); },
        { binary: true },
      );
    } catch (err) {
      alert(`Export failed: ${err.message}`);
    }
  }, [characters, selectedCharId, boneMapping, faceSetup]);

  // ── Derived ─────────────────────────────────────────────────────────────────

  const selectedChar = characters.find((c) => c.id === selectedCharId) || null;
  const selectedBone = selectedChar?.bones.find((b) => b.id === selectedBoneId) || null;

  // How many Mixamo joints are mapped (for display)
  const mappingStats = {
    total: MIXAMO_JOINTS.length,
    mapped: Object.values(boneMapping).filter((e) => e.sourceName).length,
    confirmed: Object.values(boneMapping).filter((e) => e.status === 'confirmed').length,
  };

  return {
    // Core
    characters,
    selectedCharId,
    selectedBoneId,
    activeTool,
    setActiveTool,
    importGLB,
    loadSampleModel,
    removeCharacter,
    setBoneTransform,
    onCharacterClick,
    addChildBone,
    selectCharacter: setSelectedCharId,
    selectBone: setSelectedBoneId,
    selectedChar,
    selectedBone,
    // Prep pipeline
    charPrepTool,
    setCharPrepTool,
    boneMapping,
    selectedMixamoJoint,
    setSelectedMixamoJoint,
    confirmBoneMapping,
    confirmAllMappings,
    clearBoneMappingEntry,
    setBoneMappingEntry,
    aiMapBones,
    isAiMappingBones,
    mappingStats,
    prepState,
    faceSetup,
    autoScale,
    groundModel,
    fixFacing,
    normalizeTpose,
    setFaceMode,
    setBlendshapeMap,
    setFaceMesh,
    autoDetectBlendshapes,
    exportForVtube,
  };
}
