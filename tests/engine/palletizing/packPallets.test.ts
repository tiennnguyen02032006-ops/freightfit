import { describe, expect, it } from 'vitest';
import { generateSolution } from '../../../src/engine/optimization/generateSolutions';
import { expandToBoxPlacements } from '../../../src/engine/palletizing/palletBoxes';
import { revalidatePlacement } from '../../../src/engine/revalidate';
import type { ContainerTemplate, Placement } from '../../../src/domain/types';
import { makeCargoTemplate } from '../../fixtures/cargo';
import { palletCarton } from '../../fixtures/pallet';

// Sàn vừa đúng 1 pallet 120x80, cao đủ chồng 2 pallet 115cm.
const narrowTall: ContainerTemplate = {
  id: 'narrow-tall',
  name: 'Narrow tall',
  standardType: 'CUSTOM_TRUCK',
  innerLength: 1200,
  innerWidth: 800,
  innerHeight: 2400,
  maxPayload: 100_000,
  isCustom: true,
};

const bigContainer: ContainerTemplate = {
  id: 'big',
  name: 'Big',
  standardType: 'CUSTOM_TRUCK',
  innerLength: 6000,
  innerWidth: 2400,
  innerHeight: 2400,
  maxPayload: 100_000,
  isCustom: true,
};

function overlaps(a: Placement, b: Placement): boolean {
  return (
    a.x < b.x + b.length - 1e-6 &&
    b.x < a.x + a.length - 1e-6 &&
    a.y < b.y + b.width - 1e-6 &&
    b.y < a.y + a.width - 1e-6 &&
    a.z < b.z + b.height - 1e-6 &&
    b.z < a.z + a.height - 1e-6
  );
}

