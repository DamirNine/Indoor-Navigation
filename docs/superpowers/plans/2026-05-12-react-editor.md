# React Map Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Static React SPA for creating indoor building maps and exporting them as `building.zip` (JSON + floor images) — no server required.

**Architecture:** Zustand store holds all building state (floors, nodes, edges, cross-floor edges). Konva.js renders the interactive canvas. Export serialises state to `building.json` and bundles it with images via JSZip. Vitest + Testing Library for unit/component tests; Playwright for E2E.

**Tech Stack:** React 19 · TypeScript · Vite · react-konva · Zustand · JSZip · Vitest · @testing-library/react · Playwright

---

## File Map

```
apps/editor/
  src/
    types/
      building.ts            # TypeScript interfaces matching building.json schema
    store/
      editorStore.ts         # Zustand store: all building state + UI state + actions
    lib/
      validation.ts          # validateBuilding() → ValidationError[]
      export.ts              # buildingToJson() + exportZip()
    components/
      App.tsx                # Root layout (sidebar + canvas + right panel)
      BuildingPanel.tsx      # Building id + name inputs
      FloorList.tsx          # Add/remove floors, image upload
      Toolbar.tsx            # Select / Node / Edge tool switcher
      FloorCanvas.tsx        # Konva stage: background, nodes, edges, interaction
      AddNodeDialog.tsx      # Modal: type + label when placing node
      AddEdgeDialog.tsx      # Modal: type + weight when connecting two nodes
      NodeProperties.tsx     # Right panel when node is selected
      EdgeProperties.tsx     # Right panel when edge is selected
      CrossFloorDialog.tsx   # Modal: manage cross-floor stair/elevator links
      ExportButton.tsx       # Validate + download ZIP
    test/
      setup.ts               # @testing-library/jest-dom import
      unit/
        validation.test.ts
        export.test.ts
        editorStore.test.ts
      component/
        BuildingPanel.test.tsx
        AddNodeDialog.test.tsx
      e2e/
        editor.spec.ts
  vite.config.ts
  playwright.config.ts
  index.html
```

---

### Task 1: Project setup

**Files:**
- Create: `apps/editor/` (Vite project)
- Modify: `apps/editor/vite.config.ts`
- Create: `apps/editor/playwright.config.ts`
- Create: `apps/editor/src/test/setup.ts`

- [ ] **Step 1: Scaffold Vite project and install deps**

```powershell
cd d:\Claude\Navigation
npm create vite@latest apps/editor -- --template react-ts
cd apps/editor
npm install react-konva konva zustand jszip
npm install -D vitest @vitest/coverage-v8 @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
npm install -D @playwright/test
npx playwright install chromium
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 2: Replace vite.config.ts**

```typescript
// apps/editor/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

- [ ] **Step 3: Create test setup**

```typescript
// apps/editor/src/test/setup.ts
import '@testing-library/jest-dom';
```

- [ ] **Step 4: Create playwright.config.ts**

```typescript
// apps/editor/playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './src/test/e2e',
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
  use: { baseURL: 'http://localhost:5173' },
});
```

- [ ] **Step 5: Add scripts to package.json**

Open `apps/editor/package.json` and replace the `"scripts"` section:

```json
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "preview": "vite preview",
  "test": "vitest",
  "test:e2e": "playwright test",
  "lint": "eslint ."
}
```

- [ ] **Step 6: Verify setup**

```powershell
cd d:\Claude\Navigation\apps\editor
npx vitest run
```

Expected: `No test files found` (no errors).

- [ ] **Step 7: Commit**

```powershell
cd d:\Claude\Navigation
git add apps/editor
git commit -m "feat: scaffold React editor with Vite, Konva, Zustand, Vitest, Playwright"
```

---

### Task 2: Types

**Files:**
- Create: `apps/editor/src/types/building.ts`

- [ ] **Step 1: Create types**

```typescript
// apps/editor/src/types/building.ts
export type NodeType = 'room' | 'stairs' | 'elevator' | 'entrance';
export type EdgeType = 'walk' | 'stairs' | 'elevator';
export type Tool = 'select' | 'node' | 'edge';

export interface NavNode {
  id: string;
  type: NodeType;
  label: string;
  x: number;
  y: number;
}

export interface NavEdge {
  from: string;
  to: string;
  type: EdgeType;
  weight: number;
}

export interface CrossFloorEdge {
  from: string;
  to: string;
  type: EdgeType;
  weight: number;
}

export interface Floor {
  level: number;
  name: string;
  image?: string;        // filename written into JSON
  imageFile?: File;      // in-memory only, NOT serialised
  imageDataUrl?: string; // in-memory only, NOT serialised
  nodes: NavNode[];
  edges: NavEdge[];
}

export interface Building {
  id: string;
  name: string;
  floors: Floor[];
  crossFloorEdges: CrossFloorEdge[];
}
```

- [ ] **Step 2: Commit**

```powershell
cd d:\Claude\Navigation
git add apps/editor/src/types
git commit -m "feat: add TypeScript types for building.json schema"
```

---

### Task 3: Zustand store

**Files:**
- Create: `apps/editor/src/store/editorStore.ts`
- Create: `apps/editor/src/test/unit/editorStore.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/editor/src/test/unit/editorStore.test.ts
import { describe, test, expect, beforeEach } from 'vitest';
import { useEditorStore } from '../../store/editorStore';

const reset = () =>
  useEditorStore.setState({
    building: { id: '', name: '', floors: [], crossFloorEdges: [] },
    activeFloorIndex: 0,
    tool: 'select',
    selectedNodeId: null,
    selectedEdgeKey: null,
    pendingEdgeFromId: null,
  });

describe('editorStore', () => {
  beforeEach(reset);

  test('addFloor adds floor and sets it active', () => {
    useEditorStore.getState().addFloor(1, '1 этаж');
    const { building, activeFloorIndex } = useEditorStore.getState();
    expect(building.floors).toHaveLength(1);
    expect(building.floors[0].level).toBe(1);
    expect(activeFloorIndex).toBe(0);
  });

  test('addNode adds to active floor', () => {
    const s = useEditorStore.getState();
    s.addFloor(1, 'F1');
    s.addNode({ id: 'n1', type: 'room', label: 'Room 1', x: 100, y: 100 });
    expect(useEditorStore.getState().building.floors[0].nodes).toHaveLength(1);
  });

  test('deleteNode removes connected same-floor and cross-floor edges', () => {
    const s = useEditorStore.getState();
    s.addFloor(1, 'F1');
    s.addNode({ id: 'n1', type: 'room', label: 'A', x: 0, y: 0 });
    s.addNode({ id: 'n2', type: 'stairs', label: 'S', x: 50, y: 0 });
    s.addEdge({ from: 'n1', to: 'n2', type: 'walk', weight: 10 });
    s.addCrossFloorEdge({ from: 'n2', to: 'n3', type: 'stairs', weight: 5 });
    s.deleteNode('n2');
    const { building } = useEditorStore.getState();
    expect(building.floors[0].edges).toHaveLength(0);
    expect(building.crossFloorEdges).toHaveLength(0);
  });

  test('setBuildingInfo updates id and name', () => {
    useEditorStore.getState().setBuildingInfo('korpus-a', 'Корпус А');
    const { building } = useEditorStore.getState();
    expect(building.id).toBe('korpus-a');
    expect(building.name).toBe('Корпус А');
  });

  test('setTool resets selection and pendingEdgeFromId', () => {
    useEditorStore.setState({ selectedNodeId: 'x', pendingEdgeFromId: 'y' });
    useEditorStore.getState().setTool('node');
    const s = useEditorStore.getState();
    expect(s.selectedNodeId).toBeNull();
    expect(s.pendingEdgeFromId).toBeNull();
  });
});
```

