import { describe, expect, it } from 'vitest';
import { generateSolution } from '../../../src/engine/optimization/generateSolutions';
import { partialPalletsOf, palletBoxPlacements } from '../../../src/engine/palletizing/palletBoxes';
import { expandCargoWithPallets } from '../../../src/engine/palletizing/palletBlock';
import { sortCargo } from '../../../src/engine/preprocessing/sortCargo';
import { buildContainerReportHtml, buildContainerSummary } from '../../../src/export/exportPdf';
import type { ContainerTemplate, Placement } from '../../../src/domain/types';
import { palletCarton } from '../../fixtures/pallet';

// Xe 5800x2200: 120x80 không chừa được khe giữa -> bố cục hàng sát nhau, 2 pallet/hàng, 4 hàng (8 pallet/xe).
const truck: ContainerTemplate = {
  id: 'truck',
  name: 'Truck',
  standardType: 'CUSTOM_TRUCK',
  innerLength: 5800,
  innerWidth: 2200,
  innerHeight: 2300,
  maxPayload: 1_000_000,
  isCustom: true,
};

// 5 pallet đầy (32 thùng, 4 lớp x 8) + 1 pallet lẻ: 8 + 4 = 12 thùng (lớp trên cùng thiếu 4/8).
const QUANTITY = 32 * 5 + 12;

describe('pallet lẻ cuối cùng trong container', () => {
  const solution = generateSolution([palletCarton({ quantity: QUANTITY })], truck);
  const placements = solution.containers[0].placements;
  const pallets = placements.filter((p) => p.palletLoad);
  const partials = partialPalletsOf(placements);

  it('chỉ có đúng một pallet lẻ, 12 thùng, các pallet khác đầy', () => {
    expect(solution.containers).toHaveLength(1);
    expect(pallets).toHaveLength(6);
    expect(partials).toHaveLength(1);
    expect(partials[0].palletLoad?.boxCount).toBe(12);
    expect(pallets.filter((p) => !p.palletLoad?.isPartial).every((p) => p.palletLoad?.boxCount === 32)).toBe(true);
    expect(solution.unfitCargo).toEqual([]);
  });

  it('pallet lẻ xếp CUỐI cùng, ở hàng cuối sát cửa, cùng hướng và thẳng hàng với các pallet khác', () => {
    const partial = partials[0];
    expect(placements.indexOf(partial)).toBe(placements.length - 1); // xếp sau cùng

    const full = pallets.filter((p) => p !== partial);
    // cùng hướng: cùng kích thước đáy
    for (const p of full) expect([p.length, p.width]).toEqual([partial.length, partial.width]);

    // hàng cuối = x nhỏ nhất (x = 0 là cửa): pallet lẻ nằm ở hàng sát cửa nhất, không có pallet nào gần cửa hơn
    expect(partial.z).toBe(0);
    expect(Math.min(...pallets.map((p) => p.x))).toBe(partial.x);

    // thẳng hàng: x thuộc lưới hàng của các pallet khác (cách đúng 1 chiều dài pallet), y trùng 1 cột của lưới
    const rowXs = new Set(full.map((p) => p.x));
    expect(rowXs.has(partial.x) || Array.from(rowXs).some((x) => Math.abs(x - partial.x - partial.length) < 1e-6)).toBe(true);
    expect(Array.from(full).some((p) => p.y === partial.y)).toBe(true);
    // sát nhau: các hàng liền nhau không khe (hàng cuối cách hàng kề trước đúng 1 chiều dài pallet)
    const rows = Array.from(new Set(pallets.map((p) => p.x))).sort((a, b) => a - b);
    expect(rows[0]).toBe(partial.x);
    if (rows.length > 1) expect(rows[1] - rows[0]).toBeCloseTo(partial.length);
  });

  it('lớp trên cùng của pallet lẻ là một khối chữ nhật liền ở góc pallet, lớp dưới đầy', () => {
    const partial = partials[0];
    const boxes = palletBoxPlacements(partial);
    const layerBoxes = partial.palletLoad!.layers[0].boxes.length;
    expect(partial.palletLoad!.layers.map((l) => l.boxes.length)).toEqual([layerBoxes, 4]);

    const zs = Array.from(new Set(boxes.map((b) => Math.round(b.z)))).sort((a, b) => a - b);
    const top = boxes.filter((b) => Math.round(b.z) === zs[zs.length - 1]);
    expect(top).toHaveLength(4);

    const minX = Math.min(...top.map((b) => b.x));
    const maxX = Math.max(...top.map((b) => b.x + b.length));
    const minY = Math.min(...top.map((b) => b.y));
    const maxY = Math.max(...top.map((b) => b.y + b.width));
    // phủ kín hộp bao -> hình chữ nhật liền, không bậc thang
    expect(top.reduce((s, b) => s + b.length * b.width, 0)).toBeCloseTo((maxX - minX) * (maxY - minY));
    // sát 1 góc của pallet
    const atXCorner = Math.abs(minX - partial.x) < 1e-6 || Math.abs(maxX - (partial.x + partial.length)) < 1e-6;
    const atYCorner = Math.abs(minY - partial.y) < 1e-6 || Math.abs(maxY - (partial.y + partial.width)) < 1e-6;
    expect(atXCorner && atYCorner).toBe(true);
  });

  it('thống kê và PDF ghi "Pallet lẻ" kèm số thùng của pallet', () => {
    expect(solution.stats.partialPalletCount).toBe(1);
    expect(solution.stats.partialPalletBoxCount).toBe(12);

    const summary = buildContainerSummary(truck, solution.containers[0]);
    expect(summary.partialPalletBoxCounts).toEqual([12]);
    const html = buildContainerReportHtml({ summary, lineItems: [], containerIndex: 0, containerTotal: 1 });
    expect(html).toContain('Pallet lẻ');
    expect(html).toContain('12 thùng');
  });

  it('đủ pallet đầy (không dư) thì không có pallet lẻ', () => {
    const exact = generateSolution([palletCarton({ quantity: 32 * 4 })], truck);
    expect(partialPalletsOf(exact.containers[0].placements)).toEqual([]);
    expect(exact.stats.partialPalletCount).toBe(0);
  });
});

describe('thứ tự xếp: pallet lẻ luôn sau các pallet đầy cùng loại hàng', () => {
  it('sortCargo đặt pallet lẻ cuối cùng dù thể tích bằng nhau', () => {
    // 36 thùng = 1 pallet đầy 32 + 4 thùng (< 1 lớp) -> thùng rời; dùng 40 để có pallet 5 lớp lẻ cùng chiều cao pallet đầy
    const { items } = expandCargoWithPallets([palletCarton({ quantity: 32 + 8 + 4 })]); // 32 + 12 (2 lớp)
    const sorted = sortCargo([...items].reverse());
    const palletItems = sorted.filter((i) => i.palletLoad);
    expect(palletItems.map((i) => i.palletLoad!.isPartial)).toEqual([false, true]);
  });
});

// Giữ kiểu Placement được dùng ở trên để test dễ đọc
export type { Placement };
