import { forwardRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useAppStore } from '../../store';
import type { CenterOfGravityWarning, ContainerInstance, ContainerSuggestion, ContainerTemplate } from '../../domain/types';
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
  // Nút "Xuất PDF" — chỉ bật khi đã có solution (canExportPdf); isExportingPdf hiện trạng thái
  // đang chụp ảnh/dựng file (vài trăm ms tới vài giây tùy số container) để tránh bấm 2 lần chồng
  // nhau. Logic chụp ảnh 3D + dựng PDF thật nằm ở ContainerScene.tsx/src/export/exportPdf.ts —
  // component này chỉ hiện nút và gọi callback, không tự biết gì về cách xuất.
  canExportPdf: boolean;
  isExportingPdf: boolean;
  onExportPdf: () => void;
  // Gợi ý đổi loại container/xe cho CONTAINER CUỐI (xem
  // engine/optimization/suggestBetterContainer.ts) — ContainerScene.tsx chỉ truyền khác null khi
  // `container` đang hiển thị ở đây CHÍNH LÀ container cuối của solution, nên không cần tự kiểm
  // tra lại ở component này. `suggestedTemplateName` đã tra sẵn tên loại được gợi ý (tránh phải
  // truyền cả containerLibrary xuống đây chỉ để tra 1 tên).
  suggestion: ContainerSuggestion | null;
  suggestedTemplateName: string | undefined;
  onApplySuggestion: () => void;
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
 *
 * Thu gọn/mở lại (`collapsed`) chỉ là state cục bộ (useState, không lưu store/localStorage —
 * không cần giữ qua lại giữa các container/tab hay sau F5, tương tự cách AddCargoPanel.tsx thu
 * gọn form "Nhập hàng thủ công"). Khi thu gọn: ẩn hết nội dung (tên container, 2 nút hành động,
 * cảnh báo, số liệu), CHỈ giữ lại `dragHandle` (để không mất khả năng kéo-thả, xem
 * DraggableStatsBar.tsx) và nút mũi tên để mở lại — không bao giờ ẩn mất hẳn dải này khỏi màn
 * hình.
 */
export const SceneStatsBar = forwardRef<HTMLDivElement, SceneStatsBarProps>(function SceneStatsBar(
  {
    containerTemplate,
    container,
    cgWarnings,
    dragHandle,
    style,
    canExportPdf,
    isExportingPdf,
    onExportPdf,
    suggestion,
    suggestedTemplateName,
    onApplySuggestion,
  },
  ref,
) {
  const cargoTemplates = useAppStore((s) => s.cargoTemplates);
  const selectedContainerTemplateId = useAppStore((s) => s.selectedContainerTemplateId);
  const generateSolutionForContainer = useAppStore((s) => s.generateSolutionForContainer);

  const [collapsed, setCollapsed] = useState(false);
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
    <div className={`scene-stats-bar${collapsed ? ' is-collapsed' : ''}`} ref={ref} style={style}>
      <div className="scene-stats-bar-header">
        {dragHandle}
        {!collapsed && <ContainerPicker label={`${containerTemplate.name} (${sizeLabel})`} />}

        <div className="scene-stats-bar-header-actions">
          {!collapsed && (
            <>
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
              <button
                type="button"
                className="scene-stats-bar-export-btn"
                disabled={!canExportPdf || isExportingPdf}
                onClick={onExportPdf}
                title="Xuất báo cáo PDF cho phương án xếp hàng hiện tại"
              >
                <span aria-hidden="true">⬇</span> {isExportingPdf ? 'Đang xuất...' : 'Xuất PDF'}
              </button>
            </>
          )}
          <button
            type="button"
            className="scene-stats-bar-collapse-btn"
            onClick={() => setCollapsed((c) => !c)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Mở lại thanh thông tin container' : 'Thu gọn thanh thông tin container'}
            title={collapsed ? 'Mở lại' : 'Thu gọn'}
          >
            {collapsed ? '▸' : '▾'}
          </button>
        </div>
      </div>

      {!collapsed && containerTemplate.notes && <div className="scene-stats-bar-note">{containerTemplate.notes}</div>}

      {!collapsed && cgWarnings.length > 0 && (
        <div className="scene-stats-bar-cg-warning">
          {cgWarnings.map((w) => (
            <div key={w.axis}>
              ⚠ Trọng tâm {CG_AXIS_LABEL[w.axis]} {formatNumber(w.offsetRatio * 100, 0)}% — khuyến nghị phân bổ lại
              hàng hóa
            </div>
          ))}
        </div>
      )}

      {!collapsed && container && container.totalWeight > effectiveMaxPayload && (
        <div className="scene-stats-bar-cg-warning">
          <div>
            ⚠ Trọng lượng đã xếp ({formatNumber(container.totalWeight, 0)} kg) vượt quá tải trọng tối đa vừa chỉnh (
            {formatNumber(effectiveMaxPayload, 0)} kg)
          </div>
        </div>
      )}

      {!collapsed && suggestion && suggestedTemplateName && (
        <div className="scene-stats-bar-suggestion">
          <div className="scene-stats-bar-suggestion-text">
            💡 Container/xe cuối chỉ dùng {formatNumber(suggestion.fillRatioBefore * 100, 0)}% — gợi ý đổi sang{' '}
            <strong>{suggestedTemplateName}</strong> để tiết kiệm chi phí
            {suggestion.estimatedSavings != null && suggestion.estimatedSavings > 0
              ? ` (ước tính tiết kiệm ~${formatNumber(suggestion.estimatedSavings, 0)} đ/chuyến)`
              : ''}
          </div>
          <button type="button" className="scene-stats-bar-suggestion-apply-btn" onClick={onApplySuggestion}>
            Áp dụng
          </button>
        </div>
      )}

      {!collapsed && container && (
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
