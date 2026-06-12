/**
 * model.js — the CAD document: a scene graph of component definitions and
 * instances, with the root model itself being a definition.
 *
 *   CadModel
 *   ├─ definitions: Map<defId, Definition>
 *   │    Definition = { id, name, isComponent, mesh: Mesh, children: [Instance] }
 *   └─ rootId → the root Definition ("the model")
 *
 *   Instance = { id, name, type: 'group'|'component', definitionId,
 *                transform: number[16] (column-major, like glTF/three.js) }
 *
 * Groups are instances whose definition is private (made unique when edited);
 * Components share definitions — editing one instance's definition updates
 * every instance. This whole structure serializes to clean JSON (see toJSON),
 * which is the single source of truth an AI assistant can read and edit.
 */

import { Mesh } from './mesh.js';
import {
  min3, max3, transformPoint, multiplyM4, invertM4, identityM4, translationM4,
} from './math3.js';

const FORMAT = 'lakar-cad';
const FORMAT_VERSION = 2;
const MAX_UNDO = 100;

export class CadModel {
  constructor() {
    this._counter = 0;
    this.version = 0; // bumped on every change (drives UI re-render)
    this.idgen = (prefix = 'x') => `${prefix}${++this._counter}`;
    this.definitions = new Map();
    this.rootId = this._createDefinition('Model', false, 'root').id;
    this.activeContext = []; // instance-id path from root ([] = editing the model root)
    this._undo = [];
    this._redo = [];
  }

  // ── definitions & contexts ─────────────────────────────────────────────────

  _createDefinition(name, isComponent, forcedId = null) {
    const def = {
      id: forcedId || this.idgen('d'),
      name,
      isComponent,
      mesh: new Mesh(this.idgen),
      children: [],
    };
    this.definitions.set(def.id, def);
    return def;
  }

  root() { return this.definitions.get(this.rootId); }

  /** Definition currently being edited (root, or the open group/component). */
  activeDefinition() {
    let def = this.root();
    for (const instId of this.activeContext) {
      const inst = def.children.find((c) => c.id === instId);
      if (!inst) return this.root();
      def = this.definitions.get(inst.definitionId);
    }
    return def;
  }

  activeMesh() { return this.activeDefinition().mesh; }

  /** World matrix of the active editing context. */
  activeMatrix() {
    let m = identityM4();
    let def = this.root();
    for (const instId of this.activeContext) {
      const inst = def.children.find((c) => c.id === instId);
      if (!inst) return m;
      m = multiplyM4(m, inst.transform);
      def = this.definitions.get(inst.definitionId);
    }
    return m;
  }

  activeMatrixInverse() { return invertM4(this.activeMatrix()); }

  findInstance(instanceId, def = this.root()) {
    for (const inst of def.children) {
      if (inst.id === instanceId) return { instance: inst, parent: def };
      const sub = this.findInstance(instanceId, this.definitions.get(inst.definitionId));
      if (sub) return sub;
    }
    return null;
  }

  instanceCountFor(defId) {
    let count = 0;
    for (const def of this.definitions.values()) {
      for (const inst of def.children) if (inst.definitionId === defId) count++;
    }
    return count;
  }

  /**
   * Open a group/component for editing (must be a child of the current
   * context). Groups shared by several instances are made unique first, so
   * editing a group never changes its copies — while components stay shared.
   */
  enterContext(instanceId) {
    const def = this.activeDefinition();
    const inst = def.children.find((c) => c.id === instanceId);
    if (!inst) return false;
    if (inst.type === 'group' && this.instanceCountFor(inst.definitionId) > 1) {
      this._makeUnique(inst);
    }
    this.activeContext.push(instanceId);
    this.touch();
    return true;
  }

  exitContext() {
    if (this.activeContext.length === 0) return false;
    this.activeContext.pop();
    this.touch();
    return true;
  }

