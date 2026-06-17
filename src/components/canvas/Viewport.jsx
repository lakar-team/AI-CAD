/**
 * Viewport.jsx — three.js viewport for the CAD engine.
 *
 * All picking/snapping happens in the core inference engine (src/core), so
 * this component's job is: render the model (recursively through instances),
 * convert pointer events into world-space rays for the hook, and draw the
 * overlay graphics (inference marker, ghost lines, previews, selection box,
 * cursor measurement label, selection gizmo).
 */

import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, GizmoHelper, GizmoViewport, Line, Html } from '@react-three/drei';
import * as THREE from 'three';
import { triangulateLoop } from '../../core/triangulate.js';
import { add, sub, scale, normalize, cross, multiplyM4, identityM4, transformPoint, distance } from '../../core/math3.js';
import { formatLength } from '../../core/units.js';
import { AXIS_COLORS } from '../../core/inference.js';
import { MIXAMO_JOINTS } from '../../hooks/useCharacterEngine.js';

const SNAP_PIXELS = 9;

// Reference T-pose skeleton joint positions in cm. Source: vtube RigConfig.
const REF_JOINT_POS_CM = {
  mixamorigHips:            [  0,   83,  0],
  mixamorigSpine:           [  0,  100,  0],
  mixamorigSpine1:          [  0,  116,  0],
  mixamorigSpine2:          [  0,  133,  0],
  mixamorigNeck:            [  0,  140,  0],
  mixamorigHead:            [  0,  154,  0],
  mixamorigLeftShoulder:    [ -8,  130,  0],
  mixamorigLeftArm:         [-20,  130,  0],
  mixamorigLeftForeArm:     [-46,  130,  0],
  mixamorigLeftHand:        [-73,  130,  0],
  mixamorigLeftHandThumb1:  [-74,  128,  2],
  mixamorigLeftHandThumb2:  [-78,  126,  4],
  mixamorigLeftHandThumb3:  [-81,  124,  5],
  mixamorigLeftHandIndex1:  [-78,  130,  1],
  mixamorigLeftHandIndex2:  [-82,  130,  1],
  mixamorigLeftHandIndex3:  [-86,  130,  1],
  mixamorigLeftHandMiddle1: [-78,  130,  0],
  mixamorigLeftHandMiddle2: [-83,  130,  0],
  mixamorigLeftHandMiddle3: [-87,  130,  0],
  mixamorigLeftHandRing1:   [-78,  130, -1],
  mixamorigLeftHandRing2:   [-82,  130, -1],
  mixamorigLeftHandRing3:   [-86,  130, -1],
  mixamorigLeftHandPinky1:  [-77,  130, -2],
  mixamorigLeftHandPinky2:  [-80,  130, -2],
  mixamorigLeftHandPinky3:  [-83,  130, -2],
  mixamorigRightShoulder:   [  8,  130,  0],
  mixamorigRightArm:        [ 20,  130,  0],
  mixamorigRightForeArm:    [ 46,  130,  0],
  mixamorigRightHand:       [ 73,  130,  0],
  mixamorigRightHandThumb1: [ 74,  128,  2],
  mixamorigRightHandThumb2: [ 78,  126,  4],
  mixamorigRightHandThumb3: [ 81,  124,  5],
  mixamorigRightHandIndex1: [ 78,  130,  1],
  mixamorigRightHandIndex2: [ 82,  130,  1],
  mixamorigRightHandIndex3: [ 86,  130,  1],
  mixamorigRightHandMiddle1:[ 78,  130,  0],
  mixamorigRightHandMiddle2:[ 83,  130,  0],
  mixamorigRightHandMiddle3:[ 87,  130,  0],
  mixamorigRightHandRing1:  [ 78,  130, -1],
  mixamorigRightHandRing2:  [ 82,  130, -1],
  mixamorigRightHandRing3:  [ 86,  130, -1],
  mixamorigRightHandPinky1: [ 77,  130, -2],
  mixamorigRightHandPinky2: [ 80,  130, -2],
  mixamorigRightHandPinky3: [ 83,  130, -2],
  mixamorigLeftUpLeg:       [-12,   83,  0],
  mixamorigLeftLeg:         [-12,   38,  0],
  mixamorigLeftFoot:        [-12,    4,  8],
  mixamorigLeftToeBase:     [-12,    1, 15],
  mixamorigRightUpLeg:      [ 12,   83,  0],
  mixamorigRightLeg:        [ 12,   38,  0],
  mixamorigRightFoot:       [ 12,    4,  8],
  mixamorigRightToeBase:    [ 12,    1, 15],
};

