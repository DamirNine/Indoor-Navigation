import 'dart:io';
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
              builder: (_) => RouteInstructionsSheet(route: widget.route),
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

class _FloorViewState extends State<_FloorView> {
  File? _imageFile;
  Size? _imageSize;

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
    final bytes = await f.readAsBytes();
    final decoded = await decodeImageFromList(bytes);
    if (!mounted) return;
    setState(() {
      _imageFile = f;
      _imageSize = Size(
        decoded.width.toDouble(),
        decoded.height.toDouble(),
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    return InteractiveViewer(
      child: LayoutBuilder(builder: (ctx, constraints) {
        final mapSize = _imageSize ?? const Size(800, 600);
        return Stack(
          children: [
            if (_imageFile != null)
              Image.file(_imageFile!,
                  width: constraints.maxWidth,
                  height: constraints.maxHeight,
                  fit: BoxFit.contain)
            else
              Container(color: Colors.grey.shade200),
            CustomPaint(
              size: Size(constraints.maxWidth, constraints.maxHeight),
              painter: FloorMapPainter(
                nodes: widget.floor.nodes,
                stepsOnFloor: widget.steps,
                imageSize: mapSize,
              ),
            ),
          ],
        );
      }),
    );
  }
}
