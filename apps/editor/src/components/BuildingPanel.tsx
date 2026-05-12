import { useEditorStore } from '../store/editorStore';

export default function BuildingPanel() {
  const { building, setBuildingInfo } = useEditorStore();
  return (
    <div>
      <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Здание</h3>
      <label style={{ display: 'block', marginBottom: 6 }}>
        ID<br />
        <input
          data-testid="building-id"
          value={building.id}
          onChange={e => setBuildingInfo(e.target.value, building.name)}
          placeholder="korpus-a"
          style={{ width: '100%', boxSizing: 'border-box' }}
        />
      </label>
      <label style={{ display: 'block' }}>
        Название<br />
        <input
          data-testid="building-name"
          value={building.name}
          onChange={e => setBuildingInfo(building.id, e.target.value)}
          placeholder="Корпус А"
          style={{ width: '100%', boxSizing: 'border-box' }}
        />
      </label>
    </div>
  );
}