- [ ] **Step 2: Run — verify fails**

```powershell
cd d:\Claude\Navigation\apps\editor
npx vitest run src/test/unit/editorStore.test.ts
```

Expected: FAILED — `editorStore` not found.

- [ ] **Step 3: Create editorStore.ts**

```typescript
// apps/editor/src/store/editorStore.ts
import { create } from 'zustand';
import { Building, Floor, NavNode, NavEdge, CrossFloorEdge, Tool } from '../types/building';

const emptyBuilding = (): Building => ({
  id: '', name: '', floors: [], crossFloorEdges: [],
});

interface EditorState {
  building: Building;
  activeFloorIndex: number;
  tool: Tool;
  selectedNodeId: string | null;
  selectedEdgeKey: string | null; // "fromId->toId"
  pendingEdgeFromId: string | null;

  setBuildingInfo: (id: string, name: string) => void;
  addFloor: (level: number, name: string) => void;
  removeFloor: (index: number) => void;
  setFloorImage: (index: number, file: File, dataUrl: string, filename: string) => void;
  setActiveFloor: (index: number) => void;
  addNode: (node: NavNode) => void;
  updateNode: (id: string, updates: Partial<Omit<NavNode, 'id'>>) => void;
  deleteNode: (id: string) => void;
  addEdge: (edge: NavEdge) => void;
  updateEdge: (from: string, to: string, updates: Partial<Pick<NavEdge, 'type' | 'weight'>>) => void;
  deleteEdge: (from: string, to: string) => void;
  addCrossFloorEdge: (edge: CrossFloorEdge) => void;
  deleteCrossFloorEdge: (from: string, to: string) => void;
  setTool: (tool: Tool) => void;
  selectNode: (id: string | null) => void;
  selectEdge: (key: string | null) => void;
  setPendingEdgeFrom: (id: string | null) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  building: emptyBuilding(),
  activeFloorIndex: 0,
  tool: 'select',
  selectedNodeId: null,
  selectedEdgeKey: null,
  pendingEdgeFromId: null,

  setBuildingInfo: (id, name) =>
    set(s => ({ building: { ...s.building, id, name } })),

  addFloor: (level, name) =>
    set(s => ({
      building: { ...s.building, floors: [...s.building.floors, { level, name, nodes: [], edges: [] }] },
      activeFloorIndex: s.building.floors.length,
    })),

  removeFloor: (index) =>
    set(s => {
      const removed = s.building.floors[index];
      const removedIds = new Set(removed.nodes.map(n => n.id));
      const floors = s.building.floors.filter((_, i) => i !== index);
      const crossFloorEdges = s.building.crossFloorEdges.filter(
        e => !removedIds.has(e.from) && !removedIds.has(e.to)
      );
      return {
        building: { ...s.building, floors, crossFloorEdges },
        activeFloorIndex: Math.min(s.activeFloorIndex, Math.max(0, floors.length - 1)),
      };
    }),

  setFloorImage: (index, file, dataUrl, filename) =>
    set(s => {
      const floors = [...s.building.floors];
      floors[index] = { ...floors[index], image: filename, imageFile: file, imageDataUrl: dataUrl };
      return { building: { ...s.building, floors } };
    }),

  setActiveFloor: (index) => set({ activeFloorIndex: index }),

  addNode: (node) =>
    set(s => {
      const floors = [...s.building.floors];
      const i = s.activeFloorIndex;
      floors[i] = { ...floors[i], nodes: [...floors[i].nodes, node] };
      return { building: { ...s.building, floors } };
    }),

  updateNode: (id, updates) =>
    set(s => ({
      building: {
        ...s.building,
        floors: s.building.floors.map(f => ({
          ...f, nodes: f.nodes.map(n => n.id === id ? { ...n, ...updates } : n),
        })),
      },
    })),

  deleteNode: (id) =>
    set(s => {
      const floors = s.building.floors.map(f => ({
        ...f,
        nodes: f.nodes.filter(n => n.id !== id),
        edges: f.edges.filter(e => e.from !== id && e.to !== id),
      }));
      return {
        building: {
          ...s.building, floors,
          crossFloorEdges: s.building.crossFloorEdges.filter(e => e.from !== id && e.to !== id),
        },
        selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
      };
    }),

  addEdge: (edge) =>
    set(s => {
      const floors = [...s.building.floors];
      const i = s.activeFloorIndex;
      floors[i] = { ...floors[i], edges: [...floors[i].edges, edge] };
      return { building: { ...s.building, floors } };
    }),

  updateEdge: (from, to, updates) =>
    set(s => ({
      building: {
        ...s.building,
        floors: s.building.floors.map(f => ({
          ...f,
          edges: f.edges.map(e =>
            (e.from === from && e.to === to) || (e.from === to && e.to === from)
              ? { ...e, ...updates } : e
          ),
        })),
      },
    })),

  deleteEdge: (from, to) =>
    set(s => ({
      building: {
        ...s.building,
        floors: s.building.floors.map(f => ({
          ...f,
          edges: f.edges.filter(
            e => !((e.from === from && e.to === to) || (e.from === to && e.to === from))
          ),
        })),
      },
      selectedEdgeKey: null,
    })),

  addCrossFloorEdge: (edge) =>
    set(s => ({ building: { ...s.building, crossFloorEdges: [...s.building.crossFloorEdges, edge] } })),

  deleteCrossFloorEdge: (from, to) =>
    set(s => ({
      building: {
        ...s.building,
        crossFloorEdges: s.building.crossFloorEdges.filter(
          e => !((e.from === from && e.to === to) || (e.from === to && e.to === from))
        ),
      },
    })),

  setTool: (tool) => set({ tool, selectedNodeId: null, selectedEdgeKey: null, pendingEdgeFromId: null }),
  selectNode: (id) => set({ selectedNodeId: id, selectedEdgeKey: null }),
  selectEdge: (key) => set({ selectedEdgeKey: key, selectedNodeId: null }),
  setPendingEdgeFrom: (id) => set({ pendingEdgeFromId: id }),
}));
```

- [ ] **Step 4: Run — verify pass**

```powershell
npx vitest run src/test/unit/editorStore.test.ts
```

Expected: 5 tests passed.

- [ ] **Step 5: Commit**

```powershell
cd d:\Claude\Navigation
git add apps/editor/src/store apps/editor/src/test/unit/editorStore.test.ts
git commit -m "feat: add Zustand editor store with building/node/edge actions"
```

