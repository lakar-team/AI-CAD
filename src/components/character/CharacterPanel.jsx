import { useState } from 'react';
import {
  ChevronRight, ChevronDown, Box, List, Info, Minus,
} from 'lucide-react';

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

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 10,
      color: 'var(--sk-text-muted)',
      fontWeight: 600,
      margin: '4px 0 2px',
      letterSpacing: '0.04em',
    }}>
      {children}
    </div>
  );
}

// ─── Scene Hierarchy ──────────────────────────────────────────────────────────

function SceneHierarchy({ characters, selectedCharId, selectedBoneId, onSelectChar, onSelectBone }) {
  if (!characters.length) {
    return (
      <div style={{ color: 'var(--sk-text-light)', fontStyle: 'italic', fontSize: 11 }}>
        No characters loaded. Use "Import Model" to load a GLB/GLTF file.
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

function BoneInspector({ selectedBone }) {
  if (!selectedBone) {
    return (
      <div style={{ color: 'var(--sk-text-light)', fontStyle: 'italic', fontSize: 11 }}>
        No bone selected.
      </div>
    );
  }

  const obj = selectedBone.object;
  const px = (obj.position.x * 100).toFixed(2);
  const py = (obj.position.y * 100).toFixed(2);
  const pz = (obj.position.z * 100).toFixed(2);
  const rx = (obj.rotation.x * (180 / Math.PI)).toFixed(1);
  const ry = (obj.rotation.y * (180 / Math.PI)).toFixed(1);
  const rz = (obj.rotation.z * (180 / Math.PI)).toFixed(1);

  return (
    <>
      <Row label="Name" value={selectedBone.name || '(unnamed)'} />
      <SectionLabel>POSITION (cm)</SectionLabel>
      <Row label="X" value={`${px} cm`} />
      <Row label="Y" value={`${py} cm`} />
      <Row label="Z" value={`${pz} cm`} />
      <SectionLabel>ROTATION (°)</SectionLabel>
      <Row label="X" value={`${rx}°`} />
      <Row label="Y" value={`${ry}°`} />
      <Row label="Z" value={`${rz}°`} />
    </>
  );
}

// ─── Mesh Properties ──────────────────────────────────────────────────────────

function MeshProperties({ selectedChar }) {
  if (!selectedChar) {
    return (
      <div style={{ color: 'var(--sk-text-light)', fontStyle: 'italic', fontSize: 11 }}>
        No character selected.
      </div>
    );
  }

  const totalVerts = selectedChar.meshes.reduce((sum, m) => {
    return sum + (m.object.geometry?.attributes?.position?.count || 0);
  }, 0);
  const totalTris = selectedChar.meshes.reduce((sum, m) => {
    const geo = m.object.geometry;
    if (!geo) return sum;
    return sum + (geo.index ? geo.index.count / 3 : (geo.attributes.position?.count || 0) / 3);
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

// ─── Main export ──────────────────────────────────────────────────────────────

export default function CharacterPanel({ characterEngine }) {
  const {
    characters, selectedCharId, selectedBoneId,
    selectCharacter, selectBone, selectedChar, selectedBone,
  } = characterEngine;

  return (
    <>
      <Panel title="Scene Hierarchy" icon={List} defaultOpen>
        <SceneHierarchy
          characters={characters}
          selectedCharId={selectedCharId}
          selectedBoneId={selectedBoneId}
          onSelectChar={selectCharacter}
          onSelectBone={selectBone}
        />
      </Panel>

      <Panel title="Bone Inspector" icon={Info} defaultOpen>
        <BoneInspector selectedBone={selectedBone} />
      </Panel>

      <Panel title="Mesh Properties" icon={Box} defaultOpen>
        <MeshProperties selectedChar={selectedChar} />
      </Panel>
    </>
  );
}
