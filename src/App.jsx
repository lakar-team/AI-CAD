import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, GizmoHelper, GizmoViewport, TransformControls, ContactShadows, PerspectiveCamera } from '@react-three/drei';
import { Send, Hexagon, Check, X, BoxSelect, Trash2, Settings, Cpu, Download, Upload, Box, MousePointer2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter';

import { PROVIDERS, callAI } from './services/aiService';
import { getGeometryFromTool } from './services/geometryEngine';
import './index.css';

// Scale Helper: A 1.8m "Human" reference
const ScaleReference = () => (
  <group position={[-2, 0, -2]}>
    <mesh position={[0, 0.9, 0]}>
      <capsuleGeometry args={[0.2, 1.4, 4, 8]} />
      <meshBasicMaterial color="#3b82f6" transparent opacity={0.3} />
    </mesh>
    <mesh position={[0, 0, 0]} rotation={[-Math.PI/2, 0, 0]}>
      <ringGeometry args={[0, 0.3, 32]} />
      <meshBasicMaterial color="#3b82f6" transparent opacity={0.5} />
    </mesh>
  </group>
);

// 3D Object Component
const SceneObject = ({ obj, isGhost = false, onSelect, isSelected }) => {
  const meshRef = useRef();

  const extrudeSettings = useMemo(() => ({
    steps: 1,
    depth: obj.thickness || 0.1,
    bevelEnabled: !obj.operation,
    bevelThickness: 0.01,
    bevelSize: 0.01,
    bevelSegments: 2
  }), [obj.thickness, obj.operation]);

  return (
    <group 
      position={obj.position} 
      onClick={(e) => {
        e.stopPropagation();
        onSelect(obj.id);
      }}
    >
      <mesh ref={meshRef} scale={isGhost ? 1.02 : 1} rotation={[-Math.PI/2, 0, 0]}>
        {obj.type === 'box' && <boxGeometry args={obj.size} />}
        {obj.type === 'sphere' && <sphereGeometry args={[obj.size || 0.5, 32, 32]} />}
        {obj.type === 'custom' && <extrudeGeometry args={[obj.shape, extrudeSettings]} />}
        
        <meshStandardMaterial 
          color={isSelected ? '#3b82f6' : (obj.operation === 'subtract' ? '#111' : obj.color)} 
          transparent={isGhost || obj.operation === 'subtract'}
          opacity={isGhost ? 0.4 : (obj.operation === 'subtract' ? 0.8 : 1)}
          roughness={0.7} // Matte SketchUp finish
          metalness={0.1}
          emissive={isSelected ? '#1e3a8a' : '#000000'}
        />
      </mesh>
    </group>
  );
};

const MainScene = ({ sceneObjects, ghostObject, selectedId, setSelectedId, onTransformEnd }) => {
  const { scene } = useThree();

  const selectedObject = useMemo(() => 
    sceneObjects.find(o => o.id === selectedId), 
    [sceneObjects, selectedId]
  );

  return (
    <>
      {/* SketchUp-style Grid */}
      <Grid 
        infiniteGrid 
        fadeDistance={50} 
        sectionColor="#bbb" 
        cellColor="#ddd" 
        sectionSize={5}
        cellSize={1}
        position={[0, -0.001, 0]} 
      />
      
      {/* Grounded Shadows */}
      <ContactShadows 
        position={[0, 0, 0]} 
        opacity={0.4} 
        scale={20} 
        blur={2} 
        far={4.5} 
      />

      <ScaleReference />
      
      {sceneObjects.map(obj => (
        <SceneObject 
          key={obj.id} 
          obj={obj} 
          onSelect={setSelectedId}
          isSelected={selectedId === obj.id}
        />
      ))}
      
      {ghostObject && (
        ghostObject.type === 'pattern_group' 
          ? ghostObject.clones.map(c => <SceneObject key={c.id} obj={c} isGhost={true} onSelect={()=>{}} />)
          : <SceneObject obj={ghostObject} isGhost={true} onSelect={()=>{}} />
      )}

      {selectedId && selectedObject && (
        <TransformControls 
          object={scene.children.find(c => c.type === 'Group' && c.children[0]?.type === 'Mesh' && c.position.equals(new THREE.Vector3(...selectedObject.position)))}
          mode="translate"
          onMouseUp={(e) => {
            const meshGroup = e.target.object;
            onTransformEnd(selectedId, [meshGroup.position.x, meshGroup.position.y, meshGroup.position.z]);
          }}
        />
      )}

      <OrbitControls makeDefault minPolarAngle={0} maxPolarAngle={Math.PI / 1.75} />
    </>
  );
};

export default function App() {
  const [sceneObjects, setSceneObjects] = useState([]);
  const [ghostObject, setGhostObject] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [chatHistory, setChatHistory] = useState([
    { id: 1, role: 'ai', text: "Welcome to SketchUp AI mode. I'm using real-world meter scaling now. Notice the 1.8m reference silhouette!" }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [aiProfiles, setAiProfiles] = useState(() => {
    const saved = localStorage.getItem('ai_profiles');
    return saved ? JSON.parse(saved) : [
      { id: 'p1', name: 'GPT-4o (Main)', provider: PROVIDERS.OPENAI, apiKey: '', model: 'gpt-4o' }
    ];
  });
  const [activeProfileId, setActiveProfileId] = useState('p1');

  const activeProfile = useMemo(() => 
    aiProfiles.find(p => p.id === activeProfileId) || aiProfiles[0],
    [aiProfiles, activeProfileId]
  );

  const getSceneContext = () => {
    let context = "SCENE STATE (Units: Meters):\n";
    if (sceneObjects.length === 0) context += "Empty.";
    else {
      context += sceneObjects.map(obj => (
        `- ID: ${obj.id}, Type: ${obj.type}, Label: ${obj.label}, Pos: [${obj.position.map(p => p.toFixed(3)).join(',')}], Dims: ${JSON.stringify(obj.size || obj.thickness)}`
      )).join('\n');
    }
    if (selectedId) context += `\n\nUSER FOCUS: ID ${selectedId}.`;
    return context;
  };

  const handleSend = async () => {
    if (!inputValue.trim()) return;
    setChatHistory(prev => [...prev, { id: Date.now(), role: 'user', text: inputValue }]);
    setInputValue('');
    setIsLoading(true);

    try {
      const sceneContext = getSceneContext();
      const toolCall = await callAI(activeProfile.provider, activeProfile, inputValue, sceneContext);
      const suggestion = getGeometryFromTool(toolCall, sceneObjects);
      if (suggestion) {
        const suggestionWithId = { ...suggestion, id: `obj_${uuidv4().slice(0,8)}` };
        setGhostObject(suggestionWithId);
        setChatHistory(prev => [...prev, {
          id: Date.now() + 1,
          role: 'ai',
          text: `Suggested: ${toolCall.tool}. Scaling is in meters.`,
          suggestion: suggestionWithId
        }]);
      }
    } catch (error) {
      setChatHistory(prev => [...prev, { id: Date.now() + 1, role: 'ai', text: `Error: ${error.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const saveProject = () => {
    const data = JSON.stringify(sceneObjects);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cad_project.json`;
    link.click();
  };

  const loadProject = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => setSceneObjects(JSON.parse(e.target.result));
    reader.readAsText(file);
  };

  return (
    <div className="app-container">
      <div className="sidebar glass">
        <div className="sidebar-header">
          <Hexagon size={24} color="var(--color-accent)" />
          <h1>Antigravity CAD</h1>
          <button className="btn btn-icon" onClick={() => setIsSettingsOpen(true)}><Settings size={18} /></button>
        </div>
        <div className="chat-container">
          {chatHistory.map((msg) => (
            <div key={msg.id} className={`chat-message ${msg.role}`}>
              <div className="message-bubble">{msg.text}</div>
              {msg.suggestion && ghostObject?.id === msg.suggestion.id && (
                <div className="ai-suggestion-card">
                  <div className="suggestion-actions">
                    <button className="btn btn-success" onClick={() => {
                      if (msg.suggestion.type === 'pattern_group') setSceneObjects(p => [...p, ...msg.suggestion.clones]);
                      else setSceneObjects(p => [...p, msg.suggestion]);
                      setGhostObject(null);
                    }}><Check size={16} /> Accept</button>
                    <button className="btn btn-danger" onClick={() => setGhostObject(null)}><X size={16} /> Reject</button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {isLoading && <div className="chat-message ai"><div className="message-bubble">Calculating...</div></div>}
        </div>
        <div className="chat-footer">
          <select className="profile-select" value={activeProfileId} onChange={(e) => setActiveProfileId(e.target.value)}>
            {aiProfiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="chat-input-area">
            <input type="text" className="input-field" placeholder="e.g. Add a 2m wide table" value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} disabled={isLoading} />
            <button className="btn btn-primary" onClick={handleSend} disabled={isLoading}><Send size={18} /></button>
          </div>
        </div>
      </div>

      <div className="main-canvas-area" onClick={() => setSelectedId(null)}>
        <div className="top-toolbar glass">
          <div className="toolbar-group">
            <button className="btn btn-icon" title="Save" onClick={saveProject}><Download size={18} /></button>
            <label className="btn btn-icon" title="Load" style={{ cursor: 'pointer' }}><Upload size={18} /><input type="file" hidden onChange={loadProject} /></label>
            <button className="btn btn-icon" title="Export"><Box size={18} /></button>
          </div>
          <div className="toolbar-group">
            <button className={`btn btn-icon ${selectedId ? 'active' : ''}`} title="Selection Mode"><MousePointer2 size={18} /></button>
            <button className="btn btn-icon" title="Clear" onClick={() => setSceneObjects([])}><Trash2 size={18} /></button>
          </div>
        </div>

        <Canvas shadows dpr={[1, 2]}>
          <color attach="background" args={['#f3f4f6']} />
          <PerspectiveCamera makeDefault position={[5, 5, 5]} fov={45} />
          <ambientLight intensity={1.5} />
          <pointLight position={[10, 10, 10]} intensity={1.5} castShadow />
          <Environment preset="apartment" />
          
          <MainScene 
            sceneObjects={sceneObjects} 
            ghostObject={ghostObject} 
            selectedId={selectedId} 
            setSelectedId={setSelectedId}
            onTransformEnd={(id, newPos) => setSceneObjects(prev => prev.map(obj => obj.id === id ? { ...obj, position: newPos } : obj))}
          />

          <GizmoHelper alignment="bottom-right" margin={[80, 80]}><GizmoViewport axisColors={['#ef4444', '#10b981', '#3b82f6']} labelColor="black" /></GizmoHelper>
        </Canvas>
      </div>

      {isSettingsOpen && (
        <div className="modal-overlay" onClick={() => setIsSettingsOpen(false)}>
          <div className="modal-content glass" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2>AI Profiles</h2><button className="btn btn-icon" onClick={() => setIsSettingsOpen(false)}><X size={18} /></button></div>
            {aiProfiles.map((p, idx) => (
              <div key={p.id} className="ai-profile-edit">
                <input className="input-field" value={p.name} onChange={(e) => { const n = [...aiProfiles]; n[idx].name = e.target.value; setAiProfiles(n); }} />
                <input type="password" className="input-field" placeholder="API Key" value={p.apiKey} onChange={(e) => { const n = [...aiProfiles]; n[idx].apiKey = e.target.value; setAiProfiles(n); }} />
              </div>
            ))}
            <div className="modal-footer"><button className="btn btn-primary" onClick={() => setIsSettingsOpen(false)}>Save</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
