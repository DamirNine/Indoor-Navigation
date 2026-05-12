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
