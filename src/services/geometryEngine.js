import * as THREE from 'three';

/**
 * Geometry Engine: Core Six CAD Operations.
 * Also handles serialization/deserialization for Save/Load.
 */

export const GEOMETRY_TOOLS = {
  BOX: 'create_box',
  SPHERE: 'create_sphere',
  CYLINDER: 'create_cylinder',
  CONE: 'create_cone',
  TORUS: 'create_torus',
  GEAR: 'create_gear',
  EXTRUDE: 'sketch_extrude',
  BOOLEAN: 'apply_boolean',
  PATTERN: 'create_pattern',
  DUPLICATE: 'duplicate_object',
  TRANSFORM: 'transform_object',
};

export function getGeometryFromTool(toolCall, existingObjects = []) {
  const { tool, params } = toolCall;

  switch (tool) {
    case GEOMETRY_TOOLS.BOX:
      return {
        type: 'box',
        size: params.size || [1, 1, 1],
        color: params.color || '#e5e7eb',
        position: params.position || [0, 0.5, 0],
        rotation: params.rotation || [0, 0, 0],
        label: `Box ${(params.size || [1,1,1]).map(s => s.toFixed ? s.toFixed(2) : s).join('x')}m`
      };

    case GEOMETRY_TOOLS.SPHERE:
      return {
        type: 'sphere',
        size: params.radius || 0.5,
        color: params.color || '#e5e7eb',
        position: params.position || [0, 0.5, 0],
        rotation: params.rotation || [0, 0, 0],
        label: `Sphere r=${params.radius || 0.5}m`
      };

    case GEOMETRY_TOOLS.CYLINDER:
      return {
        type: 'cylinder',
        size: [params.radiusTop || params.radius || 0.5, params.radiusBottom || params.radius || 0.5, params.height || 1],
        color: params.color || '#e5e7eb',
        position: params.position || [0, 0.5, 0],
        rotation: params.rotation || [0, 0, 0],
        label: `Cylinder h=${params.height || 1}m`
      };

    case GEOMETRY_TOOLS.CONE:
      return {
        type: 'cylinder',
        size: [0, params.radiusBottom || params.radius || 0.5, params.height || 1],
        color: params.color || '#e5e7eb',
        position: params.position || [0, 0.5, 0],
        rotation: params.rotation || [0, 0, 0],
        label: `Cone h=${params.height || 1}m`
      };

    case GEOMETRY_TOOLS.TORUS:
      return {
        type: 'torus',
        size: [params.radius || 1, params.tube || 0.4, 16, 100],
        color: params.color || '#e5e7eb',
        position: params.position || [0, 0.5, 0],
        rotation: params.rotation || [0, 0, 0],
        label: `Torus r=${params.radius || 1}m`
      };

    case GEOMETRY_TOOLS.GEAR:
      return generateGear(params);

    case GEOMETRY_TOOLS.EXTRUDE:
      return generateExtrusion(params);

    case GEOMETRY_TOOLS.BOOLEAN:
      return handleBoolean(params, existingObjects);

    case GEOMETRY_TOOLS.PATTERN:
      return handlePattern(params, existingObjects);

    case GEOMETRY_TOOLS.DUPLICATE:
      return handleDuplicate(params, existingObjects);

    case GEOMETRY_TOOLS.TRANSFORM:
      return handleTransform(params, existingObjects);

    default:
      return null;
  }
}

function handleDuplicate({ sourceId, position, rotation }, existingObjects) {
  const source = existingObjects.find(o => o.id === sourceId);
  if (!source) return null;
  return {
    ...source,
    id: undefined, // Will be assigned by App.jsx
    position: position || source.position,
    rotation: rotation || source.rotation || [0, 0, 0],
    label: `${source.label} (Copy)`
  };
}

function handleTransform({ targetId, position, rotation, scale }, existingObjects) {
  const target = existingObjects.find(o => o.id === targetId);
  if (!target) return null;
  return {
    ...target,
    isModification: true, // Flag for App.jsx to update instead of add
    position: position || target.position,
    rotation: rotation || target.rotation || [0, 0, 0],
    scale: scale || target.scale || [1, 1, 1]
  };
}

