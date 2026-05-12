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
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: 'sans-serif', fontSize: 14 }}>
      <div style={{ width: 260, borderRight: '1px solid #ddd', display: 'flex', flexDirection: 'column', gap: 0, overflowY: 'auto', background: '#fafafa' }}>
        <div style={{ padding: 12, borderBottom: '1px solid #eee' }}>
          <BuildingPanel />
        </div>
        <div style={{ padding: 12, borderBottom: '1px solid #eee', flex: 1 }}>
          <FloorList />
        </div>
        <div style={{ padding: 12, borderBottom: '1px solid #eee' }}>
          <button
            data-testid="cross-floor-btn"
            onClick={() => setCrossFloorOpen(true)}
            style={{ width: '100%', padding: '6px 0', background: '#fff', border: '1px solid #bbb', borderRadius: 4, cursor: 'pointer' }}
          >
            Межэтажные связи
          </button>
        </div>
        <div style={{ padding: 12 }}>
          <ExportButton />
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Toolbar />
        <FloorCanvas />
      </div>

      {selectedNodeId && !selectedEdgeKey && (
        <div style={{ width: 220, borderLeft: '1px solid #ddd', padding: 12, overflowY: 'auto', background: '#fafafa' }}>
          <NodeProperties />
        </div>
      )}
      {selectedEdgeKey && (
        <div style={{ width: 220, borderLeft: '1px solid #ddd', padding: 12, overflowY: 'auto', background: '#fafafa' }}>
          <EdgeProperties />
        </div>
      )}

      {crossFloorOpen && <CrossFloorDialog onClose={() => setCrossFloorOpen(false)} />}
    </div>
  );
}
