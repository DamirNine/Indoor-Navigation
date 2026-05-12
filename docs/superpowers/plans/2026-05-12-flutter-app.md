# Indoor Navigation — Flutter App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fully-offline Flutter app (Android + iOS) for indoor navigation — user selects building, picks current room and destination, gets a step-by-step route accounting for stairs, elevators and accessibility preferences.

**Architecture:** 5 services (GraphService, RoutingService, StorageService, ImportService, PreferencesService) provide business logic. 5 screens wired by go_router. Provider for shared state. Buildings stored as raw JSON strings in Hive; floor plan images in app documents directory.

**Tech Stack:** Flutter 3.x · Dart 3 · hive_flutter · file_picker · archive · collection · shared_preferences · go_router · provider

---

## File Map

```
apps/mobile/
  lib/
    main.dart
    app_router.dart
    models/
      building.dart        # Building, Floor, NavNode, NavEdge, CrossFloorEdge, NodeType, EdgeType
      route.dart           # RouteStep, AppRoute
    services/
      graph_service.dart   # JSON → Building, validation
      routing_service.dart # A* / Dijkstra with preference weights
      storage_service.dart # Hive: save/load/list/delete buildings
      import_service.dart  # file_picker + zip extraction
      preferences_service.dart  # route preference (ChangeNotifier)
    screens/
      building_list_screen.dart
      room_search_screen.dart   # shared "from" and "to" picker
      route_screen.dart         # map + floor tabs
      settings_screen.dart
    widgets/
      floor_map_painter.dart    # CustomPainter
      route_instructions_sheet.dart
  test/
    services/
      graph_service_test.dart
      routing_service_test.dart
      storage_service_test.dart
```

---

### Task 1: Project setup

**Files:**
- Create: `apps/mobile/` (Flutter project)
- Modify: `apps/mobile/pubspec.yaml`

- [ ] **Step 1: Create Flutter project**

```bash
cd d:/Claude/Navigation
flutter create --org com.indoor --project-name indoor_nav apps/mobile
```

Expected: Flutter project created.

- [ ] **Step 2: Replace pubspec.yaml**

```yaml
name: indoor_nav
description: Offline indoor navigation
publish_to: 'none'
version: 1.0.0+1

environment:
  sdk: '>=3.0.0 <4.0.0'

dependencies:
  flutter:
    sdk: flutter
  hive: ^2.2.3
  hive_flutter: ^1.1.0
  file_picker: ^8.0.0
  archive: ^3.6.0
  collection: ^1.18.0
  shared_preferences: ^2.3.0
  go_router: ^14.2.0
  provider: ^6.1.2
  path_provider: ^2.1.3

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^4.0.0
  mockito: ^5.4.4
  build_runner: ^2.4.11
```

- [ ] **Step 3: Install dependencies**

```bash
cd apps/mobile && flutter pub get
```

Expected: Resolving dependencies... Got dependencies!

- [ ] **Step 4: Verify project runs**

```bash
flutter analyze
```

Expected: No issues found.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile
git commit -m "feat: scaffold Flutter indoor nav project"
```

---

### Task 2: Data models

**Files:**
- Create: `apps/mobile/lib/models/building.dart`
- Create: `apps/mobile/lib/models/route.dart`
- Create: `apps/mobile/test/models/building_test.dart`

- [ ] **Step 1: Write failing test**

```dart
// apps/mobile/test/models/building_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:indoor_nav/models/building.dart';

void main() {
  test('NavNode.fromJson sets floor from parameter', () {
    final node = NavNode.fromJson(
      {'id': 'r1', 'type': 'room', 'label': 'Room 1', 'x': 10.0, 'y': 20.0},
      floor: 3,
    );
    expect(node.id, 'r1');
    expect(node.type, NodeType.room);
    expect(node.floor, 3);
    expect(node.x, 10.0);
  });

  test('Building.fromJson parses floors and cross_floor_edges', () {
    final b = Building.fromJson({
      'id': 'b1',
      'name': 'Корпус А',
      'floors': [
        {
          'level': 1,
          'name': '1 этаж',
          'nodes': [
            {'id': 'a', 'type': 'room', 'label': 'A', 'x': 0.0, 'y': 0.0},
            {'id': 's1', 'type': 'stairs', 'label': 'Stairs', 'x': 10.0, 'y': 0.0},
          ],
          'edges': [
            {'from': 'a', 'to': 's1', 'type': 'walk', 'weight': 10.0},
          ],
        },
      ],
      'cross_floor_edges': [
        {'from': 's1', 'to': 's2', 'type': 'stairs', 'weight': 5.0},
      ],
    });
    expect(b.id, 'b1');
    expect(b.floors[0].nodes[0].floor, 1);
    expect(b.crossFloorEdges[0].type, EdgeType.stairs);
  });
}
```

- [ ] **Step 2: Run — verify it fails**

```bash
cd apps/mobile && flutter test test/models/building_test.dart
```

Expected: FAILED — building.dart not found.

- [ ] **Step 3: Create building.dart**

```dart
// apps/mobile/lib/models/building.dart

enum NodeType { room, stairs, elevator, entrance }
enum EdgeType { walk, stairs, elevator }

