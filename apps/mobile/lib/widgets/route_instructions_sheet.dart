import 'dart:collection';
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

  // BFS from [start] to find nearest node that is a room or entrance.
  NavNode _nearestLandmark(NavNode start, Map<String, NavNode> nodeMap, Map<String, List<String>> adj) {
    if (start.type == NodeType.room || start.type == NodeType.entrance) return start;
    final visited = <String>{start.id};
    final queue = Queue<String>()..add(start.id);
    while (queue.isNotEmpty) {
      final id = queue.removeFirst();
      final node = nodeMap[id];
      if (node != null && (node.type == NodeType.room || node.type == NodeType.entrance)) {
        return node;
      }
      for (final nb in adj[id] ?? []) {
        if (visited.add(nb)) queue.add(nb);
      }
    }
    return start;
  }

  List<RouteStep> _compress(List<RouteStep> steps) {
    if (steps.isEmpty) return [];

    final nodeMap = _nodeMap;
    final adj = _buildAdj();

    // Corridors directly adjacent to the route's named start and end
    final routeStart = steps.first.from;
    final routeEnd = steps.last.to;
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
        // Stairs / elevator: always show, destination = nearest landmark
        final dest = _nearestLandmark(step.to, nodeMap, adj);
        result.add(RouteStep(from: step.from, to: dest, edgeType: step.edgeType, weight: step.weight));
        continue;
      }

      if (!toCorridor) {
        // Named destination: always show
        result.add(step);
        continue;
      }

      // Corridor destination:
      if (skipIds.contains(step.to.id)) continue; // adjacent to start/end — skip

      // Intermediate corridor: show nearest landmark as waypoint
      final dest = _nearestLandmark(step.to, nodeMap, adj);
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
