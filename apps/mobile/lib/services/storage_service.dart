import 'package:hive_flutter/hive_flutter.dart';

class StorageService {
  static const _boxName = 'buildings';

  Future<void> init() async => Hive.openBox<String>(_boxName);

  Box<String> get _box => Hive.box<String>(_boxName);

  Future<void> saveBuilding(String id, String json) => _box.put(id, json);

  Future<String?> loadBuilding(String id) async => _box.get(id);

  Future<List<String>> listBuildingIds() async =>
      _box.keys.cast<String>().toList();

  Future<void> deleteBuilding(String id) => _box.delete(id);
}