  _makeUnique(inst) {
    const src = this.definitions.get(inst.definitionId);
    const copy = this._createDefinition(src.name, src.isComponent);
    copy.mesh = Mesh.fromJSON(remapIds(src.mesh.toJSON(), this.idgen), this.idgen);
    copy.children = src.children.map((c) => ({
      ...c, id: this.idgen('i'), transform: [...c.transform],
    }));
    inst.definitionId = copy.id;
  }

  // ── group / component creation ─────────────────────────────────────────────

  /**
   * Move the given entity ids (faces/edges/vertices of the ACTIVE context's
   * mesh) into a new group or component. Returns the new instance.
   */
  makeInstanceFromEntities(entityIds, { name, isComponent = false } = {}) {
    const srcMesh = this.activeMesh();
    const picked = closeOverSelection(srcMesh, entityIds);
    if (picked.vertices.size === 0) return null;

    const def = this._createDefinition(
      name || (isComponent ? `Component ${this._counter}` : `Group ${this._counter}`),
      isComponent,
    );

    // copy geometry into the new definition (identity transform → same coords)
    const vmap = new Map();
    for (const vid of picked.vertices) {
      vmap.set(vid, def.mesh.addVertex(srcMesh.vertices.get(vid).p).id);
    }
    for (const eid of picked.edges) {
      const e = srcMesh.edges.get(eid);
      def.mesh.addEdge(vmap.get(e.a), vmap.get(e.b), { detectFaces: false });
    }
    for (const fid of picked.faces) {
      const f = srcMesh.faces.get(fid);
      def.mesh._createFace(f.loop.map((vid) => vmap.get(vid)), f.color);
    }

    // remove moved geometry from the source context
    for (const fid of picked.faces) srcMesh.eraseFaceOnly(fid);
    for (const eid of picked.edges) {
      if (srcMesh.edgeFaces(eid).size === 0) srcMesh.eraseEdge(eid);
    }
    for (const vid of picked.vertices) srcMesh._removeVertexIfOrphan(vid);

    const inst = {
      id: this.idgen('i'),
      name: def.name,
      type: isComponent ? 'component' : 'group',
      definitionId: def.id,
      transform: identityM4(),
    };
    this.activeDefinition().children.push(inst);
    return inst;
  }

  /** Place another instance of an existing definition (component copy). */
  insertInstance(definitionId, transform = identityM4(), name = null) {
    const def = this.definitions.get(definitionId);
    if (!def) return null;
    const inst = {
      id: this.idgen('i'),
      name: name || def.name,
      type: def.isComponent ? 'component' : 'group',
      definitionId,
      transform: [...transform],
    };
    this.activeDefinition().children.push(inst);
    return inst;
  }

  /** Dissolve an instance back into its parent context. */
  explodeInstance(instanceId) {
    const found = this.findInstance(instanceId);
    if (!found) return false;
    const { instance, parent } = found;
    const def = this.definitions.get(instance.definitionId);

    const vmap = new Map();
    for (const v of def.mesh.vertices.values()) {
      vmap.set(v.id, parent.mesh.addVertex(transformPoint(instance.transform, v.p)).id);
    }
    for (const e of def.mesh.edges.values()) {
      parent.mesh.addEdge(vmap.get(e.a), vmap.get(e.b), { detectFaces: false });
    }
    for (const f of def.mesh.faces.values()) {
      const loop = f.loop.map((vid) => vmap.get(vid));
      if (!parent.mesh._faceExistsForLoop(loop)) parent.mesh._createFace(loop, f.color);
    }
    for (const child of def.children) {
      parent.children.push({
        ...child,
        id: this.idgen('i'),
        transform: multiplyM4(instance.transform, child.transform),
      });
    }
    parent.children.splice(parent.children.indexOf(instance), 1);
    this._gcDefinitions();
    return true;
  }

  eraseInstance(instanceId) {
    const found = this.findInstance(instanceId);
    if (!found) return false;
    found.parent.children.splice(found.parent.children.indexOf(found.instance), 1);
    this._gcDefinitions();
    return true;
  }

