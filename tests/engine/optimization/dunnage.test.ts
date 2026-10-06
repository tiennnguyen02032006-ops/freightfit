import { describe, expect, it } from 'vitest';
import { computeDunnageGaps, splitIntoBags, summarizeDunnage } from '../../../src/engine/optimization/dunnage';
import { DUNNAGE_CONFIG, type AirbagSize } from '../../../src/engine/config';
import type { ContainerTemplate } from '../../../src/domain/types';
import { makePlacement } from '../../fixtures/placement';

const container: ContainerTemplate = {
  id: 'c',
  name: 'c',
  standardType: 'CUSTOM_TRUCK',
  innerLength: 6000,
  innerWidth: 2400,
  innerHeight: 2400,
  maxPayload: 100_000,
  isCustom: true,
};

// khối 1000 (dài) x 1200 (rộng) x 1200 (cao), x tuỳ ý — mặc định sát vách trái (y = 0)
function block(id: string, x: number, overrides: Record<string, number> = {}) {
  return makePlacement({ id, x, y: 0, z: 0, length: 1000, width: 1200, height: 1200, ...overrides });
}

describe('computeDunnageGaps', () => {
  it('khe 100mm giữa 2 hàng -> 1 khe túi khí, mặt khe 1200x1200 chia thành 2 túi', () => {
    const gaps = computeDunnageGaps([block('a', 500), block('b', 1600)], container);
    const gap = gaps.find((g) => g.axis === 'LENGTH' && !g.wall);
    expect(gap).toMatchObject({ source: 'GENERIC', gapSize: 100, x: 1500, y: 0, z: 0, width: 1200, height: 1200 });
    expect(gap?.bagCount).toBe(2); // ceil(1200/900) x ceil(1200/1200)
    expect(gap?.bags).toHaveLength(2);
  });

  it('khe lớn hơn khoảng túi khí cho phép (500mm > 40cm) không được chèn — không còn khối gỗ', () => {
    const gaps = computeDunnageGaps([block('a', 500), block('b', 2000)], container).filter((g) => g.axis === 'LENGTH' && !g.wall);
    expect(gaps).toEqual([]);
  });

  it('khoảng cho phép cấu hình được: thêm cỡ XL chèn khe 35–60cm thì khe 500mm chèn được bằng túi khí', () => {
    const cfg = { ...DUNNAGE_CONFIG, bagSizes: [...DUNNAGE_CONFIG.bagSizes, { name: 'XL', width: 1250, height: 1200, minGap: 350, maxGap: 600 }] };
    const gap = computeDunnageGaps([block('a', 500), block('b', 2000)], container, cfg).find((g) => g.axis === 'LENGTH' && !g.wall);
    expect(gap).toMatchObject({ gapSize: 500 });
    expect(gap?.bagCount).toBeGreaterThan(0);
  });

  it('khe quá nhỏ (<5cm) và khoảng trống quá lớn (>40cm) không phải khe cần chèn', () => {
    const tiny = computeDunnageGaps([block('a', 500), block('b', 1540)], container).filter((g) => !g.wall && g.axis === 'LENGTH');
    expect(tiny).toEqual([]);
    const huge = computeDunnageGaps([block('a', 500), block('b', 2500)], container).filter((g) => !g.wall && g.axis === 'LENGTH');
    expect(huge).toEqual([]);
  });

  it('khe giữa hàng và cửa/vách container được nhận diện (wall = true)', () => {
    // cách cửa (x = 0) 250mm
    const gaps = computeDunnageGaps([block('a', 250)], container);
    expect(gaps.find((g) => g.axis === 'LENGTH' && g.wall)).toMatchObject({ source: 'GENERIC', gapSize: 250, x: 0 });
    // cách vách bên (y = 0) 100mm
    const side = computeDunnageGaps([makePlacement({ id: 's', x: 0, y: 100, z: 0, length: 1000, width: 1200, height: 1200 })], container);
    expect(side.find((g) => g.axis === 'WIDTH' && g.wall && g.y === 0)).toMatchObject({ source: 'GENERIC', gapSize: 100 });
  });

  it('khe bị kiện khác chen vào thì không tính; chỉ các khe trống thật', () => {
    const middle = block('m', 1600, { width: 600 }); // chen giữa, chiếm 1 phần mặt khe
    const gaps = computeDunnageGaps([block('a', 500), middle, block('b', 2700)], container).filter((g) => g.axis === 'LENGTH' && !g.wall);
    // khe a-b rộng 1100 (> woodMax) không xét; còn khe a-m và m-b, mỗi khe 100mm
    expect(gaps.every((g) => g.gapSize === 100)).toBe(true);
    for (const g of gaps) expect(g.width).toBe(600);
  });

  it('các khe liền kề cùng mặt phẳng được gộp thành 1 khe', () => {
    // 2 pallet cạnh nhau theo chiều rộng, mỗi dãy cách nhau 100mm -> 1 khe rộng 2400
    const placements = [
      block('a1', 500),
      block('a2', 500, { y: 1200 }),
      block('b1', 1600),
      block('b2', 1600, { y: 1200 }),
    ];
    const gaps = computeDunnageGaps(placements, container).filter((g) => g.axis === 'LENGTH' && !g.wall);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ y: 0, width: 2400, gapSize: 100 });
    expect(gaps[0].bagCount).toBe(4); // cỡ S 1250x800: ceil(2400/1250)=2 ngang x ceil(1200/800)=2 cao
  });

  it('mặt khe quá hẹp (<100mm) bị bỏ qua', () => {
    const a = block('a', 500);
    const b = block('b', 1600, { y: 1150, width: 1200 }); // chồng nhau chỉ 50mm theo chiều rộng
    expect(computeDunnageGaps([a, b], container).filter((g) => g.axis === 'LENGTH' && !g.wall)).toEqual([]);
  });

  it('không có hàng nào -> không có khe; số khe luôn bị chặn ở maxGaps và tính nhanh với hàng nghìn kiện', () => {
    expect(computeDunnageGaps([], container)).toEqual([]);

    // lưới 40 x 50 = 2000 thùng 100x100x100 cách nhau 30mm
    const many = [];
    for (let i = 0; i < 40; i++) {
      for (let j = 0; j < 50; j++) {
        many.push(makePlacement({ id: `p${i}-${j}`, x: i * 130, y: j * 130, z: 0, length: 100, width: 100, height: 100 }));
      }
    }
    const started = performance.now();
    const gaps = computeDunnageGaps(many, { ...container, innerLength: 6000, innerWidth: 6600 });
    expect(performance.now() - started).toBeLessThan(10_000);
    expect(gaps.length).toBeLessThanOrEqual(DUNNAGE_CONFIG.maxGaps);
  });
});

