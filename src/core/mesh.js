/**
 * mesh.js — the topological core ("geometry context") of the CAD engine.
 *
 * A Mesh is a graph of vertices, edges and faces with full adjacency
 * (vertex→edges, edge→faces), equivalent in power to a half-edge structure
 * but stored as plain JSON-able records so the whole model is introspectable.
 *
 * Invariants maintained by every operation:
 *  - vertices are welded: no two vertices closer than WELD_TOL
 *  - edges are unique per vertex pair and never zero-length
 *  - faces are planar, simple (no repeated vertices) loops of >= 3 vertices,
 *    and every consecutive loop pair is backed by a real edge
 *  - deleting an edge deletes its bordering faces; orphaned vertices are removed
 *
 * SketchUp-style behaviors implemented here:
 *  - addEdge() auto-creates faces when a closed planar loop forms (line → face)
 *  - addEdge() splits an existing face when the new edge is a chord of it
 *  - splitEdge() splits an edge (and patches face loops) at a point on it
 */

import {
  EPS, WELD_TOL, PLANE_TOL,
  add, sub, scale, dot, cross, length, distance, distanceSq, normalize, clone, midpoint,
  newellNormal, planeFromPoints, planeFromNormalPoint, distToPlane, pointsArePlanar,
  planeBasis, projectTo2D, signedArea2D, pointInPolygon2D,
} from './math3.js';

const DEFAULT_FACE_COLOR = '#d9d9cc';

export class Mesh {
  /**
   * @param {() => string} idgen — generates unique entity ids (shared per model
   *        so ids are unique across all geometry contexts).
   */
  constructor(idgen) {
    this._idgen = idgen || defaultIdGen();
    this.vertices = new Map(); // id -> { id, p: [x,y,z] }
    this.edges = new Map();    // id -> { id, a, b }  (a, b: vertex ids)
    this.faces = new Map();    // id -> { id, loop: [vid...], normal: [x,y,z], color }
    this._vEdges = new Map();  // vid -> Set(eid)
    this._eFaces = new Map();  // eid -> Set(fid)
    this._edgeByPair = new Map(); // "minId|maxId" -> eid
  }

  // ── lookups ────────────────────────────────────────────────────────────────

  getEntity(id) {
    if (this.vertices.has(id)) return { kind: 'vertex', entity: this.vertices.get(id) };
    if (this.edges.has(id)) return { kind: 'edge', entity: this.edges.get(id) };
    if (this.faces.has(id)) return { kind: 'face', entity: this.faces.get(id) };
    return null;
  }

  vertexEdges(vid) { return this._vEdges.get(vid) || new Set(); }
  edgeFaces(eid) { return this._eFaces.get(eid) || new Set(); }

  edgeBetween(va, vb) {
    return this._edgeByPair.get(pairKey(va, vb)) || null;
  }

  findVertexNear(p, tol = WELD_TOL) {
    let best = null;
    let bestD = tol * tol;
    for (const v of this.vertices.values()) {
      const d = distanceSq(v.p, p);
      if (d <= bestD) { bestD = d; best = v; }
    }
    return best;
  }

  facePoints(fid) {
    const f = this.faces.get(fid);
    if (!f) return [];
    return f.loop.map((vid) => this.vertices.get(vid).p);
  }

  facePlane(fid) {
    const pts = this.facePoints(fid);
    return pts.length >= 3 ? planeFromPoints(pts) : null;
  }

  faceCentroid(fid) {
    const pts = this.facePoints(fid);
    const c = pts.reduce((s, p) => add(s, p), [0, 0, 0]);
    return scale(c, 1 / Math.max(1, pts.length));
  }

  /** Edge ids around a face loop, in order. */
  faceEdgeIds(fid) {
    const f = this.faces.get(fid);
    if (!f) return [];
    const out = [];
    for (let i = 0; i < f.loop.length; i++) {
      const eid = this.edgeBetween(f.loop[i], f.loop[(i + 1) % f.loop.length]);
      if (eid) out.push(eid);
    }
    return out;
  }

