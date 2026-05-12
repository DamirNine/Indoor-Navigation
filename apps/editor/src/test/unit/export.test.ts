import { describe, test, expect } from 'vitest';
import { buildingToJson } from '../../lib/export';
import { Building } from '../../types/building';

const building: Building = {
  id: 'test',
  name: 'Test Building',
  floors: [{
    level: 1,
    name: '1 этаж',
    image: 'floor1.png',
    imageFile: new File([], 'floor1.png'),
    imageDataUrl: 'data:image/png;base64,abc',
    nodes: [{ id: 'r1', type: 'room', label: 'Room 1', x: 100, y: 100 }],
    edges: [],
  }],
  crossFloorEdges: [{ from: 'a', to: 'b', type: 'stairs', weight: 5 }],
};

describe('buildingToJson', () => {
  test('produces correct top-level structure', () => {
    const json = JSON.parse(buildingToJson(building));
    expect(json.id).toBe('test');
    expect(json.name).toBe('Test Building');
    expect(json.floors).toHaveLength(1);
  });

  test('uses cross_floor_edges key (snake_case)', () => {
    const json = JSON.parse(buildingToJson(building));
    expect(json).toHaveProperty('cross_floor_edges');
    expect(json).not.toHaveProperty('crossFloorEdges');
  });

  test('excludes imageFile and imageDataUrl from output', () => {
    const json = JSON.parse(buildingToJson(building));
    expect(json.floors[0]).not.toHaveProperty('imageFile');
    expect(json.floors[0]).not.toHaveProperty('imageDataUrl');
  });

  test('includes image filename when set', () => {
    const json = JSON.parse(buildingToJson(building));
    expect(json.floors[0].image).toBe('floor1.png');
  });

  test('omits image key when not set', () => {
    const b: Building = { ...building, floors: [{ ...building.floors[0], image: undefined }] };
    const json = JSON.parse(buildingToJson(b));
    expect(json.floors[0]).not.toHaveProperty('image');
  });
});
