import 'package:flutter/material.dart';
import '../models/building.dart';
import '../models/route.dart';

class RouteInstructionsSheet extends StatelessWidget {
  final AppRoute route;
  final Building building;
  const RouteInstructionsSheet({super.key, required this.route, required this.building});

  Map<String, NavNode> get _nodeMap => {for (final n in building.allNodes) n.id: n};

  Map<String, List<String>> _buildAdj() {
    final adj = <String, List<String>>{};
    void add(String a, String b) {
      adj.putIfAbsent(a, () => []).add(b);
      adj.putIfAbsent(b, () => []).add(a);
    }
    for (final floor in building.floors) {
      for (final e in floor.edges) { add(e.from, e.to); }
    }
    for (final e in building.crossFloorEdges) { add(e.from, e.to); }
    return adj;
  }

  // BFS to find all landmarks at minimum depth, then pick the one
  // geographically closest to [destination] (Euclidean distance).
  NavNode _nearestLandmark(
    NavNode start,
    Map<String, NavNode> nodeMap,
    Map<String, List<String>> adj, {
    NavNode? destination,
  }) {
    if (start.type == NodeType.room || start.type == NodeType.entrance) return start;

    final visited = <String>{start.id};
    var frontier = [start.id];
    final candidates = <String>[];

    while (frontier.isNotEmpty && candidates.isEmpty) {
      final next = <String>[];
      for (final id in frontier) {
        for (final nb in adj[id] ?? []) {
          if (!visited.add(nb)) continue;
          final node = nodeMap[nb];
          if (node != null && (node.type == NodeType.room || node.type == NodeType.entrance)) {
            candidates.add(nb);
          } else {
            next.add(nb);
          }
        }
      }
      frontier = next;
    }

    if (candidates.isEmpty) return start;
    if (candidates.length == 1 || destination == null) return nodeMap[candidates.first]!;

    // Pick candidate geographically closest to the route destination — consistent
    // tie-breaking that avoids ping-pong between equidistant rooms on opposite sides.
    NavNode? best;
    double bestDistSq = double.infinity;
    for (final id in candidates) {
      final node = nodeMap[id]!;
      final dx = node.x - destination.x;
      final dy = node.y - destination.y;
      final dSq = dx * dx + dy * dy;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        best = node;
      }
    }
    return best!;
  }

  List<RouteStep> _compress(List<RouteStep> steps) {
    if (steps.isEmpty) return [];

    final nodeMap = _nodeMap;
    final adj = _buildAdj();

    final routeStart = steps.first.from;
    final routeEnd = steps.last.to;

    // Corridors directly adjacent to the route's named start and end
    final skipIds = <String>{};
    for (final nbId in adj[routeStart.id] ?? []) {
      final n = nodeMap[nbId];
      if (n != null && n.type == NodeType.corridor) skipIds.add(nbId);
    }
    for (final nbId in adj[routeEnd.id] ?? []) {
      final n = nodeMap[nbId];
      if (n != null && n.type == NodeType.corridor) skipIds.add(nbId);
    }

    final result = <RouteStep>[];

    for (final step in steps) {
      final toCorridor = step.to.type == NodeType.corridor;
      final isTransit = step.edgeType != EdgeType.walk;

      if (isTransit) {
        final dest = _nearestLandmark(step.to, nodeMap, adj, destination: routeEnd);
        if (result.isEmpty || result.last.to.id != dest.id || result.last.edgeType != step.edgeType) {
          result.add(RouteStep(from: step.from, to: dest, edgeType: step.edgeType, weight: step.weight));
        }
        continue;
      }

      if (!toCorridor) {
        if (result.isEmpty || result.last.to.id != step.to.id) {
          result.add(step);
        }
        continue;
      }

      if (skipIds.contains(step.to.id)) continue;

      final dest = _nearestLandmark(step.to, nodeMap, adj, destination: routeEnd);
      if (result.isNotEmpty && result.last.to.id == dest.id) continue;
      result.add(RouteStep(from: step.from, to: dest, edgeType: step.edgeType, weight: step.weight));
    }
    return result;
  }

  @override
  Widget build(BuildContext context) {
    final steps = _compress(route.steps);
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.6,
      builder: (ctx, scroll) => Column(
        children: [
          const Padding(
            padding: EdgeInsets.all(16),
            child: Text('Маршрут',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          ),
          Expanded(
            child: ListView.separated(
              controller: scroll,
              itemCount: steps.length,
              separatorBuilder: (_, __) => const Divider(height: 1),
              itemBuilder: (ctx, i) {
                final step = steps[i];
                final icon = switch (step.edgeType) {
                  EdgeType.walk => Icons.directions_walk,
                  EdgeType.stairs => Icons.stairs,
                  EdgeType.elevator => Icons.elevator,
                };
                return ListTile(
                  leading: CircleAvatar(child: Icon(icon, size: 18)),
                  title: Text(step.description),
                  subtitle: Text('${step.to.floor} этаж'),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
