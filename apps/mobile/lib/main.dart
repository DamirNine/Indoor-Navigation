import 'package:flutter/material.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:provider/provider.dart';
import 'app_router.dart';
import 'services/graph_service.dart';
import 'services/import_service.dart';
import 'services/preferences_service.dart';
import 'services/routing_service.dart';
import 'services/storage_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Hive.initFlutter();
  final storage = StorageService();
  await storage.init();
  final prefs = PreferencesService();
  await prefs.init();
  final graph = GraphService();
  final routing = RoutingService();
  final importer = ImportService(graph, storage);

  runApp(
    MultiProvider(
      providers: [
        Provider.value(value: storage),
        Provider.value(value: graph),
        Provider.value(value: routing),
        Provider.value(value: importer),
        ChangeNotifierProvider.value(value: prefs),
      ],
      child: const IndoorNavApp(),
    ),
  );
}

class IndoorNavApp extends StatelessWidget {
  const IndoorNavApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp.router(
        title: 'Indoor Nav',
        routerConfig: appRouter,
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: Colors.indigo),
          useMaterial3: true,
        ),
      );
}
