import { useEditorStore } from '../store/editorStore';
import type { Tool } from '../types/building';

const TOOLS: { value: Tool; label: string; title: string }[] = [
  { value: 'select', label: '↖', title: 'Выбор и редактирование' },
  { value: 'node',   label: '●', title: 'Добавить узел' },
  { value: 'edge',   label: '—', title: 'Добавить ребро' },
  { value: 'move',   label: '⤢', title: 'Переместить узел' },
  { value: 'pan',    label: '✋', title: 'Перемещение карты и зум' },
  { value: 'zone',    label: '⬡', title: 'Нарисовать область узла' },
  { value: 'contour', label: '⬜', title: 'Контур здания' },
  { value: 'wall',    label: '‖', title: 'Нарисовать стену' },
];

interface Props {
  onMenuClick: () => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
}

export default function Toolbar({ onMenuClick, zoom, onZoomIn, onZoomOut, onZoomReset }: Props) {
  const { tool, setTool, undo, past } = useEditorStore();

  const btn = (active: boolean): React.CSSProperties => ({
    padding: '6px 10px', fontSize: 15, minWidth: 36, height: 34,
    fontWeight: active ? 'bold' : 'normal',
    background: active ? '#e3f2fd' : 'white',
    border: `1px solid ${active ? '#1976D2' : '#ccc'}`,
    borderRadius: 4, cursor: 'pointer',
  });

  return (
    <div style={{ padding: '5px 8px', borderBottom: '1px solid #ddd', display: 'flex', gap: 5, background: 'white', alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
      <button onClick={onMenuClick} title="Меню" style={btn(false)}>☰</button>

      <div style={{ width: 1, height: 24, background: '#ddd', margin: '0 2px' }} />

      {TOOLS.map(t => (
        <button key={t.value} data-testid={`tool-${t.value}`} onClick={() => setTool(t.value)} title={t.title} style={btn(tool === t.value)}>
          {t.label}
        </button>
      ))}

      <div style={{ width: 1, height: 24, background: '#ddd', margin: '0 2px' }} />

      <button onClick={undo} disabled={past.length === 0} title="Отменить (Ctrl+Z)"
        style={{ ...btn(false), opacity: past.length === 0 ? 0.4 : 1, fontSize: 13 }}>
        ↩
      </button>

      <div style={{ width: 1, height: 24, background: '#ddd', margin: '0 2px' }} />

      <button onClick={onZoomOut}  title="Отдалить"  style={btn(false)}>−</button>
      <span style={{ fontSize: 11, color: '#666', minWidth: 36, textAlign: 'center' }}>
        {Math.round(zoom * 100)}%
      </span>
      <button onClick={onZoomIn}   title="Приблизить" style={btn(false)}>+</button>
      <button onClick={onZoomReset} title="Сбросить"  style={{ ...btn(false), fontSize: 12 }}>↺</button>
    </div>
  );
}
