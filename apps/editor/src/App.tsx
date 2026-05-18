import { useState } from 'react';
import BuildingPanel from './components/BuildingPanel';
import FloorList from './components/FloorList';
import Toolbar from './components/Toolbar';
import FloorCanvas from './components/FloorCanvas';
import NodeProperties from './components/NodeProperties';
import EdgeProperties from './components/EdgeProperties';
import CrossFloorDialog from './components/CrossFloorDialog';
import ExportButton from './components/ExportButton';
import ImportButton from './components/ImportButton';
import RoutePreview from './components/RoutePreview';
import { useEditorStore } from './store/editorStore';

export default function App() {
  const [crossFloorOpen, setCrossFloorOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [zoom, setZoom] = useState(0.5);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const selectedNodeId = useEditorStore(s => s.selectedNodeId);
  const selectedEdgeKey = useEditorStore(s => s.selectedEdgeKey);
  const showProps = (selectedNodeId && !selectedEdgeKey) || !!selectedEdgeKey;

  const clamp = (z: number) => Math.min(Math.max(z, 0.1), 5);
  const zoomIn  = () => setZoom(z => clamp(z * 1.3));
  const zoomOut = () => setZoom(z => clamp(z / 1.3));
  const zoomReset = () => { setZoom(0.5); setStagePos({ x: 0, y: 0 }); };

  return (
    <div style={{ display: 'flex', height: '100dvh', overflow: 'hidden', fontFamily: 'sans-serif', fontSize: 14 }}>

      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} style={{ display: 'none' }} className="sidebar-backdrop" />
      )}

      <div className={`sidebar ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}
        style={{ width: 260, borderRight: '1px solid #ddd', display: 'flex', flexDirection: 'column', overflowY: 'auto', background: '#fafafa', flexShrink: 0, zIndex: 60 }}>
        <div style={{ padding: '4px 12px', background: '#f0f0f0', borderBottom: '1px solid #ddd', fontSize: 11, color: '#999', textAlign: 'right' }}>
          v1.7.1
        </div>
        <div style={{ padding: 12, borderBottom: '1px solid #eee' }}><BuildingPanel /></div>
        <div style={{ padding: 12, borderBottom: '1px solid #eee', flex: 1 }}><FloorList /></div>
        <div style={{ padding: 12, borderBottom: '1px solid #eee' }}><RoutePreview /></div>
        <div style={{ padding: 12, borderBottom: '1px solid #eee' }}>
          <button data-testid="cross-floor-btn" onClick={() => setCrossFloorOpen(true)}
            style={{ width: '100%', padding: '8px 0', background: '#fff', border: '1px solid #bbb', borderRadius: 4, cursor: 'pointer' }}>
            Межэтажные связи
          </button>
        </div>
        <div style={{ padding: 12 }}><ImportButton /><ExportButton /></div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <Toolbar
          onMenuClick={() => setSidebarOpen(o => !o)}
          zoom={zoom}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onZoomReset={zoomReset}
        />
        <FloorCanvas zoom={zoom} setZoom={setZoom} stagePos={stagePos} setStagePos={setStagePos} />
      </div>

      {showProps && (
        <div className="props-panel"
          style={{ width: 220, borderLeft: '1px solid #ddd', padding: 12, overflowY: 'auto', background: '#fafafa', flexShrink: 0 }}>
          {selectedNodeId && !selectedEdgeKey && <NodeProperties />}
          {selectedEdgeKey && <EdgeProperties />}
        </div>
      )}

      {crossFloorOpen && <CrossFloorDialog onClose={() => setCrossFloorOpen(false)} />}

      <style>{`
        @media (max-width: 640px) {
          .sidebar { position: fixed; top: 0; left: 0; bottom: 0; transform: translateX(-100%); transition: transform 0.2s; }
          .sidebar-open { transform: translateX(0); }
          .sidebar-backdrop { display: block !important; position: fixed; inset: 0; background: rgba(0,0,0,0.3); z-index: 50; }
          .props-panel { position: fixed; top: 0; right: 0; bottom: 0; box-shadow: -2px 0 8px rgba(0,0,0,0.15); }
        }
      `}</style>
    </div>
  );
}
