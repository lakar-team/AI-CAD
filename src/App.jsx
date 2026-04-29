import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, GizmoHelper, GizmoViewport, ContactShadows, PerspectiveCamera } from '@react-three/drei';
import { Send, Hexagon, Check, X, Trash2, Settings, Download, Upload, Box, MousePointer2, Plus, ChevronDown } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

import { PROVIDERS, PROVIDER_LABELS, DEFAULT_MODELS, callAI } from './services/aiService';
import { getGeometryFromTool, serializeForSave, deserializeFromSave } from './services/geometryEngine';
import './index.css';

// Scale Helper: A 1.8m "Human" reference
const ScaleReference = () => (
  <group position={[-3, 0, -3]}>
    {/* Body */}
    <mesh position={[0, 0.9, 0]}>
      <capsuleGeometry args={[0.2, 1.0, 4, 8]} />
      <meshStandardMaterial color="#3b82f6" transparent opacity={0.25} roughness={1} />
    </mesh>
    {/* Head */}
    <mesh position={[0, 1.6, 0]}>
      <sphereGeometry args={[0.15, 16, 16]} />
      <meshStandardMaterial color="#3b82f6" transparent opacity={0.25} roughness={1} />
    </mesh>
    {/* Label */}
    <mesh position={[0, -0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0, 0.3, 32]} />
      <meshBasicMaterial color="#93c5fd" transparent opacity={0.4} />
    </mesh>
  </group>
);

// 3D Object Component
const SceneObject = ({ obj, isGhost = false, onSelect, isSelected, meshRef }) => {
  const extrudeSettings = useMemo(() => ({
    steps: 1,
    depth: obj.thickness || 0.1,
    bevelEnabled: !obj.operation,
    bevelThickness: 0.005,
    bevelSize: 0.005,
    bevelSegments: 2
  }), [obj.thickness, obj.operation]);

  return (
    <mesh
      ref={meshRef}
      position={obj.position}
      rotation={obj.type === 'custom' ? [-Math.PI / 2, 0, 0] : [0, 0, 0]}
      scale={isGhost ? 1.02 : 1}
      onClick={(e) => {
        e.stopPropagation();
        if (onSelect) onSelect(obj.id);
      }}
    >
      {obj.type === 'box' && <boxGeometry args={obj.size} />}
      {obj.type === 'sphere' && <sphereGeometry args={[obj.size || 0.5, 32, 32]} />}
      {obj.type === 'custom' && obj.shape && <extrudeGeometry args={[obj.shape, extrudeSettings]} />}

      <meshStandardMaterial
        color={isSelected ? '#3b82f6' : (obj.operation === 'subtract' ? '#222' : obj.color)}
        transparent={isGhost || obj.operation === 'subtract'}
        opacity={isGhost ? 0.35 : (obj.operation === 'subtract' ? 0.7 : 1)}
        wireframe={isGhost}
        roughness={0.65}
        metalness={0.05}
        emissive={isSelected ? '#1e3a8a' : '#000000'}
        emissiveIntensity={isSelected ? 0.3 : 0}
      />
    </mesh>
  );
};

// Main 3D Scene
const MainScene = ({ sceneObjects, ghostObject, selectedId, setSelectedId, sceneRef }) => {
  return (
    <group ref={sceneRef}>
      <Grid
        infiniteGrid
        fadeDistance={50}
        sectionColor="#bbb"
        cellColor="#ddd"
        sectionSize={5}
        cellSize={1}
        position={[0, -0.001, 0]}
      />

      <ContactShadows position={[0, 0, 0]} opacity={0.35} scale={30} blur={2.5} far={5} />
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
          ? ghostObject.clones.map(c => <SceneObject key={c.id} obj={c} isGhost={true} onSelect={() => { }} />)
          : <SceneObject obj={ghostObject} isGhost={true} onSelect={() => { }} />
      )}

      <OrbitControls makeDefault minPolarAngle={0} maxPolarAngle={Math.PI / 1.8} />
    </group>
  );
};