class NavNode {
  final String id;
  final NodeType type;
  final String label;
  final double x;
  final double y;
  final int floor;

  const NavNode({
    required this.id,
    required this.type,
    required this.label,
    required this.x,
    required this.y,
    required this.floor,
  });

  factory NavNode.fromJson(Map<String, dynamic> json, {required int floor}) =>
      NavNode(
        id: json['id'] as String,
        type: NodeType.values.byName(json['type'] as String),
        label: json['label'] as String,
        x: (json['x'] as num).toDouble(),
        y: (json['y'] as num).toDouble(),
        floor: floor,
      );
}

class NavEdge {
  final String from;
  final String to;
  final EdgeType type;
  final double weight;

  const NavEdge({
    required this.from,
    required this.to,
    required this.type,
    required this.weight,
  });

  factory NavEdge.fromJson(Map<String, dynamic> json) => NavEdge(
        from: json['from'] as String,
        to: json['to'] as String,
        type: EdgeType.values.byName(json['type'] as String),
        weight: (json['weight'] as num).toDouble(),
      );
}

class CrossFloorEdge {
  final String from;
  final String to;
  final EdgeType type;
  final double weight;

  const CrossFloorEdge({
    required this.from,
    required this.to,
    required this.type,
    required this.weight,
  });

  factory CrossFloorEdge.fromJson(Map<String, dynamic> json) => CrossFloorEdge(
        from: json['from'] as String,
        to: json['to'] as String,
        type: EdgeType.values.byName(json['type'] as String),
        weight: (json['weight'] as num).toDouble(),
      );
}

class Floor {
  final int level;
  final String name;
  final String? image;
  final List<NavNode> nodes;
  final List<NavEdge> edges;

  const Floor({
    required this.level,
    required this.name,
    this.image,
    required this.nodes,
    required this.edges,
  });

