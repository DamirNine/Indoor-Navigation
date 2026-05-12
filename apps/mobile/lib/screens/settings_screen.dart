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
          RadioGroup<RoutePreference>(
            groupValue: prefs.preference,
            onChanged: (v) => prefs.setPreference(v!),
            child: const Column(
              children: [
                RadioListTile<RoutePreference>(
                  title: Text('Без разницы'),
                  value: RoutePreference.noPreference,
                ),
                RadioListTile<RoutePreference>(
                  title: Text('Предпочитаю лифт'),
                  subtitle: Text('Маршрут будет избегать лестниц'),
                  value: RoutePreference.elevator,
                ),
                RadioListTile<RoutePreference>(
                  title: Text('Предпочитаю лестницы'),
                  subtitle: Text('Маршрут будет избегать лифтов'),
                  value: RoutePreference.stairs,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
