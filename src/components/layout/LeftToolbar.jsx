import React from 'react';
import { 
  MousePointer2, Eraser, PaintBucket, Pencil, Circle, 
  Square, Maximize, Move, RotateCcw, Scaling, 
  Ruler, Search, Eye, Box
} from 'lucide-react';

export default function LeftToolbar({ activeTool, setTool }) {
  const tools = [
    { id: 'select', icon: <MousePointer2 size={20} />, title: 'Select (Space)' },
    { id: 'eraser', icon: <Eraser size={20} />, title: 'Eraser (E) [Placeholder]', isPlaceholder: true },
    { id: 'paint', icon: <PaintBucket size={20} />, title: 'Paint Bucket (B) [Placeholder]', isPlaceholder: true },
    { divider: true },
    { id: 'line', icon: <Pencil size={20} />, title: 'Line (L)' },
    { id: 'arc', icon: <Circle size={20} />, title: 'Arc (A) [Placeholder]', isPlaceholder: true },
    { id: 'shapes', icon: <Box size={20} />, title: 'Rectangle (R) [Placeholder]', isPlaceholder: true },
    { divider: true },
    { id: 'pushpull', icon: <Maximize size={20} />, title: 'Push/Pull (P) [Placeholder]', isPlaceholder: true },
    { id: 'offset', icon: <Square size={20} />, title: 'Offset (F) [Placeholder]', isPlaceholder: true },
    { divider: true },
    { id: 'move', icon: <Move size={20} />, title: 'Move (M)' },
    { id: 'rotate', icon: <RotateCcw size={20} />, title: 'Rotate (Q) [Placeholder]', isPlaceholder: true },
    { id: 'scale', icon: <Scaling size={20} />, title: 'Scale (S) [Placeholder]', isPlaceholder: true },
    { divider: true },
    { id: 'tape', icon: <Ruler size={20} />, title: 'Tape Measure (T) [Placeholder]', isPlaceholder: true },
    { id: 'search', icon: <Search size={20} />, title: 'Search Commands [Placeholder]', isPlaceholder: true }
  ];

  return (
    <nav className="left-toolbar">
      {tools.map((tool, idx) => (
        tool.divider ? (
          <div key={`div-${idx}`} className="divider" />
        ) : (
          <button
            key={tool.id}
            className={`btn-tool ${activeTool === tool.id ? 'active' : ''} ${tool.isPlaceholder ? 'placeholder' : ''}`}
            style={{ opacity: tool.isPlaceholder ? 0.4 : 1 }}
            title={tool.title}
            onClick={() => !tool.isPlaceholder && setTool(tool.id)}
          >
            {tool.icon}
          </button>
        )
      ))}
    </nav>
  );
}
