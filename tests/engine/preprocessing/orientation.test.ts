import { describe, expect, it } from 'vitest';
import { computeAllowedOrientations } from '../../../src/engine/preprocessing/orientation';

describe('computeAllowedOrientations', () => {
  it('NONE trả về đúng 1 orientation gốc', () => {
    const result = computeAllowedOrientations(400, 300, 200, 'NONE');
    expect(result).toEqual([[400, 300, 200]]);
  });

  it('YAW trả về 2 orientation, giữ nguyên height', () => {
    const result = computeAllowedOrientations(400, 300, 200, 'YAW');
    expect(result).toEqual([
      [400, 300, 200],
      [300, 400, 200],
    ]);
  });

  it('FULL không upright trả về 6 hoán vị', () => {
    const result = computeAllowedOrientations(400, 300, 200, 'FULL');
    expect(result).toHaveLength(6);
  });

  it('FULL + mustKeepUpright thu hẹp về 2 orientation như YAW', () => {
    const result = computeAllowedOrientations(400, 300, 200, 'FULL', true);
    expect(result).toEqual([
      [400, 300, 200],
      [300, 400, 200],
    ]);
  });

  it('box vuông (l=w=h) khử trùng lặp orientation FULL về 1 phần tử', () => {
    const result = computeAllowedOrientations(300, 300, 300, 'FULL');
    expect(result).toEqual([[300, 300, 300]]);
  });
});
