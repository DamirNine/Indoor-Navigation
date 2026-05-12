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
