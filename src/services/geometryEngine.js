import * as THREE from 'three';
import { v4 as uuidv4 } from 'uuid';

/**
 * Lakar CAD Geometry Engine V2 (Manifold Edition)
 * Focuses on Edges and Faces with Sticky Geometry.
 */

export class ManifoldModel {
  constructor() {
    this.vertices = new Map(); // id -> THREE.Vector3
    this.edges = new Map();    // id -> { v1: id, v2: id }
    this.faces = new Map();    // id -> { edges: [id], color: string }
    this.groups = new Map();   // id -> { name: string, children: [id], parentId: null }
    this.rootId = 'root';
    this.groups.set(this.rootId, { name: 'Scene', children: [], parentId: null });
  }

  // --- Vertex Operations ---
  addVertex(x, y, z) {
    const id = uuidv4();
    this.vertices.set(id, new THREE.Vector3(x, y, z));
    return id;
  }

  // --- Edge Operations ---
  addEdge(v1, v2) {
    // Check if edge already exists
    for (const [id, edge] of this.edges) {
      if ((edge.v1 === v1 && edge.v2 === v2) || (edge.v1 === v2 && edge.v2 === v1)) {
        return id;
      }
    }
    const id = uuidv4();
    this.edges.set(id, { v1, v2 });
    this.groups.get(this.rootId).children.push(id);
    return id;
  }

  // --- Move Operation (Sticky) ---
  moveVertex(id, delta) {
    const v = this.vertices.get(id);
    if (v) v.add(delta);
  }

  // --- Inference Engine Helper ---
  getSnapPoints() {
    const points = [];
    // Endpoints
    for (const [id, v] of this.vertices) {
      points.push({ type: 'endpoint', pos: v.clone(), id });
    }
    // Midpoints
    for (const [id, edge] of this.edges) {
      const v1 = this.vertices.get(edge.v1);
      const v2 = this.vertices.get(edge.v2);
      if (v1 && v2) {
        points.push({ 
          type: 'midpoint', 
          pos: new THREE.Vector3().addVectors(v1, v2).multiplyScalar(0.5),
          edgeId: id 
        });
      }
    }
    return points;
  }

  // --- Serialization ---
  serialize() {
    return {
      vertices: Array.from(this.vertices.entries()),
      edges: Array.from(this.edges.entries()),
      faces: Array.from(this.faces.entries())
    };
  }
}

/**
 * Inference Engine: Calculates axis snapping and point snapping.
 */
export function getInference(point, model, threshold = 0.2) {
  const snaps = model.getSnapPoints();
  let best = { point: point.clone(), type: 'none' };
  let minDist = threshold;

  // 1. Point Snapping
  for (const snap of snaps) {
    const d = point.distanceTo(snap.pos);
    if (d < minDist) {
      minDist = d;
      best = { point: snap.pos.clone(), type: snap.type, id: snap.id || snap.edgeId };
    }
  }

  // 2. Axis Snapping (if no point snap)
  if (best.type === 'none') {
    // Implement axis snapping logic here relative to a "startPoint" if available
  }

  return best;
}
