import { describe, expect, it } from 'vitest';
import { generateSolution } from '../../../src/engine/optimization/generateSolutions';
import { computeDunnageGaps, summarizeDunnage } from '../../../src/engine/optimization/dunnage';
import { DUNNAGE_CONFIG } from '../../../src/engine/config';
import { gapRange } from '../../../src/engine/optimization/airbagSizes';
import { expandCargoWithPallets } from '../../../src/engine/palletizing/palletBlock';
import { chooseTwoColumnLayout, evaluateTwoColumnLayout, planPalletLayout } from '../../../src/engine/palletizing/palletLayout';
import { palletizeTemplate } from '../../../src/engine/palletizing/palletizeCargo';
import { buildContainerReportHtml, buildContainerSummary } from '../../../src/export/exportPdf';
import type { ContainerTemplate, Placement } from '../../../src/domain/types';
import { palletCarton } from '../../fixtures/pallet';

function container(width: number, length = 6000, height = 2400): ContainerTemplate {
  return {
    id: `c-${width}`,
    name: `C ${width}`,
    standardType: 'CUSTOM_TRUCK',
    innerLength: length,
    innerWidth: width,
    innerHeight: height,
    maxPayload: 1_000_000,
    isCustom: true,
  };
}

/** n pallet ĐẦY của thùng mẫu theo loại pallet đã cho. */
function cartonsForPallets(n: number, palletType: '120x80' | '120x100' | '110x110' | '121.9x101.6', maxTiers = 1) {
  const params = { palletType, maxHeight: 1150, maxWeight: 10_000, maxTiers };
  const perPallet = palletizeTemplate(palletCarton({ quantity: 10_000, palletize: params }))!.pallets[0].boxCount;
  return palletCarton({ quantity: perPallet * n, palletize: params }, maxTiers);
}

const floorPallets = (placements: Placement[]) => placements.filter((p) => p.palletLoad && p.z === 0);

describe('chọn bố cục hai cột và hướng pallet theo khoảng túi khí', () => {
  it('khe giữa = rộng xe - 2 x bề rộng pallet; hợp lệ khi trong 5–40cm (mặc định)', () => {
    expect(DUNNAGE_CONFIG.bagSizes.length).toBeGreaterThan(0);
    expect(gapRange()).toEqual({ min: 50, max: 400 });
    const a = evaluateTwoColumnLayout(container(2350), 'LONG_ALONG_LENGTH', 1200, 1000, 1150);
    expect(a).toMatchObject({ gap: 350, valid: true, alongLength: 1200, alongWidth: 1000 });
    // 110x110 trong xe rộng 2400: khe 20cm
    expect(evaluateTwoColumnLayout(container(2400), 'LONG_ALONG_LENGTH', 1100, 1100, 1150)).toMatchObject({ gap: 200, valid: true });
    // khe quá lớn / quá nhỏ / không đặt vừa 2 cột
    expect(evaluateTwoColumnLayout(container(2200), 'LONG_ALONG_LENGTH', 1200, 800, 1150).valid).toBe(false); // khe 60cm
    expect(evaluateTwoColumnLayout(container(2400), 'LONG_ALONG_WIDTH', 1200, 1000, 1150).valid).toBe(false); // khe 0
    expect(evaluateTwoColumnLayout(container(2200), 'LONG_ALONG_WIDTH', 1200, 800, 1150)).toMatchObject({ gap: -200, valid: false });
  });

  it('thử đổi hướng pallet để đưa khe về trong khoảng: 120x80 trong xe rộng 2500 phải đặt cạnh dài theo chiều rộng (khe 10cm)', () => {
    const { best, options } = chooseTwoColumnLayout(container(2500), 1200, 800, 1150);
    expect(options.find((o) => o.orientation === 'LONG_ALONG_LENGTH')).toMatchObject({ gap: 900, valid: false });
    expect(best).toMatchObject({ orientation: 'LONG_ALONG_WIDTH', gap: 100, alongLength: 800, alongWidth: 1200 });
  });

  it('không hướng nào đưa khe về trong khoảng -> cảnh báo, vẫn xếp được (bố cục hàng sát nhau cũ, không chừa khe)', () => {
    const t = cartonsForPallets(4, '120x80');
    const { items } = expandCargoWithPallets([t]);
    const plan = planPalletLayout(items, container(2200, 5800));
    expect(plan.warnings).toHaveLength(1);
    expect(plan.warnings[0]).toContain('khe giữa hai cột pallet');
    expect(plan.warnings[0]).toContain('5–40 cm');
    expect(plan.items.every((i) => i.palletSlotPad === undefined)).toBe(true);

    const solution = generateSolution([t], container(2200, 5800));
    expect(solution.layoutWarnings).toHaveLength(1);
    expect(solution.unfitCargo).toEqual([]);
  });

  it('chỉ 1 pallet thì không có khe giữa nên không cảnh báo', () => {
    const { items } = expandCargoWithPallets([cartonsForPallets(1, '120x80')]);
    expect(planPalletLayout(items, container(2200, 5800)).warnings).toEqual([]);
  });
});

