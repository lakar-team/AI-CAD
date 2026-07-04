import { useState } from 'react';
import * as THREE from 'three';
import {
  ChevronRight, ChevronDown, Box, List, Info, Minus, Trash2,
  Download, Ruler, FlipHorizontal, FlipHorizontal2, ArrowDown,
} from 'lucide-react';
import { ARKIT_BLENDSHAPES } from '../../character/mixamoSpec.js';

// ─── Shared primitives ────────────────────────────────────────────────────────

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

function Row({ label, value }) {
  return (
    <div className="sk-ei-row">
      <span className="sk-ei-label">{label}</span>
      <span className="sk-ei-value">{value}</span>
    </div>
  );
}

function EditableField({ value, onCommit }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const open = () => { setDraft(String(value)); setEditing(true); };
  const commit = () => { const n = parseFloat(draft); if (isFinite(n)) onCommit(n); setEditing(false); };
  if (editing) {
    return (
      <input
        className="sk-ei-edit"
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
        onBlur={() => setEditing(false)}
      />
    );
  }
  return (
    <span className="sk-ei-value sk-ei-editable" title="Click to edit" onClick={open}>{value}</span>
  );
}

function EditableRow({ label, value, onCommit }) {
  return (
    <div className="sk-ei-row">
      <span className="sk-ei-label">{label}</span>
      <EditableField value={value} onCommit={onCommit} />
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 10, color: 'var(--sk-text-muted)', fontWeight: 700,
      margin: '6px 0 2px', letterSpacing: '0.04em',
    }}>
      {children}
    </div>
  );
}

function PrepBtn({ children, onClick, disabled, variant, title }) {
  const bg = variant === 'primary' ? 'var(--sk-accent)' : variant === 'danger' ? '#c0392b' : 'var(--sk-tray-header)';
  const col = (variant === 'primary' || variant === 'danger') ? '#fff' : 'var(--sk-text)';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '4px 8px', fontSize: 11, border: '1px solid var(--sk-tray-border)',
        borderRadius: 3, background: bg, color: col, cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1, fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  );
}

// ─── Scene Hierarchy ──────────────────────────────────────────────────────────

