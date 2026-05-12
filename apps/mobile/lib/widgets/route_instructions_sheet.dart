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

  // Phase 1: BFS level-by-level to collect ALL rooms/entrances at minimum depth.
  // Phase 2: if multiple candidates and prevNode given, BFS from prevNode to pick nearest.
  NavNode _nearestLandmark(
    NavNode start,
    Map<String, NavNode> nodeMap,
    Map<String, List<String>> adj, {
    NavNode? prevNode,
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
    if (candidates.length == 1 || prevNode == null) return nodeMap[candidates.first]!;

    // Phase 2: BFS from prevNode — first candidate that isn't prevNode itself wins.
    // Excluding prevNode prevents deduplication from swallowing the very next step.
    final candidateSet = candidates.toSet();
    final visited2 = <String>{prevNode.id};
    final queue2 = Queue<String>()..add(prevNode.id);
    while (queue2.isNotEmpty) {
      final id = queue2.removeFirst();
      if (candidateSet.contains(id) && id != prevNode.id) return nodeMap[id]!;
      for (final nb in adj[id] ?? []) {
        if (visited2.add(nb)) queue2.add(nb);
      }
    }

    final nonPrev = candidates.firstWhere((id) => id != prevNode.id, orElse: () => candidates.first);
    return nodeMap[nonPrev]!;
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
    NavNode prevLandmark = routeStart;

    for (final step in steps) {
      final toCorridor = step.to.type == NodeType.corridor;
      final isTransit = step.edgeType != EdgeType.walk;

      if (isTransit) {
        final dest = _nearestLandmark(step.to, nodeMap, adj, prevNode: prevLandmark);
        if (result.isEmpty || result.last.to.id != dest.id || result.last.edgeType != step.edgeType) {
          result.add(RouteStep(from: step.from, to: dest, edgeType: step.edgeType, weight: step.weight));
          prevLandmark = dest;
        }
        continue;
      }

      if (!toCorridor) {
        if (result.isEmpty || result.last.to.id != step.to.id) {
          result.add(step);
          prevLandmark = step.to;
        }
        continue;
      }

      // Corridor destination:
      if (skipIds.contains(step.to.id)) continue; // adjacent to start/end — skip

      // Intermediate corridor: show nearest landmark, tie-break by prevLandmark distance.
      final dest = _nearestLandmark(step.to, nodeMap, adj, prevNode: prevLandmark);
      if (result.isNotEmpty && result.last.to.id == dest.id) continue; // deduplicate
      result.add(RouteStep(from: step.from, to: dest, edgeType: step.edgeType, weight: step.weight));
      prevLandmark = dest;
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