---

### Task 4: Validation

**Files:**
- Create: `apps/editor/src/lib/validation.ts`
- Create: `apps/editor/src/test/unit/validation.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/editor/src/test/unit/validation.test.ts
import { describe, test, expect } from 'vitest';
import { validateBuilding } from '../../lib/validation';
import { Building } from '../../types/building';

const makeBuilding = (): Building => ({
  id: 'b1',
  name: 'Test',
  floors: [{
    level: 1, name: 'F1',
    nodes: [
      { id: 'a', type: 'room', label: 'A', x: 0, y: 0 },
      { id: 'b', type: 'room', label: 'B', x: 10, y: 0 },
    ],
    edges: [{ from: 'a', to: 'b', type: 'walk', weight: 10 }],
  }],
  crossFloorEdges: [],
});

describe('validateBuilding', () => {
  test('valid building returns no errors', () => {
    expect(validateBuilding(makeBuilding())).toHaveLength(0);
  });

  test('missing id returns error', () => {
    const errors = validateBuilding({ ...makeBuilding(), id: '' });
    expect(errors.some(e => e.message.includes('ID'))).toBe(true);
  });

  test('no floors returns error', () => {
    const errors = validateBuilding({ ...makeBuilding(), floors: [] });
    expect(errors.some(e => e.message.includes('этаж'))).toBe(true);
  });

  test('isolated node returns error with node label', () => {
    const b = makeBuilding();
    b.floors[0].nodes.push({ id: 'c', type: 'room', label: 'Isolated', x: 20, y: 0 });
    const errors = validateBuilding(b);
    expect(errors.some(e => e.message.includes('Isolated'))).toBe(true);
  });

  test('duplicate node ID returns error', () => {
    const b = makeBuilding();
    b.floors[0].nodes.push({ id: 'a', type: 'room', label: 'Dup', x: 5, y: 5 });
    const errors = validateBuilding(b);
    expect(errors.some(e => e.message.includes('a'))).toBe(true);
  });

  test('connected via cross_floor_edge is not isolated', () => {
    const b = makeBuilding();
    b.floors[0].nodes.push({ id: 'stairs-f1', type: 'stairs', label: 'Stairs', x: 30, y: 0 });
    b.crossFloorEdges.push({ from: 'stairs-f1', to: 'stairs-f2', type: 'stairs', weight: 5 });
    // stairs-f1 is connected via cross-floor edge, not isolated
    const errors = validateBuilding(b);
    expect(errors.every(e => !e.message.includes('Stairs'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run — verify fails**

```powershell
npx vitest run src/test/unit/validation.test.ts
```

Expected: FAILED.

- [ ] **Step 3: Implement validation.ts**

```typescript
// apps/editor/src/lib/validation.ts
import { Building } from '../types/building';

export interface ValidationError { message: string; }

export function validateBuilding(building: Building): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!building.id.trim()) errors.push({ message: 'Укажите ID здания' });
  if (!building.name.trim()) errors.push({ message: 'Укажите название здания' });
  if (building.floors.length === 0) {
    errors.push({ message: 'Добавьте хотя бы один этаж' });
    return errors;
  }

  const allIds = new Map<string, string>();
  for (const floor of building.floors) {
    for (const node of floor.nodes) {
      if (allIds.has(node.id)) {
        errors.push({ message: `Дублирующийся ID узла: ${node.id}` });
      }
      allIds.set(node.id, floor.name);
    }
  }

  const allNodeIds = new Set(allIds.keys());
  for (const floor of building.floors) {
    for (const edge of floor.edges) {
      if (!allNodeIds.has(edge.from)) errors.push({ message: `Неизвестный узел: ${edge.from}` });
      if (!allNodeIds.has(edge.to)) errors.push({ message: `Неизвестный узел: ${edge.to}` });
    }
  }
  for (const edge of building.crossFloorEdges) {
    if (!allNodeIds.has(edge.from)) errors.push({ message: `Неизвестный узел в межэтажном ребре: ${edge.from}` });
    if (!allNodeIds.has(edge.to)) errors.push({ message: `Неизвестный узел в межэтажном ребре: ${edge.to}` });
  }

  const connectedIds = new Set<string>();
  for (const floor of building.floors) {
    for (const edge of floor.edges) {
      connectedIds.add(edge.from);
      connectedIds.add(edge.to);
    }
  }
  for (const edge of building.crossFloorEdges) {
    connectedIds.add(edge.from);
    connectedIds.add(edge.to);
  }
  for (const floor of building.floors) {
    for (const node of floor.nodes) {
      if (!connectedIds.has(node.id)) {
        errors.push({ message: `Изолированный узел: "${node.label}" (${floor.name})` });
      }
    }
  }

  return errors;
}
```

- [ ] **Step 4: Run — verify pass**

```powershell
npx vitest run src/test/unit/validation.test.ts
```

Expected: 6 tests passed.

- [ ] **Step 5: Commit**

```powershell
cd d:\Claude\Navigation
git add apps/editor/src/lib/validation.ts apps/editor/src/test/unit/validation.test.ts
git commit -m "feat: add building graph validation"
```

---

### Task 5: Export

**Files:**
- Create: `apps/editor/src/lib/export.ts`
- Create: `apps/editor/src/test/unit/export.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/editor/src/test/unit/export.test.ts
import { describe, test, expect } from 'vitest';
import { buildingToJson } from '../../lib/export';
import { Building } from '../../types/building';

const building: Building = {
  id: 'test',
  name: 'Test Building',
  floors: [{
    level: 1,
    name: '1 этаж',
    image: 'floor1.png',
    imageFile: new File([], 'floor1.png'),
    imageDataUrl: 'data:image/png;base64,abc',
    nodes: [{ id: 'r1', type: 'room', label: 'Room 1', x: 100, y: 100 }],
    edges: [],
  }],
  crossFloorEdges: [{ from: 'a', to: 'b', type: 'stairs', weight: 5 }],
};

describe('buildingToJson', () => {
  test('produces correct top-level structure', () => {
    const json = JSON.parse(buildingToJson(building));
    expect(json.id).toBe('test');
    expect(json.name).toBe('Test Building');
    expect(json.floors).toHaveLength(1);
  });

  test('uses cross_floor_edges key (snake_case)', () => {
    const json = JSON.parse(buildingToJson(building));
    expect(json).toHaveProperty('cross_floor_edges');
    expect(json).not.toHaveProperty('crossFloorEdges');
  });

  test('excludes imageFile and imageDataUrl from output', () => {
    const json = JSON.parse(buildingToJson(building));
    expect(json.floors[0]).not.toHaveProperty('imageFile');
    expect(json.floors[0]).not.toHaveProperty('imageDataUrl');
  });

  test('includes image filename when set', () => {
    const json = JSON.parse(buildingToJson(building));
    expect(json.floors[0].image).toBe('floor1.png');
  });

  test('omits image key when not set', () => {
    const b: Building = { ...building, floors: [{ ...building.floors[0], image: undefined }] };
    const json = JSON.parse(buildingToJson(b));
    expect(json.floors[0]).not.toHaveProperty('image');
  });
});
```

- [ ] **Step 2: Run — verify fails**

```powershell
npx vitest run src/test/unit/export.test.ts
```

Expected: FAILED.

- [ ] **Step 3: Implement export.ts**

```typescript
// apps/editor/src/lib/export.ts
import JSZip from 'jszip';
import { Building } from '../types/building';

