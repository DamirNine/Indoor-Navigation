import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:archive/archive.dart';
import 'package:file_picker/file_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'graph_service.dart';
import 'storage_service.dart';
import '../models/building.dart';

class ImportService {
  final GraphService _graphService;
  final StorageService _storageService;

  ImportService(this._graphService, this._storageService);

  /// Returns parsed Building on success, null if user cancelled.
  /// Throws FormatException if file is invalid.
  Future<Building?> importFromPicker() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['json', 'zip'],
      withData: true,
    );
    if (result == null || result.files.isEmpty) return null;

    final file = result.files.first;
    final bytes = file.bytes ?? await File(file.path!).readAsBytes();

    final String jsonString;
    final Map<String, Uint8List> images;

    if (file.extension == 'zip') {
      (jsonString, images) = _extractZip(bytes);
    } else {
      jsonString = utf8.decode(bytes);
      images = {};
    }

    final building = _graphService.parseBuilding(jsonString);

    if (images.isNotEmpty) {
      final dir = await getApplicationDocumentsDirectory();
      final buildingDir = Directory('${dir.path}/buildings/${building.id}');
      await buildingDir.create(recursive: true);
      for (final entry in images.entries) {
        await File('${buildingDir.path}/${entry.key}').writeAsBytes(entry.value);
      }
    }

    await _storageService.saveBuilding(building.id, jsonString);
    return building;
  }

  (String, Map<String, Uint8List>) _extractZip(Uint8List bytes) {
    final archive = ZipDecoder().decodeBytes(bytes);
    String? jsonString;
    final images = <String, Uint8List>{};

    for (final file in archive) {
      if (!file.isFile) continue;
      final name = file.name.split('/').last;
      if (name.endsWith('.json')) {
        jsonString = utf8.decode(file.content as List<int>);
      } else if (name.endsWith('.png') || name.endsWith('.jpg')) {
        images[name] = Uint8List.fromList(file.content as List<int>);
      }
    }

    if (jsonString == null) {
      throw const FormatException('No JSON file found in ZIP');
    }
    return (jsonString, images);
  }
}