  isEmpty() {
    return this.vertices.size === 0 && this.edges.size === 0 && this.faces.size === 0;
  }

  // ── vertices ───────────────────────────────────────────────────────────────

  /** Add (or weld to) a vertex at p. Returns the vertex record. */
  addVertex(p, weldTol = WELD_TOL) {
    const existing = this.findVertexNear(p, weldTol);
    if (existing) return existing;
    const v = { id: this._idgen('v'), p: clone(p) };
    this.vertices.set(v.id, v);
    this._vEdges.set(v.id, new Set());
    return v;
  }

  /** Move vertices by id → new position. Face normals are recomputed. */
  moveVertices(moves) {
    const touchedFaces = new Set();
    for (const [vid, p] of moves) {
      const v = this.vertices.get(vid);
      if (!v) continue;
      v.p = clone(p);
      for (const eid of this.vertexEdges(vid)) {
        for (const fid of this.edgeFaces(eid)) touchedFaces.add(fid);
      }
    }
    for (const fid of touchedFaces) this._refreshFaceNormal(fid);
  }

  // ── edges ──────────────────────────────────────────────────────────────────

  /**
   * Add an edge between two existing vertices.
   * Detects chord-splits of existing faces and auto-creates faces for newly
   * closed planar loops (the SketchUp "line to face" behavior).
   * Returns { edge, createdFaces: [faceId...], splitFace: faceId|null }.
   */
  addEdge(vaId, vbId, { detectFaces = true } = {}) {
    if (vaId === vbId) return { edge: null, createdFaces: [], splitFace: null };
    const existing = this.edgeBetween(vaId, vbId);
    if (existing) return { edge: this.edges.get(existing), createdFaces: [], splitFace: null };

    const va = this.vertices.get(vaId);
    const vb = this.vertices.get(vbId);
    if (!va || !vb) throw new Error(`addEdge: missing vertex ${!va ? vaId : vbId}`);
    if (distance(va.p, vb.p) < WELD_TOL) return { edge: null, createdFaces: [], splitFace: null };

    const e = { id: this._idgen('e'), a: vaId, b: vbId };
    this.edges.set(e.id, e);
    this._eFaces.set(e.id, new Set());
    this._vEdges.get(vaId).add(e.id);
    this._vEdges.get(vbId).add(e.id);
    this._edgeByPair.set(pairKey(vaId, vbId), e.id);

    let createdFaces = [];
    let splitFace = null;
    if (detectFaces) {
      splitFace = this._trySplitFaceWithChord(e);
      if (!splitFace) createdFaces = this._findNewFaces(e);
    }
    return { edge: e, createdFaces, splitFace };
  }

  /**
   * Convenience: draw a line between two arbitrary points (welding endpoints
   * to existing vertices). Returns the same shape as addEdge plus vertex ids.
   */
  drawLine(pa, pb) {
    const va = this.addVertex(pa);
    const vb = this.addVertex(pb);
    const res = this.addEdge(va.id, vb.id);
    return { ...res, va: va.id, vb: vb.id };
  }

  /**
   * Split an edge at a point on it. Patches the loops of bordering faces.
   * Returns the new middle vertex (or an existing endpoint if point is at an end).
   */
  splitEdge(eid, point) {
    const e = this.edges.get(eid);
    if (!e) return null;
    const va = this.vertices.get(e.a);
    const vb = this.vertices.get(e.b);
    if (distance(point, va.p) < WELD_TOL) return va;
    if (distance(point, vb.p) < WELD_TOL) return vb;

    const faces = [...this.edgeFaces(eid)];
    this._removeEdgeRecord(eid); // detach (faces keep their loops; we patch below)

    const vm = this.addVertex(point);
    this.addEdge(e.a, vm.id, { detectFaces: false });
    this.addEdge(vm.id, e.b, { detectFaces: false });

    for (const fid of faces) {
      const f = this.faces.get(fid);
      if (!f) continue;
      const n = f.loop.length;
      for (let i = 0; i < n; i++) {
        const u = f.loop[i], w = f.loop[(i + 1) % n];
        if ((u === e.a && w === e.b) || (u === e.b && w === e.a)) {
          f.loop.splice(i + 1, 0, vm.id);
          break;
        }
      }
      this._reindexFaceEdges(fid);
    }
    return vm;
  }

