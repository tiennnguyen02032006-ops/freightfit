import { describe, expect, it } from 'vitest';
import {
  centerOfGravityOK,
  computeSupportRatio,
  meetsMinSupportRatio,
} from '../../../src/engine/constraints/support';
import { makePlacement } from '../../fixtures/placement';

describe('computeSupportRatio', () => {
  it('đặt trên sàn container (z=0) luôn trả về supportRatio = 1.0', () => {
    const candidate = { x: 0, y: 0, z: 0, length: 400, width: 300 };
    expect(computeSupportRatio(candidate, [])).toBe(1.0);
  });

  it('hợp lệ: được đỡ đầy đủ bên dưới thì supportRatio đạt ngưỡng tối thiểu', () => {
    const below = makePlacement({ x: 0, y: 0, z: 0, length: 400, width: 300, height: 200 });
    const candidate = { x: 0, y: 0, z: 200, length: 400, width: 300 };
    const ratio = computeSupportRatio(candidate, [below]);
    expect(ratio).toBe(1);
    expect(meetsMinSupportRatio(ratio, 0.75)).toBe(true);
  });

  it('vi phạm: chỉ được đỡ một phần nhỏ, supportRatio dưới ngưỡng tối thiểu', () => {
    const below = makePlacement({ x: 0, y: 0, z: 0, length: 100, width: 100, height: 200 });
    const candidate = { x: 0, y: 0, z: 200, length: 400, width: 300 };
    const ratio = computeSupportRatio(candidate, [below]);
    expect(meetsMinSupportRatio(ratio, 0.75)).toBe(false);
  });
});

describe('centerOfGravityOK', () => {
  it('đặt trên sàn (z=0) luôn hợp lệ, bỏ qua CG check', () => {
    expect(centerOfGravityOK({ centerX: 9999, centerY: 9999, z: 0 }, [])).toBe(true);
  });

  it('hợp lệ: tâm khối nằm trong bounding box của các placement đỡ bên dưới', () => {
    const below = makePlacement({ x: 0, y: 0, z: 0, length: 400, width: 300, height: 200 });
    expect(centerOfGravityOK({ centerX: 200, centerY: 150, z: 200 }, [below])).toBe(true);
  });

  it('vi phạm: tâm khối nằm ngoài bounding box của các placement đỡ bên dưới', () => {
    const below = makePlacement({ x: 0, y: 0, z: 0, length: 100, width: 100, height: 200 });
    expect(centerOfGravityOK({ centerX: 500, centerY: 500, z: 200 }, [below])).toBe(false);
  });
});
