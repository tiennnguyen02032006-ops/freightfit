import { describe, expect, it } from 'vitest';
import { isOrientationAllowed } from '../../../src/engine/constraints/rotation';

describe('isOrientationAllowed', () => {
  const allowed: Array<[number, number, number]> = [
    [400, 300, 200],
    [300, 400, 200],
  ];

  it('hợp lệ: orientation nằm trong danh sách allowedOrientations', () => {
    expect(isOrientationAllowed([300, 400, 200], allowed)).toBe(true);
  });

  it('vi phạm: orientation không nằm trong danh sách allowedOrientations', () => {
    expect(isOrientationAllowed([200, 400, 300], allowed)).toBe(false);
  });
});
