import { useRef } from 'react';
import JSZip from 'jszip';
import { useEditorStore } from '../store/editorStore';
import type { Building } from '../types/building';

async function parseFile(file: File): Promise<Building> {
  if (file.name.endsWith('.zip')) {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const imageMap = new Map<string, string>();
    await Promise.all(
      Object.entries(zip.files)
        .filter(([p, e]) => !e.dir && /\.(png|jpe?g)$/i.test(p))
        .map(([p, e]) => e.async('blob').then(b => imageMap.set(p.split('/').pop()!, URL.createObjectURL(b))))
    );
    const jsonEntry = Object.values(zip.files).find(e => !e.dir && e.name.endsWith('.json'));
    if (!jsonEntry) throw new Error('JSON не найден');
    return parse(await jsonEntry.async('text'), imageMap);
  }
  return parse(await file.text(), new Map());
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parse(text: string, imageMap: Map<string, string>): Building {
  const j = JSON.parse(text);
  return {
    id: j.id ?? '', name: j.name ?? '',
    crossFloorEdges: j.cross_floor_edges ?? [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    floors: (j.floors ?? []).map((f: any) => ({
      level: f.level, name: f.name, image: f.image,
      imageDataUrl: f.image ? imageMap.get(f.image) : undefined,
      nodes: f.nodes ?? [], edges: f.edges ?? [], areas: f.areas ?? [],
      ...(f.contours ? { contours: f.contours } : f.contour ? { contours: [f.contour] } : {}),
    })),
  };
}

export default function BuildingsList() {
  const { building, otherBuildings, addOtherBuilding, switchBuilding, removeOtherBuilding } = useEditorStore();
  const ref = useRef<HTMLInputElement>(null);

  const handleAdd = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      addOtherBuilding(await parseFile(file));
    } catch (err) {
      alert(`Ошибка: ${err instanceof Error ? err.message : err}`);
    }
  };

  const all = [building, ...otherBuildings];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>Здания</h3>
        <button onClick={() => ref.current?.click()}
          style={{ fontSize: 11, padding: '2px 8px', background: '#1976D2', color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer' }}>
          + Добавить
        </button>
        <input ref={ref} type="file" accept=".json,.zip" style={{ display: 'none' }} onChange={handleAdd} />
      </div>

      {all.map((b, i) => {
        const isActive = i === 0;
        return (
          <div key={b.id + i} style={{
            display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4,
            padding: '4px 6px', borderRadius: 4,
            background: isActive ? '#e3f2fd' : '#f5f5f5',
            border: `1px solid ${isActive ? '#1976D2' : '#ddd'}`,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: isActive ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {b.name || b.id || '(без имени)'}
              </div>
              <div style={{ fontSize: 10, color: '#999' }}>{b.floors.length} эт.</div>
            </div>
            {isActive
              ? <span style={{ fontSize: 10, color: '#1976D2', fontWeight: 600 }}>активно</span>
              : <>
                  <button onClick={() => switchBuilding(i - 1)} title="Переключиться"
                    style={{ fontSize: 11, padding: '1px 6px', background: '#1976D2', color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer' }}>
                    ↔
                  </button>
                  <button onClick={() => removeOtherBuilding(i - 1)} title="Удалить"
                    style={{ fontSize: 11, padding: '1px 6px', background: '#fff', color: '#c00', border: '1px solid #faa', borderRadius: 3, cursor: 'pointer' }}>
                    ✕
                  </button>
                </>
            }
          </div>
        );
      })}
    </div>
  );
}
