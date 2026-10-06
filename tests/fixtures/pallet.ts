import type { CargoTemplate } from '../../src/domain/types';
import { PALLET_BASE_HEIGHT_MM } from '../../src/engine/preprocessing/palletTypes';
import { makeCargoTemplate } from './cargo';

/**
 * Thùng carton 400x300x250 (10kg) bật "Xếp lên pallet" 120x80, cao tối đa 115cm gồm đế:
 * 4 lớp x 8 thùng = 32 thùng/pallet (320kg).
 */
export function palletCarton(overrides: Partial<CargoTemplate> = {}, maxTiers = 1): CargoTemplate {
  return makeCargoTemplate({
    id: 'carton',
    sku: 'CARTON',
    length: 400,
    width: 300,
    height: 250,
    weight: 10,
    quantity: 70,
    rotation: 'NONE',
    allowedOrientations: [[400, 300, 250]],
    palletize: { palletType: '120x80', maxHeight: PALLET_BASE_HEIGHT_MM + 1000, maxWeight: 10_000, maxTiers },
    ...overrides,
  });
}
