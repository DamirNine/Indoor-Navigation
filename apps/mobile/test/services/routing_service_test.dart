import 'package:flutter_test/flutter_test.dart';
import 'package:indoor_nav/models/building.dart';
import 'package:indoor_nav/services/graph_service.dart';
import 'package:indoor_nav/services/routing_service.dart';

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
    final isolated = GraphService().parseBuilding(
      '{"id":"b","name":"B","floors":[{"level":1,"name":"F","nodes":['
      '{"id":"a","type":"room","label":"A","x":0,"y":0},'
      '{"id":"b","type":"room","label":"B","x":10,"y":0}'
      '],"edges":[]}],"cross_floor_edges":[]}',
    );
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
