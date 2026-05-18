import { useState, useEffect } from 'react';
import { useEditorStore } from '../store/editorStore';
import type { NodeType } from '../types/building';

export default function NodeProperties() {
  const { building, activeFloorIndex, selectedNodeId, updateNode, deleteNode, selectNode, moveNode } = useEditorStore();
  const floor = building.floors[activeFloorIndex];
  const node = floor?.nodes.find(n => n.id === selectedNodeId);

  const [xInput, setXInput] = useState('');
  const [yInput, setYInput] = useState('');

  useEffect(() => {
    if (node) {
      setXInput(String(Math.round(node.x)));
      setYInput(String(Math.round(node.y)));
    }
  }, [node?.id, node?.x, node?.y]);

  if (!node) return null;

  const applyX = () => {
    const v = parseInt(xInput);
    if (!isNaN(v)) moveNode(node.id, v, node.y);
    else setXInput(String(Math.round(node.x)));
  };
  const applyY = () => {
    const v = parseInt(yInput);
    if (!isNaN(v)) moveNode(node.id, node.x, v);
    else setYInput(String(Math.round(node.y)));
  };
  const onKey = (fn: () => void) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { fn(); (e.target as HTMLInputElement).blur(); }
  };

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
      <label style={{ display: 'block', marginBottom: 10 }}>
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
      <p style={{ fontSize: 11, color: '#999', margin: '0 0 6px' }}>ID: {node.id}</p>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <label style={{ flex: 1, fontSize: 12 }}>
          X<br />
          <input
            type="number"
            value={xInput}
            onChange={e => setXInput(e.target.value)}
            onBlur={applyX}
            onKeyDown={onKey(applyX)}
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
        </label>
        <label style={{ flex: 1, fontSize: 12 }}>
          Y<br />
          <input
            type="number"
            value={yInput}
            onChange={e => setYInput(e.target.value)}
            onBlur={applyY}
            onKeyDown={onKey(applyY)}
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
        </label>
      </div>
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
