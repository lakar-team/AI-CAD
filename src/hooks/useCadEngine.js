/**
 * useCadEngine — React tool layer over the CAD core (src/core).
 *
 * Owns the CadModel instance, the active tool's state machine, selection and
 * inference. The Viewport feeds it world-space pick rays; every actual
 * geometry change goes through model.transact() so undo/redo always works.
 */

import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { CadModel } from '../core/model.js';
import { pushPull } from '../core/pushpull.js';
import { inferPoint } from '../core/inference.js';
import {
  add, sub, scale, normalize, distance,
  transformPoint, transformDirection,
  rayLineClosest, Y_AXIS, multiplyM4,
} from '../core/math3.js';
import { closeOverSelection } from '../core/model.js';
import { rectCorners, circlePoints } from '../core/shapes.js';

export function useCadEngine() {
  const [model, setModel] = useState(() => new CadModel());

  const [, setTick] = useState(0);
  const sync = useCallback(() => setTick((n) => n + 1), []);

  // version tracks model mutations for useMemo deps
  const version = model.version;

  const [activeTool, setTool] = useState('select');
  const [selection, setSelection] = useState(() => new Set()); // entity OR instance ids
  const [inference, setInference] = useState(null);
  const [axisLock, setAxisLock] = useState(null);
  const [measurement, setMeasurement] = useState('');
  const [hoveredFaceId, setHoveredFaceId] = useState(null);
  const [preview, setPreview] = useState(null); // viewport overlay description

  // transient per-tool state (never triggers renders by itself)
  const ts = useRef({});

  const resetTool = useCallback(() => {
    ts.current = {};
    setInference(null);
    setPreview(null);
    setAxisLock(null);
    setMeasurement('');
    setHoveredFaceId(null);
  }, []);

  const activateTool = useCallback((tool) => {
    resetTool();
    setTool(tool);
  }, [resetTool]);

  // ── helpers ────────────────────────────────────────────────────────────────

  const toLocal = useCallback(
    (worldPoint) => transformPoint(model.activeMatrixInverse(), worldPoint),
    [model],
  );

  const samePath = useCallback(
    (path) => JSON.stringify(path || []) === JSON.stringify(model.activeContext),
    [model],
  );

  /**
   * Turn an inference result into a vertex id in the ACTIVE mesh
   * (reusing snapped vertices, splitting snapped edges). Call inside transact.
   */
  const resolveVertex = useCallback((inf) => {
    const mesh = model.activeMesh();
    if (inf.type === 'endpoint' && samePath(inf.instancePath) && mesh.vertices.has(inf.entityId)) {
      return inf.entityId;
    }
    if ((inf.type === 'on-edge' || inf.type === 'midpoint') && samePath(inf.instancePath) && mesh.edges.has(inf.entityId)) {
      const v = mesh.splitEdge(inf.entityId, toLocal(inf.point));
      if (v) return v.id;
    }
    return mesh.addVertex(toLocal(inf.point)).id;
  }, [model, samePath, toLocal]);

  const infer = useCallback((ray, radius, opts = {}) => {
    return inferPoint(model, ray, { radius, axisLock, ...opts });
  }, [model, axisLock]);

  /** Which thing would a select-click hit? Returns {kind, id} or null. */
  const pickAt = useCallback((ray, radius) => {
    const inf = inferPoint(model, ray, { radius });
    if (!inf.entityId) return null;
    const ctx = model.activeContext;
    const path = inf.instancePath || [];
    // hit inside a deeper instance → select that instance at the current level
    if (path.length > ctx.length && JSON.stringify(path.slice(0, ctx.length)) === JSON.stringify(ctx)) {
      return { kind: 'instance', id: path[ctx.length], inf };
    }
    if (!samePath(path)) return null;
    const kind = inf.type === 'endpoint' ? 'vertex'
      : (inf.type === 'midpoint' || inf.type === 'on-edge') ? 'edge'
      : inf.type === 'on-face' ? 'face' : null;
    return kind ? { kind, id: inf.entityId, inf } : null;
  }, [model, samePath]);

  // ── pointer move ───────────────────────────────────────────────────────────

  const onPointerRay = useCallback((ray, radius) => {
    const t = ts.current;

    if (activeTool === 'pushpull') {
      if (t.faceId) {
        // dragging: distance = projection of cursor ray onto the face normal line
        const hit = rayLineClosest(ray.origin, normalize(ray.dir), t.centroidWorld, t.normalWorld);
        if (hit) {
          const d = hit.lineT;
          t.dist = d;
          setMeasurement(`${Math.abs(d).toFixed(3)} m`);
          setPreview({ type: 'pushpull', loop: t.loopWorld, normal: t.normalWorld, dist: d });
        }
        return;
      }
      const inf = infer(ray, radius);
      const hover = inf.type === 'on-face' && samePath(inf.instancePath) ? inf.entityId : null;
      setHoveredFaceId(hover);
      setInference(null);
      return;
    }

    const anchor = t.anchor || null;
    const inf = infer(ray, radius, { anchor: anchor?.point || null });
    setInference(inf);

    if (activeTool === 'line' && anchor) {
      setMeasurement(`${distance(anchor.point, inf.point).toFixed(3)} m`);
      ts.current.lastInf = inf;
      setPreview({ type: 'line', a: anchor.point, b: inf.point, axis: inf.axis });
    } else if (activeTool === 'rect' && anchor) {
      const corners = rectCorners(anchor, inf.point);
      ts.current.lastInf = inf;
      if (corners) {
        const [, b, , d] = corners;
        setMeasurement(`${distance(anchor.point, b).toFixed(3)} x ${distance(anchor.point, d).toFixed(3)} m`);
        setPreview({ type: 'loop', points: corners });
      }
    } else if (activeTool === 'circle' && anchor) {
      const r = distance(anchor.point, inf.point);
      ts.current.lastInf = inf;
      setMeasurement(`r = ${r.toFixed(3)} m`);
      setPreview({ type: 'loop', points: circlePoints(anchor, r) });
    } else if (activeTool === 'tape' && anchor) {
      setMeasurement(`${distance(anchor.point, inf.point).toFixed(3)} m`);
      setPreview({ type: 'line', a: anchor.point, b: inf.point, dashed: true });
    } else if (activeTool === 'move' && anchor) {
      const delta = sub(inf.point, anchor.point);
      setMeasurement(`${distance(anchor.point, inf.point).toFixed(3)} m`);
      ts.current.delta = delta;
      setPreview({ type: 'move', delta, axis: inf.axis, a: anchor.point, b: inf.point });
    }
  }, [activeTool, infer, samePath]);

  // ── clicks ─────────────────────────────────────────────────────────────────

  const onClick = useCallback((ray, radius, { shift = false } = {}) => {
    const t = ts.current;

    switch (activeTool) {
      case 'select': {
        const hit = pickAt(ray, radius);
        setSelection((prev) => {
          if (!hit) return shift ? prev : new Set();
          const next = shift ? new Set(prev) : new Set();
          if (shift && next.has(hit.id)) next.delete(hit.id);
          else next.add(hit.id);
          return next;
        });
        break;
      }

      case 'eraser': {
        const hit = pickAt(ray, radius);
        if (!hit) break;
        model.transact(() => {
          if (hit.kind === 'instance') model.eraseInstance(hit.id);
          else model.activeMesh().erase(hit.id);
        });
        setSelection(new Set());
        sync();
        break;
      }

      case 'line': {
        const inf = infer(ray, radius, { anchor: t.anchor?.point || null });
        if (!t.anchor) {
          ts.current.anchor = { point: inf.point, inf };
        } else {
          const startInf = t.anchor.inf;
          const endInf = inf;
          model.transact(() => {
            const mesh = model.activeMesh();
            const va = resolveVertex(startInf);
            const vb = resolveVertex(endInf);
            mesh.addEdge(va, vb);
          });
          // chain from the end point
          ts.current.anchor = { point: inf.point, inf };
          setAxisLock(null);
          sync();
        }
        setMeasurement('');
        break;
      }

      case 'rect': {
        const inf = infer(ray, radius, { anchor: t.anchor?.point || null });
        if (!t.anchor) {
          ts.current.anchor = {
            point: inf.point,
            inf,
            planeNormal: inf.planeNormal || Y_AXIS,
          };
        } else {
          const corners = rectCorners(t.anchor, inf.point);
          if (corners) commitLoop(model, corners, toLocal, sync);
          resetTool();
        }
        break;
      }

      case 'circle': {
        const inf = infer(ray, radius, { anchor: t.anchor?.point || null });
        if (!t.anchor) {
          ts.current.anchor = {
            point: inf.point,
            inf,
            planeNormal: inf.planeNormal || Y_AXIS,
          };
        } else {
          const r = distance(t.anchor.point, inf.point);
          if (r > 1e-4) commitLoop(model, circlePoints(t.anchor, r), toLocal, sync);
          resetTool();
        }
        break;
      }

      case 'pushpull': {
        if (!t.faceId) {
          const inf = infer(ray, radius);
          if (inf.type === 'on-face' && samePath(inf.instancePath)) {
            const mesh = model.activeMesh();
            const f = mesh.faces.get(inf.entityId);
            if (!f) break;
            const m = model.activeMatrix();
            ts.current.faceId = f.id;
            ts.current.normalLocal = [...f.normal];
            ts.current.normalWorld = normalize(transformDirection(m, f.normal));
            ts.current.centroidWorld = transformPoint(m, mesh.faceCentroid(f.id));
            ts.current.loopWorld = f.loop.map((vid) => transformPoint(m, mesh.vertices.get(vid).p));
            ts.current.dist = 0;
            setHoveredFaceId(null);
          }
        } else {
          commitPushPull(model, t, sync);
          resetTool();
        }
        break;
      }

      case 'move': {
        const inf = infer(ray, radius, { anchor: t.anchor?.point || null });
        if (!t.anchor) {
          // allow picking under the cursor if nothing is selected yet
          if (selection.size === 0) {
            const hit = pickAt(ray, radius);
            if (hit) setSelection(new Set([hit.id]));
            else break;
          }
          ts.current.anchor = { point: inf.point, inf };
        } else {
          const delta = sub(inf.point, t.anchor.point);
          commitMove(model, selection, delta, toLocal, sync);
          resetTool();
        }
        break;
      }

      case 'tape': {
        const inf = infer(ray, radius, { anchor: t.anchor?.point || null });
        if (!t.anchor) {
          ts.current.anchor = { point: inf.point, inf };
        } else {
          setMeasurement(`${distance(t.anchor.point, inf.point).toFixed(3)} m`);
          ts.current = {};
          setPreview(null);
        }
        break;
      }

      default:
        break;
    }
  }, [activeTool, infer, pickAt, model, resolveVertex, resetTool, selection, samePath, sync, toLocal]);

  const onDoubleClick = useCallback((ray, radius) => {
    if (activeTool !== 'select') return;
    const hit = pickAt(ray, radius);
    if (hit && hit.kind === 'instance') {
      model.enterContext(hit.id);
      setSelection(new Set());
      sync();
    } else if (!hit && model.activeContext.length > 0) {
      model.exitContext();
      setSelection(new Set());
      sync();
    }
  }, [activeTool, pickAt, model, sync]);

  // ── typed measurements ("3", "2.5") ───────────────────────────────────────

  const submitMeasurement = useCallback((text) => {
    const value = parseFloat(String(text).replace(',', '.'));
    if (!isFinite(value) || value === 0) return;
    const t = ts.current;

    if (activeTool === 'line' && t.anchor && t.lastInf) {
      const dir = normalize(sub(t.lastInf.point, t.anchor.point));
      const end = add(t.anchor.point, scale(dir, Math.abs(value)));
      const endInf = { ...t.lastInf, point: end, type: 'free', entityId: null };
      const startInf = t.anchor.inf;
      model.transact(() => {
        const mesh = model.activeMesh();
        mesh.addEdge(resolveVertex(startInf), resolveVertex(endInf));
      });
      ts.current.anchor = { point: end, inf: endInf };
      setPreview(null);
      setMeasurement('');
      sync();
    } else if (activeTool === 'pushpull' && t.faceId) {
      t.dist = Math.sign(t.dist || 1) * Math.abs(value);
      commitPushPull(model, t, sync);
      resetTool();
    } else if (activeTool === 'circle' && t.anchor) {
      commitLoop(model, circlePoints(t.anchor, Math.abs(value)), toLocal, sync);
      resetTool();
    }
  }, [activeTool, model, resolveVertex, resetTool, sync, toLocal]);

  // ── box selection (window/crossing) ──────────────────────────────────────

  /**
   * Called by Viewport when a box-drag completes in select mode.
   * project(worldPt) → {x, y} in canvas pixels (from Three.js camera).
   */
  const selectByScreenBox = useCallback((rect, direction, project) => {
    if (activeTool !== 'select') return;
    const { x1, y1, x2, y2 } = rect;
    const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);

    const inRect = (p) => p !== null && p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;

    const activeMatrix = model.activeMatrix();
    const mesh = model.activeMesh();
    const activeDef = model.activeDefinition();
    const newSel = new Set();

    const proj = (localPt) => {
      try { return project(transformPoint(activeMatrix, localPt)); }
      catch { return null; }
    };

    if (direction === 'window') {
      // fully enclosed
      for (const v of mesh.vertices.values()) {
        if (inRect(proj(v.p))) newSel.add(v.id);
      }
      for (const e of mesh.edges.values()) {
        const va = mesh.vertices.get(e.a), vb = mesh.vertices.get(e.b);
        if (va && vb && inRect(proj(va.p)) && inRect(proj(vb.p))) newSel.add(e.id);
      }
      for (const f of mesh.faces.values()) {
        if (f.loop.every((vid) => {
          const v = mesh.vertices.get(vid);
          return v && inRect(proj(v.p));
        })) newSel.add(f.id);
      }
      for (const inst of activeDef.children) {
        const iDef = model.definitions.get(inst.definitionId);
        if (!iDef) continue;
        const iM = multiplyM4(activeMatrix, inst.transform);
        if ([...iDef.mesh.vertices.values()].every((v) => {
          try { return inRect(project(transformPoint(iM, v.p))); }
          catch { return false; }
        })) newSel.add(inst.id);
      }
    } else {
      // touching / crossing
      for (const v of mesh.vertices.values()) {
        if (inRect(proj(v.p))) newSel.add(v.id);
      }
      for (const e of mesh.edges.values()) {
        const va = mesh.vertices.get(e.a), vb = mesh.vertices.get(e.b);
        if (!va || !vb) continue;
        const pa = proj(va.p), pb = proj(vb.p);
        if (inRect(pa) || inRect(pb) || seg2dCrossesRect(pa, pb, minX, minY, maxX, maxY))
          newSel.add(e.id);
      }
      for (const f of mesh.faces.values()) {
        if (f.loop.some((vid) => {
          const v = mesh.vertices.get(vid);
          return v && inRect(proj(v.p));
        })) newSel.add(f.id);
      }
      for (const inst of activeDef.children) {
        const iDef = model.definitions.get(inst.definitionId);
        if (!iDef) continue;
        const iM = multiplyM4(activeMatrix, inst.transform);
        if ([...iDef.mesh.vertices.values()].some((v) => {
          try { return inRect(project(transformPoint(iM, v.p))); }
          catch { return false; }
        })) newSel.add(inst.id);
      }
    }

    setSelection(newSel);
  }, [activeTool, model]);

  // ── selection centroid (for gizmo display) ────────────────────────────────

  const selectionCentroid = useMemo(() => {
    if (selection.size === 0) return null;
    const mesh = model.activeMesh();
    const activeMatrix = model.activeMatrix();
    const activeDef = model.activeDefinition();
    const pts = [];

    for (const id of selection) {
      if (mesh.vertices.has(id)) {
        pts.push(transformPoint(activeMatrix, mesh.vertices.get(id).p));
      } else if (mesh.edges.has(id)) {
        const e = mesh.edges.get(id);
        const va = mesh.vertices.get(e.a), vb = mesh.vertices.get(e.b);
        if (va) pts.push(transformPoint(activeMatrix, va.p));
        if (vb) pts.push(transformPoint(activeMatrix, vb.p));
      } else if (mesh.faces.has(id)) {
        const f = mesh.faces.get(id);
        for (const vid of f.loop) {
          const v = mesh.vertices.get(vid);
          if (v) pts.push(transformPoint(activeMatrix, v.p));
        }
      } else {
        const inst = activeDef.children.find((c) => c.id === id);
        if (inst) {
          const iDef = model.definitions.get(inst.definitionId);
          const iM = multiplyM4(activeMatrix, inst.transform);
          if (iDef) {
            for (const v of iDef.mesh.vertices.values()) {
              pts.push(transformPoint(iM, v.p));
            }
          }
        }
      }
    }

    if (!pts.length) return null;
    const sum = pts.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]], [0, 0, 0]);
    return [sum[0] / pts.length, sum[1] / pts.length, sum[2] / pts.length];
  }, [model, version, selection]);

  // ── structure operations ──────────────────────────────────────────────────

  const makeGroupOrComponent = useCallback((isComponent) => {
    const mesh = model.activeMesh();
    const ids = [...selection].filter((id) => mesh.getEntity(id));
    if (ids.length === 0) return null;
    const inst = model.transact(() =>
      model.makeInstanceFromEntities(ids, { isComponent }),
    );
    setSelection(inst ? new Set([inst.id]) : new Set());
    sync();
    return inst;
  }, [model, selection, sync]);

  const explodeSelected = useCallback(() => {
    model.transact(() => {
      for (const id of selection) {
        if (model.findInstance(id)) model.explodeInstance(id);
      }
    });
    setSelection(new Set());
    sync();
  }, [model, selection, sync]);

  const deleteSelected = useCallback(() => {
    if (selection.size === 0) return;
    model.transact(() => {
      const mesh = model.activeMesh();
      for (const id of selection) {
        if (model.findInstance(id)) model.eraseInstance(id);
        else mesh.erase(id);
      }
    });
    setSelection(new Set());
    sync();
  }, [model, selection, sync]);

  const undo = useCallback(() => { model.undo(); setSelection(new Set()); resetTool(); sync(); }, [model, resetTool, sync]);
  const redo = useCallback(() => { model.redo(); setSelection(new Set()); resetTool(); sync(); }, [model, resetTool, sync]);

  const replaceModel = useCallback((newModel) => {
    setModel(newModel);
    setSelection(new Set());
    resetTool();
  }, [resetTool]);

  // ── keyboard ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const key = e.key.toLowerCase();

      if (e.ctrlKey || e.metaKey) {
        if (key === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
        if (key === 'y') { e.preventDefault(); redo(); }
        return;
      }

      switch (e.key) {
        case 'Escape':
          if (ts.current.anchor || ts.current.faceId) { resetTool(); }
          else if (selection.size) setSelection(new Set());
          else if (model.activeContext.length) { model.exitContext(); sync(); }
          break;
        case ' ': e.preventDefault(); activateTool('select'); break;
        case 'ArrowRight': e.preventDefault(); setAxisLock((a) => (a === 'x' ? null : 'x')); break;
        case 'ArrowUp': e.preventDefault(); setAxisLock((a) => (a === 'y' ? null : 'y')); break;
        case 'ArrowLeft': e.preventDefault(); setAxisLock((a) => (a === 'z' ? null : 'z')); break;
        case 'Delete':
        case 'Backspace': deleteSelected(); break;
        default: {
          const tools = { l: 'line', r: 'rect', c: 'circle', p: 'pushpull', m: 'move', e: 'eraser', t: 'tape' };
          if (key === 'g') { e.shiftKey ? makeGroupOrComponent(true) : makeGroupOrComponent(false); }
          else if (tools[key]) activateTool(tools[key]);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activateTool, deleteSelected, makeGroupOrComponent, model, redo, resetTool, selection, sync, undo]);

  return {
    model,
    version: model.version,
    activeTool,
    setActiveTool: activateTool,
    selection,
    setSelection,
    inference,
    axisLock,
    measurement,
    setMeasurement,
    hoveredFaceId,
    preview,
    selectionCentroid,
    onPointerRay,
    onClick,
    onDoubleClick,
    submitMeasurement,
    selectByScreenBox,
    makeGroup: () => makeGroupOrComponent(false),
    makeComponent: () => makeGroupOrComponent(true),
    explodeSelected,
    deleteSelected,
    undo,
    redo,
    replaceModel,
    enterContextDepth: model.activeContext.length,
  };
}