describe('xếp pallet vào container như khối cứng', () => {
  it('pallet là các placement cứng, vẫn giữ vị trí từng thùng, không chồng nhau và nằm trong container', () => {
    const solution = generateSolution([palletCarton({ quantity: 96 })], bigContainer);
    const placements = solution.containers.flatMap((c) => c.placements);

    expect(solution.unfitCargo).toEqual([]);
    expect(placements.length).toBeGreaterThan(0);
    expect(placements.every((p) => p.palletLoad !== undefined)).toBe(true);

    for (const container of solution.containers) {
      for (const p of container.placements) {
        expect(p.x).toBeGreaterThanOrEqual(-1e-6);
        expect(p.x + p.length).toBeLessThanOrEqual(bigContainer.innerLength + 1e-6);
        expect(p.y + p.width).toBeLessThanOrEqual(bigContainer.innerWidth + 1e-6);
        expect(p.z + p.height).toBeLessThanOrEqual(bigContainer.innerHeight + 1e-6);
      }
      for (let i = 0; i < container.placements.length; i++) {
        for (let j = i + 1; j < container.placements.length; j++) {
          expect(overlaps(container.placements[i], container.placements[j])).toBe(false);
        }
      }
    }

    // Từng thùng (trải từ pallet): đủ 100 thùng, không chồng nhau, nằm trong container.
    let totalBoxes = 0;
    for (const c of solution.containers) {
      const boxes = expandToBoxPlacements(c.placements);
      totalBoxes += boxes.length;
      for (const b of boxes) {
        expect(b.x).toBeGreaterThanOrEqual(-1e-6);
        expect(b.x + b.length).toBeLessThanOrEqual(bigContainer.innerLength + 1e-6);
        expect(b.y + b.width).toBeLessThanOrEqual(bigContainer.innerWidth + 1e-6);
        expect(b.z + b.height).toBeLessThanOrEqual(bigContainer.innerHeight + 1e-6);
      }
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i], boxes[j])).toBe(false);
      }
    }
    expect(totalBoxes).toBe(96);
  });

  it('thống kê theo thùng: số thùng, số pallet, thùng rời, khối lượng khớp', () => {
    // 100 = 3 pallet x 32 + 4 thùng rời (4 < 8 thùng/lớp).
    const solution = generateSolution([palletCarton({ quantity: 100 })], bigContainer);
    expect(solution.stats.boxCount).toBe(100);
    expect(solution.stats.palletCount).toBe(3);
    expect(solution.stats.looseBoxCount).toBe(4);
    // Khối lượng container = 100 thùng x 10kg + mỗi pallet gỗ 25kg (thùng rời không có pallet).
    expect(solution.containers.reduce((s, c) => s + c.totalWeight, 0)).toBeCloseTo(1000 + 25 * 3);
    // Thể tích riêng của thùng nhỏ hơn thể tích khối pallet (khoảng trống + đế pallet).
    expect(solution.stats.boxVolumeFillPercent).toBeGreaterThan(0);
    expect(solution.stats.boxVolumeFillPercent).toBeLessThan(solution.stats.volumeFillPercent);
  });

  it('số tầng pallet tối đa = 1: không chồng pallet, mỗi container 1 pallet', () => {
    // 64 thùng = 2 pallet 32 thùng (cao 115cm); sàn chỉ vừa 1 pallet.
    const solution = generateSolution([palletCarton({ quantity: 64 }, 1)], narrowTall);
    expect(solution.containers).toHaveLength(2);
    for (const c of solution.containers) {
      expect(c.placements).toHaveLength(1);
      expect(c.placements[0].stackLevel).toBe(0);
    }
  });

  it('số tầng pallet tối đa = 2: chồng được 2 pallet trong 1 container, không quá 2 tầng', () => {
    const solution = generateSolution([palletCarton({ quantity: 64 }, 2)], narrowTall);
    expect(solution.containers).toHaveLength(1);
    expect(solution.containers[0].placements.map((p) => p.stackLevel).sort()).toEqual([0, 1]);

    // 3 pallet với giới hạn 2 tầng: pallet thứ 3 phải sang container khác.
    const three = generateSolution([palletCarton({ quantity: 96 }, 2)], narrowTall);
    expect(three.containers).toHaveLength(2);
    for (const c of three.containers) {
      expect(Math.max(...c.placements.map((p) => p.stackLevel))).toBeLessThanOrEqual(1);
    }
  });

  it('tuân thủ tải trọng container: pallet nặng vượt tải thì sang container khác', () => {
    const light: ContainerTemplate = { ...bigContainer, id: 'light', maxPayload: 400 };
    // Mỗi pallet 32 thùng x 10kg = 320kg -> chỉ 1 pallet/container dù còn nhiều chỗ.
    const solution = generateSolution([palletCarton({ quantity: 64 })], light);
    expect(solution.containers).toHaveLength(2);
    for (const c of solution.containers) expect(c.totalWeight).toBeLessThanOrEqual(400);
  });

  it('thùng không lên pallet được vào danh sách không xếp vừa (theo thùng), phần còn lại vẫn xếp', () => {
    const heavy = palletCarton({
      id: 'heavy',
      sku: 'HEAVY',
      weight: 50,
      quantity: 3,
      palletize: { palletType: '120x80', maxHeight: 1150, maxWeight: 40 },
    });
    const loose = makeCargoTemplate({ id: 'loose', quantity: 2 });
    const solution = generateSolution([heavy, loose], bigContainer);
    expect(solution.unfitCargo.filter((u) => u.cargoTemplateId === 'heavy')).toHaveLength(3);
    expect(solution.unfitCargo[0].boxCount).toBe(1);
    expect(solution.stats.boxCount).toBe(2);
    expect(solution.vehiclePlan.feasible).toBe(false);
  });

  it('pallet không xếp vừa được tính theo số thùng thật trong unfitCargo', () => {
    const tiny: ContainerTemplate = { ...bigContainer, id: 'tiny', innerLength: 1000, innerWidth: 700, innerHeight: 500 };
    const solution = generateSolution([palletCarton({ quantity: 40 })], tiny);
    expect(solution.unfitCargo.length).toBeGreaterThan(0);
    expect(solution.unfitCargo.reduce((s, u) => s + (u.boxCount ?? 1), 0)).toBe(40);
  });
});

