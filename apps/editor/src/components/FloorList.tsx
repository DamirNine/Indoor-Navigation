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
