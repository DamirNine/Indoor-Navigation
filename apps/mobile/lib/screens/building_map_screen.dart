import 'dart:io';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import '../models/building.dart';
import '../services/graph_service.dart';
import '../services/storage_service.dart';
import '../widgets/floor_map_painter.dart';

const _virtualW = 10000.0;
const _virtualH = 8000.0;
const _virtualSize = Size(_virtualW, _virtualH);

class BuildingMapScreen extends StatefulWidget {
  final String buildingId;
  const BuildingMapScreen({super.key, required this.buildingId});

  @override
  State<BuildingMapScreen> createState() => _BuildingMapScreenState();
}

class _BuildingMapScreenState extends State<BuildingMapScreen>
    with TickerProviderStateMixin {
  Building? _building;
  TabController? _tabController;
  final _transform = TransformationController();
  final _fittedFloors = <int>{};
  int _rotationIndex = 0; // 0=0°, 1=90°CW, 2=180°, 3=270°CW

  @override
  void initState() {
    super.initState();
    _loadBuilding();
  }

  @override
  void dispose() {
    _tabController?.dispose();
    _transform.dispose();
    super.dispose();
  }

  Future<void> _loadBuilding() async {
    final storage = context.read<StorageService>();
    final graph = context.read<GraphService>();
    final json = await storage.loadBuilding(widget.buildingId);
    if (json == null || !mounted) return;
    final building = graph.parseBuilding(json);
    setState(() {
      _building = building;
      _tabController = TabController(length: building.floors.length, vsync: this);
    });
  }

  void _rotateCW() {
    setState(() => _rotationIndex = (_rotationIndex + 1) % 4);
    _applyIncrementalRotation(math.pi / 2);
  }

  void _rotateCCW() {
    setState(() => _rotationIndex = (_rotationIndex + 3) % 4);
    _applyIncrementalRotation(-math.pi / 2);
  }

  void _applyIncrementalRotation(double angle) {
    final size = MediaQuery.of(context).size;
    final cx = size.width / 2;
    final cy = size.height / 2;
    final step = Matrix4.identity()
      ..translateByDouble(cx, cy, 0, 1)
      ..rotateZ(angle)
      ..translateByDouble(-cx, -cy, 0, 1);
    _transform.value = step * _transform.value;
  }

  @override
  Widget build(BuildContext context) {
    if (_building == null || _tabController == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Загрузка...')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    final building = _building!;

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/'),
        ),
        title: Text(building.name),
        actions: [
          IconButton(
            icon: const Icon(Icons.rotate_left),
            tooltip: 'Повернуть влево 90°',
            onPressed: _rotateCCW,
          ),
          IconButton(
            icon: const Icon(Icons.rotate_right),
            tooltip: 'Повернуть вправо 90°',
            onPressed: _rotateCW,
          ),
        ],
        bottom: building.floors.length > 1
            ? TabBar(
                controller: _tabController!,
                tabs: building.floors.map((f) => Tab(text: f.name)).toList(),
              )
            : null,
      ),
      body: TabBarView(
        controller: _tabController!,
        children: building.floors.asMap().entries.map((entry) {
          final idx = entry.key;
          final floor = entry.value;
          return _FloorView(
            key: ValueKey(floor.level),
            floor: floor,
            buildingId: building.id,
            transform: _transform,
            rotationIndex: _rotationIndex,
            fitted: _fittedFloors.contains(idx),
            onFitted: () => setState(() => _fittedFloors.add(idx)),
          );
        }).toList(),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: FilledButton.icon(
            onPressed: () => context.push(
              '/building/${widget.buildingId}/search?mode=from',
            ),
            icon: const Icon(Icons.directions),
            label: const Text('Построить маршрут'),
          ),
        ),
      ),
    );
  }
}

class _FloorView extends StatefulWidget {
  final Floor floor;
  final String buildingId;
  final TransformationController transform;
  final int rotationIndex;
  final bool fitted;
  final VoidCallback onFitted;

  const _FloorView({
    super.key,
    required this.floor,
    required this.buildingId,
    required this.transform,
    required this.rotationIndex,
    required this.fitted,
    required this.onFitted,
  });

  @override
  State<_FloorView> createState() => _FloorViewState();
}

class _FloorViewState extends State<_FloorView> {
  File? _imageFile;
  bool _autoFitScheduled = false;

  @override
  void initState() {
    super.initState();
    _loadImage();
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
    if (widget.fitted || _autoFitScheduled) return;
    _autoFitScheduled = true;

    double? minX, minY, maxX, maxY;

    final contours = widget.floor.contours;
    if (contours != null && contours.isNotEmpty) {
      for (final contour in contours) {
        for (final pt in contour) {
          minX = minX == null ? pt[0] : math.min(minX, pt[0]);
          minY = minY == null ? pt[1] : math.min(minY, pt[1]);
          maxX = maxX == null ? pt[0] : math.max(maxX, pt[0]);
          maxY = maxY == null ? pt[1] : math.max(maxY, pt[1]);
        }
      }
    } else {
      for (final node in widget.floor.nodes) {
        minX = minX == null ? node.x : math.min(minX, node.x);
        minY = minY == null ? node.y : math.min(minY, node.y);
        maxX = maxX == null ? node.x : math.max(maxX, node.x);
        maxY = maxY == null ? node.y : math.max(maxY, node.y);
      }
    }

    if (minX == null || minY == null || maxX == null || maxY == null) return;

    const pad = 600.0;
    final bMinX = (minX - pad) / _virtualW * constraints.maxWidth;
    final bMinY = (minY - pad) / _virtualH * constraints.maxHeight;
    final bMaxX = (maxX + pad) / _virtualW * constraints.maxWidth;
    final bMaxY = (maxY + pad) / _virtualH * constraints.maxHeight;
    final bW = bMaxX - bMinX;
    final bH = bMaxY - bMinY;
    if (bW <= 0 || bH <= 0) return;

    final s = math.min(constraints.maxWidth / bW, constraints.maxHeight / bH);
    final fitCx = (bMinX + bMaxX) / 2;
    final fitCy = (bMinY + bMaxY) / 2;
    final tx = constraints.maxWidth / 2 - s * fitCx;
    final ty = constraints.maxHeight / 2 - s * fitCy;
    final rot = widget.rotationIndex;
    final w = constraints.maxWidth;
    final h = constraints.maxHeight;

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final autoFit = Matrix4.identity()
        ..setEntry(0, 0, s)
        ..setEntry(1, 1, s)
        ..setEntry(0, 3, tx)
        ..setEntry(1, 3, ty);
      if (rot == 0) {
        widget.transform.value = autoFit;
      } else {
        final angle = rot * math.pi / 2;
        final rotM = Matrix4.identity()
          ..translateByDouble(w / 2, h / 2, 0, 1)
          ..rotateZ(angle)
          ..translateByDouble(-w / 2, -h / 2, 0, 1);
        widget.transform.value = rotM * autoFit;
      }
      widget.onFitted();
    });
  }

  @override
  Widget build(BuildContext context) {
    return InteractiveViewer(
      transformationController: widget.transform,
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
                stepsOnFloor: const [],
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