describe('khối lượng và % tải trọng có tính pallet gỗ', () => {
  it('payloadUsagePercent = (hàng + pallet gỗ) / tải trọng tối đa', () => {
    const container: ContainerTemplate = { ...bigContainer, id: 'payload', maxPayload: 4000 };
    const solution = generateSolution([palletCarton({ quantity: 100 })], container);
    const expectedWeight = 100 * 10 + 25 * solution.stats.palletCount; // 3 pallet + 4 thùng rời
    const totalWeight = solution.containers.reduce((s, c) => s + c.totalWeight, 0);
    expect(totalWeight).toBeCloseTo(expectedWeight);
    expect(solution.stats.payloadUsagePercent).toBeCloseTo((expectedWeight / 4000) * 100);
  });

  it('pallet gỗ được tính vào giới hạn tải trọng: 2 pallet = 640kg hàng + 50kg gỗ vượt 660kg -> 2 container', () => {
    const tight: ContainerTemplate = { ...bigContainer, id: 'tight', maxPayload: 660 };
    const solution = generateSolution([palletCarton({ quantity: 64 })], tight);
    expect(solution.containers).toHaveLength(2);
    for (const c of solution.containers) expect(c.totalWeight).toBeLessThanOrEqual(660);
  });
});

describe('thùng thừa xếp rời vào khoảng trống container', () => {
  // 70 thùng = 2 pallet x 32 + 6 thùng rời.
  const template = palletCarton({ quantity: 70 }, 1);
  const solution = generateSolution([template], bigContainer);
  const placements = solution.containers.flatMap((c) => c.placements);
  const loose = placements.filter((p) => p.palletLeftover);
  const pallets = placements.filter((p) => p.palletLoad);

  it('đủ 2 pallet + 6 thùng rời, không thùng nào bị bỏ sót', () => {
    expect(pallets).toHaveLength(2);
    expect(loose).toHaveLength(6);
    expect(loose.every((p) => p.palletLoad === undefined && p.cargoTemplateId === 'carton')).toBe(true);
    expect(solution.unfitCargo).toEqual([]);
    expect(solution.stats).toMatchObject({ boxCount: 70, palletCount: 2, looseBoxCount: 6 });
  });

  it('thùng rời không chồng lên hàng khác, nằm trong container và có đủ đỡ bên dưới', () => {
    for (const c of solution.containers) {
      for (const p of c.placements.filter((x) => x.palletLeftover)) {
        expect(p.x).toBeGreaterThanOrEqual(-1e-6);
        expect(p.x + p.length).toBeLessThanOrEqual(bigContainer.innerLength + 1e-6);
        expect(p.y + p.width).toBeLessThanOrEqual(bigContainer.innerWidth + 1e-6);
        expect(p.z + p.height).toBeLessThanOrEqual(bigContainer.innerHeight + 1e-6);
        expect(c.placements.filter((o) => o.id !== p.id && overlaps(o, p))).toEqual([]);
        // đặt trên sàn, hoặc có kiện đỡ bên dưới với tỷ lệ đỡ đạt ngưỡng
        expect(p.z === 0 || (p.supportedByPlacementIds.length > 0 && p.supportRatio >= 0.75)).toBe(true);
      }
    }
  });

  it('thùng rời đặt sát hàng đã xếp (chạm vách container hoặc 1 kiện khác)', () => {
    const touching = (a: Placement, b: Placement): boolean => {
      const eq = (u: number, v: number) => Math.abs(u - v) < 1e-6;
      const overlap1 = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 - 1e-6 && b0 < a1 - 1e-6;
      const xy = overlap1(a.x, a.x + a.length, b.x, b.x + b.length) && overlap1(a.y, a.y + a.width, b.y, b.y + b.width);
      const yz = overlap1(a.y, a.y + a.width, b.y, b.y + b.width) && overlap1(a.z, a.z + a.height, b.z, b.z + b.height);
      const xz = overlap1(a.x, a.x + a.length, b.x, b.x + b.length) && overlap1(a.z, a.z + a.height, b.z, b.z + b.height);
      return (
        (yz && (eq(a.x + a.length, b.x) || eq(b.x + b.length, a.x))) ||
        (xz && (eq(a.y + a.width, b.y) || eq(b.y + b.width, a.y))) ||
        (xy && (eq(a.z + a.height, b.z) || eq(b.z + b.height, a.z)))
      );
    };
    for (const c of solution.containers) {
      for (const p of c.placements.filter((x) => x.palletLeftover)) {
        const atWall = p.x < 1e-6 || p.y < 1e-6 || p.x + p.length > bigContainer.innerLength - 1e-6 || p.y + p.width > bigContainer.innerWidth - 1e-6;
        expect(atWall || c.placements.some((o) => o.id !== p.id && touching(p, o))).toBe(true);
      }
    }
  });

  it('số tầng pallet = 1: thùng rời không được đặt chồng lên pallet', () => {
    const palletIds = new Set(pallets.map((p) => p.id));
    for (const p of loose) {
      expect(p.supportedByPlacementIds.some((id) => palletIds.has(id))).toBe(false);
    }
  });

  it('chỉnh tay: đặt thùng rời lên pallet khi giới hạn 1 tầng -> STACK_VIOLATION (khoá template riêng cho pallet)', () => {
    const container = solution.containers.find((c) => c.placements.some((p) => p.palletLeftover))!;
    const target = container.placements.find((p) => p.palletLoad)!;
    const box = container.placements.find((p) => p.palletLeftover)!;
    const result = revalidatePlacement({
      placementId: box.id,
      candidate: { x: target.x, y: target.y, z: target.z + target.height, length: box.length, width: box.width, height: box.height },
      template,
      placements: container.placements,
      containerTemplate: bigContainer,
      templatesById: new Map([[template.id, template]]),
    });
    expect(result.violations.map((v) => v.type)).toContain('STACK_VIOLATION');
  });

  it('số tầng pallet = 2: thùng rời được phép đặt lên pallet (không bị khoá nhầm theo giới hạn của thùng)', () => {
    const t2 = palletCarton({ quantity: 70 }, 2);
    const container = generateSolution([t2], bigContainer).containers[0];
    const target = container.placements.find((p) => p.palletLoad)!;
    const box = container.placements.find((p) => p.palletLeftover)!;
    const result = revalidatePlacement({
      placementId: box.id,
      candidate: { x: target.x, y: target.y, z: target.z + target.height, length: box.length, width: box.width, height: box.height },
      template: t2,
      placements: container.placements,
      containerTemplate: bigContainer,
      templatesById: new Map([[t2.id, t2]]),
    });
    expect(result.violations.map((v) => v.type)).not.toContain('STACK_VIOLATION');
  });
});

