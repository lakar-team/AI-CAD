import { useState, useCallback, useRef } from 'react';
import * as THREE from 'three';
import { ManifoldModel, getInference } from '../services/geometryEngine';

export function useCadEngine() {
  const [model, setModel] = useState(() => new ManifoldModel());
  const [activeTool, setActiveTool] = useState('select');
  const [selectedId, setSelectedId] = useState(null);
  const [inference, setInference] = useState(null); // { point, type }
  
  // Tool States
  const [lineStart, setLineStart] = useState(null);
  const [moveStart, setMoveStart] = useState(null);
  const [ghostLineEnd, setGhostLineEnd] = useState(null);

  // --- Handlers ---
  const handlePointerMove = useCallback((point) => {
    const inf = getInference(point, model);
    setInference(inf);

    if (activeTool === 'line' && lineStart) {
      setGhostLineEnd(inf.point);
    }
  }, [model, activeTool, lineStart]);

  const handlePointerDown = useCallback((point) => {
    const inf = getInference(point, model);

    if (activeTool === 'select') {
      setSelectedId(inf.id || null);
    } else if (activeTool === 'line') {
      if (!lineStart) {
        setLineStart(inf.point.clone());
      } else {
        // Create actual edge
        const v1 = model.addVertex(lineStart.x, lineStart.y, lineStart.z);
        const v2 = model.addVertex(inf.point.x, inf.point.y, inf.point.z);
        model.addEdge(v1, v2);
        
        // Chain like SketchUp
        setLineStart(inf.point.clone());
        setGhostLineEnd(null);
        // Force re-render
        setModel(Object.assign(Object.create(Object.getPrototypeOf(model)), model));
      }
    } else if (activeTool === 'move') {
      if (!moveStart) {
        setMoveStart(inf.point.clone());
      } else {
        const delta = new THREE.Vector3().subVectors(inf.point, moveStart);
        if (selectedId && model.vertices.has(selectedId)) {
          model.moveVertex(selectedId, delta);
        }
        setMoveStart(null);
        setModel(Object.assign(Object.create(Object.getPrototypeOf(model)), model));
      }
    }
  }, [activeTool, lineStart, moveStart, model, selectedId]);

  const cancelTool = useCallback(() => {
    setLineStart(null);
    setMoveStart(null);
    setGhostLineEnd(null);
    setInference(null);
  }, []);

  const handleMeasurementsSubmit = useCallback((val) => {
    const num = parseFloat(val);
    if (isNaN(num)) return;

    if (activeTool === 'line' && lineStart && ghostLineEnd) {
      const dir = new THREE.Vector3().subVectors(ghostLineEnd, lineStart).normalize();
      const targetPoint = lineStart.clone().add(dir.multiplyScalar(num));
      
      const v1 = model.addVertex(lineStart.x, lineStart.y, lineStart.z);
      const v2 = model.addVertex(targetPoint.x, targetPoint.y, targetPoint.z);
      model.addEdge(v1, v2);
      
      setLineStart(targetPoint.clone());
      setGhostLineEnd(null);
      setModel(Object.assign(Object.create(Object.getPrototypeOf(model)), model));
    }
  }, [activeTool, lineStart, ghostLineEnd, model]);

  return {
    model,
    activeTool,
    setActiveTool,
    selectedId,
    setSelectedId,
    inference,
    lineStart,
    ghostLineEnd,
    handlePointerMove,
    handlePointerDown,
    handleMeasurementsSubmit,
    cancelTool
  };
}
