import { forwardRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useAppStore } from '../../store';
import type { CenterOfGravityWarning, ContainerInstance, ContainerTemplate } from '../../domain/types';
import { ContainerPicker } from './ContainerPicker';
import { formatMmAsCm, formatNumber } from '../shared/formatUnits';

interface SceneStatsBarProps {
  containerTemplate: ContainerTemplate;
  container: ContainerInstance | undefined;
  cgWarnings: CenterOfGravityWarning[];
  // Tay cầm kéo (icon 6 chấm) hiện ở góc trái dải header — do DraggableStatsBar.tsx truyền vào,
  // component này chỉ có nhiệm vụ CHỪA CHỖ hiện nó, không tự biết gì về việc kéo-thả.
  dragHandle?: ReactNode;
  // Vị trí tùy chỉnh (khi đã kéo, xem DraggableStatsBar.tsx) — undefined = không ép style vị trí
  // gì cả, để CSS mặc định (nằm trong hàng flex .scene-top-row) tự quyết định.
  style?: CSSProperties;
}

/** Nhãn tiếng Việt cho trục cảnh báo lệch trọng tâm — xem CenterOfGravityWarning.axis. */
const CG_AXIS_LABEL: Record<CenterOfGravityWarning['axis'], string> = {
  X: 'lệch ngang',
  Y: 'lệch cao',
  Z: 'lệch dọc',
};

/**
 * Dải thông tin container, nền tối mờ, góc trên khung 3D — thay cho StatsPanel/SolutionSwitcher
 * cố định ở cột phải (đã bỏ cột phải). Dòng tên + kích thước luôn hiện (lấy từ containerTemplate
 * đang chọn); các cột số liệu (trọng lượng/thể tích/lệch ngang/lệch dọc) chỉ hiện khi `container`
 * (instance đã pack, khớp đúng containerTemplate đang chọn) tồn tại — tức đã có phương án.
 * Chỉ còn 1 thuật toán xếp hàng duy nhất — đã bỏ hẳn dropdown chọn phương án
 * cost/space/balanced.
 *
 * Kéo-thả tự do (di chuyển cả dải đến vị trí bất kỳ trong khung 3D) do component cha
 * DraggableStatsBar.tsx đảm nhiệm hoàn toàn — component này CHỈ nhận `ref` (để đo kích thước phục
 * vụ tính giới hạn kéo), `style` (áp vị trí tùy chỉnh khi đã kéo) và `dragHandle` (icon 6 chấm hiện
 * sẵn ở góc trái header) làm props thuần túy, không tự chứa logic kéo-thả nào.
 *
 * `cgWarnings` không rỗng -> hiện banner cam CHỈ MANG TÍNH CẢNH BÁO (UI warning, không phải hard
 * block — xem CLAUDE.md ngôn từ UI: không dùng lời "đảm bảo không đổ hàng", chỉ nêu heuristic
 * hình học), không chặn người dùng tạo/xuất phương án.
 *
 * Tải trọng tối đa (dòng "Trọng lượng") có thể BẤM VÀO SỐ để sửa TẠM THỜI cho lần xem này — lưu
 * trong state cục bộ `payloadOverrides` (key theo containerTemplate.id), KHÔNG ghi ngược vào
 * containerLibrary trong store và KHÔNG ảnh hưởng tới lần "Tạo phương án xếp hàng" kế tiếp (vẫn
 * dùng đúng maxPayload gốc của thư viện) — chỉ đổi mẫu số hiển thị ở đây và tự tính lại cảnh báo
 * vượt tải nếu hàng đã xếp (container.totalWeight, không đổi) giờ vượt quá mức mới.
 */
