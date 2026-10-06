import { describe, expect, it } from 'vitest';
import { collectResultWarnings, computeResultMetrics, countUnfitBoxes, minSupportRatio } from '../../src/utils/resultMetrics';
import type { ContainerInstance, ContainerTemplate, PackingSolution } from '../../src/domain/types';
import { makePlacement } from '../fixtures/placement';

const template: ContainerTemplate = {
  id: 't',
  name: 'T',
  standardType: 'CUSTOM_TRUCK',
  innerLength: 2000,
  innerWidth: 1000,
  innerHeight: 1000,
  maxPayload: 500,
  isCustom: true,
};

function makeContainer(overrides: Partial<ContainerInstance> = {}): ContainerInstance {
  return {
    id: 'container-1',
    templateId: 't',
    index: 0,
    placements: [],
    extremePoints: [],
    totalWeight: 0,
    usedVolume: 0,
    centerOfGravity: { x: 0, y: 0, z: 0 },
    cgOffsetXRatio: 0,
    cgOffsetZRatio: 0,
    ...overrides,
  };
}

describe('computeResultMetrics', () => {
  it('phần trăm khối lượng/thể tích, số thùng và độ lệch trọng tâm lớn hơn của 2 trục', () => {
    const container = makeContainer({
      totalWeight: 125,
      usedVolume: 500_000_000, // 0,5 m³ / 2 m³
      cgOffsetXRatio: 0.1,
      cgOffsetZRatio: 0.18,
      placements: [makePlacement({ id: 'a' }), makePlacement({ id: 'b' })],
    });
    const m = computeResultMetrics(container, template, 500);
    expect(m.weightPercent).toBeCloseTo(25);
    expect(m.volumePercent).toBeCloseTo(25);
    expect(m.usedVolumeM3).toBeCloseTo(0.5);
    expect(m.totalVolumeM3).toBeCloseTo(2);
    expect(m.boxCount).toBe(2);
    expect(m.palletCount).toBe(0);
    expect(m.balanceXPercent).toBeCloseTo(10);
    expect(m.balanceZPercent).toBeCloseTo(18);
    expect(m.balancePercent).toBeCloseTo(18);
  });

  it('dùng tải trọng đã chỉnh tạm thời; quá tải thì > 100%; tải trọng 0 không chia cho 0', () => {
    const container = makeContainer({ totalWeight: 300 });
    expect(computeResultMetrics(container, template, 200).weightPercent).toBeCloseTo(150);
    expect(computeResultMetrics(container, template, 0).weightPercent).toBe(0);
  });
});

describe('minSupportRatio', () => {
  it('chỉ xét kiện nằm trên kiện khác; mọi kiện nằm sàn -> null', () => {
    expect(minSupportRatio(makeContainer({ placements: [makePlacement({ z: 0 })] }))).toBeNull();
    const container = makeContainer({
      placements: [
        makePlacement({ id: 'a', z: 0, supportRatio: 0.2 }),
        makePlacement({ id: 'b', z: 200, supportRatio: 0.9 }),
        makePlacement({ id: 'c', z: 200, supportRatio: 0.8 }),
      ],
    });
    expect(minSupportRatio(container)).toBeCloseTo(0.8);
  });
});

describe('collectResultWarnings', () => {
  it('không có gì -> danh sách rỗng', () => {
    expect(collectResultWarnings({ cgWarnings: [], container: makeContainer(), maxPayloadKg: 500, layoutWarnings: [], unfitBoxCount: 0 })).toEqual([]);
  });

  it('gộp lệch trọng tâm, quá tải, cảnh báo bố cục và hàng không xếp vừa vào 1 danh sách', () => {
    const warnings = collectResultWarnings({
      cgWarnings: [{ containerInstanceId: 'container-1', axis: 'X', offsetRatio: 0.234 }],
      container: makeContainer({ totalWeight: 600 }),
      maxPayloadKg: 500,
      layoutWarnings: ['Khe giữa hai cột pallet ngoài khoảng'],
      unfitBoxCount: 7,
    });
    expect(warnings.map((w) => w.id)).toEqual(['cg-X', 'payload', 'layout-0', 'unfit']);
    expect(warnings[0].text).toContain('lệch ngang 23%');
    expect(warnings[1].text).toContain('600 kg');
    expect(warnings[3].text).toBe('7 kiện hàng không xếp vừa');
  });
});

describe('countUnfitBoxes', () => {
  it('đếm theo thùng (pallet chưa xếp được ghi số thùng thật); không có phương án -> 0', () => {
    expect(countUnfitBoxes(null)).toBe(0);
    const solution = {
      unfitCargo: [
        { cargoInstanceId: 'a', cargoTemplateId: 'x', reason: 'NO_SPACE', boxCount: 32 },
        { cargoInstanceId: 'b', cargoTemplateId: 'y', reason: 'NO_SPACE' },
      ],
    } as unknown as PackingSolution;
    expect(countUnfitBoxes(solution)).toBe(33);
  });
});
