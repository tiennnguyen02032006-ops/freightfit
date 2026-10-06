import type { CargoTemplate, Clearance, ToleranceSettings } from '../domain/types';
import { NO_TOLERANCE } from './config';

// Dung sai xếp hàng — TÁI DÙNG trường `clearance` sẵn có của CargoTemplate (xem constraints/clearance.ts và
// packContainer.ts: kích thước dùng để kiểm tra va chạm/vừa chỗ = kích thước thật + clearance, còn vị trí
// đặt thật nằm lệch vào trong ô đúng bằng clearance nên 3D vẫn vẽ kích thước thật), không có cơ chế mới.

/** Dung sai mỗi chiều (mm) áp dụng cho 1 loại hàng; 0 nếu tắt dung sai. */
export function effectiveTolerance(template: Pick<CargoTemplate, 'tolerance'>, settings: ToleranceSettings = NO_TOLERANCE): number {
  if (!settings.enabled) return 0;
  const value = template.tolerance ?? settings.defaultDimensionTolerance;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** Khe (mm) giữa 2 pallet liền kề và giữa pallet với vách container; 0 nếu tắt dung sai. */
export function palletGapOf(settings: ToleranceSettings = NO_TOLERANCE): number {
  return settings.enabled && settings.palletGap > 0 ? settings.palletGap : 0;
}

/**
 * Khoảng chừa mỗi bên vách container (mm): nửa khe pallet–vách cộng với nửa khe nằm trong clearance của chính
 * pallet cho đủ `palletGap` từ mép pallet tới vách.
 */
export function wallMarginOf(settings: ToleranceSettings = NO_TOLERANCE): number {
  return palletGapOf(settings) / 2;
}

function addClearance(c: Clearance, half: number): Clearance {
  return {
    left: c.left + half,
    right: c.right + half,
    front: c.front + half,
    back: c.back + half,
    top: c.top + half,
    bottom: c.bottom + half,
  };
}

/**
 * Cộng dung sai vào clearance của template: mỗi chiều dài/rộng/cao to thêm đúng `tolerance` (mỗi phía
 * tolerance / 2). Trả về CHÍNH template nếu dung sai bằng 0 (không tạo bản sao mới).
 */
export function applyToleranceClearance<T extends CargoTemplate>(template: T, settings: ToleranceSettings = NO_TOLERANCE): T {
  const t = effectiveTolerance(template, settings);
  if (t <= 0) return template;
  return { ...template, clearance: addClearance(template.clearance, t / 2) };
}

const fmtCm = (mm: number) => String(Math.round(mm) / 10).replace('.', ',');

/** Ghi chú "đã tính dung sai X cm" cho phương án xếp (hiển thị ở tổng kết và bản xuất PDF). */
export function describeTolerance(templates: CargoTemplate[], settings: ToleranceSettings = NO_TOLERANCE): string[] {
  if (!settings.enabled) return [];
  const notes: string[] = [];
  if (palletGapOf(settings) > 0) {
    notes.push(`Đã tính dung sai: khe giữa các pallet và giữa pallet với vách container ${fmtCm(palletGapOf(settings))} cm`);
  }
  for (const t of templates) {
    const tol = effectiveTolerance(t, settings);
    if (tol > 0) notes.push(`${t.sku}: đã tính dung sai ${fmtCm(tol)} cm mỗi chiều`);
  }
  return notes;
}

/** Nhãn ngắn "đã tính dung sai X cm" hoặc null nếu không có dung sai. */
export function toleranceLabel(toleranceMm: number | undefined): string | null {
  return toleranceMm && toleranceMm > 0 ? `đã tính dung sai ${fmtCm(toleranceMm)} cm` : null;
}
