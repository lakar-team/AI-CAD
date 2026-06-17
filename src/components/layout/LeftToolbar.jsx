import {
  MousePointer2, Eraser, Pencil, Square, Circle,
  Maximize, Move, Ruler, Rotate3d, RectangleHorizontal, RulerDimensionLine,
} from 'lucide-react';
import CharacterToolbar from '../character/CharacterToolbar.jsx';

const TOOLS = [
  { id: 'select', icon: MousePointer2, label: 'Select', key: 'Space' },
  { id: 'eraser', icon: Eraser, label: 'Eraser', key: 'E' },
  { sep: true },
  { id: 'line', icon: Pencil, label: 'Line', key: 'L' },
  { id: 'rect', icon: Square, label: 'Rectangle', key: 'R' },
  { id: 'circle', icon: Circle, label: 'Circle', key: 'C' },
  { sep: true },
  { id: 'pushpull', icon: Maximize, label: 'Push/Pull', key: 'P' },
  { id: 'move', icon: Move, label: 'Move', key: 'M' },
  { id: 'offset', icon: RectangleHorizontal, label: 'Offset', key: 'F' },
  { sep: true },
  { id: 'tape', icon: Ruler, label: 'Tape Measure', key: 'T' },
  { id: 'annotate', icon: RulerDimensionLine, label: 'Dimension', key: 'D' },
  { id: 'orbit', icon: Rotate3d, label: 'Orbit (left-drag)', key: 'O' },
];

export default function LeftToolbar({ activeTool, setTool, appMode, characterEngine }) {
  if (appMode === 'character') {
    return (
      <CharacterToolbar
        activeTool={characterEngine.activeTool}
        setActiveTool={characterEngine.setActiveTool}
        importGLB={characterEngine.importGLB}
        addChildBone={characterEngine.addChildBone}
        hasSelection={!!characterEngine.selectedBoneId}
      />
    );
  }

  return (
    <nav className="sk-toolbar">
      {TOOLS.map((t, i) => {
        if (t.sep) return <div key={`sep-${i}`} className="sk-tool-sep" />;
        const Icon = t.icon;
        const tooltip = `${t.label}${t.key ? ` (${t.key})` : ''}`;
        return (
          <button
            key={t.id}
            className={`sk-tool-btn ${activeTool === t.id ? 'active' : ''}`}
            title={tooltip}
            onClick={() => setTool(t.id)}
          >
            <Icon size={18} strokeWidth={1.8} />
            <span className="sk-tool-label">{tooltip}</span>
          </button>
        );
      })}
    </nav>
  );
}
