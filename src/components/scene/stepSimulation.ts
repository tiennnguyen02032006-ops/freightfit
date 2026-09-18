import type { Placement } from '../../domain/types';

/**
 * Logic thuần cho chế độ "Xem từng bước" (loading simulation) — tách riêng khỏi
 * ContainerScene.tsx để test được độc lập, không cần dựng cả React component/Canvas.
 *
 * Thứ tự chất hàng được TÍNH LẠI theo VỊ TRÍ THẬT của từng kiện (xem getLoadOrderPlacements) để
 * mô phỏng đúng cách chất hàng thực tế — chất từ trong cùng ra ngoài (cửa container đóng lại sau
 * cùng) — KHÔNG còn phụ thuộc thứ tự xử lý nội bộ của thuật toán xếp hàng (packContainer.ts). Bước
 * 0 = container trống; bước N = đã hiện N kiện ĐẦU TIÊN theo thứ tự chất hàng đó, các kiện còn lại
 * ẨN HẲN (không mờ).
 */

/**
 * Sắp xếp placements theo thứ tự chất hàng thực tế (trả về mảng MỚI, không đổi mảng gốc):
 * 1. x GIẢM DẦN — Placement.x là "x thật" tính từ CỬA container (xem packContainer.ts), x càng lớn
 *    càng XA cửa (sâu bên trong) -> chất trước; kiện gần cửa (x nhỏ) chất sau cùng.
 * 2. z TĂNG DẦN — cùng 1 vị trí theo chiều sâu thì chất từ tầng thấp lên trước (không thể đặt kiện
 *    ở tầng trên khi tầng dưới cùng vị trí đó chưa có gì để đỡ).
 * 3. y TĂNG DẦN — chỉ để có thứ tự ổn định, không quan trọng bằng 2 tiêu chí trên.
 */
export function getLoadOrderPlacements(placements: Placement[]): Placement[] {
  return [...placements].sort((a, b) => {
    if (a.x !== b.x) return b.x - a.x;
    if (a.z !== b.z) return a.z - b.z;
    return a.y - b.y;
  });
}

export function getVisiblePlacements(placements: Placement[], stepIndex: number): Placement[] {
  const loadOrder = getLoadOrderPlacements(placements);
  return loadOrder.slice(0, Math.max(0, stepIndex));
}

/** Kẹp stepIndex trong khoảng [0, total] — phòng trường hợp solution đổi (ít kiện hơn) hoặc
 * scrub/next/prev đi quá biên. */
export function clampStepIndex(index: number, total: number): number {
  return Math.max(0, Math.min(total, index));
}
