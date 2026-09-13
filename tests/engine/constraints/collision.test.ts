import { describe, expect, it } from 'vitest';
import { overlaps, hasCollision } from '../../../src/engine/constraints/collision';
import { makePlacement } from '../../fixtures/placement';

describe('overlaps', () => {
  it('hợp lệ: hai box tách biệt hoàn toàn theo trục X không overlap', () => {
    const a = { x: 0, y: 0, z: 0, length: 100, width: 100, height: 100 };
    const b = { x: 100, y: 0, z: 0, length: 100, width: 100, height: 100 };
    expect(overlaps(a, b)).toBe(false);
  });

  it('vi phạm: hai box chồng lấn cả 3 trục thì overlap', () => {
    const a = { x: 0, y: 0, z: 0, length: 100, width: 100, height: 100 };
    const b = { x: 50, y: 50, z: 50, length: 100, width: 100, height: 100 };
    expect(overlaps(a, b)).toBe(true);
  });
});

describe('hasCollision', () => {
  it('hợp lệ: candidate không chạm bất kỳ placement nào', () => {
    const candidate = { x: 500, y: 0, z: 0, length: 100, width: 100, height: 100 };
    expect(hasCollision(candidate, [makePlacement()])).toBe(false);
  });

  it('vi phạm: candidate chồng lấn 1 placement đã tồn tại', () => {
    const candidate = { x: 100, y: 100, z: 0, length: 400, width: 300, height: 200 };
    expect(hasCollision(candidate, [makePlacement()])).toBe(true);
  });
});