const standardSize: AirbagSize = { name: 'T', width: 900, height: 1200, minGap: 50, maxGap: 400 };

describe('splitIntoBags / summarizeDunnage', () => {
  it('các túi liền nhau, lấp kín mặt khe, mỗi túi không lớn hơn cỡ túi tiêu chuẩn', () => {
    const gap = { axis: 'LENGTH' as const, gapSize: 150, x: 1000, y: 0, z: 0, length: 150, width: 2000, height: 2400 };
    const bags = splitIntoBags(gap, standardSize);
    expect(bags).toHaveLength(3 * 2); // ceil(2000/900)=3, ceil(2400/1200)=2
    const area = bags.reduce((s, b) => s + b.width * b.height, 0);
    expect(area).toBeCloseTo(2000 * 2400);
    for (const b of bags) {
      expect(b.length).toBe(150);
      expect(b.width).toBeLessThanOrEqual(900 + 1e-6);
      expect(b.height).toBeLessThanOrEqual(1200 + 1e-6);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.y + b.width).toBeLessThanOrEqual(2000 + 1e-6);
    }
  });

  it('khe dọc theo chiều rộng: túi chia theo chiều dài', () => {
    const bags = splitIntoBags({ axis: 'WIDTH', gapSize: 100, x: 0, y: 1200, z: 0, length: 1800, width: 100, height: 1000 }, standardSize);
    expect(bags).toHaveLength(2); // ceil(1800/900) x 1
    expect(bags.every((b) => b.width === 100)).toBe(true);
  });

  it('summarizeDunnage cộng số túi khí của mọi khe', () => {
    const gaps = computeDunnageGaps([block('a', 500), block('b', 1600), block('c', 2600), block('d', 3300)], container);
    expect(gaps.length).toBeGreaterThan(0);
    expect(summarizeDunnage(gaps).airbags).toBe(gaps.reduce((s, g) => s + g.bagCount, 0));
  });
});
