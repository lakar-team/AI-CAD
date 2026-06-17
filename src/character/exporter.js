import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Correct operation order:
 * 1. Record traversal order BEFORE clone (so boneRemap is stable)
 * 2. Deep-clone the scene
 * 3. Bake root transform (scale/rotation/position) into geometry vertices — reset root to identity
 * 4. updateMatrixWorld(true) — all bone world matrices now in identity-root space
 * 5. Collect cloned nodes in same traversal order, then rebind skeletons
 * 6. Rename bones by boneMapping (only .name, never remove or reparent)
 * 7. Attach userData metadata
 * 8. Export via GLTFExporter (binary)
 * 9. Self-verify: reload with GLTFLoader before resolving
 */
export function exportForVtube({ char, boneMapping, faceSetup }) {
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
      const newInverses = origMesh.skeleton.boneInverses.map((m) => m.clone());
      const newSkeleton = new THREE.Skeleton(newBones, newInverses);
      clonedMesh.bind(newSkeleton, clonedMesh.matrixWorld);
    });

    // ── 6. Rename bones — ONLY change .name, never remove or reparent ───────
    exportScene.traverse((obj) => {
      if (!obj.isBone) return;
      for (const [mixamoName, entry] of Object.entries(boneMapping)) {
        if (entry.sourceName === obj.name && entry.status !== 'unmapped') {
          obj.name = mixamoName;
          break;
        }
      }
    });

    // ── 7. Attach vtube metadata ────────────────────────────────────────────
    exportScene.userData = {
      ...exportScene.userData,
      vtubeFaceMode: faceSetup.mode,
      ...(faceSetup.mode === 'blendshapes' ? { vtubeFaceMap: faceSetup.blendshapeMap } : {}),
      ...(faceSetup.mode === 'mesh' && faceSetup.faceMeshId
        ? { vtubeFaceMeshId: faceSetup.faceMeshId }
        : {}),
    };

    // ── 8. Export, then 9. self-verify before resolving ─────────────────────
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
