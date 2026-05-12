import 'package:flutter/material.dart';
import '../models/building.dart';
import '../models/route.dart';
class RouteScreen extends StatelessWidget {
  final AppRoute route;
  final Building building;
  const RouteScreen({super.key, required this.route, required this.building});
  @override
  Widget build(BuildContext context) =>
      const Scaffold(body: Center(child: Text('Route')));
}
