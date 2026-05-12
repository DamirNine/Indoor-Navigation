import { useRef, useState } from 'react';
import { useEditorStore } from '../store/editorStore';

export default function FloorList() {
  const { building, activeFloorIndex, addFloor, removeFloor, setFloorImage, removeFloorImage, setActiveFloor } = useEditorStore();
  const fileInputs = useRef<Map<number, HTMLInputElement>>(new Map());
  const [confirmImageDelete, setConfirmImageDelete] = useState<number | null>(null);
  const [confirmFloorDelete, setConfirmFloorDelete] = useState<number | null>(null);

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
        <div key={i} style={{ marginBottom: 4 }}>
          <div
            style={{
              padding: '6px 8px', borderRadius: 4, cursor: 'pointer',
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
                title={floor.image ? 'Заменить изображение' : 'Загрузить план этажа'}
              >
                {floor.image ? '✓' : '🖼'}
              </button>
              {floor.image && (
                <button
                  data-testid={`delete-image-${i}`}
                  style={{ fontSize: 11, padding: '2px 6px', color: '#c62828' }}
                  onClick={() => setConfirmImageDelete(i)}
                  title="Удалить изображение"
                >
                  🗑
                </button>
              )}
              <button
                data-testid={`remove-floor-${i}`}
                style={{ fontSize: 11, padding: '2px 6px', color: 'red' }}
                onClick={() => setConfirmFloorDelete(i)}
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

          {confirmFloorDelete === i && (
            <div style={{
              margin: '2px 0 0', padding: '6px 8px', background: '#ffebee',
              border: '1px solid #ef9a9a', borderRadius: 4, fontSize: 12,
            }}>
              <div style={{ marginBottom: 6 }}>Удалить этаж «{floor.name}» со всеми узлами?</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => { removeFloor(i); setConfirmFloorDelete(null); }}
                  style={{ flex: 1, padding: '4px 0', background: '#c62828', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
                >
                  Удалить
                </button>
                <button
                  onClick={() => setConfirmFloorDelete(null)}
                  style={{ flex: 1, padding: '4px 0', background: '#f5f5f5', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
                >
                  Отмена
                </button>
              </div>
            </div>
          )}

          {confirmImageDelete === i && (
            <div style={{
              margin: '2px 0 0', padding: '6px 8px', background: '#fff3e0',
              border: '1px solid #ffcc80', borderRadius: 4, fontSize: 12,
            }}>
              <div style={{ marginBottom: 6 }}>Удалить изображение «{floor.image}»?</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => { removeFloorImage(i); setConfirmImageDelete(null); }}
                  style={{ flex: 1, padding: '4px 0', background: '#c62828', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
                >
                  Удалить
                </button>
                <button
                  onClick={() => setConfirmImageDelete(null)}
                  style={{ flex: 1, padding: '4px 0', background: '#f5f5f5', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
                >
                  Отмена
                </button>
              </div>
            </div>
          )}
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