// ── tool commit helpers (module-level, operate via transact) ─────────────────

function commitLoop(model, worldPoints, toLocal, sync) {
  model.transact(() => {
    const mesh = model.activeMesh();
    const vids = worldPoints.map((p) => mesh.addVertex(toLocal(p)).id);
    for (let i = 0; i < vids.length; i++) {
      mesh.addEdge(vids[i], vids[(i + 1) % vids.length]);
    }
  });
  sync();
}

function commitPushPull(model, t, sync) {
  if (!t.faceId || !t.dist || Math.abs(t.dist) < 1e-4) return;
  model.transact(() => {
    pushPull(model.activeMesh(), t.faceId, t.dist);
  });
  sync();
}

function commitMove(model, selection, delta, toLocal, sync) {
  if (distance(delta, [0, 0, 0]) < 1e-6) return;
  model.transact(() => {
    const mesh = model.activeMesh();
    const entityIds = [...selection].filter((id) => mesh.getEntity(id));
    const instanceIds = [...selection].filter((id) => model.findInstance(id));
    for (const id of instanceIds) model.translateInstance(id, delta);
    if (entityIds.length) {
      const inv = model.activeMatrixInverse();
      const localDelta = sub(transformPoint(inv, delta), transformPoint(inv, [0, 0, 0]));
      const { vertices } = closeOverSelection(mesh, entityIds);
      const moves = new Map();
      for (const vid of vertices) {
        moves.set(vid, add(mesh.vertices.get(vid).p, localDelta));
      }
      mesh.moveVertices(moves);
    }
  });
  sync();
}

// ── 2D segment/rect helpers for box selection ──────────────────────────────

function seg2dCrossesRect(a, b, minX, minY, maxX, maxY) {
  if (!a || !b) return false;
  const edges = [
    [{ x: minX, y: minY }, { x: maxX, y: minY }],
    [{ x: maxX, y: minY }, { x: maxX, y: maxY }],
    [{ x: maxX, y: maxY }, { x: minX, y: maxY }],
    [{ x: minX, y: maxY }, { x: minX, y: minY }],
  ];
  return edges.some(([c, d]) => seg2dIntersects(a, b, c, d));
}

function seg2dIntersects(p1, p2, p3, p4) {
  const d1x = p2.x - p1.x, d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x, d2y = p4.y - p3.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return false;
  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom;
  const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}
