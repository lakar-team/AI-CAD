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
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, GizmoHelper, GizmoViewport, Line } from '@react-three/drei';
import * as THREE from 'three';
import { triangulateLoop } from '../../core/triangulate.js';
import { add, scale, multiplyM4, identityM4, transformPoint } from '../../core/math3.js';
import { AXIS_COLORS } from '../../core/inference.js';

const SNAP_PIXELS = 9;

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

// ─── pointer → world ray + box drag detection ─────────────────────────────────
function PointerRig({ onRay, onClick, onDoubleClick, onBoxSelect, onBoxDrag, enableBoxSelect }) {
  const { gl, camera, size } = useThree();

  // All callbacks in a ref so the single DOM-listener effect never re-runs
  const h = useRef({});
  h.current = { onRay, onClick, onDoubleClick, onBoxSelect, onBoxDrag, enableBoxSelect, camera, size };

  useEffect(() => {
    const el = gl.domElement;
    const down = { x: 0, y: 0, moved: false, dragging: false };
    const raycaster = new THREE.Raycaster();
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

    // Snapshot the camera projection at the moment of release for box-select
    const makeProject = () => {
      const { camera: cam, size: sz } = h.current;
      return (worldPt) => {
        const v = new THREE.Vector3(worldPt[0], worldPt[1], worldPt[2]);
        v.project(cam);
        if (v.z > 1) return null; // behind near plane
        return { x: (v.x + 1) / 2 * sz.width, y: (1 - v.y) / 2 * sz.height };
      };
    };

    const onPointerMove = (ev) => {
      if (ev.buttons & 6) return; // middle/right = orbit/pan
      const dx = ev.clientX - down.x;
      const dy = ev.clientY - down.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) down.moved = true;

      // Box drag: left button held + significant move + select tool
      if (ev.buttons === 1 && down.moved && h.current.enableBoxSelect) {
        if (!down.dragging) down.dragging = true;
        const rect = el.getBoundingClientRect();
        h.current.onBoxDrag?.({
          x1: down.x - rect.left,
          y1: down.y - rect.top,
          x2: ev.clientX - rect.left,
          y2: ev.clientY - rect.top,
        });
        return; // suppress onRay while box-dragging
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
        h.current.onBoxDrag?.(null); // clear overlay
        down.dragging = false;
        return;
      }
      if (down.moved) return;
      const { ray, radius } = makeRay(ev);
      h.current.onClick(ray, radius, { shift: ev.shiftKey });
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

function SelectionGizmo({ centroid, activeTool }) {
  if (!centroid || activeTool !== 'select') return null;
  const S = 0.7; // arrow length in world units
  return (
    <group position={centroid}>
      <Line points={[[0, 0, 0], [S, 0, 0]]} color={AXIS_COLORS.x} lineWidth={2.5} />
      <Line points={[[0, 0, 0], [0, S, 0]]} color={AXIS_COLORS.y} lineWidth={2.5} />
      <Line points={[[0, 0, 0], [0, 0, S]]} color={AXIS_COLORS.z} lineWidth={2.5} />
      {/* Arrowhead dots */}
      <mesh position={[S, 0, 0]} renderOrder={25}>
        <sphereGeometry args={[0.055, 8, 8]} />
        <meshBasicMaterial color={AXIS_COLORS.x} depthTest={false} />
      </mesh>
      <mesh position={[0, S, 0]} renderOrder={25}>
        <sphereGeometry args={[0.055, 8, 8]} />
        <meshBasicMaterial color={AXIS_COLORS.y} depthTest={false} />
      </mesh>
      <mesh position={[0, 0, S]} renderOrder={25}>
        <sphereGeometry args={[0.055, 8, 8]} />
        <meshBasicMaterial color={AXIS_COLORS.z} depthTest={false} />
      </mesh>
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
  onPointerRay,
  onClick,
  onDoubleClick,
  onBoxSelect,
}) {
  // Canvas container ref for bounding-rect lookups
  const canvasRef = useRef(null);

  // Cursor position (canvas-relative) for floating label
  const [cursorPos, setCursorPos] = useState(null);

  // Box drag state for selection box overlay
  const [boxDrag, setBoxDrag] = useState(null);

  const handleMouseMove = useCallback((e) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) setCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setCursorPos(null);
  }, []);

  // Derived box style
  const boxDirection = boxDrag ? (boxDrag.x2 >= boxDrag.x1 ? 'window' : 'crossing') : null;

  // Should cursor label show?
  const showInferenceLabel = inference && INFERENCE_LABELS[inference.type];
  const showCursorLabel = cursorPos && (measurement || showInferenceLabel);

  return (
    <div
      className="sk-canvas"
      ref={canvasRef}
      style={{ cursor: CURSORS[activeTool] || 'default' }}
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
          onRay={onPointerRay}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
          onBoxSelect={onBoxSelect}
          onBoxDrag={setBoxDrag}
          enableBoxSelect={activeTool === 'select'}
        />
        <ModelRender
          model={model}
          version={version}
          selection={selection}
          hoveredFaceId={hoveredFaceId}
        />
        <InferenceMarker inference={inference} />
        <PreviewOverlay preview={preview} />
        <SelectionGizmo centroid={selectionCentroid} activeTool={activeTool} />

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