const REF_SKELETON_EDGES = [
  ['mixamorigHips','mixamorigSpine'],
  ['mixamorigSpine','mixamorigSpine1'],
  ['mixamorigSpine1','mixamorigSpine2'],
  ['mixamorigSpine2','mixamorigNeck'],
  ['mixamorigNeck','mixamorigHead'],
  ['mixamorigSpine2','mixamorigLeftShoulder'],
  ['mixamorigLeftShoulder','mixamorigLeftArm'],
  ['mixamorigLeftArm','mixamorigLeftForeArm'],
  ['mixamorigLeftForeArm','mixamorigLeftHand'],
  ['mixamorigLeftHand','mixamorigLeftHandThumb1'],
  ['mixamorigLeftHandThumb1','mixamorigLeftHandThumb2'],
  ['mixamorigLeftHandThumb2','mixamorigLeftHandThumb3'],
  ['mixamorigLeftHand','mixamorigLeftHandIndex1'],
  ['mixamorigLeftHandIndex1','mixamorigLeftHandIndex2'],
  ['mixamorigLeftHandIndex2','mixamorigLeftHandIndex3'],
  ['mixamorigLeftHand','mixamorigLeftHandMiddle1'],
  ['mixamorigLeftHandMiddle1','mixamorigLeftHandMiddle2'],
  ['mixamorigLeftHandMiddle2','mixamorigLeftHandMiddle3'],
  ['mixamorigLeftHand','mixamorigLeftHandRing1'],
  ['mixamorigLeftHandRing1','mixamorigLeftHandRing2'],
  ['mixamorigLeftHandRing2','mixamorigLeftHandRing3'],
  ['mixamorigLeftHand','mixamorigLeftHandPinky1'],
  ['mixamorigLeftHandPinky1','mixamorigLeftHandPinky2'],
  ['mixamorigLeftHandPinky2','mixamorigLeftHandPinky3'],
  ['mixamorigSpine2','mixamorigRightShoulder'],
  ['mixamorigRightShoulder','mixamorigRightArm'],
  ['mixamorigRightArm','mixamorigRightForeArm'],
  ['mixamorigRightForeArm','mixamorigRightHand'],
  ['mixamorigRightHand','mixamorigRightHandThumb1'],
  ['mixamorigRightHandThumb1','mixamorigRightHandThumb2'],
  ['mixamorigRightHandThumb2','mixamorigRightHandThumb3'],
  ['mixamorigRightHand','mixamorigRightHandIndex1'],
  ['mixamorigRightHandIndex1','mixamorigRightHandIndex2'],
  ['mixamorigRightHandIndex2','mixamorigRightHandIndex3'],
  ['mixamorigRightHand','mixamorigRightHandMiddle1'],
  ['mixamorigRightHandMiddle1','mixamorigRightHandMiddle2'],
  ['mixamorigRightHandMiddle2','mixamorigRightHandMiddle3'],
  ['mixamorigRightHand','mixamorigRightHandRing1'],
  ['mixamorigRightHandRing1','mixamorigRightHandRing2'],
  ['mixamorigRightHandRing2','mixamorigRightHandRing3'],
  ['mixamorigRightHand','mixamorigRightHandPinky1'],
  ['mixamorigRightHandPinky1','mixamorigRightHandPinky2'],
  ['mixamorigRightHandPinky2','mixamorigRightHandPinky3'],
  ['mixamorigHips','mixamorigLeftUpLeg'],
  ['mixamorigLeftUpLeg','mixamorigLeftLeg'],
  ['mixamorigLeftLeg','mixamorigLeftFoot'],
  ['mixamorigLeftFoot','mixamorigLeftToeBase'],
  ['mixamorigHips','mixamorigRightUpLeg'],
  ['mixamorigRightUpLeg','mixamorigRightLeg'],
  ['mixamorigRightLeg','mixamorigRightFoot'],
  ['mixamorigRightFoot','mixamorigRightToeBase'],
];

const INFERENCE_COLORS = {
  endpoint: '#21a121',
  midpoint: '#00b5b5',
  'on-edge': '#c33',
  'on-face': '#36c',
  axis: '#888',
  ground: '#999',
  free: '#bbb',
};

const INFERENCE_LABELS = {
  endpoint: 'Endpoint',
  midpoint: 'Midpoint',
  'on-edge': 'On Edge',
  'on-face': 'On Face',
  axis: 'On Axis',
};

function inferenceColor(inf) {
  if (!inf) return '#bbb';
  return inf.axis ? AXIS_COLORS[inf.axis] : (INFERENCE_COLORS[inf.type] || '#bbb');
}

