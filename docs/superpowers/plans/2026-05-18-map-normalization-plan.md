# Map Normalization + Editor Fix + Flutter Rotation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Normalize node spacing in 1_processed.json, rotate building-corp 180°, fix editor Stage canvas size bug, add 90° rotation buttons to Flutter map viewer.

**Architecture:** Four independent changes. Scripts are standalone Node.js ESM files in `example_building/`. Editor fix is one line in FloorCanvas.tsx. Flutter rotation lifts TransformationController to BuildingMapScreen level so AppBar buttons can control it, with per-floor auto-fit that respects current rotation.

**Tech Stack:** Node.js ESM (scripts), React/Konva (editor), Flutter/Dart (mobile)

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `example_building/normalize.mjs` | Create | Normalize corridor spacing + room distances in 1_processed.json |
| `example_building/rotate_corp180.mjs` | Create | Rotate building-corp-processed.json 180° around bbox center |
| `apps/editor/src/components/FloorCanvas.tsx` | Modify (~line 143) | Add getBoundingClientRect() before ResizeObserver.observe() |
| `apps/editor/src/App.tsx` | Modify | Bump version to v1.3.0 |
| `apps/editor/package.json` | Modify | Bump version to 1.3.0 |
| `apps/mobile/lib/screens/building_map_screen.dart` | Rewrite | Lift TransformationController, add rotation state + buttons |

---

## Task 1: Script — normalize.mjs

**Files:**
- Create: `example_building/normalize.mjs`

- [ ] **Step 1: Create the script**

```js
// example_building/normalize.mjs
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const inPath = join(__dir, '1_processed.json');
const data = JSON.parse(readFileSync(inPath, 'utf8'));

const floor2 = data.floors.find(f => f.level === 2);
if (!floor2) throw new Error('Floor 2 not found');

const nodeMap = Object.fromEntries(floor2.nodes.map(n => [n.id, n]));

function neighbors(id) {
  return floor2.edges
    .filter(e => e.from === id || e.to === id)
    .map(e => e.from === id ? e.to : e.from);
}

// ── PHASE A: corridor spacing ─────────────────────────────────────────────
// Collect corridor chain at y≈2210, x ≤ 1765 (from room 230 toward 228 and beyond)
const CHAIN_Y = 2210;
const CHAIN_START_X = 1765;
const startCorrId = 'corridor-mp5jilud'; // corridor of room 230

const chainSet = new Set([startCorrId]);
const bfsQueue = [startCorrId];
while (bfsQueue.length) {
  const cur = bfsQueue.shift();
  for (const nbId of neighbors(cur)) {
    const nb = nodeMap[nbId];
    if (!nb || nb.type !== 'corridor' || chainSet.has(nb.id)) continue;
    if (Math.abs(nb.y - CHAIN_Y) < 100 && nb.x <= CHAIN_START_X) {
      chainSet.add(nb.id);
      bfsQueue.push(nb.id);
    }
  }
}

const chain = [...chainSet].map(id => nodeMap[id]).sort((a, b) => b.x - a.x);
console.log(`Corridor chain: ${chain.length} nodes, x from ${chain[0].x} to ${chain.at(-1).x}`);

const xMax = chain[0].x;
const xMin = chain.at(-1).x;
const avgStep = (xMax - xMin) / (chain.length - 1);
console.log(`Avg corridor step: ${avgStep.toFixed(2)}`);

for (let i = 0; i < chain.length; i++) {
  const corr = chain[i];
  const newX = +(xMax - i * avgStep).toFixed(1);
  const dx = newX - corr.x;
  if (Math.abs(dx) < 0.05) continue;
  // Move directly connected rooms by same dx (they're above/below — same y axis)
  for (const nbId of neighbors(corr.id)) {
    const nb = nodeMap[nbId];
    if (nb && nb.type !== 'corridor') nb.x = +(nb.x + dx).toFixed(1);
  }
  corr.x = newX;
}

// ── PHASE B: room-to-corridor distance normalization ──────────────────────
const pairs = [];
for (const node of floor2.nodes) {
  if (node.type !== 'room') continue;
  const corrNeighbors = neighbors(node.id)
    .map(id => nodeMap[id])
    .filter(n => n && n.type === 'corridor');
  if (corrNeighbors.length === 0) continue;
  const corr = corrNeighbors.reduce((best, c) =>
    Math.hypot(node.x - c.x, node.y - c.y) < Math.hypot(node.x - best.x, node.y - best.y) ? c : best
  );
  const dist = Math.hypot(node.x - corr.x, node.y - corr.y);
  pairs.push({ node, corr, dist });
}

const meanDist = pairs.reduce((s, p) => s + p.dist, 0) / pairs.length;
console.log(`Room-to-corridor mean dist: ${meanDist.toFixed(2)} (${pairs.length} rooms)`);

for (const { node, corr } of pairs) {
  const dx = node.x - corr.x;
  const dy = node.y - corr.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    node.x = +(corr.x + Math.sign(dx) * meanDist).toFixed(1);
  } else {
    node.y = +(corr.y + Math.sign(dy) * meanDist).toFixed(1);
  }
}

writeFileSync(inPath, JSON.stringify(data, null, 2), 'utf8');
console.log('Saved:', inPath);
```

