import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, GizmoHelper, GizmoViewport } from '@react-three/drei';
import { Send, Hexagon, Check, X, BoxSelect, Trash2, Settings, Cpu } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { PROVIDERS, callAI } from './services/aiService';
import { getGeometryFromTool } from './services/geometryEngine';
import './index.css';

// 3D Object Component
const SceneObject = ({ obj, isGhost = false }) => {
  const meshRef = useRef();

  const extrudeSettings = useMemo(() => ({
    steps: 1,
    depth: obj.thickness || 0.1,
    bevelEnabled: !obj.operation, // No bevel for holes to keep them crisp
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 3
  }), [obj.thickness, obj.operation]);

  return (
    <group position={obj.position}>
      <mesh ref={meshRef} scale={isGhost ? 1.05 : 1} rotation={[-Math.PI/2, 0, 0]}>
        {obj.type === 'box' && <boxGeometry args={obj.size} />}
        {obj.type === 'sphere' && <sphereGeometry args={[obj.size || 0.5, 32, 32]} />}
        {obj.type === 'custom' && <extrudeGeometry args={[obj.shape, extrudeSettings]} />}
        
        <meshStandardMaterial 
          color={obj.operation === 'subtract' ? '#050505' : obj.color} 
          transparent={isGhost || obj.operation === 'subtract'}
          opacity={isGhost ? 0.5 : (obj.operation === 'subtract' ? 0.9 : 1)}
          wireframe={isGhost}
          roughness={0.2}
          metalness={0.1}
          emissive={obj.operation === 'subtract' ? '#000000' : '#000000'}
        />
      </mesh>
    </group>
  );
};

