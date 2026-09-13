import { useAppStore } from '../../store';

/**
 * Dòng tổng kết ở đầu trang, vd "Cần dùng 3 container 20ft Standard, tổng tỷ lệ lấp đầy trung bình
 * 82%" — chỉ hiện khi đã có solution (đã bấm "Tạo phương án xếp hàng" ít nhất 1 lần).
 *
 * Số container = `solution.containers.length` (đã tự tính khi hàng hóa vượt quá 1 container, xem
 * generateSolutions.ts). Tỷ lệ lấp đầy trung bình lấy thẳng `stats.volumeFillPercent`
 * (computeSolutionStats gộp thể tích đã dùng / tổng thể tích TẤT CẢ container — vì mọi container
 * trong 1 solution luôn cùng 1 loại/kích thước nên đây cũng chính là trung bình cộng tỷ lệ lấp đầy
 * từng container).
 */
export function SolutionSummaryBar() {
  const solution = useAppStore((s) => s.solution);
  const containerLibrary = useAppStore((s) => s.containerLibrary);

  if (!solution || solution.containers.length === 0) return null;

  const containerTemplate = containerLibrary.find((t) => t.id === solution.containers[0].templateId);
  const containerName = containerTemplate?.name ?? 'container';
  const containerCount = solution.containers.length;
  const fillPercent = Math.round(solution.stats.volumeFillPercent);

  return (
    <div className="solution-summary-bar">
      Cần dùng <strong>{containerCount}</strong> container <strong>{containerName}</strong>, tổng tỷ lệ lấp đầy trung
      bình <strong>{fillPercent}%</strong>
      {solution.unfitCargo.length > 0 && (
        <span className="solution-summary-bar-warning">
          {' '}
          · ⚠ {solution.unfitCargo.length} kiện hàng không xếp vừa
        </span>
      )}
    </div>
  );
}
