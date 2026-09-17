import { useEffect, useState } from 'react';
import { useAppStore } from '../../store';
import type { ContainerInstance } from '../../domain/types';
import { getAvailableRotationAxes } from '../../engine/rotationAvailability';
import { formatMmAsCm } from '../shared/formatUnits';

interface CargoDetailPopupProps {
  container: ContainerInstance | undefined;
}

/**
 * Nội dung "Thông tin hàng hóa" của kiện đang chọn — nằm trong cụm cố định ở góc dưới-phải màn
 * hình (xem SceneCornerCluster.tsx), KHÔNG còn bám theo vị trí 3D của kiện hàng như trước nữa
 * (từng tự chiếu điểm neo 3D ra màn hình mỗi frame để nổi ngay cạnh kiện hàng — nay đã bỏ hẳn kiểu
 * hiển thị đó theo yêu cầu gộp cụm cố định, đơn giản hơn nhiều: chỉ còn 1 component DOM thường,
 * không cần biết gì về camera/canvas ba chiều nữa).
 *
 * Chỉ hiện nội dung khi có kiện hàng đang được chọn — trả về `null` khi không có, để cụm cha
 * (SceneCornerCluster) tự co lại chỉ còn 2 nút phía trên.
 */
export function CargoDetailPopup({ container }: CargoDetailPopupProps) {
  const cargoTemplates = useAppStore((s) => s.cargoTemplates);
  const selectedPlacementId = useAppStore((s) => s.ui.selectedPlacementId);
  const selectPlacement = useAppStore((s) => s.selectPlacement);

  const [showHelp, setShowHelp] = useState(false);
  // Thu gọn RIÊNG cho bảng này (khác hẳn nút "×" đóng/bỏ chọn kiện hàng) — chỉ ẩn phần danh sách
  // chi tiết + hint, KHÔNG đụng gì tới selectedPlacementId hay bất kỳ state chọn/xoay nào khác, nên
  // "Xoay 3 chiều"/mũi tên RotationArcHandle vẫn hoạt động bình thường khi bảng đang thu gọn.
  const [collapsed, setCollapsed] = useState(false);

  const placement = container?.placements.find((p) => p.id === selectedPlacementId);
  const template = placement ? cargoTemplates.find((t) => t.id === placement.cargoTemplateId) : undefined;

  // Thu gọn lại hướng dẫn + trạng thái thu gọn mỗi khi đổi sang kiện hàng khác — tránh giữ "đã mở
  // hint"/"đã thu gọn" của kiện trước sang kiện sau, dễ gây cảm giác bảng tự dưng cao/thấp hơn bình
  // thường mà không rõ vì sao.
  useEffect(() => {
    setShowHelp(false);
    setCollapsed(false);
  }, [selectedPlacementId]);

  if (!placement || !template) {
    return null;
  }

  // Hàng 'NONE' (không có orientation nào khác) sẽ không xoay được trục nào cả — hiện lý do thay
  // vì im lặng không có mũi tên nào trong khung 3D.
  const { canRotateX, canRotateY, canRotateZ } = getAvailableRotationAxes(placement, template.allowedOrientations);
  const cannotRotate = !canRotateX && !canRotateY && !canRotateZ;

  return (
    <div className="cargo-detail-popup">
      <div className="cargo-detail-popup-header">
        <strong>{template.sku}</strong>
        <div className="cargo-detail-popup-header-actions">
          <button
            type="button"
            className="icon-button"
            aria-label={collapsed ? 'Mở rộng' : 'Thu gọn'}
            title={collapsed ? 'Mở rộng bảng thông tin' : 'Thu gọn bảng thông tin'}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((v) => !v)}
          >
            {collapsed ? '▸' : '−'}
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={showHelp ? 'Ẩn hướng dẫn' : 'Xem hướng dẫn thao tác'}
            title="Hướng dẫn thao tác kéo/xoay"
            onClick={() => setShowHelp((v) => !v)}
          >
            ?
          </button>
          <button type="button" className="icon-button" aria-label="Đóng" onClick={() => selectPlacement(null)}>
            ×
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          <ul>
            <li>
              <span>Tên</span>
              <span>{template.name}</span>
            </li>
            <li>
              <span>Kích thước</span>
              <span>
                {formatMmAsCm(placement.length)} × {formatMmAsCm(placement.width)} × {formatMmAsCm(placement.height)} cm
              </span>
            </li>
            <li>
              <span>Khối lượng</span>
              <span>{placement.weight} kg</span>
            </li>
            <li>
              <span>Stack level</span>
              <span>{placement.stackLevel}</span>
            </li>
            <li>
              <span>Giới hạn xếp chồng</span>
              <span>{template.maxStackLevel ?? 'không giới hạn'}</span>
            </li>
            <li>
              <span>Rotation</span>
              <span>{template.rotation}</span>
            </li>
            <li>
              <span>Support ratio</span>
              <span>{(placement.supportRatio * 100).toFixed(0)}%</span>
            </li>
          </ul>
          {cannotRotate && (
            <p className="cargo-detail-popup-hint">Không xoay được — loại hàng này ở chế độ "Không xoay"</p>
          )}
          {showHelp && (
            <p className="cargo-detail-popup-hint">
              Bấm "Xoay 3 chiều" để hiện 3 mũi tên cong (mỗi trục 1 màu), bấm đầu mũi tên để xoay 90°
              theo đúng trục đó · Kéo thân kiện để di chuyển (giữ Shift để đổi sang kéo theo chiều cao)
              · Giữ Shift + bấm kiện khác để hoán đổi vị trí
            </p>
          )}
        </>
      )}
    </div>
  );
}
