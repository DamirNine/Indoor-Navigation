import 'package:flutter/material.dart';
import '../models/building.dart';
import '../models/route.dart';

class FloorMapPainter extends CustomPainter {
  final List<NavNode> nodes;
  final List<Area> areas;
  final List<RouteStep> stepsOnFloor;
  final Size imageSize;
  final List<List<List<double>>>? contours;

  FloorMapPainter({
    required this.nodes,
    required this.areas,
    required this.stepsOnFloor,
    required this.imageSize,
    this.contours,
  });

  static const _nodeColors = {
    NodeType.room: Color(0xFF1976D2),
    NodeType.stairs: Color(0xFFF57C00),
    NodeType.elevator: Color(0xFF7B1FA2),
    NodeType.entrance: Color(0xFF2E7D32),
    NodeType.corridor: Color(0xFF757575),
  };

  static const _areaFills = {
    NodeType.room: Color(0x261976D2),
    NodeType.stairs: Color(0x2EF57C00),
    NodeType.elevator: Color(0x2E7B1FA2),
    NodeType.entrance: Color(0x2E2E7D32),
  };

  @override
  void paint(Canvas canvas, Size size) {
    final scaleX = size.width / imageSize.width;
    final scaleY = size.height / imageSize.height;

    Offset toCanvas(double x, double y) => Offset(x * scaleX, y * scaleY);
    Offset nodeOffset(NavNode n) => toCanvas(n.x, n.y);

    final routeNodeIds = <String>{};
    for (final s in stepsOnFloor) {
      routeNodeIds.add(s.from.id);
      routeNodeIds.add(s.to.id);
    }

    final nodeMap = {for (final n in nodes) n.id: n};

    // Draw building contours behind everything.
    // Even-odd fill: if one contour is nested inside another, only the ring
    // between them is filled (donut / Ш-shape cutouts work automatically).
    if (contours != null && contours!.isNotEmpty) {
      final fillPath = Path()..fillType = PathFillType.evenOdd;
      for (final contour in contours!) {
        if (contour.length < 3) continue;
        fillPath.moveTo(toCanvas(contour[0][0], contour[0][1]).dx,
            toCanvas(contour[0][0], contour[0][1]).dy);
        for (int i = 1; i < contour.length; i++) {
          fillPath.lineTo(toCanvas(contour[i][0], contour[i][1]).dx,
              toCanvas(contour[i][0], contour[i][1]).dy);
        }
        fillPath.close();
      }
      canvas.drawPath(fillPath,
          Paint()..color = const Color(0x0A000000)..style = PaintingStyle.fill);
      canvas.drawPath(fillPath,
          Paint()..color = Colors.black..strokeWidth = 3.0..style = PaintingStyle.stroke);
    }

    if (areas.isNotEmpty) {
      _paintSchematic(canvas, size, toCanvas, nodeMap, routeNodeIds);
    } else {
      _paintCircles(canvas, nodeOffset, routeNodeIds);
    }

    // Route path
    final routePaint = Paint()
      ..color = const Color(0xFF43A047)
      ..strokeWidth = 3.5
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;
    for (final step in stepsOnFloor) {
      if (step.from.floor == step.to.floor) {
        canvas.drawLine(nodeOffset(step.from), nodeOffset(step.to), routePaint);
      }
    }
  }

  void _paintSchematic(
    Canvas canvas,
    Size size,
    Offset Function(double, double) toCanvas,
    Map<String, NavNode> nodeMap,
    Set<String> routeNodeIds,
  ) {
    for (final area in areas) {
      final node = nodeMap[area.nodeId];
      if (node == null || area.points.length < 3) continue;

      final onRoute = routeNodeIds.contains(area.nodeId);
      final baseColor = _nodeColors[node.type] ?? const Color(0xFF1976D2);
      final fillColor = onRoute
          ? baseColor.withAlpha(70)
          : (_areaFills[node.type] ?? const Color(0x261976D2));

      final path = Path();
      final first = area.points[0];
      path.moveTo(toCanvas(first[0], first[1]).dx, toCanvas(first[0], first[1]).dy);
      for (int i = 1; i < area.points.length; i++) {
        final pt = area.points[i];
        path.lineTo(toCanvas(pt[0], pt[1]).dx, toCanvas(pt[0], pt[1]).dy);
      }
      path.close();

      canvas.drawPath(path, Paint()..color = fillColor..style = PaintingStyle.fill);
      canvas.drawPath(
        path,
        Paint()
          ..color = onRoute ? const Color(0xFF43A047) : baseColor
          ..strokeWidth = onRoute ? 2.5 : 1.5
          ..style = PaintingStyle.stroke,
      );

      // Label centered in area
      final cx = area.points.map((p) => p[0]).reduce((a, b) => a + b) / area.points.length;
      final cy = area.points.map((p) => p[1]).reduce((a, b) => a + b) / area.points.length;
      final center = toCanvas(cx, cy);

      final tp = TextPainter(
        text: TextSpan(
          text: node.label,
          style: TextStyle(
            color: onRoute ? const Color(0xFF1B5E20) : baseColor,
            fontSize: 11,
            fontWeight: FontWeight.w600,
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      tp.paint(canvas, center - Offset(tp.width / 2, tp.height / 2));
    }

    // Draw nodes without areas as small circles (skip corridors)
    final areaNodeIds = {for (final a in areas) a.nodeId};
    for (final node in nodeMap.values) {
      if (areaNodeIds.contains(node.id)) continue;
      if (node.type == NodeType.corridor) continue;
      final pos = toCanvas(node.x, node.y);
      final onRoute = routeNodeIds.contains(node.id);
      final color = _nodeColors[node.type] ?? Colors.grey;
      canvas.drawCircle(pos, 6, Paint()..color = onRoute ? color : color.withAlpha(160));
    }
  }

  void _paintCircles(
    Canvas canvas,
    Offset Function(NavNode) nodeOffset,
    Set<String> routeNodeIds,
  ) {
    for (final node in nodes) {
      if (node.type == NodeType.corridor) continue;
      final pos = nodeOffset(node);
      final onRoute = routeNodeIds.contains(node.id);
      final color = switch (node.type) {
        NodeType.room => onRoute ? const Color(0xFF1976D2) : Colors.grey.shade400,
        NodeType.stairs => const Color(0xFFF57C00),
        NodeType.elevator => const Color(0xFF7B1FA2),
        NodeType.entrance => const Color(0xFF2E7D32),
        NodeType.corridor => Colors.grey.shade400,
      };
      canvas.drawCircle(pos, 6, Paint()..color = color);
    }
  }

  @override
  bool shouldRepaint(FloorMapPainter old) =>
      old.stepsOnFloor != stepsOnFloor ||
      old.nodes != nodes ||
      old.areas != areas ||
      old.contours != contours;
}
