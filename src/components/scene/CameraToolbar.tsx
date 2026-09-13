export type CameraPreset = 'ISOMETRIC' | 'TOP' | 'SIDE';

interface CameraToolbarProps {
  onSelectPreset: (preset: CameraPreset) => void;
}

// Chỉ còn 3 nút chọn góc nhìn camera — "Xem từng bước" và "Xoay 3 chiều" đã chuyển xuống cụm cố
// định ở góc dưới-phải màn hình (xem SceneCornerCluster.tsx) để không trùng lặp ở 2 nơi.
export function CameraToolbar({ onSelectPreset }: CameraToolbarProps) {
  return (
    <div className="camera-toolbar">
      <button type="button" onClick={() => onSelectPreset('ISOMETRIC')}>
        Isometric
      </button>
      <button type="button" onClick={() => onSelectPreset('TOP')}>
        Top
      </button>
      <button type="button" onClick={() => onSelectPreset('SIDE')}>
        Side
      </button>
    </div>
  );
}
