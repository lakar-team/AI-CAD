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

    // ── 2. Deep-clone — wrap in THREE.Scene so GLTFExporter's
    //    `instanceof Scene` check passes. GLTFLoader returns a THREE.Group,
    //    which fails that check and routes to processObjectsAsync (AuxScene
    //    with empty userData). Only processSceneAsync calls serializeUserData
    //    on the root, which is what writes userData → scenes[0].extras.
    const clonedRoot = char.scene.clone(true);
    const exportScene = new THREE.Scene();
    exportScene.position.copy(clonedRoot.position);
    exportScene.quaternion.copy(clonedRoot.quaternion);
    exportScene.scale.copy(clonedRoot.scale);
    for (const child of [...clonedRoot.children]) exportScene.add(child);

    // ── 3. Fold root transform into direct children, reset root to identity ──
    // autoScale / groundModel / fixFacing leave transforms on char.scene root.
    // We need the exported GLB to have an identity root so vtube doesn't see
    // a stale scale/rotation on the scene node.
    //
    // We do NOT bake into geometry vertices. Baking rootMat into vertices is
    // only correct when rootMat commutes through intermediate node transforms
    // (true for uniform scale, false for rotation).  Soldier.glb has a
    // "Character" node (scale=0.01, -90°X) between the root and the meshes:
    //   CharacterMat × Ry(π) ≠ Ry(π) × CharacterMat
    // so geometry-baking with a rotation produces vertices in the wrong frame
    // relative to the skeleton, causing the shatter.
    //
    // The correct approach: fold rootMat into each direct child's local matrix
    // (child.applyMatrix4 premultiplies child.localMat by rootMat).  This
    // leaves all world matrices unchanged — bones and mesh stay consistent.
    exportScene.updateMatrix();
    const isIdentity =
      Math.abs(exportScene.scale.x - 1) < 1e-6 &&
      Math.abs(exportScene.scale.y - 1) < 1e-6 &&
      Math.abs(exportScene.scale.z - 1) < 1e-6 &&
      Math.abs(exportScene.quaternion.x) < 1e-6 &&
      Math.abs(exportScene.quaternion.y) < 1e-6 &&
      Math.abs(exportScene.quaternion.z) < 1e-6 &&
      exportScene.position.lengthSq() < 1e-10;

    if (!isIdentity) {
      const rootMat = exportScene.matrix.clone();
      for (const child of [...exportScene.children]) {
        child.applyMatrix4(rootMat);
      }
      exportScene.position.set(0, 0, 0);
      exportScene.quaternion.set(0, 0, 0, 1);
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
