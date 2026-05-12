import { describe, test, expect } from 'vitest';
import { validateBuilding } from '../../lib/validation';
import type { Building } from '../../types/building';

const makeBuilding = (): Building => ({
  id: 'b1',
  name: 'Test',
  floors: [{
    level: 1, name: 'F1',
    nodes: [
      { id: 'a', type: 'room', label: 'A', x: 0, y: 0 },
      { id: 'b', type: 'room', label: 'B', x: 10, y: 0 },
    ],
    edges: [{ from: 'a', to: 'b', type: 'walk', weight: 10 }],
  }],
  crossFloorEdges: [],
});

describe('validateBuilding', () => {
  test('valid building returns no errors', () => {
    expect(validateBuilding(makeBuilding())).toHaveLength(0);
  });

  test('missing id returns error', () => {
    const errors = validateBuilding({ ...makeBuilding(), id: '' });
    expect(errors.some(e => e.message.includes('ID'))).toBe(true);
  });

  test('no floors returns error', () => {
    const errors = validateBuilding({ ...makeBuilding(), floors: [] });
    expect(errors.some(e => e.message.includes('этаж'))).toBe(true);
  });

  test('isolated node returns error with node label', () => {
    const b = makeBuilding();
    b.floors[0].nodes.push({ id: 'c', type: 'room', label: 'Isolated', x: 20, y: 0 });
    const errors = validateBuilding(b);
    expect(errors.some(e => e.message.includes('Isolated'))).toBe(true);
  });

  test('duplicate node ID returns error', () => {
    const b = makeBuilding();
    b.floors[0].nodes.push({ id: 'a', type: 'room', label: 'Dup', x: 5, y: 5 });
    const errors = validateBuilding(b);
    expect(errors.some(e => e.message.includes('a'))).toBe(true);
  });

  test('connected via cross_floor_edge is not isolated', () => {
    const b = makeBuilding();
    b.floors[0].nodes.push({ id: 'stairs-f1', type: 'stairs', label: 'Stairs', x: 30, y: 0 });
    b.crossFloorEdges.push({ from: 'stairs-f1', to: 'stairs-f2', type: 'stairs', weight: 5 });
    const errors = validateBuilding(b);
    expect(errors.every(e => !e.message.includes('Stairs'))).toBe(true);
  });
});
