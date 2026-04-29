import * as THREE from 'three';

/**
 * Geometry Engine to calculate complex shapes based on Tool parameters.
 */

export const GEOMETRY_TOOLS = {
  BOX: 'create_box',
  SPHERE: 'create_sphere',
  GEAR: 'create_gear',
  SLOT: 'create_slotted_plate',
};

export function getGeometryFromTool(toolCall) {
  const { tool, params } = toolCall;

  switch (tool) {
    case GEOMETRY_TOOLS.BOX:
      return { type: 'box', size: params.size, color: params.color, position: params.position };
    
    case GEOMETRY_TOOLS.SPHERE:
      return { type: 'sphere', size: params.radius, color: params.color, position: params.position };

    case GEOMETRY_TOOLS.GEAR:
      return generateGear(params);

    case GEOMETRY_TOOLS.SLOT:
      return generateSlottedPlate(params);

    default:
      return null;
  }
}

function generateGear({ teeth = 12, module = 1, thickness = 0.5, color = '#ffffff', position = [0, 0, 0] }) {
  const p = teeth * module; // Pitch diameter
  const r_pitch = p / 2;
  const r_addendum = r_pitch + module;
  const r_dedendum = r_pitch - 1.25 * module;

  const shape = new THREE.Shape();
  const segments = teeth * 4;

  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const isTooth = i % 4 === 1 || i % 4 === 2;
    const r = isTooth ? r_addendum : r_dedendum;
    
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }

  return {
    type: 'custom',
    shape: shape,
    thickness: thickness,
    color: color,
    position: position,
    label: `${teeth}T Gear`
  };
}

function generateSlottedPlate({ length = 2, width = 1, thickness = 0.2, slotWidth = 0.2, slotLength = 0.6, color = '#ffffff', position = [0, 0, 0] }) {
  const shape = new THREE.Shape();
  
  // Outer plate
  shape.moveTo(-length/2, -width/2);
  shape.lineTo(length/2, -width/2);
  shape.lineTo(length/2, width/2);
  shape.lineTo(-length/2, width/2);
  shape.lineTo(-length/2, -width/2);

  // Inner slot (hole)
  const slot = new THREE.Path();
  slot.moveTo(-slotLength/2, -slotWidth/2);
  slot.lineTo(slotLength/2, -slotWidth/2);
  slot.lineTo(slotLength/2, slotWidth/2);
  slot.lineTo(-slotLength/2, slotWidth/2);
  slot.lineTo(-slotLength/2, -slotWidth/2);
  
  shape.holes.push(slot);

  return {
    type: 'custom',
    shape: shape,
    thickness: thickness,
    color: color,
    position: position,
    label: `Slotted Plate`
  };
}
