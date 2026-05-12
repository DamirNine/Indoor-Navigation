import { useEditorStore } from '../store/editorStore';
import { Tool } from '../types/building';

const TOOLS: { value: Tool; label: string; title: string }[] = [
  { value: 'select', label: '↖ Выбор', title: 'Выбор и редактирование' },
  { value: 'node', label: '● Узел', title: 'Кликните на карте для добавления узла' },
  { value: 'edge', label: '— Ребро', title: 'Кликните два узла для создания связи' },
];

export default function Toolbar() {
  const { tool, setTool } = useEditorStore();
  return (
    <div style={{ padding: '6px 12px', borderBottom: '1px solid #ddd', display: 'flex', gap: 8, background: 'white' }}>
      {TOOLS.map(t => (
        <button
          key={t.value}
          data-testid={`tool-${t.value}`}
          onClick={() => setTool(t.value)}
          title={t.title}
          style={{
            padding: '4px 12px', fontSize: 13,
            fontWeight: tool === t.value ? 'bold' : 'normal',
            background: tool === t.value ? '#e3f2fd' : 'white',
            border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer',
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
