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

  List<NavNode> get allNodes => floors.expand((f) => f.nodes).toList();
}
