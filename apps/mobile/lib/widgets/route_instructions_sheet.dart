import 'package:flutter/material.dart';
import '../models/building.dart';
import '../models/route.dart';

class RouteInstructionsSheet extends StatelessWidget {
  final AppRoute route;
  const RouteInstructionsSheet({super.key, required this.route});

  // Compress steps: skip corridor intermediates, keep only steps
  // that arrive at a named node (non-corridor). Stairs/elevator always shown.
  List<RouteStep> _compress(List<RouteStep> steps) {
    final result = <RouteStep>[];
    NavNode? lastFrom = steps.isNotEmpty ? steps.first.from : null;

    for (final step in steps) {
      final isTransit = step.edgeType != EdgeType.walk;
      final toIsCorridor = step.to.type == NodeType.corridor;

      if (isTransit) {
        // Always show floor transitions
        result.add(RouteStep(
          from: lastFrom ?? step.from,
          to: step.to,
          edgeType: step.edgeType,
          weight: step.weight,
        ));
        if (!toIsCorridor) lastFrom = step.to;
        continue;
      }

      if (toIsCorridor) continue; // skip corridor hops

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
