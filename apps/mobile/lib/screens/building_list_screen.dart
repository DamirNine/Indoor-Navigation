import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../models/building.dart';
import '../services/graph_service.dart';
import '../services/import_service.dart';
import '../services/storage_service.dart';

class BuildingListScreen extends StatefulWidget {
  const BuildingListScreen({super.key});
  @override
  State<BuildingListScreen> createState() => _BuildingListScreenState();
}

class _BuildingListScreenState extends State<BuildingListScreen> {
  List<Building> _buildings = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadBuildings();
  }

  Future<void> _loadBuildings() async {
    final storage = context.read<StorageService>();
    final graph = context.read<GraphService>();
    final ids = await storage.listBuildingIds();
    final buildings = <Building>[];
    for (final id in ids) {
      final json = await storage.loadBuilding(id);
      if (json != null) buildings.add(graph.parseBuilding(json));
    }
    if (mounted) {
      setState(() {
        _buildings = buildings;
        _loading = false;
      });
    }
  }

  Future<void> _import() async {
    final importer = context.read<ImportService>();
    try {
      final building = await importer.importFromPicker();
      if (building != null) await _loadBuildings();
    } on FormatException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Ошибка: ${e.message}')),
      );
    }
  }

  Future<void> _delete(String id, String name) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Удалить здание?'),
        content: Text('«$name» будет удалено без возможности восстановления.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Отмена'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Удалить'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    await context.read<StorageService>().deleteBuilding(id);
    await _loadBuildings();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Здания'),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings),
            onPressed: () => context.push('/settings'),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _buildings.isEmpty
              ? _EmptyState(onImport: _import)
              : ListView.builder(
                  itemCount: _buildings.length,
                  itemBuilder: (ctx, i) {
                    final b = _buildings[i];
                    return ListTile(
                      title: Text(b.name),
                      subtitle: Text('${b.floors.length} этаж(ей)'),
                      trailing: IconButton(
                        icon: const Icon(Icons.delete_outline),
                        onPressed: () => _delete(b.id, b.name),
                      ),
                      onTap: () =>
                          context.push('/building/${b.id}/search?mode=from'),
                    );
                  },
                ),
      floatingActionButton: _buildings.isNotEmpty
          ? FloatingActionButton.extended(
              onPressed: _import,
              icon: const Icon(Icons.add),
              label: const Text('Импорт'),
            )
          : null,
    );
  }
}

class _EmptyState extends StatelessWidget {
  final VoidCallback onImport;
  const _EmptyState({required this.onImport});

  @override
  Widget build(BuildContext context) => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.map_outlined, size: 64, color: Colors.grey),
            const SizedBox(height: 16),
            const Text('Нет загруженных зданий',
                style: TextStyle(fontSize: 18)),
            const SizedBox(height: 8),
            const Text(
              'Импортируйте файл building.json или building.zip',
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: onImport,
              icon: const Icon(Icons.upload_file),
              label: const Text('Импортировать здание'),
            ),
          ],
        ),
      );
}
