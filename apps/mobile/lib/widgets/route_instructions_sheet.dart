import 'dart:collection';
import 'package:flutter/material.dart';
import '../models/building.dart';
import '../models/route.dart';

class RouteInstructionsSheet extends StatelessWidget {
  final AppRoute route;
  final Building building;
  const RouteInstructionsSheet({super.key, required this.route, required this.building});

  // BFS over the full building graph to find nearest non-corridor node from [start].
  NavNode _nearestNamedInGraph(NavNode start) {
    if (start.type != NodeType.corridor) return start;

    final nodeMap = {for (final n in building.allNodes) n.id: n};
    final adj = <String, List<String>>{};
    void addEdge(String a, String b) {
      adj.putIfAbsent(a, () => []).add(b);
      adj.putIfAbsent(b, () => []).add(a);
    }
    for (final floor in building.floors) {
      for (final e in floor.edges) { addEdge(e.from, e.to); }
    }
    for (final e in building.crossFloorEdges) { addEdge(e.from, e.to); }

    final visited = <String>{start.id};
    final queue = Queue<String>()..add(start.id);
    while (queue.isNotEmpty) {
      final id = queue.removeFirst();
      final node = nodeMap[id];
      if (node != null && node.type != NodeType.corridor) return node;
      for (final nb in adj[id] ?? []) {
        if (visited.add(nb)) queue.add(nb);
      }
    }
    return start; // fallback (shouldn't happen in a valid graph)
  }

  List<RouteStep> _compress(List<RouteStep> steps) {
    final result = <RouteStep>[];
    NavNode? lastFrom = steps.isNotEmpty ? steps.first.from : null;

    for (int i = 0; i < steps.length; i++) {
      final step = steps[i];
      final isTransit = step.edgeType != EdgeType.walk;
      final toIsCorridor = step.to.type == NodeType.corridor;

      if (isTransit) {
        final namedTo = toIsCorridor ? _nearestNamedInGraph(step.to) : step.to;
        result.add(RouteStep(
          from: lastFrom ?? step.from,
          to: namedTo,
          edgeType: step.edgeType,
          weight: step.weight,
        ));
        lastFrom = namedTo;
        continue;
      }

      if (toIsCorridor) continue;

      result.add(RouteStep(
        from: lastFrom ?? step.from,
        to: step.to,
        edgeType: step.edgeType,
        weight: step.weight,
      ));
      lastFrom = step.to;
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