export const SceneStatsBar = forwardRef<HTMLDivElement, SceneStatsBarProps>(function SceneStatsBar(
  { containerTemplate, container, cgWarnings, dragHandle, style },
  ref,
) {
  const cargoTemplates = useAppStore((s) => s.cargoTemplates);
  const selectedContainerTemplateId = useAppStore((s) => s.selectedContainerTemplateId);
  const generateSolutionForContainer = useAppStore((s) => s.generateSolutionForContainer);

  const [payloadOverrides, setPayloadOverrides] = useState<Record<string, number>>({});
  const [editingPayload, setEditingPayload] = useState(false);
  const [payloadDraft, setPayloadDraft] = useState('');

  const effectiveMaxPayload = payloadOverrides[containerTemplate.id] ?? containerTemplate.maxPayload;

  const commitPayloadEdit = () => {
    const parsed = Number(payloadDraft);
    if (Number.isFinite(parsed) && parsed > 0) {
      setPayloadOverrides((prev) => ({ ...prev, [containerTemplate.id]: parsed }));
    }
    setEditingPayload(false);
  };

  const sizeLabel = `${formatMmAsCm(containerTemplate.innerLength)} × ${formatMmAsCm(
    containerTemplate.innerWidth,
  )} × ${formatMmAsCm(containerTemplate.innerHeight)} cm`;

  const containerVolumeM3 =
    (containerTemplate.innerLength * containerTemplate.innerWidth * containerTemplate.innerHeight) / 1_000_000_000;

  return (
    <div className="scene-stats-bar" ref={ref} style={style}>
      <div className="scene-stats-bar-header">
        {dragHandle}
        <ContainerPicker label={`${containerTemplate.name} (${sizeLabel})`} />

        <div className="scene-stats-bar-header-actions">
          <button
            type="button"
            className="scene-stats-bar-generate-btn"
            disabled={!selectedContainerTemplateId || cargoTemplates.length === 0}
            onClick={() =>
              selectedContainerTemplateId && generateSolutionForContainer(selectedContainerTemplateId)
            }
          >
            Tạo phương án xếp hàng
          </button>
        </div>
      </div>

      {containerTemplate.notes && <div className="scene-stats-bar-note">{containerTemplate.notes}</div>}

      {cgWarnings.length > 0 && (
        <div className="scene-stats-bar-cg-warning">
          {cgWarnings.map((w) => (
            <div key={w.axis}>
              ⚠ Trọng tâm {CG_AXIS_LABEL[w.axis]} {formatNumber(w.offsetRatio * 100, 0)}% — khuyến nghị phân bổ lại
              hàng hóa
            </div>
          ))}
        </div>
      )}

      {container && container.totalWeight > effectiveMaxPayload && (
        <div className="scene-stats-bar-cg-warning">
          <div>
            ⚠ Trọng lượng đã xếp ({formatNumber(container.totalWeight, 0)} kg) vượt quá tải trọng tối đa vừa chỉnh (
            {formatNumber(effectiveMaxPayload, 0)} kg)
          </div>
        </div>
      )}

      {container && (
        <div className="scene-stats-bar-metrics">
          <div className="scene-stats-bar-metric">
            <span className="scene-stats-bar-metric-label">
              <span className="scene-stats-bar-icon" aria-hidden="true">🧺</span>
              Trọng lượng
            </span>
            <span className="scene-stats-bar-value">
              {formatNumber(container.totalWeight, 0)} /{' '}
              {editingPayload ? (
                <input
                  type="number"
                  min="1"
                  step="any"
                  autoFocus
                  value={payloadDraft}
                  onChange={(e) => setPayloadDraft(e.target.value)}
                  onBlur={commitPayloadEdit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitPayloadEdit();
                  }}
                  className="scene-stats-bar-payload-input"
                  aria-label="Tải trọng tối đa tạm thời (kg)"
                />
              ) : (
                <button
                  type="button"
                  className="scene-stats-bar-payload-edit"
                  onClick={() => {
                    setPayloadDraft(String(effectiveMaxPayload));
                    setEditingPayload(true);
                  }}
                  title="Bấm để chỉnh tải trọng tối đa tạm thời cho container đang xem (không đổi dữ liệu gốc trong thư viện)"
                >
                  {formatNumber(effectiveMaxPayload, 0)}
                </button>
              )}{' '}
              kg ({formatNumber((container.totalWeight / effectiveMaxPayload) * 100, 0)}%)
            </span>
          </div>
          <div className="scene-stats-bar-metric">
            <span className="scene-stats-bar-metric-label">
              <span className="scene-stats-bar-icon" aria-hidden="true">🧊</span>
              Thể tích
            </span>
            <span className="scene-stats-bar-value">
              {formatNumber(container.usedVolume / 1_000_000_000)} / {formatNumber(containerVolumeM3)} m³
            </span>
          </div>
          <div className="scene-stats-bar-metric">
            <span className="scene-stats-bar-metric-label">
              <span className="scene-stats-bar-icon" aria-hidden="true">⚖️</span>
              Lệch ngang
            </span>
            <span className="scene-stats-bar-value">{formatNumber(container.cgOffsetXRatio * 100, 0)}%</span>
          </div>
          <div className="scene-stats-bar-metric">
            <span className="scene-stats-bar-metric-label">
              <span className="scene-stats-bar-icon" aria-hidden="true">⚖️</span>
              Lệch dọc
            </span>
            <span className="scene-stats-bar-value">{formatNumber(container.cgOffsetZRatio * 100, 0)}%</span>
          </div>
        </div>
      )}
    </div>
  );
});
