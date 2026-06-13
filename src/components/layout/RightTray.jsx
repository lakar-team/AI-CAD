import { useState, useRef, useEffect, useCallback } from 'react';
import { formatLength, parseLength } from '../../core/units.js';
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
function EntityInfo({ model, selection, units, onEditEdgeLength, onEditVertexPosition }) {
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
    const vid = hit.entity.id;
    const commit = (idx, text) => {
      const v = parseLength(text, units);
      if (!isFinite(v)) return;
      const p = [...hit.entity.p];
      p[idx] = v;
      onEditVertexPosition?.(vid, p);
    };
    return (
      <>
        <Row label="Type" value="Vertex" />
        <EditableRow label="X" value={formatLength(x, units)} onCommit={(t) => commit(0, t)} />
        <EditableRow label="Y" value={formatLength(y, units)} onCommit={(t) => commit(1, t)} />
        <EditableRow label="Z" value={formatLength(z, units)} onCommit={(t) => commit(2, t)} />
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
        <EditableRow
          label="Length"
          value={formatLength(len, units)}
          onCommit={(t) => {
            const v = parseLength(t, units);
            if (isFinite(v) && v > 0) onEditEdgeLength?.(hit.entity.id, v);
          }}
        />
        <Row label="Faces" value={String(mesh.edgeFaces(hit.entity.id).size)} />
      </>
    );
  }
  if (hit.kind === 'face') {
    const n = hit.entity.normal;
    const area = polygonArea3(hit.entity.loop.map((vid) => mesh.vertices.get(vid).p), n);
    return (
      <>
        <Row label="Type" value="Face" />
        <Row label="Vertices" value={String(hit.entity.loop.length)} />
        <Row label="Area" value={formatArea(area, units)} />
        <Row label="Normal" value={`${fmt(n[0])}, ${fmt(n[1])}, ${fmt(n[2])}`} />
      </>
    );
  }
  return null;
}

function polygonArea3(pts, normal) {
  if (pts.length < 3) return 0;
  let cross = [0, 0, 0];
  for (let i = 1; i < pts.length - 1; i++) {
    const u = [pts[i][0]-pts[0][0], pts[i][1]-pts[0][1], pts[i][2]-pts[0][2]];
    const v = [pts[i+1][0]-pts[0][0], pts[i+1][1]-pts[0][1], pts[i+1][2]-pts[0][2]];
    cross[0] += u[1]*v[2] - u[2]*v[1];
    cross[1] += u[2]*v[0] - u[0]*v[2];
    cross[2] += u[0]*v[1] - u[1]*v[0];
  }
  const mag = Math.hypot(...cross);
  const dot = cross[0]*normal[0] + cross[1]*normal[1] + cross[2]*normal[2];
  return Math.abs(dot < 0 ? -mag/2 : mag/2);
}

function formatArea(m2, unit) {
  const AREA_FACTORS = { mm: 1e6, cm: 1e4, m: 1, ft: 10.7639, in: 1550.0031 };
  const AREA_LABELS  = { mm: 'mm²', cm: 'cm²', m: 'm²', ft: 'ft²', in: 'in²' };
  const f = AREA_FACTORS[unit] || 1;
  const prec = unit === 'm' ? 4 : unit === 'ft' ? 3 : 2;
  return `${(m2 * f).toFixed(prec)} ${AREA_LABELS[unit] || 'm²'}`;
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

function EditableRow({ label, value, onCommit }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const open = useCallback(() => { setDraft(value); setEditing(true); }, [value]);
  const commit = useCallback(() => { onCommit(draft); setEditing(false); }, [draft, onCommit]);

  return (
    <div className="sk-ei-row">
      <span className="sk-ei-label">{label}</span>
      {editing ? (
        <input
          className="sk-ei-edit"
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setEditing(false);
          }}
          onBlur={() => setEditing(false)}
        />
      ) : (
        <span className="sk-ei-value sk-ei-editable" title="Click to edit" onClick={open}>
          {value}
        </span>
      )}
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
  units,
  onEditEdgeLength,
  onEditVertexPosition,
}) {
  void version; // re-render driver
  return (
    <aside className="sk-tray">
      <Panel title="Entity Info" icon={Info} defaultOpen>
        <EntityInfo
          model={model}
          selection={selection}
          units={units}
          onEditEdgeLength={onEditEdgeLength}
          onEditVertexPosition={onEditVertexPosition}
        />
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
