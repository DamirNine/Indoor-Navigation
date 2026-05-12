import { useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import { validateBuilding } from '../lib/validation';
import { exportZip } from '../lib/export';

export default function ExportButton() {
  const { building } = useEditorStore();
  const [errors, setErrors] = useState<string[]>([]);

  const handleExport = async () => {
    const validationErrors = validateBuilding(building);
    if (validationErrors.length > 0) {
      setErrors(validationErrors.map(e => e.message));
      return;
    }
    setErrors([]);
    const blob = await exportZip(building);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${building.id || 'building'}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <button
        data-testid="export-button"
        onClick={handleExport}
        style={{ width: '100%', padding: '8px 0', background: '#1976D2', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold' }}
      >
        Экспорт ZIP
      </button>
      {errors.length > 0 && (
        <div data-testid="export-errors" style={{ marginTop: 8, color: '#c62828', fontSize: 12 }}>
          {errors.map((e, i) => <div key={i}>• {e}</div>)}
        </div>
      )}
    </div>
  );
}
