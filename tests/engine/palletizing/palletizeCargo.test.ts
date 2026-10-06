import { describe, expect, it } from 'vitest';
import { arrangeLayer, palletizeAll, palletizeTemplate } from '../../../src/engine/palletizing/palletizeCargo';
import { PALLET_BASE_HEIGHT_MM } from '../../../src/engine/preprocessing/palletTypes';
import type { CargoTemplate, PalletBoxRect, PalletizeParams } from '../../../src/domain/types';
import { makeCargoTemplate } from '../../fixtures/cargo';

function carton(overrides: Partial<CargoTemplate>, palletize: PalletizeParams): CargoTemplate {
  return makeCargoTemplate({
    id: 'carton',
    sku: 'CARTON',
    length: 400,
    width: 300,
    height: 250,
    weight: 10,
    quantity: 70,
    rotation: 'NONE',
    allowedOrientations: [[400, 300, 250]],
    palletize,
    ...overrides,
  });
}

function overlaps(a: PalletBoxRect, b: PalletBoxRect): boolean {
  return a.x < b.x + b.length - 1e-6 && b.x < a.x + a.length - 1e-6 && a.y < b.y + b.width - 1e-6 && b.y < a.y + a.width - 1e-6;
}

describe('arrangeLayer', () => {
  it('chọn hướng đặt nhiều thùng nhất trên mặt pallet 120x80', () => {
    // 400x300: lưới thuần 3x2=6, xoay 300x400: 4x2=8 -> phải đạt tối thiểu 8.
    const rects = arrangeLayer(1200, 800, 400, 300);
    expect(rects.length).toBeGreaterThanOrEqual(8);
  });

  it('mọi thùng nằm trong mặt pallet và không chồng nhau', () => {
    const rects = arrangeLayer(1219, 1016, 350, 270);
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.length).toBeLessThanOrEqual(1219 + 1e-6);
      expect(r.y + r.width).toBeLessThanOrEqual(1016 + 1e-6);
    }
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) expect(overlaps(rects[i], rects[j])).toBe(false);
    }
  });

  it('thùng lớn hơn mặt pallet -> không đặt được thùng nào', () => {
    expect(arrangeLayer(1200, 800, 1300, 900)).toEqual([]);
  });
});

