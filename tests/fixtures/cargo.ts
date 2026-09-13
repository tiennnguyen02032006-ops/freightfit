import type { CargoTemplate, Clearance } from '../../src/domain/types';

export const zeroClearance: Clearance = {
  left: 0,
  right: 0,
  front: 0,
  back: 0,
  top: 0,
  bottom: 0,
};

export function makeCargoTemplate(overrides: Partial<CargoTemplate> = {}): CargoTemplate {
  return {
    id: 'test-cargo',
    sku: 'SKU-TEST',
    name: 'Test Cargo',
    shapeType: 'BOX',
    length: 400,
    width: 300,
    height: 200,
    weight: 10,
    quantity: 1,
    rotation: 'NONE',
    allowedOrientations: [[400, 300, 200]],
    color: '#4da6ff',
    stackable: true,
    fragile: false,
    mustKeepUpright: false,
    clearance: zeroClearance,
    ...overrides,
  };
}
