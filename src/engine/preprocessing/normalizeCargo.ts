import type { CargoTemplate } from '../../domain/types';

export interface ExpandedCargoItem {
  cargoInstanceId: string;
  cargoTemplateId: string;
  template: CargoTemplate;
}

/**
 * Expand CargoTemplate theo quantity thành từng instance riêng (cargoInstanceId),
 * chuẩn bị cho packing (mỗi instance được đặt độc lập vào 1 vị trí cụ thể).
 */
export function expandCargoQuantity(templates: CargoTemplate[]): ExpandedCargoItem[] {
  const result: ExpandedCargoItem[] = [];
  for (const template of templates) {
    for (let i = 0; i < template.quantity; i++) {
      result.push({
        cargoInstanceId: `${template.id}__${i}`,
        cargoTemplateId: template.id,
        template,
      });
    }
  }
  return result;
}
