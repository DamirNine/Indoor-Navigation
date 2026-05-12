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
    const json =
        '{"id":"b","name":"B","floors":[{"level":1,"name":"F","nodes":['
        '{"id":"a","type":"room","label":"A","x":0,"y":0},'
        '{"id":"a","type":"room","label":"A2","x":5,"y":0}'
        '],"edges":[]}],"cross_floor_edges":[]}';
    expect(() => sut.parseBuilding(json), throwsA(isA<FormatException>()));
  });

  test('throws FormatException for unknown edge endpoint', () {
    const json =
        '{"id":"b","name":"B","floors":[{"level":1,"name":"F","nodes":['
        '{"id":"a","type":"room","label":"A","x":0,"y":0}'
        '],"edges":[{"from":"a","to":"ghost","type":"walk","weight":5.0}]}],"cross_floor_edges":[]}';
    expect(() => sut.parseBuilding(json), throwsA(isA<FormatException>()));
  });

  test('throws FormatException for invalid JSON', () {
    expect(() => sut.parseBuilding('not json'), throwsA(isA<FormatException>()));
  });
}