function SceneHierarchy({ characters, selectedCharId, selectedBoneId, onSelectChar, onSelectBone, onRemoveChar }) {
  if (!characters.length) {
    return (
      <div style={{ color: 'var(--sk-text-muted)', fontSize: 11, lineHeight: 1.5 }}>
        No model loaded — click <strong>Import Model</strong> to begin.
      </div>
    );
  }
  return (
    <div className="sk-outliner-scroll" style={{ maxHeight: 220 }}>
      {characters.map((char) => (
        <div key={char.id}>
          <div
            className={`sk-outliner-item ${selectedCharId === char.id && !selectedBoneId ? 'selected' : ''}`}
            style={{ fontWeight: 600 }}
            onClick={() => { onSelectChar(char.id); onSelectBone(null); }}
          >
            <Box size={11} />
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {char.name}
            </span>
            <span style={{ opacity: 0.5, fontSize: 10, flexShrink: 0 }}>
              {char.meshes.length}m · {char.bones.length}b
            </span>
            <button
              title="Remove model from scene"
              onClick={(e) => { e.stopPropagation(); onRemoveChar(char.id); }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px',
                color: 'var(--sk-text-muted)', display: 'flex', alignItems: 'center', flexShrink: 0,
              }}
            >
              <Trash2 size={11} />
            </button>
          </div>
          {char.bones.map((bone) => (
            <div
              key={bone.id}
              className={`sk-outliner-item ${selectedBoneId === bone.id ? 'selected' : ''}`}
              style={{ paddingLeft: 20 }}
              onClick={() => { onSelectChar(char.id); onSelectBone(bone.id); }}
            >
              <Minus size={10} />
              <span>{bone.name || `bone_${bone.id.slice(0, 6)}`}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Bone Inspector ───────────────────────────────────────────────────────────

function BoneInspector({ selectedBone, setBoneTransform }) {
  if (!selectedBone) {
    return (
      <div style={{ color: 'var(--sk-text-light)', fontStyle: 'italic', fontSize: 11 }}>
        No bone selected. Click a joint sphere in the viewport.
      </div>
    );
  }
  const obj = selectedBone.object;
  const _wp = new THREE.Vector3();
  obj.getWorldPosition(_wp);
  const px = (_wp.x * 100).toFixed(1);
  const py = (_wp.y * 100).toFixed(1);
  const pz = (_wp.z * 100).toFixed(1);
  const rx = (obj.rotation.x * (180 / Math.PI)).toFixed(1);
  const ry = (obj.rotation.y * (180 / Math.PI)).toFixed(1);
  const rz = (obj.rotation.z * (180 / Math.PI)).toFixed(1);
  const lengthCm = ((selectedBone.lengthM || 0) * 100).toFixed(1);

  const commitPos = (idx, cmVal) => {
    const worldPos = [_wp.x, _wp.y, _wp.z];
    worldPos[idx] = cmVal / 100;
    setBoneTransform?.(selectedBone.id, { worldPos });
  };
  const commitRot = (idx, degVal) => {
    const rotation = [obj.rotation.x, obj.rotation.y, obj.rotation.z];
    rotation[idx] = degVal * (Math.PI / 180);
    setBoneTransform?.(selectedBone.id, { rotation });
  };

  return (
    <>
      <Row label="Name" value={selectedBone.name || '(unnamed)'} />
      <Row label="Parent" value={selectedBone.parentName || '(root)'} />
      <Row label="Length" value={`${lengthCm} cm`} />
      <SectionLabel>WORLD POSITION (cm)</SectionLabel>
      <EditableRow label="X" value={px} onCommit={(v) => commitPos(0, v)} />
      <EditableRow label="Y" value={py} onCommit={(v) => commitPos(1, v)} />
      <EditableRow label="Z" value={pz} onCommit={(v) => commitPos(2, v)} />
      <SectionLabel>ROTATION (°)</SectionLabel>
      <EditableRow label="X" value={rx} onCommit={(v) => commitRot(0, v)} />
      <EditableRow label="Y" value={ry} onCommit={(v) => commitRot(1, v)} />
      <EditableRow label="Z" value={rz} onCommit={(v) => commitRot(2, v)} />
    </>
  );
}

// ─── Mesh Properties ──────────────────────────────────────────────────────────

function MeshProperties({ selectedChar }) {
  if (!selectedChar) {
    return <div style={{ color: 'var(--sk-text-light)', fontStyle: 'italic', fontSize: 11 }}>No character selected.</div>;
  }
  const totalVerts = selectedChar.meshes.reduce((s, m) => s + (m.object.geometry?.attributes?.position?.count || 0), 0);
  const totalTris = selectedChar.meshes.reduce((s, m) => {
    const geo = m.object.geometry;
    if (!geo) return s;
    return s + (geo.index ? geo.index.count / 3 : (geo.attributes.position?.count || 0) / 3);
  }, 0);
  return (
    <>
      <Row label="Meshes" value={String(selectedChar.meshes.length)} />
      <Row label="Bones" value={String(selectedChar.bones.length)} />
      <Row label="Vertices" value={totalVerts.toLocaleString()} />
      <Row label="Triangles" value={Math.round(totalTris).toLocaleString()} />
      {selectedChar.animations.length > 0 && (
        <Row label="Animations" value={String(selectedChar.animations.length)} />
      )}
    </>
  );
}

// ─── Bone Rig Panel (right side when rig-edit mode active) ───────────────────

const ROLE_COLORS = { driven: '#22cc55', spring: '#4488ff', locked: '#888888' };

function BoneRigPanel({ characterEngine }) {
  const {
    selectedBone, boneMapping, setBoneRole, setBoneRoleMulti, setBoneSpring,
    selectedBoneIds, characters, selectedCharId, swapBoneSides,
  } = characterEngine;

  const char = characters.find((c) => c.id === selectedCharId);
  const stats = { driven: 0, spring: 0, locked: 0 };
  if (char) {
    for (const bone of char.bones) {
      const r = boneMapping[bone.name]?.role || 'locked';
      stats[r] = (stats[r] || 0) + 1;
    }
  }

  const multiCount = selectedBoneIds?.size || 0;
  const entry = selectedBone ? (boneMapping[selectedBone.name] || { role: 'locked' }) : null;
  const role = entry?.role || 'locked';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Stats + Swap L/R */}
      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--sk-tray-border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--sk-text-muted)' }}>
            {['driven', 'spring', 'locked'].map((r) => (
              <span key={r}>
                <span style={{ color: ROLE_COLORS[r], fontWeight: 700 }}>{stats[r]}</span> {r}
              </span>
            ))}
          </div>
          <PrepBtn
            onClick={() => {
              const names = multiCount > 0
                ? (char?.bones.filter((b) => selectedBoneIds.has(b.id)).map((b) => b.name) || [])
                : [];
              swapBoneSides(names);
            }}
            disabled={!char}
            title={multiCount > 0 ? `Swap L/R on ${multiCount} selected bones` : 'Swap L/R on all driven bones'}
          >
            <FlipHorizontal size={11} /> Swap L/R
          </PrepBtn>
        </div>
      </div>

      {/* Bulk-set toolbar (multi-select) */}
      {multiCount > 1 && (
        <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--sk-tray-border)', flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: 'var(--sk-text-muted)', marginBottom: 4 }}>
            Set {multiCount} selected bones to:
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {['driven', 'spring', 'locked'].map((r) => (
              <PrepBtn key={r} onClick={() => {
                const names = char?.bones.filter((b) => selectedBoneIds.has(b.id)).map((b) => b.name) || [];
                setBoneRoleMulti(names, r);
              }}>
                {r}
              </PrepBtn>
            ))}
          </div>
        </div>
      )}

      {/* Single bone editor */}
      {selectedBone && entry ? (
        <div style={{ padding: '8px 10px', overflowY: 'auto', flex: 1 }}>
          <Row label="Bone" value={selectedBone.name} />

          <SectionLabel>ROLE</SectionLabel>
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            {['driven', 'spring', 'locked'].map((r) => (
              <button
                key={r}
                onClick={() => setBoneRole(selectedBone.name, r)}
                style={{
                  flex: 1, padding: '4px 2px', fontSize: 10,
                  border: `1px solid ${role === r ? ROLE_COLORS[r] : 'var(--sk-tray-border)'}`,
                  borderRadius: 3, cursor: 'pointer',
                  background: role === r ? ROLE_COLORS[r] : 'var(--sk-tray-header)',
                  color: role === r ? '#fff' : 'var(--sk-text)',
                  fontFamily: 'inherit', textTransform: 'capitalize',
                }}
              >
                {r}
              </button>
            ))}
          </div>

          {role === 'driven' && (entry.jointFrom || entry.jointTo) && (
            <>
              <SectionLabel>MEDIAPIPE JOINTS</SectionLabel>
              <Row label="From" value={entry.jointFrom || '—'} />
              <Row label="To" value={entry.jointTo || '—'} />
            </>
          )}

          {role === 'driven' && entry.length != null && (
            <>
              <SectionLabel>BIND POSE</SectionLabel>
              <Row label="Length" value={`${(entry.length * 100).toFixed(1)} cm`} />
              {entry.restDir && (
                <Row label="RestDir" value={entry.restDir.map((v) => v.toFixed(2)).join(', ')} />
              )}
            </>
          )}

          {role === 'spring' && (
            <>
              <SectionLabel>SPRING PARAMS</SectionLabel>
              <EditableRow
                label="Stiffness"
                value={(entry.stiffness ?? 0.8).toFixed(2)}
                onCommit={(v) => setBoneSpring(selectedBone.name, { stiffness: v })}
              />
              <EditableRow
                label="Damping"
                value={(entry.damping ?? 0.3).toFixed(2)}
                onCommit={(v) => setBoneSpring(selectedBone.name, { damping: v })}
              />
            </>
          )}
        </div>
      ) : (
        <div style={{ padding: '12px 10px', color: 'var(--sk-text-muted)', fontSize: 11, fontStyle: 'italic' }}>
          Click a bone in the left panel to edit its rig role.
        </div>
      )}
    </div>
  );
}

// ─── Prep & Scale Panel ───────────────────────────────────────────────────────

function PrepPanel({ characterEngine }) {
  const {
    prepState, autoScale, groundModel, fixFacing, normalizeTpose, mirrorCharacter, selectedChar,
  } = characterEngine;
  const [heightCm, setHeightCm] = useState(175);
  const hasChar = !!selectedChar;

  const poseLabel = prepState.poseType === 'tpose' ? 'T-pose ✓'
    : prepState.poseType === 'apose' ? 'A-pose detected'
    : prepState.poseType === 'other' ? 'Non-standard pose'
    : '—';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Row label="Pose" value={poseLabel} />
      <Row label="Scale ×" value={prepState.scaleFactor.toFixed(3)} />
      <Row label="Grounded" value={prepState.grounded ? 'Yes' : 'No'} />
      <Row label="Facing" value={prepState.facingFixed ? 'Fixed (+Z)' : 'Original'} />
      <Row label="Mirrored" value={prepState.mirrored ? 'Yes' : 'No'} />

      <SectionLabel>ACTIONS</SectionLabel>

      {/* Auto-scale */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <PrepBtn variant="primary" onClick={() => autoScale(heightCm)} disabled={!hasChar}>
          <Ruler size={11} /> Auto-scale
        </PrepBtn>
        <input
          type="number"
          value={heightCm}
          onChange={(e) => setHeightCm(Number(e.target.value))}
          style={{
            width: 52, border: '1px solid var(--sk-tray-border)', borderRadius: 3,
            padding: '3px 5px', fontSize: 11, fontFamily: 'monospace',
          }}
          min={1} max={999}
        />
        <span style={{ fontSize: 11, color: 'var(--sk-text-muted)' }}>cm</span>
      </div>

      <PrepBtn onClick={groundModel} disabled={!hasChar}>
        <ArrowDown size={11} /> Ground model (Y=0)
      </PrepBtn>
      <PrepBtn onClick={fixFacing} disabled={!hasChar}>
        <FlipHorizontal size={11} /> Fix facing (rotate 180°)
      </PrepBtn>
      <PrepBtn
        onClick={normalizeTpose}
        disabled={!hasChar || !prepState.poseType || prepState.poseType === 'tpose'}
        variant={prepState.poseType === 'apose' ? 'primary' : undefined}
      >
        Normalize to T-pose
      </PrepBtn>
      <PrepBtn
        onClick={mirrorCharacter}
        disabled={!hasChar}
        title="Physically mirror the character geometry and skeleton, then swap joint labels to match. Use when the model's left/right sides are physically reversed."
      >
        <FlipHorizontal2 size={11} /> Mirror rig + mesh
      </PrepBtn>
    </div>
  );
}

// ─── Face Setup Panel ─────────────────────────────────────────────────────────

function FaceSetupPanel({ characterEngine }) {
  const {
    faceSetup, setFaceMode, setBlendshapeMap, setFaceMesh,
    autoDetectBlendshapes, selectedChar,
  } = characterEngine;
  const hasChar = !!selectedChar;

  // Collect available morph target names from all meshes
  const morphNames = [];
  if (selectedChar) {
    const seen = new Set();
    selectedChar.meshes.forEach((m) => {
      const dict = m.object.morphTargetDictionary;
      if (dict) {
        Object.keys(dict).forEach((k) => { if (!seen.has(k)) { seen.add(k); morphNames.push(k); } });
      }
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Mode selector */}
      <div style={{ display: 'flex', gap: 4 }}>
        {['off', 'blendshapes', 'mesh'].map((mode) => (
          <button
            key={mode}
            onClick={() => setFaceMode(mode)}
            disabled={!hasChar}
            style={{
              flex: 1, padding: '4px 2px', fontSize: 10, border: '1px solid var(--sk-tray-border)',
              borderRadius: 3, cursor: hasChar ? 'pointer' : 'not-allowed',
              background: faceSetup.mode === mode ? 'var(--sk-accent)' : 'var(--sk-tray-header)',
              color: faceSetup.mode === mode ? '#fff' : 'var(--sk-text)',
              fontFamily: 'inherit',
            }}
          >
            {mode === 'off' ? 'Off' : mode === 'blendshapes' ? 'Blendshapes' : 'Mesh only'}
          </button>
        ))}
      </div>

      {faceSetup.mode === 'off' && (
        <div style={{ color: 'var(--sk-text-light)', fontSize: 11 }}>
          No face driving. For helmets, robots, or masked characters.
        </div>
      )}

      {faceSetup.mode === 'blendshapes' && (
        <>
          <PrepBtn onClick={autoDetectBlendshapes} disabled={!hasChar}>
            <Sparkles size={11} /> Auto-detect blendshapes
          </PrepBtn>
          {morphNames.length === 0 && (
            <div style={{ color: 'var(--sk-text-light)', fontSize: 11 }}>
              No morph targets found on this model.
            </div>
          )}
          {ARKIT_BLENDSHAPES.map((arkit) => (
            <div key={arkit} className="sk-ei-row">
              <span className="sk-ei-label" style={{ minWidth: 90, fontSize: 10 }}>{arkit}</span>
              <select
                className="sk-settings-select"
                style={{ fontSize: 10, padding: '1px 4px', flex: 1 }}
                value={faceSetup.blendshapeMap[arkit] || ''}
                onChange={(e) => setBlendshapeMap(arkit, e.target.value || null)}
              >
                <option value="">— unmapped —</option>
                {morphNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          ))}
        </>
      )}

      {faceSetup.mode === 'mesh' && (
        <>
          <div style={{ color: 'var(--sk-text-light)', fontSize: 11 }}>
            Select the face mesh to tag for vtube vertex deformation.
          </div>
          {selectedChar?.meshes.map((m) => (
            <div
              key={m.id}
              onClick={() => setFaceMesh(m.id === faceSetup.faceMeshId ? null : m.id)}
              style={{
                padding: '3px 6px', cursor: 'pointer', fontSize: 11, borderRadius: 3,
                background: m.id === faceSetup.faceMeshId ? 'var(--sk-accent)' : 'var(--sk-tray-header)',
                color: m.id === faceSetup.faceMeshId ? '#fff' : 'var(--sk-text)',
                border: '1px solid var(--sk-tray-border)',
              }}
            >
              {m.name || `mesh_${m.id.slice(0, 6)}`}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ─── Export Panel ─────────────────────────────────────────────────────────────

function ExportPanel({ characterEngine }) {
  const { exportForVtube, selectedChar, rigStats } = characterEngine;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 11, color: 'var(--sk-text-muted)' }}>
        Rig:&nbsp;
        <span style={{ color: '#22cc55', fontWeight: 700 }}>{rigStats.driven}</span> driven,&nbsp;
        <span style={{ color: '#4488ff', fontWeight: 700 }}>{rigStats.spring}</span> spring,&nbsp;
        <span style={{ color: '#888', fontWeight: 700 }}>{rigStats.locked}</span> locked
      </div>
      <PrepBtn
        variant="primary"
        onClick={exportForVtube}
        disabled={!selectedChar}
      >
        <Download size={11} /> Export for vtube (.glb)
      </PrepBtn>
      <div style={{ fontSize: 10, color: 'var(--sk-text-light)' }}>
        Exports binary GLB with original bone names. Rig recipe stored in userData.vtubeRig.
      </div>
    </div>
  );
}

// ─── Bone Rig wrapper (right tray in rig-edit mode) ──────────────────────────

function BoneRigWrapper({ characterEngine }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{
        padding: '6px 10px', borderBottom: '1px solid var(--sk-tray-border)',
        background: 'var(--sk-tray-header)', fontSize: 12, fontWeight: 700, flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        Bone Rig
      </div>
      <BoneRigPanel characterEngine={characterEngine} />
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function CharacterPanel({ characterEngine, aiConfig }) {
  const {
    characters, selectedCharId, selectedBoneId,
    selectCharacter, selectBone, selectedChar, selectedBone,
    removeCharacter, setBoneTransform, charPrepTool,
  } = characterEngine;

  // In rig-edit mode: show bone role editor (right side of the two-column layout)
  if (charPrepTool === 'mapbones') {
    return <BoneRigWrapper characterEngine={characterEngine} />;
  }

  // Normal character mode panels
  return (
    <>
      <Panel title="Scene Hierarchy" icon={List} defaultOpen>
        <SceneHierarchy
          characters={characters}
          selectedCharId={selectedCharId}
          selectedBoneId={selectedBoneId}
          onSelectChar={selectCharacter}
          onSelectBone={selectBone}
          onRemoveChar={removeCharacter}
        />
      </Panel>

      <Panel title="Bone Inspector" icon={Info} defaultOpen>
        <BoneInspector selectedBone={selectedBone} setBoneTransform={setBoneTransform} />
      </Panel>

      <Panel title="Mesh Properties" icon={Box} defaultOpen={false}>
        <MeshProperties selectedChar={selectedChar} />
      </Panel>

      <Panel title="Prep & Scale" icon={Ruler} defaultOpen={false}>
        <PrepPanel characterEngine={characterEngine} />
      </Panel>

      <Panel title="Face Setup" icon={Box} defaultOpen={false}>
        <FaceSetupPanel characterEngine={characterEngine} />
      </Panel>

      <Panel title="Export for vtube" icon={Download} defaultOpen={false}>
        <ExportPanel characterEngine={characterEngine} />
      </Panel>
    </>
  );
}
