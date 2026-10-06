import { describe, expect, it } from 'vitest';
import { PALLET_TYPES, getPalletType } from '../../../src/engine/preprocessing/palletTypes';

describe('palletTypes', () => {
  it('có đủ 4 loại pallet chuẩn', () => {
    expect(PALLET_TYPES.map((p) => [p.length, p.width])).toEqual([
      [1200, 800],
      [1200, 1000],
      [1100, 1100],
      [1219, 1016],
    ]);
  });

  it('getPalletType tra theo id', () => {
    expect(getPalletType('110x110').length).toBe(1100);
  });
});