describe('palletizeTemplate', () => {
  it('không bật palletize -> null', () => {
    expect(palletizeTemplate(makeCargoTemplate())).toBeNull();
  });

  it('xếp theo lớp: pallet đầy 4 lớp x 8 thùng, chạm đúng chiều cao tối đa', () => {
    const params = { palletType: '120x80' as const, maxHeight: PALLET_BASE_HEIGHT_MM + 1000, maxWeight: 10_000 };
    const result = palletizeTemplate(carton({ quantity: 64 }, params));
    expect(result?.pallets.map((p) => p.boxCount)).toEqual([32, 32]);
    expect(result?.pallets[0].layers).toHaveLength(4);
    expect(result?.pallets[0].totalHeight).toBe(PALLET_BASE_HEIGHT_MM + 1000);
    expect(result?.pallets.every((p) => !p.isPartial)).toBe(true);
    expect(result?.unpalletizedBoxCount).toBe(0);
  });

  it('xếp đầy pallet trước, phần dư dồn vào pallet CUỐI', () => {
    // 80 thùng, 32 thùng/pallet (4 lớp x 8): 32 + 32 + 16.
    const params = { palletType: '120x80' as const, maxHeight: PALLET_BASE_HEIGHT_MM + 1000, maxWeight: 10_000 };
    const result = palletizeTemplate(carton({ quantity: 80 }, params))!;
    expect(result.pallets.map((p) => p.boxCount)).toEqual([32, 32, 16]);
    expect(result.pallets.map((p) => p.isPartial)).toEqual([false, false, true]);
    for (const p of result.pallets.slice(0, 2)) expect(p.layers.map((l) => l.boxes.length)).toEqual([8, 8, 8, 8]);
    expect(result.pallets[2].layers.map((l) => l.boxes.length)).toEqual([8, 8]);
    expect(result.looseBoxCount).toBe(0);
    expect(result.unpalletizedBoxCount).toBe(0);
    // Tổng thùng trên mọi pallet bằng đúng số lượng đầu vào.
    expect(result.pallets.reduce((sum, p) => sum + p.boxCount, 0)).toBe(80);
  });

  it('chạm giới hạn khối lượng: pallet dừng ở số LỚP ĐẦY, không đặt nửa lớp lên trên', () => {
    // maxWeight 150kg = 15 thùng: 1 lớp đầy (8) + 7 thùng thừa trên pallet sẽ thành nửa lớp -> không đặt, pallet chỉ 8 thùng.
    const result = palletizeTemplate(
      carton({ quantity: 38 }, { palletType: '120x80', maxHeight: PALLET_BASE_HEIGHT_MM + 1000, maxWeight: 150 }),
    )!;
    expect(result.pallets.map((p) => p.boxCount)).toEqual([8, 8, 8, 8]);
    expect(result.pallets.every((p) => p.layers.length === 1)).toBe(true);
    expect(result.looseBoxCount).toBe(6); // 38 - 32 = 6 < 1 lớp
    for (const p of result.pallets) expect(p.totalWeight).toBeLessThanOrEqual(150);
  });

  it('chạm giới hạn chiều cao: pallet không thể thêm lớp nào nữa rồi mới sang pallet kế', () => {
    // Hàng cao tối đa 600mm = 2 lớp x 250 (còn dư 100 < 250): 16 thùng/pallet.
    const result = palletizeTemplate(
      carton({ quantity: 50 }, { palletType: '120x80', maxHeight: PALLET_BASE_HEIGHT_MM + 600, maxWeight: 10_000 }),
    )!;
    expect(result.pallets.map((p) => p.boxCount)).toEqual([16, 16, 16]);
    expect(result.looseBoxCount).toBe(2); // 50 - 48 = 2 < 1 lớp (8) -> xếp rời
  });

  it('chỉ pallet cuối mới có lớp trên cùng chưa đầy: mọi pallet khác chỉ gồm các lớp đầy, tổng thùng chia hết cho số thùng 1 lớp', () => {
    const cartons: Array<[number, number, number]> = [
      [400, 300, 250],
      [500, 400, 300],
      [350, 250, 200],
      [600, 400, 400],
    ];
    const palletTypes = ['120x80', '120x100', '110x110', '121.9x101.6'] as const;
    let checked = 0;
    let withPartialTop = 0;

    for (const [l, w, h] of cartons) {
      const orientations: Array<[number, number, number]> = [[l, w, h], [l, h, w], [w, l, h], [w, h, l], [h, l, w], [h, w, l]];
      for (const palletType of palletTypes) {
        for (const maxHeight of [900, 1150, 1500]) {
          for (const maxWeight of [100, 150, 400, 10_000]) {
            for (const quantity of [37, 100, 250]) {
              const template = carton(
                { length: l, width: w, height: h, quantity, weight: 10, rotation: 'FULL', allowedOrientations: orientations },
                { palletType, maxHeight, maxWeight },
              );
              const result = palletizeTemplate(template)!;
              const list = result.pallets;

              // Bảo toàn số thùng: thùng trên pallet + thùng rời + thùng không lên pallet được = số lượng đầu vào.
              const onPallets = list.reduce((sum, p) => sum + p.boxCount, 0);
              expect(onPallets + result.looseBoxCount + result.unpalletizedBoxCount).toBe(quantity);
              if (list.length === 0) continue;

              const maxBoxes = Math.floor(maxWeight / 10);
              const layerBoxes = list[0].layers[0].boxes.length; // số thùng của 1 lớp đầy
              checked++;

              for (const [index, p] of list.entries()) {
                const isLast = index === list.length - 1;
                // mọi lớp phía dưới lớp trên cùng đều đầy đúng bằng số thùng 1 lớp
                for (const layer of p.layers.slice(0, -1)) expect(layer.boxes.length).toBe(layerBoxes);
                const top = p.layers[p.layers.length - 1];
                expect(top.boxes.length).toBeLessThanOrEqual(layerBoxes);

                if (!isLast) {
                  // pallet không phải cuối: toàn lớp đầy -> tổng thùng chia hết cho số thùng 1 lớp
                  expect(top.boxes.length).toBe(layerBoxes);
                  expect(p.boxCount % layerBoxes).toBe(0);
                  // và đã bão hòa: chạm khối lượng tối đa hoặc không còn lớp nào vừa chiều cao còn lại
                  const heightLeft = maxHeight - p.totalHeight;
                  expect(p.boxCount + layerBoxes > maxBoxes || heightLeft < top.orientation[2] - 1e-6).toBe(true);
                  expect(p.boxCount).toBe(list[0].boxCount); // mọi pallet trừ cuối đầy hết cỡ như nhau
                } else if (top.boxes.length < layerBoxes) {
                  withPartialTop++;
                }
              }
              // pallet cuối chứa ít nhất 1 lớp đầy (phần dư < 1 lớp đã thành thùng rời) và không nhiều hơn pallet đầy
              expect(list[list.length - 1].boxCount).toBeGreaterThanOrEqual(layerBoxes);
              expect(list[list.length - 1].boxCount).toBeLessThanOrEqual(list[0].boxCount);
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(200);
    expect(withPartialTop).toBeGreaterThan(0); // có ca pallet cuối thật sự thiếu lớp trên cùng
  });

  it('pallet cuối được phép có lớp trên cùng chưa đầy; phần dư ít hơn 1 lớp thì thành thùng rời, không đặt lên pallet', () => {
    const params = { palletType: '120x80' as const, maxHeight: PALLET_BASE_HEIGHT_MM + 1000, maxWeight: 10_000 };
    // 32 thùng/pallet (4 lớp x 8). 76 = 32 + 32 + 12: pallet cuối 8 + 4 (lớp trên cùng thiếu).
    const partialTop = palletizeTemplate(carton({ quantity: 76 }, params))!;
    expect(partialTop.pallets.map((p) => p.boxCount)).toEqual([32, 32, 12]);
    expect(partialTop.pallets[2].layers.map((l) => l.boxes.length)).toEqual([8, 4]);
    expect(partialTop.looseBoxCount).toBe(0);
    for (const p of partialTop.pallets.slice(0, 2)) expect(p.boxCount % 8).toBe(0);

    // 67 = 32 + 32 + 3: 3 < 1 lớp -> thùng rời, 2 pallet đầy.
    const loose = palletizeTemplate(carton({ quantity: 67 }, params))!;
    expect(loose.pallets.map((p) => p.boxCount)).toEqual([32, 32]);
    expect(loose.looseBoxCount).toBe(3);
  });

  it('pallet lẻ: lớp dưới đầy, lớp trên cùng là MỘT KHỐI CHỮ NHẬT liền ở góc pallet (không bậc thang); chỉ có đúng 1 pallet lẻ', () => {
    const cartons: Array<[number, number, number]> = [
      [400, 300, 250],
      [500, 400, 300],
      [350, 250, 200],
      [600, 400, 400],
    ];
    const palletDims = { '120x80': [1200, 800], '120x100': [1200, 1000], '110x110': [1100, 1100], '121.9x101.6': [1219, 1016] } as const;
    let checkedTop = 0;

    for (const [l, w, h] of cartons) {
      for (const palletType of ['120x80', '120x100', '110x110', '121.9x101.6'] as const) {
        for (const quantity of [37, 100, 131, 250]) {
          const template = carton(
            { length: l, width: w, height: h, quantity, weight: 10, rotation: 'FULL', allowedOrientations: [[l, w, h], [l, h, w], [w, l, h], [w, h, l], [h, l, w], [h, w, l]] },
            { palletType, maxHeight: 1500, maxWeight: 10_000 },
          );
          const result = palletizeTemplate(template)!;
          const partials = result.pallets.filter((p) => p.isPartial);
          expect(partials.length).toBeLessThanOrEqual(1); // chỉ có đúng 1 pallet lẻ (nếu có)
          if (partials.length === 1) expect(result.pallets[result.pallets.length - 1].isPartial).toBe(true); // và nằm ở cuối

          const [palletL, palletW] = palletDims[palletType];
          for (const p of result.pallets) {
            const layerBoxes = p.layers[0].boxes.length;
            const top = p.layers[p.layers.length - 1];
            if (top.boxes.length >= layerBoxes) continue;
            expect(p.isPartial).toBe(true); // chỉ pallet lẻ mới có lớp trên cùng chưa đầy
            checkedTop++;

            for (const layer of p.layers.slice(0, -1)) expect(layer.boxes.length).toBe(layerBoxes); // lớp dưới đầy

            // khối chữ nhật liền: cùng kích thước, lưới đầy đủ cột x hàng, phủ kín hộp bao, sát 1 góc pallet
            const boxes = top.boxes;
            const [bl, bw] = [boxes[0].length, boxes[0].width];
            for (const b of boxes) expect([b.length, b.width]).toEqual([bl, bw]);
            const xs = Array.from(new Set(boxes.map((b) => b.x))).sort((a, b) => a - b);
            const ys = Array.from(new Set(boxes.map((b) => b.y))).sort((a, b) => a - b);
            expect(xs.length * ys.length).toBe(boxes.length); // không bậc thang: mọi ô của lưới đều có thùng
            xs.forEach((x, i) => expect(x).toBeCloseTo(i * bl));
            ys.forEach((y, j) => expect(y).toBeCloseTo(j * bw));
            expect(xs[0]).toBe(0);
            expect(ys[0]).toBe(0); // sát góc (x = 0, y = 0) của pallet
            const bboxArea = (xs.length * bl) * (ys.length * bw);
            expect(boxes.reduce((s, b) => s + b.length * b.width, 0)).toBeCloseTo(bboxArea);
            expect(xs.length * bl).toBeLessThanOrEqual(palletL + 1e-6);
            expect(ys.length * bw).toBeLessThanOrEqual(palletW + 1e-6);
            for (let i = 0; i < boxes.length; i++) {
              for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i], boxes[j])).toBe(false);
            }
          }
          // bảo toàn số thùng (thùng không vào khối chữ nhật được thành thùng rời)
          const onPallets = result.pallets.reduce((s, p) => s + p.boxCount, 0);
          expect(onPallets + result.looseBoxCount + result.unpalletizedBoxCount).toBe(quantity);
        }
      }
    }
    expect(checkedTop).toBeGreaterThan(10); // có nhiều ca pallet lẻ thật sự thiếu lớp trên cùng
  });

  it('thùng không xếp thành hình chữ nhật được ở lớp trên cùng thì thành thùng rời, vẫn bảo toàn số lượng', () => {
    const params = { palletType: '120x80' as const, maxHeight: PALLET_BASE_HEIGHT_MM + 1000, maxWeight: 10_000 };
    // 79 = 32 + 32 + 15: pallet cuối 8 + 7; 7 thùng chỉ xếp được khối chữ nhật 3 x 2 = 6 -> 1 thùng rời.
    const result = palletizeTemplate(carton({ quantity: 79 }, params))!;
    expect(result.pallets.map((p) => p.boxCount)).toEqual([32, 32, 14]);
    expect(result.pallets[2].layers.map((l) => l.boxes.length)).toEqual([8, 6]);
    expect(result.looseBoxCount).toBe(1);
    expect(result.pallets.reduce((s, p) => s + p.boxCount, 0) + result.looseBoxCount).toBe(79);
  });

  it('thùng thừa không đủ 1 lớp pallet được xếp RỜI thay vì tạo pallet gần trống', () => {
    const params = { palletType: '120x80' as const, maxHeight: PALLET_BASE_HEIGHT_MM + 1000, maxWeight: 10_000 };
    // 70 = 32 + 32 + 6; 6 < 8 thùng/lớp -> 2 pallet đầy + 6 thùng rời.
    const result = palletizeTemplate(carton({ quantity: 70 }, params))!;
    expect(result.pallets.map((p) => p.boxCount)).toEqual([32, 32]);
    expect(result.looseBoxCount).toBe(6);
    expect(result.unpalletizedBoxCount).toBe(0);

    // Ít hơn 1 lớp ngay từ đầu -> không có pallet nào, toàn bộ là thùng rời.
    const tiny = palletizeTemplate(carton({ quantity: 5 }, params))!;
    expect(tiny.pallets).toEqual([]);
    expect(tiny.looseBoxCount).toBe(5);

    // Đúng 1 lớp đầy (8 thùng) -> vẫn tạo pallet.
    const oneLayer = palletizeTemplate(carton({ quantity: 8 }, params))!;
    expect(oneLayer.pallets.map((p) => p.boxCount)).toEqual([8]);
    expect(oneLayer.looseBoxCount).toBe(0);
  });

  it('khối lượng tối đa giới hạn số thùng mỗi pallet', () => {
    const result = palletizeTemplate(
      carton({ quantity: 40 }, { palletType: '120x80', maxHeight: PALLET_BASE_HEIGHT_MM + 1000, maxWeight: 150 }),
    );
    expect(result?.pallets.map((p) => p.boxCount)).toEqual([8, 8, 8, 8, 8]);
    for (const p of result?.pallets ?? []) expect(p.totalWeight).toBeLessThanOrEqual(150);
  });

  it('mỗi lớp thử các hướng đặt và chọn hướng nhiều thùng nhất', () => {
    // Thùng 1100x200x700 đặt đứng (cao 700) -> 4 thùng/lớp; nằm (cao 200) chỉ 1 thùng/lớp.
    const t = carton(
      { length: 1100, width: 700, height: 200, quantity: 10, allowedOrientations: [[1100, 700, 200], [1100, 200, 700]] },
      { palletType: '120x80', maxHeight: PALLET_BASE_HEIGHT_MM + 700, maxWeight: 10_000 },
    );
    const result = palletizeTemplate(t);
    expect(result?.pallets[0].layers[0].orientation).toEqual([1100, 200, 700]);
    expect(result?.pallets.map((p) => p.boxCount)).toEqual([4, 4]);
  });

  it('mọi pallet: không vượt chiều cao/khối lượng tối đa, các thùng trong lớp không chồng nhau', () => {
    const t = carton(
      { quantity: 123, rotation: 'FULL', allowedOrientations: [[400, 300, 250], [400, 250, 300], [300, 250, 400]] },
      { palletType: '121.9x101.6', maxHeight: 1500, maxWeight: 400 },
    );
    const params = t.palletize!;
    const result = palletizeTemplate(t)!;
    expect(result.pallets.reduce((s, p) => s + p.boxCount, 0) + result.unpalletizedBoxCount + result.looseBoxCount).toBe(123);
    for (const p of result.pallets) {
      expect(p.totalHeight).toBeLessThanOrEqual(params.maxHeight + 1e-6);
      expect(p.totalWeight).toBeLessThanOrEqual(params.maxWeight + 1e-6);
      for (const layer of p.layers) {
        for (let i = 0; i < layer.boxes.length; i++) {
          for (let j = i + 1; j < layer.boxes.length; j++) expect(overlaps(layer.boxes[i], layer.boxes[j])).toBe(false);
        }
      }
    }
  });

  it('thùng cao hơn chiều cao tối đa -> không xếp được, có lý do', () => {
    const result = palletizeTemplate(
      carton({ height: 1200, allowedOrientations: [[400, 300, 1200]] }, { palletType: '120x80', maxHeight: 1000, maxWeight: 1000 }),
    );
    expect(result?.pallets).toEqual([]);
    expect(result?.unpalletizedBoxCount).toBe(70);
    expect(result?.reason).toContain('cao hơn');
  });

  it('thùng lớn hơn mặt pallet hoặc nặng hơn khối lượng tối đa -> không xếp được', () => {
    const tooWide = palletizeTemplate(
      carton({ allowedOrientations: [[1500, 900, 250]] }, { palletType: '120x80', maxHeight: 1200, maxWeight: 1000 }),
    );
    expect(tooWide?.reason).toContain('mặt pallet');
    const tooHeavy = palletizeTemplate(carton({ weight: 50 }, { palletType: '120x80', maxHeight: 1200, maxWeight: 40 }));
    expect(tooHeavy?.unpalletizedBoxCount).toBe(70);
    expect(tooHeavy?.reason).toContain('khối lượng');
  });
});

describe('palletizeAll', () => {
  it('chỉ xử lý template bật palletize, mỗi pallet chỉ 1 SKU', () => {
    const a = carton({ id: 'a', sku: 'A', quantity: 10 }, { palletType: '120x80', maxHeight: 1200, maxWeight: 1000 });
    const b = carton({ id: 'b', sku: 'B', quantity: 10 }, { palletType: '110x110', maxHeight: 1200, maxWeight: 1000 });
    const plain = makeCargoTemplate({ id: 'c', sku: 'C' });
    const results = palletizeAll([a, plain, b]);
    expect(results.map((r) => r.sku)).toEqual(['A', 'B']);
    for (const r of results) for (const p of r.pallets) expect(p.sku).toBe(r.sku);
  });
});
