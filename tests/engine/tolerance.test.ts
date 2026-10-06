import { describe, expect, it } from 'vitest';
import { DUNNAGE_CONFIG, NO_TOLERANCE } from '../../src/engine/config';
import { applyToleranceClearance, describeTolerance, effectiveTolerance, palletGapOf, toleranceLabel, wallMarginOf } from '../../src/engine/tolerance';
import { generateSolution } from '../../src/engine/optimization/generateSolutions';
import { computeDunnageGaps } from '../../src/engine/optimization/dunnage';
import { gapRange } from '../../src/engine/optimization/airbagSizes';
import { expandCargoWithPallets } from '../../src/engine/palletizing/palletBlock';
import { expandToBoxPlacements } from '../../src/engine/palletizing/palletBoxes';
import { palletizeTemplate } from '../../src/engine/palletizing/palletizeCargo';
import { buildContainerReportHtml, buildContainerSummary } from '../../src/export/exportPdf';
import { PALLET_BASE_HEIGHT_MM } from '../../src/engine/preprocessing/palletTypes';
import type { ContainerTemplate, PalletBoxRect, Placement, ToleranceSettings } from '../../src/domain/types';
import { makeCargoTemplate } from '../fixtures/cargo';
import { palletCarton } from '../fixtures/pallet';

const ON: ToleranceSettings = { enabled: true, defaultDimensionTolerance: 15, palletGap: 30 };

function container(width: number, length = 5800, height = 2300): ContainerTemplate {
  return { id: `c-${width}`, name: 'C', standardType: 'CUSTOM_TRUCK', innerLength: length, innerWidth: width, innerHeight: height, maxPayload: 1_000_000, isCustom: true };
}

/** Khoảng cách (có dấu) giữa 2 hộp theo từng trục; > 0 ở ít nhất 1 trục nghĩa là KHÔNG chạm/chồng. */
function maxAxisGap(a: Placement, b: Placement): number {
  const gx = Math.max(a.x - (b.x + b.length), b.x - (a.x + a.length));
  const gy = Math.max(a.y - (b.y + b.width), b.y - (a.y + a.width));
  const gz = Math.max(a.z - (b.z + b.height), b.z - (a.z + a.height));
  return Math.max(gx, gy, gz);
}

function cellGap(a: PalletBoxRect, b: PalletBoxRect): number {
  return Math.max(a.x - (b.x + b.length), b.x - (a.x + a.length), a.y - (b.y + b.width), b.y - (a.y + a.width));
}

const params = { palletType: '120x80' as const, maxHeight: PALLET_BASE_HEIGHT_MM + 1000, maxWeight: 100_000 };

describe('cấu hình dung sai (dùng lại trường clearance)', () => {
  it('mặc định thùng 1,5 cm mỗi chiều và khe 3 cm; chỉnh riêng từng SKU; tắt thì bằng 0', () => {
    const plain = makeCargoTemplate();
    expect(effectiveTolerance(plain, ON)).toBe(15);
    expect(effectiveTolerance({ tolerance: 40 }, ON)).toBe(40);
    expect(effectiveTolerance({ tolerance: 0 }, ON)).toBe(0);
    expect(effectiveTolerance(plain, { ...ON, enabled: false })).toBe(0);
    expect(effectiveTolerance(plain)).toBe(0); // không truyền cấu hình = không dung sai
    expect(palletGapOf(ON)).toBe(30);
    expect(wallMarginOf(ON)).toBe(15);
    expect(palletGapOf(NO_TOLERANCE)).toBe(0);
  });

  it('cộng dung sai vào clearance: mỗi chiều to thêm đúng dung sai (mỗi phía một nửa), giữ clearance sẵn có', () => {
    const template = makeCargoTemplate({ clearance: { left: 5, right: 5, front: 0, back: 0, top: 0, bottom: 0 } });
    const withTol = applyToleranceClearance(template, ON);
    expect(withTol.clearance).toEqual({ left: 12.5, right: 12.5, front: 7.5, back: 7.5, top: 7.5, bottom: 7.5 });
    // kích thước thật không đổi
    expect([withTol.length, withTol.width, withTol.height]).toEqual([template.length, template.width, template.height]);
    // không dung sai -> trả về CHÍNH template
    expect(applyToleranceClearance(template, NO_TOLERANCE)).toBe(template);
  });

  it('ghi chú "đã tính dung sai X cm"', () => {
    const notes = describeTolerance([makeCargoTemplate({ sku: 'A' }), makeCargoTemplate({ sku: 'B', tolerance: 20 })], ON);
    expect(notes).toContain('Đã tính dung sai: khe giữa các pallet và giữa pallet với vách container 3 cm');
    expect(notes).toContain('A: đã tính dung sai 1,5 cm mỗi chiều');
    expect(notes).toContain('B: đã tính dung sai 2 cm mỗi chiều');
    expect(describeTolerance([makeCargoTemplate()], NO_TOLERANCE)).toEqual([]);
    expect(toleranceLabel(15)).toBe('đã tính dung sai 1,5 cm');
    expect(toleranceLabel(0)).toBeNull();
  });
});

