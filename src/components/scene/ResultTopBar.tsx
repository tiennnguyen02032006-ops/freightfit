import { useAppStore } from '../../store';
import type { ContainerTemplate } from '../../domain/types';
import { formatMmAsCm } from '../shared/formatUnits';
import { ContainerPicker } from './ContainerPicker';

interface ResultTopBarProps {
  containerTemplate: ContainerTemplate;
  // Nút "Xuất PDF" — chỉ bật khi đã có phương án; isExportingPdf chặn bấm 2 lần chồng nhau. Logic chụp ảnh 3D và dựng
  // PDF nằm ở ContainerScene.tsx/src/export/exportPdf.ts, ở đây chỉ hiện nút và gọi callback.
  canExportPdf: boolean;
  isExportingPdf: boolean;
  onExportPdf: () => void;
  // Nút "Red Team" mở/đóng bảng thử sự cố (RedTeamPanel.tsx) — chỉ bật khi đã có phương án.
  canRedTeam: boolean;
  redTeamOpen: boolean;
  onToggleRedTeam: () => void;
}

/**
 * Thanh trên cùng của khu vực kết quả — chọn container, "Tạo phương án xếp hàng", "Red Team" và "Xuất PDF".
 * Mọi số liệu/cảnh báo/chi tiết khác nằm ở hàng số liệu (ResultMetricsRow) và bảng bên phải (ResultSidePanel).
 */
export function ResultTopBar({ containerTemplate, canExportPdf, isExportingPdf, onExportPdf, canRedTeam, redTeamOpen, onToggleRedTeam }: ResultTopBarProps) {
  const cargoTemplates = useAppStore((s) => s.cargoTemplates);
  const selectedContainerTemplateId = useAppStore((s) => s.selectedContainerTemplateId);
  const generateSolutionForContainer = useAppStore((s) => s.generateSolutionForContainer);

  const sizeLabel = `${formatMmAsCm(containerTemplate.innerLength)} × ${formatMmAsCm(containerTemplate.innerWidth)} × ${formatMmAsCm(containerTemplate.innerHeight)} cm`;

  return (
    <div className="result-topbar">
      <ContainerPicker label={`${containerTemplate.name} (${sizeLabel})`} />
      <div className="result-topbar-actions">
        <button
          type="button"
          className="result-btn result-btn-primary"
          disabled={!selectedContainerTemplateId || cargoTemplates.length === 0}
          onClick={() => selectedContainerTemplateId && generateSolutionForContainer(selectedContainerTemplateId)}
        >
          Tạo phương án xếp hàng
        </button>
        <button
          type="button"
          className={`result-btn${redTeamOpen ? ' is-active' : ''}`}
          disabled={!canRedTeam}
          aria-pressed={redTeamOpen}
          onClick={onToggleRedTeam}
          title="Thử các sự cố (chậm, dỡ chậm, giao sớm) trên chuyến giao — mô phỏng theo luật, số liệu giả định"
        >
          Red Team
        </button>
        <button
          type="button"
          className="result-btn"
          disabled={!canExportPdf || isExportingPdf}
          onClick={onExportPdf}
          title="Xuất báo cáo PDF cho phương án xếp hàng hiện tại"
        >
          {isExportingPdf ? 'Đang xuất...' : 'Xuất PDF'}
        </button>
      </div>
    </div>
  );
}
