import React, { useRef, useCallback, useMemo, useLayoutEffect } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, GizmoHelper, GizmoViewport, Line } from '@react-three/drei';
import * as THREE from 'three';
import { triangulateFace, computeNormal } from '../../services/geometryEngine';

// ─── Camera setup ─────────────────────────────────────────────
function CameraSetup() {
  const { camera } = useThree();
  useLayoutEffect(() => {
    camera.position.set(8, 6, 8);
    camera.lookAt(0, 0, 0);
    camera.near = 0.01;
    camera.far  = 10000;
    camera.updateProjectionMatrix();
  }, [camera]);
  return null;
}

// ─── SketchUp-style grid ─────────────────────────────────────
const GridMemo = React.memo(function SketchUpGrid() {
  const size = 50;
  const minor = [], major = [];
  for (let i = -size; i <= size; i++) {
    const isM = i % 5 === 0;
    const pts1 = [new THREE.Vector3(-size, 0, i), new THREE.Vector3(size, 0, i)];
    const pts2 = [new THREE.Vector3(i, 0, -size), new THREE.Vector3(i, 0, size)];
    if (isM) { major.push(pts1, pts2); } else { minor.push(pts1, pts2); }
  }
  return (
    <group position={[0, 0, 0]}>
      {minor.map((pts, i) => <Line key={`m${i}`} points={pts} color="#c8c8c0" lineWidth={0.4} />)}
      {major.map((pts, i) => <Line key={`M${i}`} points={pts} color="#a8a8a0" lineWidth={0.8} />)}
      {/* Axis lines */}
      <Line points={[[-size,0,0],[size,0,0]]} color="#cc3333" lineWidth={1.5} />
      <Line points={[[0,0,-size],[0,0,size]]} color="#339933" lineWidth={1.5} />
      <Line points={[[0,0,0],[0,size,0]]}     color="#3333cc" lineWidth={1.5} />
    </group>
  );
});

// ─── Ground plane (captures pointer, invisible) ───────────────
function GroundPlane({ onMove, onDown, drawingActive }) {
  const { raycaster } = useThree();
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const hit   = useMemo(() => new THREE.Vector3(), []);

  const getPoint = () => {
    raycaster.ray.intersectPlane(plane, hit);
    return hit.clone();
  };

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      onPointerMove={(e) => { e.stopPropagation(); onMove(getPoint(), e); }}
      onPointerDown={(e) => { if (drawingActive) e.stopPropagation(); onDown(getPoint()); }}
      visible={false}
      renderOrder={-1}
    >
      <planeGeometry args={[1000, 1000]} />
      <meshBasicMaterial side={THREE.DoubleSide} />
    </mesh>
  );
}

// ─── Face mesh renderer ───────────────────────────────────────
function FaceMesh({ face, scene, isSelected, isHovered, onHover, onDown, activeTool }) {
  const positions = useMemo(() => {
    return face.vertices
      .map(id => scene.vertices[id])
      .filter(Boolean)
      .map(v => new THREE.Vector3(v.x, v.y, v.z));
  }, [face, scene]);

  const geometry = useMemo(() => {
    if (positions.length < 3) return null;
    const arr = triangulateFace(positions);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    geo.computeVertexNormals();
    return geo;
  }, [positions]);

  if (!geometry) return null;

  const isPushPull = activeTool === 'pushpull';
  const color = isHovered && isPushPull ? '#b0d0f0'
              : isSelected              ? '#a8c8e8'
              : face.color              || '#d8d8c8';
  const opacity = isHovered && isPushPull ? 0.85 : 0.7;

  return (
    <mesh
      geometry={geometry}
      onPointerOver={(e) => { e.stopPropagation(); onHover(face.id); }}
      onPointerOut={(e) => { e.stopPropagation(); onHover(null); }}
      onPointerDown={(e) => {
        if (isPushPull) { e.stopPropagation(); onDown(face.id); }
      }}
    >
      <meshStandardMaterial
        color={color}
        transparent
        opacity={opacity}
        side={THREE.DoubleSide}
        roughness={0.8}
      />
    </mesh>
  );
}

// ─── All edges ────────────────────────────────────────────────
function EdgeRenderer({ scene, selectedIds }) {
  return (
    <>
      {Object.values(scene.edges).map(e => {
        const v1 = scene.vertices[e.v1];
        const v2 = scene.vertices[e.v2];
        if (!v1 || !v2) return null;
        const sel = selectedIds.has(e.id);
        return (
          <Line
            key={e.id}
            points={[new THREE.Vector3(v1.x, v1.y, v1.z), new THREE.Vector3(v2.x, v2.y, v2.z)]}
            color={sel ? '#1a9fdc' : '#1a1a1a'}
            lineWidth={sel ? 3 : 2}
          />
        );
      })}
    </>
  );
}

// ─── All vertices ─────────────────────────────────────────────
function VertexDots({ scene, selectedIds }) {
  return (
    <>
      {Object.values(scene.vertices).map(v => {
        const sel = selectedIds.has(v.id);
        return (
          <mesh key={v.id} position={[v.x, v.y, v.z]}>
            <sphereGeometry args={[sel ? 0.065 : 0.045, 6, 6]} />
            <meshBasicMaterial color={sel ? '#1a9fdc' : '#555555'} />
          </mesh>
        );
      })}
    </>
  );
}

