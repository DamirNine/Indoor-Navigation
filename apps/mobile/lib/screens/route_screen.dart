import 'dart:io';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:path_provider/path_provider.dart';
import '../models/building.dart';
import '../models/route.dart';
import '../widgets/floor_map_painter.dart';
import '../widgets/route_instructions_sheet.dart';

class RouteScreen extends StatefulWidget {
  final AppRoute route;
  final Building building;

  const RouteScreen({
    super.key,
    required this.route,
    required this.building,
  });

  @override
  State<RouteScreen> createState() => _RouteScreenState();
}

class _RouteScreenState extends State<RouteScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  late List<Floor> _floorsWithRoute;

  @override
  void initState() {
    super.initState();
    _floorsWithRoute = _floorsInRoute();
    _tabController = TabController(
      length: _floorsWithRoute.length,
      vsync: this,
    );
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  List<Floor> _floorsInRoute() {
    final floors = <int>{};
    for (final step in widget.route.steps) {
      floors.add(step.from.floor);
      floors.add(step.to.floor);
    }
    return widget.building.floors
        .where((f) => floors.contains(f.level))
        .toList()
      ..sort((a, b) => a.level.compareTo(b.level));
  }

  List<RouteStep> _stepsForFloor(int level) => widget.route.steps
      .where((s) => s.from.floor == level || s.to.floor == level)
      .toList();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/'),
        ),
        title: Text(
          '${widget.route.steps.first.from.label} → '
          '${widget.route.steps.last.to.label}',
        ),
        bottom: _floorsWithRoute.length > 1
            ? TabBar(
                controller: _tabController,
                tabs: _floorsWithRoute.map((f) => Tab(text: f.name)).toList(),
              )
            : null,
      ),
      body: TabBarView(
        controller: _tabController,
        children: _floorsWithRoute.map((floor) {
          return _FloorView(
            floor: floor,
            buildingId: widget.building.id,
            steps: _stepsForFloor(floor.level),
          );
        }).toList(),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: FilledButton.icon(
            onPressed: () => showModalBottomSheet(
              context: context,
              isScrollControlled: true,
              builder: (_) => RouteInstructionsSheet(route: widget.route, building: widget.building),
            ),
            icon: const Icon(Icons.list),
            label: const Text('Пошаговые инструкции'),
          ),
        ),
      ),
    );
  }
}

class _FloorView extends StatefulWidget {
  final Floor floor;
  final String buildingId;
  final List<RouteStep> steps;
  const _FloorView({
    required this.floor,
    required this.buildingId,
    required this.steps,
  });
  @override
  State<_FloorView> createState() => _FloorViewState();
}

// Virtual canvas size — must match VIRTUAL_W/H in the React editor (10000×8000).
const _virtualSize = Size(10000, 8000);

class _FloorViewState extends State<_FloorView> {
  File? _imageFile;
  final _transform = TransformationController();
  bool _transformSet = false;

  @override
  void initState() {
    super.initState();
    _loadImage();
  }

  @override
  void dispose() {
    _transform.dispose();
    super.dispose();
  }

  Future<void> _loadImage() async {
    if (widget.floor.image == null) return;
    final dir = await getApplicationDocumentsDirectory();
    final f = File(
        '${dir.path}/buildings/${widget.buildingId}/${widget.floor.image}');
    if (!await f.exists() || !mounted) return;
    setState(() => _imageFile = f);
  }

  void _maybeInitTransform(BoxConstraints constraints) {
    if (_transformSet) return;

    double? minX, minY, maxX, maxY;

    final contours = widget.floor.contours;
    if (contours != null && contours.isNotEmpty) {
      for (final contour in contours) {
        for (final pt in contour) {
          minX = minX == null ? pt[0] : min(minX, pt[0]);
          minY = minY == null ? pt[1] : min(minY, pt[1]);
          maxX = maxX == null ? pt[0] : max(maxX, pt[0]);
          maxY = maxY == null ? pt[1] : max(maxY, pt[1]);
        }
      }
    } else {
      for (final node in widget.floor.nodes) {
        minX = minX == null ? node.x : min(minX, node.x);
        minY = minY == null ? node.y : min(minY, node.y);
        maxX = maxX == null ? node.x : max(maxX, node.x);
        maxY = maxY == null ? node.y : max(maxY, node.y);
      }
    }

    if (minX == null || minY == null || maxX == null || maxY == null) return;
    _transformSet = true;

    const pad = 600.0;
    final bMinX = (minX - pad) / _virtualSize.width * constraints.maxWidth;
    final bMinY = (minY - pad) / _virtualSize.height * constraints.maxHeight;
    final bMaxX = (maxX + pad) / _virtualSize.width * constraints.maxWidth;
    final bMaxY = (maxY + pad) / _virtualSize.height * constraints.maxHeight;

    final bW = bMaxX - bMinX;
    final bH = bMaxY - bMinY;
    if (bW <= 0 || bH <= 0) return;

    final s = min(constraints.maxWidth / bW, constraints.maxHeight / bH);
    final cx = (bMinX + bMaxX) / 2;
    final cy = (bMinY + bMaxY) / 2;
    final tx = constraints.maxWidth / 2 - s * cx;
    final ty = constraints.maxHeight / 2 - s * cy;

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final m = Matrix4.identity();
      m.setEntry(0, 0, s);
      m.setEntry(1, 1, s);
      m.setEntry(0, 3, tx);
      m.setEntry(1, 3, ty);
      _transform.value = m;
    });
  }

  @override
  Widget build(BuildContext context) {
    return InteractiveViewer(
      transformationController: _transform,
      minScale: 0.05,
      maxScale: 10.0,
      child: LayoutBuilder(builder: (ctx, constraints) {
        _maybeInitTransform(constraints);
        return Stack(
          children: [
            if (_imageFile != null)
              Image.file(_imageFile!,
                  width: constraints.maxWidth,
                  height: constraints.maxHeight,
                  fit: BoxFit.fill)
            else
              Container(color: Colors.grey.shade200),
            CustomPaint(
              size: Size(constraints.maxWidth, constraints.maxHeight),
              painter: FloorMapPainter(
                nodes: widget.floor.nodes,
                areas: widget.floor.areas,
                stepsOnFloor: widget.steps,
                imageSize: _virtualSize,
                contours: widget.floor.contours,
              ),
            ),
          ],
        );
      }),
    );
  }
}
