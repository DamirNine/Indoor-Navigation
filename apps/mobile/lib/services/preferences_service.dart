import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'routing_service.dart';

class PreferencesService extends ChangeNotifier {
  static const _key = 'route_preference';
  late SharedPreferences _prefs;

  RoutePreference _preference = RoutePreference.noPreference;
  RoutePreference get preference => _preference;

  Future<void> init() async {
    _prefs = await SharedPreferences.getInstance();
    final saved = _prefs.getString(_key);
    if (saved != null) {
      _preference = RoutePreference.values.byName(saved);
    }
  }

  Future<void> setPreference(RoutePreference value) async {
    _preference = value;
    await _prefs.setString(_key, value.name);
    notifyListeners();
  }
}
