import React, { useState, useRef, useEffect } from 'react';
import { Info, List, MessageSquare, Settings, Minus, ChevronRight, ChevronDown, Box, GitBranch } from 'lucide-react';

// ─── Collapsible Panel ────────────────────────────────────────
function Panel({ title, icon: Icon, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="sk-panel">
      <div className="sk-panel-header" onClick={() => setOpen(o => !o)}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon size={13} />
          {title}
        </span>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </div>
      {open && <div className="sk-panel-body">{children}</div>}
    </div>
  );
}

// ─── Entity Info panel ────────────────────────────────────────
function EntityInfo({ scene, selectedIds }) {
  const first = [...selectedIds][0];
  const entity = first
    ? (scene.vertices[first] || scene.edges[first] || scene.faces[first])
    : null;

  if (!entity) {
    return <div style={{ color: 'var(--sk-text-light)', fontStyle: 'italic' }}>No selection</div>;
  }

  if (entity.type === 'vertex') {
    return (
      <>
        <div className="sk-ei-row">
          <span className="sk-ei-label">Type</span>
          <span style={{ fontSize: 11 }}>Vertex</span>
        </div>
        {['x', 'y', 'z'].map(ax => (
          <div className="sk-ei-row" key={ax}>
            <span className="sk-ei-label">{ax.toUpperCase()}</span>
            <span className="sk-ei-value">{entity[ax].toFixed(4)} m</span>
          </div>
        ))}
      </>
    );
  }

  if (entity.type === 'edge') {
    const v1 = scene.vertices[entity.v1];
    const v2 = scene.vertices[entity.v2];
    const len = v1 && v2
      ? Math.sqrt((v2.x-v1.x)**2 + (v2.y-v1.y)**2 + (v2.z-v1.z)**2).toFixed(4)
      : '?';
    return (
      <>
        <div className="sk-ei-row">
          <span className="sk-ei-label">Type</span>
          <span style={{ fontSize: 11 }}>Edge</span>
        </div>
        <div className="sk-ei-row">
          <span className="sk-ei-label">Length</span>
          <span className="sk-ei-value">{len} m</span>
        </div>
      </>
    );
  }

  return <div style={{ fontSize: 11 }}>{entity.type} selected</div>;
}

