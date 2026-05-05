import React, { useState } from 'react';
import { Info, List, Box, Palette, Settings, MessageSquare, ChevronRight, ChevronDown } from 'lucide-react';

const Panel = ({ id, title, icon, isOpen, toggle, children }) => (
  <div className="tray-panel">
    <div className="panel-header" onClick={() => toggle(id)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {icon}
        <span>{title}</span>
      </div>
      {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
    </div>
    {isOpen && <div className="panel-content">{children}</div>}
  </div>
);

export default function RightTray({ selectedObject, sceneRoot, onSelectNode, chatHistory, onSendChat }) {
  const [openPanels, setOpenPanels] = useState({
    entity: true,
    outliner: true,
    ai: true
  });

  const togglePanel = (id) => {
    setOpenPanels(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <aside className="right-tray">
      <Panel id="entity" title="Entity Info" icon={<Info size={16} />} isOpen={openPanels.entity} toggle={togglePanel}>
        {selectedObject ? (
          <div>
            <div style={{ fontWeight: 600 }}>{selectedObject.name}</div>
            <div style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>Type: {selectedObject.type}</div>
            {/* Add position/scale inputs here later */}
          </div>
        ) : (
          <div style={{ color: 'var(--color-text-muted)' }}>No selection</div>
        )}
      </Panel>

      <Panel id="outliner" title="Outliner" icon={<List size={16} />} isOpen={openPanels.outliner} toggle={togglePanel}>
        <div className="outliner-tree">
          {renderOutlinerNode(sceneRoot, selectedObject?.id, onSelectNode)}
        </div>
      </Panel>

      <Panel id="ai" title="AI Assistant" icon={<MessageSquare size={16} />} isOpen={openPanels.ai} toggle={togglePanel}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px' }}>
          <div style={{ overflowY: 'auto', flex: 1, fontSize: '0.8rem' }}>
            {chatHistory.map((msg, i) => (
              <div key={i} style={{ marginBottom: '8px', padding: '6px', borderRadius: '4px', background: msg.role === 'user' ? 'var(--color-accent-soft)' : '#f0f0f0' }}>
                <strong>{msg.role === 'user' ? 'You' : 'AI'}:</strong> {msg.text}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <input 
              className="input-field" 
              style={{ padding: '6px', fontSize: '0.8rem' }} 
              placeholder="Ask AI..." 
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onSendChat(e.target.value);
                  e.target.value = '';
                }
              }}
            />
          </div>
        </div>
      </Panel>
    </aside>
  );
}

function renderOutlinerNode(node, selectedId, onSelectNode, depth = 0) {
  return (
    <div key={node.id}>
      <div 
        className={`outliner-item ${node.id === selectedId ? 'selected' : ''}`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => onSelectNode(node.id)}
      >
        <Box size={14} />
        <span>{node.name}</span>
      </div>
      {node.children && node.children.map(child => renderOutlinerNode(child, selectedId, onSelectNode, depth + 1))}
    </div>
  );
}