export function buildingToJson(building: Building): string {
  const output = {
    id: building.id,
    name: building.name,
    floors: building.floors.map(floor => {
      const f: Record<string, unknown> = {
        level: floor.level,
        name: floor.name,
        nodes: floor.nodes,
        edges: floor.edges,
      };
      if (floor.image) f['image'] = floor.image;
      return f;
    }),
    cross_floor_edges: building.crossFloorEdges,
  };
  return JSON.stringify(output, null, 2);
}

export async function exportZip(building: Building): Promise<Blob> {
  const zip = new JSZip();
  zip.file('building.json', buildingToJson(building));
  for (const floor of building.floors) {
    if (floor.imageFile && floor.image) {
      zip.file(floor.image, floor.imageFile);
    }
  }
  return zip.generateAsync({ type: 'blob' });
}
```

- [ ] **Step 4: Run — verify pass**

```powershell
npx vitest run src/test/unit/export.test.ts
```

Expected: 5 tests passed.

- [ ] **Step 5: Commit**

```powershell
cd d:\Claude\Navigation
git add apps/editor/src/lib/export.ts apps/editor/src/test/unit/export.test.ts
git commit -m "feat: add JSON serialiser and ZIP export"
```

---

### Task 6: App shell + BuildingPanel

**Files:**
- Modify: `apps/editor/src/main.tsx`
- Create: `apps/editor/src/App.tsx`
- Create: `apps/editor/src/components/BuildingPanel.tsx`
- Create: `apps/editor/src/test/component/BuildingPanel.test.tsx`

- [ ] **Step 1: Update main.tsx**

```tsx
// apps/editor/src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 2: Create App.tsx**

```tsx
// apps/editor/src/App.tsx
import { useState } from 'react';
import BuildingPanel from './components/BuildingPanel';
import FloorList from './components/FloorList';
import Toolbar from './components/Toolbar';
import FloorCanvas from './components/FloorCanvas';
import NodeProperties from './components/NodeProperties';
import EdgeProperties from './components/EdgeProperties';
import CrossFloorDialog from './components/CrossFloorDialog';
import ExportButton from './components/ExportButton';
import { useEditorStore } from './store/editorStore';

export default function App() {
  const [crossFloorOpen, setCrossFloorOpen] = useState(false);
  const selectedNodeId = useEditorStore(s => s.selectedNodeId);
  const selectedEdgeKey = useEditorStore(s => s.selectedEdgeKey);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: 'sans-serif' }}>
      <div style={{ width: 260, borderRight: '1px solid #ddd', overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16, boxSizing: 'border-box' }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Редактор карт</h2>
        <BuildingPanel />
        <FloorList />
        <button onClick={() => setCrossFloorOpen(true)}>Межэтажные связи</button>
        <ExportButton />
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Toolbar />
        <FloorCanvas />
      </div>
      {selectedNodeId && (
        <div style={{ width: 220, borderLeft: '1px solid #ddd', padding: 16, overflowY: 'auto' }}>
          <NodeProperties />
        </div>
      )}
      {selectedEdgeKey && (
        <div style={{ width: 220, borderLeft: '1px solid #ddd', padding: 16, overflowY: 'auto' }}>
          <EdgeProperties />
        </div>
      )}
      {crossFloorOpen && <CrossFloorDialog onClose={() => setCrossFloorOpen(false)} />}
    </div>
  );
}
```

- [ ] **Step 3: Create BuildingPanel.tsx**

```tsx
// apps/editor/src/components/BuildingPanel.tsx
import { useEditorStore } from '../store/editorStore';

export default function BuildingPanel() {
  const { building, setBuildingInfo } = useEditorStore();
  return (
    <div>
      <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Здание</h3>
      <label style={{ display: 'block', marginBottom: 6 }}>
        ID<br />
        <input
          data-testid="building-id"
          value={building.id}
          onChange={e => setBuildingInfo(e.target.value, building.name)}
          placeholder="korpus-a"
          style={{ width: '100%', boxSizing: 'border-box' }}
        />
      </label>
      <label style={{ display: 'block' }}>
        Название<br />
        <input
          data-testid="building-name"
          value={building.name}
          onChange={e => setBuildingInfo(building.id, e.target.value)}
          placeholder="Корпус А"
          style={{ width: '100%', boxSizing: 'border-box' }}
        />
      </label>
    </div>
  );
}
```

- [ ] **Step 4: Write component test**

```tsx
// apps/editor/src/test/component/BuildingPanel.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, beforeEach } from 'vitest';
import BuildingPanel from '../../components/BuildingPanel';
import { useEditorStore } from '../../store/editorStore';

beforeEach(() => {
  useEditorStore.setState({
    building: { id: '', name: '', floors: [], crossFloorEdges: [] },
    activeFloorIndex: 0, tool: 'select',
    selectedNodeId: null, selectedEdgeKey: null, pendingEdgeFromId: null,
  });
});

describe('BuildingPanel', () => {
  test('updates building id on input', async () => {
    render(<BuildingPanel />);
    await userEvent.type(screen.getByTestId('building-id'), 'korpus-a');
    expect(useEditorStore.getState().building.id).toBe('korpus-a');
  });

  test('updates building name on input', async () => {
    render(<BuildingPanel />);
    await userEvent.type(screen.getByTestId('building-name'), 'Корпус А');
    expect(useEditorStore.getState().building.name).toBe('Корпус А');
  });
});
```

- [ ] **Step 5: Run component tests**

```powershell
npx vitest run src/test/component/BuildingPanel.test.tsx
```

Expected: 2 tests passed.

- [ ] **Step 6: Commit**

```powershell
cd d:\Claude\Navigation
git add apps/editor/src
git commit -m "feat: add App shell and BuildingPanel"
```

---

### Task 7: FloorList

**Files:**
- Create: `apps/editor/src/components/FloorList.tsx`

- [ ] **Step 1: Create FloorList.tsx**