// ─── Outliner ─────────────────────────────────────────────────
function Outliner({ scene, selectedIds, onSelect }) {
  const vCount = Object.keys(scene.vertices).length;
  const eCount = Object.keys(scene.edges).length;

  if (vCount === 0 && eCount === 0) {
    return <div className="sk-outliner-empty">Scene is empty</div>;
  }

  return (
    <div className="sk-outliner-scroll">
      {eCount > 0 && (
        <div>
          <div style={{ fontSize: 10, color: 'var(--sk-text-light)', padding: '2px 0', fontWeight: 600 }}>EDGES</div>
          {Object.values(scene.edges).map(e => (
            <div
              key={e.id}
              className={`sk-outliner-item ${selectedIds.has(e.id) ? 'selected' : ''}`}
              onClick={() => onSelect(e.id)}
            >
              <Minus size={11} />
              <span>Edge</span>
              <span style={{ marginLeft: 'auto', color: 'inherit', opacity: 0.6, fontSize: 10 }}>
                {e.id.slice(0, 6)}
              </span>
            </div>
          ))}
        </div>
      )}
      {vCount > 0 && (
        <div>
          <div style={{ fontSize: 10, color: 'var(--sk-text-light)', padding: '2px 0 2px', fontWeight: 600 }}>VERTICES</div>
          {Object.values(scene.vertices).map(v => (
            <div
              key={v.id}
              className={`sk-outliner-item ${selectedIds.has(v.id) ? 'selected' : ''}`}
              onClick={() => onSelect(v.id)}
            >
              <Box size={11} />
              <span>Vertex ({v.x.toFixed(1)}, {v.y.toFixed(1)}, {v.z.toFixed(1)})</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── AI Chat Panel ────────────────────────────────────────────
function AIPanel({ chatHistory, onSend, isLoading, aiConfig, onConfigChange }) {
  const inputRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatHistory]);

  const send = () => {
    const val = inputRef.current?.value?.trim();
    if (val) { onSend(val); inputRef.current.value = ''; }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="sk-ai-scroll" ref={scrollRef}>
        {chatHistory.map((msg, i) => (
          <div key={i} className={`sk-ai-msg ${msg.role}`}>
            {msg.text}
          </div>
        ))}
        {isLoading && (
          <div className="sk-ai-msg ai" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="sk-spinner" /> Thinking...
          </div>
        )}
      </div>
      <div className="sk-ai-input-row">
        <input
          ref={inputRef}
          className="sk-ai-input"
          placeholder="Ask AI..."
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
        />
        <button className="sk-ai-send" onClick={send} disabled={isLoading}>
          Send
        </button>
      </div>
    </div>
  );
}

// ─── Settings Panel ───────────────────────────────────────────
function SettingsPanel({ aiConfig, onConfigChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="sk-settings-row">
        <label className="sk-settings-label">AI Provider</label>
        <select
          className="sk-settings-select"
          value={aiConfig.provider}
          onChange={e => onConfigChange({ ...aiConfig, provider: e.target.value })}
        >
          <option value="openai">OpenAI</option>
          <option value="openrouter">OpenRouter</option>
          <option value="gemini">Google Gemini</option>
          <option value="anthropic">Anthropic</option>
          <option value="ollama">Ollama (Local)</option>
          <option value="lmstudio">LM Studio (Local)</option>
        </select>
      </div>
      <div className="sk-settings-row">
        <label className="sk-settings-label">Model</label>
        <input
          className="sk-settings-input"
          placeholder="e.g. gpt-4o or llama3"
          value={aiConfig.model}
          onChange={e => onConfigChange({ ...aiConfig, model: e.target.value })}
        />
      </div>
      {aiConfig.provider !== 'ollama' && aiConfig.provider !== 'lmstudio' && (
        <div className="sk-settings-row">
          <label className="sk-settings-label">API Key</label>
          <input
            className="sk-settings-input"
            type="password"
            placeholder="sk-..."
            value={aiConfig.apiKey}
            onChange={e => onConfigChange({ ...aiConfig, apiKey: e.target.value })}
          />
        </div>
      )}
      {(aiConfig.provider === 'ollama' || aiConfig.provider === 'lmstudio') && (
        <div className="sk-settings-row">
          <label className="sk-settings-label">Base URL</label>
          <input
            className="sk-settings-input"
            placeholder="http://localhost:11434"
            value={aiConfig.baseUrl}
            onChange={e => onConfigChange({ ...aiConfig, baseUrl: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}

// ─── Main RightTray export ────────────────────────────────────
export default function RightTray({
  scene,
  selectedIds,
  onSelect,
  chatHistory,
  onSendChat,
  isLoading,
  aiConfig,
  onAiConfigChange,
}) {
  return (
    <aside className="sk-tray">
      <Panel title="Entity Info" icon={Info} defaultOpen>
        <EntityInfo scene={scene} selectedIds={selectedIds} />
      </Panel>

      <Panel title="Outliner" icon={List} defaultOpen>
        <Outliner scene={scene} selectedIds={selectedIds} onSelect={onSelect} />
      </Panel>

      <Panel title="AI Assistant" icon={MessageSquare} defaultOpen>
        <AIPanel
          chatHistory={chatHistory}
          onSend={onSendChat}
          isLoading={isLoading}
          aiConfig={aiConfig}
        />
      </Panel>

      <Panel title="AI Settings" icon={Settings} defaultOpen={false}>
        <SettingsPanel aiConfig={aiConfig} onConfigChange={onAiConfigChange} />
      </Panel>
    </aside>
  );
}
