import React, { useState, useCallback } from 'react';
import TopBar    from './components/layout/TopBar';
import LeftToolbar from './components/layout/LeftToolbar';
import RightTray from './components/layout/RightTray';
import BottomBar from './components/layout/BottomBar';
import Viewport  from './components/canvas/Viewport';
import { useCadEngine } from './hooks/useCadEngine';
import { serializeForAI } from './services/geometryEngine';
import { callAI } from './services/aiService';

const DEFAULT_AI_CONFIG = {
  provider: 'ollama',
  model:    'llama3',
  apiKey:   '',
  baseUrl:  'http://localhost:11434',
};

export default function App() {
  const {
    scene,
    activeTool, setActiveTool,
    selectedIds, setSelectedIds,
    inference,
    lineStart, ghostEnd,
    measurements, setMeasurements,
    hoveredFaceId,
    pushPullDepth,
    handlePointerMove,
    handlePointerDown,
    handleFaceHover,
    handleMeasurementsSubmit,
  } = useCadEngine();

  // ── AI ────────────────────────────────────────────────────
  const [aiConfig, setAiConfig] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lakar_ai_v2')) || DEFAULT_AI_CONFIG; }
    catch { return DEFAULT_AI_CONFIG; }
  });
  const [chatHistory, setChatHistory] = useState([
    { role: 'ai', text: '👋 Lakar CAD ready.\n\n• Line (L): click to draw, closes → face auto-creates\n• Push/Pull (P): hover face → click → drag to extrude\n• Orbit: Middle mouse always\n• Configure AI in Settings panel below.' }
  ]);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const updateAiConfig = (cfg) => {
    setAiConfig(cfg);
    localStorage.setItem('lakar_ai_v2', JSON.stringify(cfg));
  };

  const handleSendChat = useCallback(async (text) => {
    setChatHistory(prev => [...prev, { role: 'user', text }]);
    setIsAiLoading(true);
    try {
      const context = serializeForAI(scene);
      const response = await callAI(aiConfig.provider, aiConfig, text, context);
      const msg = response?.message || JSON.stringify(response);
      setChatHistory(prev => [...prev, { role: 'ai', text: msg }]);
    } catch (err) {
      setChatHistory(prev => [...prev, { role: 'ai', text: `⚠️ ${err.message}` }]);
    } finally {
      setIsAiLoading(false);
    }
  }, [scene, aiConfig]);

  // ── Pointer passthrough (always pass live scene) ──────────
  const onMove = useCallback((pt, s) => handlePointerMove(pt, s), [handlePointerMove]);
  const onDown = useCallback((pt, s) => handlePointerDown(pt, s), [handlePointerDown]);

  // Face interaction for Push/Pull
  const onFaceDown = useCallback((faceId) => {
    // Reuse handlePointerDown logic by passing a fake "face click"
    // The push/pull logic in the hook responds to hoveredFaceId
    handlePointerDown(new (require('three').Vector3)(0, 0, 0), scene);
  }, [handlePointerDown, scene]);

  // ── Save ─────────────────────────────────────────────────
  const handleSave = () => {
    const blob = new Blob([JSON.stringify(scene, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: 'lakar_model.json' });
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="sk-layout">
      <TopBar projectName="Untitled" onMenuClick={() => {}} onSave={handleSave} />

      <LeftToolbar activeTool={activeTool} setTool={setActiveTool} />

      <Viewport
        scene={scene}
        selectedIds={selectedIds}
        inference={inference}
        lineStart={lineStart}
        ghostEnd={ghostEnd}
        activeTool={activeTool}
        hoveredFaceId={hoveredFaceId}
        pushPullDepth={pushPullDepth}
        onPointerMove={onMove}
        onPointerDown={onDown}
        onFaceHover={handleFaceHover}
        onFaceDown={(faceId) => {
          // Clicking a face in push/pull mode: trigger the hook
          handlePointerDown(new (require('three').Vector3)(0, 0, 0), scene);
        }}
      />

      <RightTray
        scene={scene}
        selectedIds={selectedIds}
        onSelect={(id) => setSelectedIds(new Set([id]))}
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