export default function App() {
  const [sceneObjects, setSceneObjects] = useState([]);
  const [ghostObject, setGhostObject] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [chatHistory, setChatHistory] = useState([
    { id: 1, role: 'ai', text: "Welcome! Configure your AI in Settings (⚙️), then start designing. All units are in meters. The blue figure is 1.8m for reference." }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const sceneRef = useRef();

  // --- Multi-AI Profile System ---
  const [aiProfiles, setAiProfiles] = useState(() => {
    const saved = localStorage.getItem('ai_profiles_v2');
    if (saved) return JSON.parse(saved);
    return [
      { id: 'default', name: 'OpenAI GPT-4o', provider: PROVIDERS.OPENAI, apiKey: '', baseUrl: '', model: 'gpt-4o' },
    ];
  });
  const [activeProfileId, setActiveProfileId] = useState(() => {
    return localStorage.getItem('active_profile_id') || 'default';
  });

  useEffect(() => {
    localStorage.setItem('ai_profiles_v2', JSON.stringify(aiProfiles));
  }, [aiProfiles]);
  useEffect(() => {
    localStorage.setItem('active_profile_id', activeProfileId);
  }, [activeProfileId]);

  const activeProfile = useMemo(() =>
    aiProfiles.find(p => p.id === activeProfileId) || aiProfiles[0],
    [aiProfiles, activeProfileId]
  );

  const addProfile = () => {
    const newId = `profile_${uuidv4().slice(0, 6)}`;
    setAiProfiles(prev => [...prev, {
      id: newId,
      name: 'New Profile',
      provider: PROVIDERS.OLLAMA,
      apiKey: '',
      baseUrl: 'http://localhost:11434',
      model: 'llama3'
    }]);
  };

  const removeProfile = (id) => {
    if (aiProfiles.length <= 1) return; // Keep at least one
    setAiProfiles(prev => prev.filter(p => p.id !== id));
    if (activeProfileId === id) setActiveProfileId(aiProfiles[0].id);
  };

  const updateProfile = (idx, field, value) => {
    setAiProfiles(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      // Auto-fill defaults when provider changes
      if (field === 'provider') {
        updated[idx].model = DEFAULT_MODELS[value] || '';
        updated[idx].baseUrl = value === PROVIDERS.OLLAMA ? 'http://localhost:11434' : (value === PROVIDERS.LMSTUDIO ? 'http://localhost:1234/v1' : '');
      }
      return updated;
    });
  };

  // --- Scene Context for AI ---
  const getSceneContext = useCallback(() => {
    if (sceneObjects.length === 0) return "The scene is empty. No objects exist yet.";
    let ctx = sceneObjects.map(obj =>
      `- ID:"${obj.id}" Type:${obj.type} Label:"${obj.label || obj.type}" Color:${obj.color} Pos:[${obj.position.map(p => p.toFixed(3)).join(',')}] Size:${JSON.stringify(obj.size || obj.dims || obj.thickness)}`
    ).join('\n');
    if (selectedId) {
      const sel = sceneObjects.find(o => o.id === selectedId);
      if (sel) ctx += `\n\n** USER HAS SELECTED: "${sel.label || sel.type}" (ID: ${selectedId}). Focus actions on this object. **`;
    }
    return ctx;
  }, [sceneObjects, selectedId]);

  // --- Send Message ---
  const handleSend = async () => {
    const text = inputValue.trim();
    if (!text) return;

    // Validate config
    const needsKey = activeProfile.provider !== PROVIDERS.OLLAMA && activeProfile.provider !== PROVIDERS.LMSTUDIO;
    if (needsKey && !activeProfile.apiKey) {
      setChatHistory(prev => [...prev, { id: Date.now(), role: 'ai', text: '⚠️ No API key set for this profile. Open Settings (⚙️) and enter your key.' }]);
      setIsSettingsOpen(true);
      return;
    }

    setChatHistory(prev => [...prev, { id: Date.now(), role: 'user', text }]);
    setInputValue('');
    setIsLoading(true);

    try {
      const sceneContext = getSceneContext();
      const toolCall = await callAI(activeProfile.provider, activeProfile, text, sceneContext);

      if (!toolCall || !toolCall.tool) {
        throw new Error('AI did not return a valid tool call. Try rephrasing your request.');
      }

      const suggestion = getGeometryFromTool(toolCall, sceneObjects);
      if (!suggestion) {
        throw new Error(`Unknown tool "${toolCall.tool}". The AI may need a better prompt.`);
      }

      const suggestionWithId = { ...suggestion, id: `obj_${uuidv4().slice(0, 8)}` };
      setGhostObject(suggestionWithId);
      setChatHistory(prev => [...prev, {
        id: Date.now() + 1,
        role: 'ai',
        text: `Tool: ${toolCall.tool} | ${suggestion.label || suggestion.type}. Accept or Reject the preview.`,
        suggestion: suggestionWithId
      }]);
    } catch (error) {
      console.error('AI Call Error:', error);
      setChatHistory(prev => [...prev, {
        id: Date.now() + 1,
        role: 'ai',
        text: `❌ ${error.message}`
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
    setChatHistory(prev => [...prev, { id: Date.now(), role: 'ai', text: '✅ Added to scene.' }]);
  };

  const handleReject = () => {
    setGhostObject(null);
    setChatHistory(prev => [...prev, { id: Date.now(), role: 'ai', text: '🗑️ Discarded.' }]);
  };

  // --- Save / Load / Export ---
  const saveProject = () => {
    const data = serializeForSave(sceneObjects);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cad_project_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadProject = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const raw = JSON.parse(e.target.result);
        const objects = deserializeFromSave(raw);
        setSceneObjects(objects);
        setSelectedId(null);
        setGhostObject(null);
        setChatHistory(prev => [...prev, { id: Date.now(), role: 'ai', text: `📂 Loaded ${objects.length} objects from file.` }]);
      } catch (err) {
        setChatHistory(prev => [...prev, { id: Date.now(), role: 'ai', text: `❌ Failed to load: ${err.message}` }]);
      }
    };
    reader.readAsText(file);
    event.target.value = ''; // Reset so the same file can be loaded again
  };

  const exportGLTF = () => {
    if (!sceneRef.current) {
      alert('Scene not ready.');
      return;
    }
    const exporter = new GLTFExporter();
    exporter.parse(
      sceneRef.current,
      (gltf) => {
        const blob = new Blob([JSON.stringify(gltf)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cad_export_${Date.now()}.gltf`;
        a.click();
        URL.revokeObjectURL(url);
        setChatHistory(prev => [...prev, { id: Date.now(), role: 'ai', text: '📦 Exported as GLTF. Open in Blender, Unity, or any 3D viewer.' }]);
      },
      (error) => {
        console.error('GLTF Export Error:', error);
        setChatHistory(prev => [...prev, { id: Date.now(), role: 'ai', text: `❌ Export failed: ${error.message}` }]);
      },
      { binary: false }
    );
  };

  return (
    <div className="app-container">
      {/* ---- Sidebar ---- */}
      <div className="sidebar glass">
        <div className="sidebar-header">
          <Hexagon size={24} color="var(--color-accent)" />
          <h1>Antigravity CAD</h1>
          <button className="btn btn-icon" style={{ marginLeft: 'auto' }} onClick={() => setIsSettingsOpen(true)} title="AI Settings">
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
          {isLoading && (
            <div className="chat-message ai">
              <div className="message-bubble">
                <span className="loading-dots">Thinking</span>
              </div>
            </div>
          )}
        </div>

        <div className="chat-footer">
          <select
            className="profile-select"
            value={activeProfileId}
            onChange={(e) => setActiveProfileId(e.target.value)}
            title="Active AI Profile"
          >
            {aiProfiles.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} ({PROVIDER_LABELS[p.provider] || p.provider})
              </option>
            ))}
          </select>
          <div className="chat-input-area">
            <input
              type="text"
              className="input-field"
              placeholder="e.g. Create a 2m wide table"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              disabled={isLoading}
            />
            <button className="btn btn-primary" onClick={handleSend} disabled={isLoading}>
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* ---- 3D Canvas ---- */}
      <div className="main-canvas-area" onClick={() => setSelectedId(null)}>
        <div className="top-toolbar glass">
          <div className="toolbar-group">
            <button className="btn btn-icon" title="Save Project (.json)" onClick={saveProject}>
              <Download size={18} />
            </button>
            <label className="btn btn-icon" title="Load Project" style={{ cursor: 'pointer' }}>
              <Upload size={18} />
              <input type="file" accept=".json" hidden onChange={loadProject} />
            </label>
            <button className="btn btn-icon" title="Export as GLTF (3D)" onClick={exportGLTF}>
              <Box size={18} />
            </button>
          </div>
          <div className="toolbar-group">
            <button
              className={`btn btn-icon ${selectedId ? 'active' : ''}`}
              title={selectedId ? `Selected: ${selectedId}` : 'Click a part to select'}
            >
              <MousePointer2 size={18} />
            </button>
            <button className="btn btn-icon" title="Clear Scene" onClick={() => { setSceneObjects([]); setSelectedId(null); setGhostObject(null); }}>
              <Trash2 size={18} />
            </button>
          </div>
        </div>

        <Canvas shadows dpr={[1, 2]}>
          <color attach="background" args={['#f3f4f6']} />
          <PerspectiveCamera makeDefault position={[6, 5, 6]} fov={45} />
          <ambientLight intensity={1.2} />
          <directionalLight position={[8, 12, 8]} intensity={1.5} castShadow shadow-mapSize={1024} />
          <Environment preset="apartment" />

          <MainScene
            sceneObjects={sceneObjects}
            ghostObject={ghostObject}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            sceneRef={sceneRef}
          />

          <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
            <GizmoViewport axisColors={['#ef4444', '#10b981', '#3b82f6']} labelColor="black" />
          </GizmoHelper>
        </Canvas>
      </div>

      {/* ---- Settings Modal ---- */}
      {isSettingsOpen && (
        <div className="modal-overlay" onClick={() => setIsSettingsOpen(false)}>
          <div className="modal-content glass" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '85vh', overflowY: 'auto', width: '520px' }}>
            <div className="modal-header">
              <h2>AI Profiles</h2>
              <button className="btn btn-icon" onClick={() => setIsSettingsOpen(false)}><X size={18} /></button>
            </div>

            {aiProfiles.map((p, idx) => (
              <div key={p.id} style={{ padding: '16px', background: 'rgba(0,0,0,0.02)', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '10px', border: activeProfileId === p.id ? '2px solid var(--color-accent)' : '1px solid rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    className="input-field"
                    style={{ flex: 1 }}
                    value={p.name}
                    onChange={(e) => updateProfile(idx, 'name', e.target.value)}
                    placeholder="Profile Name"
                  />
                  {aiProfiles.length > 1 && (
                    <button className="btn btn-icon" onClick={() => removeProfile(p.id)} title="Remove Profile" style={{ color: 'var(--color-danger)' }}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>

                <div className="form-group">
                  <label>Provider</label>
                  <select
                    className="select-field"
                    value={p.provider}
                    onChange={(e) => updateProfile(idx, 'provider', e.target.value)}
                  >
                    {Object.entries(PROVIDER_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>

                {/* ---- Per-Provider Setup Guide ---- */}
                <div className="setup-guide">
                  {p.provider === PROVIDERS.OLLAMA && (
                    <>
                      <div className="guide-title">📖 Ollama Setup Guide</div>
                      <ol className="guide-steps">
                        <li><strong>Install Ollama:</strong> Download from <a href="https://ollama.com" target="_blank" rel="noreferrer">ollama.com</a> and run the installer.</li>
                        <li><strong>Download a model:</strong> Open a terminal and run: <code>ollama pull llama3</code></li>
                        <li><strong>Verify it's running:</strong> Visit <a href="http://localhost:11434" target="_blank" rel="noreferrer">localhost:11434</a> — you should see "Ollama is running".</li>
                        <li><strong>Enable CORS:</strong> Set the environment variable <code>OLLAMA_ORIGINS=*</code> and restart Ollama. <em>(Required for browser access.)</em></li>
                        <li><strong>Base URL:</strong> Keep as <code>http://localhost:11434</code></li>
                        <li><strong>Model:</strong> Enter the model name you pulled (e.g. <code>llama3</code>, <code>mistral</code>, <code>qwen2</code>).</li>
                      </ol>
                      <div className="guide-note">💡 Recommended models: <strong>llama3</strong> (8B, good balance), <strong>qwen2</strong> (7B, great for JSON), <strong>codellama</strong> (for code-heavy tasks).</div>
                    </>
                  )}
                  {p.provider === PROVIDERS.LMSTUDIO && (
                    <>
                      <div className="guide-title">📖 LM Studio Setup Guide</div>
                      <ol className="guide-steps">
                        <li><strong>Install LM Studio:</strong> Download from <a href="https://lmstudio.ai" target="_blank" rel="noreferrer">lmstudio.ai</a>.</li>
                        <li><strong>Download a model:</strong> Use the built-in search to download a model (e.g. Llama 3, Mistral).</li>
                        <li><strong>Start the server:</strong> Go to the "Local Server" tab and click "Start Server".</li>
                        <li><strong>Base URL:</strong> Keep as <code>http://localhost:1234/v1</code></li>
                        <li><strong>Model:</strong> Enter the model identifier shown in LM Studio's server tab.</li>
                      </ol>
                    </>
                  )}
                  {p.provider === PROVIDERS.OPENAI && (
                    <>
                      <div className="guide-title">📖 OpenAI Setup Guide</div>
                      <ol className="guide-steps">
                        <li><strong>Get an API Key:</strong> Go to <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">platform.openai.com/api-keys</a> and create a new secret key.</li>
                        <li><strong>Add billing:</strong> You need a paid account with credits. The free tier has very low limits.</li>
                        <li><strong>Paste the key below.</strong> It starts with <code>sk-...</code></li>
                        <li><strong>Model:</strong> Use <code>gpt-4o</code> for best results, or <code>gpt-4o-mini</code> to save money on simple tasks.</li>
                      </ol>
                      <div className="guide-note">⚠️ OpenAI charges per request. GPT-4o costs ~$5/1M input tokens. Use a local model for free unlimited use.</div>
                    </>
                  )}
                  {p.provider === PROVIDERS.ANTHROPIC && (
                    <>
                      <div className="guide-title">📖 Anthropic Setup Guide</div>
                      <ol className="guide-steps">
                        <li><strong>Get an API Key:</strong> Go to <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">console.anthropic.com</a> and create a key.</li>
                        <li><strong>Paste the key below.</strong> It starts with <code>sk-ant-...</code></li>
                        <li><strong>Model:</strong> Use <code>claude-sonnet-4-20250514</code> for best results.</li>
                      </ol>
                      <div className="guide-note">⚠️ Direct browser calls to Anthropic may be blocked by CORS. If you get errors, use OpenAI or a local model instead.</div>
                    </>
                  )}
                </div>

                {(p.provider === PROVIDERS.OPENAI || p.provider === PROVIDERS.ANTHROPIC) && (
                  <div className="form-group">
                    <label>API Key</label>
                    <input
                      type="password"
                      className="input-field"
                      placeholder={p.provider === PROVIDERS.OPENAI ? 'sk-...' : 'sk-ant-...'}
                      value={p.apiKey}
                      onChange={(e) => updateProfile(idx, 'apiKey', e.target.value)}
                    />
                  </div>
                )}

                {(p.provider === PROVIDERS.OLLAMA || p.provider === PROVIDERS.LMSTUDIO) && (
                  <div className="form-group">
                    <label>Base URL</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder={p.provider === PROVIDERS.OLLAMA ? 'http://localhost:11434' : 'http://localhost:1234/v1'}
                      value={p.baseUrl}
                      onChange={(e) => updateProfile(idx, 'baseUrl', e.target.value)}
                    />
                  </div>
                )}

                <div className="form-group">
                  <label>Model</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder={DEFAULT_MODELS[p.provider] || 'model-name'}
                    value={p.model}
                    onChange={(e) => updateProfile(idx, 'model', e.target.value)}
                  />
                </div>

                {/* Test Connection Button */}
                <button
                  className="btn btn-icon"
                  style={{ width: '100%', justifyContent: 'center', gap: '8px', fontSize: '0.85rem' }}
                  onClick={async () => {
                    setChatHistory(prev => [...prev, { id: Date.now(), role: 'ai', text: `🔄 Testing connection to ${PROVIDER_LABELS[p.provider]}...` }]);
                    try {
                      const result = await callAI(p.provider, p, 'Respond with: {"tool":"create_box","params":{"size":[0.5,0.5,0.5],"color":"#22c55e","position":[0,0.25,0]}}', 'Empty scene.');
                      if (result && result.tool) {
                        setChatHistory(prev => [...prev, { id: Date.now(), role: 'ai', text: `✅ Connection successful! ${PROVIDER_LABELS[p.provider]} is working.` }]);
                      } else {
                        setChatHistory(prev => [...prev, { id: Date.now(), role: 'ai', text: `⚠️ Connected but got unexpected response. Check model name.` }]);
                      }
                    } catch (err) {
                      setChatHistory(prev => [...prev, { id: Date.now(), role: 'ai', text: `❌ Test failed: ${err.message}` }]);
                    }
                  }}
                >
                  ⚡ Test Connection
                </button>
              </div>
            ))}

            <button className="btn btn-primary" onClick={addProfile} style={{ width: '100%' }}>
              <Plus size={16} /> Add New Profile
            </button>

            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setIsSettingsOpen(false)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
