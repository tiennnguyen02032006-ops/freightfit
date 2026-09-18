import { describe, expect, it } from 'vitest';
import {
  clampStepIndex,
  getLoadOrderPlacements,
  getVisiblePlacements,
} from '../../../src/components/scene/stepSimulation';
import { makePlacement } from '../../fixtures/placement';

describe('getLoadOrderPlacements', () => {
  it('x GIẢM DẦN: kiện xa cửa (x lớn, sâu bên trong) chất trước, gần cửa (x nhỏ) chất sau cùng', () => {
    const input = [
      makePlacement({ id: 'near-door', x: 0 }),
      makePlacement({ id: 'deep', x: 4000 }),
      makePlacement({ id: 'middle', x: 2000 }),
    ];
    expect(getLoadOrderPlacements(input).map((p) => p.id)).toEqual(['deep', 'middle', 'near-door']);
  });

  it('cùng x: z TĂNG DẦN (tầng thấp trước), rồi y TĂNG DẦN', () => {
    const input = [
      makePlacement({ id: 'top', x: 1000, z: 500, y: 0 }),
      makePlacement({ id: 'bottom-right', x: 1000, z: 0, y: 600 }),
      makePlacement({ id: 'bottom-left', x: 1000, z: 0, y: 0 }),
    ];
    expect(getLoadOrderPlacements(input).map((p) => p.id)).toEqual(['bottom-left', 'bottom-right', 'top']);
  });

  it('không đổi mảng gốc', () => {
    const input = [makePlacement({ id: 'a', x: 0 }), makePlacement({ id: 'b', x: 100 })];
    getLoadOrderPlacements(input);
    expect(input.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('getVisiblePlacements hiện đúng N kiện đầu theo thứ tự chất hàng (sâu trước)', () => {
    const input = [makePlacement({ id: 'near', x: 0 }), makePlacement({ id: 'deep', x: 3000 })];
    expect(getVisiblePlacements(input, 1).map((p) => p.id)).toEqual(['deep']);
  });
});

// Các kiện dưới đây cùng x/y/z mặc định (fixture) -> sort ổn định giữ nguyên thứ tự mảng, dùng để
// kiểm tra logic cắt N kiện đầu độc lập với tiêu chí sắp xếp.
const placements = [
  makePlacement({ id: 'p1' }),
  makePlacement({ id: 'p2' }),
  makePlacement({ id: 'p3' }),
];

describe('getVisiblePlacements', () => {
  it('bước 0 -> container trống hoàn toàn, không hiện kiện nào', () => {
    expect(getVisiblePlacements(placements, 0)).toEqual([]);
  });

  it('bước N -> hiện đúng N kiện ĐẦU TIÊN theo load order, không nhiều/ít hơn', () => {
    expect(getVisiblePlacements(placements, 1).map((p) => p.id)).toEqual(['p1']);
    expect(getVisiblePlacements(placements, 2).map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('bước = tổng số kiện -> hiện đủ tất cả, không thiếu kiện nào', () => {
    expect(getVisiblePlacements(placements, 3).map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
  });

  it('container rỗng (chưa có phương án) -> luôn trả về mảng rỗng bất kể stepIndex', () => {
    expect(getVisiblePlacements([], 0)).toEqual([]);
    expect(getVisiblePlacements([], 5)).toEqual([]);
  });
});

describe('clampStepIndex', () => {
  it('trong khoảng hợp lệ -> giữ nguyên', () => {
    expect(clampStepIndex(2, 5)).toBe(2);
  });

  it('âm -> kẹp về 0', () => {
    expect(clampStepIndex(-3, 5)).toBe(0);
  });

  it('vượt quá tổng số kiện -> kẹp về đúng tổng số kiện (không tràn quá số kiện thực có)', () => {
    expect(clampStepIndex(99, 5)).toBe(5);
  });
});
