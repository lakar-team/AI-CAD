import { useState, useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  createScene,
  addVertex,
  addEdge,
  moveVertex,
  deleteEntity,
  extrudeFace,
  getInference,
} from '../services/geometryEngine';

export function useCadEngine() {
  const [scene, setScene]           = useState(createScene);
  const [activeTool, setActiveTool] = useState('select');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [inference, setInference]   = useState(null);
  const [measurements, setMeasurements] = useState('');
  const [hoveredFaceId, setHoveredFaceId] = useState(null);
  const [pushPullDepth, setPushPullDepth] = useState(null); // live preview depth

  // Transient drawing state in refs (avoids stale closures)
  const lineStartPt  = useRef(null); // THREE.Vector3 of first click
  const lineStartVId = useRef(null); // vertex id of first click
  const ghostEnd     = useRef(null); // THREE.Vector3 current mouse pos
  const tapeStart    = useRef(null);
  const moveStart    = useRef(null);
  const pushPullFace = useRef(null); // faceId being extruded
  const pushPullOriginY = useRef(null); // Y coordinate when push/pull started

  const [, forceUpdate] = useState(0);
  const tick = () => forceUpdate(n => n + 1);

  // ── Keyboard shortcuts ────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      switch (e.key.toLowerCase()) {
        case 'escape':
        case ' ':
          e.preventDefault();
          reset(); setActiveTool('select'); break;
        case 'l': reset(); setActiveTool('line'); break;
        case 'p': reset(); setActiveTool('pushpull'); break;
        case 'm': reset(); setActiveTool('move'); break;
        case 'e': reset(); setActiveTool('eraser'); break;
        case 't': reset(); setActiveTool('tape'); break;
        case 'delete':
        case 'backspace':
          setScene(prev => {
            let s = prev;
            for (const id of selectedIds) s = deleteEntity(s, id);
            return s;
          });
          setSelectedIds(new Set());
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedIds]);

  function reset() {
    lineStartPt.current   = null;
    lineStartVId.current  = null;
    ghostEnd.current      = null;
    tapeStart.current     = null;
    moveStart.current     = null;
    pushPullFace.current  = null;
    pushPullOriginY.current = null;
    setInference(null);
    setMeasurements('');
    setPushPullDepth(null);
    tick();
  }

  // ── Pointer MOVE ─────────────────────────────────────────
  const handlePointerMove = useCallback((rawPoint, currentScene) => {
    const inf = getInference(rawPoint, currentScene);
    setInference(inf);

    if (activeTool === 'line' && lineStartPt.current) {
      ghostEnd.current = inf.point.clone();
      const d = lineStartPt.current.distanceTo(inf.point);
      setMeasurements(d.toFixed(3) + ' m');
      tick();
    }

    if (activeTool === 'tape' && tapeStart.current) {
      ghostEnd.current = inf.point.clone();
      const d = tapeStart.current.distanceTo(inf.point);
      setMeasurements(d.toFixed(3) + ' m');
      tick();
    }
  }, [activeTool]);

  // Face hover (called from Viewport with the faceId under cursor)
  const handleFaceHover = useCallback((faceId) => {
    setHoveredFaceId(faceId);
  }, []);

  // ── Pointer DOWN ─────────────────────────────────────────
  const handlePointerDown = useCallback((rawPoint, currentScene) => {
    const inf = getInference(rawPoint, currentScene);

    if (activeTool === 'select') {
      setSelectedIds(inf.snapId ? new Set([inf.snapId]) : new Set());

    } else if (activeTool === 'eraser') {
      if (inf.snapId) {
        setScene(prev => deleteEntity(prev, inf.snapId));
        setSelectedIds(prev => { const n = new Set(prev); n.delete(inf.snapId); return n; });
      }

    } else if (activeTool === 'tape') {
      if (!tapeStart.current) {
        tapeStart.current = inf.point.clone();
        lineStartPt.current = inf.point.clone();
        tick();
      } else {
        const d = tapeStart.current.distanceTo(inf.point);
        setMeasurements(d.toFixed(3) + ' m');
        tapeStart.current = null;
        lineStartPt.current = null;
        ghostEnd.current = null;
        tick();
      }

    } else if (activeTool === 'line') {
      if (!lineStartPt.current) {
        // First click: set start
        let s = currentScene;
        let vId;
        if (inf.type === 'endpoint' && inf.snapId && currentScene.vertices[inf.snapId]) {
          vId = inf.snapId;
        } else {
          const result = addVertex(s, inf.point.x, inf.point.y, inf.point.z);
          s = result.scene;
          vId = result.vertexId;
        }
        lineStartPt.current  = inf.point.clone();
        lineStartVId.current = vId;
        ghostEnd.current     = inf.point.clone();
        setScene(s);
        tick();
      } else {
        // Second click: draw edge, check for face closure
        setScene(prev => {
          let s = prev;
          let endVId;

          if (inf.type === 'endpoint' && inf.snapId && prev.vertices[inf.snapId]) {
            endVId = inf.snapId;
          } else {
            const result = addVertex(s, inf.point.x, inf.point.y, inf.point.z);
            s = result.scene;
            endVId = result.vertexId;
          }

          const result = addEdge(s, lineStartVId.current, endVId);
          s = result.scene;

          // Chain: end becomes new start
          lineStartPt.current  = inf.point.clone();
          lineStartVId.current = endVId;
          ghostEnd.current     = inf.point.clone();

          return s;
        });
        setMeasurements('');
        tick();
      }

    } else if (activeTool === 'pushpull') {
      // Click on a face to start extruding
      if (hoveredFaceId && !pushPullFace.current) {
        pushPullFace.current    = hoveredFaceId;
        pushPullOriginY.current = rawPoint.y;
        tick();
      } else if (pushPullFace.current) {
        // Second click: commit extrusion
        const depth = pushPullDepth || 0;
        if (Math.abs(depth) > 0.001) {
          setScene(prev => extrudeFace(prev, pushPullFace.current, depth));
        }
        pushPullFace.current    = null;
        pushPullOriginY.current = null;
        setPushPullDepth(null);
        tick();
      }

    } else if (activeTool === 'move') {
      if (!moveStart.current) {
        moveStart.current = inf.point.clone();
        tick();
      } else {
        const delta = new THREE.Vector3().subVectors(inf.point, moveStart.current);
        setScene(prev => {
          let s = prev;
          for (const id of selectedIds) {
            if (prev.vertices[id]) s = moveVertex(s, id, delta.x, delta.y, delta.z);
          }
          return s;
        });
        moveStart.current = null;
        tick();
      }
    }
  }, [activeTool, hoveredFaceId, pushPullDepth, selectedIds]);

  // Push/Pull live depth update (from viewport mouse Y delta)
  const handlePushPullMove = useCallback((rawY) => {
    if (activeTool === 'pushpull' && pushPullFace.current && pushPullOriginY.current !== null) {
      const depth = rawY - pushPullOriginY.current;
      setPushPullDepth(depth);
      setMeasurements(Math.abs(depth).toFixed(3) + ' m');
    }
  }, [activeTool]);

  // ── Measurements Enter ────────────────────────────────────
  const handleMeasurementsSubmit = useCallback((val) => {
    const num = parseFloat(val);
    if (isNaN(num) || num <= 0) return;

    if (activeTool === 'line' && lineStartPt.current && ghostEnd.current) {
      const dir = new THREE.Vector3()
        .subVectors(ghostEnd.current, lineStartPt.current)
        .normalize();
      if (dir.length() < 0.0001) return;
      const endPt = lineStartPt.current.clone().add(dir.multiplyScalar(num));

      setScene(prev => {
        let s = prev;
        const r1 = addVertex(s, endPt.x, endPt.y, endPt.z);
        s = r1.scene;
        const r2 = addEdge(s, lineStartVId.current, r1.vertexId);
        s = r2.scene;
        lineStartPt.current  = endPt.clone();
        lineStartVId.current = r1.vertexId;
        ghostEnd.current     = endPt.clone();
        return s;
      });
      setMeasurements('');
      tick();
    }

    if (activeTool === 'pushpull' && pushPullFace.current) {
      setScene(prev => extrudeFace(prev, pushPullFace.current, num));
      pushPullFace.current = null;
      setPushPullDepth(null);
      setMeasurements('');
      tick();
    }
  }, [activeTool]);

  return {
    scene,
    activeTool,
    setActiveTool: (tool) => { reset(); setActiveTool(tool); },
    selectedIds,
    setSelectedIds,
    inference,
    lineStart: lineStartPt.current,
    ghostEnd:  ghostEnd.current,
    measurements,
    setMeasurements,
    hoveredFaceId,
    pushPullDepth,
    handlePointerMove,
    handlePointerDown,
    handleFaceHover,
    handlePushPullMove,
    handleMeasurementsSubmit,
    reset,
  };
}
