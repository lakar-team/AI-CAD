import React from 'react';
import { Menu, Cloud, User, Save } from 'lucide-react';

export default function TopBar({ projectName, saveStatus }) {
  return (
    <header className="top-bar">
      <button className="btn-tool" title="Menu">
        <Menu size={20} />
      </button>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{projectName || 'Untitled'}</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
          {saveStatus === 'saved' ? 'Saved' : 'Unsaved changes'}
        </span>
      </div>

      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        <button className="btn-tool" title="Save to Trimble Connect (Simulated)">
          <Save size={18} />
        </button>
        <div className="divider" style={{ width: '1px', height: '24px' }} />
        <button className="btn-tool" title="Account">
          <User size={20} />
        </button>
      </div>
    </header>
  );
}
