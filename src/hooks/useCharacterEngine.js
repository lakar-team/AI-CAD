import { useState, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

let charIdSeq = 0;

// Distance from a world point [x,y,z] to a ray (plain math, no THREE dependency at call site)
function distPointToRay(origin, dir, pt) {
  const ox = pt[0] - origin[0], oy = pt[1] - origin[1], oz = pt[2] - origin[2];
  const dot = ox * dir[0] + oy * dir[1] + oz * dir[2];
  const px = origin[0] + dir[0] * dot;
  const py = origin[1] + dir[1] * dot;
  const pz = origin[2] + dir[2] * dot;
  return Math.hypot(pt[0] - px, pt[1] - py, pt[2] - pz);
}

// Enrich raw bone list with world position, parent name, and estimated length
function enrichBones(rawBones) {
  const tmp = new THREE.Vector3();
  return rawBones.map((b) => {
    b.object.getWorldPosition(tmp);
    const worldPos = [tmp.x, tmp.y, tmp.z];

    const parentBone = b.object.parent?.isBone ? b.object.parent : null;
    const parentName = parentBone?.name || null;

    // Estimate bone length: distance to first child bone, else 0.1m default
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

export function useCharacterEngine() {
  const [characters, setCharacters] = useState([]);
  const [selectedCharId, setSelectedCharId] = useState(null);
  const [selectedBoneId, setSelectedBoneId] = useState(null);
  const [activeTool, setActiveTool] = useState('select');

  const _addChar = useCallback((charData) => {
    setCharacters((prev) => [...prev, charData]);
    setSelectedCharId(charData.id);
    setSelectedBoneId(null);
  }, []);

  const importGLB = useCallback(async (file) => {
    const url = URL.createObjectURL(file);
    const loader = new GLTFLoader();
    let gltf;
    try {
      gltf = await loader.loadAsync(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    _addChar(processGltf(gltf, file.name));
  }, [_addChar]);

  const loadSampleModel = useCallback(async (url, name) => {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    _addChar(processGltf(gltf, name));
  }, [_addChar]);

  // Ray-based bone picking — called from Viewport's PointerRig on click
  const onCharacterClick = useCallback((ray, radius) => {
    // Find the active character
    let char = null;
    setCharacters((prev) => {
      char = prev.find((c) => c.id === selectedCharId) || null;
      return prev; // no mutation
    });

    // We need selectedCharId synchronously; access via closure from render
    // This callback is re-created whenever selectedCharId changes (dep array below)
    if (!char || !char.bones.length) return;

    const threshold = Math.max(radius * 6, 0.06);
    let closest = null;
    let closestDist = threshold;
    const tmp = new THREE.Vector3();

    for (const bone of char.bones) {
      bone.object.getWorldPosition(tmp);
      const d = distPointToRay(ray.origin, ray.dir, [tmp.x, tmp.y, tmp.z]);
      if (d < closestDist) {
        closestDist = d;
        closest = bone;
      }
    }

    setSelectedBoneId(closest ? closest.id : null);
  }, [selectedCharId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Add a child bone at the tail of the currently selected bone
  const addChildBone = useCallback(() => {
    setCharacters((prev) => {
      const char = prev.find((c) => c.id === selectedCharId);
      if (!char) return prev;
      const parent = char.bones.find((b) => b.id === selectedBoneId);
      if (!parent) return prev;

      const newBone = new THREE.Bone();
      newBone.name = `${parent.name || 'Bone'}.child`;
      newBone.position.set(0, parent.lengthM, 0); // offset along local Y
      parent.object.add(newBone);
      parent.object.updateMatrixWorld(true);

      const tmp = new THREE.Vector3();
      newBone.getWorldPosition(tmp);

      const newBoneData = {
        id: newBone.uuid,
        name: newBone.name,
        object: newBone,
        worldPos: [tmp.x, tmp.y, tmp.z],
        parentName: parent.name,
        lengthM: 0.1,
      };

      const updatedChar = { ...char, bones: [...char.bones, newBoneData] };
      setSelectedBoneId(newBone.uuid); // select the new bone
      return prev.map((c) => (c.id === selectedCharId ? updatedChar : c));
    });
  }, [selectedCharId, selectedBoneId]);

  const selectedChar = characters.find((c) => c.id === selectedCharId) || null;
  const selectedBone = selectedChar?.bones.find((b) => b.id === selectedBoneId) || null;

  return {
    characters,
    selectedCharId,
    selectedBoneId,
    activeTool,
    setActiveTool,
    importGLB,
    loadSampleModel,
    onCharacterClick,
    addChildBone,
    selectCharacter: setSelectedCharId,
    selectBone: setSelectedBoneId,
    selectedChar,
    selectedBone,
  };
}
