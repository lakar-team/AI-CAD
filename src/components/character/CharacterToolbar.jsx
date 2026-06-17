import { useRef } from 'react';
import { MousePointer2, Upload, GitBranch, Box, Pencil, Palette } from 'lucide-react';

const CHAR_TOOLS = [
  { id: 'select', icon: MousePointer2, label: 'Select (V)' },
  { sep: true },
  { id: 'import', icon: Upload, label: 'Import Model', action: true },
  { sep: true },
  { id: 'bone', icon: GitBranch, label: 'Add Bone (B)', placeholder: true },
  { id: 'mesh', icon: Box, label: 'Edit Mesh', placeholder: true },
  { id: 'sculpt', icon: Pencil, label: 'Sculpt', placeholder: true },
  { id: 'weights', icon: Palette, label: 'Paint Weights', placeholder: true },
];

export default function CharacterToolbar({ activeTool, setActiveTool, importGLB }) {
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

        if (t.action) {
          return (
            <button
              key={t.id}
              className="sk-tool-btn"
              title={t.label}
              onClick={() => fileRef.current?.click()}
            >
              <Icon size={18} strokeWidth={1.8} />
              <span className="sk-tool-label">{t.label}</span>
            </button>
          );
        }

        return (
          <button
            key={t.id}
            className={`sk-tool-btn ${activeTool === t.id ? 'active' : ''} ${t.placeholder ? 'placeholder' : ''}`}
            title={t.label}
            onClick={() => !t.placeholder && setActiveTool(t.id)}
          >
            <Icon size={18} strokeWidth={1.8} />
            <span className="sk-tool-label">{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
