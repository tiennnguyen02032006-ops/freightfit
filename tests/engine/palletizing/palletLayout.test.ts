import { describe, expect, it } from 'vitest';
import { generateSolution } from '../../../src/engine/optimization/generateSolutions';
import { expandCargoWithPallets } from '../../../src/engine/palletizing/palletBlock';
import { palletizeTemplate } from '../../../src/engine/palletizing/palletizeCargo';
import { applyPalletLayout, choosePalletOrientation, scorePalletOrientation } from '../../../src/engine/palletizing/palletLayout';
import type { ContainerTemplate, Placement } from '../../../src/domain/types';
import { makeCargoTemplate } from '../../fixtures/cargo';
import { palletCarton } from '../../fixtures/pallet';

const truck: ContainerTemplate = {
  id: 'truck',
  name: 'Truck',
  standardType: 'CUSTOM_TRUCK',
  innerLength: 5800,
  innerWidth: 2200,
  innerHeight: 2300,
  maxPayload: 100_000,
  isCustom: true,
};

describe('chọn hướng pallet', () => {
  it('120x80 trong thùng 5800x2200: cạnh dài theo chiều dài xe cho 8 pallet/xe, hơn hẳn 7 pallet', () => {
    const along = scorePalletOrientation(truck, 'LONG_ALONG_LENGTH', 1200, 800, 8, 1150, 1);
    const across = scorePalletOrientation(truck, 'LONG_ALONG_WIDTH', 1200, 800, 8, 1150, 1);
    expect(along).toMatchObject({ perRow: 2, maxRows: 4, rows: 4, containers: 1 });
    expect(across).toMatchObject({ perRow: 1, maxRows: 7, rows: 8, containers: 2 });
    expect(choosePalletOrientation(truck, 1200, 800, 8, 1150, 1)?.orientation).toBe('LONG_ALONG_LENGTH');
  });

  it('120x100 trong thùng 3000x2400: cạnh dài theo chiều RỘNG (ít hàng hơn, không thừa khe ngang)', () => {
    const floor = { innerLength: 3000, innerWidth: 2400, innerHeight: 2400 };
    const best = choosePalletOrientation(floor, 1200, 1000, 6, 1150, 1)!;
    // dài theo chiều dài: 2 pallet/hàng (dư 400) x 2 hàng = 4; dài theo chiều rộng: 2/hàng (khít 2400) x 3 hàng = 6.
    expect(best.orientation).toBe('LONG_ALONG_WIDTH');
    expect(best).toMatchObject({ alongLength: 1000, alongWidth: 1200, perRow: 2, rows: 3, containers: 1, wasteArea: 0 });
  });

  it('cùng số container/hàng thì chọn hướng ít khoảng trống sàn hơn', () => {
    // Thùng rộng 2500: dài theo chiều dài (b=800): 3/hàng, dư 100; dài theo chiều rộng (b=1200): 2/hàng, dư 100.
    const floor = { innerLength: 6000, innerWidth: 2500, innerHeight: 2400 };
    const a = scorePalletOrientation(floor, 'LONG_ALONG_LENGTH', 1200, 800, 6, 1150, 1);
    const b = scorePalletOrientation(floor, 'LONG_ALONG_WIDTH', 1200, 800, 6, 1150, 1);
    const best = choosePalletOrientation(floor, 1200, 800, 6, 1150, 1)!;
    expect([a.rows, b.rows]).toEqual([2, 3]);
    expect(best.orientation).toBe('LONG_ALONG_LENGTH'); // 2 hàng < 3 hàng
  });

  it('pallet vuông chỉ có 1 hướng; pallet không vừa container -> null', () => {
    expect(choosePalletOrientation(truck, 1100, 1100, 4, 1150, 1)).toMatchObject({ alongLength: 1100, alongWidth: 1100 });
    expect(choosePalletOrientation({ innerLength: 1000, innerWidth: 700, innerHeight: 2000 }, 1200, 800, 1, 1150, 1)).toBeNull();
  });
});

describe('applyPalletLayout', () => {
  it('khoá mọi pallet cùng kích thước đáy về đúng 1 hướng, thùng rời giữ nguyên', () => {
    const { items } = expandCargoWithPallets([palletCarton({ quantity: 70 }), makeCargoTemplate({ id: 'other', quantity: 2 })]);
    const locked = applyPalletLayout(items, truck);

    const pallets = locked.filter((i) => i.palletLoad);
    expect(pallets).toHaveLength(2);
    for (const p of pallets) expect(p.template.allowedOrientations).toEqual([[1200, 800, p.template.height]]);
    // thùng rời + hàng thường: nguyên vẹn (cùng đối tượng)
    for (const loose of locked.filter((i) => !i.palletLoad)) {
      expect(loose).toBe(items.find((i) => i.cargoInstanceId === loose.cargoInstanceId));
    }
  });

  it('không hướng nào vừa container -> giữ nguyên để bước xếp báo không xếp vừa', () => {
    const { items } = expandCargoWithPallets([palletCarton({ quantity: 32 })]);
    const tiny: ContainerTemplate = { ...truck, innerLength: 1000, innerWidth: 700 };
    expect(applyPalletLayout(items, tiny)).toEqual(items);
  });
});

/** Các pallet nằm sàn (z = 0) của 1 container, gom theo hàng (cùng x), sắp từ sát vách trước (x lớn) vào cửa. */
function floorRows(placements: Placement[]): Placement[][] {
  const floor = placements.filter((p) => p.palletLoad && p.z === 0);
  const xs = Array.from(new Set(floor.map((p) => p.x))).sort((a, b) => b - a);
  return xs.map((x) => floor.filter((p) => p.x === x).sort((a, b) => a.y - b.y));
}

