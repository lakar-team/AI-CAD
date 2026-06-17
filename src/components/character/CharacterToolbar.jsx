import { useRef } from 'react';
import { MousePointer2, Upload, GitBranch, Box, Pencil, Palette, Map, ArrowLeft } from 'lucide-react';

// ─── Model bone list (shown in left panel when mapbones mode is active) ──────

function statusColor(status) {
  if (status === 'confirmed') return '#22cc55';
  if (status === 'auto') return '#ff9900';
  if (status === 'unmapped') return '#cc3333';
  return '#4488ff';
}

function ModelBoneList({ characterEngine }) {
  const {
    characters, selectedCharId, selectedBoneId, boneMapping,
    setSelectedBoneId, setSelectedMixamoJoint, selectedMixamoJoint,
  } = characterEngine;

  const char = characters.find((c) => c.id === selectedCharId);
  if (!char) {
    return (
      <div style={{ color: '#999', fontSize: 11, padding: '8px 10px', fontStyle: 'italic' }}>
        No model loaded
      </div>
    );
  }

  return (
    <div style={{ overflowY: 'auto', flex: 1 }}>
      <div style={{ fontSize: 10, color: '#aaa', padding: '4px 10px 2px', fontWeight: 700, letterSpacing: '0.05em' }}>
        MODEL BONES ({char.bones.length})
      </div>
      {char.bones.map((bone) => {
        const mappingEntry = Object.values(boneMapping).find((e) => e.sourceName === bone.name);
        const status = mappingEntry?.status || 'unmapped';
        const isSel = bone.id === selectedBoneId;
        return (
          <div
            key={bone.id}
            onClick={() => setSelectedBoneId(bone.id === selectedBoneId ? null : bone.id)}
            title={`Click to select — then click a Mixamo joint to map`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '3px 10px',
              cursor: 'pointer',
              background: isSel ? '#1a9fdc' : 'transparent',
              color: isSel ? '#fff' : '#d0d0d0',
              fontSize: 11,
              borderLeft: isSel ? '3px solid #fff' : `3px solid ${statusColor(status)}`,
              userSelect: 'none',
            }}
          >
            <span style={{
              width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
              background: isSel ? '#fff' : statusColor(status),
            }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {bone.name || `bone_${bone.id.slice(0, 6)}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Normal toolbar ───────────────────────────────────────────────────────────

const CHAR_TOOLS = [
  { id: 'select', icon: MousePointer2, label: 'Select (V)' },
  { sep: true },
  { id: 'import', icon: Upload, label: 'Import Model', action: 'import' },
  { sep: true },
  { id: 'mapbones', icon: Map, label: 'Map Bones', action: 'mapbones' },
  { sep: true },
  { id: 'bone', icon: GitBranch, label: 'Add Child Bone', action: 'addbone' },
  { id: 'mesh', icon: Box, label: 'Edit Mesh', placeholder: true },
  { id: 'sculpt', icon: Pencil, label: 'Sculpt', placeholder: true },
  { id: 'weights', icon: Palette, label: 'Paint Weights', placeholder: true },
];

export default function CharacterToolbar({
  activeTool, setActiveTool, importGLB, addChildBone, hasSelection,
  charPrepTool, setCharPrepTool, characterEngine,
}) {
  const fileRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try { await importGLB(file); }
    catch (err) { alert(`Import failed: ${err.message}`); }
    e.target.value = '';
  };

  // ── Bone map mode: wide left panel with model bones ─────────────────────────
  if (charPrepTool === 'mapbones') {
    return (
      <nav className="sk-toolbar sk-toolbar--wide" style={{ alignItems: 'stretch', padding: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 10px', borderBottom: '1px solid #2a2d2f', flexShrink: 0,
        }}>
          <button
            onClick={() => setCharPrepTool(null)}
            title="Back to normal mode"
            style={{
              background: 'none', border: 'none', color: '#aaa', cursor: 'pointer',
              display: 'flex', alignItems: 'center', padding: 0,
            }}
          >
            <ArrowLeft size={14} />
          </button>
          <span style={{ color: '#d0d0d0', fontSize: 11, fontWeight: 700 }}>MAP BONES</span>
        </div>
        <div style={{ fontSize: 10, color: '#888', padding: '4px 10px', flexShrink: 0 }}>
          <span style={{ color: '#22cc55', marginRight: 4 }}>●</span>confirmed&nbsp;
          <span style={{ color: '#ff9900', marginRight: 4 }}>●</span>auto&nbsp;
          <span style={{ color: '#cc3333' }}>●</span>unmapped
        </div>
        <ModelBoneList characterEngine={characterEngine} />
        <div style={{
          padding: '6px 10px', borderTop: '1px solid #2a2d2f', fontSize: 10, color: '#888', flexShrink: 0,
        }}>
          Click a bone (left) then a Mixamo joint (right) to map them
        </div>
      </nav>
    );
  }

  // ── Normal toolbar ───────────────────────────────────────────────────────────
  return (
    <nav className="sk-toolbar">
      <input
        ref={fileRef}
        type="file"
        accept=".glb,.gltf"
        style={{ display: 'none' }}
        onChange={handleFile}
      />
      {CHAR_TOOLS.map((t, i) => {
        if (t.sep) return <div key={`sep-${i}`} className="sk-tool-sep" />;
        const Icon = t.icon;
        const disabled = t.placeholder || (t.action === 'addbone' && !hasSelection);
        const tooltip = t.action === 'addbone' && !hasSelection ? 'Select a bone first' : t.label;
        const isActive = t.action === 'mapbones' ? charPrepTool === 'mapbones' : (!t.action && activeTool === t.id);

        const handleClick = () => {
          if (disabled) return;
          if (t.action === 'import') fileRef.current?.click();
          else if (t.action === 'addbone') addChildBone?.();
          else if (t.action === 'mapbones') setCharPrepTool('mapbones');
          else setActiveTool(t.id);
        };

        return (
          <button
            key={t.id}
            className={`sk-tool-btn ${isActive ? 'active' : ''} ${disabled ? 'placeholder' : ''}`}
            title={tooltip}
            onClick={handleClick}
          >
            <Icon size={18} strokeWidth={1.8} />
            <span className="sk-tool-label">{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
