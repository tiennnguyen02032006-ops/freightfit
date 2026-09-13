import { describe, expect, it } from 'vitest';
import { applyClearance } from '../../../src/engine/constraints/clearance';
import { zeroClearance } from '../../fixtures/cargo';

describe('applyClearance', () => {
  it('hợp lệ: clearance=0 trả về đúng kích thước gốc', () => {
    const result = applyClearance({ length: 400, width: 300, height: 200 }, zeroClearance);
    expect(result).toEqual({ length: 400, width: 300, height: 200 });
  });

  it('clearance>0 cộng thêm đúng vào từng trục tương ứng', () => {
    const result = applyClearance(
      { length: 400, width: 300, height: 200 },
      { left: 10, right: 5, front: 20, back: 0, top: 15, bottom: 5 },
    );
    expect(result).toEqual({ length: 415, width: 320, height: 220 });
  });
});
