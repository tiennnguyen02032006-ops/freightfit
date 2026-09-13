import { describe, expect, it } from 'vitest';
import { computeSolutionStats } from '../../../src/engine/optimization/stats';
import { smallTestContainer } from '../../fixtures/containers';
import type { ContainerInstance } from '../../../src/domain/types';

function makeContainerInstance(overrides: Partial<ContainerInstance> = {}): ContainerInstance {
  return {
    id: 'container-1',
    templateId: smallTestContainer.id,
    index: 0,
    placements: [],
    extremePoints: [],
    totalWeight: 0,
    usedVolume: 0,
    centerOfGravity: { x: 0, y: 0, z: 0 },
    cgOffsetXRatio: 0,
    cgOffsetZRatio: 0,
    ...overrides,
  };
}

describe('computeSolutionStats', () => {
  const templatesById = new Map([[smallTestContainer.id, smallTestContainer]]);

  it('tính đúng volumeFillPercent và payloadUsagePercent', () => {
    const container = makeContainerInstance({ usedVolume: 200_000_000, totalWeight: 100 });
    const stats = computeSolutionStats([container], templatesById);

    const expectedVolumePercent = (200_000_000 / (2000 * 1000 * 1000)) * 100;
    const expectedPayloadPercent = (100 / smallTestContainer.maxPayload) * 100;

    expect(stats.volumeFillPercent).toBeCloseTo(expectedVolumePercent);
    expect(stats.payloadUsagePercent).toBeCloseTo(expectedPayloadPercent);
    expect(stats.containerCount).toBe(1);
  });

  it('container rỗng (chưa pack gì) trả về 0% thay vì NaN/lỗi', () => {
    const container = makeContainerInstance();
    const stats = computeSolutionStats([container], templatesById);
    expect(stats.volumeFillPercent).toBe(0);
    expect(stats.payloadUsagePercent).toBe(0);
  });
});
