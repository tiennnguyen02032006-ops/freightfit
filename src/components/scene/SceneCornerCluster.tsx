import type { ContainerInstance } from '../../domain/types';
import { CargoDetailPopup } from './CargoDetailPopup';

interface SceneCornerClusterProps {
  simulating: boolean;
  onToggleSimulating: () => void;
  // undefined = không có kiện hàng nào đang chọn (hoặc đang ở chế độ xem từng bước) — ẩn hẳn nút
  // "Xoay 3 chiều" thay vì hiện nút rồi disable, vì bấm bật chế độ xoay mà không có kiện nào để
  // xoay chỉ gây rối (không có mũi tên nào để hiện ra cả) — xem ContainerScene.tsx.
  rotateMode?: { active: boolean; onToggle: () => void };
  container: ContainerInstance | undefined;
  // true khi StepSimulationControls (thanh cuộn xem từng bước) đang hiện — thanh đó nằm full-width
  // sát đáy khung 3D, phải tự đẩy cụm này lên cao hơn để 2 bên không đè lên nhau.
  raised: boolean;
}

/**
 * Cụm cố định ở góc dưới-phải khung 3D, gộp 3 thành phần trước đây nằm rải rác:
 * 1. Nút "Xem từng bước" (trước ở CameraToolbar.tsx, thanh công cụ trên cùng).
 * 2. Nút "Xoay 3 chiều" (trước cũng ở CameraToolbar.tsx).
 * 3. Bảng "Thông tin hàng hóa" (CargoDetailPopup.tsx — trước đây tự bám theo vị trí 3D của kiện
 *    hàng đang chọn, nổi ngay cạnh nó; nay CỐ ĐỊNH tại đây, không di chuyển theo kiện hàng nữa).
 *
 * Xếp theo chiều dọc: 2 nút phía trên, bảng thông tin phía dưới — bảng thông tin tự ẩn (component
 * con trả về null) khi không có kiện hàng nào đang chọn, cụm khi đó chỉ còn lại 2 nút gọn gàng.
 *
 * `raised`: khi đang xem từng bước (StepSimulationControls hiện, chiếm full-width sát đáy khung
 * 3D), cụm này phải tự nâng lên cao hơn (xem `.scene-corner-cluster--raised` trong App.css) để
 * không chồng lên thanh đó.
 *
 * `max-height`/`overflow-y: auto` (App.css) đảm bảo cụm không cao hơn khung nhìn 3D khi màn hình
 * nhỏ — tự cuộn bên trong thay vì tràn ra ngoài, che khuất container/hàng hóa.
 */
export function SceneCornerCluster({
  simulating,
  onToggleSimulating,
  rotateMode,
  container,
  raised,
}: SceneCornerClusterProps) {
  return (
    <div className={`scene-corner-cluster${raised ? ' scene-corner-cluster--raised' : ''}`}>
      <div className="scene-corner-cluster-buttons">
        <button
          type="button"
          className={simulating ? 'is-active' : undefined}
          onClick={onToggleSimulating}
          aria-pressed={simulating}
        >
          Xem từng bước
        </button>
        {rotateMode && (
          <button
            type="button"
            className={rotateMode.active ? 'is-active' : undefined}
            onClick={rotateMode.onToggle}
            aria-pressed={rotateMode.active}
            title="Bấm để chuyển sang chế độ xoay (hiện mũi tên cong, bấm đầu mũi tên để xoay ngang 90°) — bấm lại để quay về chế độ di chuyển (kéo thân kiện)"
          >
            Xoay 3 chiều
          </button>
        )}
      </div>
      <CargoDetailPopup container={container} />
    </div>
  );
}
