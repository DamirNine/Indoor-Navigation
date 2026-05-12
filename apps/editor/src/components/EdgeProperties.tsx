import { useEditorStore } from '../store/editorStore';
import { EdgeType } from '../types/building';

export default function EdgeProperties() {
  const { building, activeFloorIndex, selectedEdgeKey, updateEdge, deleteEdge } = useEditorStore();
  const floor = building.floors[activeFloorIndex];
  if (!selectedEdgeKey || !floor) return null;

  const [fromId, toId] = selectedEdgeKey.split('->');
  const edge = floor.edges.find(
    e => (e.from === fromId && e.to === toId) || (e.from === toId && e.to === fromId)
  );
  if (!edge) return null;

  const fromNode = floor.nodes.find(n => n.id === edge.from);
  const toNode = floor.nodes.find(n => n.id === edge.to);

  return (
    <div>
      <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Свойства ребра</h3>
      <p style={{ fontSize: 12, color: '#666', margin: '0 0 12px' }}>
        {fromNode?.label} ↔ {toNode?.label}
      </p>
      <label style={{ display: 'block', marginBottom: 8 }}>
        Тип<br />
        <select
          value={edge.type}
          onChange={e => updateEdge(edge.from, edge.to, { type: e.target.value as EdgeType })}
          style={{ width: '100%' }}
        >
          <option value="walk">Коридор</option>
          <option value="stairs">Лестница</option>
          <option value="elevator">Лифт</option>
        </select>
      </label>
      <label style={{ display: 'block', marginBottom: 12 }}>
        Вес (метры)<br />
        <input
          type="number"
          min="0.1"
          step="0.5"
          value={edge.weight}
          onChange={e => updateEdge(edge.from, edge.to, { weight: parseFloat(e.target.value) || edge.weight })}
          style={{ width: '100%', boxSizing: 'border-box' }}
        />
      </label>
      <button
        data-testid="delete-edge"
        onClick={() => deleteEdge(edge.from, edge.to)}
        style={{ color: 'red', width: '100%', padding: '4px 0' }}
      >
        Удалить ребро
      </button>
    </div>
  );
}
