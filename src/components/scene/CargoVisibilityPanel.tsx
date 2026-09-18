import { useState } from 'react';

interface CargoVisibilityPanelProps {
  items: Array<{ cargoTemplateId: string; name: string; color: string; count: number }>;
  hiddenIds: Set<string>;
  onToggle: (cargoTemplateId: string) => void;
  onShowAll: () => void;
  // true khi StepSimulationControls (thanh cuộn xem từng bước, full-width sát đáy) đang hiện — tự
  // nâng bảng lên cao hơn để 2 bên không đè lên nhau (cùng cách SceneCornerCluster `raised`).
  raised?: boolean;
}

/**
 * Bảng nhỏ liệt kê các LOẠI hàng (theo cargoTemplateId) đang có trong container ĐANG XEM, mỗi loại
 * 1 checkbox để ẩn/hiện RIÊNG loại đó trong khung 3D — giúp quan sát 1 loại hàng cụ thể giữa nhiều
 * loại khác đang xếp chồng lấn. Chỉ ảnh hưởng HIỂN THỊ (ContainerScene.tsx lọc lúc render 3D), KHÔNG
 * ảnh hưởng dữ liệu solution hay số bước mô phỏng. Ẩn hẳn khi container không có loại hàng nào.
 *
 * Thu gọn (`collapsed`, state cục bộ) chỉ ẩn PHẦN HIỂN THỊ danh sách — hiddenIds nằm ở
 * ContainerScene.tsx nên trạng thái ẩn/hiện từng loại không bị mất khi thu gọn.
 */
export function CargoVisibilityPanel({ items, hiddenIds, onToggle, onShowAll, raised }: CargoVisibilityPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  if (items.length === 0) return null;
  return (
    <div className={`cargo-visibility-panel${raised ? ' cargo-visibility-panel--raised' : ''}`}>
      <div className="cargo-visibility-panel-header">
        <button
          type="button"
          className="cargo-visibility-panel-collapse-btn"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Mở rộng' : 'Thu gọn'}
        >
          {collapsed ? '▸' : '▾'}
        </button>
        <span className="cargo-visibility-panel-title">Hàng hóa</span>
        <button type="button" onClick={onShowAll} className="cargo-visibility-panel-show-all">
          Hiện tất cả
        </button>
      </div>
      {!collapsed && (
        <div className="cargo-visibility-panel-list">
          {items.map((item) => (
            <label key={item.cargoTemplateId} className="cargo-visibility-panel-item">
              <input
                type="checkbox"
                checked={!hiddenIds.has(item.cargoTemplateId)}
                onChange={() => onToggle(item.cargoTemplateId)}
              />
              <span className="cargo-visibility-panel-swatch" style={{ backgroundColor: item.color }} />
              <span className="cargo-visibility-panel-name">{item.name}</span>
              <span className="cargo-visibility-panel-count">×{item.count}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
