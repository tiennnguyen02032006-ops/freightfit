import { describe, expect, it } from 'vitest';
import { DUNNAGE_CONFIG, type DunnageConfig } from '../../../src/engine/config';
import {
  chooseCenterBagPlan,
  chooseGenericSize,
  fittingSizes,
  gapRange,
  isGapInsertable,
} from '../../../src/engine/optimization/airbagSizes';
import { computeDunnageGaps, describeAirbagUsage, summarizeDunnage } from '../../../src/engine/optimization/dunnage';
import { evaluateTwoColumnLayout } from '../../../src/engine/palletizing/palletLayout';
import { buildContainerReportHtml, buildContainerSummary } from '../../../src/export/exportPdf';
import type { ContainerInstance, ContainerTemplate, PalletLoad, Placement } from '../../../src/domain/types';
import { makePlacement } from '../../fixtures/placement';

const truck: ContainerTemplate = {
  id: 'wide',
  name: 'Wide',
  standardType: 'CUSTOM_TRUCK',
  innerLength: 6000,
  innerWidth: 2550,
  innerHeight: 2400,
  maxPayload: 100_000,
  isCustom: true,
};

const stubLoad: PalletLoad = {
  id: 'stub',
  cargoTemplateId: 'c',
  sku: 'S',
  palletType: '110x110',
  layers: [],
  boxCount: 0,
  totalWeight: 0,
  palletWeight: 0,
  totalHeight: 2100,
  isPartial: false,
};

// 2 pallet cao 210cm, mỗi pallet 110x110, khe giữa 35cm (2 x 1100 + 350 = 2550)
function tallPalletRow(): Placement[] {
  return [
    makePlacement({ id: 'left', x: 0, y: 0, z: 0, length: 1100, width: 1100, height: 2100, palletLoad: stubLoad }),
    makePlacement({ id: 'right', x: 0, y: 1450, z: 0, length: 1100, width: 1100, height: 2100, palletLoad: stubLoad }),
  ];
}

describe('danh sách cỡ túi khí cấu hình được', () => {
  it('mặc định 3 cỡ, mỗi cỡ có rộng x cao và khoảng khe riêng; khe chèn được chung 5–40cm', () => {
    expect(DUNNAGE_CONFIG.bagSizes).toHaveLength(3);
    for (const s of DUNNAGE_CONFIG.bagSizes) {
      expect(s.width).toBeGreaterThan(0);
      expect(s.height).toBeGreaterThan(0);
      expect(s.minGap).toBeLessThan(s.maxGap);
    }
    expect(gapRange()).toEqual({ min: 50, max: 400 });
  });

  it('fittingSizes / isGapInsertable theo khoảng khe của từng cỡ', () => {
    expect(fittingSizes(350).map((s) => s.name)).toEqual(['L']);
    expect(fittingSizes(120).map((s) => s.name)).toEqual(['S', 'M']);
    expect(fittingSizes(500)).toEqual([]);
    expect(isGapInsertable(40)).toBe(false);
    expect(isGapInsertable(350)).toBe(true);
    expect(chooseGenericSize(120)?.name).toBe('S'); // nhỏ nhất vừa khe
    expect(chooseGenericSize(500)).toBeNull();
  });

  it('khoảng khe chung là hợp các khoảng; khe rơi vào "lỗ hổng" giữa các cỡ thì không chèn được', () => {
    const cfg: DunnageConfig = {
      ...DUNNAGE_CONFIG,
      bagSizes: [
        { name: 'A', width: 1000, height: 1000, minGap: 50, maxGap: 100 },
        { name: 'B', width: 1000, height: 1000, minGap: 300, maxGap: 400 },
      ],
    };
    expect(gapRange(cfg)).toEqual({ min: 50, max: 400 });
    expect(isGapInsertable(200, cfg)).toBe(false);
    expect(evaluateTwoColumnLayout(truck, 'LONG_ALONG_LENGTH', 1100, 1100, 1150, cfg)).toMatchObject({ gap: 350, valid: true });
    expect(evaluateTwoColumnLayout({ ...truck, innerWidth: 2400 }, 'LONG_ALONG_LENGTH', 1100, 1100, 1150, cfg).valid).toBe(false); // khe 200
  });
});

