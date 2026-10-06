import { useAppStore } from '../../store';

export type CameraPreset = 'ISOMETRIC' | 'TOP' | 'SIDE';

interface CameraToolbarProps {
  value: CameraPreset;
  onSelectPreset: (preset: CameraPreset) => void;
}

const PRESETS: Array<{ id: CameraPreset; label: string }> = [
  { id: 'ISOMETRIC', label: 'Isometric' },
  { id: 'TOP', label: 'Top' },
  { id: 'SIDE', label: 'Side' },
];

/**
 * Thanh góc nhìn của khung 3D: 3 góc nhìn camera gom thành MỘT thanh chọn (chọn 1 trong 3, góc đang dùng được tô
 * nhấn) + công tắc lớp "Chèn lót" (túi khí trong các khe, mặc định bật). "Xem từng bước" và "Xoay 3 chiều" vẫn
 * nằm ở cụm góc dưới-phải khung 3D (SceneCornerCluster.tsx).
 */
export function CameraToolbar({ value, onSelectPreset }: CameraToolbarProps) {
  const showDunnage = useAppStore((s) => s.ui.showDunnage);
  const toggleDunnage = useAppStore((s) => s.toggleDunnage);

  return (
    <div className="result-viewbar">
      <div className="result-segmented" role="radiogroup" aria-label="Góc nhìn">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={value === p.id}
            className={value === p.id ? 'is-active' : undefined}
            onClick={() => onSelectPreset(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        className={`result-chip${showDunnage ? ' is-active' : ''}`}
        aria-pressed={showDunnage}
        onClick={toggleDunnage}
        title="Bật/tắt lớp chèn lót (túi khí trong các khe)"
      >
        Chèn lót
      </button>
    </div>
  );
}
