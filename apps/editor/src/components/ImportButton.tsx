import { useRef } from 'react';
import JSZip from 'jszip';
import { useEditorStore } from '../store/editorStore';
import type { Building } from '../types/building';

async function parseZip(file: File): Promise<Building> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const imageMap = new Map<string, string>();

  await Promise.all(
    Object.entries(zip.files)
      .filter(([path, entry]) => !entry.dir && /\.(png|jpe?g)$/i.test(path))
      .map(([path, entry]) =>
        entry.async('blob').then(blob => {
          imageMap.set(path.split('/').pop()!, URL.createObjectURL(blob));
        })
      )
  );

  const jsonEntry = Object.values(zip.files).find(e => !e.dir && e.name.endsWith('.json'));
  if (!jsonEntry) throw new Error('JSON файл не найден в архиве');
  return parseJsonText(await jsonEntry.async('text'), imageMap);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseJsonText(text: string, imageMap: Map<string, string>): Building {
  const json = JSON.parse(text);
  return {
    id: json.id ?? '',
    name: json.name ?? '',
    crossFloorEdges: json.cross_floor_edges ?? [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    floors: (json.floors ?? []).map((f: any) => ({
      level: f.level,
      name: f.name,
      image: f.image,
      imageDataUrl: f.image ? imageMap.get(f.image) : undefined,
      nodes: f.nodes ?? [],
      edges: f.edges ?? [],
      areas: f.areas ?? [],
      ...(f.contours ? { contours: f.contours } : f.contour ? { contours: [f.contour] } : {}),
    })),
  };
}

export default function ImportButton() {
  const loadBuilding = useEditorStore(s => s.loadBuilding);
  const ref = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const building = file.name.endsWith('.zip')
        ? await parseZip(file)
        : parseJsonText(await file.text(), new Map());
      loadBuilding(building);
    } catch (err) {
      alert(`Ошибка импорта: ${err instanceof Error ? err.message : err}`);
    }
  };

  return (
    <>
      <input ref={ref} type="file" accept=".json,.zip" style={{ display: 'none' }} onChange={handleFile} />
      <button
        onClick={() => ref.current?.click()}
        style={{ width: '100%', padding: '8px 0', background: '#fff', border: '1px solid #bbb', borderRadius: 4, cursor: 'pointer', marginBottom: 8 }}
      >
        Импорт
      </button>
    </>
  );
}
