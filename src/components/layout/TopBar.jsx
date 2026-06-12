import { useState, useRef, useEffect } from 'react';
import {
  Menu, Save, FolderOpen, FilePlus, Download, Undo2, Redo2,
  Group, Component, Ungroup, CornerUpLeft,
} from 'lucide-react';

function FileMenu({ onAction }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  const item = (action, icon, label) => {
    const Icon = icon;
    return (
      <button
        className="sk-menu-item"
        onClick={() => { setOpen(false); onAction(action); }}
      >
        <Icon size={13} /> {label}
      </button>
    );
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="sk-topbar-btn" title="File" onClick={() => setOpen((o) => !o)}>
        <Menu size={16} /> File
      </button>
      {open && (
        <div className="sk-menu">
          {item('new', FilePlus, 'New model')}
          {item('open', FolderOpen, 'Open (.lakar.json)')}
          {item('save', Save, 'Save (.lakar.json)')}
          <div className="sk-menu-sep" />
          {item('export-obj', Download, 'Export OBJ')}
          {item('export-stl', Download, 'Export STL')}
          {item('export-glb', Download, 'Export glTF (.glb)')}
        </div>
      )}
    </div>
  );
}

export default function TopBar({
  projectName,
  contextDepth,
  onFileAction,
  onUndo,
  onRedo,
  onMakeGroup,
  onMakeComponent,
  onExplode,
  hasSelection,
}) {
  return (
    <header className="sk-topbar">
      <FileMenu onAction={onFileAction} />
      <div className="sk-topbar-sep" />
      <button className="sk-topbar-btn" title="Undo (Ctrl+Z)" onClick={onUndo}>
        <Undo2 size={14} />
      </button>
      <button className="sk-topbar-btn" title="Redo (Ctrl+Y)" onClick={onRedo}>
        <Redo2 size={14} />
      </button>
      <div className="sk-topbar-sep" />
      <button
        className="sk-topbar-btn"
        title="Make Group from selection (G)"
        disabled={!hasSelection}
        onClick={onMakeGroup}
      >
        <Group size={14} /> Group
      </button>
      <button
        className="sk-topbar-btn"
        title="Make Component from selection (Shift+G)"
        disabled={!hasSelection}
        onClick={onMakeComponent}
      >
        <Component size={14} /> Component
      </button>
      <button
        className="sk-topbar-btn"
        title="Explode selected group/component"
        disabled={!hasSelection}
        onClick={onExplode}
      >
        <Ungroup size={14} /> Explode
      </button>
      <div className="sk-topbar-sep" />
      <span className="sk-topbar-brand">
        Lakar CAD — {projectName}
        {contextDepth > 0 && (
          <span style={{ marginLeft: 8, fontSize: 11, color: '#888' }}>
            <CornerUpLeft size={11} style={{ verticalAlign: -1 }} /> editing nested context
            (double-click empty space or press Esc to leave)
          </span>
        )}
      </span>
    </header>
  );
}
