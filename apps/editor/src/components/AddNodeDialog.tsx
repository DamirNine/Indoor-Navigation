import { useState } from 'react';
import { NodeType } from '../types/building';

interface Props {
  onConfirm: (type: NodeType, label: string) => void;
  onCancel: () => void;
}

export default function AddNodeDialog({ onConfirm, onCancel }: Props) {
  const [type, setType] = useState<NodeType>('room');
  const [label, setLabel] = useState('');

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: 'white', padding: 24, borderRadius: 8, minWidth: 280 }}>
        <h3 style={{ margin: '0 0 16px' }}>Добавить узел</h3>
        <label style={{ display: 'block', marginBottom: 12 }}>
          Тип<br />
          <select data-testid="node-type" value={type} onChange={e => setType(e.target.value as NodeType)} style={{ width: '100%' }}>
            <option value="room">Кабинет</option>
            <option value="stairs">Лестница</option>
            <option value="elevator">Лифт</option>
            <option value="entrance">Вход</option>
          </select>
        </label>
        <label style={{ display: 'block', marginBottom: 16 }}>
          Название<br />
          <input
            data-testid="node-label"
            value={label}
            onChange={e => setLabel(e.target.value)}
            autoFocus
            placeholder="Кабинет 101"
            style={{ width: '100%', boxSizing: 'border-box' }}
            onKeyDown={e => {
              if (e.key === 'Enter' && label.trim()) onConfirm(type, label.trim());
              if (e.key === 'Escape') onCancel();
            }}
          />
        </label>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel}>Отмена</button>
          <button data-testid="node-confirm" disabled={!label.trim()} onClick={() => onConfirm(type, label.trim())}>
            Добавить
          </button>
        </div>
      </div>
    </div>
  );
}