// ─── Ghost line while drawing ─────────────────────────────────
function GhostLine({ start, end }) {
  if (!start || !end) return null;
  return (
    <Line
      points={[start, end]}
      color="#1a9fdc"
      lineWidth={1.5}
      dashed
      dashSize={0.18}
      gapSize={0.08}
    />
  );
}

// ─── Inference snap marker ────────────────────────────────────
function InferenceMarker({ inference }) {
  if (!inference || inference.type === 'free' || inference.type === 'grid') return null;
  const color = inference.type === 'endpoint' ? '#00bb00' : '#2255dd';
  return (
    <mesh position={inference.point} renderOrder={10}>
      <sphereGeometry args={[0.07, 8, 8]} />
      <meshBasicMaterial color={color} depthTest={false} />
    </mesh>
  );
}

// ─── Push/Pull live preview line ───────────────────────────────
function PushPullPreview({ face, depth, scene }) {
  if (!face || depth === null) return null;
  const normal = new THREE.Vector3(face.normal.x, face.normal.y, face.normal.z);
  const positions = face.vertices
    .map(id => scene.vertices[id])
    .filter(Boolean)
    .map(v => new THREE.Vector3(v.x, v.y, v.z));
  if (positions.length < 2) return null;

  // Draw offset edges as preview
  const offset = normal.clone().multiplyScalar(depth);
  return (
    <>
      {positions.map((p, i) => {
        const p2 = positions[(i + 1) % positions.length];
        const tp = p.clone().add(offset);
        const tp2 = p2.clone().add(offset);
        return (
          <React.Fragment key={i}>
            <Line points={[tp, tp2]} color="#1a9fdc" lineWidth={1.5} dashed dashSize={0.1} gapSize={0.05} />
            <Line points={[p, tp]} color="#1a9fdc" lineWidth={1} dashed dashSize={0.1} gapSize={0.05} />
          </React.Fragment>
        );
      })}
    </>
  );
}

// ─── Orbit controls — middle mouse always works ───────────────
function SmartOrbitControls({ activeTool }) {
  return (
    <OrbitControls
      makeDefault
      enableDamping={false}
      mouseButtons={{
        LEFT:   activeTool === 'select' ? THREE.MOUSE.ROTATE : undefined,
        MIDDLE: THREE.MOUSE.ROTATE,
        RIGHT:  THREE.MOUSE.PAN,
      }}
      touches={{
        ONE:  THREE.TOUCH.ROTATE,
        TWO:  THREE.TOUCH.DOLLY_PAN,
      }}
    />
  );
}

// ─── Main Viewport ────────────────────────────────────────────
export default function Viewport({
  scene,
  selectedIds,
  inference,
  lineStart,
  ghostEnd,
  activeTool,
  hoveredFaceId,
  pushPullDepth,
  onPointerMove,
  onPointerDown,
  onFaceHover,
  onFaceDown,
}) {
  const cursors = {
    select:   'default',
    line:     'crosshair',
    eraser:   'cell',
    move:     'move',
    tape:     'crosshair',
    pushpull: 'ns-resize',
  };

  const drawingActive = activeTool !== 'select';
  const hoveredFace = hoveredFaceId ? scene.faces[hoveredFaceId] : null;

  return (
    <div className="sk-canvas" style={{ cursor: cursors[activeTool] || 'default' }}>
      <Canvas
        shadows={false}
        gl={{ antialias: true }}
        dpr={[1, 2]}
        frameloop="demand"
        onPointerMissed={() => {}}
      >
        <CameraSetup />
        <SmartOrbitControls activeTool={activeTool} />
        <color attach="background" args={['#f0efed']} />

        <ambientLight intensity={1.6} />
        <directionalLight position={[5, 10, 5]} intensity={1.2} />

        <GridMemo />

        {/* Ground plane for drawing */}
        <GroundPlane
          onMove={(pt, e) => onPointerMove(pt, scene)}
          onDown={(pt)    => onPointerDown(pt, scene)}
          drawingActive={drawingActive}
        />

        {/* Faces (with fill) */}
        {Object.values(scene.faces).map(face => (
          <FaceMesh
            key={face.id}
            face={face}
            scene={scene}
            isSelected={selectedIds.has(face.id)}
            isHovered={hoveredFaceId === face.id}
            onHover={onFaceHover}
            onDown={onFaceDown}
            activeTool={activeTool}
          />
        ))}

        {/* Edges */}
        <EdgeRenderer scene={scene} selectedIds={selectedIds} />

        {/* Vertex dots */}
        <VertexDots scene={scene} selectedIds={selectedIds} />

        {/* Drawing helpers */}
        <InferenceMarker inference={inference} />
        <GhostLine start={lineStart} end={ghostEnd} />

        {/* Push/Pull preview */}
        {hoveredFace && (
          <PushPullPreview
            face={hoveredFace}
            depth={pushPullDepth ?? 0}
            scene={scene}
          />
        )}

        <GizmoHelper alignment="bottom-right" margin={[72, 72]}>
          <GizmoViewport axisColors={['#cc3333', '#339933', '#3333cc']} labelColor="black" />
        </GizmoHelper>
      </Canvas>
    </div>
  );
}
