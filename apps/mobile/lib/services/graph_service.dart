import 'dart:convert';
import '../models/building.dart';

class GraphService {
  Building parseBuilding(String jsonString) {
    try {
      final json = jsonDecode(jsonString) as Map<String, dynamic>;
      final building = Building.fromJson(json);
      _validate(building);
      return building;
    } on FormatException {
      rethrow;
    } catch (e) {
      throw FormatException('Неверный формат файла: $e');
    }
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
      for (final e in floor.edges) { checkEdge(e.from, e.to); }
    }
    for (final e in building.crossFloorEdges) { checkEdge(e.from, e.to); }
  }
}