// ─── pointer → world ray + box drag detection + gizmo picking ────────────────
function PointerRig({
  onRay, onClick, onDoubleClick,
  onBoxSelect, onBoxDrag, enableBoxSelect,
  gizmoMeshesRef, onGizmoHover, onGizmoClick,
}) {
  const { gl, camera, size } = useThree();

  // All callbacks in a ref so the single DOM-listener effect never re-runs
  const h = useRef({});
  h.current = {
    onRay, onClick, onDoubleClick,
    onBoxSelect, onBoxDrag, enableBoxSelect,
    gizmoMeshesRef, onGizmoHover, onGizmoClick,
    camera, size,
  };

  useEffect(() => {
    const el = gl.domElement;
    const down = { x: 0, y: 0, moved: false, dragging: false };
    const raycaster = new THREE.Raycaster();
    const pickRc = new THREE.Raycaster(); // dedicated raycaster for gizmo picking
    const ndc = new THREE.Vector2();

    const makeRay = (ev) => {
      const { camera: cam, size: sz } = h.current;
      const rect = el.getBoundingClientRect();
      ndc.set(
        ((ev.clientX - rect.left) / rect.width) * 2 - 1,
        -((ev.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, cam);
      const o = raycaster.ray.origin;
      const d = raycaster.ray.direction;
      const dist = Math.max(1, o.length());
      const worldPerPixel = (2 * dist * Math.tan((cam.fov * Math.PI) / 360)) / sz.height;
      return {
        ray: { origin: [o.x, o.y, o.z], dir: [d.x, d.y, d.z] },
        radius: SNAP_PIXELS * worldPerPixel,
      };
    };

    // Test pointer against gizmo hit meshes; returns axis name or null
    const hitGizmo = (ev) => {
      const meshes = (h.current.gizmoMeshesRef?.current || []).filter(Boolean);
      if (!meshes.length) return null;
      const { camera: cam } = h.current;
      const rect = el.getBoundingClientRect();
      const n = new THREE.Vector2(
        ((ev.clientX - rect.left) / rect.width) * 2 - 1,
        -((ev.clientY - rect.top) / rect.height) * 2 + 1,
      );
      pickRc.setFromCamera(n, cam);
      const hits = pickRc.intersectObjects(meshes, false);
      return hits.length > 0 ? hits[0].object.userData.axis : null;
    };

    // Snapshot the camera projection at the moment of release for box-select
    const makeProject = () => {
      const { camera: cam, size: sz } = h.current;
      return (worldPt) => {
        const v = new THREE.Vector3(worldPt[0], worldPt[1], worldPt[2]);
        v.project(cam);
        if (v.z > 1) return null;
        return { x: (v.x + 1) / 2 * sz.width, y: (1 - v.y) / 2 * sz.height };
      };
    };

    const onPointerMove = (ev) => {
      if (ev.buttons & 6) return; // middle/right = orbit/pan
      const dx = ev.clientX - down.x;
      const dy = ev.clientY - down.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) down.moved = true;

      // Box drag: left button held + moved + select tool
      if (ev.buttons === 1 && down.moved && h.current.enableBoxSelect) {
        if (!down.dragging) down.dragging = true;
        const rect = el.getBoundingClientRect();
        h.current.onBoxDrag?.({
          x1: down.x - rect.left,
          y1: down.y - rect.top,
          x2: ev.clientX - rect.left,
          y2: ev.clientY - rect.top,
        });
        return;
      }

      // Gizmo hover (when not dragging, not box-selecting)
      if (!down.moved) {
        const axis = hitGizmo(ev);
        h.current.onGizmoHover?.(axis);
      }

      const { ray, radius } = makeRay(ev);
      h.current.onRay(ray, radius);
    };

    const onPointerDown = (ev) => {
      if (ev.button !== 0) return;
      down.x = ev.clientX;
      down.y = ev.clientY;
      down.moved = false;
      down.dragging = false;
    };

    const onPointerUp = (ev) => {
      if (ev.button !== 0) return;
      if (down.dragging) {
        const rect = el.getBoundingClientRect();
        const x1 = down.x - rect.left, y1 = down.y - rect.top;
        const x2 = ev.clientX - rect.left, y2 = ev.clientY - rect.top;
        const direction = x2 >= x1 ? 'window' : 'crossing';
        h.current.onBoxSelect?.({ x1, y1, x2, y2 }, direction, makeProject());
        h.current.onBoxDrag?.(null);
        down.dragging = false;
        return;
      }
      if (down.moved) return;
      // Gizmo click takes priority over regular click
      const axis = hitGizmo(ev);
      if (axis) {
        h.current.onGizmoClick?.(axis);
        return;
      }
      const { ray, radius } = makeRay(ev);
      h.current.onClick(ray, radius, { shift: ev.shiftKey, ctrl: ev.ctrlKey });
    };

    const onDbl = (ev) => {
      const { ray, radius } = makeRay(ev);
      h.current.onDoubleClick(ray, radius);
    };

    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('dblclick', onDbl);
    return () => {
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('dblclick', onDbl);
    };
  }, [gl]);

  return null;
}

// ─── grid ─────────────────────────────────────────────────────────────────────
const Grid = React.memo(function Grid() {
  const { minorGeo, majorGeo } = useMemo(() => {
    const size = 50;
    const minor = [], major = [];
    for (let i = -size; i <= size; i++) {
      const arr = i % 5 === 0 ? major : minor;
      arr.push(-size, 0, i, size, 0, i);
      arr.push(i, 0, -size, i, 0, size);
    }
    const make = (a) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3));
      return g;
    };
    return { minorGeo: make(minor), majorGeo: make(major) };
  }, []);
  return (
    <group>
      <lineSegments geometry={minorGeo}>
        <lineBasicMaterial color="#dcdcd4" />
      </lineSegments>
      <lineSegments geometry={majorGeo}>
        <lineBasicMaterial color="#c4c4bc" />
      </lineSegments>
      <Line points={[[-50, 0, 0], [50, 0, 0]]} color={AXIS_COLORS.x} lineWidth={1.5} />
      <Line points={[[0, 0, -50], [0, 0, 50]]} color={AXIS_COLORS.z} lineWidth={1.5} />
      <Line points={[[0, 0, 0], [0, 50, 0]]} color={AXIS_COLORS.y} lineWidth={1.5} />
    </group>
  );
});

