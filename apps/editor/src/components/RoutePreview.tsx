import { useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import { findRoute } from '../lib/routing';

export default function RoutePreview() {
  const { building, setPreviewRoute, previewRoute } = useEditorStore();
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');

  const allNodes = building.floors.flatMap(f =>
    f.nodes.map(n => ({ ...n, floorName: f.name }))
  );

  const handleBuild = () => {
    if (!fromId || !toId) return;
    const route = findRoute(building, fromId, toId);
    setPreviewRoute(route);
  };

  const handleClear = () => {
    setPreviewRoute(null);
    setFromId('');
    setToId('');
  };

  const sel: React.CSSProperties = {
    width: '100%', padding: '5px 6px', border: '1px solid #ccc',
    borderRadius: 4, fontSize: 12, background: 'white',
  };

  const status = previewRoute === null && fromId && toId
    ? null
    : previewRoute && previewRoute.length === 0
    ? null
    : previewRoute
    ? `${previewRoute.length} узлов в маршруте`
    : null;

  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>Предпросмотр маршрута</div>

      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 11, color: '#666', marginBottom: 3 }}>Откуда</div>
        <select value={fromId} onChange={e => setFromId(e.target.value)} style={sel}>
          <option value="">— выберите узел —</option>
          {allNodes.map(n => (
            <option key={n.id} value={n.id}>[{n.floorName}] {n.label}</option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: '#666', marginBottom: 3 }}>Куда</div>
        <select value={toId} onChange={e => setToId(e.target.value)} style={sel}>
          <option value="">— выберите узел —</option>
          {allNodes.map(n => (
            <option key={n.id} value={n.id}>[{n.floorName}] {n.label}</option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={handleBuild} disabled={!fromId || !toId}
          style={{ flex: 1, padding: '6px 0', background: fromId && toId ? '#1976D2' : '#ccc', color: 'white', border: 'none', borderRadius: 4, cursor: fromId && toId ? 'pointer' : 'default', fontSize: 12 }}>
          Построить
        </button>
        {previewRoute !== null && (
          <button onClick={handleClear}
            style={{ flex: 1, padding: '6px 0', background: '#f5f5f5', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
            Очистить
          </button>
        )}
      </div>

      {previewRoute !== null && (
        <div style={{ marginTop: 8, fontSize: 11, padding: '4px 8px', borderRadius: 4,
          background: previewRoute.length === 0 ? '#fff3e0' : '#e8f5e9',
          color: previewRoute.length === 0 ? '#e65100' : '#2e7d32' }}>
          {previewRoute.length === 0 ? 'Маршрут не найден' : status}
        </div>
      )}
    </div>
  );
}
