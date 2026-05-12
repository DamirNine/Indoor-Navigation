import 'package:flutter/material.dart';
import '../models/building.dart';
import '../models/route.dart';

class RouteInstructionsSheet extends StatelessWidget {
  final AppRoute route;
  const RouteInstructionsSheet({super.key, required this.route});

  @override
  Widget build(BuildContext context) {
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
              itemCount: route.steps.length,
              separatorBuilder: (_, __) => const Divider(height: 1),
              itemBuilder: (ctx, i) {
                final step = route.steps[i];
                final icon = switch (step.edgeType) {
                  EdgeType.walk => Icons.directions_walk,
                  EdgeType.stairs => Icons.stairs,
                  EdgeType.elevator => Icons.elevator,
                };
                return ListTile(
                  leading: CircleAvatar(
                    child: Icon(icon, size: 18),
                  ),
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
