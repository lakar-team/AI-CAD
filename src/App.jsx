import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, GizmoHelper, GizmoViewport, ContactShadows, PerspectiveCamera, TransformControls, Gltf } from '@react-three/drei';
import { Send, Hexagon, Check, X, Trash2, Settings, Download, Upload, Box, MousePointer2, Plus, ChevronDown, Copy, Move, RotateCcw, Maximize, PackagePlus, Eye, Layers, Library, Circle, Database, LifeBuoy, Search, Loader2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

import { PROVIDERS, PROVIDER_LABELS, DEFAULT_MODELS, callAI } from './services/aiService';
import { getGeometryFromTool, serializeForSave, deserializeFromSave, getAnchorPoints } from './services/geometryEngine';
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

// External Model Sub-components
const ObjModel = ({ url }) => {
  const obj = useLoader(OBJLoader, url);
  const cloned = useMemo(() => obj.clone(), [obj]);
  return <primitive object={cloned} />;
};

const StlModel = ({ url }) => {
  const geom = useLoader(STLLoader, url);
  return (
    <mesh geometry={geom}>
      <meshStandardMaterial color="#cccccc" />
    </mesh>
  );
};

// 3D Object Component
const SceneObject = ({ obj, isGhost = false, onSelect, isSelected, setSelectedMesh }) => {
  const meshRef = useRef();

  useEffect(() => {
    if (isSelected && meshRef.current) {
      setSelectedMesh(meshRef.current);
    }
  }, [isSelected, setSelectedMesh]);

  const extrudeSettings = useMemo(() => ({
    steps: 1,
    depth: obj.thickness || 0.1,
    bevelEnabled: !obj.operation,
    bevelThickness: 0.005,
    bevelSize: 0.005,
    bevelSegments: 2
  }), [obj.thickness, obj.operation]);

  const baseRotation = obj.type === 'custom' ? [-Math.PI / 2, 0, 0] : [0, 0, 0];
  const userRotation = obj.rotation ? obj.rotation.map(d => (d * Math.PI) / 180) : [0, 0, 0];
  const finalRotation = [
    baseRotation[0] + userRotation[0],
    baseRotation[1] + userRotation[1],
    baseRotation[2] + userRotation[2]
  ];

  const anchors = useMemo(() => isSelected ? getAnchorPoints(obj) : [], [isSelected, obj]);

  return (
    <group
      ref={meshRef}
      position={obj.position || [0, 0, 0]}
      rotation={finalRotation}
      scale={obj.scale ? (isGhost ? obj.scale.map(s => s * 1.02) : obj.scale) : (isGhost ? 1.02 : 1)}
      onClick={(e) => {
        e.stopPropagation();
        if (onSelect) onSelect(obj.id);
      }}
    >
      {/* Anchor Points Visualization */}
      {isSelected && anchors.map((a, i) => (
        <mesh key={i} position={a.pos}>
          <sphereGeometry args={[0.03, 8, 8]} />
          <meshBasicMaterial color="#ef4444" transparent opacity={0.8} />
        </mesh>
      ))}

      {obj.type === 'external_model' ? (
        <React.Suspense fallback={<mesh><boxGeometry args={[0.5,0.5,0.5]}/><meshBasicMaterial color="gray" wireframe/></mesh>}>
          {obj.ext === 'obj' ? <ObjModel url={obj.url} /> : 
           obj.ext === 'stl' ? <StlModel url={obj.url} /> : 
           <Gltf src={obj.url} castShadow receiveShadow />}
          {isSelected && (
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <ringGeometry args={[1, 1.1, 32]} />
              <meshBasicMaterial color="#3b82f6" />
            </mesh>
          )}
        </React.Suspense>
      ) : (
        <mesh>
          {obj.type === 'box' && <boxGeometry args={obj.size} />}
          {obj.type === 'sphere' && <sphereGeometry args={[obj.size || 0.5, 32, 32]} />}
          {obj.type === 'cylinder' && <cylinderGeometry args={[obj.size[0], obj.size[1], obj.size[2], 32]} />}
          {obj.type === 'torus' && <torusGeometry args={obj.size} />}
          {obj.type === 'custom' && obj.shape && <extrudeGeometry args={[obj.shape, extrudeSettings]} />}

          <meshStandardMaterial
            color={isSelected ? '#3b82f6' : (obj.operation ? obj.color : obj.color)}
            transparent={isGhost || !!obj.operation}
            opacity={isGhost ? 0.35 : (obj.operation ? 0.7 : 1)}
            wireframe={isGhost}
            roughness={0.65}
            metalness={0.05}
            emissive={isSelected ? '#1e3a8a' : '#000000'}
            emissiveIntensity={isSelected ? 0.3 : 0}
          />
        </mesh>
      )}
    </group>
  );
};

// Main 3D Scene
const MainScene = ({ sceneObjects, setSceneObjects, ghostObject, selectedId, setSelectedId, transformMode, sceneRef }) => {
  const [selectedMesh, setSelectedMesh] = useState(null);

  const onGizmoChange = () => {
    if (!selectedMesh || !selectedId) return;

    // Update the state with new transform values
    setSceneObjects(prev => prev.map(obj => {
      if (obj.id === selectedId) {
        return {
          ...obj,
          position: [selectedMesh.position.x, selectedMesh.position.y, selectedMesh.position.z],
          rotation: [
            selectedMesh.rotation.x * 180 / Math.PI - (obj.type === 'custom' ? -90 : 0),
            selectedMesh.rotation.y * 180 / Math.PI,
            selectedMesh.rotation.z * 180 / Math.PI
          ],
          scale: [selectedMesh.scale.x, selectedMesh.scale.y, selectedMesh.scale.z]
        };
      }
      return obj;
    }));
  };

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
          isSelected={selectedId === obj.id}
          onSelect={setSelectedId}
          setSelectedMesh={setSelectedMesh}
        />
      ))}

      {ghostObject && (
        ghostObject.type === 'pattern_group'
          ? ghostObject.clones.map(c => <SceneObject key={c.id} obj={c} isGhost={true} onSelect={() => { }} setSelectedMesh={() => { }} />)
          : ghostObject.type === 'assembly'
            ? ghostObject.parts.map(p => <SceneObject key={p.id} obj={p} isGhost={true} onSelect={() => { }} setSelectedMesh={() => { }} />)
            : <SceneObject obj={ghostObject} isGhost={true} onSelect={() => { }} setSelectedMesh={() => { }} />
      )}

      {selectedId && selectedMesh && (
        <TransformControls
          object={selectedMesh}
          mode={transformMode}
          onMouseUp={onGizmoChange}
          translationSnap={0.1}
          rotationSnap={Math.PI / 12} // 15 degrees
          scaleSnap={0.1}
        />
      )}

      <OrbitControls
        makeDefault
        minPolarAngle={0}
        maxPolarAngle={Math.PI / 1.8}
      />
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
  const [transformMode, setTransformMode] = useState('translate'); // 'translate', 'rotate', 'scale'
  const [visionEnabled, setVisionEnabled] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [polyHavenAssets, setPolyHavenAssets] = useState({});
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
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

  const duplicateProfile = (id) => {
    const profileToCopy = aiProfiles.find(p => p.id === id);
    if (!profileToCopy) return;
    
    const newId = `profile_${uuidv4().slice(0, 6)}`;
    setAiProfiles(prev => [...prev, {
      ...profileToCopy,
      id: newId,
      name: `${profileToCopy.name} (Copy)`
    }]);
    setActiveProfileId(newId);
  };

  const updateProfile = (idx, field, value) => {
    setAiProfiles(prev => {
      const updated = [...prev];
      updated[idx][field] = value;
      // Auto-fill defaults when provider changes
      if (field === 'provider') {
        updated[idx].model = DEFAULT_MODELS[value] || '';
        updated[idx].baseUrl = value === PROVIDERS.OLLAMA ? 'http://localhost:11434' : (value === PROVIDERS.LMSTUDIO ? 'http://localhost:1234/v1' : '');
      }
      return updated;
    });
  };

  // --- Manual Creation ---
  const addPrimitive = (type) => {
    const id = `obj_${uuidv4().slice(0, 8)}`;
    let newObj = {
      id,
      type,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      color: '#ffffff',
      label: `Manual ${type.charAt(0).toUpperCase() + type.slice(1)}`
    };

    if (type === 'box') newObj.size = [1, 1, 1];
    if (type === 'sphere') newObj.size = 0.5;
    if (type === 'cylinder') newObj.size = [0.5, 0.5, 1];
    if (type === 'torus') newObj.size = [0.5, 0.2, 16, 100];

    setSceneObjects(prev => [...prev, newObj]);
    setSelectedId(id);
  };

  // --- Poly Haven Fetch ---
  useEffect(() => {
    if (isLibraryOpen && Object.keys(polyHavenAssets).length === 0) {
      setLibraryLoading(true);
      fetch('https://api.polyhaven.com/assets?t=models')
        .then(res => res.json())
        .then(data => {
          setPolyHavenAssets(data);
          setLibraryLoading(false);
        })
        .catch(err => {
          console.error('Poly Haven Fetch Error:', err);
          setLibraryLoading(false);
        });
    }
  }, [isLibraryOpen]);

  const insertPolyHavenAsset = (id, name) => {
    const glbUrl = `https://dl.polyhaven.org/file/ph-assets/Models/glb/1k/${id}.glb`;
    const newObj = {
      id: `ph_${id}_${uuidv4().slice(0, 4)}`,
      type: 'external_model',
      ext: 'glb',
      url: glbUrl,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      label: name || id
    };
    setSceneObjects(prev => [...prev, newObj]);
    setIsLibraryOpen(false);
    setChatHistory(prev => [...prev, { id: Date.now(), role: 'ai', text: `📦 Imported "${name}" from Poly Haven.` }]);
  };

  // --- Scene Context for AI ---
  const getSceneContext = useCallback(() => {
    if (sceneObjects.length === 0) return "The scene is empty. No objects exist yet.";
    let ctx = sceneObjects.map(obj =>
      `- ID:"${obj.id}" Type:${obj.type} Label:"${obj.label || obj.type}" Color:${obj.color} Pos:[${obj.position.map(p => p.toFixed(3)).join(',')}] Size:${JSON.stringify(obj.size || obj.dims || obj.thickness)}`
    ).join('\n');
    if (selectedId) {
      const sel = sceneObjects.find(o => o.id === selectedId);
      if (sel) {
        ctx += `\n\n** USER HAS SELECTED: "${sel.label || sel.type}" (ID: ${selectedId}) **`;
        const anchors = getAnchorPoints(sel);
        ctx += `\nAnchors (Local Space): ${anchors.map(a => `${a.name}:[${a.pos.map(p => p.toFixed(3)).join(',')}]`).join(', ')}`;
      }
    }
    return ctx;
  }, [sceneObjects, selectedId]);

  // --- Send Message ---
  const handleSend = async (overrideText = null) => {
    const text = (typeof overrideText === 'string' ? overrideText : inputValue).trim();
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
      let imageUrl = null;
      if (visionEnabled) {
        const canvas = document.querySelector('canvas');
        if (canvas) {
          imageUrl = canvas.toDataURL('image/jpeg', 0.8);
          setVisionEnabled(false); // Disable after sending one
        }
      }

      const sceneContext = getSceneContext();
      const aiResponse = await callAI(activeProfile.provider, activeProfile, text, sceneContext, imageUrl);

      if (!aiResponse) {
        throw new Error('AI did not return a valid response. Try rephrasing your request.');
      }

      // Handle the new { message, tools } schema. Fallback to array for backward compatibility.
      const aiMessage = aiResponse.message || '';
      const toolCalls = Array.isArray(aiResponse.tools) ? aiResponse.tools 
                      : (Array.isArray(aiResponse) ? aiResponse : [aiResponse]);
      
      const suggestions = [];
      for (const call of toolCalls) {
        if (!call || !call.tool) continue;
        const suggestion = getGeometryFromTool(call, [...sceneObjects, ...suggestions]);
        if (suggestion) {
          const id = suggestion.id || `obj_${uuidv4().slice(0, 8)}`;
          suggestions.push({ ...suggestion, id });
        }
      }

      if (suggestions.length === 0 && !aiMessage) {
        throw new Error('The AI returned an empty response. Check the prompt.');
      }

      // If no tools, just post the conversational message
      if (suggestions.length === 0) {
        setChatHistory(prev => [...prev, {
          id: Date.now() + 1,
          role: 'ai',
          text: aiMessage
        }]);
        return;
      }

      // If there are tools, create the ghost object and post the message + preview prompt
      const ghostData = suggestions.length === 1 
        ? suggestions[0] 
        : { type: 'assembly', parts: suggestions, id: `batch_${uuidv4().slice(0,8)}`, label: 'Assembly' };

      setGhostObject(ghostData);
      
      const promptText = aiMessage ? `${aiMessage}\n\n(Preview generated. Accept or Reject.)` : `The AI designed an assembly with ${suggestions.length} part(s). Accept or Reject the preview.`;

      setChatHistory(prev => [...prev, {
        id: Date.now() + 1,
        role: 'ai',
        text: promptText,
        suggestion: ghostData
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
    let newParts = [];
    if (suggestion.type === 'pattern_group') {
      newParts = suggestion.clones;
    } else if (suggestion.type === 'assembly') {
      newParts = suggestion.parts;
    } else {
      newParts = [suggestion];
    }

    setSceneObjects(prev => {
      let updated = [...prev];
      newParts.forEach(part => {
        if (part.isModification) {
          const idx = updated.findIndex(o => o.id === part.id);
          if (idx >= 0) {
            updated[idx] = { ...updated[idx], ...part, isModification: undefined };
          }
        } else {
          updated.push(part);
        }
      });
      return updated;
    });

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

  const exportOBJ = () => {
    if (!sceneRef.current) return;
    const exporter = new OBJExporter();
    const result = exporter.parse(sceneRef.current);
    const blob = new Blob([result], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cad_export_${Date.now()}.obj`;
    a.click();
    URL.revokeObjectURL(url);
    setChatHistory(prev => [...prev, { id: Date.now(), role: 'ai', text: '📦 Exported as OBJ.' }]);
  };

  const exportSTL = () => {
    if (!sceneRef.current) return;
    const exporter = new STLExporter();
    const result = exporter.parse(sceneRef.current);
    const blob = new Blob([result], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cad_export_${Date.now()}.stl`;
    a.click();
    URL.revokeObjectURL(url);
    setChatHistory(prev => [...prev, { id: Date.now(), role: 'ai', text: '📦 Exported as STL for 3D Printing.' }]);
  };

  return (
    <div className="app-container">
      {/* ---- Sidebar ---- */}
      <div className="sidebar glass">
        <div className="sidebar-header">
          <Hexagon size={24} color="var(--color-accent)" />
          <h1>Lakar CAD</h1>
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
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            />
            <div 
              className={`vision-toggle ${visionEnabled ? 'active' : ''}`} 
              onClick={() => setVisionEnabled(!visionEnabled)} 
              title="Include Screenshot Context (Requires Vision Model)"
            >
              <Eye size={18} />
            </div>
            <button className="btn btn-primary" onClick={handleSend} disabled={isLoading || !inputValue.trim()}>
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* ---- 3D Canvas ---- */}
      <div className="main-canvas-area">
        <div className="top-toolbar glass">
          <div className="toolbar-group">
            <button className="btn btn-icon" title="Add Box" onClick={() => addPrimitive('box')}>
              <Box size={18} />
            </button>
            <button className="btn btn-icon" title="Add Sphere" onClick={() => addPrimitive('sphere')}>
              <Circle size={18} />
            </button>
            <button className="btn btn-icon" title="Add Cylinder" onClick={() => addPrimitive('cylinder')}>
              <Database size={18} />
            </button>
            <button className="btn btn-icon" title="Add Torus" onClick={() => addPrimitive('torus')}>
              <LifeBuoy size={18} />
            </button>
          </div>

          <div className="toolbar-group">
            <button className="btn btn-icon" title="Save Project (.json)" onClick={saveProject}>
              <Download size={18} />
            </button>
            <label className="btn btn-icon" title="Load Project" style={{ cursor: 'pointer' }}>
              <Upload size={18} />
              <input type="file" accept=".json" hidden onChange={loadProject} />
            </label>
            <div style={{ display: 'flex', gap: '4px', borderLeft: '1px solid rgba(0,0,0,0.1)', paddingLeft: '8px', marginLeft: '4px' }}>
              <button className="btn btn-icon" title="Export GLTF" onClick={exportGLTF}>
                <Box size={18} />
              </button>
              <button className="btn btn-icon" title="Export OBJ" onClick={exportOBJ} style={{ fontSize: '0.7rem', fontWeight: 'bold' }}>
                OBJ
              </button>
              <button className="btn btn-icon" title="Export STL (3D Print)" onClick={exportSTL} style={{ fontSize: '0.7rem', fontWeight: 'bold' }}>
                STL
              </button>
            </div>
          </div>
          <div className="toolbar-group">
            <button 
              className={`btn btn-icon ${transformMode === 'translate' ? 'active' : ''}`} 
              title="Move Mode (T)" 
              onClick={() => setTransformMode('translate')}
            >
              <Move size={18} />
            </button>
            <button 
              className={`btn btn-icon ${transformMode === 'rotate' ? 'active' : ''}`} 
              title="Rotate Mode (R)" 
              onClick={() => setTransformMode('rotate')}
            >
              <RotateCcw size={18} />
            </button>
            <button 
              className={`btn btn-icon ${transformMode === 'scale' ? 'active' : ''}`} 
              title="Scale Mode (S)" 
              onClick={() => setTransformMode('scale')}
            >
              <Maximize size={18} />
            </button>
          </div>

          <div className="toolbar-group">
            <button className="btn btn-icon" title="Asset Library" onClick={() => setIsLibraryOpen(true)}>
              <Library size={18} />
            </button>
            <label className="btn btn-icon" title="Import Local 3D Model (.glb, .obj, .stl)" style={{ cursor: 'pointer' }}>
              <PackagePlus size={18} />
              <input 
                type="file" 
                accept=".glb,.gltf,.obj,.stl" 
                hidden 
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (file) {
                    const ext = file.name.split('.').pop().toLowerCase();
                    const url = URL.createObjectURL(file);
                    const newObj = {
                      id: `model_${uuidv4().slice(0, 8)}`,
                      type: 'external_model',
                      ext: ext,
                      url: url,
                      position: [0, 0, 0],
                      rotation: [0, 0, 0],
                      scale: [1, 1, 1],
                      label: `Imported: ${file.name}`
                    };
                    setSceneObjects(prev => [...prev, newObj]);
                    setChatHistory(prev => [...prev, { id: Date.now(), role: 'ai', text: `📦 Imported "${file.name}". You can move and rotate it manually.` }]);
                  }
                  e.target.value = '';
                }} 
              />
            </label>
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

        <Canvas shadows gl={{ preserveDrawingBuffer: true }} dpr={[1, 2]} onPointerMissed={() => setSelectedId(null)}>
          <color attach="background" args={['#f3f4f6']} />
          <PerspectiveCamera makeDefault position={[6, 5, 6]} fov={45} />
          <ambientLight intensity={1.2} />
          <directionalLight position={[8, 12, 8]} intensity={1.5} castShadow shadow-mapSize={1024} />
          <Environment preset="apartment" />

          <MainScene
            sceneObjects={sceneObjects}
            setSceneObjects={setSceneObjects}
            ghostObject={ghostObject}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            transformMode={transformMode}
            sceneRef={sceneRef}
          />

          <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
            <GizmoViewport axisColors={['#ef4444', '#10b981', '#3b82f6']} labelColor="black" />
          </GizmoHelper>
        </Canvas>
      </div>

      {/* ---- Right Sidebar (Outliner & Property Panel) ---- */}
      <div className="right-sidebar">
        <div className="panel-header">
          <Layers size={18} /> Outliner
        </div>
        <div className="outliner-list">
          {sceneObjects.map(obj => (
            <div 
              key={obj.id} 
              className={`outliner-item ${selectedId === obj.id ? 'active' : ''}`}
              onClick={() => setSelectedId(obj.id)}
            >
              <Box size={14} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {obj.label || obj.type}
              </span>
            </div>
          ))}
          {sceneObjects.length === 0 && (
            <div style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', padding: '10px' }}>Empty scene</div>
          )}
        </div>

        {selectedId && (
          <div className="property-panel">
            <div style={{ fontWeight: 600, borderBottom: '1px solid rgba(0,0,0,0.05)', paddingBottom: '8px' }}>
              Properties
            </div>
            {(() => {
              const sel = sceneObjects.find(o => o.id === selectedId);
              if (!sel) return null;
              
              const updateProp = (field, idx, val) => {
                const num = parseFloat(val);
                if (isNaN(num)) return;
                setSceneObjects(prev => prev.map(o => {
                  if (o.id !== selectedId) return o;
                  const newArr = [...(o[field] || [0,0,0])];
                  newArr[idx] = num;
                  return { ...o, [field]: newArr };
                }));
              };

              return (
                <>
                  <div className="prop-row">
                    <span className="prop-label">Position</span>
                    <div className="prop-inputs">
                      <input type="number" step="0.1" className="prop-input" value={sel.position?.[0] ?? 0} onChange={(e) => updateProp('position', 0, e.target.value)} title="X" />
                      <input type="number" step="0.1" className="prop-input" value={sel.position?.[1] ?? 0} onChange={(e) => updateProp('position', 1, e.target.value)} title="Y" />
                      <input type="number" step="0.1" className="prop-input" value={sel.position?.[2] ?? 0} onChange={(e) => updateProp('position', 2, e.target.value)} title="Z" />
                    </div>
                  </div>
                  <div className="prop-row">
                    <span className="prop-label">Rotation</span>
                    <div className="prop-inputs">
                      <input type="number" step="15" className="prop-input" value={sel.rotation?.[0] ?? 0} onChange={(e) => updateProp('rotation', 0, e.target.value)} title="X" />
                      <input type="number" step="15" className="prop-input" value={sel.rotation?.[1] ?? 0} onChange={(e) => updateProp('rotation', 1, e.target.value)} title="Y" />
                      <input type="number" step="15" className="prop-input" value={sel.rotation?.[2] ?? 0} onChange={(e) => updateProp('rotation', 2, e.target.value)} title="Z" />
                    </div>
                  </div>
                  <div className="prop-row">
                    <span className="prop-label">Scale</span>
                    <div className="prop-inputs">
                      <input type="number" step="0.1" className="prop-input" value={sel.scale?.[0] ?? 1} onChange={(e) => updateProp('scale', 0, e.target.value)} title="X" />
                      <input type="number" step="0.1" className="prop-input" value={sel.scale?.[1] ?? 1} onChange={(e) => updateProp('scale', 1, e.target.value)} title="Y" />
                      <input type="number" step="0.1" className="prop-input" value={sel.scale?.[2] ?? 1} onChange={(e) => updateProp('scale', 2, e.target.value)} title="Z" />
                    </div>
                  </div>

                  {/* Targeted AI Command */}
                  <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', color: 'var(--color-accent)' }}>
                      Targeted AI Instruction
                    </div>
                    <div className="chat-input-area" style={{ padding: 0 }}>
                      <input 
                        type="text" 
                        className="input-field" 
                        placeholder={`e.g. Make it red`} 
                        id="targeted-ai-input"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const val = e.target.value;
                            if (val.trim()) {
                              handleSend(`[Targeted instruction for ${sel.label || sel.id}]: ${val}`);
                              e.target.value = '';
                            }
                          }
                        }}
                      />
                      <button 
                        className="btn btn-primary" 
                        onClick={() => {
                          const input = document.getElementById('targeted-ai-input');
                          if (input && input.value.trim()) {
                            handleSend(`[Targeted instruction for ${sel.label || sel.id}]: ${input.value}`);
                            input.value = '';
                          }
                        }}
                        disabled={isLoading}
                      >
                        <Send size={14} />
                      </button>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        )}
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
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button className="btn btn-icon" onClick={() => duplicateProfile(p.id)} title="Duplicate Profile">
                      <Copy size={16} />
                    </button>
                    {aiProfiles.length > 1 && (
                      <button className="btn btn-icon" onClick={() => removeProfile(p.id)} title="Remove Profile" style={{ color: 'var(--color-danger)' }}>
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
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
                      <div className="guide-note">⚠️ Direct browser calls to Anthropic may be blocked by CORS. If you get errors, use OpenRouter or a local model instead.</div>
                    </>
                  )}
                  {p.provider === PROVIDERS.OPENROUTER && (
                    <>
                      <div className="guide-title">📖 OpenRouter Setup Guide</div>
                      <ol className="guide-steps">
                        <li><strong>Get an API Key:</strong> Go to <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">openrouter.ai/keys</a> and create a key.</li>
                        <li><strong>Paste the key below.</strong> It starts with <code>sk-or-...</code></li>
                        <li><strong>Model:</strong> Use any model from <a href="https://openrouter.ai/models" target="_blank" rel="noreferrer">the model list</a>. Format: <code>provider/model-name</code></li>
                      </ol>
                      <div className="guide-note">💡 OpenRouter lets you access 100+ models (GPT-4o, Claude, Gemini, Llama, etc.) with a single API key. Great for switching between models without managing multiple accounts.</div>
                    </>
                  )}
                  {p.provider === PROVIDERS.GEMINI && (
                    <>
                      <div className="guide-title">📖 Google Gemini Setup Guide</div>
                      <ol className="guide-steps">
                        <li><strong>Get an API Key:</strong> Go to <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com/apikey</a> and create a key.</li>
                        <li><strong>Paste the key below.</strong></li>
                        <li><strong>Model:</strong> Use <code>gemini-2.5-flash</code> (fast & cheap) or <code>gemini-2.5-pro</code> (best quality).</li>
                      </ol>
                      <div className="guide-note">💡 Gemini has a generous free tier. Great for testing without spending money.</div>
                    </>
                  )}
                </div>

                {(p.provider === PROVIDERS.OPENAI || p.provider === PROVIDERS.ANTHROPIC || p.provider === PROVIDERS.OPENROUTER || p.provider === PROVIDERS.GEMINI) && (
                  <div className="form-group">
                    <label>API Key</label>
                    <input
                      type="password"
                      className="input-field"
                      placeholder={
                        p.provider === PROVIDERS.OPENAI ? 'sk-...' :
                        p.provider === PROVIDERS.ANTHROPIC ? 'sk-ant-...' :
                        p.provider === PROVIDERS.OPENROUTER ? 'sk-or-...' :
                        'AIza...'
                      }
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
                      const result = await callAI(p.provider, p, 'Connection Test: Respond with a message "Lakar CAD is connected" and one tool call to create a 0.5m green box at origin.', 'Empty scene.');
                      if (result && (result.tool || result.tools)) {
                        setChatHistory(prev => [...prev, { id: Date.now(), role: 'ai', text: `✅ Connection successful! ${PROVIDER_LABELS[p.provider]} is working.` }]);
                      } else {
                        setChatHistory(prev => [...prev, { id: Date.now(), role: 'ai', text: `⚠️ Connected but got unexpected response structure. Check model name.` }]);
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

            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <button className="btn btn-primary" onClick={addProfile}><Plus size={16} /> Add Profile</button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Asset Library Modal ---- */}
      {isLibraryOpen && (
        <div className="modal-overlay" onClick={() => setIsLibraryOpen(false)}>
          <div className="modal-content glass" onClick={(e) => e.stopPropagation()} style={{ width: '800px', height: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <h2>Poly Haven Assets</h2>
                <div className="search-box" style={{ background: 'rgba(0,0,0,0.05)', borderRadius: '20px', padding: '4px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Search size={16} color="var(--color-text-muted)" />
                  <input 
                    type="text" 
                    placeholder="Search models..." 
                    style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.9rem', width: '200px' }}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
              <button className="btn btn-icon" onClick={() => setIsLibraryOpen(false)}><X size={18} /></button>
            </div>
            
            <div style={{ padding: '16px', flex: 1, overflowY: 'auto' }}>
              {libraryLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '12px', color: 'var(--color-text-muted)' }}>
                  <Loader2 className="animate-spin" size={32} />
                  <p>Fetching CC0 assets from Poly Haven...</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '16px' }}>
                  {Object.entries(polyHavenAssets)
                    .filter(([id, data]) => !searchQuery || data.name.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map(([id, data]) => (
                    <div key={id} className="asset-card" style={{ border: '1px solid var(--border-glass)', borderRadius: '8px', overflow: 'hidden', background: 'rgba(255,255,255,0.05)', transition: 'transform 0.2s' }}>
                      <div style={{ position: 'relative', width: '100%', paddingTop: '100%', background: 'rgba(0,0,0,0.1)' }}>
                        <img 
                          src={data.thumbnail_url} 
                          alt={data.name} 
                          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                          loading="lazy"
                        />
                      </div>
                      <div style={{ padding: '8px' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '8px' }} title={data.name}>
                          {data.name}
                        </div>
                        <button 
                          className="btn btn-primary" 
                          style={{ width: '100%', fontSize: '0.75rem', padding: '4px' }}
                          onClick={() => insertPolyHavenAsset(id, data.name)}
                        >
                          Insert
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ padding: '12px', fontSize: '0.75rem', color: 'var(--color-text-muted)', textAlign: 'center', borderTop: '1px solid var(--border-glass)' }}>
              Assets provided by <a href="https://polyhaven.com" target="_blank" rel="noreferrer" style={{ color: 'var(--color-accent)' }}>Poly Haven</a> under CC0 license.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
