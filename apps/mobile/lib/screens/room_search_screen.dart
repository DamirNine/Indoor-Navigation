import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../app_router.dart';
import '../models/building.dart';
import '../services/graph_service.dart';
import '../services/preferences_service.dart';
import '../services/routing_service.dart';
import '../services/storage_service.dart';

class RoomSearchScreen extends StatefulWidget {
  final String buildingId;
  final bool isSelectingOrigin;

  const RoomSearchScreen({
    super.key,
    required this.buildingId,
    required this.isSelectingOrigin,
  });

  @override
  State<RoomSearchScreen> createState() => _RoomSearchScreenState();
}

class _RoomSearchScreenState extends State<RoomSearchScreen> {
  Building? _building;
  List<NavNode> _filtered = [];
  final _controller = TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadBuilding();
    _controller.addListener(_filter);
  }

  @override
  void dispose() {
    _controller.dispose();
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
      _filtered = building.allNodes
          .where((n) => n.type == NodeType.room || n.type == NodeType.entrance)
          .toList();
    });
  }

  void _filter() {
    if (_building == null) return;
    final q = _controller.text.toLowerCase();
    setState(() {
      _filtered = _building!.allNodes
          .where((n) => n.type == NodeType.room || n.type == NodeType.entrance)
          .where((n) => n.label.toLowerCase().contains(q))
          .toList();
    });
  }

  void _onNodeSelected(NavNode node) {
    if (widget.isSelectingOrigin) {
      context.push(
        '/building/${widget.buildingId}/search?mode=to',
        extra: node,
      );
    } else {
      final origin = GoRouterState.of(context).extra as NavNode?;
      if (origin == null || _building == null) return;

      if (origin.id == node.id) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Вы уже здесь')),
        );
        return;
      }

      final pref = context.read<PreferencesService>().preference;
      final route = context.read<RoutingService>().findRoute(
        building: _building!,
        fromId: origin.id,
        toId: node.id,
        preference: pref,
      );

      if (route == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Маршрут не найден')),
        );
        return;
      }

      context.go(
        '/route',
        extra: RouteScreenArgs(route: route, building: _building!),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: widget.isSelectingOrigin
              ? () => context.go('/')
              : () => context.pop(),
        ),
        title: Text(widget.isSelectingOrigin ? 'Откуда?' : 'Куда?'),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: SearchBar(
              controller: _controller,
              hintText: 'Поиск кабинета...',
              leading: const Icon(Icons.search),
            ),
          ),
          Expanded(
            child: _building == null
                ? const Center(child: CircularProgressIndicator())
                : ListView.builder(
                    itemCount: _filtered.length,
                    itemBuilder: (ctx, i) {
                      final node = _filtered[i];
                      return ListTile(
                        title: Text(node.label),
                        subtitle: Text('${node.floor} этаж'),
                        onTap: () => _onNodeSelected(node),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}
