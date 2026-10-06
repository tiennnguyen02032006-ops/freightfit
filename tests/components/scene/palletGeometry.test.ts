import { describe, expect, it } from 'vitest';
import {
  boxInstancesRelativeToPallet,
  buildBoxEdgePositions,
  palletBaseParts,
} from '../../../src/components/scene/palletGeometry';
import { generateSolution } from '../../../src/engine/optimization/generateSolutions';
import { expandToBoxPlacements, findPalletBox, palletBoxPlacements } from '../../../src/engine/palletizing/palletBoxes';
import { PALLET_BASE_HEIGHT_MM } from '../../../src/engine/preprocessing/palletTypes';
import type { ContainerTemplate } from '../../../src/domain/types';
import { palletCarton } from '../../fixtures/pallet';

describe('palletBaseParts', () => {
  it('đế gỗ = 1 mặt trên + 3 thanh đáy + 9 chân kê, nằm gọn trong chiều cao đế', () => {
    const parts = palletBaseParts(1200, 800);
    expect(parts.filter((p) => p.kind === 'deck')).toHaveLength(1);
    expect(parts.filter((p) => p.kind === 'runner')).toHaveLength(3);
    expect(parts.filter((p) => p.kind === 'block')).toHaveLength(9);
    for (const p of parts) {
      expect(p.position[1] - p.size[1] / 2).toBeGreaterThanOrEqual(-PALLET_BASE_HEIGHT_MM / 2 - 1e-6);
      expect(p.position[1] + p.size[1] / 2).toBeLessThanOrEqual(PALLET_BASE_HEIGHT_MM / 2 + 1e-6);
      expect(Math.abs(p.position[0]) + p.size[0] / 2).toBeLessThanOrEqual(600 + 1e-6);
      expect(Math.abs(p.position[2]) + p.size[2] / 2).toBeLessThanOrEqual(400 + 1e-6);
    }
  });

  it('pallet xoay 90° (dài theo trục z): mặt trên đổi kích thước theo, vẫn đủ 13 bộ phận', () => {
    const parts = palletBaseParts(800, 1200);
    expect(parts).toHaveLength(13);
    expect(parts[0].size[0]).toBe(800);
    expect(parts[0].size[2]).toBe(1200);
  });
});

describe('boxInstancesRelativeToPallet / buildBoxEdgePositions', () => {
  const solution = generateSolution([palletCarton({ quantity: 20 })], {
    id: 'c',
    name: 'c',
    standardType: 'CUSTOM_TRUCK',
    innerLength: 3000,
    innerWidth: 2000,
    innerHeight: 2400,
    maxPayload: 100_000,
    isCustom: true,
  });
  const pallet = solution.containers[0].placements[0];
  const boxes = palletBoxPlacements(pallet);
  const instances = boxInstancesRelativeToPallet(pallet, boxes);

  it('vị trí thùng so với tâm pallet nằm trong khối pallet', () => {
    expect(instances).toHaveLength(boxes.length);
    for (const { position, size } of instances) {
      expect(Math.abs(position[0]) + size[0] / 2).toBeLessThanOrEqual(pallet.length / 2 + 1e-6);
      expect(Math.abs(position[2]) + size[2] / 2).toBeLessThanOrEqual(pallet.width / 2 + 1e-6);
      expect(position[1] - size[1] / 2).toBeGreaterThanOrEqual(-pallet.height / 2 + PALLET_BASE_HEIGHT_MM - 1e-6);
      expect(position[1] + size[1] / 2).toBeLessThanOrEqual(pallet.height / 2 + 1e-6);
    }
  });

  it('viền gộp: mỗi thùng 12 cạnh = 24 đỉnh, các đỉnh nằm đúng biên thùng', () => {
    const edges = buildBoxEdgePositions(instances);
    expect(edges.length).toBe(instances.length * 24 * 3);
    const first = instances[0];
    for (let i = 0; i < 24; i++) {
      expect(Math.abs(edges[i * 3] - first.position[0])).toBeCloseTo(first.size[0] / 2);
      expect(Math.abs(edges[i * 3 + 1] - first.position[1])).toBeCloseTo(first.size[1] / 2);
      expect(Math.abs(edges[i * 3 + 2] - first.position[2])).toBeCloseTo(first.size[2] / 2);
    }
  });
});

describe('findPalletBox', () => {
  const container: ContainerTemplate = {
    id: 'c',
    name: 'c',
    standardType: 'CUSTOM_TRUCK',
    innerLength: 3000,
    innerWidth: 2000,
    innerHeight: 2400,
    maxPayload: 100_000,
    isCustom: true,
  };
  const pallet = generateSolution([palletCarton({ quantity: 32 })], container).containers[0].placements[0];
  const boxes = palletBoxPlacements(pallet);

  it('trả về thùng, lớp chứa nó và vị trí trong lớp', () => {
    const first = findPalletBox(pallet, boxes[0].id)!;
    expect(first).toMatchObject({ boxNumber: 1, layerNumber: 1, indexInLayer: 1, boxTotal: 32, layerCount: 4, layerBoxCount: 8 });

    const last = findPalletBox(pallet, boxes[31].id)!;
    expect(last).toMatchObject({ boxNumber: 32, layerNumber: 4, indexInLayer: 8 });
    expect(last.box.z).toBeGreaterThan(first.box.z); // lớp cao hơn nằm trên
  });

  it('id không tồn tại hoặc placement không phải pallet -> null', () => {
    expect(findPalletBox(pallet, 'khong-co')).toBeNull();
    expect(findPalletBox({ ...pallet, palletLoad: undefined }, boxes[0].id)).toBeNull();
  });
});

describe('quy mô vài nghìn thùng', () => {
  it('5000 thùng: số pallet vừa phải, dữ liệu vẽ gọn (không phụ thuộc số thùng ở số draw call)', () => {
    const big: ContainerTemplate = {
      id: 'big',
      name: 'big',
      standardType: 'CUSTOM_TRUCK',
      innerLength: 12000,
      innerWidth: 2400,
      innerHeight: 2600,
      maxPayload: 1_000_000,
      isCustom: true,
    };
    const started = performance.now();
    const solution = generateSolution([palletCarton({ quantity: 5000 }, 2)], big);
    const boxes = solution.containers.flatMap((c) => expandToBoxPlacements(c.placements));
    const edges = solution.containers.flatMap((c) =>
      c.placements.map((p) => buildBoxEdgePositions(boxInstancesRelativeToPallet(p, palletBoxPlacements(p)))),
    );
    const elapsed = performance.now() - started;

    expect(boxes).toHaveLength(5000);
    expect(solution.stats.boxCount).toBe(5000);
    // Mỗi pallet 32 thùng -> 157 pallet; mỗi pallet chỉ cần 1 mesh thùng + 1 mesh đế + 1 lưới viền.
    expect(solution.stats.palletCount).toBe(157);
    expect(edges.reduce((s, e) => s + e.length, 0)).toBe(5000 * 24 * 3);
    // Ngưỡng rất rộng, chỉ để bắt lỗi thuật toán chậm bất thường (không phải đo FPS thật).
    expect(elapsed).toBeLessThan(15_000);
  });
});
