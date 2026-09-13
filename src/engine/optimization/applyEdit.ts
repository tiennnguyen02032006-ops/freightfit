import type { ContainerTemplate, PackingSolution, Placement } from '../../domain/types';
import { computeCenterOfGravity, computeCgOffsets, computeCgWarnings } from './centerOfGravity';
import { computeSolutionStats } from './stats';

/**
 * Sau khi chỉnh tay (move/rotate/swap — xem editSlice.ts) làm đổi `placements` của MỘT container,
 * hàm này build lại toàn bộ số liệu phái sinh phụ thuộc vị trí kiện hàng: trọng tâm, % lệch
 * ngang/dọc, cảnh báo lệch trọng tâm, và thống kê chung (volumeFillPercent/payloadUsagePercent).
 * Trọng lượng/thể tích tổng cũng được tính lại (dù move/rotate/swap không đổi giá trị của chúng)
 * để không có nơi nào phải tự tính lại — đúng nguyên tắc 1 nguồn tính duy nhất.
 *
 * Tách riêng khỏi generateSolutions.ts (dùng cho lần xếp ĐẦU TIÊN) vì ở đây không xếp lại từ đầu,
 * chỉ cập nhật lại số liệu phái sinh từ 1 danh sách placements đã có sẵn (do editSlice.ts build).
 */
export function applyPlacementsToSolution(
  solution: PackingSolution,
  containerInstanceId: string,
  updatedPlacements: Placement[],
  containerTemplate: ContainerTemplate,
  containerTemplatesById: Map<string, ContainerTemplate>,
): PackingSolution {
  const centerOfGravity = computeCenterOfGravity(updatedPlacements);
  const { offsetXRatio, offsetZRatio } = computeCgOffsets(centerOfGravity, containerTemplate);
  const totalWeight = updatedPlacements.reduce((sum, p) => sum + p.weight, 0);
  const usedVolume = updatedPlacements.reduce((sum, p) => sum + p.length * p.width * p.height, 0);

  const containers = solution.containers.map((c) =>
    c.id === containerInstanceId
      ? {
          ...c,
          placements: updatedPlacements,
          centerOfGravity,
          cgOffsetXRatio: offsetXRatio,
          cgOffsetZRatio: offsetZRatio,
          totalWeight,
          usedVolume,
        }
      : c,
  );

  // Chỉ container vừa chỉnh cần tính lại cgWarnings — cảnh báo của các container khác (P3
  // multi-container, chưa dùng ở Phase 1) giữ nguyên vì vị trí hàng trong đó không đổi.
  const otherWarnings = solution.cgWarnings.filter((w) => w.containerInstanceId !== containerInstanceId);
  const newWarnings = computeCgWarnings(containerInstanceId, { offsetXRatio, offsetZRatio });
  const cgWarnings = [...otherWarnings, ...newWarnings];

  const stats = computeSolutionStats(containers, containerTemplatesById);

  return { ...solution, containers, cgWarnings, stats };
}
