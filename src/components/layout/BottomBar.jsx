import React, { useRef, useEffect } from 'react';

const TOOL_HINTS = {
  select:  'Click to select. Delete key removes selected.',
  line:    'Click to set start point. Click again to draw. Escape or Space to finish.',
  eraser:  'Click on a vertex or edge to delete it.',
  move:    'Select entities first, then click start and end points.',
  tape:    'Click two points to measure distance.',
};

export default function BottomBar({ activeTool, measurements, onMeasurementsChange, onMeasurementsSubmit }) {
  const inputRef = useRef(null);

  // Auto-focus measurements when drawing
  useEffect(() => {
    if (activeTool === 'line' && measurements && inputRef.current) {
      inputRef.current.focus();
    }
  }, [measurements, activeTool]);

  const hint = TOOL_HINTS[activeTool] || '';

  return (
    <footer className="sk-bottombar">
      <span className="sk-status">{hint}</span>
      <div className="sk-measurements">
        <span className="sk-measurements-label">Measurements</span>
        <input
          ref={inputRef}
          className="sk-measurements-input"
          type="text"
          value={measurements}
          onChange={(e) => onMeasurementsChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onMeasurementsSubmit(measurements);
              e.target.blur();
            }
          }}
          placeholder="—"
          readOnly={activeTool === 'tape'} // tape is read-only display
        />
      </div>
    </footer>
  );
}
