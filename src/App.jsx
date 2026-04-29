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

  // If it's a custom shape (Gear, Slotted Plate), we extrude it
  const extrudeSettings = useMemo(() => ({
    steps: 1,
    depth: obj.thickness || 0.1,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 3
  }), [obj.thickness]);

  return (
    <group position={obj.position}>
      <mesh ref={meshRef} scale={isGhost ? 1.05 : 1} rotation={[-Math.PI/2, 0, 0]}>
        {obj.type === 'box' && <boxGeometry args={obj.size} />}
        {obj.type === 'sphere' && <sphereGeometry args={[obj.size || 0.5, 32, 32]} />}
        {obj.type === 'custom' && <extrudeGeometry args={[obj.shape, extrudeSettings]} />}
        
        <meshStandardMaterial 
          color={obj.color} 
          transparent={isGhost}
          opacity={isGhost ? 0.5 : 1}
          wireframe={isGhost}
          roughness={0.2}
          metalness={0.1}
        />
      </mesh>
    </group>
  );
};

export default function App() {
  const [sceneObjects, setSceneObjects] = useState([]);
  const [ghostObject, setGhostObject] = useState(null);
  const [chatHistory, setChatHistory] = useState([
    { id: 1, role: 'ai', text: "Hello! I'm your AI CAD Assistant. I now support Geometry Tools for accurate shape generation. Try asking for a '20 tooth gear'!" }
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
      // 1. Call AI to get Tool Call
      const toolCall = await callAI(aiConfig.provider, aiConfig, inputValue);
      
      // 2. Use Geometry Engine to process Tool Call
      const suggestion = getGeometryFromTool(toolCall);
      if (!suggestion) throw new Error("AI returned an invalid tool call.");
      
      const suggestionWithId = { ...suggestion, id: uuidv4() };
      
      setGhostObject(suggestionWithId);
      setChatHistory(prev => [...prev, {
        id: Date.now() + 1,
        role: 'ai',
        text: `I've used the '${toolCall.tool}' tool to generate your request. How does the preview look?`,
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
    setSceneObjects(prev => [...prev, suggestion]);
    setGhostObject(null);
    setChatHistory(prev => [...prev, {
      id: Date.now(), role: 'ai', text: 'Added to scene!'
    }]);
  };

  const handleReject = () => {
    setGhostObject(null);
    setChatHistory(prev => [...prev, {
      id: Date.now(), role: 'ai', text: 'Discarded.'
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
          {isLoading && <div className="chat-message ai"><div className="message-bubble">Calculating Geometry...</div></div>}
        </div>

        <div className="chat-input-area">
          <input type="text" className="input-field" placeholder="e.g. Add a 20-tooth gear" value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} disabled={isLoading} />
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
          {ghostObject && <SceneObject obj={ghostObject} isGhost={true} />}
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
                <option value={PROVIDERS.OPENAI}>OpenAI (Cloud)</option>
                <option value={PROVIDERS.ANTHROPIC}>Anthropic (Cloud)</option>
                <option value={PROVIDERS.OLLAMA}>Ollama (Local)</option>
                <option value={PROVIDERS.LMSTUDIO}>LM Studio (Local)</option>
              </select>
            </div>
            {(aiConfig.provider === PROVIDERS.OPENAI || aiConfig.provider === PROVIDERS.ANTHROPIC) && (
              <div className="form-group">
                <label>API Key</label>
                <input type="password" className="input-field" placeholder="sk-..." value={aiConfig.apiKey} onChange={(e) => setAiConfig({ ...aiConfig, apiKey: e.target.value })} />
              </div>
            )}
            <div className="form-group">
              <label>Model Name</label>
              <input type="text" className="input-field" placeholder="gpt-4o, llama3, etc." value={aiConfig.model} onChange={(e) => setAiConfig({ ...aiConfig, model: e.target.value })} />
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
