import 'package:go_router/go_router.dart';
import 'models/building.dart';
import 'models/route.dart';
import 'screens/building_list_screen.dart';
import 'screens/room_search_screen.dart';
import 'screens/route_screen.dart';
import 'screens/settings_screen.dart';

class RouteScreenArgs {
  final AppRoute route;
  final Building building;
  const RouteScreenArgs({required this.route, required this.building});
}

final appRouter = GoRouter(
  routes: [
    GoRoute(
      path: '/',
      builder: (ctx, state) => const BuildingListScreen(),
    ),
    GoRoute(
      path: '/building/:id/search',
      builder: (ctx, state) => RoomSearchScreen(
        buildingId: state.pathParameters['id']!,
        isSelectingOrigin: state.uri.queryParameters['mode'] == 'from',
      ),
    ),
    GoRoute(
      path: '/route',
      builder: (ctx, state) {
        final args = state.extra! as RouteScreenArgs;
        return RouteScreen(route: args.route, building: args.building);
      },
    ),
    GoRoute(
      path: '/settings',
      builder: (ctx, state) => const SettingsScreen(),
    ),
  ],
);
