import type { Building } from '../types/building';

export function findRoute(building: Building, fromId: string, toId: string): string[] | null {
  if (fromId === toId) return [fromId];

  const adj = new Map<string, { to: string; weight: number }[]>();

  const addEdge = (a: string, b: string, w: number) => {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a)!.push({ to: b, weight: w });
    adj.get(b)!.push({ to: a, weight: w });
  };

  for (const floor of building.floors) {
    for (const edge of floor.edges) addEdge(edge.from, edge.to, edge.weight);
  }
  for (const edge of building.crossFloorEdges) addEdge(edge.from, edge.to, edge.weight);

  const dist = new Map<string, number>();
  const prev = new Map<string, string>();

  for (const floor of building.floors)
    for (const node of floor.nodes)
      dist.set(node.id, Infinity);

  dist.set(fromId, 0);
  const visited = new Set<string>();

  while (true) {
    let u: string | null = null;
    let best = Infinity;
    for (const [id, d] of dist) {
      if (!visited.has(id) && d < best) { best = d; u = id; }
    }
    if (u === null || u === toId) break;
    visited.add(u);
    for (const e of adj.get(u) ?? []) {
      const alt = best + e.weight;
      if (alt < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, alt);
        prev.set(e.to, u);
      }
    }
  }

  if ((dist.get(toId) ?? Infinity) === Infinity) return null;

  const path: string[] = [];
  let cur: string | undefined = toId;
  while (cur !== undefined) {
    path.unshift(cur);
    cur = prev.get(cur);
  }
  return path;
}
