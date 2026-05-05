import React from 'react';
import { Menu, Save, HelpCircle } from 'lucide-react';

export default function TopBar({ projectName, onMenuClick, onSave }) {
  return (
    <header className="sk-topbar">
      <button className="sk-topbar-btn" title="Menu" onClick={onMenuClick}>
        <Menu size={16} />
      </button>
      <div className="sk-topbar-sep" />
      <span className="sk-topbar-brand">Lakar CAD — {projectName}</span>
      <div className="sk-topbar-sep" />
      <button className="sk-topbar-btn" title="Save" onClick={onSave}>
        <Save size={14} />
        Save
      </button>
      <button className="sk-topbar-btn" title="Help (Coming soon)" style={{ opacity: 0.5, cursor: 'not-allowed' }}>
        <HelpCircle size={14} />
        Help
      </button>
    </header>
  );
}
