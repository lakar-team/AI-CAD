import { useState, useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  createScene,
  addVertex,
  addEdge,
  moveVertex,
  deleteEntity,
  getInference,
} from '../services/geometryEngine';

/**
 * useCadEngine — all SketchUp tool logic lives here.
 * Tools: select, line, move, eraser, tape
 */
export function useCadEngine() {
  const [scene, setScene]           = useState(createScene);
  const [activeTool, setActiveTool] = useState('select');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [inference, setInference]   = useState(null);
  const [measurements, setMeasurements] = useState('');

  // Per-tool transient state (refs to avoid stale closure issues)
  const lineStartRef   = useRef(null); // THREE.Vector3
  const lineStartVId   = useRef(null); // vertex id of line start
  const moveStartRef   = useRef(null); // THREE.Vector3
  const tapeStartRef   = useRef(null); // THREE.Vector3
  const ghostEndRef    = useRef(null); // THREE.Vector3 (for rendering)

  const [tick, setTick] = useState(0); // force re-render after ref mutations

  const forceTick = () => setTick(t => t + 1);

  // ─── Keyboard shortcuts ──────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT') return; // don't hijack text inputs
      switch (e.key.toLowerCase()) {
        case 'escape':
          resetToolState();
          setActiveTool('select');
          break;
        case ' ':
          e.preventDefault();
          resetToolState();
          setActiveTool('select');
          break;
        case 'l':
          resetToolState();
          setActiveTool('line');
          break;
        case 'm':
          resetToolState();
          setActiveTool('move');
          break;
        case 'e':
          resetToolState();
          setActiveTool('eraser');
          break;
        case 't':
          resetToolState();
          setActiveTool('tape');
          break;
        case 'delete':
        case 'backspace':
          setScene(prev => {
            let s = prev;
            selectedIds.forEach(id => { s = deleteEntity(s, id); });
            return s;
          });
          setSelectedIds(new Set());
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedIds]);

  function resetToolState() {
    lineStartRef.current  = null;
    lineStartVId.current  = null;
    moveStartRef.current  = null;
    tapeStartRef.current  = null;
    ghostEndRef.current   = null;
    setInference(null);
    setMeasurements('');
    forceTick();
  }

  // ─── Pointer move ────────────────────────────────────────
  const handlePointerMove = useCallback((rawPoint, currentScene) => {
    const inf = getInference(rawPoint, currentScene);
    setInference(inf);

    if ((activeTool === 'line' || activeTool === 'tape') && lineStartRef.current) {
      ghostEndRef.current = inf.point.clone();
      const dist = lineStartRef.current.distanceTo(inf.point);
      setMeasurements(dist.toFixed(3) + ' m');
      forceTick();
    }
  }, [activeTool]);

  // ─── Pointer down ────────────────────────────────────────
  const handlePointerDown = useCallback((rawPoint, currentScene) => {
    const inf = getInference(rawPoint, currentScene);

    if (activeTool === 'line') {
      if (!lineStartRef.current) {
        // First click — place start point
        lineStartRef.current = inf.point.clone();
        let s = currentScene;
        s = addVertex(s, inf.point.x, inf.point.y, inf.point.z);
        lineStartVId.current = s._added.id;
        setScene(s);
      } else {
        // Second click — place end point, draw edge
        setScene(prev => {
          let s = prev;
          // Reuse snapped vertex or create new
          let endVId;
          if (inf.type === 'endpoint' && inf.snapId && prev.vertices[inf.snapId]) {
            endVId = inf.snapId;
          } else {
            s = addVertex(s, inf.point.x, inf.point.y, inf.point.z);
            endVId = s._added.id;
          }
          s = addEdge(s, lineStartVId.current, endVId);
          return s;
        });
        // Chain: end of this line is start of next
        lineStartRef.current = inf.point.clone();
        ghostEndRef.current  = inf.point.clone();
        setScene(prev => {
          // Make sure end vertex exists or reuse snapped one
          if (inf.type === 'endpoint' && inf.snapId && prev.vertices[inf.snapId]) {
            lineStartVId.current = inf.snapId;
            return prev;
          } else {
            // find vertex closest to inf.point
            for (const v of Object.values(prev.vertices)) {
              const vp = new THREE.Vector3(v.x, v.y, v.z);
              if (vp.distanceTo(inf.point) < 0.001) {
                lineStartVId.current = v.id;
                return prev;
              }
            }
            const s = addVertex(prev, inf.point.x, inf.point.y, inf.point.z);
            lineStartVId.current = s._added.id;
            return s;
          }
        });
        forceTick();
      }

    } else if (activeTool === 'eraser') {
      if (inf.snapId) {
        setScene(prev => deleteEntity(prev, inf.snapId));
        setSelectedIds(prev => { const n = new Set(prev); n.delete(inf.snapId); return n; });
      }

    } else if (activeTool === 'tape') {
      if (!tapeStartRef.current) {
        tapeStartRef.current = inf.point.clone();
        lineStartRef.current = inf.point.clone();
        forceTick();
      } else {
        const dist = tapeStartRef.current.distanceTo(inf.point);
        setMeasurements(dist.toFixed(3) + ' m (tape)');
        tapeStartRef.current = null;
        lineStartRef.current = null;
        ghostEndRef.current  = null;
        forceTick();
      }

    } else if (activeTool === 'select') {
      if (inf.snapId) {
        setSelectedIds(new Set([inf.snapId]));
      } else {
        setSelectedIds(new Set());
      }

    } else if (activeTool === 'move') {
      if (!moveStartRef.current) {
        moveStartRef.current = inf.point.clone();
        forceTick();
      } else {
        const delta = new THREE.Vector3().subVectors(inf.point, moveStartRef.current);
        setScene(prev => {
          let s = prev;
          selectedIds.forEach(id => {
            if (prev.vertices[id]) {
              s = moveVertex(s, id, delta.x, delta.y, delta.z);
            }
          });
          return s;
        });
        moveStartRef.current = null;
        forceTick();
      }
    }
  }, [activeTool, selectedIds]);

  // ─── Measurements box: Enter key commits length ─────────
  const handleMeasurementsSubmit = useCallback((val) => {
    const num = parseFloat(val);
    if (isNaN(num) || num <= 0) return;

    if (activeTool === 'line' && lineStartRef.current && ghostEndRef.current) {
      const dir = new THREE.Vector3().subVectors(ghostEndRef.current, lineStartRef.current);
      if (dir.length() < 0.0001) return;
      dir.normalize().multiplyScalar(num);
      const endPoint = lineStartRef.current.clone().add(dir);

      setScene(prev => {
        let s = prev;
        s = addVertex(s, endPoint.x, endPoint.y, endPoint.z);
        const endVId = s._added.id;
        s = addEdge(s, lineStartVId.current, endVId);
        // Prepare for next segment
        lineStartRef.current = endPoint.clone();
        s = addVertex(s, endPoint.x, endPoint.y, endPoint.z);
        lineStartVId.current = s._added.id;
        return s;
      });
      ghostEndRef.current = null;
      setMeasurements('');
      forceTick();
    }
  }, [activeTool]);

  return {
    scene,
    activeTool,
    setActiveTool: (tool) => { resetToolState(); setActiveTool(tool); },
    selectedIds,
    setSelectedIds,
    inference,
    lineStart: lineStartRef.current,
    ghostEnd: ghostEndRef.current,
    measurements,
    setMeasurements,
    handlePointerMove,
    handlePointerDown,
    handleMeasurementsSubmit,
    resetToolState,
  };
}
