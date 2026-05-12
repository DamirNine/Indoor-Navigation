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
        EdgeType.stairs => 'По лестнице на ${to.floor} этаж',
        EdgeType.elevator => 'На лифте на ${to.floor} этаж',
      };
}

class AppRoute {
  final List<RouteStep> steps;
  final double totalWeight;

  const AppRoute({required this.steps, required this.totalWeight});
}