describe('khe giữa hai cột pallet và túi khí cho từng hàng pallet', () => {
  const truck = container(2400, 6000, 2400);
  const solution = generateSolution([cartonsForPallets(8, '110x110')], truck); // 8 pallet 110x110 -> 4 hàng x 2 cột
  const placements = solution.containers[0].placements;
  const pallets = floorPallets(placements);

  it('hai cột pallet sát hai vách bên, chừa khe giữa 20cm, các hàng liền nhau sát vách trước', () => {
    expect(solution.containers).toHaveLength(1);
    expect(pallets).toHaveLength(8);
    // trả lại bề rộng thật (không còn nửa khe cộng thêm) và thể tích dùng là của pallet thật
    for (const p of pallets) expect([p.length, p.width]).toEqual([1100, 1100]);
    expect(solution.containers[0].usedVolume).toBeCloseTo(placements.reduce((s, p) => s + p.length * p.width * p.height, 0));

    const left = pallets.filter((p) => p.y === 0);
    const right = pallets.filter((p) => Math.abs(p.y + p.width - 2400) < 1e-6);
    expect(left).toHaveLength(4);
    expect(right).toHaveLength(4);
    for (const p of left) expect(right.some((q) => q.x === p.x && Math.abs(q.y - (p.y + p.width) - 200) < 1e-6)).toBe(true);

    const xs = Array.from(new Set(pallets.map((p) => p.x))).sort((a, b) => b - a);
    expect(xs[0] + 1100).toBeCloseTo(6000); // hàng đầu sát vách trước
    xs.forEach((x, i) => {
      if (i > 0) expect(xs[i - 1] - x).toBeCloseTo(1100); // hàng liền hàng, không khe
    });
    expect(solution.layoutWarnings).toEqual([]);
  });

  it('phát hiện khe giữa và có đúng 1 túi cho mỗi hàng pallet, túi dài bằng hàng, đủ cao (>= 2/3 pallet), vừa khít khe', () => {
    const gaps = computeDunnageGaps(placements, truck);
    const center = gaps.filter((g) => g.source === 'CENTER');
    expect(center).toHaveLength(1);
    expect(center[0]).toMatchObject({ axis: 'WIDTH', gapSize: 200, y: 1100, width: 200 });

    const rowXs = Array.from(new Set(pallets.map((p) => p.x))).sort((a, b) => a - b);
    expect(center[0].bagCount).toBe(rowXs.length);
    expect(center[0].bags.map((b) => b.x)).toEqual(rowXs); // 1 túi cho từng hàng

    const palletHeight = pallets[0].height;
    for (const bag of center[0].bags) {
      expect(bag.length).toBe(1100); // dài bằng 1 hàng pallet
      expect(bag.width).toBe(200); // phủ kín bề rộng khe
      expect(bag.y).toBe(1100);
      // khe 20cm: cỡ nhỏ nhất vừa khe và cao >= 2/3 chiều cao pallet (115cm -> 76,7cm) là cỡ M cao 100cm
      expect(bag.sizeLabel).toContain('M ');
      expect(bag.height).toBe(1000);
      expect(bag.height).toBeGreaterThanOrEqual((palletHeight * 2) / 3);
      expect(bag.stackCount).toBe(1);
      expect(bag.z).toBeGreaterThanOrEqual(0);
      expect(bag.z + bag.height).toBeLessThanOrEqual(palletHeight + 1e-6); // nằm trong chiều cao pallet
    }
  });

  it('số túi khí được thống kê đúng (stats) và đưa vào bản tóm tắt PDF', () => {
    const gaps = computeDunnageGaps(placements, truck);
    const airbags = summarizeDunnage(gaps).airbags;
    expect(airbags).toBeGreaterThanOrEqual(4);
    expect(solution.stats.airbagCount).toBe(airbags);

    const summary = buildContainerSummary(truck, solution.containers[0]);
    expect(summary.airbagCount).toBe(airbags);
    const html = buildContainerReportHtml({ summary, lineItems: [], containerIndex: 0, containerTotal: 1 });
    expect(html).toContain('Túi khí chèn lót');
    expect(html).toContain(`${airbags} túi`);
  });

  it('cảnh báo bố cục được in trong PDF (đã escape HTML)', () => {
    const summary = buildContainerSummary(truck, solution.containers[0]);
    const html = buildContainerReportHtml({
      summary,
      lineItems: [],
      containerIndex: 0,
      containerTotal: 1,
      warnings: ['Khe <quá lớn>'],
    });
    expect(html).toContain('Khe &lt;quá lớn&gt;');
    expect(html).not.toContain('Khe <quá lớn>');
  });

  it('chồng 2 tầng (14 pallet, sàn chứa 10): mỗi hàng ở mỗi tầng có 1 túi riêng', () => {
    const tall = container(2400, 6000, 2400);
    const two = generateSolution([cartonsForPallets(14, '110x110', 2)], { ...tall, innerHeight: 2400 });
    const all = two.containers[0].placements;
    const upper = all.filter((p) => p.palletLoad && p.z > 0);
    expect(upper.length).toBeGreaterThan(0);
    const center = computeDunnageGaps(all, tall).filter((g) => g.source === 'CENTER');
    const rowsCount = new Set(all.filter((p) => p.palletLoad).map((p) => `${p.z}|${p.x}`)).size;
    // số túi = số hàng-tầng có đủ 2 pallet đối diện
    const pairedRows = new Set(
      all.filter((p) => p.palletLoad).map((p) => `${p.z}|${p.x}`).filter((key) => all.filter((p) => p.palletLoad && `${p.z}|${p.x}` === key).length === 2),
    );
    expect(pairedRows.size).toBeLessThanOrEqual(rowsCount);
    expect(center.reduce((s, g) => s + g.bagCount, 0)).toBe(pairedRows.size);
    expect(center.length).toBe(2); // 2 tầng -> 2 khe (mỗi tầng 1 khe, nhiều túi)
  });
});
