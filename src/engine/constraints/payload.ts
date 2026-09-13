import type { CargoTemplate, Placement } from '../../domain/types';

export function respectsContainerPayload(
  currentTotalWeight: number,
  itemWeight: number,
  maxPayload: number,
): boolean {
  return currentTotalWeight + itemWeight <= maxPayload;
}

/**
 * Kiểm tra item mới đặt lên trên không vượt quá maxLoadOnTop của từng item bên dưới nó.
 * belowTemplates/itemWeight: item bên dưới và trọng lượng item định đặt lên trên.
 */
export function respectsLoadOnTop(
  belowPlacements: Placement[],
  belowTemplates: Map<string, CargoTemplate>,
  itemWeight: number,
): boolean {
  return belowPlacements.every((p) => {
    const template = belowTemplates.get(p.cargoTemplateId);
    if (!template || template.maxLoadOnTop === undefined) return true;
    return itemWeight <= template.maxLoadOnTop;
  });
}
