import { useState, useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ARKIT_BLENDSHAPES } from '../character/mixamoSpec.js';
import {
  buildBoneRig, detectPoseType, makeArmHorizontal,
  processGltf, distPointToRay, computeRestDirLength, flipJointSide,
} from '../character/boneDetection.js';
import { exportForVtube as exportForVtubeUtil } from '../character/exporter.js';
import { mirrorCharacterX } from '../character/mirror.js';

export function useCharacterEngine() {
  const [characters, setCharacters] = useState([]);
  const [selectedCharId, setSelectedCharId] = useState(null);
  const [selectedBoneId, setSelectedBoneId] = useState(null);
  const [selectedBoneIds, setSelectedBoneIds] = useState(new Set());
  const [activeTool, setActiveTool] = useState('select');

  const [charPrepTool, setCharPrepTool] = useState(null);
  const [boneMapping, setBoneMapping] = useState({});
  const [prepState, setPrepState] = useState({
    poseType: null, scaleFactor: 1, grounded: false, facingFixed: false, mirrored: false,
  });
  const [faceSetup, setFaceSetup] = useState({
    mode: 'off', blendshapeMap: {}, faceMeshId: null,
  });

  // ── Setup wizard ──────────────────────────────────────────────────────────
  // step: 0 = hidden, 'welcome' = welcome card, 1-5 = guided steps
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardDismissed, setWizardDismissed] = useState(() => {
    try { return sessionStorage.getItem('aicad-wizard-dismissed') === '1'; } catch { return false; }
  });
  const [wizardChecklist, setWizardChecklist] = useState({
    bonesGreenOk: false, bonesGreyOk: false,
    lrChoice: null,
    prepTpose: false, prepScale: false, prepGround: false, prepFacing: false,
  });
  const wizardDismissedRef = useRef(wizardDismissed);
  useEffect(() => { wizardDismissedRef.current = wizardDismissed; }, [wizardDismissed]);

  const _clearBoneSelection = () => {
    setSelectedBoneId(null);
    setSelectedBoneIds(new Set());
  };

  const _wizardOnModelLoaded = () => {
    if (wizardDismissedRef.current) return;
    setWizardStep('welcome');
    setWizardChecklist({
      bonesGreenOk: false, bonesGreyOk: false,
      lrChoice: null,
      prepTpose: false, prepScale: false, prepGround: false, prepFacing: false,
    });
  };

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
    const box = new THREE.Box3().setFromObject(charData.scene);
    charData.baseHeight = Math.max(box.max.y - box.min.y, 0.01);
    setCharacters([charData]);
    setSelectedCharId(charData.id);
    _clearBoneSelection();
    const rig = buildBoneRig(charData.bones);
    setBoneMapping(rig);
    const poseType = detectPoseType(charData.bones, rig);
    setPrepState({ poseType, scaleFactor: 1, grounded: false, facingFixed: false, mirrored: false });
    setFaceSetup({ mode: 'off', blendshapeMap: {}, faceMeshId: null });
    _wizardOnModelLoaded();
  }, []);

  const loadSampleModel = useCallback(async (url, name) => {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    const charData = processGltf(gltf, name);
    const box = new THREE.Box3().setFromObject(charData.scene);
    charData.baseHeight = Math.max(box.max.y - box.min.y, 0.01);
    setCharacters([charData]);
    setSelectedCharId(charData.id);
    _clearBoneSelection();
    const rig = buildBoneRig(charData.bones);
    setBoneMapping(rig);
    const poseType = detectPoseType(charData.bones, rig);
    setPrepState({ poseType, scaleFactor: 1, grounded: false, facingFixed: false, mirrored: false });
    setFaceSetup({ mode: 'off', blendshapeMap: {}, faceMeshId: null });
    _wizardOnModelLoaded();
  }, []);

  const removeCharacter = useCallback((id) => {
    setCharacters((prev) => prev.filter((c) => c.id !== id));
    setSelectedCharId((prev) => (prev === id ? null : prev));
    _clearBoneSelection();
    setBoneMapping({});
  }, []);

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
    setSelectedBoneIds(closest ? new Set([closest.id]) : new Set());
  }, [selectedCharId]);

  const toggleBoneId = useCallback((boneId) => {
    setSelectedBoneIds((prev) => {
      const next = new Set(prev);
      if (next.has(boneId)) {
        next.delete(boneId);
        setSelectedBoneId(next.size > 0 ? [...next][next.size - 1] : null);
      } else {
        next.add(boneId);
        setSelectedBoneId(boneId);
      }
      return next;
    });
  }, []);

  const selectBoneRange = useCallback((fromId, toId) => {
    setCharacters((prev) => {
      const char = prev.find((c) => c.id === selectedCharId);
      if (!char) return prev;
      // Collect ancestors of a bone (inclusive)
      const ancestors = (boneId) => {
        const path = [];
        let cur = char.bones.find((b) => b.id === boneId);
        while (cur) {
          path.push(cur.id);
          cur = cur.parentName ? char.bones.find((b) => b.name === cur.parentName) : null;
        }
        return path;
      };
      const pathA = ancestors(fromId);
      const pathB = ancestors(toId);
      // Find common ancestor
      const setA = new Set(pathA);
      const common = pathB.find((id) => setA.has(id));
      if (!common) {
        // No common ancestor — just select both
        setSelectedBoneIds(new Set([fromId, toId]));
        return prev;
      }
      // Select fromId up to common, toId up to common (path between them)
      const sliceA = pathA.slice(0, pathA.indexOf(common) + 1);
      const sliceB = pathB.slice(0, pathB.indexOf(common));
      setSelectedBoneIds(new Set([...sliceA, ...sliceB]));
      setSelectedBoneId(toId);
      return prev;
    });
  }, [selectedCharId]);

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
      setSelectedBoneIds(new Set([newBone.uuid]));
      return prev.map((c) => (c.id === selectedCharId ? updatedChar : c));
    });
  }, [selectedCharId, selectedBoneId]);

  const setBoneRole = useCallback((boneName, role) => {
    setBoneMapping((m) => ({
      ...m,
      [boneName]: { ...(m[boneName] || {}), role },
    }));
  }, []);

  const setBoneRoleMulti = useCallback((boneNames, role) => {
    setBoneMapping((m) => {
      const updated = { ...m };
      for (const name of boneNames) {
        updated[name] = { ...(updated[name] || {}), role };
      }
      return updated;
    });
  }, []);

  const setBoneSpring = useCallback((boneName, params) => {
    setBoneMapping((m) => ({
      ...m,
      [boneName]: { ...(m[boneName] || { role: 'spring' }), ...params },
    }));
  }, []);

  const autoScale = useCallback((targetHeightCm = 175) => {
    setCharacters((prev) => {
      const char = prev.find((c) => c.id === selectedCharId);
      if (!char) return prev;
      const baseH = char.baseHeight || (() => {
        const box = new THREE.Box3().setFromObject(char.scene);
        return Math.max(box.max.y - box.min.y, 0.01);
      })();
      const scaleFactor = (targetHeightCm / 100) / baseH;
      char.scene.scale.setScalar(scaleFactor);
      char.scene.updateMatrixWorld(true);
      setPrepState((s) => ({ ...s, scaleFactor, grounded: false }));
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
      const leftArmEntry = Object.entries(boneMapping).find(
        ([, v]) => v.role === 'driven' && v.jointFrom === 'shL' && v.jointTo === 'elL',
      );
      const rightArmEntry = Object.entries(boneMapping).find(
        ([, v]) => v.role === 'driven' && v.jointFrom === 'shR' && v.jointTo === 'elR',
      );
      const leftArmData = leftArmEntry ? char.bones.find((b) => b.name === leftArmEntry[0]) : null;
      const rightArmData = rightArmEntry ? char.bones.find((b) => b.name === rightArmEntry[0]) : null;
      if (leftArmData) makeArmHorizontal(leftArmData, -1);
      if (rightArmData) makeArmHorizontal(rightArmData, 1);
      char.scene.traverse((obj) => {
        if (obj.isSkinnedMesh && obj.skeleton) obj.skeleton.calculateInverses();
      });
      setPrepState((s) => ({ ...s, poseType: 'tpose' }));
      return [...prev];
    });
  }, [selectedCharId, boneMapping]);

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
      if (morphNames.has(arkit)) { detected[arkit] = arkit; continue; }
      const lower = arkit.toLowerCase();
      for (const mName of morphNames) {
        if (mName.toLowerCase() === lower) { detected[arkit] = mName; break; }
      }
    }
    setFaceSetup((s) => ({ ...s, blendshapeMap: { ...detected, ...s.blendshapeMap } }));
  }, [characters, selectedCharId]);

  const swapBoneSides = useCallback((boneNames) => {
    const char = characters.find((c) => c.id === selectedCharId);
    if (!char) return;
    const boneByName = new Map(char.bones.map((b) => [b.name, b]));
    setBoneMapping((m) => {
      const targets = (boneNames && boneNames.length > 0)
        ? boneNames
        : Object.entries(m).filter(([, v]) => v.role === 'driven').map(([k]) => k);
      const updated = { ...m };
      for (const name of targets) {
        const entry = m[name];
        if (!entry || entry.role !== 'driven') continue;
        const boneData = boneByName.get(name);
        let { restDir, length } = entry;
        if (boneData?.object) {
          const rd = computeRestDirLength(boneData.object);
          if (rd.restDir !== null) restDir = rd.restDir;
          if (rd.length !== null) length = rd.length;
        }
        const next = {
          ...entry,
          jointFrom: flipJointSide(entry.jointFrom),
          jointTo: flipJointSide(entry.jointTo),
          restDir,
          length,
        };
        if ('side' in entry) next.side = flipJointSide(entry.side);
        if ('lmHand' in entry) next.lmHand = flipJointSide(entry.lmHand);
        updated[name] = next;
      }
      return updated;
    });
  }, [selectedCharId, characters]);

  const mirrorCharacter = useCallback(() => {
    const char = characters.find((c) => c.id === selectedCharId);
    if (!char) return;
    mirrorCharacterX(char.scene);
    swapBoneSides([]); // flips jointFrom/jointTo + lmHand, recomputes restDir/length from the mirrored bones
    setCharacters((prev) => [...prev]);
    setPrepState((s) => ({ ...s, mirrored: !s.mirrored }));
  }, [characters, selectedCharId, swapBoneSides]);

  const exportForVtube = useCallback(async () => {
    const char = characters.find((c) => c.id === selectedCharId);
    if (!char) return false;
    try {
      const buffer = await exportForVtubeUtil({ char, boneRig: boneMapping, faceSetup });
      const blob = new Blob([buffer], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${char.name.replace(/\.[^.]+$/, '')}_vtube.glb`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return true;
    } catch (err) {
      alert(`Export failed: ${err.message}`);
      return false;
    }
  }, [characters, selectedCharId, boneMapping, faceSetup]);

  // ── Setup wizard actions ──────────────────────────────────────────────────
  const wizardStartGuide = useCallback(() => setWizardStep(1), []);

  const wizardDismiss = useCallback(() => {
    setWizardStep(0);
    setWizardDismissed(true);
    try { sessionStorage.setItem('aicad-wizard-dismissed', '1'); } catch { /* ignore */ }
  }, []);

  const wizardReopen = useCallback(() => setWizardStep('welcome'), []);

  const wizardGoToStep = useCallback((n) => setWizardStep(n), []);

  const wizardSetLrChoice = useCallback((choice) => {
    setWizardChecklist((c) => ({ ...c, lrChoice: choice }));
  }, []);

  const wizardSetChecklist = useCallback((patch) => {
    setWizardChecklist((c) => ({ ...c, ...patch }));
  }, []);

  const wizardCheckPrep = useCallback((key) => {
    setWizardChecklist((c) => ({ ...c, [key]: true }));
  }, []);

  const wizardOnExportSuccess = useCallback(() => {
    setWizardStep((s) => (s === 4 ? 5 : s));
  }, []);

  // Auto-advance step 3 -> 4 once all four prep items are checked
  useEffect(() => {
    if (wizardStep !== 3) return;
    const { prepTpose, prepScale, prepGround, prepFacing } = wizardChecklist;
    if (prepTpose && prepScale && prepGround && prepFacing) setWizardStep(4);
  }, [wizardStep, wizardChecklist]);

  // Steps 3/4 need the normal-mode panels (prep tools, export) — the bone-rig
  // editor (charPrepTool === 'mapbones') hides those, so back out of it.
  useEffect(() => {
    if ((wizardStep === 3 || wizardStep === 4) && charPrepTool === 'mapbones') {
      setCharPrepTool(null);
    }
  }, [wizardStep]); // eslint-disable-line react-hooks/exhaustive-deps

  // If the model is already T-posed (or pose detection couldn't run), the
  // "Normalize to T-pose" button is disabled and can never be clicked — avoid
  // deadlocking step 3's sequential checklist on it.
  useEffect(() => {
    if (wizardStep !== 3) return;
    if ((prepState.poseType === 'tpose' || !prepState.poseType) && !wizardChecklist.prepTpose) {
      setWizardChecklist((c) => ({ ...c, prepTpose: true }));
    }
  }, [wizardStep, prepState.poseType]); // eslint-disable-line react-hooks/exhaustive-deps

  const wizardPrepOrder = ['prepTpose', 'prepScale', 'prepGround', 'prepFacing'];
  const wizardPrepKeys = ['tpose-btn', 'autoscale-btn', 'ground-btn', 'facing-btn'];
  const wizardHighlightKeys = (() => {
    switch (wizardStep) {
      case 1:
        return charPrepTool === 'mapbones' ? ['bone-rig-list'] : ['edit-rig-btn'];
      case 2:
        return wizardChecklist.lrChoice === 'swapped' ? ['swap-lr-btn'] : ['bone-rig-panel'];
      case 3: {
        const idx = wizardPrepOrder.findIndex((k) => !wizardChecklist[k]);
        return idx === -1 ? [] : [wizardPrepKeys[idx]];
      }
      case 4:
        return ['export-btn'];
      default:
        return [];
    }
  })();
  const wizardIsHighlighted = (key) => typeof wizardStep === 'number' && wizardStep > 0 && wizardHighlightKeys.includes(key);
  const wizardPrepUnlockedIndex = (() => {
    if (wizardStep !== 3) return wizardPrepKeys.length - 1; // no gating outside step 3
    const idx = wizardPrepOrder.findIndex((k) => !wizardChecklist[k]);
    return idx === -1 ? wizardPrepKeys.length - 1 : idx;
  })();

  const wizard = {
    step: wizardStep,
    checklist: wizardChecklist,
    dismissed: wizardDismissed,
    isHighlighted: wizardIsHighlighted,
    prepUnlockedIndex: wizardPrepUnlockedIndex,
    startGuide: wizardStartGuide,
    dismiss: wizardDismiss,
    reopen: wizardReopen,
    goToStep: wizardGoToStep,
    setLrChoice: wizardSetLrChoice,
    setChecklist: wizardSetChecklist,
    checkPrep: wizardCheckPrep,
    onExportSuccess: wizardOnExportSuccess,
  };

  const selectedChar = characters.find((c) => c.id === selectedCharId) || null;
  const selectedBone = selectedChar?.bones.find((b) => b.id === selectedBoneId) || null;
  const rigStats = (() => {
    const counts = { driven: 0, spring: 0, locked: 0 };
    for (const entry of Object.values(boneMapping)) {
      const r = entry.role || 'locked';
      counts[r] = (counts[r] || 0) + 1;
    }
    return counts;
  })();

  return {
    characters,
    selectedCharId,
    selectedBoneId,
    selectedBoneIds,
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
    setSelectedBoneId,
    toggleBoneId,
    selectBoneRange,
    selectedChar,
    selectedBone,
    charPrepTool,
    setCharPrepTool,
    boneMapping,
    setBoneRole,
    setBoneRoleMulti,
    setBoneSpring,
    rigStats,
    prepState,
    faceSetup,
    autoScale,
    groundModel,
    fixFacing,
    normalizeTpose,
    mirrorCharacter,
    setFaceMode,
    setBlendshapeMap,
    setFaceMesh,
    autoDetectBlendshapes,
    swapBoneSides,
    exportForVtube,
    wizard,
  };
}
