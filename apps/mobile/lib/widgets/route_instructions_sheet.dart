import 'package:flutter/material.dart';
import '../models/building.dart';
import '../models/route.dart';

class RouteInstructionsSheet extends StatelessWidget {
  final AppRoute route;
  const RouteInstructionsSheet({super.key, required this.route});

  // Returns nearest non-corridor node at or after steps[startIdx].to
  NavNode _nearestNamed(List<RouteStep> steps, int startIdx) {
    for (int j = startIdx; j < steps.length; j++) {
      if (steps[j].to.type != NodeType.corridor) return steps[j].to;
    }
    return startIdx < steps.length ? steps[startIdx].to : steps.last.to;
  }

  // Compress steps: skip corridor intermediates.
  // Walk steps shown only when destination is non-corridor.
  // Stairs/elevator always shown, destination replaced with nearest named node.
  List<RouteStep> _compress(List<RouteStep> steps) {
    final result = <RouteStep>[];
    NavNode? lastFrom = steps.isNotEmpty ? steps.first.from : null;

    for (int i = 0; i < steps.length; i++) {
      final step = steps[i];
      final isTransit = step.edgeType != EdgeType.walk;
      final toIsCorridor = step.to.type == NodeType.corridor;

      if (isTransit) {
        final namedTo = toIsCorridor ? _nearestNamed(steps, i + 1) : step.to;
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
