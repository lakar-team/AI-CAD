import React from 'react';
import {
  MousePointer2, Eraser, PaintBucket,
  Pencil, Circle, Square, Maximize, Layers,
  Move, RotateCcw, Scaling, Ruler, Type, Box,
} from 'lucide-react';

const TOOLS = [
  // Group 1: Interaction
  { id: 'select', icon: MousePointer2, label: 'Select (Space)',      key: 'Space', real: true },
  { id: 'eraser', icon: Eraser,        label: 'Eraser (E)',          key: 'E',     real: true },
  { sep: true },
  // Group 2: Draw
  { id: 'line',   icon: Pencil,        label: 'Line (L)',            key: 'L',     real: true },
  { id: 'arc',    icon: Circle,        label: 'Arc (A) [Coming soon]',            key: 'A',     real: false },
  { id: 'rect',   icon: Square,        label: 'Rectangle (R) [Coming soon]',      key: 'R',     real: false },
  { sep: true },
  // Group 3: Modify
  { id: 'pushpull', icon: Maximize,   label: 'Push/Pull (P) [Coming soon]',       key: 'P',     real: false },
  { id: 'move',   icon: Move,          label: 'Move (M)',            key: 'M',     real: true },
  { id: 'rotate', icon: RotateCcw,     label: 'Rotate (Q) [Coming soon]',         key: 'Q',     real: false },
  { id: 'scale',  icon: Scaling,       label: 'Scale (S) [Coming soon]',          key: 'S',     real: false },
  { id: 'offset', icon: Layers,        label: 'Offset (F) [Coming soon]',         key: 'F',     real: false },
  { sep: true },
  // Group 4: Measure
  { id: 'tape',   icon: Ruler,         label: 'Tape Measure (T)',    key: 'T',     real: true },
  { id: 'text',   icon: Type,          label: 'Text [Coming soon]',               key: null,    real: false },
];

export default function LeftToolbar({ activeTool, setTool }) {
  return (
    <nav className="sk-toolbar">
      {TOOLS.map((t, i) => {
        if (t.sep) return <div key={`sep-${i}`} className="sk-tool-sep" />;
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            className={`sk-tool-btn ${activeTool === t.id ? 'active' : ''} ${!t.real ? 'placeholder' : ''}`}
            title={t.label}
            onClick={() => t.real && setTool(t.id)}
          >
            <Icon size={18} strokeWidth={1.8} />
            <span className="sk-tool-label">{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
