import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Correct operation order:
 * 1. Record traversal order BEFORE clone (so boneRemap is stable)
 * 2. Deep-clone the scene
 * 3. Bake root transform (scale/rotation/position) into geometry vertices — reset root to identity
 * 4. updateMatrixWorld(true) — all bone world matrices now in identity-root space
 * 5. Collect cloned nodes in same order, rebind skeletons (auto-calculate inverses from post-bake world matrices)
 * 6. Attach vtubeRig + face metadata to userData — bones keep their ORIGINAL names
 * 7. Export via GLTFExporter (binary)
 * 8. Self-verify: reload with GLTFLoader before resolving
 */
export function exportForVtube({ char, boneRig, faceSetup }) {
  return new Promise((resolve, reject) => {
    // ── 1. Record traversal order BEFORE clone ──────────────────────────────
    const origBones = [];
    const origSkinnedMeshes = [];
    char.scene.traverse((obj) => {
      if (obj.isBone) origBones.push(obj);
      if (obj.isSkinnedMesh) origSkinnedMeshes.push(obj);
    });

    // ── 2. Deep-clone ───────────────────────────────────────────────────────
    const exportScene = char.scene.clone(true);

    // ── 3. Bake root transform BEFORE rebinding ─────────────────────────────
    // autoScale / groundModel / fixFacing leave transforms on char.scene root.
    // Baking them into geometry vertices BEFORE skeleton rebinding keeps the
    // bone inverse matrices consistent with the identity-root geometry.
    exportScene.updateMatrix();
    const isIdentity =
      Math.abs(exportScene.scale.x - 1) < 1e-6 &&
      Math.abs(exportScene.scale.y - 1) < 1e-6 &&
      Math.abs(exportScene.scale.z - 1) < 1e-6 &&
      Math.abs(exportScene.rotation.x) < 1e-6 &&
      Math.abs(exportScene.rotation.y) < 1e-6 &&
      Math.abs(exportScene.rotation.z) < 1e-6 &&
      exportScene.position.lengthSq() < 1e-10;

    if (!isIdentity) {
      const rootMat = exportScene.matrix.clone();
      exportScene.traverse((obj) => {
        if (obj.isMesh && obj.geometry) {
          obj.geometry = obj.geometry.clone();
          obj.geometry.applyMatrix4(rootMat);
        }
      });
      exportScene.position.set(0, 0, 0);
      exportScene.rotation.set(0, 0, 0);
      exportScene.scale.set(1, 1, 1);
    }

    // ── 4. Update world matrices with identity root ─────────────────────────
    exportScene.updateMatrixWorld(true);

    // ── 5. Collect cloned nodes in same order, then rebind skeletons ────────
    const clonedBones = [];
    const clonedSkinnedMeshes = [];
    exportScene.traverse((obj) => {
      if (obj.isBone) clonedBones.push(obj);
      if (obj.isSkinnedMesh) clonedSkinnedMeshes.push(obj);
    });

    const boneRemap = new Map();
    origBones.forEach((orig, i) => { if (clonedBones[i]) boneRemap.set(orig, clonedBones[i]); });

    origSkinnedMeshes.forEach((origMesh, i) => {
      const clonedMesh = clonedSkinnedMeshes[i];
      if (!clonedMesh || !origMesh.skeleton) return;
      const newBones = origMesh.skeleton.bones.map((b) => boneRemap.get(b) || b);
      const newSkeleton = new THREE.Skeleton(newBones);
      clonedMesh.bind(newSkeleton); // auto-calculates inverses from post-bake world matrices
    });

    // ── 6. Attach vtubeRig + face metadata — original bone names are preserved ─
    exportScene.userData = {
      ...exportScene.userData,
      vtubeRig: { version: 1, bones: boneRig },
      vtubeFaceMode: faceSetup.mode,
      ...(faceSetup.mode === 'blendshapes' ? { vtubeFaceMap: faceSetup.blendshapeMap } : {}),
      ...(faceSetup.mode === 'mesh' && faceSetup.faceMeshId
        ? { vtubeFaceMeshId: faceSetup.faceMeshId }
        : {}),
    };

    // ── 7. Export, then 8. self-verify before resolving ─────────────────────
    const exporter = new GLTFExporter();
    exporter.parse(
      exportScene,
      (buffer) => {
        const blob = new Blob([buffer], { type: 'model/gltf-binary' });
        const verifyUrl = URL.createObjectURL(blob);
        const loader = new GLTFLoader();
        loader.load(
          verifyUrl,
          () => {
            URL.revokeObjectURL(verifyUrl);
            resolve(buffer);
          },
          undefined,
          (err) => {
            URL.revokeObjectURL(verifyUrl);
            reject(new Error('Export verification failed: ' + err.message));
          },
        );
      },
      (err) => reject(err),
      { binary: true },
    );
  });
}
