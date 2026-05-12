import 'package:flutter/material.dart';
class RoomSearchScreen extends StatelessWidget {
  final String buildingId;
  final bool isSelectingOrigin;
  const RoomSearchScreen({
    super.key,
    required this.buildingId,
    required this.isSelectingOrigin,
  });
  @override
  Widget build(BuildContext context) =>
      const Scaffold(body: Center(child: Text('Search')));
}
