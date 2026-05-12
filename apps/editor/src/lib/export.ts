import JSZip from 'jszip';
import type { Building } from '../types/building';

export function buildingToJson(building: Building): string {
  const output = {
    id: building.id,
    name: building.name,
    floors: building.floors.map(floor => {
      const f: Record<string, unknown> = {
        level: floor.level,
        name: floor.name,
        nodes: floor.nodes,
        edges: floor.edges,
        areas: floor.areas,
      };
      if (floor.image) f['image'] = floor.image;
      return f;
    }),
    cross_floor_edges: building.crossFloorEdges,
  };
  return JSON.stringify(output, null, 2);
}

export async function exportZip(building: Building): Promise<Blob> {
  const zip = new JSZip();
  zip.file('building.json', buildingToJson(building));
  for (const floor of building.floors) {
    if (floor.imageFile && floor.image) {
      zip.file(floor.image, floor.imageFile);
    }
  }
  return zip.generateAsync({ type: 'blob' });
}