// --- Core Six: Sketch & Extrude ---
function generateExtrusion({ shapeType = 'rect', dims = [1, 1], height = 0.5, color = '#e5e7eb', position = [0, 0, 0], rotation = [0, 0, 0] }) {
  const shape = new THREE.Shape();
  if (shapeType === 'rect') {
    const [w, l] = dims;
    shape.moveTo(-w / 2, -l / 2);
    shape.lineTo(w / 2, -l / 2);
    shape.lineTo(w / 2, l / 2);
    shape.lineTo(-w / 2, l / 2);
    shape.lineTo(-w / 2, -l / 2);
  } else if (shapeType === 'circle') {
    const r = dims[0] || 0.5;
    shape.absarc(0, 0, r, 0, Math.PI * 2, false);
  } else if (shapeType === 'triangle') {
    const [w, l] = dims;
    shape.moveTo(-w / 2, -l / 2);
    shape.lineTo(w / 2, -l / 2);
    shape.lineTo(0, l / 2);
    shape.lineTo(-w / 2, -l / 2);
  }

  return {
    type: 'custom',
    shapeData: { shapeType, dims },
    shape: shape,
    thickness: height,
    color: color,
    position: position,
    rotation: rotation,
    label: `Extruded ${shapeType} ${dims.join('x')}m h=${height}m`
  };
}

// --- Core Six: Booleans ---
function handleBoolean({ targetId, operation = 'subtract', type = 'hole', dims = [0.2], position = [0, 0, 0] }, existingObjects) {
  const target = existingObjects.find(o => o.id === targetId);
  const radius = dims[0] || 0.1;

  const shape = new THREE.Shape();
  shape.absarc(0, 0, radius, 0, Math.PI * 2, false);

  let color = '#ef4444'; // Subtract
  if (operation === 'union') color = '#22c55e';
  if (operation === 'intersect') color = '#eab308';

  return {
    type: 'custom',
    shapeData: { shapeType: 'circle', dims: [radius] },
    shape: shape,
    thickness: target ? (target.thickness || 0.5) * 1.5 : 0.5,
    color: color,
    position: position,
    rotation: [0, 0, 0],
    operation: operation,
    parentId: targetId,
    label: `${operation.charAt(0).toUpperCase() + operation.slice(1)} r=${radius}m in ${targetId}`
  };
}

// --- Core Six: Patterns ---
function handlePattern({ sourceId, type = 'linear', count = 2, spacing = 1 }, existingObjects) {
  const source = existingObjects.find(o => o.id === sourceId);
  if (!source) return null;

  const clones = [];
  for (let i = 1; i < count; i++) {
    const offset = i * spacing;
    const newPos = [...source.position];
    if (type === 'linear') newPos[0] += offset;
    else if (type === 'circular') {
      const angle = (i / count) * Math.PI * 2;
      newPos[0] = source.position[0] + Math.cos(angle) * spacing;
      newPos[2] = source.position[2] + Math.sin(angle) * spacing;
    }

    clones.push({
      ...source,
      id: `${sourceId}_pat_${i}`,
      position: newPos,
      label: `${source.label || source.type} (clone ${i})`
    });
  }

  return {
    type: 'pattern_group',
    clones: clones,
    label: `Pattern of ${sourceId} (${count}x)`
  };
}

// --- Gear ---
function generateGear({ teeth = 12, module: mod = 0.2, thickness = 0.1, color = '#e5e7eb', position = [0, 0, 0], rotation = [0, 0, 0] }) {
  const r_pitch = (teeth * mod) / 2;
  const r_add = r_pitch + mod;
  const r_ded = r_pitch - 1.25 * mod;

  const shape = new THREE.Shape();
  const segments = teeth * 4;

  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const isTooth = i % 4 === 1 || i % 4 === 2;
    const r = isTooth ? r_add : r_ded;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }

  return {
    type: 'custom',
    shapeData: { shapeType: 'gear', teeth, module: mod },
    shape,
    thickness,
    color,
    position,
    rotation,
    label: `${teeth}T Gear (m=${mod})`
  };
}

// ==============================
// SERIALIZATION for Save / Load
// ==============================

/**
 * Converts scene objects into a JSON-safe format.
 * THREE.Shape cannot be JSON.stringify'd, so we store the parameters instead.
 */
export function serializeForSave(sceneObjects) {
  return sceneObjects.map(obj => {
    const serialized = { ...obj };
    // Remove the THREE.Shape (non-serializable), keep shapeData
    delete serialized.shape;
    return serialized;
  });
}

/**
 * Rebuilds THREE.Shape objects from saved shapeData parameters.
 */
