import React from 'react';

export default function BottomBar({ status, measurements }) {
  return (
    <footer className="bottom-bar">
      <div style={{ color: 'var(--color-text-muted)', fontWeight: 500 }}>
        {status || 'Select objects or choose a tool to begin.'}
      </div>
      
      <div className="measurements-box">
        <label>Measurements</label>
        <input 
          type="text" 
          value={measurements || ''} 
          onChange={(e) => onMeasurementsChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onMeasurementsSubmit(e.target.value);
          }}
          placeholder="0.00m"
        />
      </div>
    </footer>
  );
}