export default function App() {
  const [sceneObjects, setSceneObjects] = useState([]);
  const [ghostObject, setGhostObject] = useState(null);
  const [chatHistory, setChatHistory] = useState([
    { id: 1, role: 'ai', text: "Ready for Core Six CAD. I can now 'see' your scene. Try creating a plate, then ask me to put a hole in it!" }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [aiConfig, setAiConfig] = useState(() => {
    const saved = localStorage.getItem('ai_config');
    return saved ? JSON.parse(saved) : {
      provider: PROVIDERS.OPENAI,
      apiKey: '',
      baseUrl: '',
      model: 'gpt-4o'
    };
  });

  useEffect(() => {
    localStorage.setItem('ai_config', JSON.stringify(aiConfig));
  }, [aiConfig]);

  // --- CONTEXT FEEDBACK LOOP: Serialize Scene for AI ---
  const getSceneContext = () => {
    if (sceneObjects.length === 0) return "The scene is currently empty.";
    return sceneObjects.map(obj => (
      `- ID: ${obj.id}, Type: ${obj.type}, Label: ${obj.label}, Pos: [${obj.position.join(',')}], Dims: ${JSON.stringify(obj.size || obj.thickness)}`
    )).join('\n');
  };

  const handleSend = async () => {
    if (!inputValue.trim()) return;

    if (!aiConfig.apiKey && aiConfig.provider !== PROVIDERS.OLLAMA && aiConfig.provider !== PROVIDERS.LMSTUDIO) {
      alert('Please set your API key in Settings first.');
      setIsSettingsOpen(true);
      return;
    }

    const userMsg = { id: Date.now(), role: 'user', text: inputValue };
    setChatHistory(prev => [...prev, userMsg]);
    setInputValue('');
    setIsLoading(true);

    try {
      // Pass the serialized scene context to the AI
      const sceneContext = getSceneContext();
      const toolCall = await callAI(aiConfig.provider, aiConfig, inputValue, sceneContext);
      
      const suggestion = getGeometryFromTool(toolCall, sceneObjects);
      if (!suggestion) throw new Error("AI returned an invalid tool call.");
      
      const suggestionWithId = { ...suggestion, id: `obj_${uuidv4().slice(0,8)}` };
      
      setGhostObject(suggestionWithId);
      setChatHistory(prev => [...prev, {
        id: Date.now() + 1,
        role: 'ai',
        text: `Command interpreted: ${toolCall.tool}. Look at the preview.`,
        suggestion: suggestionWithId
      }]);
    } catch (error) {
      console.error(error);
      setChatHistory(prev => [...prev, {
        id: Date.now() + 1,
        role: 'ai',
        text: `Error: ${error.message}`
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAccept = (suggestion) => {
    if (suggestion.type === 'pattern_group') {
      setSceneObjects(prev => [...prev, ...suggestion.clones]);
    } else {
      setSceneObjects(prev => [...prev, suggestion]);
    }
    setGhostObject(null);
    setChatHistory(prev => [...prev, {
      id: Date.now(), role: 'ai', text: 'Action confirmed. What is next?'
    }]);
  };

  const handleReject = () => {
    setGhostObject(null);
    setChatHistory(prev => [...prev, {
      id: Date.now(), role: 'ai', text: 'Action discarded.'
    }]);
  };

  return (
    <div className="app-container">
      <div className="sidebar glass">
        <div className="sidebar-header">
          <Hexagon size={24} color="var(--color-accent)" />
          <h1>Antigravity CAD</h1>
          <button className="btn btn-icon" style={{ marginLeft: 'auto' }} onClick={() => setIsSettingsOpen(true)}>
            <Settings size={18} />
          </button>
        </div>
        
        <div className="chat-container">
          {chatHistory.map((msg) => (
            <div key={msg.id} className={`chat-message ${msg.role}`}>
              <div className="message-bubble">{msg.text}</div>
              {msg.suggestion && ghostObject?.id === msg.suggestion.id && (
                <div className="ai-suggestion-card">
                  <div className="suggestion-actions">
                    <button className="btn btn-success" onClick={() => handleAccept(msg.suggestion)}><Check size={16} /> Accept</button>
                    <button className="btn btn-danger" onClick={handleReject}><X size={16} /> Reject</button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {isLoading && <div className="chat-message ai"><div className="message-bubble">Analyzing Context...</div></div>}
        </div>

        <div className="chat-input-area">
          <input type="text" className="input-field" placeholder="e.g. Put a hole in the plate" value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} disabled={isLoading} />
          <button className="btn btn-primary" onClick={handleSend} disabled={isLoading}><Send size={18} /></button>
        </div>
      </div>

      <div className="main-canvas-area">
        <div className="top-toolbar glass">
          <button className="btn btn-icon" title="Clear" onClick={() => setSceneObjects([])}><Trash2 size={18} /></button>
        </div>

        <Canvas camera={{ position: [5, 5, 5], fov: 50 }}>
          <color attach="background" args={['#0a0a0c']} />
          <ambientLight intensity={0.5} />
          <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
          <Environment preset="city" />
          <Grid infiniteGrid fadeDistance={30} sectionColor="#202024" cellColor="#141416" position={[0, 0, 0]} />
          
          {sceneObjects.map(obj => <SceneObject key={obj.id} obj={obj} />)}
          {ghostObject && (
            ghostObject.type === 'pattern_group' 
              ? ghostObject.clones.map(c => <SceneObject key={c.id} obj={c} isGhost={true} />)
              : <SceneObject obj={ghostObject} isGhost={true} />
          )}

          <OrbitControls makeDefault />
          <GizmoHelper alignment="bottom-right" margin={[80, 80]}><GizmoViewport axisColors={['#ef4444', '#10b981', '#3b82f6']} labelColor="white" /></GizmoHelper>
        </Canvas>
      </div>

      {isSettingsOpen && (
        <div className="modal-overlay" onClick={() => setIsSettingsOpen(false)}>
          <div className="modal-content glass" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2><Cpu size={20} /> AI Settings</h2>
              <button className="btn btn-icon" onClick={() => setIsSettingsOpen(false)}><X size={18} /></button>
            </div>
            <div className="form-group">
              <label>AI Provider</label>
              <select className="select-field" value={aiConfig.provider} onChange={(e) => setAiConfig({ ...aiConfig, provider: e.target.value })}>
                <option value={PROVIDERS.OPENAI}>OpenAI</option>
                <option value={PROVIDERS.ANTHROPIC}>Anthropic</option>
                <option value={PROVIDERS.OLLAMA}>Ollama</option>
              </select>
            </div>
            {(aiConfig.provider !== PROVIDERS.OLLAMA) && (
              <div className="form-group">
                <label>API Key</label>
                <input type="password" className="input-field" placeholder="sk-..." value={aiConfig.apiKey} onChange={(e) => setAiConfig({ ...aiConfig, apiKey: e.target.value })} />
              </div>
            )}
            <div className="form-group">
              <label>Model Name</label>
              <input type="text" className="input-field" placeholder="gpt-4o" value={aiConfig.model} onChange={(e) => setAiConfig({ ...aiConfig, model: e.target.value })} />
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setIsSettingsOpen(false)}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