describe('số thùng mỗi lớp trên pallet khi bật dung sai (tính tay)', () => {
  // Thùng 400x300x250, pallet 1200x800, hàng cao tối đa 1000mm.
  const template = (tolerance?: number) => palletCarton({ quantity: 45, palletize: params, ...(tolerance !== undefined ? { tolerance } : {}) });

  it('tắt dung sai: 8 thùng/lớp (lưới 300x400: 4 x 2), 4 lớp, 32 thùng/pallet', () => {
    const result = palletizeTemplate(template(), NO_TOLERANCE)!;
    expect(result.tolerance).toBe(0);
    expect(result.pallets[0].layers[0].boxes).toHaveLength(8);
    expect(result.pallets[0].layers).toHaveLength(4);
    expect(result.pallets[0].boxCount).toBe(32);
  });

  it('dung sai 1,5 cm: ô 415x315 -> tối đa 5 thùng/lớp; 3 lớp (bước 265, 4 lớp cần 1060 > 1000) -> 15 thùng/pallet', () => {
    // Tính tay (ô A = 415x315, ô B = 315x415 trên mặt 1200x800):
    //  - lưới thuần A: 2 cột (830) x 2 hàng (630) = 4;  lưới thuần B: 3 cột (945) x 1 hàng (830 > 800 cho 2 hàng) = 3
    //  - chia theo chiều dài: 2 cột A (830mm) x 2 hàng = 4, phần còn 370mm xếp thêm 1 cột B (315) x 1 hàng = +1  -> 5
    //  => 5 thùng/lớp (giảm từ 8). Chiều cao: floor(1000 / (250 + 15)) = 3 lớp (giảm từ 4).
    const result = palletizeTemplate(template(), ON)!;
    expect(result.tolerance).toBe(15);
    expect(result.pallets[0].layers[0].boxes).toHaveLength(5);
    expect(result.pallets[0].layers).toHaveLength(3);
    expect(result.pallets[0].boxCount).toBe(15);
    expect(result.pallets[0].totalHeight).toBe(PALLET_BASE_HEIGHT_MM + 3 * 265);
    expect(result.pallets.map((p) => p.boxCount)).toEqual([15, 15, 15]); // 45 thùng = đúng 3 pallet
  });

  it('chỉnh riêng từng SKU: dung sai 10 cm -> ô 500x400 -> 4 thùng/lớp, 2 lớp', () => {
    // Tính tay (A = 500x400, B = 400x500 trên mặt 1200x800): lưới thuần A = 2 cột (1000) x 2 hàng (800) = 4;
    // lưới thuần B = 3 cột (1200) x 1 hàng (500; 2 hàng cần 1000 > 800) = 3; chia theo chiều dài: 1 cột A (2 thùng) + cột B (400) = 3;
    // chia theo chiều rộng: 1 hàng A (2 thùng) + hàng B cao 500 > phần còn 400 -> 2. Tốt nhất = 4. Chiều cao: bước 250 + 100 = 350.
    const result = palletizeTemplate(template(100), ON)!;
    expect(result.tolerance).toBe(100);
    expect(result.pallets[0].layers[0].boxes).toHaveLength(4);
    expect(result.pallets[0].layers).toHaveLength(Math.floor(1000 / 350)); // 2 lớp
  });

  it('thùng vẫn có kích thước thật (3D vẽ thật), nằm giữa ô: không chạm nhau và cách mép pallet >= dung sai/2', () => {
    const result = palletizeTemplate(template(), ON)!;
    const [palletL, palletW] = [1200, 800];
    for (const pallet of result.pallets) {
      for (const layer of pallet.layers) {
        for (const box of layer.boxes) {
          expect([box.length, box.width].sort((a, b) => a - b)).toEqual([300, 400]); // đúng kích thước thật
          expect(box.x).toBeGreaterThanOrEqual(7.5 - 1e-6);
          expect(box.y).toBeGreaterThanOrEqual(7.5 - 1e-6);
          expect(palletL - (box.x + box.length)).toBeGreaterThanOrEqual(7.5 - 1e-6);
          expect(palletW - (box.y + box.width)).toBeGreaterThanOrEqual(7.5 - 1e-6);
        }
        for (let i = 0; i < layer.boxes.length; i++) {
          for (let j = i + 1; j < layer.boxes.length; j++) expect(cellGap(layer.boxes[i], layer.boxes[j])).toBeGreaterThanOrEqual(15 - 1e-6);
        }
      }
    }
  });

  it('lớp trên cùng của pallet lẻ (khối chữ nhật ở góc) cũng tính dung sai', () => {
    // 5 thùng/lớp: 38 thùng = 15 + 15 + 8 -> pallet lẻ 5 + 3 (3 thùng xếp khối chữ nhật liền)
    const result = palletizeTemplate(palletCarton({ quantity: 38, palletize: params }), ON)!;
    const last = result.pallets[result.pallets.length - 1];
    expect(last.isPartial).toBe(true);
    const top = last.layers[last.layers.length - 1].boxes;
    for (let i = 0; i < top.length; i++) {
      for (let j = i + 1; j < top.length; j++) expect(cellGap(top[i], top[j])).toBeGreaterThanOrEqual(15 - 1e-6);
    }
  });
});