describe('chọn cỡ túi cho khe giữa hai cột pallet', () => {
  it('chọn cỡ nhỏ nhất vừa khe và cao >= 2/3 chiều cao pallet', () => {
    // pallet 115cm -> cần >= 76,7cm
    expect(chooseCenterBagPlan(100, 1150, 1100)).toMatchObject({ size: { name: 'S' }, stackCount: 1, bagHeight: 800 });
    expect(chooseCenterBagPlan(200, 1150, 1100)).toMatchObject({ size: { name: 'M' }, stackCount: 1, bagHeight: 1000 });
    expect(chooseCenterBagPlan(350, 1150, 1100)).toMatchObject({ size: { name: 'L' }, stackCount: 1, bagHeight: 1150 }); // cỡ L cao 120cm, hiển thị ép vừa chiều cao pallet 115cm
  });

  it('bỏ qua cỡ vừa khe nhưng thấp hơn 2/3 pallet, lấy cỡ nhỏ nhất đủ cao', () => {
    // pallet 140cm -> cần >= 93,3cm: khe 12cm có S(80) và M(100) vừa -> S thấp quá, chọn M
    expect(chooseCenterBagPlan(120, 1400, 1100)).toMatchObject({ size: { name: 'M' }, stackCount: 1, bagHeight: 1000 });
  });

  it('pallet cao 210cm, khe 35cm: chỉ cỡ L chèn được và cao 120cm < 2/3 x 210 = 140cm -> 2 túi chồng', () => {
    const plan = chooseCenterBagPlan(350, 2100, 1100)!;
    expect(plan.size.name).toBe('L');
    expect(plan.stackCount).toBe(2);
    // 2 túi cao 120cm = 240cm vượt chiều cao pallet 210cm -> hiển thị ép vừa chiều cao pallet, chia đều 2 túi
    expect(plan.coveredHeight).toBe(2100);
    expect(plan.bagHeight).toBe(1050);
    expect(plan.coveredHeight).toBeGreaterThanOrEqual(2100 * (2 / 3)); // che >= 2/3 chiều cao pallet
    expect(plan.alongCount).toBe(1); // rộng túi 125cm >= dài hàng 110cm
  });

  it('khe không cỡ nào chèn được -> null; túi hẹp hơn hàng pallet -> nhiều túi nối nhau dọc hàng', () => {
    expect(chooseCenterBagPlan(500, 1150, 1100)).toBeNull();
    const narrow: DunnageConfig = { ...DUNNAGE_CONFIG, bagSizes: [{ name: 'N', width: 600, height: 1200, minGap: 300, maxGap: 400 }] };
    expect(chooseCenterBagPlan(350, 1150, 1100, narrow)).toMatchObject({ alongCount: 2, bagLength: 550 });
  });

  it('cỡ cao hơn pallet: 1 túi, chiều cao hiển thị không vượt chiều cao pallet', () => {
    const tall: DunnageConfig = { ...DUNNAGE_CONFIG, bagSizes: [{ name: 'T', width: 1250, height: 2200, minGap: 300, maxGap: 400 }] };
    expect(chooseCenterBagPlan(350, 2100, 1100, tall)).toMatchObject({ stackCount: 1, bagHeight: 2100, coveredHeight: 2100 });
  });
});

describe('pallet cao 210cm, khe 35cm: 2 túi chồng — 3D, thống kê, PDF', () => {
  const placements = tallPalletRow();
  const gaps = computeDunnageGaps(placements, truck);
  const center = gaps.find((g) => g.source === 'CENTER')!;

  it('phát hiện khe giữa 35cm và đặt 2 túi chồng (đúng số túi và chiều cao) cho hàng pallet', () => {
    expect(center).toMatchObject({ gapSize: 350, y: 1100, width: 350, bagCount: 2 });
    expect(center.bags).toHaveLength(2);
    const [bottom, top] = [...center.bags].sort((a, b) => a.z - b.z);
    for (const bag of [bottom, top]) {
      expect(bag).toMatchObject({ length: 1100, width: 350, height: 1050, stackCount: 2 });
      expect(bag.sizeLabel).toContain('L 1250×1200');
    }
    expect(bottom.z).toBe(0);
    expect(top.z).toBe(1050); // túi trên nằm ngay trên túi dưới
    expect(top.z + top.height).toBe(2100); // tổng chiều cao đúng bằng chiều cao pallet
  });

  it('thống kê: tổng số túi, cỡ, số túi chồng và chiều cao hiển thị đúng', () => {
    const summary = summarizeDunnage(gaps);
    expect(summary.airbags).toBe(2);
    expect(summary.usage).toEqual([
      { sizeLabel: 'L 1250×1200 mm', stackCount: 2, bagHeight: 1050, coveredHeight: 2100, count: 2 },
    ]);
    expect(describeAirbagUsage(gaps)).toEqual(['2 túi cỡ L 1250×1200 mm — chồng 2 túi, mỗi túi cao 105 cm (tổng 210 cm)']);
  });

  it('bản tóm tắt và HTML của PDF nêu đúng số túi, cỡ, số túi chồng và chiều cao', () => {
    const container: ContainerInstance = {
      id: 'container-1',
      templateId: truck.id,
      index: 0,
      placements,
      extremePoints: [],
      totalWeight: 0,
      usedVolume: 0,
      centerOfGravity: { x: 0, y: 0, z: 0 },
      cgOffsetXRatio: 0,
      cgOffsetZRatio: 0,
    };
    const summary = buildContainerSummary(truck, container);
    expect(summary.airbagCount).toBe(2);
    expect(summary.airbagLines).toEqual(['2 túi cỡ L 1250×1200 mm — chồng 2 túi, mỗi túi cao 105 cm (tổng 210 cm)']);
    const html = buildContainerReportHtml({ summary, lineItems: [], containerIndex: 0, containerTotal: 1 });
    expect(html).toContain('2 túi');
    expect(html).toContain('chồng 2 túi, mỗi túi cao 105 cm (tổng 210 cm)');
  });

  it('cùng hàng nhưng pallet thấp (115cm) và khe 35cm chỉ cần 1 túi cỡ L', () => {
    const low = tallPalletRow().map((p) => ({ ...p, height: 1150 }));
    const gap = computeDunnageGaps(low, truck).find((g) => g.source === 'CENTER')!;
    expect(gap.bagCount).toBe(1);
    expect(gap.bags[0]).toMatchObject({ stackCount: 1, height: 1150 });
  });

  it('mỗi hàng (dài 110cm) có đủ túi: 2 hàng pallet cao 210cm -> 4 túi', () => {
    const rows = [
      ...tallPalletRow(),
      ...tallPalletRow().map((p) => ({ ...p, id: `${p.id}2`, x: 1100 })),
    ];
    const gap = computeDunnageGaps(rows, truck).find((g) => g.source === 'CENTER')!;
    expect(gap.bagCount).toBe(4);
    expect(new Set(gap.bags.map((b) => b.x))).toEqual(new Set([0, 1100]));
  });
});