// ─── model rendering ─────────────────────────────────────────────────────────

function useRenderData(model, version, selection, hoveredFaceId) {
  return useMemo(() => {
    void version;
    const faces = [];
    const edgeLines = { normal: [], selected: [], dimmed: [] };
    const vertexDots = [];
    const activeKey = JSON.stringify(model.activeContext);

    const walk = (def, matrix, path, selectedInstance) => {
      const pathKey = JSON.stringify(path);
      const isActiveCtx = pathKey === activeKey;
      const dimmed = model.activeContext.length > 0 && !isActiveCtx && !selectedInstance;

      for (const f of def.mesh.faces.values()) {
        const pts = f.loop.map((vid) => transformPoint(matrix, def.mesh.vertices.get(vid).p));
        const tris = triangulateLoop(pts);
        if (!tris.length) continue;
        const positions = new Float32Array(tris.length * 9);
        let k = 0;
        for (const [a, b, c] of tris) {
          for (const i of [a, b, c]) {
            positions[k++] = pts[i][0];
            positions[k++] = pts[i][1];
            positions[k++] = pts[i][2];
          }
        }
        faces.push({
          key: `${pathKey}:${f.id}`,
          positions,
          color: f.color,
          dimmed,
          selected: isActiveCtx && selection.has(f.id),
          hovered: isActiveCtx && hoveredFaceId === f.id,
        });
      }

      for (const e of def.mesh.edges.values()) {
        const a = transformPoint(matrix, def.mesh.vertices.get(e.a).p);
        const b = transformPoint(matrix, def.mesh.vertices.get(e.b).p);
        const bucket = selectedInstance || (isActiveCtx && selection.has(e.id))
          ? 'selected' : dimmed ? 'dimmed' : 'normal';
        edgeLines[bucket].push(...a, ...b);
      }

      if (isActiveCtx && def.mesh.vertices.size <= 800) {
        for (const v of def.mesh.vertices.values()) {
          vertexDots.push({
            key: v.id,
            p: transformPoint(matrix, v.p),
            selected: selection.has(v.id),
          });
        }
      }

      for (const inst of def.children) {
        walk(
          model.definitions.get(inst.definitionId),
          multiplyM4(matrix, inst.transform),
          [...path, inst.id],
          selectedInstance || selection.has(inst.id),
        );
      }
    };
    walk(model.root(), identityM4(), [], false);
    return { faces, edgeLines, vertexDots };
  }, [model, version, selection, hoveredFaceId]);
}

function EdgeBatch({ positions, color, lineWidth = 1, opacity = 1 }) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return g;
  }, [positions]);
  if (positions.length === 0) return null;
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color={color} transparent={opacity < 1} opacity={opacity} linewidth={lineWidth} />
    </lineSegments>
  );
}

function ModelRender({ model, version, selection, hoveredFaceId }) {
  const { faces, edgeLines, vertexDots } = useRenderData(model, version, selection, hoveredFaceId);
  return (
    <group>
      {faces.map((f) => {
        const color = f.hovered ? '#aecdf0' : f.selected ? '#9cc3ec' : f.color;
        return (
          <mesh key={f.key} renderOrder={0}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[f.positions, 3]} />
            </bufferGeometry>
            <meshStandardMaterial
              color={color}
              side={THREE.DoubleSide}
              transparent={f.dimmed}
              opacity={f.dimmed ? 0.25 : 1}
              polygonOffset
              polygonOffsetFactor={1}
              polygonOffsetUnits={1}
              roughness={0.85}
              metalness={0}
              flatShading
            />
          </mesh>
        );
      })}
      <EdgeBatch positions={edgeLines.normal} color="#1c1c1c" />
      <EdgeBatch positions={edgeLines.dimmed} color="#1c1c1c" opacity={0.2} />
      <EdgeBatch positions={edgeLines.selected} color="#1a9fdc" lineWidth={2} />
      {vertexDots.map((v) => (
        <mesh key={v.key} position={v.p}>
          <sphereGeometry args={[v.selected ? 0.035 : 0.022, 8, 8]} />
          <meshBasicMaterial color={v.selected ? '#1a9fdc' : '#444'} />
        </mesh>
      ))}
    </group>
  );
}

// ─── overlays ─────────────────────────────────────────────────────────────────

function InferenceMarker({ inference }) {
  if (!inference || inference.type === 'free') return null;
  const color = inference.axis
    ? AXIS_COLORS[inference.axis]
    : INFERENCE_COLORS[inference.type] || '#999';
  if (inference.type === 'ground') return null;
  return (
    <mesh position={inference.point} renderOrder={20}>
      <sphereGeometry args={[0.045, 10, 10]} />
      <meshBasicMaterial color={color} depthTest={false} />
    </mesh>
  );
}

