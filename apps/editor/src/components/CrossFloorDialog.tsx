import { useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import { EdgeType, NavNode } from '../types/building';

interface Props { onClose: () => void; }

export default function CrossFloorDialog({ onClose }: Props) {
  const { building, addCrossFloorEdge, deleteCrossFloorEdge } = useEditorStore();
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [type, setType] = useState<EdgeType>('stairs');
  const [weight, setWeight] = useState('5');

  const transitionNodes: (NavNode & { floorName: string })[] = building.floors.flatMap(floor =>
    floor.nodes
      .filter(n => n.type === 'stairs' || n.type === 'elevator')
      .map(n => ({ ...n, floorName: floor.name }))
  );

  const handleAdd = () => {
    if (!fromId || !toId || fromId === toId) return;
    addCrossFloorEdge({ from: fromId, to: toId, type, weight: parseFloat(weight) || 5 });
    setFromId('');
    setToId('');
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: 'white', padding: 24, borderRadius: 8, width: 460, maxHeight: '80vh', overflowY: 'auto' }}>
        <h3 style={{ margin: '0 0 8px' }}>Межэтажные связи</h3>
        <p style={{ fontSize: 13, color: '#666', margin: '0 0 16px' }}>
          Связывайте узлы «лестница» или «лифт» на разных этажах.
        </p>

        {building.crossFloorEdges.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            {building.crossFloorEdges.map((edge, i) => {
              const from = transitionNodes.find(n => n.id === edge.from);
              const to = transitionNodes.find(n => n.id === edge.to);
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>
                  <span>{from?.label} ({from?.floorName}) ↔ {to?.label} ({to?.floorName}) [{edge.type}, {edge.weight}м]</span>
                  <button
                    data-testid={`delete-cross-${i}`}
                    onClick={() => deleteCrossFloorEdge(edge.from, edge.to)}
                    style={{ color: 'red', marginLeft: 8, padding: '0 4px' }}
                  >✕</button>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ borderTop: '1px solid #eee', paddingTop: 16 }}>
          <strong style={{ fontSize: 13 }}>Добавить связь</strong>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '8px 0' }}>
            <label style={{ fontSize: 13 }}>
              Узел 1<br />
              <select data-testid="cross-from" value={fromId} onChange={e => setFromId(e.target.value)} style={{ width: '100%' }}>
                <option value="">Выберите...</option>
                {transitionNodes.map(n => <option key={n.id} value={n.id}>{n.label} ({n.floorName})</option>)}
              </select>
            </label>
            <label style={{ fontSize: 13 }}>
              Узел 2<br />
              <select data-testid="cross-to" value={toId} onChange={e => setToId(e.target.value)} style={{ width: '100%' }}>
                <option value="">Выберите...</option>
                {transitionNodes.filter(n => n.id !== fromId).map(n => <option key={n.id} value={n.id}>{n.label} ({n.floorName})</option>)}
              </select>
            </label>
            <label style={{ fontSize: 13 }}>
              Тип<br />
              <select value={type} onChange={e => setType(e.target.value as EdgeType)} style={{ width: '100%' }}>
                <option value="stairs">Лестница</option>
                <option value="elevator">Лифт</option>
              </select>
            </label>
            <label style={{ fontSize: 13 }}>
              Вес (сек)<br />
              <input type="number" value={weight} onChange={e => setWeight(e.target.value)} min="1" style={{ width: '100%', boxSizing: 'border-box' }} />
            </label>
          </div>
          <button data-testid="add-cross-floor" onClick={handleAdd} disabled={!fromId || !toId} style={{ padding: '4px 12px' }}>
            Добавить связь
          </button>
        </div>

        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <button onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  );
}
