import React, { useEffect, useState } from 'react';
import TopBar from './components/layout/TopBar';
import LeftToolbar from './components/layout/LeftToolbar';
import RightTray from './components/layout/RightTray';
import BottomBar from './components/layout/BottomBar';
import Viewport from './components/canvas/Viewport';
import { useCadEngine } from './hooks/useCadEngine';
import { callAI } from './services/aiService';

export default function App() {
  const {
    model,
    activeTool,
    setActiveTool,
    selectedId,
    setSelectedId,
    inference,
    lineStart,
    ghostLineEnd,
    handlePointerMove,
    handlePointerDown,
    handleMeasurementsSubmit,
    cancelTool
  } = useCadEngine();

  const [status, setStatus] = useState('Ready');
  const [measurements, setMeasurements] = useState('');
  const [chatHistory, setChatHistory] = useState([
    { role: 'ai', text: 'SketchUp Replica Engine Loaded. I understand the Edge/Face manifold. Ask me to create or manipulate geometry.' }
  ]);
  const [isLoading, setIsLoading] = useState(false);

  // --- Escape key to cancel tools ---
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        cancelTool();
        setActiveTool('select');
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [cancelTool, setActiveTool]);

  // --- AI Logic ---
  const handleSendChat = async (text) => {
    setChatHistory(prev => [...prev, { role: 'user', text }]);
    setIsLoading(true);
    try {
      const context = JSON.stringify(model.serialize());
      const response = await callAI('openrouter', { apiKey: '' }, text, context);
      setChatHistory(prev => [...prev, { role: 'ai', text: response.message }]);
      // Tool handling will be wired to model.addVertex/addEdge next
    } catch (err) {
      setChatHistory(prev => [...prev, { role: 'ai', text: `Error: ${err.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-layout">
      <TopBar projectName="SketchUp Replica" saveStatus="saved" />
      
      <LeftToolbar activeTool={activeTool} setTool={setActiveTool} />
      
      <Viewport 
        model={model}
        selectedId={selectedId}
        inference={inference}
        lineStart={lineStart}
        ghostLineEnd={ghostLineEnd}
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerDown}
      />
      
      <RightTray 
        selectedObject={selectedId ? { id: selectedId, name: 'Entity', type: 'Geom' } : null}
        sceneRoot={{ id: 'root', name: 'Model', type: 'scene', children: [] }} // Placeholder for real outliner
        chatHistory={chatHistory}
        onSendChat={handleSendChat}
        onSelectNode={setSelectedId}
      />
      
      <BottomBar 
        status={`${activeTool.toUpperCase()} Tool active. ${(inference && inference.type !== 'none') ? `Snapped to ${inference.type}` : ''}`} 
        measurements={measurements}
        onMeasurementsChange={setMeasurements}
        onMeasurementsSubmit={(val) => {
          handleMeasurementsSubmit(val);
          setMeasurements('');
        }}
      />

      {isLoading && (
        <div style={{ position: 'fixed', bottom: '50px', right: '300px', padding: '8px 16px', background: 'var(--color-accent)', color: '#fff', borderRadius: '20px', fontSize: '0.8rem', zIndex: 200 }}>
          AI Thinking...
        </div>
      )}
    </div>
  );
}