  // ── erasing ────────────────────────────────────────────────────────────────

  /** Erase any entity by id (vertex / edge / face) with proper cascade. */
  erase(id) {
    if (this.faces.has(id)) { this._removeFaceRecord(id); return true; }
    if (this.edges.has(id)) { this.eraseEdge(id); return true; }
    if (this.vertices.has(id)) { this.eraseVertex(id); return true; }
    return false;
  }

  /** Erase an edge: bordering faces die, orphaned vertices are cleaned up. */
  eraseEdge(eid) {
    const e = this.edges.get(eid);
    if (!e) return;
    for (const fid of [...this.edgeFaces(eid)]) this._removeFaceRecord(fid);
    this._removeEdgeRecord(eid);
    this._removeVertexIfOrphan(e.a);
    this._removeVertexIfOrphan(e.b);
  }

  eraseVertex(vid) {
    if (!this.vertices.has(vid)) return;
    for (const eid of [...this.vertexEdges(vid)]) this.eraseEdge(eid);
    this._removeVertexIfOrphan(vid);
  }

  /** Delete a face but keep its edges (SketchUp's "erase face"). */
  eraseFaceOnly(fid) { this._removeFaceRecord(fid); }

  // ── faces (internal construction) ─────────────────────────────────────────

  /** Create a face from an ordered vertex loop. Assumes edges already exist. */
  _createFace(loop, color = DEFAULT_FACE_COLOR) {
    const pts = loop.map((vid) => this.vertices.get(vid).p);
    const normal = normalize(newellNormal(pts));
    const f = { id: this._idgen('f'), loop: [...loop], normal, color };
    this.faces.set(f.id, f);
    this._reindexFaceEdges(f.id);
    return f;
  }

  _reindexFaceEdges(fid) {
    const f = this.faces.get(fid);
    // remove stale references
    for (const [eid, set] of this._eFaces) { void eid; set.delete(fid); }
    for (let i = 0; i < f.loop.length; i++) {
      const eid = this.edgeBetween(f.loop[i], f.loop[(i + 1) % f.loop.length]);
      if (eid) this._eFaces.get(eid).add(fid);
    }
  }

  _refreshFaceNormal(fid) {
    const f = this.faces.get(fid);
    if (!f) return;
    const pts = this.facePoints(fid);
    const n = newellNormal(pts);
    if (length(n) > EPS) f.normal = normalize(n);
  }

  _removeFaceRecord(fid) {
    if (!this.faces.has(fid)) return;
    this.faces.delete(fid);
    for (const set of this._eFaces.values()) set.delete(fid);
  }

  _removeEdgeRecord(eid) {
    const e = this.edges.get(eid);
    if (!e) return;
    this.edges.delete(eid);
    this._eFaces.delete(eid);
    this._vEdges.get(e.a)?.delete(eid);
    this._vEdges.get(e.b)?.delete(eid);
    this._edgeByPair.delete(pairKey(e.a, e.b));
  }

  _removeVertexIfOrphan(vid) {
    const edges = this._vEdges.get(vid);
    if (edges && edges.size === 0) {
      this.vertices.delete(vid);
      this._vEdges.delete(vid);
    }
  }

  // ── face auto-detection ────────────────────────────────────────────────────

