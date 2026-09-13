import { describe, expect, it } from 'vitest';
import { clampStepIndex, getVisiblePlacements } from '../../../src/components/scene/stepSimulation';
import { makePlacement } from '../../fixtures/placement';

// Load order giả định = thứ tự trong mảng (đúng như packContainer.ts push placements) — 3 kiện
// theo thứ tự p1 (xếp đầu tiên) -> p2 -> p3 (xếp cuối cùng).
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
