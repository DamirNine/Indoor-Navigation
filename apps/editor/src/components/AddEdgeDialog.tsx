import { useState } from 'react';
import { EdgeType } from '../types/building';

interface Props {
  fromLabel: string;
  toLabel: string;
  onConfirm: (type: EdgeType, weight: number) => void;
  onCancel: () => void;
}

export default function AddEdgeDialog({ fromLabel, toLabel, onConfirm, onCancel }: Props) {
  const [type, setType] = useState<EdgeType>('walk');
  const [weight, setWeight] = useState('10');

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: 'white', padding: 24, borderRadius: 8, minWidth: 280 }}>
        <h3 style={{ margin: '0 0 8px' }}>Добавить связь</h3>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#666' }}>{fromLabel} → {toLabel}</p>
        <label style={{ display: 'block', marginBottom: 12 }}>
          Тип<br />
          <select data-testid="edge-type" value={type} onChange={e => setType(e.target.value as EdgeType)} style={{ width: '100%' }}>
            <option value="walk">Коридор</option>
            <option value="stairs">Лестница</option>
            <option value="elevator">Лифт</option>
          </select>
        </label>
        <label style={{ display: 'block', marginBottom: 16 }}>
          Вес (метры)<br />
          <input
            data-testid="edge-weight"
            type="number"
            min="0.1"
            step="0.5"
            value={weight}
            onChange={e => setWeight(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
        </label>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel}>Отмена</button>
          <button data-testid="edge-confirm" onClick={() => onConfirm(type, parseFloat(weight) || 10)}>
            Добавить
          </button>
        </div>
      </div>
    </div>
  );
}
