import type { Placement } from '../../domain/types';

/**
 * Logic thuần cho chế độ "Xem từng bước" (loading simulation) — tách riêng khỏi
 * ContainerScene.tsx để test được độc lập, không cần dựng cả React component/Canvas.
 *
 * Load order = thứ tự CÓ SẴN trong `placements` (packContainer.ts push đúng thứ tự thuật toán
 * xếp hàng quyết định, xem docs/algorithm-design.md) — KHÔNG tính lại gì cả. Bước 0 = container
 * trống; bước N = đã hiện N kiện ĐẦU TIÊN theo thứ tự đó, các kiện còn lại ẨN HẲN (không mờ).
 */
export function getVisiblePlacements(placements: Placement[], stepIndex: number): Placement[] {
  return placements.slice(0, Math.max(0, stepIndex));
}

/** Kẹp stepIndex trong khoảng [0, total] — phòng trường hợp solution đổi (ít kiện hơn) hoặc
 * scrub/next/prev đi quá biên. */
export function clampStepIndex(index: number, total: number): number {
  return Math.max(0, Math.min(total, index));
}
