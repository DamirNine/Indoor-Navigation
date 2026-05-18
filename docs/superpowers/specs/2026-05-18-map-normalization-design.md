# Design: Map Normalization + Editor Fixes + Flutter Rotation

Date: 2026-05-18

## Overview

Four independent changes to the Indoor Navigation project:
1. `normalize.mjs` — normalize node spacing in `1_processed.json`
2. `rotate_corp180.mjs` — rotate `building-corp-processed.json` 180°
3. Web editor bug fix — Stage canvas not filling screen
4. Flutter app — 90° rotation buttons in map viewer

---

## 1. normalize.mjs (example_building/)

**Input:** `1_processed.json`  
**Output:** `1_processed.json` overwritten in place (or new file `1_normalized.json`)

### Phase A — Corridor spacing (floor 2)

Target chain: corridors at y≈2210, starting from room 230's corridor (`corridor-mp5jilud`, x=1765) going left toward and past room 228 (x decreasing). Total 9 corridors, x from 1765 to 1287.

Algorithm:
1. Collect chain: BFS from `corridor-mp5jilud`, follow corridor–corridor edges, keep only nodes with y within ±100 of 2210 and x ≤ 1765
2. Sort chain by x descending
3. Average step = (x_max − x_min) / (count − 1) = 478 / 8 ≈ 59.75 → round to 1 decimal
4. Assign new x to each corridor: `x_new[i] = x_max − i * avgStep`, y stays fixed
5. For each moved corridor: calculate `dx = x_new − x_old`, move all directly connected rooms by same dx (dy=0 since chain is horizontal); this preserves 90° angles

### Phase B — Room-to-corridor distance normalization (floor 2, all rooms)

Algorithm:
1. For each room node, find its nearest corridor via graph edges (direct edge only — rooms connect to exactly one corridor)
2. Compute Euclidean distance from room to that corridor
3. Mean distance = average over all rooms
4. For each room: determine dominant axis (if `|dx| < |dy|` → vertical connection → move along y; else → move along x)
5. Set new position: keep the shared axis coordinate, set other axis to `corridor_coord ± mean_dist` (sign preserved from original)

### 90° preservation

Both phases only move nodes along a single axis (x or y), so all existing right-angle connections remain 90°.

---

## 2. rotate_corp180.mjs (example_building/)

**Input:** `building-corp-processed.json`  
**Output:** overwritten in place

Algorithm:
- Compute bbox of all node coordinates: `minX, maxX, minY, maxY`
- For every point `[x, y]`: `x' = minX + maxX − x`, `y' = minY + maxY − y`
- Apply to: `floors[*].nodes[*].{x,y}`, `floors[*].contours[*][*]`, `floors[*].areas[*].points[*]`

---

## 3. Web editor bug — Stage canvas size (apps/editor/src/components/FloorCanvas.tsx)

**Problem:** `stageSize` initializes at `{ w: 800, h: 500 }`. ResizeObserver fires asynchronously, so on first render the Stage canvas is 800×500, not full-screen. If the observer doesn't fire before user interaction, the canvas stays small.

**Fix:** In the ResizeObserver `useEffect`, before calling `ro.observe(el)`, read current size immediately via `getBoundingClientRect()` and call `setStageSize` synchronously. This ensures the Stage is correctly sized on first paint.

```ts
useEffect(() => {
  const el = containerRef.current;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0)
    setStageSize({ w: Math.floor(rect.width), h: Math.floor(rect.height) });
  const ro = new ResizeObserver(entries => { ... }); // existing code
  ro.observe(el);
  return () => ro.disconnect();
}, []);
```

---

## 4. Flutter — 90° rotation buttons (apps/mobile/lib/screens/building_map_screen.dart)

**State:** Add `int _rotationIndex = 0` to `_BuildingMapScreenState`. Not reset on floor tab change.

**UI:** Two `IconButton`s in AppBar actions: `Icons.rotate_left` (CCW) and `Icons.rotate_right` (CW).

**Rotation logic:**
```dart
void _rotate(int delta) {
  setState(() => _rotationIndex = (_rotationIndex + delta) % 4);
  final angle = _rotationIndex * math.pi / 2;
  final size = MediaQuery.of(context).size;
  final cx = size.width / 2, cy = size.height / 2;
  final m = Matrix4.identity()
    ..translate(cx, cy)
    ..rotateZ(angle)
    ..translate(-cx, -cy);
  _controller.value = m;
}
```

Apply: `_rotate(1)` for CW, `_rotate(-1 + 4)` for CCW (i.e., `_rotate(3)`).

The `_controller` is the existing `TransformationController` on `InteractiveViewer`.

---

## 5. GitHub deploy

After editor fix: bump version to `v1.3.0` in `package.json` and `App.tsx`, commit and push to master (auto-deploys to GitHub Pages).
