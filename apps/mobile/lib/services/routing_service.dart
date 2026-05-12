import 'package:collection/collection.dart';
import '../models/building.dart';
import '../models/route.dart';

enum RoutePreference { elevator, stairs, noPreference }

class _Edge {
  final String to;
  final EdgeType edgeType;
  final double weight;
  const _Edge(this.to, this.edgeType, this.weight);
}

class RoutingService {
  AppRoute? findRoute({
    required Building building,
    required String fromId,
    required String toId,
    required RoutePreference preference,
  }) {
    if (fromId == toId) return const AppRoute(steps: [], totalWeight: 0);

    final nodeMap = {for (final n in building.allNodes) n.id: n};
    if (!nodeMap.containsKey(fromId) || !nodeMap.containsKey(toId)) return null;

    // Build undirected adjacency list
    final adj = <String, List<_Edge>>{};
    void addBoth(String a, String b, EdgeType type, double base) {
      final w = _applyPref(base, type, preference);
      adj.putIfAbsent(a, () => []).add(_Edge(b, type, w));
      adj.putIfAbsent(b, () => []).add(_Edge(a, type, w));
    }
    for (final floor in building.floors) {
      for (final e in floor.edges) { addBoth(e.from, e.to, e.type, e.weight); }
    }
    for (final e in building.crossFloorEdges) {
      addBoth(e.from, e.to, e.type, e.weight);
    }

    // Dijkstra
    final dist = <String, double>{fromId: 0.0};
    final prev = <String, String>{};
    final prevEdge = <String, _Edge>{};
    final queue = PriorityQueue<(double, String)>(
      (a, b) => a.$1.compareTo(b.$1),
    );
    queue.add((0.0, fromId));

    while (queue.isNotEmpty) {
      final (d, u) = queue.removeFirst();
      if (d > (dist[u] ?? double.infinity)) continue;
      if (u == toId) break;
      for (final e in adj[u] ?? []) {
        final nd = d + e.weight;
        if (nd < (dist[e.to] ?? double.infinity)) {
          dist[e.to] = nd;
          prev[e.to] = u;
          prevEdge[e.to] = e;
          queue.add((nd, e.to));
        }
      }
    }

    if (!prev.containsKey(toId)) return null;

    // Reconstruct path
    final path = <String>[];
    var cur = toId;
    while (cur != fromId) {
      path.add(cur);
      cur = prev[cur]!;
    }
    path.add(fromId);

    final steps = <RouteStep>[];
    final ordered = path.reversed.toList();
    for (var i = 0; i < ordered.length - 1; i++) {
      final edge = prevEdge[ordered[i + 1]]!;
      steps.add(RouteStep(
        from: nodeMap[ordered[i]]!,
        to: nodeMap[ordered[i + 1]]!,
        edgeType: edge.edgeType,
        weight: edge.weight,
      ));
    }

    return AppRoute(steps: steps, totalWeight: dist[toId] ?? 0);
  }

  double _applyPref(double base, EdgeType type, RoutePreference pref) =>
      base *
      switch ((type, pref)) {
        (EdgeType.stairs, RoutePreference.elevator) => 3.0,
        (EdgeType.stairs, RoutePreference.stairs) => 0.5,
        (EdgeType.elevator, RoutePreference.elevator) => 0.5,
        (EdgeType.elevator, RoutePreference.stairs) => 3.0,
        _ => 1.0,
      };
}
