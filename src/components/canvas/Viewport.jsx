import React, { useRef, useCallback, useMemo } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, GizmoHelper, GizmoViewport, Line } from '@react-three/drei';
import * as THREE from 'three';

// ─── Ground plane that captures pointer events ──────────────
function GroundPlane({ onMove, onDown, activeTool }) {
  const { raycaster } = useThree();
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const hitPt = useMemo(() => new THREE.Vector3(), []);

  const getPlanePoint = useCallback(() => {
    raycaster.ray.intersectPlane(plane, hitPt);
    return hitPt.clone();
  }, [raycaster, plane, hitPt]);

  // Only block orbit when drawing
  const isDrawing = activeTool !== 'select';

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      onPointerMove={(e) => { e.stopPropagation(); onMove(getPlanePoint()); }}
      onPointerDown={(e) => { if (isDrawing) e.stopPropagation(); onDown(getPlanePoint()); }}
      visible={false}
    >
      <planeGeometry args={[500, 500]} />
      <meshBasicMaterial side={THREE.DoubleSide} />
    </mesh>
  );
}

// ─── SketchUp-style grid ─────────────────────────────────────
function SketchUpGrid() {
  const size = 100;
  const step = 1;
  const lines = [];

  for (let i = -size; i <= size; i += step) {
    const isSection = i % 5 === 0;
    const col = isSection ? '#bbbbbb' : '#d0d0d0';
    const w   = isSection ? 1 : 0.5;
    lines.push(
      <Line key={`x${i}`} points={[[-size, 0, i], [size, 0, i]]} color={col} lineWidth={w} />,
      <Line key={`z${i}`} points={[[i, 0, -size], [i, 0, size]]} color={col} lineWidth={w} />
    );
  }

  // Axis lines
  lines.push(
    <Line key="ax" points={[[-size, 0, 0], [size, 0, 0]]} color="#cc3333" lineWidth={1.5} />,
    <Line key="az" points={[[0, 0, -size], [0, 0, size]]} color="#336633" lineWidth={1.5} />,
    <Line key="ay" points={[[0, 0, 0], [0, size, 0]]}     color="#3333cc" lineWidth={1.5} />
  );

  return <group position={[0, 0.001, 0]}>{lines}</group>;
}

// ─── Renders all scene geometry ─────────────────────────────
function SceneGeometry({ scene, selectedIds }) {
  const edges = [];
  const vertices = [];

  // Render edges
  for (const e of Object.values(scene.edges)) {
    const v1 = scene.vertices[e.v1];
    const v2 = scene.vertices[e.v2];
    if (!v1 || !v2) continue;
    const isSelected = selectedIds.has(e.id);
    edges.push(
      <Line
        key={e.id}
        points={[
          new THREE.Vector3(v1.x, v1.y, v1.z),
          new THREE.Vector3(v2.x, v2.y, v2.z),
        ]}
        color={isSelected ? '#1a9fdc' : '#1a1a1a'}
        lineWidth={isSelected ? 3 : 2}
      />
    );
  }

  // Render vertex dots (small squares)
  for (const v of Object.values(scene.vertices)) {
    const isSelected = selectedIds.has(v.id);
    vertices.push(
      <mesh key={v.id} position={[v.x, v.y, v.z]}>
        <sphereGeometry args={[0.04, 6, 6]} />
        <meshBasicMaterial color={isSelected ? '#1a9fdc' : '#666666'} />
      </mesh>
    );
  }

  return <group>{edges}{vertices}</group>;
}

// ─── Inference marker ────────────────────────────────────────
function InferenceMarker({ inference }) {
  if (!inference || inference.type === 'free') return null;
  const colors = {
    endpoint: '#00aa00',
    midpoint: '#0000cc',
    grid:     null, // no marker for grid snap
  };
  const color = colors[inference.type];
  if (!color) return null;

  return (
    <mesh position={inference.point}>
      <sphereGeometry args={[0.07, 8, 8]} />
      <meshBasicMaterial color={color} depthTest={false} transparent opacity={0.85} />
    </mesh>
  );
}

// ─── Ghost line while drawing ────────────────────────────────
function GhostLine({ start, end }) {
  if (!start || !end) return null;
  return (
    <Line
      points={[start, end]}
      color="#1a9fdc"
      lineWidth={1.5}
      dashed
      dashSize={0.2}
      gapSize={0.1}
    />
  );
}

// ─── Orbit controls: disable when drawing ───────────────────
function AdaptiveOrbitControls({ activeTool }) {
  const enabled = activeTool === 'select' || activeTool === 'move';
  return (
    <OrbitControls
      makeDefault
      enableDamping={false}
      enabled={enabled}
      mouseButtons={{
        LEFT:   enabled ? THREE.MOUSE.ROTATE : undefined,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT:  THREE.MOUSE.PAN,
      }}
    />
  );
}

// ─── Main Viewport export ─────────────────────────────────────
export default function Viewport({
  scene,
  selectedIds,
  inference,
  lineStart,
  ghostEnd,
  activeTool,
  onPointerMove,
  onPointerDown,
}) {
  const cursorStyle = {
    select: 'default',
    line:   'crosshair',
    eraser: 'cell',
    move:   'move',
    tape:   'crosshair',
  }[activeTool] || 'default';

  return (
    <div className="sk-canvas" style={{ cursor: cursorStyle }}>
      <Canvas
        shadows={false}
        gl={{ antialias: true }}
        dpr={[1, 2]}
        frameloop="demand"
      >
        <PerspectiveCamera />
        <AdaptiveOrbitControls activeTool={activeTool} />
        <color attach="background" args={['#f0efed']} />

        <ambientLight intensity={1.5} />
        <directionalLight position={[5, 10, 5]} intensity={1.5} />

        <SketchUpGrid />

        <GroundPlane
          onMove={onPointerMove}
          onDown={onPointerDown}
          activeTool={activeTool}
        />

        <SceneGeometry scene={scene} selectedIds={selectedIds} />

        <InferenceMarker inference={inference} />

        <GhostLine start={lineStart} end={ghostEnd} />

        <GizmoHelper alignment="bottom-right" margin={[72, 72]}>
          <GizmoViewport
            axisColors={['#cc3333', '#339933', '#3333cc']}
            labelColor="black"
          />
        </GizmoHelper>
      </Canvas>
    </div>
  );
}

// ─── Camera that isn't a drei helper (avoids warning) ───────
function PerspectiveCamera() {
  const { camera } = useThree();
  React.useLayoutEffect(() => {
    camera.position.set(8, 6, 8);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera]);
  return null;
}
