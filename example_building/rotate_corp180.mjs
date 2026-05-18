// example_building/rotate_corp180.mjs
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const inPath = join(__dir, 'building-corp-processed.json');
const data = JSON.parse(readFileSync(inPath, 'utf8'));

let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
for (const floor of data.floors) {
  for (const node of floor.nodes) {
    if (node.x < minX) minX = node.x;
    if (node.y < minY) minY = node.y;
    if (node.x > maxX) maxX = node.x;
    if (node.y > maxY) maxY = node.y;
  }
  for (const contour of (floor.contours ?? [])) {
    for (const [x, y] of contour) {
      if (x < minX) minX = x; if (y < minY) minY = y;
      if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    }
  }
  for (const area of (floor.areas ?? [])) {
    for (const [x, y] of area.points) {
      if (x < minX) minX = x; if (y < minY) minY = y;
      if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    }
  }
}

console.log(`Bbox: x=[${minX},${maxX}] y=[${minY},${maxY}]`);

const rot = ([x, y]) => [+(minX + maxX - x).toFixed(1), +(minY + maxY - y).toFixed(1)];

for (const floor of data.floors) {
  for (const node of floor.nodes) { [node.x, node.y] = rot([node.x, node.y]); }
  if (floor.contours) floor.contours = floor.contours.map(c => c.map(rot));
  if (floor.areas) floor.areas = floor.areas.map(a => ({ ...a, points: a.points.map(rot) }));
}

writeFileSync(inPath, JSON.stringify(data, null, 2), 'utf8');
console.log('Saved:', inPath);