  translateInstance(instanceId, delta) {
    const found = this.findInstance(instanceId);
    if (!found) return false;
    found.instance.transform = multiplyM4(translationM4(delta), found.instance.transform);
    return true;
  }

  /** Drop definitions that are unused and not components. */
  _gcDefinitions() {
    for (const def of [...this.definitions.values()]) {
      if (def.id === this.rootId || def.isComponent) continue;
      if (this.instanceCountFor(def.id) === 0) this.definitions.delete(def.id);
    }
  }

  // ── change tracking / undo ─────────────────────────────────────────────────

  touch() { this.version++; }

  /** Run a mutation with undo capture; rolls back if fn throws. */
  transact(fn) {
    const before = JSON.stringify(this.toJSON());
    try {
      const result = fn(this);
      this._undo.push(before);
      if (this._undo.length > MAX_UNDO) this._undo.shift();
      this._redo = [];
      this.touch();
      return result;
    } catch (err) {
      this._restore(JSON.parse(before));
      this.touch();
      throw err;
    }
  }

  undo() {
    if (this._undo.length === 0) return false;
    this._redo.push(JSON.stringify(this.toJSON()));
    this._restore(JSON.parse(this._undo.pop()));
    this.touch();
    return true;
  }

  redo() {
    if (this._redo.length === 0) return false;
    this._undo.push(JSON.stringify(this.toJSON()));
    this._restore(JSON.parse(this._redo.pop()));
    this.touch();
    return true;
  }

  // ── serialization ─────────────────────────────────────────────────────────

  toJSON() {
    return {
      format: FORMAT,
      formatVersion: FORMAT_VERSION,
      units: 'meters',
      counter: this._counter,
      rootId: this.rootId,
      definitions: [...this.definitions.values()].map((def) => ({
        id: def.id,
        name: def.name,
        isComponent: def.isComponent,
        mesh: def.mesh.toJSON(),
        children: def.children.map((c) => ({
          id: c.id, name: c.name, type: c.type,
          definitionId: c.definitionId, transform: c.transform,
        })),
      })),
    };
  }

  static fromJSON(data) {
    if (!data || data.format !== FORMAT) throw new Error('Not a Lakar CAD model file.');
    const model = new CadModel();
    model._restore(data);
    return model;
  }

  _restore(data) {
    this._counter = data.counter || 0;
    this.definitions = new Map();
    this.rootId = data.rootId || 'root';
    for (const d of data.definitions || []) {
      this.definitions.set(d.id, {
        id: d.id,
        name: d.name,
        isComponent: !!d.isComponent,
        mesh: Mesh.fromJSON(d.mesh || {}, this.idgen),
        children: (d.children || []).map((c) => ({ ...c, transform: [...c.transform] })),
      });
    }
    if (!this.definitions.has(this.rootId)) {
      this._createDefinition('Model', false, this.rootId);
    }
    this.activeContext = [];
  }

  // ── world-space geometry (exporters, bounds) ───────────────────────────────

  /**
   * Flatten the whole model to world-space polygons.
   * Returns [{ points: [[x,y,z]...], color, defId, faceId, instancePath }].
   */
  collectWorldFaces() {
    const out = [];
    const walk = (def, matrix, path) => {
      for (const f of def.mesh.faces.values()) {
        out.push({
          points: f.loop.map((vid) => transformPoint(matrix, def.mesh.vertices.get(vid).p)),
          color: f.color,
          defId: def.id,
          faceId: f.id,
          instancePath: path,
        });
      }
      for (const inst of def.children) {
        walk(this.definitions.get(inst.definitionId), multiplyM4(matrix, inst.transform), [...path, inst.id]);
      }
    };
    walk(this.root(), identityM4(), []);
    return out;
  }

