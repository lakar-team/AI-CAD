import React, { useState, useCallback } from 'react';
import TopBar    from './components/layout/TopBar';
import LeftToolbar from './components/layout/LeftToolbar';
import RightTray from './components/layout/RightTray';
import BottomBar from './components/layout/BottomBar';
import Viewport  from './components/canvas/Viewport';
import { useCadEngine } from './hooks/useCadEngine';
import { serializeForAI } from './services/geometryEngine';
import { callAI } from './services/aiService';

// ─── Default AI config ─────────────────────────────────────────
const DEFAULT_AI_CONFIG = {
  provider: 'ollama',
  model:    'llama3',
  apiKey:   '',
  baseUrl:  'http://localhost:11434',
};

export default function App() {
  // ── CAD Engine ────────────────────────────────────────────────
  const {
    scene,
    activeTool,
    setActiveTool,
    selectedIds,
    setSelectedIds,
    inference,
    lineStart,
    ghostEnd,
    measurements,
    setMeasurements,
    handlePointerMove,
    handlePointerDown,
    handleMeasurementsSubmit,
  } = useCadEngine();

  // ── AI ────────────────────────────────────────────────────────
  const [aiConfig, setAiConfig] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lakar_ai_config')) || DEFAULT_AI_CONFIG; }
    catch { return DEFAULT_AI_CONFIG; }
  });
  const [chatHistory, setChatHistory] = useState([
    { role: 'ai', text: 'Lakar CAD ready. I can read and manipulate the model. Configure your AI provider in the Settings panel below.' }
  ]);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const updateAiConfig = (cfg) => {
    setAiConfig(cfg);
    localStorage.setItem('lakar_ai_config', JSON.stringify(cfg));
  };

  const handleSendChat = useCallback(async (text) => {
    setChatHistory(prev => [...prev, { role: 'user', text }]);
    setIsAiLoading(true);
    try {
      const context = serializeForAI(scene);
      const response = await callAI(aiConfig.provider, aiConfig, text, context);
      setChatHistory(prev => [...prev, { role: 'ai', text: response.message || JSON.stringify(response) }]);
    } catch (err) {
      setChatHistory(prev => [...prev, { role: 'ai', text: `⚠️ ${err.message}` }]);
    } finally {
      setIsAiLoading(false);
    }
  }, [scene, aiConfig]);

  // ── Pointer → pass current scene so inference is up-to-date ──
  const onPointerMove = useCallback((pt) => handlePointerMove(pt, scene), [handlePointerMove, scene]);
  const onPointerDown = useCallback((pt) => handlePointerDown(pt, scene), [handlePointerDown, scene]);

  // ── Entity selection from Outliner ─────────────────────────
  const handleOutlinerSelect = (id) => setSelectedIds(new Set([id]));

  // ── File ops (real save/load via JSON) ─────────────────────
  const handleSave = () => {
    const data = JSON.stringify({ scene }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'lakar_model.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="sk-layout">
      <TopBar
        projectName="Untitled"
        onMenuClick={() => {}}
        onSave={handleSave}
      />

      <LeftToolbar activeTool={activeTool} setTool={setActiveTool} />

      <Viewport
        scene={scene}
        selectedIds={selectedIds}
        inference={inference}
        lineStart={lineStart}
        ghostEnd={ghostEnd}
        activeTool={activeTool}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
      />

      <RightTray
        scene={scene}
        selectedIds={selectedIds}
        onSelect={handleOutlinerSelect}
        chatHistory={chatHistory}
        onSendChat={handleSendChat}
        isLoading={isAiLoading}
        aiConfig={aiConfig}
        onAiConfigChange={updateAiConfig}
      />

      <BottomBar
        activeTool={activeTool}
        measurements={measurements}
        onMeasurementsChange={setMeasurements}
        onMeasurementsSubmit={handleMeasurementsSubmit}
      />
    </div>
  );
}