- [ ] **Step 2: Run the script**

```bash
cd D:/Claude/Navigation/example_building
node normalize.mjs
```

Expected output:
```
Corridor chain: 9 nodes, x from 1765 to 1287
Avg corridor step: 59.75
Room-to-corridor mean dist: ~150 (some number of rooms)
Saved: .../1_processed.json
```

- [ ] **Step 3: Verify output**

Open `1_processed.json`, check that corridors in the chain (`corridor-mp5jilud` through `corridor-mp5jm7rp`) have evenly spaced x values, and room nodes are at consistent distance from their corridors.

- [ ] **Step 4: Commit**

```bash
cd D:/Claude/Navigation
git add example_building/normalize.mjs example_building/1_processed.json
git commit -m "feat: normalize corridor spacing and room distances in 1_processed.json"
```

---

## Task 2: Script — rotate_corp180.mjs

**Files:**
- Create: `example_building/rotate_corp180.mjs`

- [ ] **Step 1: Create the script**

```js
// example_building/rotate_corp180.mjs
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const inPath = join(__dir, 'building-corp-processed.json');
const data = JSON.parse(readFileSync(inPath, 'utf8'));

let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
for (const floor of data.floors) {
  for (const node of floor.nodes) {
    if (node.x < minX) minX = node.x;
    if (node.y < minY) minY = node.y;
    if (node.x > maxX) maxX = node.x;
    if (node.y > maxY) maxY = node.y;
  }
  for (const contour of (floor.contours ?? [])) {
    for (const [x, y] of contour) {
      if (x < minX) minX = x; if (y < minY) minY = y;
      if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    }
  }
  for (const area of (floor.areas ?? [])) {
    for (const [x, y] of area.points) {
      if (x < minX) minX = x; if (y < minY) minY = y;
      if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    }
  }
}

console.log(`Bbox: x=[${minX},${maxX}] y=[${minY},${maxY}]`);

const rot = ([x, y]) => [+(minX + maxX - x).toFixed(1), +(minY + maxY - y).toFixed(1)];

for (const floor of data.floors) {
  for (const node of floor.nodes) { [node.x, node.y] = rot([node.x, node.y]); }
  if (floor.contours) floor.contours = floor.contours.map(c => c.map(rot));
  if (floor.areas) floor.areas = floor.areas.map(a => ({ ...a, points: a.points.map(rot) }));
}

writeFileSync(inPath, JSON.stringify(data, null, 2), 'utf8');
console.log('Saved:', inPath);
```

- [ ] **Step 2: Run the script**

```bash
cd D:/Claude/Navigation/example_building
node rotate_corp180.mjs
```

Expected output:
```
Bbox: x=[0,5170] y=[0,4186]
Saved: .../building-corp-processed.json
```

- [ ] **Step 3: Verify**

Open `building-corp-processed.json`, check a node that was at x=0 is now at x=5170, y=0 is now at y=4186.

- [ ] **Step 4: Commit**