describe('xếp vào container có dung sai: không có hai kiện nào chạm nhau', () => {
  const truck = container(2200);
  // 6 pallet đầy (15 thùng) + 3 thùng thừa (< 1 lớp 5 thùng) xếp rời
  const solution = generateSolution([palletCarton({ quantity: 15 * 6 + 3, palletize: params })], truck, ON);
  const placements = solution.containers[0].placements;
  const pallets = placements.filter((p) => p.palletLoad);

  it('đủ thùng, kích thước đặt vào là kích thước thật (không cộng dung sai), ghi chú "đã tính dung sai"', () => {
    expect(solution.unfitCargo).toEqual([]);
    expect(solution.stats.boxCount).toBe(93);
    expect(pallets).toHaveLength(6);
    for (const p of pallets) expect([p.length, p.width]).toEqual([1200, 800]); // pallet thật, không phải 1230x830
    expect(solution.toleranceNotes).toContain('Đã tính dung sai: khe giữa các pallet và giữa pallet với vách container 3 cm');
    expect(solution.toleranceNotes).toContain('CARTON: đã tính dung sai 1,5 cm mỗi chiều');
  });

  it('khe giữa các pallet >= 3 cm và giữa pallet với vách >= 3 cm', () => {
    for (let i = 0; i < pallets.length; i++) {
      for (let j = i + 1; j < pallets.length; j++) expect(maxAxisGap(pallets[i], pallets[j])).toBeGreaterThanOrEqual(30 - 1e-6);
    }
    for (const p of pallets) {
      expect(p.y).toBeGreaterThanOrEqual(30 - 1e-6); // vách trái
      expect(truck.innerWidth - (p.y + p.width)).toBeGreaterThanOrEqual(30 - 1e-6); // vách phải
      expect(truck.innerLength - (p.x + p.length)).toBeGreaterThanOrEqual(30 - 1e-6); // vách trước
      expect(p.x).toBeGreaterThanOrEqual(30 - 1e-6); // phía cửa
    }
    // hàng đầu cách vách trước đúng 3 cm
    expect(truck.innerLength - Math.max(...pallets.map((p) => p.x + p.length))).toBeCloseTo(30);
  });

  it('không có hai thùng/kiện nào chạm hoặc chồng nhau (mọi trục đều có khe > 0 ở ít nhất 1 trục)', () => {
    const boxes = expandToBoxPlacements(placements);
    expect(boxes).toHaveLength(93);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) expect(maxAxisGap(boxes[i], boxes[j])).toBeGreaterThan(1);
    }
  });

  it('hàng thường (không pallet) cũng tính dung sai qua clearance, vẫn vẽ kích thước thật', () => {
    const plain = makeCargoTemplate({ id: 'plain', quantity: 12 });
    const sol = generateSolution([plain], container(2200), ON);
    const list = sol.containers[0].placements;
    expect(list).toHaveLength(12);
    for (const p of list) expect([p.length, p.width, p.height]).toEqual([400, 300, 200]);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) expect(maxAxisGap(list[i], list[j])).toBeGreaterThanOrEqual(15 - 1e-6);
    }
    // tắt dung sai: xếp sát nhau như cũ (có kiện chạm nhau)
    const off = generateSolution([plain], container(2200)).containers[0].placements;
    expect(off.some((a, i) => off.some((b, j) => j > i && maxAxisGap(a, b) === 0))).toBe(true);
  });

  it('bản tóm tắt PDF in ghi chú "đã tính dung sai"', () => {
    const summary = buildContainerSummary(truck, solution.containers[0]);
    const html = buildContainerReportHtml({ summary, lineItems: [], containerIndex: 0, containerTotal: 1, toleranceNotes: solution.toleranceNotes });
    expect(html).toContain('đã tính dung sai 1,5 cm mỗi chiều');
    expect(html).toContain('khe giữa các pallet và giữa pallet với vách container 3 cm');
    expect(buildContainerReportHtml({ summary, lineItems: [], containerIndex: 0, containerTotal: 1 })).not.toContain('đã tính dung sai');
    expect(generateSolution([palletCarton({ quantity: 32, palletize: params })], truck).toleranceNotes).toEqual([]);
  });

  it('expandCargoWithPallets cộng dung sai vào clearance của thùng rời, còn khe pallet vào clearance của pallet', () => {
    const { items } = expandCargoWithPallets([palletCarton({ quantity: 15 + 3, palletize: params })], ON);
    const loose = items.find((i) => i.palletLeftover)!;
    expect(loose.template.clearance).toMatchObject({ left: 7.5, right: 7.5, top: 7.5, bottom: 7.5 });
    const pallet = items.find((i) => i.palletLoad)!;
    expect(pallet.template.clearance).toEqual({ left: 15, right: 15, front: 15, back: 15, top: 0, bottom: 0 });
    expect(pallet.palletLoad?.tolerance).toBe(15);
  });
});