```tsx
// apps/editor/src/components/FloorList.tsx
import { useRef } from 'react';
import { useEditorStore } from '../store/editorStore';

export default function FloorList() {
  const { building, activeFloorIndex, addFloor, removeFloor, setFloorImage, setActiveFloor } = useEditorStore();
  const fileInputs = useRef<Map<number, HTMLInputElement>>(new Map());

  const handleAdd = () => {
    const nextLevel = (building.floors.at(-1)?.level ?? 0) + 1;
    addFloor(nextLevel, `${nextLevel} этаж`);
  };

  const handleImageUpload = (index: number, file: File) => {
    const reader = new FileReader();
    reader.onload = () => setFloorImage(index, file, reader.result as string, file.name);
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Этажи</h3>
      {building.floors.map((floor, i) => (
        <div
          key={i}
          style={{
            padding: '6px 8px', marginBottom: 4, borderRadius: 4, cursor: 'pointer',
            background: i === activeFloorIndex ? '#e3f2fd' : '#f5f5f5',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}
        >
          <span onClick={() => setActiveFloor(i)} style={{ flex: 1, fontSize: 13 }}>
            {floor.name}
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              data-testid={`upload-floor-${i}`}
              style={{ fontSize: 11, padding: '2px 6px' }}
              onClick={() => fileInputs.current.get(i)?.click()}
              title="Загрузить план этажа"
            >
              {floor.image ? '✓' : '🖼'}
            </button>
            <button
              data-testid={`remove-floor-${i}`}
              style={{ fontSize: 11, padding: '2px 6px', color: 'red' }}
              onClick={() => removeFloor(i)}
            >
              ✕
            </button>
          </div>
          <input
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            ref={el => { if (el) fileInputs.current.set(i, el); }}
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) handleImageUpload(i, file);
            }}
          />
        </div>
      ))}
      <button
        data-testid="add-floor"
        onClick={handleAdd}
        style={{ width: '100%', marginTop: 4, padding: '4px 0' }}
      >
        + Добавить этаж
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```powershell
cd d:\Claude\Navigation
git add apps/editor/src/components/FloorList.tsx
git commit -m "feat: add FloorList with image upload"
```

---

### Task 8: FloorCanvas + dialogs

**Files:**
- Create: `apps/editor/src/components/AddNodeDialog.tsx`
- Create: `apps/editor/src/components/AddEdgeDialog.tsx`
- Create: `apps/editor/src/components/FloorCanvas.tsx`
- Create: `apps/editor/src/test/component/AddNodeDialog.test.tsx`

- [ ] **Step 1: Create AddNodeDialog.tsx**

```tsx
// apps/editor/src/components/AddNodeDialog.tsx
import { useState } from 'react';
import { NodeType } from '../types/building';

interface Props {
  onConfirm: (type: NodeType, label: string) => void;
  onCancel: () => void;
}

export default function AddNodeDialog({ onConfirm, onCancel }: Props) {
  const [type, setType] = useState<NodeType>('room');
  const [label, setLabel] = useState('');

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: 'white', padding: 24, borderRadius: 8, minWidth: 280 }}>
        <h3 style={{ margin: '0 0 16px' }}>Добавить узел</h3>
        <label style={{ display: 'block', marginBottom: 12 }}>
          Тип<br />
          <select data-testid="node-type" value={type} onChange={e => setType(e.target.value as NodeType)} style={{ width: '100%' }}>
            <option value="room">Кабинет</option>
            <option value="stairs">Лестница</option>
            <option value="elevator">Лифт</option>
            <option value="entrance">Вход</option>
          </select>
        </label>
        <label style={{ display: 'block', marginBottom: 16 }}>
          Название<br />
          <input
            data-testid="node-label"
            value={label}
            onChange={e => setLabel(e.target.value)}
            autoFocus
            placeholder="Кабинет 101"
            style={{ width: '100%', boxSizing: 'border-box' }}
            onKeyDown={e => { if (e.key === 'Enter' && label.trim()) onConfirm(type, label.trim()); if (e.key === 'Escape') onCancel(); }}
          />
        </label>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel}>Отмена</button>
          <button data-testid="node-confirm" disabled={!label.trim()} onClick={() => onConfirm(type, label.trim())}>
            Добавить
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create AddEdgeDialog.tsx**

```tsx
// apps/editor/src/components/AddEdgeDialog.tsx
import { useState } from 'react';
import { EdgeType } from '../types/building';

interface Props {
  fromLabel: string;
  toLabel: string;
  onConfirm: (type: EdgeType, weight: number) => void;
  onCancel: () => void;
}

export default function AddEdgeDialog({ fromLabel, toLabel, onConfirm, onCancel }: Props) {
  const [type, setType] = useState<EdgeType>('walk');
  const [weight, setWeight] = useState('10');

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: 'white', padding: 24, borderRadius: 8, minWidth: 280 }}>
        <h3 style={{ margin: '0 0 8px' }}>Добавить связь</h3>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#666' }}>{fromLabel} → {toLabel}</p>
        <label style={{ display: 'block', marginBottom: 12 }}>
          Тип<br />
          <select data-testid="edge-type" value={type} onChange={e => setType(e.target.value as EdgeType)} style={{ width: '100%' }}>
            <option value="walk">Коридор</option>
            <option value="stairs">Лестница</option>
            <option value="elevator">Лифт</option>
          </select>
        </label>
        <label style={{ display: 'block', marginBottom: 16 }}>
          Вес (метры)<br />
          <input data-testid="edge-weight" type="number" min="0.1" step="0.5" value={weight} onChange={e => setWeight(e.target.value)} style={{ width: '100%', boxSizing: 'border-box' }} />
        </label>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel}>Отмена</button>
          <button data-testid="edge-confirm" onClick={() => onConfirm(type, parseFloat(weight) || 10)}>Добавить</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create FloorCanvas.tsx**

```tsx
// apps/editor/src/components/FloorCanvas.tsx
import { useEffect, useState, useCallback } from 'react';
import { Stage, Layer, Circle, Line, Image as KonvaImage, Rect, Text, Group } from 'react-konva';
import { useEditorStore } from '../store/editorStore';
import AddNodeDialog from './AddNodeDialog';
import AddEdgeDialog from './AddEdgeDialog';
import { NavNode, NodeType, EdgeType } from '../types/building';

const STAGE_W = 1000;
const STAGE_H = 680;

const NODE_COLOR: Record<NodeType, string> = {
  room: '#1976D2',
  stairs: '#F57C00',
  elevator: '#7B1FA2',
  entrance: '#2E7D32',
};

