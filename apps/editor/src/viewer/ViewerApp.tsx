import { useState, useCallback, useRef } from 'react';
import JSZip from 'jszip';
import type { Building } from '../types/building';
import { findRoute } from '../lib/routing';
import ViewerCanvas from './ViewerCanvas';

const btnStyle = (active: boolean): React.CSSProperties => ({
  padding: '6px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12,
  background: active ? '#1976D2' : 'white',
  color: active ? 'white' : '#333',
  border: `1px solid ${active ? '#1976D2' : '#ccc'}`,
  fontWeight: active ? 600 : 400,
});

interface SearchNode {
  id: string;
  label: string;
  type: string;
  floorName: string;
}

function NodeSearch({ label, value, onChange, nodes }: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  nodes: SearchNode[];
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const selected = nodes.find(n => n.id === value);
  const q = search.toLowerCase();
  const filtered = q
    ? nodes.filter(n => n.label.toLowerCase().includes(q) || n.floorName.toLowerCase().includes(q))
    : nodes.slice(0, 40);

  return (
    <div style={{ position: 'relative', marginBottom: 8 }}>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 3 }}>{label}</div>
      <input
        value={open ? search : (selected?.label ?? '')}
        onChange={e => { setSearch(e.target.value); onChange(''); setOpen(true); }}
        onFocus={() => { setSearch(''); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 160)}
        placeholder="Введите номер..."
        style={{ width: '100%', padding: '5px 8px', borderRadius: 4, border: '1px solid #ccc', fontSize: 12, boxSizing: 'border-box' }}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          background: 'white', border: '1px solid #ccc', borderRadius: 4,
          maxHeight: 200, overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
        }}>
          {filtered.map(n => (
            <div key={n.id}
              onMouseDown={() => { onChange(n.id); setSearch(''); setOpen(false); }}
              style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 500 }}>{n.label}</span>
              <span style={{ color: '#aaa', fontSize: 11 }}>{n.floorName}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const STORAGE_KEY = 'viewer_building';

function applyMigrations(data: Building) {
  // Export writes cross_floor_edges (snake_case); handle both forms
  data.crossFloorEdges = data.crossFloorEdges ?? (data as any).cross_floor_edges ?? [];
  for (const floor of data.floors) {
    if (!floor.contours && (floor as any).contour) floor.contours = [(floor as any).contour];
    floor.areas = floor.areas ?? [];
  }
  return data;
}

export default function ViewerApp() {
  const [building, setBuilding] = useState<Building | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return applyMigrations(JSON.parse(saved) as Building);
    } catch { /* ignore */ }
    return null;
  });
  const [activeFloor, setActiveFloor] = useState(0);
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [route, setRoute] = useState<string[] | null>(null);
  const [rotation, setRotation] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadFile = useCallback(async (file: File) => {
    try {
      let rawJson: string;
      if (file.name.endsWith('.zip')) {
        const zip = await JSZip.loadAsync(file);
        const jsonFile = Object.values(zip.files).find(f => f.name.endsWith('.json') && !f.dir);
        if (!jsonFile) throw new Error('no json');
        rawJson = await jsonFile.async('text');
      } else {
        rawJson = await file.text();
      }
      // Save raw JSON so re-loading always applies fresh migrations
      localStorage.setItem(STORAGE_KEY, rawJson);
      const data: Building = applyMigrations(JSON.parse(rawJson));
      setBuilding(data);
      setActiveFloor(0);
      setRoute(null);
      setFromId('');
      setToId('');
    } catch {
      alert('Не удалось загрузить файл');
    }
  }, []);

  if (!building) {
    return (
      <div
        style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5', fontFamily: 'sans-serif' }}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) loadFile(f); }}
        onDragOver={e => e.preventDefault()}
      >
        <div style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>🗺️</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#1a1a2e', marginBottom: 8 }}>Карта навигации</div>
          <div style={{ fontSize: 14, color: '#666', marginBottom: 28 }}>Загрузите ZIP или JSON файл здания</div>
          <button onClick={() => fileRef.current?.click()}
            style={{ padding: '12px 32px', background: '#1976D2', color: 'white', border: 'none', borderRadius: 6, fontSize: 15, cursor: 'pointer', fontWeight: 600 }}>
            Открыть файл
          </button>
          <div style={{ marginTop: 14, fontSize: 12, color: '#bbb' }}>или перетащите файл сюда</div>
          <div style={{ marginTop: 24, fontSize: 12 }}>
            <a href="./" style={{ color: '#1976D2', textDecoration: 'none' }}>← Редактор карт</a>
          </div>
          <input ref={fileRef} type="file" accept=".zip,.json" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) loadFile(f); e.target.value = ''; }} />
        </div>
      </div>
    );
  }

  const allNodes: SearchNode[] = building.floors.flatMap(f =>
    f.nodes
      .filter(n => n.type !== 'corridor')
      .map(n => ({ id: n.id, label: n.label, type: n.type, floorName: f.name }))
  );

  const nodeMap = new Map(
    building.floors.flatMap(f => f.nodes.map(n => [n.id, { ...n, floorName: f.name }]))
  );

  const handleBuild = () => {
    if (!fromId || !toId) return;
    const r = findRoute(building, fromId, toId);
    setRoute(r);
    if (r && r.length > 0) {
      const idx = building.floors.findIndex(f => f.nodes.some(n => n.id === fromId));
      if (idx >= 0) setActiveFloor(idx);
    }
  };

  const handleClear = () => { setRoute(null); setFromId(''); setToId(''); };

  const routeNodeIds = new Set(route ?? []);

  // Which floor indices have route nodes
  const routeFloorIndices = new Set(
    route ? building.floors.map((f, i) => f.nodes.some(n => routeNodeIds.has(n.id)) ? i : -1).filter(i => i >= 0) : []
  );

  // Build readable steps with floor index for tab switching
  const steps: { text: string; floor: boolean; floorIdx?: number }[] = [];
  if (route) {
    let prevFloor = '';
    let prevLabel = '';
    for (const id of route) {
      const n = nodeMap.get(id);
      if (!n || n.type === 'corridor') continue;
      if (n.floorName !== prevFloor) {
        const fi = building.floors.findIndex(f => f.name === n.floorName);
        if (prevFloor) steps.push({ text: `→ ${n.floorName}`, floor: true, floorIdx: fi });
        else steps.push({ text: n.floorName, floor: true, floorIdx: fi });
        prevFloor = n.floorName;
        prevLabel = '';
      }
      if (n.type !== 'stairs' && n.type !== 'elevator' && n.label !== prevLabel) {
        steps.push({ text: n.label, floor: false });
        prevLabel = n.label;
      }
    }
  }

  const floor = building.floors[activeFloor];

  return (
    <div style={{ display: 'flex', height: '100dvh', fontFamily: 'sans-serif', fontSize: 13, overflow: 'hidden' }}>
      {/* Sidebar */}
      <div style={{ width: 230, borderRight: '1px solid #ddd', display: 'flex', flexDirection: 'column', background: '#fafafa', flexShrink: 0, overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ padding: '10px 12px', background: '#1976D2', color: 'white', flexShrink: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {building.name || building.id}
          </div>
          <button onClick={() => { localStorage.removeItem(STORAGE_KEY); setBuilding(null); setRoute(null); }}
            style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            ← загрузить другой
          </button>
        </div>

        {/* Floor tabs */}
        <div style={{ padding: '10px 12px', borderBottom: '1px solid #eee', flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Этаж</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {building.floors.map((f, i) => (
              <button key={i} onClick={() => setActiveFloor(i)} style={{
                ...btnStyle(activeFloor === i),
                outline: routeFloorIndices.has(i) && activeFloor !== i ? '2px solid #43A047' : 'none',
              }}>
                {f.name}
              </button>
            ))}
          </div>
        </div>

        {/* Route search */}
        <div style={{ padding: '10px 12px', borderBottom: '1px solid #eee', flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Маршрут</div>
          <NodeSearch label="Откуда" value={fromId} onChange={setFromId} nodes={allNodes} />
          <NodeSearch label="Куда" value={toId} onChange={setToId} nodes={allNodes} />
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <button onClick={handleBuild} disabled={!fromId || !toId}
              style={{ flex: 1, padding: '7px 0', background: fromId && toId ? '#1976D2' : '#e0e0e0', color: fromId && toId ? 'white' : '#aaa', border: 'none', borderRadius: 4, cursor: fromId && toId ? 'pointer' : 'default', fontSize: 12, fontWeight: 600 }}>
              Построить
            </button>
            {route !== null && (
              <button onClick={handleClear}
                style={{ padding: '7px 10px', background: '#f5f5f5', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer', fontSize: 13 }}>
                ✕
              </button>
            )}
          </div>
          {route !== null && (
            <div style={{ marginTop: 6, fontSize: 11, padding: '4px 8px', borderRadius: 4, background: route.length === 0 ? '#fff3e0' : '#e8f5e9', color: route.length === 0 ? '#e65100' : '#2e7d32' }}>
              {route.length === 0 ? 'Маршрут не найден' : `Найден, ${route.filter(id => { const n = nodeMap.get(id); return n && n.type !== 'corridor'; }).length} точек`}
            </div>
          )}
        </div>

        {/* Steps */}
        {steps.length > 0 && (
          <div style={{ padding: '10px 12px', overflowY: 'auto', flex: 1 }}>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Шаги</div>
            {steps.map((s, i) => (
              <div key={i}
                onClick={s.floor && s.floorIdx !== undefined ? () => setActiveFloor(s.floorIdx!) : undefined}
                style={{
                  padding: s.floor ? '6px 0 4px' : '3px 8px',
                  fontSize: 12,
                  color: s.floor ? '#5c35a5' : '#333',
                  fontWeight: s.floor ? 700 : 400,
                  borderTop: s.floor && i > 0 ? '1px solid #e8e8e8' : 'none',
                  marginTop: s.floor && i > 0 ? 6 : 0,
                  cursor: s.floor ? 'pointer' : 'default',
                  textDecoration: s.floor ? 'underline dotted' : 'none',
                }}>
                {s.floor ? s.text : `• ${s.text}`}
              </div>
            ))}
          </div>
        )}

        {/* Footer link */}
        <div style={{ padding: '8px 12px', borderTop: '1px solid #eee', fontSize: 11, color: '#aaa', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <a href="./" style={{ color: '#1976D2', textDecoration: 'none' }}>← Редактор карт</a>
          <span>v1.0.4</span>
        </div>
      </div>

      {/* Canvas + rotation buttons */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <ViewerCanvas floor={floor} routeNodeIds={routeNodeIds} route={route} rotation={rotation} />
        <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4, zIndex: 10 }}>
          <button onClick={() => setRotation(r => (r + 270) % 360)} title="Повернуть влево"
            style={{ width: 34, height: 34, fontSize: 16, background: 'white', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer' }}>↺</button>
          <button onClick={() => setRotation(r => (r + 90) % 360)} title="Повернуть вправо"
            style={{ width: 34, height: 34, fontSize: 16, background: 'white', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer' }}>↻</button>
        </div>
      </div>
    </div>
  );
}