export function deserializeFromSave(savedData) {
  return savedData.map(obj => {
    if (obj.type === 'custom' && obj.shapeData) {
      const { shapeType, dims, teeth, module: mod } = obj.shapeData;

      if (shapeType === 'rect') {
        const shape = new THREE.Shape();
        const [w, l] = dims;
        shape.moveTo(-w / 2, -l / 2);
        shape.lineTo(w / 2, -l / 2);
        shape.lineTo(w / 2, l / 2);
        shape.lineTo(-w / 2, l / 2);
        shape.lineTo(-w / 2, -l / 2);
        obj.shape = shape;
      } else if (shapeType === 'circle') {
        const shape = new THREE.Shape();
        shape.absarc(0, 0, dims[0] || 0.5, 0, Math.PI * 2, false);
        obj.shape = shape;
      } else if (shapeType === 'triangle') {
        const shape = new THREE.Shape();
        const [w, l] = dims;
        shape.moveTo(-w / 2, -l / 2);
        shape.lineTo(w / 2, -l / 2);
        shape.lineTo(0, l / 2);
        shape.lineTo(-w / 2, -l / 2);
        obj.shape = shape;
      } else if (shapeType === 'gear') {
        const r_pitch = (teeth * mod) / 2;
        const r_add = r_pitch + mod;
        const r_ded = r_pitch - 1.25 * mod;
        const shape = new THREE.Shape();
        const segments = teeth * 4;
        for (let i = 0; i <= segments; i++) {
          const angle = (i / segments) * Math.PI * 2;
          const isTooth = i % 4 === 1 || i % 4 === 2;
          const r = isTooth ? r_add : r_ded;
          const x = Math.cos(angle) * r;
          const y = Math.sin(angle) * r;
          if (i === 0) shape.moveTo(x, y);
          else shape.lineTo(x, y);
        }
        obj.shape = shape;
      }
    }
    return obj;
  });
}

/**
 * Calculates named geometric points (anchors) for an object.
 * Returns an array of { name, pos: [x,y,z] } in LOCAL space.
 */
export function getAnchorPoints(obj) {
  const anchors = [{ name: 'Center', pos: [0, 0, 0] }];

  if (obj.type === 'box') {
    const [w, h, d] = obj.size;
    const hw = w / 2, hh = h / 2, hd = d / 2;
    anchors.push({ name: 'Corner', pos: [-hw, -hh, -hd] }, { name: 'Corner', pos: [hw, -hh, -hd] }, { name: 'Corner', pos: [-hw, -hh, hd] }, { name: 'Corner', pos: [hw, -hh, hd] });
    anchors.push({ name: 'Corner', pos: [-hw, hh, -hd] }, { name: 'Corner', pos: [hw, hh, -hd] }, { name: 'Corner', pos: [-hw, hh, hd] }, { name: 'Corner', pos: [hw, hh, hd] });
    anchors.push({ name: 'Face', pos: [0, hh, 0] }, { name: 'Face', pos: [0, -hh, 0] }, { name: 'Face', pos: [0, 0, hd] }, { name: 'Face', pos: [0, 0, -hd] });
  } 
  else if (obj.type === 'cylinder' || obj.type === 'cone') {
    const [rTop, rBot, h] = obj.size;
    const hh = h / 2;
    anchors.push({ name: 'Cap', pos: [0, hh, 0] }, { name: 'Cap', pos: [0, -hh, 0] });
    anchors.push({ name: 'Rim', pos: [rTop, hh, 0] }, { name: 'Rim', pos: [-rTop, hh, 0] }, { name: 'Rim', pos: [0, hh, rTop] }, { name: 'Rim', pos: [0, hh, -rTop] });
    anchors.push({ name: 'Rim', pos: [rBot, -hh, 0] }, { name: 'Rim', pos: [-rBot, -hh, 0] }, { name: 'Rim', pos: [0, -hh, rBot] }, { name: 'Rim', pos: [0, -hh, -rBot] });
  }
  else if (obj.type === 'sphere') {
    const r = obj.size;
    anchors.push({ name: 'Pole', pos: [0, r, 0] }, { name: 'Pole', pos: [0, -r, 0] });
    anchors.push({ name: 'Equator', pos: [r, 0, 0] }, { name: 'Equator', pos: [-r, 0, 0] }, { name: 'Equator', pos: [0, 0, r] }, { name: 'Equator', pos: [0, 0, -r] });
  }
  else {
    // Fallback: Use a generic 1x1x1 bounding box for external/custom models
    // In a real app, we'd compute the actual bounding box from the mesh
    const hw = 0.5, hh = 0.5, hd = 0.5;
    anchors.push({ name: 'Corner', pos: [-hw, -hh, -hd] }, { name: 'Corner', pos: [hw, -hh, -hd] }, { name: 'Corner', pos: [-hw, -hh, hd] }, { name: 'Corner', pos: [hw, -hh, hd] });
    anchors.push({ name: 'Corner', pos: [-hw, hh, -hd] }, { name: 'Corner', pos: [hw, hh, -hd] }, { name: 'Corner', pos: [-hw, hh, hd] }, { name: 'Corner', pos: [hw, hh, hd] });
  }

  return anchors;
}