describe('bố cục pallet vuông vức trong container', () => {
  function expectSquareLayout(container: { placements: Placement[] }, template: ContainerTemplate, perRow: number) {
    const rows = floorRows(container.placements);
    const all = rows.flat();
    expect(all.length).toBeGreaterThan(0);

    // tất cả pallet cùng hướng (cùng kích thước đáy)
    const { length, width } = all[0];
    for (const p of all) {
      expect([p.length, p.width]).toEqual([length, width]);
    }

    // hàng đầu sát vách trước; các hàng liền nhau, không khe: x mỗi hàng cách đúng 1 chiều dài pallet
    expect(rows[0][0].x + length).toBeCloseTo(template.innerLength);
    rows.forEach((row, i) => {
      if (i > 0) expect(rows[i - 1][0].x - row[0].x).toBeCloseTo(length);
      // trong hàng: sát vách trái (y = 0), các pallet liền nhau không khe
      expect(row[0].y).toBeCloseTo(0);
      row.forEach((p, j) => {
        if (j > 0) expect(p.y - (row[j - 1].y + width)).toBeCloseTo(0);
      });
      // lấp đầy từng hàng trước: chỉ hàng cuối mới được thiếu pallet
      if (i < rows.length - 1) expect(row).toHaveLength(perRow);
      else expect(row.length).toBeLessThanOrEqual(perRow);
    });

    // các pallet cùng cột thẳng hàng: mọi hàng dùng cùng tập toạ độ y
    const ys = new Set(rows[0].map((p) => p.y));
    for (const row of rows) for (const p of row) expect(ys.has(p.y)).toBe(true);
  }

  it('7 pallet 120x80 trong xe 5800x2200: 3 hàng đủ 2 pallet + hàng cuối 1 pallet, sát nhau', () => {
    const solution = generateSolution([palletCarton({ quantity: 32 * 7 })], truck);
    expect(solution.containers).toHaveLength(1);
    expect(solution.containers[0].placements).toHaveLength(7);
    expectSquareLayout(solution.containers[0], truck, 2);
    expect(floorRows(solution.containers[0].placements).map((r) => r.length)).toEqual([2, 2, 2, 1]);
  });

  it('nhiều container: hàng nào của container nào cũng thẳng và sát nhau', () => {
    const solution = generateSolution([palletCarton({ quantity: 32 * 20 })], truck); // 20 pallet, 8/xe
    expect(solution.containers).toHaveLength(3);
    for (const c of solution.containers) expectSquareLayout(c, truck, 2);
  });

  it('120x100 trong xe 3000x2400: ưu tiên hai cột sát hai vách, khe giữa 40cm (hướng cạnh dài theo chiều dài xe)', () => {
    const params = { palletType: '120x100' as const, maxHeight: 1150, maxWeight: 10_000 };
    const perPallet = palletizeTemplate(palletCarton({ quantity: 1000, palletize: params }))!.pallets[0].boxCount;
    const t = palletCarton({ quantity: perPallet * 4, palletize: params }); // đúng 4 pallet đầy
    const small: ContainerTemplate = { ...truck, id: 'small', innerLength: 3000, innerWidth: 2400, innerHeight: 1200 };
    const solution = generateSolution([t], small);
    const rows = floorRows(solution.containers[0].placements);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toHaveLength(2);
      expect(row[0]).toMatchObject({ length: 1200, width: 1000, y: 0 }); // sát vách trái
      expect(row[1].y + row[1].width).toBeCloseTo(2400); // sát vách phải
      expect(row[1].y - (row[0].y + row[0].width)).toBeCloseTo(400); // khe giữa
    }
    expect(solution.layoutWarnings).toEqual([]);
  });

  it('chồng 2 tầng (10 pallet, sàn chứa 8): sàn lấp đầy trước, pallet tầng trên nằm đúng trên pallet tầng sàn', () => {
    const solution = generateSolution([palletCarton({ quantity: 32 * 10 }, 2)], { ...truck, innerHeight: 2400 });
    const placements = solution.containers[0].placements;
    const lower = placements.filter((p) => p.z === 0);
    const upper = placements.filter((p) => p.z > 0);
    expect(upper.length).toBeGreaterThan(0);
    for (const p of upper) expect(lower.some((l) => l.x === p.x && l.y === p.y && l.length === p.length && l.width === p.width)).toBe(true);
    expectSquareLayout({ placements: lower }, truck, 2);
  });

  it('thùng rời lấp phần sàn còn lại ở cuối, sau khi đã xếp hết pallet', () => {
    // 7 pallet + 6 thùng rời (< 1 lớp): thùng rời vào chỗ trống ở hàng cuối.
    const solution = generateSolution([palletCarton({ quantity: 32 * 7 + 6 })], truck);
    const placements = solution.containers[0].placements;
    const lastPalletIndex = Math.max(...placements.map((p, i) => (p.palletLoad ? i : -1)));
    const firstLooseIndex = placements.findIndex((p) => p.palletLeftover);
    expect(firstLooseIndex).toBeGreaterThan(lastPalletIndex);
    expectSquareLayout({ placements }, truck, 2);

    const loose = placements.filter((p) => p.palletLeftover);
    expect(loose).toHaveLength(6);
    // thùng rời nằm ngoài vùng các pallet (không chồng) và đặt trên sàn trong phần còn trống
    const pallets = placements.filter((p) => p.palletLoad);
    for (const box of loose.filter((b) => b.z === 0)) {
      for (const p of pallets) {
        const overlap = box.x < p.x + p.length && p.x < box.x + box.length && box.y < p.y + p.width && p.y < box.y + box.width;
        expect(overlap).toBe(false);
      }
    }
  });
});