```bash
cd D:/Claude/Navigation
git add example_building/rotate_corp180.mjs example_building/building-corp-processed.json
git commit -m "feat: rotate building-corp 180 degrees around bbox center"
```

---

## Task 3: Editor bug fix — Stage canvas size

**Files:**
- Modify: `apps/editor/src/components/FloorCanvas.tsx` (~line 143)
- Modify: `apps/editor/src/App.tsx`
- Modify: `apps/editor/package.json`

- [ ] **Step 1: Fix FloorCanvas.tsx**

Find this block (~line 143):
```ts
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setStageSize({ w: Math.floor(width), h: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
```

Replace with:
```ts
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    if (width > 0 && height > 0) setStageSize({ w: Math.floor(width), h: Math.floor(height) });
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setStageSize({ w: Math.floor(width), h: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
```

- [ ] **Step 2: Bump version in App.tsx**

Find: `v1.2.0`
Replace with: `v1.3.0`

- [ ] **Step 3: Bump version in package.json**

Find: `"version": "1.2.0"`
Replace with: `"version": "1.3.0"`

- [ ] **Step 4: Build and check**

```bash
cd D:/Claude/Navigation/apps/editor
npm run build
```

Open the editor in browser — canvas must fill the full screen (no 800×500 box).

- [ ] **Step 5: Commit**

```bash
cd D:/Claude/Navigation
git add apps/editor/src/components/FloorCanvas.tsx apps/editor/src/App.tsx apps/editor/package.json
git commit -m "fix(editor): stage canvas fills screen on first render; bump v1.3.0"
```

- [ ] **Step 6: Deploy to GitHub Pages**

```bash
cd D:/Claude/Navigation/apps/editor
npm run deploy
```

Verify at https://damirnine.github.io/Indoor-Navigation/ — canvas should be full-screen.

---

## Task 4: Flutter — 90° rotation buttons

**Files:**
- Rewrite: `apps/mobile/lib/screens/building_map_screen.dart`

**Design details:**
- `TransformationController _transform` lifted to `_BuildingMapScreenState` (one shared instance)
- `_fittedFloors` (`Set<int>`) in parent tracks which floors have been auto-fitted
- `_rotationIndex` (0–3) in parent, never reset on floor change
- `_FloorView` receives: `transform`, `rotationIndex`, `fitted` (bool), `onFitted` (VoidCallback)
- `_FloorViewState._autoFitScheduled` (bool) is a local guard against duplicate scheduling
- Auto-fit: computed in `_maybeInitTransform`, applied in postFrameCallback; rotation combined on top of auto-fit matrix; `onFitted()` called in postFrameCallback (after transform is set)
- Rotation buttons: `_rotateCW` / `_rotateCCW` apply incremental ±90° rotation to current `_transform.value` (preserves pan/zoom); update `_rotationIndex` for future floor auto-fits

- [ ] **Step 1: Rewrite building_map_screen.dart**

Replace entire file content:

