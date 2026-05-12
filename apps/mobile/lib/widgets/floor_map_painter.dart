import 'package:flutter/material.dart';
import '../models/building.dart';
import '../models/route.dart';

class FloorMapPainter extends CustomPainter {
  final List<NavNode> nodes;
  final List<RouteStep> stepsOnFloor;
  final Size imageSize;

  FloorMapPainter({
    required this.nodes,
    required this.stepsOnFloor,
    required this.imageSize,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final scaleX = size.width / imageSize.width;
    final scaleY = size.height / imageSize.height;

    Offset toCanvas(NavNode n) => Offset(n.x * scaleX, n.y * scaleY);

    final routePaint = Paint()
      ..color = Colors.blue
      ..strokeWidth = 3
      ..style = PaintingStyle.stroke;
    for (final step in stepsOnFloor) {
      if (step.from.floor == step.to.floor) {
        canvas.drawLine(toCanvas(step.from), toCanvas(step.to), routePaint);
      }
    }

    for (final node in nodes) {
      final pos = toCanvas(node);
      final isOnRoute =
          stepsOnFloor.any((s) => s.from.id == node.id || s.to.id == node.id);
      final color = switch (node.type) {
        NodeType.room => isOnRoute ? Colors.blue : Colors.grey.shade400,
        NodeType.stairs => Colors.orange,
        NodeType.elevator => Colors.purple,
        NodeType.entrance => Colors.green,
      };
      canvas.drawCircle(pos, 6, Paint()..color = color);
    }
  }

  @override
  bool shouldRepaint(FloorMapPainter old) =>
      old.stepsOnFloor != stepsOnFloor || old.nodes != nodes;
}