export default function FloorCanvas() {
  const {
    building, activeFloorIndex, tool, selectedNodeId, selectedEdgeKey, pendingEdgeFromId,
    addNode, selectNode, selectEdge, setPendingEdgeFrom, addEdge,
  } = useEditorStore();

  const floor = building.floors[activeFloorIndex];
  const [addNodePos, setAddNodePos] = useState<{ x: number; y: number } | null>(null);
  const [pendingEdgeTo, setPendingEdgeTo] = useState<NavNode | null>(null);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!floor?.imageDataUrl) { setBgImage(null); return; }
    const img = new window.Image();
    img.onload = () => setBgImage(img);
    img.src = floor.imageDataUrl;
  }, [floor?.imageDataUrl]);

  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') { setPendingEdgeFrom(null); setPendingEdgeTo(null); }
  }, [setPendingEdgeFrom]);

  useEffect(() => {
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [handleEscape]);

  if (!floor) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', background: '#f5f5f5' }}>
        Добавьте этаж в левой панели
      </div>
    );
  }

  const getNode = (id: string) => floor.nodes.find(n => n.id === id);

  const handleStageClick = (e: any) => {
    if (tool !== 'node') return;
    if (e.target !== e.target.getStage() && e.target.getClassName() !== 'Rect' && e.target.getClassName() !== 'Image') return;
    const pos = e.target.getStage().getPointerPosition();
    setAddNodePos({ x: pos.x, y: pos.y });
  };

  const handleNodeClick = (node: NavNode) => {
    if (tool === 'select') { selectNode(node.id); return; }
    if (tool === 'edge') {
      if (!pendingEdgeFromId) {
        setPendingEdgeFrom(node.id);
      } else if (pendingEdgeFromId === node.id) {
        setPendingEdgeFrom(null);
      } else {
        setPendingEdgeTo(node);
      }
    }
  };

  const handleAddNode = (type: NodeType, label: string) => {
    if (!addNodePos) return;
    const id = `${type}-${Date.now().toString(36)}`;
    addNode({ id, type, label, x: addNodePos.x, y: addNodePos.y });
    setAddNodePos(null);
  };

  const handleAddEdge = (type: EdgeType, weight: number) => {
    if (!pendingEdgeFromId || !pendingEdgeTo) return;
    addEdge({ from: pendingEdgeFromId, to: pendingEdgeTo.id, type, weight });
    setPendingEdgeFrom(null);
    setPendingEdgeTo(null);
  };

  return (
    <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#e0e0e0' }}>
      {pendingEdgeFromId && (
        <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', background: '#1976D2', color: 'white', padding: '4px 12px', borderRadius: 4, zIndex: 10, fontSize: 12, pointerEvents: 'none' }}>
          Кликните на второй узел • Esc — отмена
        </div>
      )}
      <Stage width={STAGE_W} height={STAGE_H} onClick={handleStageClick} style={{ cursor: tool === 'node' ? 'crosshair' : 'default' }}>
        <Layer>
          {bgImage
            ? <KonvaImage image={bgImage} width={STAGE_W} height={STAGE_H} />
            : <Rect width={STAGE_W} height={STAGE_H} fill="#e8e8e8" />
          }

          {floor.edges.map(edge => {
            const from = getNode(edge.from);
            const to = getNode(edge.to);
            if (!from || !to) return null;
            const key = `${edge.from}->${edge.to}`;
            const isSelected = selectedEdgeKey === key || selectedEdgeKey === `${edge.to}->${edge.from}`;
            return (
              <Line
                key={key}
                points={[from.x, from.y, to.x, to.y]}
                stroke={isSelected ? '#f44336' : '#555'}
                strokeWidth={isSelected ? 3 : 2}
                onClick={() => { if (tool === 'select') selectEdge(key); }}
                hitStrokeWidth={10}
              />
            );
          })}

          {floor.nodes.map(node => (
            <Group key={node.id} x={node.x} y={node.y} onClick={() => handleNodeClick(node)}>
              <Circle
                radius={12}
                fill={NODE_COLOR[node.type]}
                stroke={selectedNodeId === node.id || pendingEdgeFromId === node.id ? '#f44336' : 'white'}
                strokeWidth={selectedNodeId === node.id || pendingEdgeFromId === node.id ? 3 : 1.5}
              />
              <Text text={node.label} x={-node.label.length * 3} y={14} fontSize={11} fill="#333" />
            </Group>
          ))}
        </Layer>
      </Stage>

      {addNodePos && (
        <AddNodeDialog onConfirm={handleAddNode} onCancel={() => setAddNodePos(null)} />
      )}
      {pendingEdgeTo && pendingEdgeFromId && (() => {
        const fromNode = getNode(pendingEdgeFromId);
        return fromNode ? (
          <AddEdgeDialog
            fromLabel={fromNode.label}
            toLabel={pendingEdgeTo.label}
            onConfirm={handleAddEdge}
            onCancel={() => { setPendingEdgeTo(null); setPendingEdgeFrom(null); }}
          />
        ) : null;
      })()}
    </div>
  );
}
```

- [ ] **Step 4: Write AddNodeDialog component test**

```tsx
// apps/editor/src/test/component/AddNodeDialog.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi } from 'vitest';
import AddNodeDialog from '../../components/AddNodeDialog';