function PreviewOverlay({ preview }) {
  if (!preview) return null;

  if (preview.type === 'line' || preview.type === 'move') {
    const color = preview.axis ? AXIS_COLORS[preview.axis] : '#1a9fdc';
    return (
      <Line
        points={[preview.a, preview.b]}
        color={color}
        lineWidth={preview.axis ? 2 : 1.5}
        dashed={!!preview.dashed || preview.type === 'move'}
        dashSize={0.12}
        gapSize={0.06}
      />
    );
  }

  if (preview.type === 'loop' && preview.points?.length >= 2) {
    return (
      <Line
        points={[...preview.points, preview.points[0]]}
        color="#1a9fdc"
        lineWidth={1.5}
      />
    );
  }

  if (preview.type === 'pushpull') {
    const offset = scale(preview.normal, preview.dist);
    const top = preview.loop.map((p) => add(p, offset));
    return (
      <group>
        <Line points={[...top, top[0]]} color="#1a9fdc" lineWidth={1.5} />
        {preview.loop.map((p, i) => (
          <Line key={i} points={[p, top[i]]} color="#1a9fdc" lineWidth={1} dashed dashSize={0.1} gapSize={0.05} />
        ))}
      </group>
    );
  }

  return null;
}

// ─── selection gizmo ─────────────────────────────────────────────────────────

const GIZMO_SIZE = 0.7; // world-unit arrow length
const HIT_RADIUS = 0.1; // half-width of invisible hit cylinder

