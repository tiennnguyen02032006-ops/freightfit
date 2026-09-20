import { useAppStore } from '../../store';

/**
 * Dòng tổng kết ở đầu trang, vd "Cần dùng 3 container 20ft Standard, tổng tỷ lệ lấp đầy trung bình
 * 82%" — chỉ hiện khi đã có solution (đã bấm "Tạo phương án xếp hàng" ít nhất 1 lần).
 *
 * Số container = `solution.containers.length` (đã tự tính khi hàng hóa vượt quá 1 container, xem
 * generateSolutions.ts). Tên container KHÔNG còn giả định cả solution đồng nhất 1 loại: tính theo
 * TỪNG loại template thật sự đang dùng trong `solution.containers` (kèm số lượng mỗi loại) — sau
 * khi áp dụng gợi ý đổi xe cho container cuối (applyContainerSuggestion, solutionSlice.ts), container
 * cuối có thể thuộc loại khác các container còn lại. Chỉ 1 loại -> hiện như cũ ("3 container 20ft
 * Standard"); từ 2 loại trở lên -> liệt kê từng loại kèm số lượng ("2 20ft Standard + 1 Xe tải...").
 *
 * Tỷ lệ lấp đầy lấy thẳng `stats.volumeFillPercent`: tỷ lệ THEO THỂ TÍCH TỔNG (tổng usedVolume /
 * tổng innerVolume của TẤT CẢ container, có trọng số theo dung tích thật của từng container — xem
 * computeSolutionStats) — KHÔNG phải trung bình cộng đơn giản % của từng container, nên khi có nhiều
 * loại container dung tích khác nhau có thể lệch nhẹ so với cách tính nhẩm trung bình cộng thủ công.
 */
export function SolutionSummaryBar() {
  const solution = useAppStore((s) => s.solution);
  const containerLibrary = useAppStore((s) => s.containerLibrary);

  if (!solution || solution.containers.length === 0) return null;

  const templateCounts = new Map<string, number>();
  for (const c of solution.containers) {
    templateCounts.set(c.templateId, (templateCounts.get(c.templateId) ?? 0) + 1);
  }
  const templateGroups = Array.from(templateCounts.entries()).map(([templateId, count]) => ({
    templateId,
    name: containerLibrary.find((t) => t.id === templateId)?.name ?? 'container',
    count,
  }));

  const containerCount = solution.containers.length;
  const fillPercent = Math.round(solution.stats.volumeFillPercent);

  return (
    <div className="solution-summary-bar">
      {templateGroups.length === 1 ? (
        <>
          Cần dùng <strong>{containerCount}</strong> container <strong>{templateGroups[0].name}</strong>
        </>
      ) : (
        <>
          Cần dùng <strong>{containerCount}</strong> container:{' '}
          {templateGroups.map((g, i) => (
            <span key={g.templateId}>
              {i > 0 ? ' + ' : ''}
              <strong>
                {g.count} {g.name}
              </strong>
            </span>
          ))}
        </>
      )}
      , tổng tỷ lệ lấp đầy trung bình <strong>{fillPercent}%</strong>
      {solution.unfitCargo.length > 0 && (
        <span className="solution-summary-bar-warning">
          {' '}
          · ⚠ {solution.unfitCargo.length} kiện hàng không xếp vừa
        </span>
      )}
    </div>
  );
}
