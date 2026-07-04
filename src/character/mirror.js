import * as THREE from 'three';

// ─── Geometry: mirror vertex data across the world-space X=0 plane ───────────

function swapAttributeVertices(geometry, i, j) {
  for (const key in geometry.attributes) {
    const attr = geometry.attributes[key];
    const itemSize = attr.itemSize;
    for (let k = 0; k < itemSize; k++) {
      const a = attr.getComponent(i, k);
      const b = attr.getComponent(j, k);
      attr.setComponent(i, k, b);
      attr.setComponent(j, k, a);
    }
    attr.needsUpdate = true;
  }
}

function reverseWinding(geometry) {
  if (geometry.index) {
    const index = geometry.index;
    const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count: index.count }];
    for (const g of groups) {
      for (let i = g.start; i < g.start + g.count; i += 3) {
        const b = index.getX(i + 1);
        const c = index.getX(i + 2);
        index.setX(i + 1, c);
        index.setX(i + 2, b);
      }
    }
    index.needsUpdate = true;
  } else {
    const posAttr = geometry.attributes.position;
    const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count: posAttr.count }];
    for (const g of groups) {
      for (let i = g.start; i < g.start + g.count; i += 3) {
        swapAttributeVertices(geometry, i + 1, i + 2);
      }
    }
  }
}

function mirrorMeshGeometry(mesh) {
  const geometry = mesh.geometry;
  const posAttr = geometry.attributes.position;
  const normAttr = geometry.attributes.normal;
  if (!posAttr) return;

  const matrixWorld = mesh.matrixWorld;
  const invMatrixWorld = new THREE.Matrix4().copy(matrixWorld).invert();
  const linear = new THREE.Matrix3().setFromMatrix4(matrixWorld);
  const invLinear = new THREE.Matrix3().copy(linear).invert();

  const v = new THREE.Vector3();
  for (let i = 0; i < posAttr.count; i++) {
    v.fromBufferAttribute(posAttr, i);
    v.applyMatrix4(matrixWorld);
    v.x = -v.x;
    v.applyMatrix4(invMatrixWorld);
    posAttr.setXYZ(i, v.x, v.y, v.z);
  }
  posAttr.needsUpdate = true;

  if (normAttr) {
    const n = new THREE.Vector3();
    for (let i = 0; i < normAttr.count; i++) {
      n.fromBufferAttribute(normAttr, i);
      n.applyMatrix3(linear);
      n.x = -n.x;
      n.normalize();
      n.applyMatrix3(invLinear);
      normAttr.setXYZ(i, n.x, n.y, n.z);
    }
    normAttr.needsUpdate = true;
  }

  // Morph target position deltas: linear transform only, no translation.
  if (geometry.morphAttributes && geometry.morphAttributes.position) {
    for (const morphAttr of geometry.morphAttributes.position) {
      const d = new THREE.Vector3();
      for (let i = 0; i < morphAttr.count; i++) {
        d.fromBufferAttribute(morphAttr, i);
        d.applyMatrix3(linear);
        d.x = -d.x;
        d.applyMatrix3(invLinear);
        morphAttr.setXYZ(i, d.x, d.y, d.z);
      }
      morphAttr.needsUpdate = true;
    }
  }

  reverseWinding(geometry);
}

// ─── Skeleton: mirror bone world transforms, keep quaternions proper ─────────

function mirrorSkeleton(scene) {
  const bones = [];
  scene.traverse((o) => { if (o.isBone) bones.push(o); }); // pre-order DFS: parent before child

  const mirroredWorld = new Map(); // bone -> new (mirrored) world matrix
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const newLocal = new THREE.Matrix4();

  for (const bone of bones) {
    const origWorld = bone.matrixWorld; // still original — nothing has called updateMatrixWorld since
    origWorld.decompose(pos, quat, scale);

    pos.x = -pos.x;
    quat.set(quat.x, -quat.y, -quat.z, quat.w);

    const newWorld = new THREE.Matrix4().compose(pos, quat, scale);

    const parent = bone.parent;
    const parentWorld = parent
      ? (parent.isBone ? mirroredWorld.get(parent) : parent.matrixWorld)
      : new THREE.Matrix4();

    newLocal.copy(parentWorld).invert().multiply(newWorld);
    newLocal.decompose(bone.position, bone.quaternion, bone.scale);

    mirroredWorld.set(bone, newWorld);
  }
}

/**
 * Physically mirrors a character's mesh geometry and skeleton across the
 * world-space X=0 plane, in place. Does NOT use a negative-scale node (see
 * [[shatter-bug]] — that approach doesn't commute through rotated
 * intermediate nodes and breaks quaternion math). Instead:
 *   - vertex positions/normals/morph deltas are mirrored directly in the
 *     geometry buffers, with triangle winding reversed to compensate,
 *   - every bone's world transform is mirrored and reflected back into a
 *     proper (det=+1) local rotation, parent-before-child,
 *   - skeleton.calculateInverses() is called afterward so bind data matches
 *     the new bone positions (same pattern as normalizeTpose/exporter.js).
 */
export function mirrorCharacterX(scene) {
  scene.updateMatrixWorld(true);

  const meshes = [];
  const seenGeometry = new Set();
  scene.traverse((obj) => {
    if (obj.isMesh && obj.geometry && !seenGeometry.has(obj.geometry)) {
      seenGeometry.add(obj.geometry);
      meshes.push(obj);
    }
  });
  for (const mesh of meshes) mirrorMeshGeometry(mesh);

  mirrorSkeleton(scene);

  scene.updateMatrixWorld(true);
  scene.traverse((obj) => {
    if (obj.isSkinnedMesh && obj.skeleton) obj.skeleton.calculateInverses();
  });
}