  /**
   * If the new edge is a chord of an existing face (both endpoints on the
   * face's loop, lying in its plane, interior inside the face), split that
   * face into two. Returns the original face id if a split happened.
   */
  _trySplitFaceWithChord(edge) {
    for (const f of [...this.faces.values()]) {
      const ia = f.loop.indexOf(edge.a);
      const ib = f.loop.indexOf(edge.b);
      if (ia < 0 || ib < 0) continue;
      const n = f.loop.length;
      // adjacent in loop → it's a boundary edge, not a chord
      if ((ia + 1) % n === ib || (ib + 1) % n === ia) continue;

      const pts = this.facePoints(f.id);
      const plane = planeFromPoints(pts);
      if (!plane) continue;
      const pa = this.vertices.get(edge.a).p;
      const pb = this.vertices.get(edge.b).p;
      if (Math.abs(distToPlane(plane, pa)) > PLANE_TOL) continue;
      if (Math.abs(distToPlane(plane, pb)) > PLANE_TOL) continue;

      // chord midpoint must be inside the polygon
      const { u, v } = planeBasis(plane.normal);
      const origin = pts[0];
      const poly2 = pts.map((p) => projectTo2D(p, origin, u, v));
      const mid2 = projectTo2D(midpoint(pa, pb), origin, u, v);
      if (!pointInPolygon2D(mid2, poly2)) continue;

      // split the loop at ia / ib
      const loop1 = [];
      for (let i = ia; ; i = (i + 1) % n) { loop1.push(f.loop[i]); if (i === ib) break; }
      const loop2 = [];
      for (let i = ib; ; i = (i + 1) % n) { loop2.push(f.loop[i]); if (i === ia) break; }
      if (loop1.length < 3 || loop2.length < 3) continue;

      const color = f.color;
      this._removeFaceRecord(f.id);
      this._createFace(loop1, color);
      this._createFace(loop2, color);
      return f.id;
    }
    return null;
  }

  /**
   * Minimal-cycle face detection. After adding `edge`, look for closed planar
   * loops through it and create faces for them. Returns created face ids.
   */
  _findNewFaces(edge) {
    const created = [];
    const planes = this._candidatePlanes(edge);
    for (const plane of planes) {
      // sub-graph of geometry lying on this plane
      const inPlane = new Set();
      for (const v of this.vertices.values()) {
        if (Math.abs(distToPlane(plane, v.p)) <= PLANE_TOL) inPlane.add(v.id);
      }
      if (!inPlane.has(edge.a) || !inPlane.has(edge.b)) continue;

      const { u, v: vAxis } = planeBasis(plane.normal);
      const origin = this.vertices.get(edge.a).p;
      const pos2 = new Map();
      for (const vid of inPlane) {
        pos2.set(vid, projectTo2D(this.vertices.get(vid).p, origin, u, vAxis));
      }

      const adj = new Map(); // vid -> [neighbor vids] (within plane)
      for (const vid of inPlane) adj.set(vid, []);
      for (const e of this.edges.values()) {
        if (inPlane.has(e.a) && inPlane.has(e.b)) {
          adj.get(e.a).push(e.b);
          adj.get(e.b).push(e.a);
        }
      }

      for (const [from, to] of [[edge.a, edge.b], [edge.b, edge.a]]) {
        const cycle = traceFace(from, to, adj, pos2);
        if (!cycle) continue;
        if (this._faceExistsForLoop(cycle)) continue;
        const pts = cycle.map((vid) => this.vertices.get(vid).p);
        const facePlane = planeFromPoints(pts);
        if (!facePlane || !pointsArePlanar(pts, facePlane)) continue;
        const f = this._createFace(cycle);
        created.push(f.id);
      }
    }
    return created;
  }

  /** Candidate planes through the new edge, defined by its neighboring edges. */
  _candidatePlanes(edge) {
    const pa = this.vertices.get(edge.a).p;
    const pb = this.vertices.get(edge.b).p;
    const dir = sub(pb, pa);
    const planes = [];
    const seen = [];

    const consider = (otherPoint) => {
      const n = cross(dir, sub(otherPoint, pa));
      if (length(n) < 1e-9) return; // collinear
      const plane = planeFromNormalPoint(n, pa);
      // all candidate planes contain the edge line, so planes are equal
      // exactly when their normals are parallel
      for (const s of seen) {
        if (Math.abs(dot(s.normal, plane.normal)) > 1 - 1e-6) return;
      }
      seen.push(plane);
      planes.push(plane);
    };

    for (const vid of [edge.a, edge.b]) {
      for (const eid of this.vertexEdges(vid)) {
        const e = this.edges.get(eid);
        if (e.id === edge.id) continue;
        const other = e.a === vid ? e.b : e.a;
        consider(this.vertices.get(other).p);
      }
    }
    return planes;
  }

