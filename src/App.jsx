import { useState, useCallback } from 'react';
import TopBar from './components/layout/TopBar';
import LeftToolbar from './components/layout/LeftToolbar';
import RightTray from './components/layout/RightTray';
import BottomBar from './components/layout/BottomBar';
import Viewport from './components/canvas/Viewport';
import { useCadEngine } from './hooks/useCadEngine';
import { callAI } from './services/aiService';
import { saveModelJSON, openModelJSON, exportModel } from './services/fileio';

const DEFAULT_AI_CONFIG = {
  provider: 'ollama',
  model: 'llama3',
  apiKey: '',
  baseUrl: 'http://localhost:11434',
};

export default function App() {
  const engine = useCadEngine();
  const { model, version } = engine;

  // ── AI assistant (reads the same scene graph the engine edits) ────────────
  const [aiConfig, setAiConfig] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lakar_ai_v2')) || DEFAULT_AI_CONFIG; }
    catch { return DEFAULT_AI_CONFIG; }
  });
  const [chatHistory, setChatHistory] = useState([
    {
      role: 'ai',
      text: '👋 Lakar CAD ready.\n\n• Line (L) / Rectangle (R) / Circle (C): closed loops become faces\n• Push/Pull (P): click a face, drag, click (or type a distance)\n• Move (M), Tape (T), Eraser (E)\n• G = group selection, Shift+G = component, double-click to edit inside\n• Arrow keys lock to the red/blue/green axes\n• File menu: save .json, export OBJ / STL / GLB',
    },
  ]);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const updateAiConfig = (cfg) => {
    setAiConfig(cfg);
    localStorage.setItem('lakar_ai_v2', JSON.stringify(cfg));
  };

  const handleSendChat = useCallback(async (text) => {
    setChatHistory((prev) => [...prev, { role: 'user', text }]);
    setIsAiLoading(true);
    try {
      const context = JSON.stringify(model.describeForAI());
      const response = await callAI(aiConfig.provider, aiConfig, text, context);
      const msg = response?.message || JSON.stringify(response);
      setChatHistory((prev) => [...prev, { role: 'ai', text: msg }]);
    } catch (err) {
      setChatHistory((prev) => [...prev, { role: 'ai', text: `⚠️ ${err.message}` }]);
    } finally {
      setIsAiLoading(false);
    }
  }, [model, aiConfig]);

  // ── file actions ───────────────────────────────────────────────────────────
  const handleFileAction = useCallback(async (action) => {
    try {
      switch (action) {
        case 'save': saveModelJSON(model); break;
        case 'open': {
          const loaded = await openModelJSON();
          if (loaded) engine.replaceModel(loaded);
          break;
        }
        case 'export-obj': exportModel(model, 'obj'); break;
        case 'export-stl': exportModel(model, 'stl'); break;
        case 'export-glb': exportModel(model, 'glb'); break;
        case 'new':
          if (window.confirm('Start a new model? Unsaved changes will be lost.')) {
            window.location.reload();
          }
          break;
        default: break;
      }
    } catch (err) {
      alert(`File error: ${err.message}`);
    }
  }, [model, engine]);

  return (
    <div className="sk-layout">
      <TopBar
        projectName="Untitled"
        contextDepth={engine.enterContextDepth}
        onFileAction={handleFileAction}
        onUndo={engine.undo}
        onRedo={engine.redo}
        onMakeGroup={engine.makeGroup}
        onMakeComponent={engine.makeComponent}
        onExplode={engine.explodeSelected}
        hasSelection={engine.selection.size > 0}
      />

      <LeftToolbar activeTool={engine.activeTool} setTool={engine.setActiveTool} />

      <Viewport
        model={model}
        version={version}
        activeTool={engine.activeTool}
        selection={engine.selection}
        inference={engine.inference}
        preview={engine.preview}
        hoveredFaceId={engine.hoveredFaceId}
        onPointerRay={engine.onPointerRay}
        onClick={engine.onClick}
        onDoubleClick={engine.onDoubleClick}
      />

      <RightTray
        model={model}
        version={version}
        selection={engine.selection}
        onSelect={(id) => engine.setSelection(new Set([id]))}
        chatHistory={chatHistory}
        onSendChat={handleSendChat}
        isLoading={isAiLoading}
        aiConfig={aiConfig}
        onAiConfigChange={updateAiConfig}
      />

      <BottomBar
        activeTool={engine.activeTool}
        axisLock={engine.axisLock}
        measurement={engine.measurement}
        onMeasurementChange={engine.setMeasurement}
        onMeasurementSubmit={engine.submitMeasurement}
      />
    </div>
  );
}
