import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import BuildingPanel from '../../components/BuildingPanel';
import { useEditorStore } from '../../store/editorStore';

beforeEach(() => {
  useEditorStore.setState({
    building: { id: '', name: '', floors: [], crossFloorEdges: [] },
    activeFloorIndex: 0,
    tool: 'select',
    selectedNodeId: null,
    selectedEdgeKey: null,
    pendingEdgeFromId: null,
  });
});

describe('BuildingPanel', () => {
  it('renders id and name inputs', () => {
    render(<BuildingPanel />);
    expect(screen.getByTestId('building-id')).toBeInTheDocument();
    expect(screen.getByTestId('building-name')).toBeInTheDocument();
  });

  it('updates building id on input change', () => {
    render(<BuildingPanel />);
    const input = screen.getByTestId('building-id') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'main-building' } });
    expect(useEditorStore.getState().building.id).toBe('main-building');
  });

  it('updates building name on input change', () => {
    render(<BuildingPanel />);
    const input = screen.getByTestId('building-name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Main Building' } });
    expect(useEditorStore.getState().building.name).toBe('Main Building');
  });
});