```dart
import 'dart:io';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import '../models/building.dart';
import '../services/graph_service.dart';
import '../services/storage_service.dart';
import '../widgets/floor_map_painter.dart';

const _virtualW = 10000.0;
const _virtualH = 8000.0;
const _virtualSize = Size(_virtualW, _virtualH);

class BuildingMapScreen extends StatefulWidget {
  final String buildingId;
  const BuildingMapScreen({super.key, required this.buildingId});

  @override
  State<BuildingMapScreen> createState() => _BuildingMapScreenState();
}

class _BuildingMapScreenState extends State<BuildingMapScreen>
    with TickerProviderStateMixin {
  Building? _building;
  TabController? _tabController;
  final _transform = TransformationController();
  final _fittedFloors = <int>{};
  int _rotationIndex = 0; // 0=0°, 1=90°CW, 2=180°, 3=270°CW

  @override
  void initState() {
    super.initState();
    _loadBuilding();
  }

  @override
  void dispose() {
    _tabController?.dispose();
    _transform.dispose();
    super.dispose();
  }

  Future<void> _loadBuilding() async {
    final storage = context.read<StorageService>();
    final graph = context.read<GraphService>();
    final json = await storage.loadBuilding(widget.buildingId);
    if (json == null || !mounted) return;
    final building = graph.parseBuilding(json);
    setState(() {
      _building = building;
      _tabController = TabController(length: building.floors.length, vsync: this);
    });
  }

  void _rotateCW() {
    setState(() => _rotationIndex = (_rotationIndex + 1) % 4);
    _applyIncrementalRotation(math.pi / 2);
  }

  void _rotateCCW() {
    setState(() => _rotationIndex = (_rotationIndex + 3) % 4);
    _applyIncrementalRotation(-math.pi / 2);
  }

  void _applyIncrementalRotation(double angle) {
    final size = MediaQuery.of(context).size;
    final cx = size.width / 2;
    final cy = size.height / 2;
    final step = Matrix4.identity()
      ..translate(cx, cy)
      ..rotateZ(angle)
      ..translate(-cx, -cy);
    _transform.value = step * _transform.value;
  }

  @override
  Widget build(BuildContext context) {
    if (_building == null || _tabController == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Загрузка...')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    final building = _building!;

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/'),
        ),
        title: Text(building.name),
        actions: [
          IconButton(
            icon: const Icon(Icons.rotate_left),
            tooltip: 'Повернуть влево 90°',
            onPressed: _rotateCCW,
          ),
          IconButton(
            icon: const Icon(Icons.rotate_right),
            tooltip: 'Повернуть вправо 90°',
            onPressed: _rotateCW,
          ),
        ],
        bottom: building.floors.length > 1
            ? TabBar(
                controller: _tabController!,
                tabs: building.floors.map((f) => Tab(text: f.name)).toList(),
              )
            : null,
      ),
      body: TabBarView(
        controller: _tabController!,
        children: building.floors.asMap().entries.map((entry) {
          final idx = entry.key;
          final floor = entry.value;
          return _FloorView(
            key: ValueKey(floor.level),
            floor: floor,
            buildingId: building.id,
            transform: _transform,
            rotationIndex: _rotationIndex,
            fitted: _fittedFloors.contains(idx),
            onFitted: () => setState(() => _fittedFloors.add(idx)),
          );
        }).toList(),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: FilledButton.icon(
            onPressed: () => context.push(
              '/building/${widget.buildingId}/search?mode=from',
            ),
            icon: const Icon(Icons.directions),
            label: const Text('Построить маршрут'),
          ),
        ),
      ),
    );
  }
}

class _FloorView extends StatefulWidget {
  final Floor floor;
  final String buildingId;
  final TransformationController transform;
  final int rotationIndex;
  final bool fitted;
  final VoidCallback onFitted;

  const _FloorView({
    super.key,
    required this.floor,
    required this.buildingId,
    required this.transform,
    required this.rotationIndex,
    required this.fitted,
    required this.onFitted,
  });

  @override
  State<_FloorView> createState() => _FloorViewState();
}

class _FloorViewState extends State<_FloorView> {
  File? _imageFile;
  bool _autoFitScheduled = false;

  @override
  void initState() {
    super.initState();
    _loadImage();
  }

  Future<void> _loadImage() async {
    if (widget.floor.image == null) return;
    final dir = await getApplicationDocumentsDirectory();
    final f = File(
        '${dir.path}/buildings/${widget.buildingId}/${widget.floor.image}');
    if (!await f.exists() || !mounted) return;
    setState(() => _imageFile = f);
  }

  void _maybeInitTransform(BoxConstraints constraints) {
    if (widget.fitted || _autoFitScheduled) return;
    _autoFitScheduled = true;

    double? minX, minY, maxX, maxY;

    final contours = widget.floor.contours;
    if (contours != null && contours.isNotEmpty) {
      for (final contour in contours) {
        for (final pt in contour) {
          minX = minX == null ? pt[0] : math.min(minX, pt[0]);
          minY = minY == null ? pt[1] : math.min(minY, pt[1]);
          maxX = maxX == null ? pt[0] : math.max(maxX, pt[0]);
          maxY = maxY == null ? pt[1] : math.max(maxY, pt[1]);
        }
      }
    } else {
      for (final node in widget.floor.nodes) {
        minX = minX == null ? node.x : math.min(minX, node.x);
        minY = minY == null ? node.y : math.min(minY, node.y);
        maxX = maxX == null ? node.x : math.max(maxX, node.x);
        maxY = maxY == null ? node.y : math.max(maxY, node.y);
      }
    }

    if (minX == null || minY == null || maxX == null || maxY == null) return;

    const pad = 600.0;
    final bMinX = (minX - pad) / _virtualW * constraints.maxWidth;
    final bMinY = (minY - pad) / _virtualH * constraints.maxHeight;
    final bMaxX = (maxX + pad) / _virtualW * constraints.maxWidth;
    final bMaxY = (maxY + pad) / _virtualH * constraints.maxHeight;
    final bW = bMaxX - bMinX;
    final bH = bMaxY - bMinY;
    if (bW <= 0 || bH <= 0) return;

    final s = math.min(constraints.maxWidth / bW, constraints.maxHeight / bH);
    final fitCx = (bMinX + bMaxX) / 2;
    final fitCy = (bMinY + bMaxY) / 2;
    final tx = constraints.maxWidth / 2 - s * fitCx;
    final ty = constraints.maxHeight / 2 - s * fitCy;
    final rot = widget.rotationIndex;
    final w = constraints.maxWidth;
    final h = constraints.maxHeight;

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final autoFit = Matrix4.identity()
        ..setEntry(0, 0, s)
        ..setEntry(1, 1, s)
        ..setEntry(0, 3, tx)
        ..setEntry(1, 3, ty);
      if (rot == 0) {
        widget.transform.value = autoFit;
      } else {
        final angle = rot * math.pi / 2;
        final rotM = Matrix4.identity()
          ..translate(w / 2, h / 2)
          ..rotateZ(angle)
          ..translate(-w / 2, -h / 2);
        widget.transform.value = rotM * autoFit;
      }
      widget.onFitted();
    });
  }

  @override
  Widget build(BuildContext context) {
    return InteractiveViewer(
      transformationController: widget.transform,
      minScale: 0.05,
      maxScale: 10.0,
      child: LayoutBuilder(builder: (ctx, constraints) {
        _maybeInitTransform(constraints);
        return Stack(
          children: [
            if (_imageFile != null)
              Image.file(_imageFile!,
                  width: constraints.maxWidth,
                  height: constraints.maxHeight,
                  fit: BoxFit.fill)
            else
              Container(color: Colors.grey.shade200),
            CustomPaint(
              size: Size(constraints.maxWidth, constraints.maxHeight),
              painter: FloorMapPainter(
                nodes: widget.floor.nodes,
                areas: widget.floor.areas,
                stepsOnFloor: const [],
                imageSize: _virtualSize,
                contours: widget.floor.contours,
              ),
            ),
          ],
        );
      }),
    );
  }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd D:/Claude/Navigation/apps/mobile
flutter analyze lib/screens/building_map_screen.dart
```

Expected: no errors.

- [ ] **Step 3: Build APK**

```bash
cd D:/Claude/Navigation/apps/mobile
flutter build apk --release
```

Expected: BUILD SUCCESSFUL

- [ ] **Step 4: Install and test**

```bash
C:\Users\terek\AppData\Local\Android\Sdk\platform-tools\adb.exe install -r build/app/outputs/flutter-apk/app-release.apk
C:\Users\terek\AppData\Local\Android\Sdk\platform-tools\adb.exe shell monkey -p com.indoor.indoor_nav -c android.intent.category.LAUNCHER 1
```

Test checklist:
- Open a building → ↺ ↻ buttons visible in AppBar
- Press ↻ → map rotates 90° CW
- Press ↻ again → rotates another 90°
- Press ↺ → rotates back CCW
- Switch floor tab → rotation preserved; new floor auto-fits at current rotation angle
- Switch back to first floor → still rotated, no re-fit

- [ ] **Step 5: Commit**

```bash
cd D:/Claude/Navigation
git add apps/mobile/lib/screens/building_map_screen.dart
git commit -m "feat(mobile): add 90deg CW/CCW rotation buttons, persist rotation across floors"
```
