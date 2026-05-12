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
