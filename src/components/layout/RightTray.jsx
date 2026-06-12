import { useState, useRef, useEffect } from 'react';
import {
  Info, List, MessageSquare, Settings, ChevronRight, ChevronDown,
  Box, Boxes, Component as ComponentIcon, Minus, Square,
} from 'lucide-react';

// ─── Collapsible panel ────────────────────────────────────────────────────────
function Panel({ title, icon: Icon, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="sk-panel">
      <div className="sk-panel-header" onClick={() => setOpen((o) => !o)}>
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

// ─── Entity Info ──────────────────────────────────────────────────────────────
function EntityInfo({ model, selection }) {
  const first = [...selection][0];
  if (!first) {
    return <div style={{ color: 'var(--sk-text-light)', fontStyle: 'italic' }}>No selection</div>;
  }

  const found = model.findInstance(first);
  if (found) {
    const def = model.definitions.get(found.instance.definitionId);
    const t = found.instance.transform;
    return (
      <>
        <Row label="Type" value={found.instance.type === 'component' ? 'Component instance' : 'Group'} />
        <Row label="Name" value={found.instance.name} />
        <Row label="Definition" value={def.id} />
        <Row label="Instances" value={String(model.instanceCountFor(def.id))} />
        <Row label="Position" value={`${fmt(t[12])}, ${fmt(t[13])}, ${fmt(t[14])}`} />
        <Row label="Geometry" value={`${def.mesh.vertices.size}v / ${def.mesh.edges.size}e / ${def.mesh.faces.size}f`} />
      </>
    );
  }

  const mesh = model.activeMesh();
  const hit = mesh.getEntity(first);
  if (!hit) return <div style={{ fontSize: 11 }}>{selection.size} selected</div>;

  if (hit.kind === 'vertex') {
    const [x, y, z] = hit.entity.p;
    return (
      <>
        <Row label="Type" value="Vertex" />
        <Row label="X" value={`${fmt(x)} m`} />
        <Row label="Y" value={`${fmt(y)} m`} />
        <Row label="Z" value={`${fmt(z)} m`} />
      </>
    );
  }
  if (hit.kind === 'edge') {
    const a = mesh.vertices.get(hit.entity.a).p;
    const b = mesh.vertices.get(hit.entity.b).p;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    return (
      <>
        <Row label="Type" value="Edge" />
        <Row label="Length" value={`${fmt(len)} m`} />
        <Row label="Faces" value={String(mesh.edgeFaces(hit.entity.id).size)} />
      </>
    );
  }
  if (hit.kind === 'face') {
    const n = hit.entity.normal;
    return (
      <>
        <Row label="Type" value="Face" />
        <Row label="Vertices" value={String(hit.entity.loop.length)} />
        <Row label="Normal" value={`${fmt(n[0])}, ${fmt(n[1])}, ${fmt(n[2])}`} />
      </>
    );
  }
  return null;
}

const fmt = (x) => (Math.round(x * 1000) / 1000).toString();

function Row({ label, value }) {
  return (
    <div className="sk-ei-row">
      <span className="sk-ei-label">{label}</span>
      <span className="sk-ei-value">{value}</span>
    </div>
  );
}

// ─── Outliner: the instance tree ─────────────────────────────────────────────
function OutlinerNode({ model, instance, depth, selection, onSelect }) {
  const def = model.definitions.get(instance.definitionId);
  const Icon = instance.type === 'component' ? ComponentIcon : Boxes;
  return (
    <>
      <div
        className={`sk-outliner-item ${selection.has(instance.id) ? 'selected' : ''}`}
        style={{ paddingLeft: 6 + depth * 14 }}
        onClick={() => onSelect(instance.id)}
      >
        <Icon size={11} />
        <span>{instance.name}</span>
        <span style={{ marginLeft: 'auto', opacity: 0.55, fontSize: 10 }}>
          {def.mesh.faces.size}f
        </span>
      </div>
      {def.children.map((child) => (
        <OutlinerNode
          key={child.id}
          model={model}
          instance={child}
          depth={depth + 1}
          selection={selection}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

function Outliner({ model, selection, onSelect }) {
  const root = model.root();
  const mesh = root.mesh;
  const counts = `${mesh.vertices.size}v · ${mesh.edges.size}e · ${mesh.faces.size}f`;

  if (mesh.isEmpty() && root.children.length === 0) {
    return <div className="sk-outliner-empty">Model is empty — draw something!</div>;
  }

  return (
    <div className="sk-outliner-scroll">
      <div className="sk-outliner-item" style={{ fontWeight: 600 }}>
        <Box size={11} />
        <span>Model</span>
        <span style={{ marginLeft: 'auto', opacity: 0.55, fontSize: 10 }}>{counts}</span>
      </div>
      {root.children.map((inst) => (
        <OutlinerNode
          key={inst.id}
          model={model}
          instance={inst}
          depth={1}
          selection={selection}
          onSelect={onSelect}
        />
      ))}
      {mesh.faces.size > 0 && (
        <>
          <div style={{ fontSize: 10, color: 'var(--sk-text-light)', padding: '4px 0 2px', fontWeight: 600 }}>
            LOOSE FACES
          </div>
          {[...mesh.faces.values()].map((f) => (
            <div
              key={f.id}
              className={`sk-outliner-item ${selection.has(f.id) ? 'selected' : ''}`}
              onClick={() => onSelect(f.id)}
            >
              <Square size={11} />
              <span>Face {f.id}</span>
              <span style={{ marginLeft: 'auto', opacity: 0.55, fontSize: 10 }}>{f.loop.length} pts</span>
            </div>
          ))}
        </>
      )}
      {mesh.edges.size > 0 && mesh.faces.size === 0 && (
        <>
          <div style={{ fontSize: 10, color: 'var(--sk-text-light)', padding: '4px 0 2px', fontWeight: 600 }}>
            EDGES
          </div>
          {[...mesh.edges.values()].slice(0, 50).map((e) => (
            <div
              key={e.id}
              className={`sk-outliner-item ${selection.has(e.id) ? 'selected' : ''}`}
              onClick={() => onSelect(e.id)}
            >
              <Minus size={11} />
              <span>Edge {e.id}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ─── AI chat ──────────────────────────────────────────────────────────────────
function AIPanel({ chatHistory, onSend, isLoading }) {
  const inputRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [chatHistory]);

  const send = () => {
    const val = inputRef.current?.value?.trim();
    if (val) { onSend(val); inputRef.current.value = ''; }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="sk-ai-scroll" ref={scrollRef}>
        {chatHistory.map((msg, i) => (
          <div key={i} className={`sk-ai-msg ${msg.role}`}>{msg.text}</div>
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
          placeholder="Ask AI about the model..."
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
        />
        <button className="sk-ai-send" onClick={send} disabled={isLoading}>Send</button>
      </div>
    </div>
  );
}

// ─── AI settings ──────────────────────────────────────────────────────────────
function SettingsPanel({ aiConfig, onConfigChange }) {
  const isLocal = aiConfig.provider === 'ollama' || aiConfig.provider === 'lmstudio';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="sk-settings-row">
        <label className="sk-settings-label">AI Provider</label>
        <select
          className="sk-settings-select"
          value={aiConfig.provider}
          onChange={(e) => onConfigChange({ ...aiConfig, provider: e.target.value })}
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
          onChange={(e) => onConfigChange({ ...aiConfig, model: e.target.value })}
        />
      </div>
      {!isLocal && (
        <div className="sk-settings-row">
          <label className="sk-settings-label">API Key</label>
          <input
            className="sk-settings-input"
            type="password"
            placeholder="sk-..."
            value={aiConfig.apiKey}
            onChange={(e) => onConfigChange({ ...aiConfig, apiKey: e.target.value })}
          />
        </div>
      )}
      {isLocal && (
        <div className="sk-settings-row">
          <label className="sk-settings-label">Base URL</label>
          <input
            className="sk-settings-input"
            placeholder="http://localhost:11434"
            value={aiConfig.baseUrl}
            onChange={(e) => onConfigChange({ ...aiConfig, baseUrl: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}

// ─── main tray ────────────────────────────────────────────────────────────────
export default function RightTray({
  model,
  version,
  selection,
  onSelect,
  chatHistory,
  onSendChat,
  isLoading,
  aiConfig,
  onAiConfigChange,
}) {
  void version; // re-render driver
  return (
    <aside className="sk-tray">
      <Panel title="Entity Info" icon={Info} defaultOpen>
        <EntityInfo model={model} selection={selection} />
      </Panel>

      <Panel title="Outliner" icon={List} defaultOpen>
        <Outliner model={model} selection={selection} onSelect={onSelect} />
      </Panel>

      <Panel title="AI Assistant" icon={MessageSquare} defaultOpen>
        <AIPanel chatHistory={chatHistory} onSend={onSendChat} isLoading={isLoading} />
      </Panel>

      <Panel title="AI Settings" icon={Settings} defaultOpen={false}>
        <SettingsPanel aiConfig={aiConfig} onConfigChange={onAiConfigChange} />
      </Panel>
    </aside>
  );
}
