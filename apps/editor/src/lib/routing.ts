import type { Building, EdgeType } from '../types/building';

export interface RouteInstruction {
  description: string;
  edgeType: EdgeType;
  floorName: string;
  toNodeId: string;
}

export function buildRouteInstructions(building: Building, path: string[]): RouteInstruction[] {
  if (path.length < 2) return [];

  // Node map with floor info
  type RichNode = { id: string; type: string; label: string; x: number; y: number; floorName: string };
  const nodeMap = new Map<string, RichNode>();
  for (const floor of building.floors)
    for (const node of floor.nodes)
      nodeMap.set(node.id, { ...node, floorName: floor.name });

  // Edge type map
  const edgeTypeMap = new Map<string, EdgeType>();
  const addET = (a: string, b: string, t: EdgeType) => {
    edgeTypeMap.set(`${a}→${b}`, t);
    edgeTypeMap.set(`${b}→${a}`, t);
  };
  for (const floor of building.floors)
    for (const e of floor.edges) addET(e.from, e.to, e.type);
  for (const e of building.crossFloorEdges) addET(e.from, e.to, e.type);

  // Adjacency for BFS
  const adj = new Map<string, string[]>();
  const addAdj = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a)!.push(b);
    adj.get(b)!.push(a);
  };
  for (const floor of building.floors)
    for (const e of floor.edges) addAdj(e.from, e.to);
  for (const e of building.crossFloorEdges) addAdj(e.from, e.to);

  const destId = path[path.length - 1];
  const destNode = nodeMap.get(destId);

  // BFS to nearest named (room/entrance) node
  const nearestNamed = (startId: string): string => {
    const start = nodeMap.get(startId);
    if (!start || start.type === 'room' || start.type === 'entrance') return startId;
    const visited = new Set([startId]);
    let frontier = [startId];
    const candidates: string[] = [];
    while (frontier.length > 0 && candidates.length === 0) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const nbId of adj.get(id) ?? []) {
          if (visited.has(nbId)) continue;
          visited.add(nbId);
          const nb = nodeMap.get(nbId);
          if (nb && (nb.type === 'room' || nb.type === 'entrance')) candidates.push(nbId);
          else next.push(nbId);
        }
      }
      frontier = next;
    }
    if (candidates.length === 0) return startId;
    if (!destNode || candidates.length === 1) return candidates[0];
    return candidates.reduce((best, id) => {
      const n = nodeMap.get(id)!;
      const b = nodeMap.get(best)!;
      const dn = (n.x - destNode.x) ** 2 + (n.y - destNode.y) ** 2;
      const db = (b.x - destNode.x) ** 2 + (b.y - destNode.y) ** 2;
      return dn < db ? id : best;
    });
  };

  // Corridors adjacent to route start/end (skip them in walk steps)
  const skipIds = new Set<string>();
  for (const nbId of adj.get(path[0]) ?? []) {
    if (nodeMap.get(nbId)?.type === 'corridor') skipIds.add(nbId);
  }
  for (const nbId of adj.get(destId) ?? []) {
    if (nodeMap.get(nbId)?.type === 'corridor') skipIds.add(nbId);
  }

  // Raw steps from path
  const raw: { from: string; to: string; edgeType: EdgeType }[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    raw.push({ from: path[i], to: path[i + 1], edgeType: edgeTypeMap.get(`${path[i]}→${path[i + 1]}`) ?? 'walk' });
  }

  // Compress (mirror Flutter _compress logic)
  const compressed: { from: string; to: string; edgeType: EdgeType }[] = [];
  for (const step of raw) {
    const toNode = nodeMap.get(step.to);
    const isTransit = step.edgeType !== 'walk';
    const toCorridor = toNode?.type === 'corridor';

    if (isTransit) {
      const resolved = nearestNamed(step.to);
      const last = compressed[compressed.length - 1];
      if (!last || last.to !== resolved || last.edgeType !== step.edgeType)
        compressed.push({ from: step.from, to: resolved, edgeType: step.edgeType });
      continue;
    }
    if (!toCorridor) {
      const last = compressed[compressed.length - 1];
      if (!last || last.to !== step.to || last.edgeType !== 'walk')
        compressed.push(step);
      continue;
    }
    if (skipIds.has(step.to)) continue;
    const resolved = nearestNamed(step.to);
    const last = compressed[compressed.length - 1];
    if (last && last.to === resolved && last.edgeType === 'walk') continue;
    compressed.push({ from: step.from, to: resolved, edgeType: step.edgeType });
  }

  // Format
  return compressed.map(step => {
    const to = nodeMap.get(step.to)!;
    let description: string;
    if (step.edgeType === 'stairs') description = `По лестнице на ${to.floorName}`;
    else if (step.edgeType === 'elevator') description = `На лифте на ${to.floorName}`;
    else description = `Идите до «${to.label}»`;
    return { description, edgeType: step.edgeType, floorName: to.floorName, toNodeId: step.to };
  });
}

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