  /** World-space edges, same walk as collectWorldFaces. */
  collectWorldEdges() {
    const out = [];
    const walk = (def, matrix, path) => {
      for (const e of def.mesh.edges.values()) {
        out.push({
          a: transformPoint(matrix, def.mesh.vertices.get(e.a).p),
          b: transformPoint(matrix, def.mesh.vertices.get(e.b).p),
          edgeId: e.id,
          instancePath: path,
        });
      }
      for (const inst of def.children) {
        walk(this.definitions.get(inst.definitionId), multiplyM4(matrix, inst.transform), [...path, inst.id]);
      }
    };
    walk(this.root(), identityM4(), []);
    return out;
  }

  bounds() {
    let lo = null, hi = null;
    for (const f of this.collectWorldFaces()) {
      for (const p of f.points) {
        lo = lo ? min3(lo, p) : [...p];
        hi = hi ? max3(hi, p) : [...p];
      }
    }
    for (const e of this.collectWorldEdges()) {
      for (const p of [e.a, e.b]) {
        lo = lo ? min3(lo, p) : [...p];
        hi = hi ? max3(hi, p) : [...p];
      }
    }
    return lo ? { min: lo, max: hi } : null;
  }

  // ── AI-introspectable summary ──────────────────────────────────────────────

  /**
   * Compact structured description of the model for an AI assistant.
   * Entity ids here are the same ids used by every engine operation, so an
   * AI layer can act on what it reads.
   */
  describeForAI() {
    const summarizeDef = (def) => ({
      id: def.id,
      name: def.name,
      kind: def.id === this.rootId ? 'root' : (def.isComponent ? 'component' : 'group'),
      counts: {
        vertices: def.mesh.vertices.size,
        edges: def.mesh.edges.size,
        faces: def.mesh.faces.size,
      },
      faces: [...def.mesh.faces.values()].map((f) => ({
        id: f.id,
        normal: f.normal.map(round3),
        loop: f.loop.map((vid) => def.mesh.vertices.get(vid).p.map(round3)),
      })),
      instances: def.children.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        definitionId: c.definitionId,
        position: [c.transform[12], c.transform[13], c.transform[14]].map(round3),
      })),
    });
    return {
      format: FORMAT,
      units: 'meters',
      upAxis: 'Y',
      bounds: this.bounds(),
      activeContext: this.activeContext,
      definitions: [...this.definitions.values()].map(summarizeDef),
    };
  }
}

// ── selection closure ─────────────────────────────────────────────────────────

/**
 * Expand a set of entity ids to a consistent {faces, edges, vertices} closure:
 * faces bring their boundary edges + vertices, edges bring their endpoints.
 */
export function closeOverSelection(mesh, entityIds) {
  const faces = new Set();
  const edges = new Set();
  const vertices = new Set();
  for (const id of entityIds) {
    if (mesh.faces.has(id)) faces.add(id);
    else if (mesh.edges.has(id)) edges.add(id);
    else if (mesh.vertices.has(id)) vertices.add(id);
  }
  for (const fid of faces) {
    for (const eid of mesh.faceEdgeIds(fid)) edges.add(eid);
    for (const vid of mesh.faces.get(fid).loop) vertices.add(vid);
  }
  for (const eid of edges) {
    const e = mesh.edges.get(eid);
    vertices.add(e.a);
    vertices.add(e.b);
  }
  return { faces, edges, vertices };
}

// ── helpers ──────────────────────────────────────────────────────────────────

const round3 = (x) => Math.round(x * 1000) / 1000;

/** Deep-copy mesh JSON with fresh ids (for make-unique). */
function remapIds(meshJson, idgen) {
  const map = new Map();
  const m = (id, prefix) => {
    if (!map.has(id)) map.set(id, idgen(prefix));
    return map.get(id);
  };
  return {
    vertices: meshJson.vertices.map((v) => ({ ...v, id: m(v.id, 'v') })),
    edges: meshJson.edges.map((e) => ({ id: m(e.id, 'e'), a: m(e.a, 'v'), b: m(e.b, 'v') })),
    faces: meshJson.faces.map((f) => ({ ...f, id: m(f.id, 'f'), loop: f.loop.map((vid) => m(vid, 'v')) })),
  };
}
