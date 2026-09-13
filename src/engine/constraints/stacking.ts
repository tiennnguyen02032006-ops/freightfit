import type { CargoTemplate, Placement } from '../../domain/types';

/**
 * Mỗi item support bên dưới phải stackable=true, KHÔNG được đánh dấu fragile (hàng dễ vỡ
 * không được đặt bất kỳ thứ gì đè lên trên, bất kể cờ stackable của chính nó), và stackLevel
 * của item mới không được vượt quá maxStackLevel của item bên dưới.
 */
export function respectsStacking(
  belowPlacements: Placement[],
  belowTemplates: Map<string, CargoTemplate>,
  newStackLevel: number,
): boolean {
  return belowPlacements.every((p) => {
    const template = belowTemplates.get(p.cargoTemplateId);
    if (!template) return false;
    if (template.fragile) return false;
    if (!template.stackable) return false;
    if (template.maxStackLevel !== undefined && newStackLevel > template.maxStackLevel) {
      return false;
    }
    return true;
  });
}
