import { readFileSync, writeFileSync } from 'fs';

const strip = s => s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s;
const contourData = JSON.parse(strip(readFileSync('./example_building/_contour.json', 'utf8')));
const nodesData   = JSON.parse(strip(readFileSync('./example_building/_nodes.json',   'utf8')));

function contourBbox(contours) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const poly of contours)
    for (const [x, y] of poly) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  return { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY };
}

function nodeBbox(nodes) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const n of nodes) {
    if (n.x < minX) minX = n.x; if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y; if (n.y > maxY) maxY = n.y;
  }
  return { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY };
}

// Fit nodes inside contour bbox with uniform scale + centering
function transformNodes(nodes, cBbox, pad) {
  const nBbox = nodeBbox(nodes);
  const scale = Math.min((cBbox.w - 2 * pad) / nBbox.w, (cBbox.h - 2 * pad) / nBbox.h);
  const scaledW = nBbox.w * scale, scaledH = nBbox.h * scale;
  const offX = cBbox.minX + pad + (cBbox.w - 2 * pad - scaledW) / 2 - nBbox.minX * scale;
  const offY = cBbox.minY + pad + (cBbox.h - 2 * pad - scaledH) / 2 - nBbox.minY * scale;
  return nodes.map(n => ({
    ...n,
    x: Math.round((n.x * scale + offX) * 10) / 10,
    y: Math.round((n.y * scale + offY) * 10) / 10,
  }));
}

// Compute affine transform (a,b,c,d,e,f) from 3 source→destination point pairs.
// Result: x' = a*x + b*y + c,  y' = d*x + e*y + f
function computeAffine(srcPts, dstPts) {
  const [[x1,y1],[x2,y2],[x3,y3]] = srcPts;
  const [[X1,Y1],[X2,Y2],[X3,Y3]] = dstPts;
  const det = x1*(y2-y3) - y1*(x2-x3) + (x2*y3 - x3*y2);
  const a = (X1*(y2-y3) - y1*(X2-X3) + X2*y3 - X3*y2) / det;
  const b = (x1*(X2-X3) - X1*(x2-x3) + x2*X3 - x3*X2) / det;
  const c = (x1*(y2*X3-y3*X2) - y1*(x2*X3-x3*X2) + X1*(x2*y3-x3*y2)) / det;
  const d = (Y1*(y2-y3) - y1*(Y2-Y3) + Y2*y3 - Y3*y2) / det;
  const e = (x1*(Y2-Y3) - Y1*(x2-x3) + x2*Y3 - x3*Y2) / det;
  const f = (x1*(y2*Y3-y3*Y2) - y1*(x2*Y3-x3*Y2) + Y1*(x2*y3-x3*y2)) / det;
  return { a, b, c, d, e, f };
}

function applyAffine(nodes, aff) {
  return nodes.map(n => ({
    ...n,
    x: Math.round((aff.a * n.x + aff.b * n.y + aff.c) * 10) / 10,
    y: Math.round((aff.d * n.x + aff.e * n.y + aff.f) * 10) / 10,
  }));
}

// Straighten nearly-horizontal/vertical contour segments
function straightenContour(contours, threshold) {
  return contours.map(poly => {
    const pts = poly.map(([x, y]) => [x, y]);
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const dx = Math.abs(pts[i][0] - pts[j][0]);
      const dy = Math.abs(pts[i][1] - pts[j][1]);
      if (dx < threshold && dx < dy) {
        const mx = Math.round((pts[i][0] + pts[j][0]) / 2 * 10) / 10;
        pts[i][0] = mx; pts[j][0] = mx;
      } else if (dy < threshold && dy < dx) {
        const my = Math.round((pts[i][1] + pts[j][1]) / 2 * 10) / 10;
        pts[i][1] = my; pts[j][1] = my;
      }
    }
    return pts.filter((p, i) => i === 0 || p[0] !== pts[i-1][0] || p[1] !== pts[i-1][1]);
  });
}

// Straighten node paths: snap nearly-aligned connected node pairs
function straightenNodes(nodes, edges, snapDist) {
  const map = Object.fromEntries(nodes.map(n => [n.id, { ...n }]));
  for (const e of edges) {
    const a = map[e.from], b = map[e.to];
    if (!a || !b) continue;
    const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
    if (dx < snapDist && dx < dy) {
      const mx = Math.round((a.x + b.x) / 2 * 10) / 10;
      a.x = mx; b.x = mx;
    } else if (dy < snapDist && dy < dx) {
      const my = Math.round((a.y + b.y) / 2 * 10) / 10;
      a.y = my; b.y = my;
    }
  }
  return Object.values(map);
}

