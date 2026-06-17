import { useRef } from 'react';
import { MousePointer2, Upload, GitBranch, Box, Pencil, Palette } from 'lucide-react';

const CHAR_TOOLS = [
  { id: 'select', icon: MousePointer2, label: 'Select (V)' },
  { sep: true },
  { id: 'import', icon: Upload, label: 'Import Model', action: 'import' },
  { sep: true },
  { id: 'bone', icon: GitBranch, label: 'Add Child Bone', action: 'addbone' },
  { id: 'mesh', icon: Box, label: 'Edit Mesh', placeholder: true },
  { id: 'sculpt', icon: Pencil, label: 'Sculpt', placeholder: true },
  { id: 'weights', icon: Palette, label: 'Paint Weights', placeholder: true },
];

export default function CharacterToolbar({
  activeTool, setActiveTool, importGLB, addChildBone, hasSelection,
}) {
  const fileRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await importGLB(file);
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    }
    e.target.value = '';
  };

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
        const tooltip = t.action === 'addbone' && !hasSelection
          ? 'Select a bone first'
          : t.label;

        const handleClick = () => {
          if (disabled) return;
          if (t.action === 'import') fileRef.current?.click();
          else if (t.action === 'addbone') addChildBone?.();
          else setActiveTool(t.id);
        };

        return (
          <button
            key={t.id}
            className={`sk-tool-btn ${!t.action && activeTool === t.id ? 'active' : ''} ${disabled ? 'placeholder' : ''}`}
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
