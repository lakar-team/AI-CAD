import React from 'react';
import {
  MousePointer2, Eraser, Pencil, Circle, Square,
  Maximize, Move, RotateCcw, Scaling, Ruler, Type, Layers
} from 'lucide-react';

const TOOLS = [
  { id: 'select',   icon: MousePointer2, label: 'Select',         key: 'Space', real: true },
  { id: 'eraser',   icon: Eraser,        label: 'Eraser',         key: 'E',     real: true },
  { sep: true },
  { id: 'line',     icon: Pencil,        label: 'Line',           key: 'L',     real: true },
  { id: 'arc',      icon: Circle,        label: 'Arc',            key: 'A',     real: false },
  { id: 'rect',     icon: Square,        label: 'Rectangle',      key: 'R',     real: false },
  { sep: true },
  { id: 'pushpull', icon: Maximize,      label: 'Push/Pull',      key: 'P',     real: true },
  { id: 'move',     icon: Move,          label: 'Move',           key: 'M',     real: true },
  { id: 'rotate',   icon: RotateCcw,     label: 'Rotate',         key: 'Q',     real: false },
  { id: 'scale',    icon: Scaling,       label: 'Scale',          key: 'S',     real: false },
  { id: 'offset',   icon: Layers,        label: 'Offset',         key: 'F',     real: false },
  { sep: true },
  { id: 'tape',     icon: Ruler,         label: 'Tape Measure',   key: 'T',     real: true },
  { id: 'text',     icon: Type,          label: 'Text',           key: null,    real: false },
];

export default function LeftToolbar({ activeTool, setTool }) {
  return (
    <nav className="sk-toolbar">
      {TOOLS.map((t, i) => {
        if (t.sep) return <div key={`sep-${i}`} className="sk-tool-sep" />;
        const Icon = t.icon;
        const tooltip = t.real
          ? `${t.label}${t.key ? ` (${t.key})` : ''}`
          : `${t.label} — Coming soon`;

        return (
          <button
            key={t.id}
            className={`sk-tool-btn ${activeTool === t.id ? 'active' : ''} ${!t.real ? 'placeholder' : ''}`}
            title={tooltip}
            onClick={() => t.real && setTool(t.id)}
          >
            <Icon size={18} strokeWidth={1.8} />
            <span className="sk-tool-label">{tooltip}</span>
          </button>
        );
      })}
    </nav>
  );
}
