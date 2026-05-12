import type { Building } from '../types/building';

export interface ValidationError { message: string; }

export function validateBuilding(building: Building): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!building.id.trim()) errors.push({ message: 'Укажите ID здания' });
  if (!building.name.trim()) errors.push({ message: 'Укажите название здания' });
  if (building.floors.length === 0) {
    errors.push({ message: 'Добавьте хотя бы один этаж' });
    return errors;
  }

  const allIds = new Map<string, string>();
  for (const floor of building.floors) {
    for (const node of floor.nodes) {
      if (allIds.has(node.id)) {
        errors.push({ message: `Дублирующийся ID узла: ${node.id}` });
      }
      allIds.set(node.id, floor.name);
    }
  }

  const allNodeIds = new Set(allIds.keys());
  for (const floor of building.floors) {
    for (const edge of floor.edges) {
      if (!allNodeIds.has(edge.from)) errors.push({ message: `Неизвестный узел: ${edge.from}` });
      if (!allNodeIds.has(edge.to)) errors.push({ message: `Неизвестный узел: ${edge.to}` });
    }
  }
  for (const edge of building.crossFloorEdges) {
    if (!allNodeIds.has(edge.from)) errors.push({ message: `Неизвестный узел в межэтажном ребре: ${edge.from}` });
    if (!allNodeIds.has(edge.to)) errors.push({ message: `Неизвестный узел в межэтажном ребре: ${edge.to}` });
  }

  const connectedIds = new Set<string>();
  for (const floor of building.floors) {
    for (const edge of floor.edges) {
      connectedIds.add(edge.from);
      connectedIds.add(edge.to);
    }
  }
  for (const edge of building.crossFloorEdges) {
    connectedIds.add(edge.from);
    connectedIds.add(edge.to);
  }
  for (const floor of building.floors) {
    for (const node of floor.nodes) {
      if (!connectedIds.has(node.id)) {
        errors.push({ message: `Изолированный узел: "${node.label}" (${floor.name})` });
      }
    }
  }

  return errors;
}
