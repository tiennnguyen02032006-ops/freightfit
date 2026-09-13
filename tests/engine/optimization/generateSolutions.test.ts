import { describe, expect, it } from 'vitest';
import { generateSolution } from '../../../src/engine/optimization/generateSolutions';
import { overlaps } from '../../../src/engine/constraints/collision';
import { fitsInsideContainer } from '../../../src/engine/packing/extremePoints';
import { makeCargoTemplate } from '../../fixtures/cargo';
import { smallTestContainer } from '../../fixtures/containers';

describe('generateSolution', () => {
  const bigLightItem = makeCargoTemplate({
    id: 'big-light',
    length: 1000,
    width: 500,
    height: 200,
    weight: 5,
    quantity: 1,
    allowedOrientations: [[1000, 500, 200]],
  });

  const smallHeavyItem = makeCargoTemplate({
    id: 'small-heavy',
    length: 200,
    width: 200,
    height: 200,
    weight: 100,
    quantity: 1,
    allowedOrientations: [[200, 200, 200]],
  });

  const solution = generateSolution([bigLightItem, smallHeavyItem], smallTestContainer);

  it('sinh đúng 1 solution (đã bỏ khái niệm nhiều strategy), chỉ có 1 container', () => {
    expect(solution.containers).toHaveLength(1);
  });

  it('không overlap và mọi placement nằm trong bounds container', () => {
    const placements = solution.containers[0].placements;
    for (let i = 0; i < placements.length; i++) {
      for (let j = i + 1; j < placements.length; j++) {
        expect(overlaps(placements[i], placements[j])).toBe(false);
      }
    }
    for (const p of placements) {
      expect(fitsInsideContainer(p, smallTestContainer)).toBe(true);
    }
  });

  it('xếp hàng thể tích LỚN HƠN trước (bin packing cổ điển)', () => {
    // sortCargo: thể tích giảm dần quyết định thứ tự xử lý (xem sortCargo.test.ts).
    const first = solution.containers[0].placements[0]?.cargoTemplateId;
    expect(first).toBe('big-light');
  });

  describe('hàng hóa vượt quá 1 container', () => {
    // Mỗi kiện 1000x500x1000mm (đúng bằng nửa chiều dài + nửa chiều rộng + toàn bộ chiều cao
    // smallTestContainer 2000x1000x1000) -> vừa khít lưới 2x2 = 4 kiện/container, không dư thể
    // tích cũng không cần xếp chồng (height khớp 100% nên chỉ 1 lớp). Đặt số lượng 10 -> phải cần
    // đúng 3 container (4 + 4 + 2) để xếp hết, không còn kiện nào unfit.
    const overflowItem = makeCargoTemplate({
      id: 'overflow-item',
      length: 1000,
      width: 500,
      height: 1000,
      weight: 10, // nhẹ, không chạm giới hạn maxPayload=500kg (10 kiện x 10kg = 100kg) -> chỉ bị
      // giới hạn bởi KHÔNG GIAN, đúng trọng tâm của tính năng "tự tính số container cần dùng".
      quantity: 10,
      allowedOrientations: [[1000, 500, 1000]],
    });

    const overflowSolution = generateSolution([overflowItem], smallTestContainer);

    it('tự tạo đủ số container cần thiết để xếp hết toàn bộ hàng hóa', () => {
      expect(overflowSolution.containers).toHaveLength(3);
      expect(overflowSolution.containers.map((c) => c.placements.length)).toEqual([4, 4, 2]);
      expect(overflowSolution.unfitCargo).toHaveLength(0);
    });

    it('vehiclePlan/stats phản ánh đúng số container đã tạo', () => {
      expect(overflowSolution.vehiclePlan.items).toEqual([
        { containerTemplateId: smallTestContainer.id, quantity: 3 },
      ]);
      expect(overflowSolution.vehiclePlan.feasible).toBe(true);
      expect(overflowSolution.stats.containerCount).toBe(3);
    });

    it('mỗi container có id/index riêng, không trùng lặp, và tất cả kiện hàng đều được xếp đúng 1 lần', () => {
      expect(overflowSolution.containers.map((c) => c.id)).toEqual(['container-1', 'container-2', 'container-3']);
      expect(overflowSolution.containers.map((c) => c.index)).toEqual([0, 1, 2]);
      const allCargoInstanceIds = overflowSolution.containers.flatMap((c) => c.placements.map((p) => p.cargoInstanceId));
      expect(new Set(allCargoInstanceIds).size).toBe(10);
    });

    it('không overlap và mọi placement nằm trong bounds RIÊNG của từng container', () => {
      for (const container of overflowSolution.containers) {
        for (let i = 0; i < container.placements.length; i++) {
          for (let j = i + 1; j < container.placements.length; j++) {
            expect(overlaps(container.placements[i], container.placements[j])).toBe(false);
          }
        }
        for (const p of container.placements) {
          expect(fitsInsideContainer(p, smallTestContainer)).toBe(true);
        }
      }
    });

    it('cgWarnings gắn đúng containerInstanceId của từng container (không lẫn lộn)', () => {
      const containerIds = new Set(overflowSolution.containers.map((c) => c.id));
      for (const warning of overflowSolution.cgWarnings) {
        expect(containerIds.has(warning.containerInstanceId)).toBe(true);
      }
    });
  });

  it('không có hàng nào cả -> vẫn trả về đúng 1 container trống (không phải 0)', () => {
    const emptySolution = generateSolution([], smallTestContainer);
    expect(emptySolution.containers).toHaveLength(1);
    expect(emptySolution.containers[0].placements).toHaveLength(0);
    expect(emptySolution.unfitCargo).toHaveLength(0);
  });

  it('hàng hóa quá khổ (không xoay nào vừa container) -> không tạo thêm container trống vô ích, dồn hết vào unfitCargo', () => {
    const oversizedItem = makeCargoTemplate({
      id: 'way-too-big',
      length: 5000,
      width: 500,
      height: 200,
      weight: 5,
      quantity: 3,
      allowedOrientations: [[5000, 500, 200]],
    });
    const oversizedSolution = generateSolution([oversizedItem], smallTestContainer);
    // Vẫn giữ đúng 1 container (trống) để UI có chỗ hiển thị, không lặp tạo thêm container nào
    // khác vì kiện nào cũng sẽ thất bại giống hệt (quá khổ so với container).
    expect(oversizedSolution.containers).toHaveLength(1);
    expect(oversizedSolution.containers[0].placements).toHaveLength(0);
    expect(oversizedSolution.unfitCargo).toHaveLength(3);
    // Không orientation nào của kiện này vừa BOUNDS container (5000mm > innerLength 2000mm) ->
    // determineUnfitReason() xếp vào 'ROTATION_CONFLICT' (xem engine/packing/unfitReason.ts).
    expect(oversizedSolution.unfitCargo.every((u) => u.reason === 'ROTATION_CONFLICT')).toBe(true);
  });
});
