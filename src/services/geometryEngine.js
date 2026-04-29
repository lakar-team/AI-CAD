import * as THREE from 'three';

/**
 * Advanced Geometry Engine supporting the "Core Six" CAD operations.
 */

export const GEOMETRY_TOOLS = {
  BOX: 'create_box',
  SPHERE: 'create_sphere',
  GEAR: 'create_gear',
  EXTRUDE: 'sketch_extrude',
  BOOLEAN: 'apply_boolean',
  PATTERN: 'create_pattern',
};

export function getGeometryFromTool(toolCall, existingObjects = []) {
  const { tool, params } = toolCall;

  switch (tool) {
    case GEOMETRY_TOOLS.BOX:
      return { type: 'box', size: params.size, color: params.color, position: params.position };
    
    case GEOMETRY_TOOLS.SPHERE:
      return { type: 'sphere', size: params.radius, color: params.color, position: params.position };

    case GEOMETRY_TOOLS.GEAR:
      return generateGear(params);

    case GEOMETRY_TOOLS.EXTRUDE:
      return generateExtrusion(params);

    case GEOMETRY_TOOLS.BOOLEAN:
      return handleBoolean(params, existingObjects);

    case GEOMETRY_TOOLS.PATTERN:
      return handlePattern(params, existingObjects);

    default:
      return null;
  }
}

// --- Core Six: Sketch & Extrude ---
function generateExtrusion({ shapeType = 'rect', dims = [1, 1], height = 0.5, color = '#ffffff', position = [0, 0, 0] }) {
  const shape = new THREE.Shape();
  if (shapeType === 'rect') {
    const [w, l] = dims;
    shape.moveTo(-w/2, -l/2);
    shape.lineTo(w/2, -l/2);
    shape.lineTo(w/2, l/2);
    shape.lineTo(-w/2, l/2);
    shape.lineTo(-w/2, -l/2);
  } else if (shapeType === 'circle') {
    shape.absarc(0, 0, dims[0] || 0.5, 0, Math.PI * 2, false);
  }

  return {
    type: 'custom',
    shape: shape,
    thickness: height,
    color: color,
    position: position,
    label: `Extruded ${shapeType}`
  };
}

// --- Core Six: Booleans ---
function handleBoolean({ targetId, operation = 'subtract', type = 'hole', dims = [0.2], position = [0, 0, 0] }, existingObjects) {
  const target = existingObjects.find(o => o.id === targetId);
  
  // In a real CSG engine, we'd modify the mesh. 
  // For this demo, we'll create a "cutter" object that the renderer handles.
  return {
    type: type === 'hole' ? 'custom' : 'box',
    shape: type === 'hole' ? new THREE.Shape().absarc(0, 0, dims[0], 0, Math.PI * 2) : null,
    size: type === 'hole' ? null : dims,
    thickness: target ? target.thickness * 1.2 : 0.5,
    color: '#ff0000', // Red for "cutter" preview
    position: position,
    operation: 'subtract',
    parentId: targetId,
    label: `Hole in ${targetId}`
  };
}

// --- Core Six: Patterns ---
function handlePattern({ sourceId, type = 'linear', count = 2, spacing = 1 }, existingObjects) {
  const source = existingObjects.find(o => o.id === sourceId);
  if (!source) return null;

  // We return a list of clones with offsets
  const patternObjects = [];
  for (let i = 1; i < count; i++) {
    const offset = i * spacing;
    patternObjects.push({
      ...source,
      id: `${sourceId}_pat_${i}`,
      position: [source.position[0] + (type === 'linear' ? offset : 0), source.position[1], source.position[2]],
      label: `Pattern Clone ${i}`
    });
  }
  
  return {
    type: 'pattern_group',
    clones: patternObjects,
    label: `Pattern of ${sourceId}`
  };
}

// --- Helper: Gear ---
function generateGear({ teeth = 12, module = 0.2, thickness = 0.1, color = '#ffffff', position = [0, 0, 0] }) {
  const r_pitch = (teeth * module) / 2;
  const r_add = r_pitch + module;
  const r_ded = r_pitch - 1.25 * module;

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

  return { type: 'custom', shape, thickness, color, position, label: `${teeth}T Gear` };
}
