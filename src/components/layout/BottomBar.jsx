const TOOL_HINTS = {
  select: 'Click to select (Shift adds). Double-click a group/component to edit inside it. Delete removes.',
  line: 'Click points to draw edges — closed loops become faces. Type a length + Enter. Arrows lock axis.',
  rect: 'Click two opposite corners on the ground or on a face.',
  circle: 'Click the center, then a point on the radius (or type the radius + Enter).',
  eraser: 'Click an edge, face, vertex or group to delete it.',
  move: 'Click a base point, then a destination. Works on selections and groups.',
  tape: 'Click two points to measure the distance.',
  pushpull: 'Click a face, drag along its normal, click again — or type a distance + Enter.',
  orbit: 'Drag with the left mouse button to orbit. Middle = orbit, right = pan (always).',
};

const AXIS_LABELS = { x: 'red (X)', y: 'blue (Y)', z: 'green (Z)' };

export default function BottomBar({
  activeTool,
  axisLock,
  measurement,
  onMeasurementChange,
  onMeasurementSubmit,
}) {
  return (
    <footer className="sk-bottombar">
      <span className="sk-status">
        {TOOL_HINTS[activeTool] || ''}
        {axisLock && (
          <strong style={{ marginLeft: 8 }}>🔒 locked to the {AXIS_LABELS[axisLock]} axis</strong>
        )}
      </span>
      <div className="sk-measurements">
        <span className="sk-measurements-label">Measurements</span>
        <input
          className="sk-measurements-input"
          type="text"
          value={measurement}
          onChange={(e) => onMeasurementChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onMeasurementSubmit(e.target.value);
              e.target.blur();
            }
          }}
          placeholder="—"
        />
      </div>
    </footer>
  );
}
