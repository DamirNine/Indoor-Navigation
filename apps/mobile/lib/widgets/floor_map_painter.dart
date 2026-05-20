import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../models/building.dart';
import '../models/route.dart';

class FloorMapPainter extends CustomPainter {
  final List<NavNode> nodes;
  final List<Area> areas;
  final List<RouteStep> stepsOnFloor;
  final Size imageSize;
  final List<List<List<double>>>? contours;
  final int rotationIndex; // 0=0°, 1=90°CW, 2=180°, 3=270°CW

  FloorMapPainter({
    required this.nodes,
    required this.areas,
    required this.stepsOnFloor,
    required this.imageSize,
    this.contours,
    this.rotationIndex = 0,
  });

  // Exact same colors as editor NODE_COLOR / AREA_FILL
  static const _nodeColors = {
    NodeType.room: Color(0xFF1976D2),
    NodeType.stairs: Color(0xFFF57C00),
    NodeType.elevator: Color(0xFF7B1FA2),
    NodeType.entrance: Color(0xFF2E7D32),
    NodeType.corridor: Color(0xFF757575),
  };

  static const _areaFills = {
    NodeType.room: Color(0x261976D2),      // rgba(25,118,210,0.15)
    NodeType.stairs: Color(0x2EF57C00),    // rgba(245,124,0,0.18)
    NodeType.elevator: Color(0x2E7B1FA2),  // rgba(123,31,162,0.18)
    NodeType.entrance: Color(0x2E2E7D32),  // rgba(46,125,50,0.18)
  };

  @override
  void paint(Canvas canvas, Size size) {
    final scaleX = size.width / imageSize.width;
    final scaleY = size.height / imageSize.height;
    final sc = math.min(scaleX, scaleY);

    Offset toCanvas(double x, double y) => Offset(x * scaleX, y * scaleY);

    final routeNodeIds = <String>{};
    for (final s in stepsOnFloor) {
      routeNodeIds.add(s.from.id);
      routeNodeIds.add(s.to.id);
    }
    final nodeMap = {for (final n in nodes) n.id: n};

    // ── 1. Contours (editor: fill rgba(0,0,0,0.04) evenodd, stroke black lineWidth=2)
    if (contours != null && contours!.isNotEmpty) {
      final fillPath = Path()..fillType = PathFillType.evenOdd;
      for (final c in contours!) {
        if (c.length < 3) continue;
        fillPath.moveTo(toCanvas(c[0][0], c[0][1]).dx, toCanvas(c[0][0], c[0][1]).dy);
        for (int i = 1; i < c.length; i++) {
          fillPath.lineTo(toCanvas(c[i][0], c[i][1]).dx, toCanvas(c[i][0], c[i][1]).dy);
        }
        fillPath.close();
      }
      canvas.drawPath(fillPath,
          Paint()..color = const Color(0x0A000000)..style = PaintingStyle.fill);

      for (final c in contours!) {
        if (c.length < 3) continue;
        final path = Path();
        path.moveTo(toCanvas(c[0][0], c[0][1]).dx, toCanvas(c[0][0], c[0][1]).dy);
        for (int i = 1; i < c.length; i++) {
          path.lineTo(toCanvas(c[i][0], c[i][1]).dx, toCanvas(c[i][0], c[i][1]).dy);
        }
        path.close();
        canvas.drawPath(path, Paint()
          ..color = Colors.black
          ..strokeWidth = math.max(0.8, 2.0 * sc)
          ..style = PaintingStyle.stroke
          ..strokeJoin = StrokeJoin.round);
      }
    }

    // ── 2. Areas (editor: fill=AREA_FILL, stroke=NODE_COLOR, strokeWidth=1.5 virtual)
    for (final area in areas) {
      final node = nodeMap[area.nodeId];
      if (node == null || area.points.length < 3) continue;

      final onRoute = routeNodeIds.contains(area.nodeId);
      final baseColor = _nodeColors[node.type] ?? const Color(0xFF1976D2);
      final fillColor = onRoute
          ? baseColor.withAlpha(100)
          : (_areaFills[node.type] ?? const Color(0x261976D2));

      final path = Path();
      path.moveTo(toCanvas(area.points[0][0], area.points[0][1]).dx,
                  toCanvas(area.points[0][0], area.points[0][1]).dy);
      for (int i = 1; i < area.points.length; i++) {
        path.lineTo(toCanvas(area.points[i][0], area.points[i][1]).dx,
                    toCanvas(area.points[i][0], area.points[i][1]).dy);
      }
      path.close();

      canvas.drawPath(path, Paint()..color = fillColor..style = PaintingStyle.fill);
      canvas.drawPath(path, Paint()
        ..color = onRoute ? const Color(0xFF43A047) : baseColor
        ..strokeWidth = math.max(0.5, 1.5 * sc)
        ..style = PaintingStyle.stroke);

      // Label: centroid, fontSize=13 virtual scaled, clamped readable
      final cx = area.points.map((p) => p[0]).reduce((a, b) => a + b) / area.points.length;
      final cy = area.points.map((p) => p[1]).reduce((a, b) => a + b) / area.points.length;

      final areaW = (area.points.map((p) => p[0]).reduce(math.max)
                   - area.points.map((p) => p[0]).reduce(math.min)) * scaleX;
      final areaH = (area.points.map((p) => p[1]).reduce(math.max)
                   - area.points.map((p) => p[1]).reduce(math.min)) * scaleY;
      final fontSize = (math.min(areaW, areaH) * 0.175).clamp(2.0, 5.5);

      final tp = TextPainter(
        text: TextSpan(
          text: node.label,
          style: TextStyle(
            color: onRoute ? const Color(0xFF1B5E20) : baseColor,
            fontSize: fontSize,
            fontWeight: FontWeight.bold,
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout(maxWidth: areaW);
      final textCenter = toCanvas(cx, cy);
      canvas.save();
      canvas.translate(textCenter.dx, textCenter.dy);
      canvas.rotate(-rotationIndex * math.pi / 2);
      canvas.translate(-textCenter.dx, -textCenter.dy);
      tp.paint(canvas, textCenter - Offset(tp.width / 2, tp.height / 2));
      canvas.restore();
    }

    // ── 3. Route path
    final routePaint = Paint()
      ..color = const Color(0xFF43A047)
      ..strokeWidth = math.max(0.67, 1.17 * sc)
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;
    for (final step in stepsOnFloor) {
      if (step.from.floor == step.to.floor) {
        final from = toCanvas(step.from.x, step.from.y);
        final to = toCanvas(step.to.x, step.to.y);
        canvas.drawLine(from, to, routePaint);
      }
    }
  }

  @override
  bool shouldRepaint(FloorMapPainter old) =>
      old.stepsOnFloor != stepsOnFloor ||
      old.nodes != nodes ||
      old.areas != areas ||
      old.contours != contours ||
      old.rotationIndex != rotationIndex;
}