describe('chỉnh tay pallet (revalidate)', () => {
  const template = palletCarton({ quantity: 64 }, 1);
  const solution = generateSolution([template], bigContainer);
  const placements = solution.containers[0].placements;
  const [first, second] = placements;
  const templatesById = new Map([[template.id, template]]);

  it('xoay ngang 90° được, lật nằm (đổi mặt tiếp đất) bị từ chối', () => {
    const rotated = revalidatePlacement({
      placementId: first.id,
      candidate: { x: first.x, y: first.y, z: first.z, length: first.width, width: first.length, height: first.height },
      template,
      placements,
      containerTemplate: bigContainer,
      templatesById,
    });
    expect(rotated.violations.map((v) => v.type)).not.toContain('ROTATION_NOT_ALLOWED');

    const tilted = revalidatePlacement({
      placementId: first.id,
      candidate: { x: first.x, y: first.y, z: first.z, length: first.length, width: first.height, height: first.width },
      template,
      placements,
      containerTemplate: bigContainer,
      templatesById,
    });
    expect(tilted.violations.map((v) => v.type)).toContain('ROTATION_NOT_ALLOWED');
  });

  it('đặt pallet lên pallet khác khi giới hạn 1 tầng -> STACK_VIOLATION', () => {
    expect(second).toBeDefined();
    const result = revalidatePlacement({
      placementId: second.id,
      candidate: {
        x: first.x,
        y: first.y,
        z: first.z + first.height,
        length: first.length,
        width: first.width,
        height: second.height,
      },
      template,
      placements,
      containerTemplate: bigContainer,
      templatesById,
    });
    expect(result.violations.map((v) => v.type)).toContain('STACK_VIOLATION');
  });
});
