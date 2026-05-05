import React, { useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, PerspectiveCamera, GizmoHelper, GizmoViewport, Line, Sphere } from '@react-three/drei';
import * as THREE from 'three';

const ModelRenderer = ({ model, selectedId }) => {
  const edges = [];
  for (const [id, edge] of model.edges) {
    const v1 = model.vertices.get(edge.v1);
    const v2 = model.vertices.get(edge.v2);
    if (v1 && v2) {
      edges.push(
        <Line 
          key={id} 
          points={[v1, v2]} 
          color={selectedId === id ? "#1a73e8" : "#000000"} 
          lineWidth={2} 
        />
      );
    }
  }

  // Render vertices for selection
  const vertices = [];
  for (const [id, v] of model.vertices) {
    vertices.push(
      <mesh key={id} position={v} onClick={(e) => e.stopPropagation()}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshBasicMaterial color={selectedId === id ? "#1a73e8" : "#666"} />
      </mesh>
    );
  }

  return (
    <group>
      {edges}
      {vertices}
    </group>
  );
};

const InferenceMarker = ({ inference }) => {
  if (!inference || inference.type === 'none') return null;
  
  const colors = {
    endpoint: '#34a853', // green
    midpoint: '#4285f4', // blue
    axis: '#ea4335'      // red
  };

  return (
    <Sphere position={inference.point} args={[0.08, 16, 16]}>
      <meshBasicMaterial color={colors[inference.type] || '#000'} depthTest={false} />
    </Sphere>
  );
};

const SceneEvents = ({ onMove, onDown }) => {
  const { raycaster, mouse, camera } = useThree();
  
  const handleMove = (e) => {
    // In a real CAD app, we project mouse to the ground plane or existing geometry
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const point = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, point);
    onMove(point);
  };

  return (
    <mesh 
      rotation={[-Math.PI / 2, 0, 0]} 
      onPointerMove={handleMove}
      onPointerDown={(e) => {
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const point = new THREE.Vector3();
        raycaster.ray.intersectPlane(plane, point);
        onDown(point);
      }}
      visible={false}
    >
      <planeGeometry args={[100, 100]} />
    </mesh>
  );
};

export default function Viewport({ model, selectedId, inference, lineStart, ghostLineEnd, onPointerMove, onPointerDown }) {
  return (
    <div className="viewport-container" style={{ cursor: 'crosshair' }}>
      <Canvas shadows gl={{ antialias: true }} dpr={[1, 2]}>
        <PerspectiveCamera makeDefault position={[5, 5, 5]} fov={45} />
        <OrbitControls makeDefault enableDamping={false} />
        <color attach="background" args={['#f0f0f0']} />
        
        <Grid
          infiniteGrid
          fadeDistance={50}
          sectionColor="#ccc"
          cellColor="#ddd"
          sectionSize={5}
          cellSize={1}
          position={[0, -0.001, 0]}
        />
        
        <ambientLight intensity={1.5} />
        <directionalLight position={[10, 10, 10]} intensity={2} />

        <SceneEvents onMove={onPointerMove} onDown={onPointerDown} />
        
        <ModelRenderer model={model} selectedId={selectedId} />
        
        <InferenceMarker inference={inference} />

        {lineStart && ghostLineEnd && (
          <Line points={[lineStart, ghostLineEnd]} color="#1a73e8" lineWidth={1} dashed />
        )}

        <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
          <GizmoViewport axisColors={['#ea4335', '#34a853', '#4285f4']} labelColor="black" />
        </GizmoHelper>
      </Canvas>
    </div>
  );
}
