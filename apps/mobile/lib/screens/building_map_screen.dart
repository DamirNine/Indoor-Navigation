import 'dart:io';
import 'dart:math';
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

  @override
  void initState() {
    super.initState();
    _loadBuilding();
  }

  @override
  void dispose() {
    _tabController?.dispose();
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
        bottom: building.floors.length > 1
            ? TabBar(
                controller: _tabController!,
                tabs: building.floors.map((f) => Tab(text: f.name)).toList(),
              )
            : null,
      ),
      body: TabBarView(
        controller: _tabController!,
        children: building.floors.map((floor) {
          return _FloorView(floor: floor, buildingId: building.id);
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
  const _FloorView({required this.floor, required this.buildingId});

  @override
  State<_FloorView> createState() => _FloorViewState();
}

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
    final f = File('${dir.path}/buildings/${widget.buildingId}/${widget.floor.image}');
    if (!await f.exists() || !mounted) return;
    setState(() => _imageFile = f);
  }

  void _maybeInitTransform(BoxConstraints constraints) {
    if (_transformSet) return;

    double? minX, minY, maxX, maxY;

    final contour = widget.floor.contour;
    if (contour != null && contour.length >= 3) {
      for (final pt in contour) {
        minX = minX == null ? pt[0] : min(minX, pt[0]);
        minY = minY == null ? pt[1] : min(minY, pt[1]);
        maxX = maxX == null ? pt[0] : max(maxX, pt[0]);
        maxY = maxY == null ? pt[1] : max(maxY, pt[1]);
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

    final x0 = minX;
    final y0 = minY;
    final x1 = maxX;
    final y1 = maxY;

    const pad = 600.0;
    final bMinX = (x0 - pad) / _virtualW * constraints.maxWidth;
    final bMinY = (y0 - pad) / _virtualH * constraints.maxHeight;
    final bMaxX = (x1 + pad) / _virtualW * constraints.maxWidth;
    final bMaxY = (y1 + pad) / _virtualH * constraints.maxHeight;

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
                stepsOnFloor: const [],
                imageSize: _virtualSize,
                contour: widget.floor.contour,
              ),
            ),
          ],
        );
      }),
    );
  }
}
