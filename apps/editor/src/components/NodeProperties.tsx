import { useEditorStore } from '../store/editorStore';
import { NodeType } from '../types/building';

export default function NodeProperties() {
  const { building, activeFloorIndex, selectedNodeId, updateNode, deleteNode, selectNode } = useEditorStore();
  const floor = building.floors[activeFloorIndex];
  const node = floor?.nodes.find(n => n.id === selectedNodeId);
  if (!node) return null;

  return (
    <div>
      <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>Свойства узла</h3>
      <label style={{ display: 'block', marginBottom: 8 }}>
        Название<br />
        <input
          data-testid="node-label-edit"
          value={node.label}
          onChange={e => updateNode(node.id, { label: e.target.value })}
          style={{ width: '100%', boxSizing: 'border-box' }}
        />
      </label>
      <label style={{ display: 'block', marginBottom: 12 }}>
        Тип<br />
        <select
          value={node.type}
          onChange={e => updateNode(node.id, { type: e.target.value as NodeType })}
          style={{ width: '100%' }}
        >
          <option value="room">Кабинет</option>
          <option value="stairs">Лестница</option>
          <option value="elevator">Лифт</option>
          <option value="entrance">Вход</option>
        </select>
      </label>
      <p style={{ fontSize: 11, color: '#999', margin: '0 0 12px' }}>
        ID: {node.id}<br />X: {Math.round(node.x)}, Y: {Math.round(node.y)}
      </p>
      <button
        data-testid="delete-node"
        onClick={() => { deleteNode(node.id); selectNode(null); }}
        style={{ color: 'red', width: '100%', padding: '4px 0' }}
      >
        Удалить узел
      </button>
    </div>
  );
}
