import React, { useState, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, GizmoHelper, GizmoViewport } from '@react-three/drei';
import { Send, Hexagon, Check, X, BoxSelect, Trash2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import './index.css';

// Simple parser for mock AI
function parsePrompt(prompt) {
  const p = prompt.toLowerCase();
  let type = 'box';
  let color = '#ffffff';
  let size = [1, 1, 1];
  let position = [0, 0.5, 0];

  if (p.includes('sphere')) type = 'sphere';
  if (p.includes('cylinder')) type = 'cylinder';

  if (p.includes('red')) color = '#ef4444';
  if (p.includes('green')) color = '#10b981';
  if (p.includes('blue')) color = '#3b82f6';
  if (p.includes('yellow')) color = '#eab308';
  if (p.includes('purple')) color = '#a855f7';

  if (type === 'sphere') position = [0, 0.5, 0];
  if (type === 'cylinder') { size = [0.5, 0.5, 1, 32]; position = [0, 0.5, 0]; }

  return { id: uuidv4(), type, color, size, position, rotation: [0, 0, 0] };
}

// 3D Object Component
const SceneObject = ({ obj, isGhost = false }) => {
  const meshRef = useRef();

  return (
    <mesh 
      ref={meshRef} 
      position={obj.position} 
      scale={isGhost ? 1.05 : 1}
    >
      {obj.type === 'box' && <boxGeometry args={obj.size} />}
      {obj.type === 'sphere' && <sphereGeometry args={[0.5, 32, 32]} />}
      {obj.type === 'cylinder' && <cylinderGeometry args={obj.size} />}
      
      <meshStandardMaterial 
        color={obj.color} 
        transparent={isGhost}
        opacity={isGhost ? 0.5 : 1}
        wireframe={isGhost}
        roughness={0.2}
        metalness={0.1}
      />
    </mesh>
  );
};

export default function App() {
  const [sceneObjects, setSceneObjects] = useState([]);
  const [ghostObject, setGhostObject] = useState(null);
  const [chatHistory, setChatHistory] = useState([
    { id: 1, role: 'ai', text: "Hello! I'm your AI CAD Assistant. What would you like to build today? Try saying 'Add a blue box'." }
  ]);
  const [inputValue, setInputValue] = useState('');

  const handleSend = () => {
    if (!inputValue.trim()) return;

    // Add user message
    const newChat = [...chatHistory, { id: Date.now(), role: 'user', text: inputValue }];
    
    // Generate AI suggestion
    const suggestion = parsePrompt(inputValue);
    setGhostObject(suggestion);
    
    newChat.push({
      id: Date.now() + 1,
      role: 'ai',
      text: `I've prepared a ${suggestion.color} ${suggestion.type}. How does this look?`,
      suggestion: suggestion
    });

    setChatHistory(newChat);
    setInputValue('');
  };

  const handleAccept = (suggestion) => {
    setSceneObjects(prev => [...prev, suggestion]);
    setGhostObject(null);
    setChatHistory(prev => [...prev, {
      id: Date.now(), role: 'ai', text: 'Added to scene! What next?'
    }]);
  };

  const handleReject = () => {
    setGhostObject(null);
    setChatHistory(prev => [...prev, {
      id: Date.now(), role: 'ai', text: 'Scrapped that idea. What should we do instead?'
    }]);
  };

  const clearScene = () => {
    setSceneObjects([]);
    setGhostObject(null);
  };

  return (
    <div className="app-container">
      {/* Sidebar - AI Interface */}
      <div className="sidebar glass">
        <div className="sidebar-header">
          <Hexagon size={24} color="var(--color-accent)" />
          <h1>Antigravity CAD</h1>
        </div>
        
        <div className="chat-container">
          {chatHistory.map((msg) => (
            <div key={msg.id} className={`chat-message ${msg.role}`}>
              <div className="message-bubble">
                {msg.text}
              </div>
              
              {msg.suggestion && ghostObject?.id === msg.suggestion.id && (
                <div className="ai-suggestion-card">
                  <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                    Pending Approval
                  </span>
                  <div className="suggestion-actions">
                    <button className="btn btn-success" onClick={() => handleAccept(msg.suggestion)}>
                      <Check size={16} /> Accept
                    </button>
                    <button className="btn btn-danger" onClick={handleReject}>
                      <X size={16} /> Reject
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="chat-input-area">
          <input 
            type="text" 
            className="input-field" 
            placeholder="e.g. Add a red sphere"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          />
          <button className="btn btn-primary" onClick={handleSend}>
            <Send size={18} />
          </button>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="main-canvas-area">
        <div className="top-toolbar glass">
          <button className="btn btn-icon" title="Select Tool">
            <BoxSelect size={18} />
          </button>
          <button className="btn btn-icon" title="Clear Scene" onClick={clearScene}>
            <Trash2 size={18} />
          </button>
        </div>

        <Canvas camera={{ position: [5, 5, 5], fov: 50 }}>
          <color attach="background" args={['#0a0a0c']} />
          <ambientLight intensity={0.5} />
          <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
          <Environment preset="city" />

          {/* Grid and Axes */}
          <Grid 
            infiniteGrid 
            fadeDistance={30} 
            sectionColor="#202024" 
            cellColor="#141416" 
            position={[0, 0, 0]} 
          />

          {/* Render Scene Objects */}
          {sceneObjects.map(obj => (
            <SceneObject key={obj.id} obj={obj} />
          ))}

          {/* Render Ghost Object (Preview) */}
          {ghostObject && (
            <SceneObject obj={ghostObject} isGhost={true} />
          )}

          <OrbitControls makeDefault />
          <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
            <GizmoViewport axisColors={['#ef4444', '#10b981', '#3b82f6']} labelColor="white" />
          </GizmoHelper>
        </Canvas>
      </div>
    </div>
  );
}
