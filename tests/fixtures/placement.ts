import type { Placement } from '../../src/domain/types';

export function makePlacement(overrides: Partial<Placement> = {}): Placement {
  return {
    id: 'p1',
    cargoInstanceId: 'c1',
    cargoTemplateId: 'test-cargo',
    containerInstanceId: 'container-1',
    x: 0,
    y: 0,
    z: 0,
    length: 400,
    width: 300,
    height: 200,
    orientationIndex: 0,
    weight: 10,
    centerX: 200,
    centerY: 150,
    centerZ: 100,
    supportRatio: 1,
    supportedByPlacementIds: [],
    stackLevel: 0,
    ...overrides,
  };
}
