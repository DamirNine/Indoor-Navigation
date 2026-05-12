import 'package:flutter_test/flutter_test.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:indoor_nav/services/storage_service.dart';

void main() {
  late StorageService sut;

  setUp(() async {
    Hive.init('test_hive_${DateTime.now().millisecondsSinceEpoch}');
    sut = StorageService();
    await sut.init();
  });

  tearDown(() async => Hive.deleteFromDisk());

  test('saves and loads building JSON', () async {
    await sut.saveBuilding('b1', '{"id":"b1"}');
    expect(await sut.loadBuilding('b1'), '{"id":"b1"}');
  });

  test('listBuildingIds returns saved IDs', () async {
    await sut.saveBuilding('b1', '{}');
    await sut.saveBuilding('b2', '{}');
    final ids = await sut.listBuildingIds();
    expect(ids, containsAll(['b1', 'b2']));
  });

  test('deleteBuilding removes it', () async {
    await sut.saveBuilding('b1', '{}');
    await sut.deleteBuilding('b1');
    expect(await sut.loadBuilding('b1'), isNull);
  });
}