  factory Floor.fromJson(Map<String, dynamic> json) {
    final level = json['level'] as int;
    return Floor(
      level: level,
      name: json['name'] as String,
      image: json['image'] as String?,
      nodes: (json['nodes'] as List)
          .map((n) => NavNode.fromJson(n as Map<String, dynamic>, floor: level))
          .toList(),
      edges: (json['edges'] as List)
          .map((e) => NavEdge.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

class Building {
  final String id;
  final String name;
  final List<Floor> floors;
  final List<CrossFloorEdge> crossFloorEdges;

  const Building({
    required this.id,
    required this.name,
    required this.floors,
    required this.crossFloorEdges,
  });

  factory Building.fromJson(Map<String, dynamic> json) => Building(
        id: json['id'] as String,
        name: json['name'] as String,
        floors: (json['floors'] as List)
            .map((f) => Floor.fromJson(f as Map<String, dynamic>))
            .toList(),
        crossFloorEdges: (json['cross_floor_edges'] as List? ?? [])
            .map((e) => CrossFloorEdge.fromJson(e as Map<String, dynamic>))
            .toList(),
      );

  List<NavNode> get allNodes =>
      floors.expand((f) => f.nodes).toList();
}
```

- [ ] **Step 4: Create route.dart**

```dart
// apps/mobile/lib/models/route.dart
import 'building.dart';

class RouteStep {
  final NavNode from;
  final NavNode to;
  final EdgeType edgeType;
  final double weight;

  const RouteStep({
    required this.from,
    required this.to,
    required this.edgeType,
    required this.weight,
  });

  String get description => switch (edgeType) {
        EdgeType.walk => 'Идите до «${to.label}»',
        EdgeType.stairs =>
          'По лестнице на ${to.floor} этаж → «${to.label}»',
        EdgeType.elevator =>
          'Лифт на ${to.floor} этаж → «${to.label}»',
      };
}

class AppRoute {
  final List<RouteStep> steps;
  final double totalWeight;

  const AppRoute({required this.steps, required this.totalWeight});
}
```

- [ ] **Step 5: Run tests — verify pass**

```bash
flutter test test/models/building_test.dart
```

Expected: All tests passed!

- [ ] **Step 6: Commit**

```bash
git add lib/models test/models
git commit -m "feat: add Building and Route data models with fromJson"
```

---

### Task 3: GraphService

**Files:**
- Create: `apps/mobile/lib/services/graph_service.dart`
- Create: `apps/mobile/test/services/graph_service_test.dart`

- [ ] **Step 1: Write failing tests**

```dart
// apps/mobile/test/services/graph_service_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:indoor_nav/services/graph_service.dart';

const _validJson = '''
{
  "id": "b1", "name": "Test",
  "floors": [{
    "level": 1, "name": "F1",
    "nodes": [
      {"id": "a", "type": "room", "label": "A", "x": 0, "y": 0},
      {"id": "b", "type": "room", "label": "B", "x": 10, "y": 0}
    ],
    "edges": [{"from": "a", "to": "b", "type": "walk", "weight": 10.0}]
  }],
  "cross_floor_edges": []
}
''';

void main() {
  late GraphService sut;
  setUp(() => sut = GraphService());

  test('parses valid JSON into Building', () {
    final b = sut.parseBuilding(_validJson);
    expect(b.id, 'b1');
    expect(b.floors[0].nodes.length, 2);
  });

  test('throws FormatException for duplicate node IDs', () {
    const json = '''{"id":"b","name":"B","floors":[{"level":1,"name":"F","nodes":[
      {"id":"a","type":"room","label":"A","x":0,"y":0},
      {"id":"a","type":"room","label":"A2","x":5,"y":0}
    ],"edges":[]}],"cross_floor_edges":[]}''';
    expect(() => sut.parseBuilding(json), throwsA(isA<FormatException>()));
  });

  test('throws FormatException for unknown edge endpoint', () {
    const json = '''{"id":"b","name":"B","floors":[{"level":1,"name":"F","nodes":[
      {"id":"a","type":"room","label":"A","x":0,"y":0}
    ],"edges":[{"from":"a","to":"ghost","type":"walk","weight":5.0}]}],"cross_floor_edges":[]}''';
    expect(() => sut.parseBuilding(json), throwsA(isA<FormatException>()));
  });

  test('throws FormatException for invalid JSON', () {
    expect(() => sut.parseBuilding('not json'), throwsA(isA<FormatException>()));
  });
}
```

- [ ] **Step 2: Run — verify it fails**

```bash
flutter test test/services/graph_service_test.dart
```

Expected: FAILED.

- [ ] **Step 3: Implement GraphService**

```dart
// apps/mobile/lib/services/graph_service.dart
import 'dart:convert';
import '../models/building.dart';

class GraphService {
  Building parseBuilding(String jsonString) {
    final Map<String, dynamic> json;
    try {
      json = jsonDecode(jsonString) as Map<String, dynamic>;
    } catch (e) {
      throw FormatException('Invalid JSON: $e');
    }
    final building = Building.fromJson(json);
    _validate(building);
    return building;
  }

  void _validate(Building building) {
    final allIds = <String>{};
    for (final floor in building.floors) {
      for (final node in floor.nodes) {
        if (!allIds.add(node.id)) {
          throw FormatException('Duplicate node ID: ${node.id}');
        }
      }
    }
    void checkEdge(String from, String to) {
      if (!allIds.contains(from)) throw FormatException('Unknown node: $from');
      if (!allIds.contains(to)) throw FormatException('Unknown node: $to');
    }
    for (final floor in building.floors) {
      for (final e in floor.edges) checkEdge(e.from, e.to);
    }
    for (final e in building.crossFloorEdges) checkEdge(e.from, e.to);
  }
}
```

- [ ] **Step 4: Run tests — verify pass**

```bash
flutter test test/services/graph_service_test.dart
```

Expected: All tests passed!

- [ ] **Step 5: Commit**

```bash
git add lib/services/graph_service.dart test/services/graph_service_test.dart
git commit -m "feat: add GraphService with JSON parsing and validation"
```

---

### Task 4: RoutingService

**Files:**
- Create: `apps/mobile/lib/services/routing_service.dart`
- Create: `apps/mobile/test/services/routing_service_test.dart`

- [ ] **Step 1: Write failing tests**

```dart
// apps/mobile/test/services/routing_service_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:indoor_nav/services/graph_service.dart';
import 'package:indoor_nav/services/routing_service.dart';
import 'package:indoor_nav/models/building.dart';

const _twoFloorJson = '''
{
  "id": "b1", "name": "B",
  "floors": [
    {"level": 1, "name": "F1", "nodes": [
      {"id": "r101", "type": "room", "label": "101", "x": 0, "y": 0},
      {"id": "st-f1", "type": "stairs", "label": "Stairs", "x": 50, "y": 0},
      {"id": "el-f1", "type": "elevator", "label": "Elevator", "x": 60, "y": 0}
    ], "edges": [
      {"from": "r101", "to": "st-f1", "type": "walk", "weight": 50.0},
      {"from": "r101", "to": "el-f1", "type": "walk", "weight": 50.0}
    ]},
    {"level": 2, "name": "F2", "nodes": [
      {"id": "st-f2", "type": "stairs", "label": "Stairs", "x": 50, "y": 0},
      {"id": "el-f2", "type": "elevator", "label": "Elevator", "x": 60, "y": 0},
      {"id": "r201", "type": "room", "label": "201", "x": 0, "y": 0}
    ], "edges": [
      {"from": "st-f2", "to": "r201", "type": "walk", "weight": 50.0},
      {"from": "el-f2", "to": "r201", "type": "walk", "weight": 50.0}
    ]}
  ],
  "cross_floor_edges": [
    {"from": "st-f1", "to": "st-f2", "type": "stairs", "weight": 10.0},
    {"from": "el-f1", "to": "el-f2", "type": "elevator", "weight": 10.0}
  ]
}
''';

void main() {
  late RoutingService sut;
  late Building building;

  setUp(() {
    sut = RoutingService();
    building = GraphService().parseBuilding(_twoFloorJson);
  });

  test('finds same-floor route', () {
    final route = sut.findRoute(
      building: building, fromId: 'r101', toId: 'st-f1',
      preference: RoutePreference.noPreference,
    );
    expect(route, isNotNull);
    expect(route!.steps.length, 1);
    expect(route.steps[0].edgeType, EdgeType.walk);
  });

  test('finds cross-floor route (3 steps: walk→stairs→walk)', () {
    final route = sut.findRoute(
      building: building, fromId: 'r101', toId: 'r201',
      preference: RoutePreference.noPreference,
    );
    expect(route, isNotNull);
    expect(route!.steps.length, 3);
  });

  test('returns empty steps when from == to', () {
    final route = sut.findRoute(
      building: building, fromId: 'r101', toId: 'r101',
      preference: RoutePreference.noPreference,
    );
    expect(route!.steps, isEmpty);
  });

  test('returns null when no path exists', () {
    final isolated = GraphService().parseBuilding('{"id":"b","name":"B","floors":[{"level":1,"name":"F","nodes":[{"id":"a","type":"room","label":"A","x":0,"y":0},{"id":"b","type":"room","label":"B","x":10,"y":0}],"edges":[]}],"cross_floor_edges":[]}');
    final route = sut.findRoute(
      building: isolated, fromId: 'a', toId: 'b',
      preference: RoutePreference.noPreference,
    );
    expect(route, isNull);
  });

  test('elevator preference uses elevator not stairs', () {
    final route = sut.findRoute(
      building: building, fromId: 'r101', toId: 'r201',
      preference: RoutePreference.elevator,
    );
    expect(route!.steps.any((s) => s.edgeType == EdgeType.elevator), isTrue);
    expect(route.steps.any((s) => s.edgeType == EdgeType.stairs), isFalse);
  });

  test('stairs preference uses stairs not elevator', () {
    final route = sut.findRoute(
      building: building, fromId: 'r101', toId: 'r201',
      preference: RoutePreference.stairs,
    );
    expect(route!.steps.any((s) => s.edgeType == EdgeType.stairs), isTrue);
    expect(route.steps.any((s) => s.edgeType == EdgeType.elevator), isFalse);
  });
}
```

- [ ] **Step 2: Run — verify it fails**

```bash
flutter test test/services/routing_service_test.dart
```

Expected: FAILED.

- [ ] **Step 3: Implement RoutingService**

```dart
// apps/mobile/lib/services/routing_service.dart
import 'package:collection/collection.dart';
import '../models/building.dart';
import '../models/route.dart';

enum RoutePreference { elevator, stairs, noPreference }

class _Edge {
  final String to;
  final EdgeType edgeType;
  final double weight;
  const _Edge(this.to, this.edgeType, this.weight);
}

class RoutingService {
  AppRoute? findRoute({
    required Building building,
    required String fromId,
    required String toId,
    required RoutePreference preference,
  }) {
    if (fromId == toId) return AppRoute(steps: [], totalWeight: 0);

    final nodeMap = {for (final n in building.allNodes) n.id: n};
    if (!nodeMap.containsKey(fromId) || !nodeMap.containsKey(toId)) return null;

    // Build undirected adjacency list
    final adj = <String, List<_Edge>>{};
    void addBoth(String a, String b, EdgeType type, double base) {
      final w = _applyPref(base, type, preference);
      adj.putIfAbsent(a, () => []).add(_Edge(b, type, w));
      adj.putIfAbsent(b, () => []).add(_Edge(a, type, w));
    }
    for (final floor in building.floors) {
      for (final e in floor.edges) addBoth(e.from, e.to, e.type, e.weight);
    }
    for (final e in building.crossFloorEdges) {
      addBoth(e.from, e.to, e.type, e.weight);
    }

    // Dijkstra
    final dist = <String, double>{fromId: 0.0};
    final prev = <String, String>{};
    final prevEdge = <String, _Edge>{};
    final queue = PriorityQueue<(double, String)>(
      (a, b) => a.$1.compareTo(b.$1),
    );
    queue.add((0.0, fromId));

    while (queue.isNotEmpty) {
      final (d, u) = queue.removeFirst();
      if (d > (dist[u] ?? double.infinity)) continue;
      if (u == toId) break;
      for (final e in adj[u] ?? []) {
        final nd = d + e.weight;
        if (nd < (dist[e.to] ?? double.infinity)) {
          dist[e.to] = nd;
          prev[e.to] = u;
          prevEdge[e.to] = e;
          queue.add((nd, e.to));
        }
      }
    }

    if (!prev.containsKey(toId)) return null;

    // Reconstruct path
    final path = <String>[];
    var cur = toId;
    while (cur != fromId) {
      path.add(cur);
      cur = prev[cur]!;
    }
    path.add(fromId);

    final steps = <RouteStep>[];
    final ordered = path.reversed.toList();
    for (var i = 0; i < ordered.length - 1; i++) {
      final edge = prevEdge[ordered[i + 1]]!;
      steps.add(RouteStep(
        from: nodeMap[ordered[i]]!,
        to: nodeMap[ordered[i + 1]]!,
        edgeType: edge.edgeType,
        weight: edge.weight,
      ));
    }

    return AppRoute(steps: steps, totalWeight: dist[toId] ?? 0);
  }

  double _applyPref(double base, EdgeType type, RoutePreference pref) =>
      base *
      switch ((type, pref)) {
        (EdgeType.stairs, RoutePreference.elevator) => 3.0,
        (EdgeType.stairs, RoutePreference.stairs) => 0.5,
        (EdgeType.elevator, RoutePreference.elevator) => 0.5,
        (EdgeType.elevator, RoutePreference.stairs) => 3.0,
        _ => 1.0,
      };
}
```

- [ ] **Step 4: Run tests — verify pass**

```bash
flutter test test/services/routing_service_test.dart
```

Expected: All tests passed!

- [ ] **Step 5: Commit**

```bash
git add lib/services/routing_service.dart test/services/routing_service_test.dart
git commit -m "feat: add RoutingService with Dijkstra and accessibility preferences"
```

---

### Task 5: StorageService and PreferencesService

**Files:**
- Create: `apps/mobile/lib/services/storage_service.dart`
- Create: `apps/mobile/lib/services/preferences_service.dart`
- Create: `apps/mobile/test/services/storage_service_test.dart`

- [ ] **Step 1: Write failing test for StorageService**

```dart
// apps/mobile/test/services/storage_service_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:indoor_nav/services/storage_service.dart';

void main() {
  late StorageService sut;

  setUp(() async {
    Hive.init('test_hive_${DateTime.now().millisecondsSinceEpoch}');
    sut = StorageService();
    await sut.init();
  });

  tearDown(() async => Hive.deleteFromDisk());

  test('saves and loads building JSON', () async {
    await sut.saveBuilding('b1', '{"id":"b1"}');
    expect(await sut.loadBuilding('b1'), '{"id":"b1"}');
  });

  test('listBuildingIds returns saved IDs', () async {
    await sut.saveBuilding('b1', '{}');
    await sut.saveBuilding('b2', '{}');
    final ids = await sut.listBuildingIds();
    expect(ids, containsAll(['b1', 'b2']));
  });

  test('deleteBuilding removes it', () async {
    await sut.saveBuilding('b1', '{}');
    await sut.deleteBuilding('b1');
    expect(await sut.loadBuilding('b1'), isNull);
  });
}
```

- [ ] **Step 2: Run — verify it fails**

```bash
flutter test test/services/storage_service_test.dart
```

Expected: FAILED.

- [ ] **Step 3: Implement StorageService**

```dart
// apps/mobile/lib/services/storage_service.dart
import 'package:hive_flutter/hive_flutter.dart';

class StorageService {
  static const _boxName = 'buildings';

  Future<void> init() async => Hive.openBox<String>(_boxName);

  Box<String> get _box => Hive.box<String>(_boxName);

  Future<void> saveBuilding(String id, String json) =>
      _box.put(id, json);

  Future<String?> loadBuilding(String id) async => _box.get(id);

  Future<List<String>> listBuildingIds() async =>
      _box.keys.cast<String>().toList();

  Future<void> deleteBuilding(String id) => _box.delete(id);
}
```

- [ ] **Step 4: Run tests — verify pass**

```bash
flutter test test/services/storage_service_test.dart
```

Expected: All tests passed!

- [ ] **Step 5: Implement PreferencesService**

```dart
// apps/mobile/lib/services/preferences_service.dart
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'routing_service.dart';

class PreferencesService extends ChangeNotifier {
  static const _key = 'route_preference';
  late SharedPreferences _prefs;

  RoutePreference _preference = RoutePreference.noPreference;
  RoutePreference get preference => _preference;

  Future<void> init() async {
    _prefs = await SharedPreferences.getInstance();
    final saved = _prefs.getString(_key);
    if (saved != null) {
      _preference = RoutePreference.values.byName(saved);
    }
  }

  Future<void> setPreference(RoutePreference value) async {
    _preference = value;
    await _prefs.setString(_key, value.name);
    notifyListeners();
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add lib/services/storage_service.dart lib/services/preferences_service.dart test/services/storage_service_test.dart
git commit -m "feat: add StorageService (Hive) and PreferencesService"
```

---

### Task 6: ImportService

**Files:**
- Create: `apps/mobile/lib/services/import_service.dart`

- [ ] **Step 1: Implement ImportService**

```dart
// apps/mobile/lib/services/import_service.dart
import 'dart:io';
import 'dart:typed_data';
import 'package:archive/archive.dart';
import 'package:file_picker/file_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'dart:convert';
import 'graph_service.dart';
import 'storage_service.dart';
import '../models/building.dart';

class ImportService {
  final GraphService _graphService;
  final StorageService _storageService;

  ImportService(this._graphService, this._storageService);

  /// Returns parsed Building on success, null if user cancelled.
  /// Throws FormatException if file is invalid.
  Future<Building?> importFromPicker() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['json', 'zip'],
      withData: true,
    );
    if (result == null || result.files.isEmpty) return null;

    final file = result.files.first;
    final bytes = file.bytes ?? await File(file.path!).readAsBytes();

    String jsonString;
    Map<String, Uint8List> images = {};

    if (file.extension == 'zip') {
      (jsonString, images) = _extractZip(bytes);
    } else {
      jsonString = utf8.decode(bytes);
    }

    final building = _graphService.parseBuilding(jsonString);

    if (images.isNotEmpty) {
      final dir = await getApplicationDocumentsDirectory();
      final buildingDir =
          Directory('${dir.path}/buildings/${building.id}');
      await buildingDir.create(recursive: true);
      for (final entry in images.entries) {
        await File('${buildingDir.path}/${entry.key}')
            .writeAsBytes(entry.value);
      }
    }

    await _storageService.saveBuilding(building.id, jsonString);
    return building;
  }

  (String, Map<String, Uint8List>) _extractZip(Uint8List bytes) {
    final archive = ZipDecoder().decodeBytes(bytes);
    String? jsonString;
    final images = <String, Uint8List>{};

    for (final file in archive) {
      if (!file.isFile) continue;
      final name = file.name.split('/').last;
      if (name.endsWith('.json')) {
        jsonString = utf8.decode(file.content as List<int>);
      } else if (name.endsWith('.png') || name.endsWith('.jpg')) {
        images[name] = Uint8List.fromList(file.content as List<int>);
      }
    }

    if (jsonString == null) {
      throw const FormatException('No JSON file found in ZIP');
    }
    return (jsonString, images);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/services/import_service.dart
git commit -m "feat: add ImportService for JSON and ZIP building files"
```

---

### Task 7: App wiring (main.dart + router)

**Files:**
- Modify: `apps/mobile/lib/main.dart`
- Create: `apps/mobile/lib/app_router.dart`

- [ ] **Step 1: Update main.dart**

```dart
// apps/mobile/lib/main.dart
import 'package:flutter/material.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:provider/provider.dart';
import 'app_router.dart';
import 'services/graph_service.dart';
import 'services/import_service.dart';
import 'services/preferences_service.dart';
import 'services/routing_service.dart';
import 'services/storage_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Hive.initFlutter();
  final storage = StorageService();
  await storage.init();
  final prefs = PreferencesService();
  await prefs.init();
  final graph = GraphService();
  final routing = RoutingService();
  final importer = ImportService(graph, storage);

  runApp(
    MultiProvider(
      providers: [
        Provider.value(value: storage),
        Provider.value(value: graph),
        Provider.value(value: routing),
        Provider.value(value: importer),
        ChangeNotifierProvider.value(value: prefs),
      ],
      child: const IndoorNavApp(),
    ),
  );
}

class IndoorNavApp extends StatelessWidget {
  const IndoorNavApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp.router(
        title: 'Indoor Nav',
        routerConfig: appRouter,
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: Colors.indigo),
          useMaterial3: true,
        ),
      );
}
```

- [ ] **Step 2: Create app_router.dart**

```dart
// apps/mobile/lib/app_router.dart
import 'package:go_router/go_router.dart';
import 'models/building.dart';
import 'models/route.dart';
import 'screens/building_list_screen.dart';
import 'screens/room_search_screen.dart';
import 'screens/route_screen.dart';
import 'screens/settings_screen.dart';

class RouteScreenArgs {
  final AppRoute route;
  final Building building;
  const RouteScreenArgs({required this.route, required this.building});
}

final appRouter = GoRouter(
  routes: [
    GoRoute(
      path: '/',
      builder: (ctx, state) => const BuildingListScreen(),
    ),
    GoRoute(
      path: '/building/:id/search',
      builder: (ctx, state) => RoomSearchScreen(
        buildingId: state.pathParameters['id']!,
        isSelectingOrigin:
            state.uri.queryParameters['mode'] == 'from',
      ),
    ),
    GoRoute(
      path: '/route',
      builder: (ctx, state) {
        final args = state.extra! as RouteScreenArgs;
        return RouteScreen(route: args.route, building: args.building);
      },
    ),
    GoRoute(
      path: '/settings',
      builder: (ctx, state) => const SettingsScreen(),
    ),
  ],
);
```

- [ ] **Step 3: Verify compile**

```bash
flutter analyze
```

Expected: No issues found (or only info-level hints).

- [ ] **Step 4: Commit**

```bash
git add lib/main.dart lib/app_router.dart
git commit -m "feat: wire services into Provider and configure go_router"
```

---

### Task 8: BuildingListScreen

**Files:**
- Modify: `apps/mobile/lib/screens/building_list_screen.dart`

- [ ] **Step 1: Implement BuildingListScreen**

```dart
// apps/mobile/lib/screens/building_list_screen.dart
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
    if (mounted) setState(() { _buildings = buildings; _loading = false; });
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

  Future<void> _delete(String id) async {
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
                        onPressed: () => _delete(b.id),
                      ),
                      onTap: () => context.push(
                        '/building/${b.id}/search?mode=from',
                      ),
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
            const Text('Импортируйте файл building.json или building.zip',
                textAlign: TextAlign.center),
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
```

- [ ] **Step 2: Verify no analysis errors**

```bash
flutter analyze lib/screens/building_list_screen.dart
```

Expected: No issues.

- [ ] **Step 3: Commit**

```bash
git add lib/screens/building_list_screen.dart
git commit -m "feat: implement BuildingListScreen with import and delete"
```

---

### Task 9: RoomSearchScreen

**Files:**
- Modify: `apps/mobile/lib/screens/room_search_screen.dart`

- [ ] **Step 1: Implement RoomSearchScreen**

```dart
// apps/mobile/lib/screens/room_search_screen.dart
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
  NavNode? _origin;
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
      setState(() => _origin = node);
      context.push(
        '/building/${widget.buildingId}/search?mode=to',
        extra: node,
      );
    } else {
      final origin = GoRouterState.of(context).extra as NavNode?;
      if (origin == null || _building == null) return;

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
```

- [ ] **Step 2: Verify no analysis errors**

```bash
flutter analyze lib/screens/room_search_screen.dart
```

Expected: No issues.

- [ ] **Step 3: Commit**

```bash
git add lib/screens/room_search_screen.dart
git commit -m "feat: implement RoomSearchScreen with search and route trigger"
```

---

### Task 10: FloorMapPainter + RouteScreen

**Files:**
- Create: `apps/mobile/lib/widgets/floor_map_painter.dart`
- Modify: `apps/mobile/lib/screens/route_screen.dart`

- [ ] **Step 1: Implement FloorMapPainter**

```dart
// apps/mobile/lib/widgets/floor_map_painter.dart
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

    Offset toCanvas(NavNode n) =>
        Offset(n.x * scaleX, n.y * scaleY);

    // Draw route edges
    final routePaint = Paint()
      ..color = Colors.blue
      ..strokeWidth = 3
      ..style = PaintingStyle.stroke;
    for (final step in stepsOnFloor) {
      if (step.from.floor == step.to.floor) {
        canvas.drawLine(toCanvas(step.from), toCanvas(step.to), routePaint);
      }
    }

    // Draw nodes
    for (final node in nodes) {
      final pos = toCanvas(node);
      final isOnRoute = stepsOnFloor
          .any((s) => s.from.id == node.id || s.to.id == node.id);
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
```

- [ ] **Step 2: Implement RouteScreen**

```dart
// apps/mobile/lib/screens/route_screen.dart
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
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
        title: Text(
          '${widget.route.steps.first.from.label} → '
          '${widget.route.steps.last.to.label}',
        ),
        bottom: _floorsWithRoute.length > 1
            ? TabBar(
                controller: _tabController,
                tabs: _floorsWithRoute
                    .map((f) => Tab(text: f.name))
                    .toList(),
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
              builder: (_) =>
                  RouteInstructionsSheet(route: widget.route),
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
        // imageSize is read from the actual loaded image; fallback to 800×600
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
```

- [ ] **Step 3: Create RouteInstructionsSheet**

```dart
// apps/mobile/lib/widgets/route_instructions_sheet.dart
import 'package:flutter/material.dart';
import '../models/route.dart';

class RouteInstructionsSheet extends StatelessWidget {
  final AppRoute route;
  const RouteInstructionsSheet({super.key, required this.route});

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.6,
      builder: (ctx, scroll) => Column(
        children: [
          const Padding(
            padding: EdgeInsets.all(16),
            child: Text('Маршрут',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          ),
          Expanded(
            child: ListView.separated(
              controller: scroll,
              itemCount: route.steps.length,
              separatorBuilder: (_, __) => const Divider(height: 1),
              itemBuilder: (ctx, i) {
                final step = route.steps[i];
                final icon = switch (step.edgeType) {
                  EdgeType.walk => Icons.directions_walk,
                  EdgeType.stairs => Icons.stairs,
                  EdgeType.elevator => Icons.elevator,
                };
                return ListTile(
                  leading: CircleAvatar(
                    child: Icon(icon, size: 18),
                  ),
                  title: Text(step.description),
                  subtitle: Text('${step.to.floor} этаж'),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
```

- [ ] **Step 4: Verify no analysis errors**

```bash
flutter analyze lib/screens/route_screen.dart lib/widgets/
```

Expected: No issues.

- [ ] **Step 5: Commit**

```bash
git add lib/screens/route_screen.dart lib/widgets/
git commit -m "feat: implement RouteScreen with FloorMapPainter and instructions sheet"
```

---

### Task 11: SettingsScreen

**Files:**
- Modify: `apps/mobile/lib/screens/settings_screen.dart`

- [ ] **Step 1: Implement SettingsScreen**

```dart
// apps/mobile/lib/screens/settings_screen.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/preferences_service.dart';
import '../services/routing_service.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final prefs = context.watch<PreferencesService>();
    return Scaffold(
      appBar: AppBar(title: const Text('Настройки')),
      body: ListView(
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 16, 16, 8),
            child: Text('Предпочтение маршрута',
                style: TextStyle(fontWeight: FontWeight.bold)),
          ),
          RadioListTile<RoutePreference>(
            title: const Text('Без разницы'),
            value: RoutePreference.noPreference,
            groupValue: prefs.preference,
            onChanged: (v) => prefs.setPreference(v!),
          ),
          RadioListTile<RoutePreference>(
            title: const Text('Предпочитаю лифт'),
            subtitle: const Text('Маршрут будет избегать лестниц'),
            value: RoutePreference.elevator,
            groupValue: prefs.preference,
            onChanged: (v) => prefs.setPreference(v!),
          ),
          RadioListTile<RoutePreference>(
            title: const Text('Предпочитаю лестницы'),
            subtitle: const Text('Маршрут будет избегать лифтов'),
            value: RoutePreference.stairs,
            groupValue: prefs.preference,
            onChanged: (v) => prefs.setPreference(v!),
          ),
        ],
      ),
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/screens/settings_screen.dart
git commit -m "feat: implement SettingsScreen with route preference selection"
```

---

### Task 12: Integration test

**Files:**
- Create: `apps/mobile/test/integration_test.dart`

- [ ] **Step 1: Write integration test**

```dart
// apps/mobile/test/integration_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:indoor_nav/services/graph_service.dart';
import 'package:indoor_nav/services/routing_service.dart';
import 'package:indoor_nav/models/building.dart';

const _fullBuildingJson = '''
{
  "id": "hospital",
  "name": "Больница",
  "floors": [
    {"level": 1, "name": "1 этаж", "nodes": [
      {"id": "entrance", "type": "entrance", "label": "Вход", "x": 10, "y": 50},
      {"id": "corridor-1f", "type": "room", "label": "Коридор", "x": 50, "y": 50},
      {"id": "room-101", "type": "room", "label": "Кабинет 101", "x": 100, "y": 20},
      {"id": "elevator-1f", "type": "elevator", "label": "Лифт", "x": 80, "y": 50},
      {"id": "stairs-1f", "type": "stairs", "label": "Лестница", "x": 70, "y": 50}
    ], "edges": [
      {"from": "entrance", "to": "corridor-1f", "type": "walk", "weight": 40.0},
      {"from": "corridor-1f", "to": "room-101", "type": "walk", "weight": 60.0},
      {"from": "corridor-1f", "to": "elevator-1f", "type": "walk", "weight": 30.0},
      {"from": "corridor-1f", "to": "stairs-1f", "type": "walk", "weight": 20.0}
    ]},
    {"level": 2, "name": "2 этаж", "nodes": [
      {"id": "elevator-2f", "type": "elevator", "label": "Лифт", "x": 80, "y": 50},
      {"id": "stairs-2f", "type": "stairs", "label": "Лестница", "x": 70, "y": 50},
      {"id": "corridor-2f", "type": "room", "label": "Коридор", "x": 50, "y": 50},
      {"id": "room-201", "type": "room", "label": "Кабинет 201", "x": 100, "y": 20}
    ], "edges": [
      {"from": "elevator-2f", "to": "corridor-2f", "type": "walk", "weight": 30.0},
      {"from": "stairs-2f", "to": "corridor-2f", "type": "walk", "weight": 20.0},
      {"from": "corridor-2f", "to": "room-201", "type": "walk", "weight": 60.0}
    ]}
  ],
  "cross_floor_edges": [
    {"from": "elevator-1f", "to": "elevator-2f", "type": "elevator", "weight": 15.0},
    {"from": "stairs-1f", "to": "stairs-2f", "type": "stairs", "weight": 15.0}
  ]
}
''';

void main() {
  final graph = GraphService();
  final routing = RoutingService();
  late Building building;

  setUp(() => building = graph.parseBuilding(_fullBuildingJson));

  test('routes from entrance to room on same floor', () {
    final route = routing.findRoute(
      building: building,
      fromId: 'entrance',
      toId: 'room-101',
      preference: RoutePreference.noPreference,
    );
    expect(route, isNotNull);
    expect(route!.steps.last.to.label, 'Кабинет 101');
  });

  test('routes cross-floor entrance→room-201 with elevator preference', () {
    final route = routing.findRoute(
      building: building,
      fromId: 'entrance',
      toId: 'room-201',
      preference: RoutePreference.elevator,
    );
    expect(route, isNotNull);
    expect(
      route!.steps.any((s) => s.edgeType == EdgeType.elevator),
      isTrue,
    );
    expect(
      route.steps.any((s) => s.edgeType == EdgeType.stairs),
      isFalse,
    );
  });

  test('routes cross-floor entrance→room-201 with stairs preference', () {
    final route = routing.findRoute(
      building: building,
      fromId: 'entrance',
      toId: 'room-201',
      preference: RoutePreference.stairs,
    );
    expect(route, isNotNull);
    expect(route!.steps.any((s) => s.edgeType == EdgeType.stairs), isTrue);
    expect(route.steps.any((s) => s.edgeType == EdgeType.elevator), isFalse);
  });

  test('route steps have correct floor numbers', () {
    final route = routing.findRoute(
      building: building,
      fromId: 'entrance',
      toId: 'room-201',
      preference: RoutePreference.noPreference,
    );
    expect(route!.steps.first.from.floor, 1);
    expect(route.steps.last.to.floor, 2);
  });
}
```

- [ ] **Step 2: Run integration test**

```bash
flutter test test/integration_test.dart
```

Expected: All tests passed!

- [ ] **Step 3: Run all tests**

```bash
flutter test
```

Expected: All tests passed!

- [ ] **Step 4: Final commit**

```bash
git add test/integration_test.dart
git commit -m "test: add integration tests for full navigation flow"
```

---

## Итог (Plan 1 of 2)

Это план для Flutter-приложения. Plan 2 будет покрывать React веб-редактор карт (`apps/editor/`).

После выполнения всех задач:
- `flutter build apk` → рабочий APK для Android
- `flutter build ios` → рабочая сборка для iOS
- Все тесты проходят: `flutter test`
