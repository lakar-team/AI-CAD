import { useState, useCallback } from 'react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

let charIdSeq = 0;

export function useCharacterEngine() {
  const [characters, setCharacters] = useState([]);
  const [selectedCharId, setSelectedCharId] = useState(null);
  const [selectedBoneId, setSelectedBoneId] = useState(null);
  const [activeTool, setActiveTool] = useState('select');

  const importGLB = useCallback(async (file) => {
    const url = URL.createObjectURL(file);
    const loader = new GLTFLoader();
    let gltf;
    try {
      gltf = await loader.loadAsync(url);
    } finally {
      URL.revokeObjectURL(url);
    }

    const bones = [];
    const meshes = [];
    gltf.scene.traverse((obj) => {
      if (obj.isBone) bones.push({ id: obj.uuid, name: obj.name, object: obj });
      if (obj.isMesh) meshes.push({ id: obj.uuid, name: obj.name, object: obj });
    });

    const id = `char_${charIdSeq++}`;
    setCharacters((prev) => [
      ...prev,
      { id, name: file.name, scene: gltf.scene, animations: gltf.animations, bones, meshes },
    ]);
    setSelectedCharId(id);
    setSelectedBoneId(null);
  }, []);

  const selectedChar = characters.find((c) => c.id === selectedCharId) || null;
  const selectedBone = selectedChar?.bones.find((b) => b.id === selectedBoneId) || null;

  return {
    characters,
    selectedCharId,
    selectedBoneId,
    activeTool,
    setActiveTool,
    importGLB,
    selectCharacter: setSelectedCharId,
    selectBone: setSelectedBoneId,
    selectedChar,
    selectedBone,
  };
}
