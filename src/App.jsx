import { useState, useCallback, useEffect, useRef } from 'react';
import TopBar from './components/layout/TopBar';
import LeftToolbar from './components/layout/LeftToolbar';
import RightTray from './components/layout/RightTray';
import BottomBar from './components/layout/BottomBar';
import Viewport from './components/canvas/Viewport';
import { useCadEngine } from './hooks/useCadEngine';
import { useCharacterEngine } from './hooks/useCharacterEngine';
import { callAI } from './services/aiService';
import { saveModelJSON, openModelJSON, exportModel } from './services/fileio';

const DEFAULT_AI_CONFIG = {
  provider: 'ollama',
  model: 'llama3',
  apiKey: '',
  baseUrl: 'http://localhost:11434',
};

// Draw tools that support typed measurements
const DRAW_TOOLS = new Set(['line', 'rect', 'circle', 'pushpull', 'move', 'tape', 'offset', 'annotate']);

export default function App() {
  const engine = useCadEngine();
  const { model, version } = engine;
  const characterEngine = useCharacterEngine();
  const [appMode, setAppMode] = useState('cad');
  const sampleLoadedRef = useRef(false);

  // Auto-load the sample character the first time character mode is entered
  useEffect(() => {
    if (appMode === 'character' && !sampleLoadedRef.current) {
      sampleLoadedRef.current = true;
      characterEngine.loadSampleModel('/samples/Soldier.glb', 'Soldier (sample)')
        .catch((err) => console.warn('Sample model load failed:', err.message));
    }
  }, [appMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ref to the VCB measurement input (for auto-focus on digit keypress)
  const measurementInputRef = useRef(null);

  // ── AI assistant (reads the same scene graph the engine edits) ────────────
  const [aiConfig, setAiConfig] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lakar_ai_v2')) || DEFAULT_AI_CONFIG; }
    catch { return DEFAULT_AI_CONFIG; }
  });
  const [chatHistory, setChatHistory] = useState([
    {
      role: 'ai',
      text: '👋 Lakar CAD ready.\n\n• Line (L) / Rectangle (R) / Circle (C): closed loops become faces\n• Push/Pull (P): click a face, drag, click (or type a distance)\n• Move (M), Tape (T), Eraser (E)\n• G = group selection, Shift+G = component, double-click to edit inside\n• Arrow keys lock to the red/blue/green axes\n• Box-drag left→right to window-select (solid blue), right→left to crossing-select (dashed green)\n• File menu: save .json, export OBJ / STL / GLB',
    },
  ]);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const updateAiConfig = (cfg) => {
    setAiConfig(cfg);
    localStorage.setItem('lakar_ai_v2', JSON.stringify(cfg));
  };

  // Auto-focus the VCB when user types a digit while a draw tool is active.
  // Must be after all useState calls to respect Rules of Hooks ordering.
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!DRAW_TOOLS.has(engine.activeTool)) return;
      if (/^[\d.\-]$/.test(e.key)) {
        const inp = measurementInputRef.current;
        if (inp) inp.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [engine.activeTool]);

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

  const inMapBones = appMode === 'character' && characterEngine.charPrepTool === 'mapbones';

  return (
    <div
      className="sk-layout"
      style={inMapBones ? { '--toolbar-width': '190px' } : undefined}
    >
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
        appMode={appMode}
        onModeChange={setAppMode}
      />

      <LeftToolbar
        activeTool={engine.activeTool}
        setTool={engine.setActiveTool}
        appMode={appMode}
        characterEngine={characterEngine}
      />

      <Viewport
        model={model}
        version={version}
        activeTool={engine.activeTool}
        selection={engine.selection}
        inference={engine.inference}
        preview={engine.preview}
        hoveredFaceId={engine.hoveredFaceId}
        measurement={engine.measurement}
        selectionCentroid={engine.selectionCentroid}
        guides={engine.guides}
        annotations={engine.annotations}
        units={engine.units}
        refPlanes={engine.refPlanes}
        onPointerRay={engine.onPointerRay}
        onClick={engine.onClick}
        onDoubleClick={engine.onDoubleClick}
        onBoxSelect={engine.selectByScreenBox}
        onGizmoAxisClick={engine.onGizmoAxisClick}
        appMode={appMode}
        characterEngine={characterEngine}
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
        units={engine.units}
        onEditEdgeLength={engine.editEdgeLength}
        onEditVertexPosition={engine.editVertexPosition}
        appMode={appMode}
        characterEngine={characterEngine}
      />

      <BottomBar
        activeTool={engine.activeTool}
        axisLock={engine.axisLock}
        measurement={engine.measurement}
        onMeasurementChange={engine.setMeasurement}
        onMeasurementSubmit={engine.submitMeasurement}
        inputRef={measurementInputRef}
        units={engine.units}
        onUnitsChange={engine.changeUnits}
        appMode={appMode}
        characterEngine={characterEngine}
      />
    </div>
  );
}
