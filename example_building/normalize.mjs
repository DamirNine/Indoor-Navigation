// example_building/normalize.mjs
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const inPath = join(__dir, '1_processed.json');
const data = JSON.parse(readFileSync(inPath, 'utf8'));

const floor2 = data.floors.find(f => f.level === 2);
if (!floor2) throw new Error('Floor 2 not found');

const nodeMap = Object.fromEntries(floor2.nodes.map(n => [n.id, n]));

function neighbors(id) {
  return floor2.edges
    .filter(e => e.from === id || e.to === id)
    .map(e => e.from === id ? e.to : e.from);
}

// ── PHASE A: corridor spacing ─────────────────────────────────────────────
// Collect corridor chain at y≈2210, x ≤ 1765 (from room 230 toward 228 and beyond)
const CHAIN_Y = 2210;
const CHAIN_START_X = 1765;
const startCorrId = 'corridor-mp5jilud'; // corridor of room 230

const chainSet = new Set([startCorrId]);
const bfsQueue = [startCorrId];
while (bfsQueue.length) {
  const cur = bfsQueue.shift();
  for (const nbId of neighbors(cur)) {
    const nb = nodeMap[nbId];
    if (!nb || nb.type !== 'corridor' || chainSet.has(nb.id)) continue;
    if (Math.abs(nb.y - CHAIN_Y) < 100 && nb.x <= CHAIN_START_X) {
      chainSet.add(nb.id);
      bfsQueue.push(nb.id);
    }
  }
}

const chain = [...chainSet].map(id => nodeMap[id]).sort((a, b) => b.x - a.x);
console.log(`Corridor chain: ${chain.length} nodes, x from ${chain[0].x} to ${chain.at(-1).x}`);

const xMax = chain[0].x;
const xMin = chain.at(-1).x;
const avgStep = (xMax - xMin) / (chain.length - 1);
console.log(`Avg corridor step: ${avgStep.toFixed(2)}`);

for (let i = 0; i < chain.length; i++) {
  const corr = chain[i];
  const newX = +(xMax - i * avgStep).toFixed(1);
  const dx = newX - corr.x;
  if (Math.abs(dx) < 0.05) continue;
  // Move directly connected rooms by same dx (they're above/below — same y axis)
  for (const nbId of neighbors(corr.id)) {
    const nb = nodeMap[nbId];
    if (nb && nb.type !== 'corridor') nb.x = +(nb.x + dx).toFixed(1);
  }
  corr.x = newX;
}

// ── PHASE B: room-to-corridor distance normalization ──────────────────────
const pairs = [];
for (const node of floor2.nodes) {
  if (node.type !== 'room') continue;
  const corrNeighbors = neighbors(node.id)
    .map(id => nodeMap[id])
    .filter(n => n && n.type === 'corridor');
  if (corrNeighbors.length === 0) continue;
  const corr = corrNeighbors.reduce((best, c) =>
    Math.hypot(node.x - c.x, node.y - c.y) < Math.hypot(node.x - best.x, node.y - best.y) ? c : best
  );
  const dist = Math.hypot(node.x - corr.x, node.y - corr.y);
  pairs.push({ node, corr, dist });
}

const meanDist = pairs.reduce((s, p) => s + p.dist, 0) / pairs.length;
console.log(`Room-to-corridor mean dist: ${meanDist.toFixed(2)} (${pairs.length} rooms)`);

for (const { node, corr } of pairs) {
  const dx = node.x - corr.x;
  const dy = node.y - corr.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    node.x = +(corr.x + Math.sign(dx) * meanDist).toFixed(1);
  } else {
    node.y = +(corr.y + Math.sign(dy) * meanDist).toFixed(1);
  }
}

writeFileSync(inPath, JSON.stringify(data, null, 2), 'utf8');
console.log('Saved:', inPath);