describe('khe túi khí vẫn nằm trong khoảng cho phép khi bật dung sai', () => {
  // 8 pallet 110x110 (thùng 400x300x250, dung sai 1,5 cm) trong xe rộng 2400: khe giữa thật = 2400 - 2 x 30 (khe vách) - 2 x 1100 - 30... xem dưới
  const wide = container(2400, 6000, 2400);
  const solution = generateSolution(
    [palletCarton({ quantity: 10_000, palletize: { palletType: '110x110', maxHeight: PALLET_BASE_HEIGHT_MM + 1000, maxWeight: 100_000 } })].map((t) => {
      // số lượng đúng 8 pallet đầy
      const per = palletizeTemplate({ ...t, quantity: 10_000 }, ON)!.pallets[0].boxCount;
      return { ...t, quantity: per * 8 };
    }),
    wide,
    ON,
  );
  const placements = solution.containers[0].placements;
  const pallets = placements.filter((p) => p.palletLoad && p.z === 0);

  it('hai cột sát vách (cách vách 3 cm), khe giữa = rộng xe - 2 x 3 cm - 2 x 110 cm = 14 cm trong [5, 40] cm', () => {
    expect(solution.layoutWarnings).toEqual([]);
    expect(pallets).toHaveLength(8);
    const left = pallets.filter((p) => p.y < wide.innerWidth / 2);
    const right = pallets.filter((p) => p.y >= wide.innerWidth / 2);
    for (const p of left) expect(p.y).toBeCloseTo(30);
    for (const p of right) expect(wide.innerWidth - (p.y + p.width)).toBeCloseTo(30);
    const gap = right[0].y - (left[0].y + left[0].width);
    expect(gap).toBeCloseTo(2400 - 2 * 30 - 2200); // 140 mm
    const range = gapRange(DUNNAGE_CONFIG)!;
    expect(gap).toBeGreaterThanOrEqual(range.min);
    expect(gap).toBeLessThanOrEqual(range.max);
  });

  it('khe giữa được phát hiện và có túi khí cho từng hàng pallet; các hàng cách nhau đúng khe 3 cm', () => {
    const center = computeDunnageGaps(placements, wide).filter((g) => g.source === 'CENTER');
    expect(center).toHaveLength(1);
    expect(center[0].gapSize).toBeCloseTo(140);
    const rowXs = Array.from(new Set(pallets.map((p) => p.x))).sort((a, b) => a - b);
    expect(center[0].bagCount).toBe(rowXs.length);
    expect(center[0].bags.map((b) => b.x)).toEqual(rowXs);
    for (const bag of center[0].bags) expect(bag.width).toBeCloseTo(140);
    for (let i = 1; i < rowXs.length; i++) expect(rowXs[i] - rowXs[i - 1] - pallets[0].length).toBeCloseTo(30);
  });

  it('dung sai làm khe giữa hẹp lại: xe rộng 2260 khe 6 cm hợp lệ khi tắt dung sai, bật dung sai thì khe = 0 -> cảnh báo', () => {
    const narrow = container(2260, 6000, 2400);
    const t = palletCarton({ quantity: 10_000, palletize: { palletType: '110x110', maxHeight: PALLET_BASE_HEIGHT_MM + 1000, maxWeight: 100_000 } });
    const per = (s?: ToleranceSettings) => palletizeTemplate(t, s)!.pallets[0].boxCount;

    const off = generateSolution([{ ...t, quantity: per() * 4 }], narrow);
    expect(off.layoutWarnings).toEqual([]);
    expect(computeDunnageGaps(off.containers[0].placements, narrow).some((g) => g.source === 'CENTER')).toBe(true);

    const on = generateSolution([{ ...t, quantity: per(ON) * 4 }], narrow, ON);
    expect(on.layoutWarnings).toHaveLength(1);
    expect(on.layoutWarnings[0]).toContain('khe giữa hai cột pallet');
  });
});
