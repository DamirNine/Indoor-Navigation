import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Building, NavNode, NavEdge, CrossFloorEdge, Area, Tool } from '../types/building';

const emptyBuilding = (): Building => ({
  id: '', name: '', floors: [], crossFloorEdges: [],
});

const emptyFloor = (level: number, name: string) => ({
  level, name, nodes: [], edges: [], areas: [],
});

interface EditorState {
  building: Building;
  activeFloorIndex: number;
  tool: Tool;
  selectedNodeId: string | null;
  selectedEdgeKey: string | null;
  pendingEdgeFromId: string | null;
  previewRoute: string[] | null;

  setBuildingInfo: (id: string, name: string) => void;
  addFloor: (level: number, name: string) => void;
  removeFloor: (index: number) => void;
  setFloorImage: (index: number, file: File, dataUrl: string, filename: string) => void;
  removeFloorImage: (index: number) => void;
  setActiveFloor: (index: number) => void;
  addNode: (node: NavNode) => void;
  updateNode: (id: string, updates: Partial<Omit<NavNode, 'id'>>) => void;
  deleteNode: (id: string) => void;
  addEdge: (edge: NavEdge) => void;
  updateEdge: (from: string, to: string, updates: Partial<Pick<NavEdge, 'type' | 'weight'>>) => void;
  deleteEdge: (from: string, to: string) => void;
  addArea: (area: Area) => void;
  deleteArea: (nodeId: string) => void;
  moveNode: (id: string, newX: number, newY: number) => void;
  addCrossFloorEdge: (edge: CrossFloorEdge) => void;
  deleteCrossFloorEdge: (from: string, to: string) => void;
  setTool: (tool: Tool) => void;
  selectNode: (id: string | null) => void;
  selectEdge: (key: string | null) => void;
  setPendingEdgeFrom: (id: string | null) => void;
  setPreviewRoute: (route: string[] | null) => void;
  setFloorContour: (points: number[][]) => void;
  clearFloorContour: () => void;
  loadBuilding: (building: Building) => void;
}

export const useEditorStore = create<EditorState>()(
  persist(
    (set) => ({
      building: emptyBuilding(),
      activeFloorIndex: 0,
      tool: 'select',
      selectedNodeId: null,
      selectedEdgeKey: null,
      pendingEdgeFromId: null,
      previewRoute: null,

      setBuildingInfo: (id, name) =>
        set(s => ({ building: { ...s.building, id, name } })),

      addFloor: (level, name) =>
        set(s => ({
          building: { ...s.building, floors: [...s.building.floors, emptyFloor(level, name)] },
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

      removeFloorImage: (index) =>
        set(s => {
          const floors = [...s.building.floors];
          const { image: _i, imageFile: _f, imageDataUrl: _d, ...rest } = floors[index];
          floors[index] = rest;
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
            areas: (f.areas ?? []).filter(a => a.nodeId !== id),
          }));
          return {
            building: {
              ...s.building, floors,
              crossFloorEdges: s.building.crossFloorEdges.filter(e => e.from !== id && e.to !== id),
            },
            selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
            previewRoute: null,
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

      addArea: (area) =>
        set(s => {
          const floors = [...s.building.floors];
          const i = s.activeFloorIndex;
          const existing = (floors[i].areas ?? []).filter(a => a.nodeId !== area.nodeId);
          floors[i] = { ...floors[i], areas: [...existing, area] };
          return { building: { ...s.building, floors } };
        }),

      deleteArea: (nodeId) =>
        set(s => ({
          building: {
            ...s.building,
            floors: s.building.floors.map(f => ({
              ...f, areas: (f.areas ?? []).filter(a => a.nodeId !== nodeId),
            })),
          },
        })),

      moveNode: (id, newX, newY) =>
        set(s => ({
          building: {
            ...s.building,
            floors: s.building.floors.map(f => {
              const node = f.nodes.find(n => n.id === id);
              if (!node) return f;
              const dx = newX - node.x, dy = newY - node.y;
              return {
                ...f,
                nodes: f.nodes.map(n => n.id === id ? { ...n, x: newX, y: newY } : n),
                areas: (f.areas ?? []).map(a => a.nodeId !== id ? a : {
                  ...a, points: a.points.map(p => [p[0] + dx, p[1] + dy]),
                }),
              };
            }),
          },
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
      setPreviewRoute: (route) => set({ previewRoute: route }),

      loadBuilding: (building) => set({
        building,
        activeFloorIndex: 0,
        selectedNodeId: null,
        selectedEdgeKey: null,
        pendingEdgeFromId: null,
        previewRoute: null,
      }),

      setFloorContour: (points) =>
        set(s => {
          const floors = [...s.building.floors];
          const i = s.activeFloorIndex;
          floors[i] = { ...floors[i], contour: points };
          return { building: { ...s.building, floors } };
        }),

      clearFloorContour: () =>
        set(s => {
          const floors = [...s.building.floors];
          const i = s.activeFloorIndex;
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { contour: _c, ...rest } = floors[i];
          floors[i] = rest;
          return { building: { ...s.building, floors } };
        }),
    }),
    {
      name: 'indoor-nav-editor',
      partialize: (state) => ({
        building: {
          ...state.building,
          floors: state.building.floors.map(floor => ({
            level: floor.level,
            name: floor.name,
            image: floor.image,
            imageDataUrl: floor.imageDataUrl,
            nodes: floor.nodes,
            edges: floor.edges,
            areas: floor.areas ?? [],
            ...(floor.contour ? { contour: floor.contour } : {}),
          })),
        },
        activeFloorIndex: state.activeFloorIndex,
      }),
    }
  )
);
