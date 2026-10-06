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
}

/**
 * Thanh trên cùng của khu vực kết quả — CHỈ có 3 thứ: chọn container, "Tạo phương án xếp hàng" và "Xuất PDF".
 * Mọi số liệu/cảnh báo/chi tiết khác nằm ở hàng số liệu (ResultMetricsRow) và bảng bên phải (ResultSidePanel).
 */
export function ResultTopBar({ containerTemplate, canExportPdf, isExportingPdf, onExportPdf }: ResultTopBarProps) {
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