describe('AddNodeDialog', () => {
  test('confirm button disabled when label is empty', () => {
    render(<AddNodeDialog onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByTestId('node-confirm')).toBeDisabled();
  });

  test('calls onConfirm with type and label', async () => {
    const onConfirm = vi.fn();
    render(<AddNodeDialog onConfirm={onConfirm} onCancel={vi.fn()} />);
    await userEvent.type(screen.getByTestId('node-label'), 'Кабинет 101');
    await userEvent.selectOptions(screen.getByTestId('node-type'), 'room');
    await userEvent.click(screen.getByTestId('node-confirm'));
    expect(onConfirm).toHaveBeenCalledWith('room', 'Кабинет 101');
  });

  test('calls onCancel when Escape pressed', async () => {
    const onCancel = vi.fn();
    render(<AddNodeDialog onConfirm={vi.fn()} onCancel={onCancel} />);
    await userEvent.type(screen.getByTestId('node-label'), '{Escape}');
    expect(onCancel).toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: Run component tests**

```powershell
npx vitest run src/test/component/
```

Expected: All passed.

- [ ] **Step 6: Commit**

```powershell
cd d:\Claude\Navigation
git add apps/editor/src/components/AddNodeDialog.tsx apps/editor/src/components/AddEdgeDialog.tsx apps/editor/src/components/FloorCanvas.tsx apps/editor/src/test/component/AddNodeDialog.test.tsx
git commit -m "feat: add FloorCanvas with Konva node/edge editing and dialogs"
```

---

### Task 9: Toolbar + Properties panels

**Files:**
- Create: `apps/editor/src/components/Toolbar.tsx`
- Create: `apps/editor/src/components/NodeProperties.tsx`
- Create: `apps/editor/src/components/EdgeProperties.tsx`

- [ ] **Step 1: Create Toolbar.tsx**

```tsx
// apps/editor/src/components/Toolbar.tsx
import { useEditorStore } from '../store/editorStore';
import { Tool } from '../types/building';

const TOOLS: { value: Tool; label: string; title: string }[] = [
  { value: 'select', label: '↖ Выбор', title: 'Выбор и редактирование' },
  { value: 'node', label: '● Узел', title: 'Кликните на карте для добавления узла' },
  { value: 'edge', label: '— Ребро', title: 'Кликните два узла для создания связи' },
];

export default function Toolbar() {
  const { tool, setTool } = useEditorStore();
  return (
    <div style={{ padding: '6px 12px', borderBottom: '1px solid #ddd', display: 'flex', gap: 8, background: 'white' }}>
      {TOOLS.map(t => (
        <button
          key={t.value}
          data-testid={`tool-${t.value}`}
          onClick={() => setTool(t.value)}
          title={t.title}
          style={{
            padding: '4px 12px', fontSize: 13,
            fontWeight: tool === t.value ? 'bold' : 'normal',
            background: tool === t.value ? '#e3f2fd' : 'white',
            border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer',
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create NodeProperties.tsx**

```tsx
// apps/editor/src/components/NodeProperties.tsx
import { useEditorStore } from '../store/editorStore';
import { NodeType } from '../types/building';

export default function NodeProperties() {
  const { building, activeFloorIndex, selectedNodeId, updateNode, deleteNode, selectNode } = useEditorStore();
  const floor = building.floors[activeFloorIndex];
  const node = floor?.nodes.find(n => n.id === selectedNodeId);
  if (!node) return null;

  return (
    <div>
      <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>Свойства узла</h3>
      <label style={{ display: 'block', marginBottom: 8 }}>
        Название<br />
        <input
          data-testid="node-label-edit"
          value={node.label}
          onChange={e => updateNode(node.id, { label: e.target.value })}
          style={{ width: '100%', boxSizing: 'border-box' }}
        />
      </label>
      <label style={{ display: 'block', marginBottom: 12 }}>
        Тип<br />
        <select
          value={node.type}
          onChange={e => updateNode(node.id, { type: e.target.value as NodeType })}
          style={{ width: '100%' }}
        >
          <option value="room">Кабинет</option>
          <option value="stairs">Лестница</option>
          <option value="elevator">Лифт</option>
          <option value="entrance">Вход</option>
        </select>
      </label>
      <p style={{ fontSize: 11, color: '#999', margin: '0 0 12px' }}>
        ID: {node.id}<br />X: {Math.round(node.x)}, Y: {Math.round(node.y)}
      </p>
      <button
        data-testid="delete-node"
        onClick={() => { deleteNode(node.id); selectNode(null); }}
        style={{ color: 'red', width: '100%', padding: '4px 0' }}
      >
        Удалить узел
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Create EdgeProperties.tsx**

```tsx
// apps/editor/src/components/EdgeProperties.tsx
import { useEditorStore } from '../store/editorStore';
import { EdgeType } from '../types/building';

export default function EdgeProperties() {
  const { building, activeFloorIndex, selectedEdgeKey, updateEdge, deleteEdge } = useEditorStore();
  const floor = building.floors[activeFloorIndex];
  if (!selectedEdgeKey || !floor) return null;

  const [fromId, toId] = selectedEdgeKey.split('->');
  const edge = floor.edges.find(
    e => (e.from === fromId && e.to === toId) || (e.from === toId && e.to === fromId)
  );
  if (!edge) return null;

  const fromNode = floor.nodes.find(n => n.id === edge.from);
  const toNode = floor.nodes.find(n => n.id === edge.to);

  return (
    <div>
      <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Свойства ребра</h3>
      <p style={{ fontSize: 12, color: '#666', margin: '0 0 12px' }}>
        {fromNode?.label} ↔ {toNode?.label}
      </p>
      <label style={{ display: 'block', marginBottom: 8 }}>
        Тип<br />
        <select
          value={edge.type}
          onChange={e => updateEdge(edge.from, edge.to, { type: e.target.value as EdgeType })}
          style={{ width: '100%' }}
        >
          <option value="walk">Коридор</option>
          <option value="stairs">Лестница</option>
          <option value="elevator">Лифт</option>
        </select>
      </label>
      <label style={{ display: 'block', marginBottom: 12 }}>
        Вес (метры)<br />
        <input
          type="number"
          min="0.1"
          step="0.5"
          value={edge.weight}
          onChange={e => updateEdge(edge.from, edge.to, { weight: parseFloat(e.target.value) || edge.weight })}
          style={{ width: '100%', boxSizing: 'border-box' }}
        />
      </label>
      <button
        data-testid="delete-edge"
        onClick={() => deleteEdge(edge.from, edge.to)}
        style={{ color: 'red', width: '100%', padding: '4px 0' }}
      >
        Удалить ребро
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```powershell
cd d:\Claude\Navigation
git add apps/editor/src/components/Toolbar.tsx apps/editor/src/components/NodeProperties.tsx apps/editor/src/components/EdgeProperties.tsx
git commit -m "feat: add Toolbar and node/edge properties panels"
```

---

### Task 10: CrossFloorDialog

**Files:**
- Create: `apps/editor/src/components/CrossFloorDialog.tsx`

- [ ] **Step 1: Create CrossFloorDialog.tsx**

```tsx
// apps/editor/src/components/CrossFloorDialog.tsx
import { useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import { EdgeType, NavNode } from '../types/building';

interface Props { onClose: () => void; }

export default function CrossFloorDialog({ onClose }: Props) {
  const { building, addCrossFloorEdge, deleteCrossFloorEdge } = useEditorStore();
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [type, setType] = useState<EdgeType>('stairs');
  const [weight, setWeight] = useState('5');

  const transitionNodes: (NavNode & { floorName: string })[] = building.floors.flatMap(floor =>
    floor.nodes
      .filter(n => n.type === 'stairs' || n.type === 'elevator')
      .map(n => ({ ...n, floorName: floor.name }))
  );

  const handleAdd = () => {
    if (!fromId || !toId || fromId === toId) return;
    addCrossFloorEdge({ from: fromId, to: toId, type, weight: parseFloat(weight) || 5 });
    setFromId('');
    setToId('');
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: 'white', padding: 24, borderRadius: 8, width: 460, maxHeight: '80vh', overflowY: 'auto' }}>
        <h3 style={{ margin: '0 0 8px' }}>Межэтажные связи</h3>
        <p style={{ fontSize: 13, color: '#666', margin: '0 0 16px' }}>
          Связывайте узлы «лестница» или «лифт» на разных этажах.
        </p>

        {building.crossFloorEdges.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            {building.crossFloorEdges.map((edge, i) => {
              const from = transitionNodes.find(n => n.id === edge.from);
              const to = transitionNodes.find(n => n.id === edge.to);
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>
                  <span>{from?.label} ({from?.floorName}) ↔ {to?.label} ({to?.floorName}) [{edge.type}, {edge.weight}м]</span>
                  <button
                    data-testid={`delete-cross-${i}`}
                    onClick={() => deleteCrossFloorEdge(edge.from, edge.to)}
                    style={{ color: 'red', marginLeft: 8, padding: '0 4px' }}
                  >✕</button>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ borderTop: '1px solid #eee', paddingTop: 16 }}>
          <strong style={{ fontSize: 13 }}>Добавить связь</strong>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '8px 0' }}>
            <label style={{ fontSize: 13 }}>
              Узел 1<br />
              <select data-testid="cross-from" value={fromId} onChange={e => setFromId(e.target.value)} style={{ width: '100%' }}>
                <option value="">Выберите...</option>
                {transitionNodes.map(n => <option key={n.id} value={n.id}>{n.label} ({n.floorName})</option>)}
              </select>
            </label>
            <label style={{ fontSize: 13 }}>
              Узел 2<br />
              <select data-testid="cross-to" value={toId} onChange={e => setToId(e.target.value)} style={{ width: '100%' }}>
                <option value="">Выберите...</option>
                {transitionNodes.filter(n => n.id !== fromId).map(n => <option key={n.id} value={n.id}>{n.label} ({n.floorName})</option>)}
              </select>
            </label>
            <label style={{ fontSize: 13 }}>
              Тип<br />
              <select value={type} onChange={e => setType(e.target.value as EdgeType)} style={{ width: '100%' }}>
                <option value="stairs">Лестница</option>
                <option value="elevator">Лифт</option>
              </select>
            </label>
            <label style={{ fontSize: 13 }}>
              Вес (сек)<br />
              <input type="number" value={weight} onChange={e => setWeight(e.target.value)} min="1" style={{ width: '100%', boxSizing: 'border-box' }} />
            </label>
          </div>
          <button data-testid="add-cross-floor" onClick={handleAdd} disabled={!fromId || !toId} style={{ padding: '4px 12px' }}>
            Добавить связь
          </button>
        </div>

        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <button onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```powershell
cd d:\Claude\Navigation
git add apps/editor/src/components/CrossFloorDialog.tsx
git commit -m "feat: add CrossFloorDialog for stair/elevator inter-floor connections"
```

---

### Task 11: ExportButton + full unit test run

**Files:**
- Create: `apps/editor/src/components/ExportButton.tsx`

- [ ] **Step 1: Create ExportButton.tsx**

```tsx
// apps/editor/src/components/ExportButton.tsx
import { useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import { validateBuilding } from '../lib/validation';
import { exportZip } from '../lib/export';

export default function ExportButton() {
  const { building } = useEditorStore();
  const [errors, setErrors] = useState<string[]>([]);

  const handleExport = async () => {
    const validationErrors = validateBuilding(building);
    if (validationErrors.length > 0) {
      setErrors(validationErrors.map(e => e.message));
      return;
    }
    setErrors([]);
    const blob = await exportZip(building);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${building.id || 'building'}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <button
        data-testid="export-button"
        onClick={handleExport}
        style={{ width: '100%', padding: '8px 0', background: '#1976D2', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold' }}
      >
        Экспорт ZIP
      </button>
      {errors.length > 0 && (
        <div data-testid="export-errors" style={{ marginTop: 8, color: '#c62828', fontSize: 12 }}>
          {errors.map((e, i) => <div key={i}>• {e}</div>)}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run all unit tests**

```powershell
cd d:\Claude\Navigation\apps\editor
npx vitest run
```

Expected: All tests in `src/test/unit/` and `src/test/component/` pass.

- [ ] **Step 3: Commit**

```powershell
cd d:\Claude\Navigation
git add apps/editor/src/components/ExportButton.tsx
git commit -m "feat: add ExportButton with validation and ZIP download"
```

---

### Task 12: E2E test (Playwright)

**Files:**
- Create: `apps/editor/src/test/e2e/editor.spec.ts`

- [ ] **Step 1: Start dev server (in a separate terminal)**

```powershell
cd d:\Claude\Navigation\apps\editor
npm run dev
```

- [ ] **Step 2: Write E2E test**

```typescript
// apps/editor/src/test/e2e/editor.spec.ts
import { test, expect } from '@playwright/test';

test('create building with nodes/edges and export ZIP', async ({ page }) => {
  await page.goto('/');

  // Fill building info
  await page.getByTestId('building-id').fill('test-corp');
  await page.getByTestId('building-name').fill('Тестовый корпус');

  // Add floor
  await page.getByTestId('add-floor').click();
  await expect(page.locator('text=1 этаж')).toBeVisible();

  // Switch to node tool
  await page.getByTestId('tool-node').click();

  // Helper: add a node at canvas coordinates
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();

  const clickCanvas = async (dx: number, dy: number, label: string, type = 'room') => {
    await page.mouse.click(box!.x + dx, box!.y + dy);
    await page.getByTestId('node-label').fill(label);
    if (type !== 'room') await page.getByTestId('node-type').selectOption(type);
    await page.getByTestId('node-confirm').click();
  };

  await clickCanvas(200, 200, 'Вход', 'entrance');
  await clickCanvas(400, 200, 'Кабинет 101');
  await clickCanvas(600, 200, 'Кабинет 102');

  // Switch to edge tool and connect entrance → 101
  await page.getByTestId('tool-edge').click();
  await page.mouse.click(box!.x + 200, box!.y + 200); // click entrance
  await page.mouse.click(box!.x + 400, box!.y + 200); // click 101
  await page.getByTestId('edge-confirm').click();

  // Connect 101 → 102
  await page.mouse.click(box!.x + 400, box!.y + 200);
  await page.mouse.click(box!.x + 600, box!.y + 200);
  await page.getByTestId('edge-confirm').click();

  // Export
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-button').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('test-corp.zip');
});

test('export blocked when graph has isolated node', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('building-id').fill('b1');
  await page.getByTestId('building-name').fill('Building');
  await page.getByTestId('add-floor').click();
  await page.getByTestId('tool-node').click();

  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  await page.mouse.click(box!.x + 300, box!.y + 300);
  await page.getByTestId('node-label').fill('Isolated');
  await page.getByTestId('node-confirm').click();

  await page.getByTestId('export-button').click();
  await expect(page.getByTestId('export-errors')).toBeVisible();
  await expect(page.getByTestId('export-errors')).toContainText('Изолированный');
});
```

- [ ] **Step 3: Run E2E tests**

```powershell
cd d:\Claude\Navigation\apps\editor
npx playwright test
```

Expected: 2 tests passed.

- [ ] **Step 4: Final commit**

```powershell
cd d:\Claude\Navigation
git add apps/editor/src/test/e2e/editor.spec.ts
git commit -m "test: add Playwright E2E tests for React editor"
```

---

## Self-review

**Spec coverage:**
- ✅ Create building (name + id) — BuildingPanel
- ✅ Add floors + upload images — FloorList
- ✅ Place nodes with type + label — FloorCanvas + AddNodeDialog
- ✅ Draw edges — FloorCanvas + AddEdgeDialog
- ✅ Cross-floor connections (stairs/elevator) — CrossFloorDialog
- ✅ Export → building.zip — ExportButton + export.ts
- ✅ Validation blocks export on isolated nodes — validation.ts + ExportButton
- ✅ Unit tests: validation, export — Tasks 4–5
- ✅ Component tests: BuildingPanel, AddNodeDialog — Tasks 6, 8
- ✅ E2E: full create-and-export flow — Task 12
- ⚠️ Route preview in editor — spec says "предпросмотр маршрута прямо в редакторе" but marks it as optional context; excluded to keep scope focused.

**Type consistency check:**
- `NavNode`, `NavEdge`, `CrossFloorEdge`, `Floor`, `Building` defined in `types/building.ts` and used consistently across store, validation, export, and components.
- `EdgeType` values `'walk' | 'stairs' | 'elevator'` consistent throughout.
- Store method names (`addNode`, `deleteNode`, `addEdge`, `deleteEdge`, `addCrossFloorEdge`, `deleteCrossFloorEdge`) match usage in all components.
- `selectedEdgeKey` format `"fromId->toId"` used and parsed consistently in `EdgeProperties` and `FloorCanvas`.

---

## После выполнения

- `npm run dev` → редактор на `http://localhost:5173`
- `npm run test` → все unit + component тесты
- `npm run test:e2e` → E2E в Playwright
- Готовый ZIP импортируется в Flutter-приложение через кнопку импорта
