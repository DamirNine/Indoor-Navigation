import 'dart:io';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import '../models/building.dart';
import '../services/graph_service.dart';
import '../services/storage_service.dart';
import '../widgets/floor_map_painter.dart';

const _virtualSize = Size(5000, 4000);

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
          return _FloorView(
            floor: floor,
            buildingId: building.id,
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
  const _FloorView({required this.floor, required this.buildingId});

  @override
  State<_FloorView> createState() => _FloorViewState();
}

class _FloorViewState extends State<_FloorView> {
  File? _imageFile;

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

  @override
  Widget build(BuildContext context) {
    return InteractiveViewer(
      child: LayoutBuilder(builder: (ctx, constraints) {
        return Stack(
          children: [
            if (_imageFile != null)
              Image.file(
                _imageFile!,
                width: constraints.maxWidth,
                height: constraints.maxHeight,
                fit: BoxFit.fill,
              )
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