  _faceExistsForLoop(loop) {
    const set = new Set(loop);
    for (const f of this.faces.values()) {
      if (f.loop.length !== loop.length) continue;
      if (f.loop.every((vid) => set.has(vid))) return true;
    }
    return false;
  }

  // ── serialization ─────────────────────────────────────────────────────────

  toJSON() {
    return {
      vertices: [...this.vertices.values()].map((v) => ({ id: v.id, p: v.p })),
      edges: [...this.edges.values()].map((e) => ({ id: e.id, a: e.a, b: e.b })),
      faces: [...this.faces.values()].map((f) => ({
        id: f.id, loop: f.loop, normal: f.normal, color: f.color,
      })),
    };
  }

  static fromJSON(data, idgen) {
    const m = new Mesh(idgen);
    for (const v of data.vertices || []) {
      m.vertices.set(v.id, { id: v.id, p: clone(v.p) });
      m._vEdges.set(v.id, new Set());
    }
    for (const e of data.edges || []) {
      m.edges.set(e.id, { id: e.id, a: e.a, b: e.b });
      m._eFaces.set(e.id, new Set());
      m._vEdges.get(e.a)?.add(e.id);
      m._vEdges.get(e.b)?.add(e.id);
      m._edgeByPair.set(pairKey(e.a, e.b), e.id);
    }
    for (const f of data.faces || []) {
      m.faces.set(f.id, {
        id: f.id, loop: [...f.loop],
        normal: f.normal ? clone(f.normal) : [0, 1, 0],
        color: f.color || DEFAULT_FACE_COLOR,
      });
      m._reindexFaceEdges(f.id);
      if (!f.normal) m._refreshFaceNormal(f.id);
    }
    return m;
  }
}

// ── face tracing (planar minimal cycles) ─────────────────────────────────────

/**
 * Trace the planar face to the left of directed edge from→to using the
 * classic "next edge = counter-clockwise predecessor of the reversed edge"
 * rule. Returns the vertex cycle if it is a simple, positive-area loop
 * (i.e. a bounded interior region), else null.
 */
function traceFace(from, to, adj, pos2) {
  const start = `${from}>${to}`;
  const cycle = [from];
  let t = from;
  let h = to;
  const maxSteps = adj.size * 4 + 8;

  for (let step = 0; step < maxSteps; step++) {
    const hp = pos2.get(h);
    const tp = pos2.get(t);
    const rev = [tp[0] - hp[0], tp[1] - hp[1]]; // direction back where we came from
    const revAngle = Math.atan2(rev[1], rev[0]);

    let next = null;
    let bestCcw = -1;
    for (const n of adj.get(h) || []) {
      if (n === t) continue;
      const np = pos2.get(n);
      const ang = Math.atan2(np[1] - hp[1], np[0] - hp[0]);
      let ccw = ang - revAngle;          // CCW angle from reversed-incoming to candidate
      while (ccw <= 1e-12) ccw += Math.PI * 2;
      if (ccw > bestCcw) { bestCcw = ccw; next = n; }
    }
    if (next === null) next = t; // dead end: U-turn

    if (`${h}>${next}` === start) {
      // closed back onto the starting directed edge; h === from is already
      // at the front of the cycle — do not push it again
      if (cycle.length < 3 || new Set(cycle).size !== cycle.length) return null;
      const poly = cycle.map((vid) => pos2.get(vid));
      if (signedArea2D(poly) <= 1e-10) return null; // outer face or degenerate
      return cycle;
    }
    cycle.push(h);
    t = h;
    h = next;
  }
  return null;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function defaultIdGen() {
  let n = 0;
  return (prefix = 'x') => `${prefix}${++n}`;
}