// ── Contour: scale 2× ────────────────────────────────────────────────────────
const rawContours = contourData.floors[0].contours.map(
  poly => poly.map(([x, y]) => [x * 2, y * 2])
);
const contours = straightenContour(rawContours, 60);
const cBbox = contourBbox(contours);
console.log(`Contour bbox (2×): x=[${cBbox.minX.toFixed(0)}, ${cBbox.maxX.toFixed(0)}] y=[${cBbox.minY.toFixed(0)}, ${cBbox.maxY.toFixed(0)}]`);

// ── Entrance correspondences ─────────────────────────────────────────────────
// Contour entrance markers (label "1","2","3"), already scaled 2×:
const contourEntrances = contourData.floors[0].nodes.filter(n => n.type === 'entrance');
const ce = Object.fromEntries(contourEntrances.map(n => [n.label, [n.x * 2, n.y * 2]]));
console.log(`Contour entrances (2×): 1=${JSON.stringify(ce['1'])} 2=${JSON.stringify(ce['2'])} 3=${JSON.stringify(ce['3'])}`);

// Floor-1 entrance nodes sorted by x (left→right)
const fl1 = nodesData.floors.find(f => f.level === 1);
const ent1 = fl1.nodes.filter(n => n.type === 'entrance').sort((a, b) => a.x - b.x);
const eLeft  = ent1[0];                                           // leftmost  → contour "1"
const eRight = ent1[ent1.length - 1];                            // rightmost → contour "3"
const eMain  = ent1.find(n => n.label === 'Главный вход') ?? ent1[1]; // main      → contour "2"

console.log(`Node entrances:`);
console.log(`  Left  (${eLeft.label}): (${eLeft.x.toFixed(0)}, ${eLeft.y.toFixed(0)}) → contour "1" ${JSON.stringify(ce['1'])}`);
console.log(`  Right (${eRight.label}): (${eRight.x.toFixed(0)}, ${eRight.y.toFixed(0)}) → contour "3" ${JSON.stringify(ce['3'])}`);
console.log(`  Main  (${eMain.label}): (${eMain.x.toFixed(0)}, ${eMain.y.toFixed(0)}) → contour "2" ${JSON.stringify(ce['2'])}`);

const srcPts = [[eLeft.x, eLeft.y], [eRight.x, eRight.y], [eMain.x, eMain.y]];
const dstPts = [ce['1'], ce['3'], ce['2']];
const aff = computeAffine(srcPts, dstPts);
console.log(`Affine: x'=${aff.a.toFixed(4)}x + ${aff.b.toFixed(4)}y + ${aff.c.toFixed(1)}`);
console.log(`        y'=${aff.d.toFixed(4)}x + ${aff.e.toFixed(4)}y + ${aff.f.toFixed(1)}`);

// ── Floor 1: affine transform from entrance anchors ──────────────────────────
let nodes1 = applyAffine(fl1.nodes, aff);
nodes1 = straightenNodes(nodes1, fl1.edges, 50);

// ── Floor 2: uniform scale to fit inside contour (no entrance refs) ──────────
const fl2 = nodesData.floors.find(f => f.level === 2);
let nodes2 = transformNodes(fl2.nodes, cBbox, 160);
nodes2 = straightenNodes(nodes2, fl2.edges, 50);

// Verify bboxes
const check1 = nodeBbox(nodes1), check2 = nodeBbox(nodes2);
console.log(`FL1 after: x=[${check1.minX.toFixed(0)}, ${check1.maxX.toFixed(0)}] y=[${check1.minY.toFixed(0)}, ${check1.maxY.toFixed(0)}]`);
console.log(`FL2 after: x=[${check2.minX.toFixed(0)}, ${check2.maxX.toFixed(0)}] y=[${check2.minY.toFixed(0)}, ${check2.maxY.toFixed(0)}]`);
console.log(`Contour:   x=[${cBbox.minX.toFixed(0)}, ${cBbox.maxX.toFixed(0)}] y=[${cBbox.minY.toFixed(0)}, ${cBbox.maxY.toFixed(0)}]`);

const merged = {
  id: 'gz-bmstu',
  name: 'ГЗ МГТУ',
  floors: [
    { level: 1, name: '1 этаж', nodes: nodes1, edges: fl1.edges, areas: [], contours },
    { level: 2, name: '2 этаж', nodes: nodes2, edges: fl2.edges, areas: [], contours },
  ],
  cross_floor_edges: nodesData.cross_floor_edges ?? [],
};

writeFileSync('./example_building/gz_bmstu.json', JSON.stringify(merged, null, 2));
console.log('Done!');