function SelectionGizmo({ centroid, activeTool, gizmoMeshesRef, hoveredAxis }) {
  const xRef = useRef(null);
  const yRef = useRef(null);
  const zRef = useRef(null);

  // Keep gizmoMeshesRef in sync with the hit cylinder Three.js objects.
  // Mutation during render is safe for refs.
  if (gizmoMeshesRef) {
    const meshes = [];
    if (centroid && activeTool === 'select') {
      if (xRef.current) meshes.push(xRef.current);
      if (yRef.current) meshes.push(yRef.current);
      if (zRef.current) meshes.push(zRef.current);
    }
    gizmoMeshesRef.current = meshes;
  }

  if (!centroid || activeTool !== 'select') return null;

  const S = GIZMO_SIZE;
  const HALF = S / 2;

  const lw = (axis) => (hoveredAxis === axis ? 4 : 2.5);
  const dotR = (axis) => (hoveredAxis === axis ? 0.08 : 0.055);

  return (
    <group position={centroid}>
      {/* Visible axis lines */}
      <Line points={[[0, 0, 0], [S, 0, 0]]} color={AXIS_COLORS.x} lineWidth={lw('x')} />
      <Line points={[[0, 0, 0], [0, S, 0]]} color={AXIS_COLORS.y} lineWidth={lw('y')} />
      <Line points={[[0, 0, 0], [0, 0, S]]} color={AXIS_COLORS.z} lineWidth={lw('z')} />

      {/* Arrowhead dots */}
      <mesh position={[S, 0, 0]} renderOrder={25}>
        <sphereGeometry args={[dotR('x'), 8, 8]} />
        <meshBasicMaterial color={AXIS_COLORS.x} depthTest={false} />
      </mesh>
      <mesh position={[0, S, 0]} renderOrder={25}>
        <sphereGeometry args={[dotR('y'), 8, 8]} />
        <meshBasicMaterial color={AXIS_COLORS.y} depthTest={false} />
      </mesh>
      <mesh position={[0, 0, S]} renderOrder={25}>
        <sphereGeometry args={[dotR('z'), 8, 8]} />
        <meshBasicMaterial color={AXIS_COLORS.z} depthTest={false} />
      </mesh>

      {/* Invisible hit cylinders (transparent, still raycasted) */}
      <mesh ref={xRef} position={[HALF, 0, 0]} rotation={[0, 0, Math.PI / 2]} userData={{ axis: 'x' }}>
        <cylinderGeometry args={[HIT_RADIUS, HIT_RADIUS, S, 6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh ref={yRef} position={[0, HALF, 0]} userData={{ axis: 'y' }}>
        <cylinderGeometry args={[HIT_RADIUS, HIT_RADIUS, S, 6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh ref={zRef} position={[0, 0, HALF]} rotation={[Math.PI / 2, 0, 0]} userData={{ axis: 'z' }}>
        <cylinderGeometry args={[HIT_RADIUS, HIT_RADIUS, S, 6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

// ─── bone visualizer ──────────────────────────────────────────────────────────

const BONE_STATUS_COLORS = {
  confirmed: '#22cc55',
  auto: '#ff9900',
  unmapped: '#cc3333',
  default: '#4488ff',
};

function BoneSphere({ boneObj, selected, mappingStatus, crossHighlighted }) {
  const ref = useRef();
  useFrame(() => {
    if (ref.current) boneObj.getWorldPosition(ref.current.position);
  });
  const color = selected ? '#ff7722'
    : crossHighlighted ? '#44aaff'
    : (BONE_STATUS_COLORS[mappingStatus] || BONE_STATUS_COLORS.default);
  const sz = (selected || crossHighlighted) ? 0.045 : 0.028;
  return (
    <mesh ref={ref} renderOrder={15}>
      <sphereGeometry args={[sz, 8, 8]} />
      <meshBasicMaterial color={color} depthTest={false} />
    </mesh>
  );
}

function BoneVisualizer({ characterEngine }) {
  const char = characterEngine?.characters?.find(
    (c) => c.id === characterEngine.selectedCharId,
  );

  const helper = useMemo(() => {
    if (!char?.bones.length) return null;
    char.scene.updateMatrixWorld(true);
    const h = new THREE.SkeletonHelper(char.scene);
    h.updateMatrixWorld(true);
    return h;
  }, [char]);

  const { selectedBoneId, boneMapping, charPrepTool, selectedMixamoJoint } = characterEngine;
  const showMappingColors = charPrepTool === 'mapbones';

  // Which model bone name is mapped to the currently selected Mixamo joint?
  const crossHighlightBoneName = showMappingColors && selectedMixamoJoint
    ? boneMapping[selectedMixamoJoint]?.sourceName || null
    : null;

  // Y position for the model label in mapbones mode
  const labelY = useMemo(() => {
    if (!char || !showMappingColors) return null;
    const box = new THREE.Box3().setFromObject(char.scene);
    return box.max.y + 0.15;
  }, [char, showMappingColors]);

  if (!char || !char.bones.length) return null;

  return (
    <group>
      {helper && <primitive object={helper} />}
      {showMappingColors && labelY !== null && (
        <Html position={[0, labelY, 0]} center style={{ pointerEvents: 'none' }}>
          <div style={{
            color: '#333', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
            background: 'rgba(255,255,255,0.88)', padding: '2px 8px', borderRadius: 3,
            boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
          }}>
            {char.name.replace(/\.gl[bt]f?$/i, '')}
          </div>
        </Html>
      )}
      {char.bones.map((bone) => {
        let mappingStatus = null;
        let crossHighlighted = false;
        if (showMappingColors && boneMapping) {
          const entry = Object.values(boneMapping).find((e) => e.sourceName === bone.name);
          mappingStatus = entry?.status || 'unmapped';
          crossHighlighted = !!(crossHighlightBoneName && bone.name === crossHighlightBoneName);
        }
        return (
          <BoneSphere
            key={bone.id}
            boneObj={bone.object}
            selected={bone.id === selectedBoneId}
            mappingStatus={mappingStatus}
            crossHighlighted={crossHighlighted}
          />
        );
      })}
    </group>
  );
}

// ─── reference skeleton visualizer (mapbones mode) ────────────────────────────

function RefBoneSphere({ posM, selected, status, crossHighlighted, onSelect }) {
  const color = selected ? '#ff7722'
    : crossHighlighted ? '#44aaff'
    : (BONE_STATUS_COLORS[status] || BONE_STATUS_COLORS.default);
  const sz = (selected || crossHighlighted) ? 0.045 : 0.028;
  return (
    <mesh position={posM} onClick={(e) => { e.stopPropagation(); onSelect(); }} renderOrder={15}>
      <sphereGeometry args={[sz, 8, 8]} />
      <meshBasicMaterial color={color} depthTest={false} />
    </mesh>
  );
}

function RefSkeletonVisualizer({ characterEngine }) {
  const {
    boneMapping, selectedMixamoJoint, setSelectedMixamoJoint,
    selectedBoneId, characters, selectedCharId,
  } = characterEngine;

  // Name of the currently selected model bone (for cross-highlighting)
  const selectedBoneName = useMemo(() => {
    const char = characters.find((c) => c.id === selectedCharId);
    return char?.bones.find((b) => b.id === selectedBoneId)?.name || null;
  }, [selectedBoneId, characters, selectedCharId]);

  // Scale ref skeleton to match the loaded model's height; place it to the left with a gap
  const { displayScale, xOffset, yOffset } = useMemo(() => {
    const char = characters.find((c) => c.id === selectedCharId);
    if (!char) return { displayScale: 1, xOffset: -2, yOffset: 0 };
    const box = new THREE.Box3().setFromObject(char.scene);
    if (box.isEmpty()) return { displayScale: 1, xOffset: -2, yOffset: 0 };
    const modelHeight = Math.max(box.max.y - box.min.y, 0.01);
    // REF_JOINT_POS_CM head is at 154 cm = 1.54 m native scale
    const refNativeHeightM = 1.54;
    const s = modelHeight / refNativeHeightM;
    // Rightmost ref point is right-hand fingers at 83 cm = 0.83 m (native).
    // After scaling by s, that becomes 0.83*s. Add a 0.3*s proportional gap.
    const x = box.min.x - 0.83 * s - 0.3 * s;
    return { displayScale: s, xOffset: x, yOffset: box.min.y };
  }, [characters, selectedCharId]);

  return (
    <group position={[xOffset, yOffset, 0]} scale={[displayScale, displayScale, displayScale]}>
      <Html position={[0, 1.68, 0]} center style={{ pointerEvents: 'none' }}>
        <div style={{
          color: '#333', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
          background: 'rgba(255,255,255,0.88)', padding: '2px 8px', borderRadius: 3,
          boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
        }}>
          Mixamo Reference
        </div>
      </Html>

      {REF_SKELETON_EDGES.map(([p, c]) => {
        const a = REF_JOINT_POS_CM[p];
        const b = REF_JOINT_POS_CM[c];
        if (!a || !b) return null;
        return (
          <Line
            key={`${p}-${c}`}
            points={[[a[0]/100, a[1]/100, a[2]/100], [b[0]/100, b[1]/100, b[2]/100]]}
            color="#888"
            lineWidth={2}
          />
        );
      })}

      {MIXAMO_JOINTS.map((joint) => {
        const cm = REF_JOINT_POS_CM[joint];
        if (!cm) return null;
        const posM = [cm[0] / 100, cm[1] / 100, cm[2] / 100];
        const entry = boneMapping[joint];
        const status = entry?.status || 'unmapped';
        const selected = joint === selectedMixamoJoint;
        const crossHighlighted = !selected && !!selectedBoneName && entry?.sourceName === selectedBoneName;
        return (
          <RefBoneSphere
            key={joint}
            posM={posM}
            selected={selected}
            status={status}
            crossHighlighted={crossHighlighted}
            onSelect={() => setSelectedMixamoJoint(selected ? null : joint)}
          />
        );
      })}
    </group>
  );
}

// ─── main viewport ────────────────────────────────────────────────────────────

const CURSORS = {
  select: 'default',
  line: 'crosshair',
  rect: 'crosshair',
  circle: 'crosshair',
  eraser: 'cell',
  move: 'move',
  tape: 'crosshair',
  pushpull: 'ns-resize',
  orbit: 'grab',
};

const UP = [0, 1, 0];
const TICK = 0.08; // tick mark half-length in meters

function DimensionAnnotations({ annotations, units }) {
  if (!annotations || annotations.length === 0) return null;
  return (
    <>
      {annotations.map((ann) => {
        const { a, b } = ann;
        const mid = [
          (a[0] + b[0]) / 2,
          (a[1] + b[1]) / 2,
          (a[2] + b[2]) / 2,
        ];
        const dir = normalize(sub(b, a));
        // perp tick direction: prefer Y-up perpendicular, fall back to X
        const perp = normalize(cross(dir, UP));
        const tickDir = (perp[0] === 0 && perp[1] === 0 && perp[2] === 0)
          ? normalize(cross(dir, [1, 0, 0]))
          : perp;
        const ta = scale(tickDir, TICK);
        const len = distance(a, b);

        return (
          <group key={ann.id}>
            <Line points={[a, b]} color="#1155cc" lineWidth={1} />
            <Line
              points={[
                [a[0] - ta[0], a[1] - ta[1], a[2] - ta[2]],
                [a[0] + ta[0], a[1] + ta[1], a[2] + ta[2]],
              ]}
              color="#1155cc" lineWidth={1.5}
            />
            <Line
              points={[
                [b[0] - ta[0], b[1] - ta[1], b[2] - ta[2]],
                [b[0] + ta[0], b[1] + ta[1], b[2] + ta[2]],
              ]}
              color="#1155cc" lineWidth={1.5}
            />
            <Html position={mid} center style={{ pointerEvents: 'none' }}>
              <div className="sk-dim-label">{formatLength(len, units)}</div>
            </Html>
          </group>
        );
      })}
    </>
  );
}

const PLANE_CONFIG = {
  xy: { rotation: [-Math.PI / 2, 0, 0], color: AXIS_COLORS.y },  // horizontal (Y-up)
  xz: { rotation: [0, 0, 0],            color: AXIS_COLORS.z },  // facing Z
  yz: { rotation: [0, Math.PI / 2, 0],  color: AXIS_COLORS.x },  // facing X
};
const PLANE_SIZE = 50;

function RefPlanes({ refPlanes }) {
  if (!refPlanes || refPlanes.length === 0) return null;
  return (
    <>
      {refPlanes.map(({ id, axis }) => {
        const cfg = PLANE_CONFIG[axis];
        if (!cfg) return null;
        return (
          <mesh key={id} rotation={cfg.rotation}>
            <planeGeometry args={[PLANE_SIZE, PLANE_SIZE]} />
            <meshBasicMaterial
              color={cfg.color}
              transparent
              opacity={0.08}
              side={2}
              depthWrite={false}
            />
          </mesh>
        );
      })}
    </>
  );
}

function GuideLines({ guides }) {
  if (!guides || guides.length === 0) return null;
  return (
    <>
      {guides.map((g) => (
        <Line
          key={g.id}
          points={[g.a, g.b]}
          color="#f5a623"
          lineWidth={1}
          dashed
          dashSize={0.12}
          gapSize={0.06}
        />
      ))}
    </>
  );
}

export default function Viewport({
  model,
  version,
  activeTool,
  selection,
  inference,
  preview,
  hoveredFaceId,
  measurement,
  selectionCentroid,
  guides,
  annotations,
  units,
  refPlanes,
  onPointerRay,
  onClick,
  onDoubleClick,
  onBoxSelect,
  onGizmoAxisClick,
  appMode,
  characterEngine,
}) {
  // Canvas container ref for bounding-rect lookups
  const canvasRef = useRef(null);

  // Cursor position (canvas-relative) for floating label
  const [cursorPos, setCursorPos] = useState(null);

  // Box drag state for selection box overlay
  const [boxDrag, setBoxDrag] = useState(null);

  // Gizmo hover/interaction state
  const [hoveredGizmoAxis, setHoveredGizmoAxis] = useState(null);
  const gizmoMeshesRef = useRef([]); // [{mesh: THREE.Mesh, axis}] — updated by SelectionGizmo

  const handleMouseMove = useCallback((e) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) setCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setCursorPos(null);
    setHoveredGizmoAxis(null);
  }, []);

  // Derived box style
  const boxDirection = boxDrag ? (boxDrag.x2 >= boxDrag.x1 ? 'window' : 'crossing') : null;

  // Should cursor label show?
  const showInferenceLabel = inference && INFERENCE_LABELS[inference.type];
  const showCursorLabel = cursorPos && (measurement || showInferenceLabel);

  // Cursor override when hovering a gizmo axis
  const cursor = hoveredGizmoAxis
    ? 'pointer'
    : (CURSORS[activeTool] || 'default');

  return (
    <div
      className="sk-canvas"
      ref={canvasRef}
      style={{ cursor }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <Canvas
        gl={{ antialias: true }}
        dpr={[1, 2]}
        camera={{ position: [9, 7, 9], fov: 50, near: 0.01, far: 10000 }}
      >
        <OrbitControls
          makeDefault
          enableDamping={false}
          mouseButtons={{
            LEFT: activeTool === 'orbit' ? THREE.MOUSE.ROTATE : undefined,
            MIDDLE: THREE.MOUSE.ROTATE,
            RIGHT: THREE.MOUSE.PAN,
          }}
        />
        <color attach="background" args={['#f2f1ee']} />
        <ambientLight intensity={1.1} />
        <directionalLight position={[6, 12, 6]} intensity={1.4} />
        <directionalLight position={[-6, 4, -8]} intensity={0.5} />

        <Grid />
        <PointerRig
          onRay={appMode === 'character' ? () => {} : onPointerRay}
          onClick={appMode === 'character'
            ? (ray, radius) => characterEngine?.onCharacterClick(ray, radius)
            : onClick}
          onDoubleClick={appMode === 'character' ? () => {} : onDoubleClick}
          onBoxSelect={appMode === 'character' ? () => {} : onBoxSelect}
          onBoxDrag={setBoxDrag}
          enableBoxSelect={appMode !== 'character' && activeTool === 'select'}
          gizmoMeshesRef={gizmoMeshesRef}
          onGizmoHover={setHoveredGizmoAxis}
          onGizmoClick={appMode === 'character' ? () => {} : onGizmoAxisClick}
        />
        <ModelRender
          model={model}
          version={version}
          selection={selection}
          hoveredFaceId={hoveredFaceId}
        />
        {appMode === 'character' && characterEngine?.characters?.map((c) => (
          <primitive key={c.id} object={c.scene} />
        ))}
        {appMode === 'character' && <BoneVisualizer characterEngine={characterEngine} />}
        {appMode === 'character' && characterEngine?.charPrepTool === 'mapbones' && (
          <RefSkeletonVisualizer characterEngine={characterEngine} />
        )}
        <InferenceMarker inference={inference} />
        <PreviewOverlay preview={preview} />
        <GuideLines guides={guides} />
        <DimensionAnnotations annotations={annotations} units={units} />
        <RefPlanes refPlanes={refPlanes} />
        <SelectionGizmo
          centroid={selectionCentroid}
          activeTool={activeTool}
          gizmoMeshesRef={gizmoMeshesRef}
          hoveredAxis={hoveredGizmoAxis}
        />

        <GizmoHelper alignment="bottom-right" margin={[72, 72]}>
          <GizmoViewport
            axisColors={[AXIS_COLORS.x, AXIS_COLORS.y, AXIS_COLORS.z]}
            labelColor="black"
          />
        </GizmoHelper>
      </Canvas>

      {/* Selection box overlay */}
      {boxDrag && (
        <div
          className={`sk-sel-box ${boxDirection}`}
          style={{
            left: Math.min(boxDrag.x1, boxDrag.x2),
            top: Math.min(boxDrag.y1, boxDrag.y2),
            width: Math.abs(boxDrag.x2 - boxDrag.x1),
            height: Math.abs(boxDrag.y2 - boxDrag.y1),
          }}
        />
      )}

      {/* Floating cursor label: measurement + inference type */}
      {showCursorLabel && (
        <div
          className="sk-cursor-label"
          style={{ left: cursorPos.x + 16, top: cursorPos.y + 6 }}
        >
          {measurement && (
            <div className="sk-cursor-measurement">{measurement}</div>
          )}
          {showInferenceLabel && (
            <div
              className="sk-cursor-inference"
              style={{ color: inferenceColor(inference) }}
            >
              {INFERENCE_LABELS[inference.type]}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
