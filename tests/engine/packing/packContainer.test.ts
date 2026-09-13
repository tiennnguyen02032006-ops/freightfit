import { describe, expect, it } from 'vitest';
import { packContainer } from '../../../src/engine/packing/packContainer';
import { expandCargoQuantity } from '../../../src/engine/preprocessing/normalizeCargo';
import { sortCargo } from '../../../src/engine/preprocessing/sortCargo';
import { overlaps } from '../../../src/engine/constraints/collision';
import { fitsInsideContainer } from '../../../src/engine/packing/extremePoints';
import { PLACEMENT_SCORE_WEIGHTS } from '../../../src/engine/config';
import { makeCargoTemplate } from '../../fixtures/cargo';
import { smallTestContainer } from '../../fixtures/containers';

describe('packContainer (integration)', () => {
  it('pack cargo mẫu vào container mẫu: không overlap, tất cả trong bounds, unfit có lý do đúng', () => {
    const fittingItem = makeCargoTemplate({
      id: 'fitting-box',
      length: 500,
      width: 500,
      height: 200,
      weight: 20,
      quantity: 4,
      allowedOrientations: [[500, 500, 200]],
    });

    const oversizedItem = makeCargoTemplate({
      id: 'oversized-box',
      length: 3000,
      width: 500,
      height: 200,
      weight: 10,
      quantity: 1,
      allowedOrientations: [[3000, 500, 200]],
    });

    const sortedItems = expandCargoQuantity([fittingItem, oversizedItem]);

    const { container, unfit } = packContainer({
      containerTemplate: smallTestContainer,
      containerInstanceId: 'container-test',
      containerIndex: 0,
      sortedItems,
      weights: PLACEMENT_SCORE_WEIGHTS,
    });

    // Không có 2 placement nào overlap
    for (let i = 0; i < container.placements.length; i++) {
      for (let j = i + 1; j < container.placements.length; j++) {
        expect(overlaps(container.placements[i], container.placements[j])).toBe(false);
      }
    }

    // Tất cả placement nằm trong bounds container
    for (const placement of container.placements) {
      expect(fitsInsideContainer(placement, smallTestContainer)).toBe(true);
    }

    // 4 item vừa (fitting-box) phải được đặt hết
    const fittingPlacements = container.placements.filter((p) => p.cargoTemplateId === 'fitting-box');
    expect(fittingPlacements).toHaveLength(4);

    // Item quá khổ không thể xoay/đặt vừa container -> unfit với lý do ROTATION_CONFLICT
    expect(unfit).toEqual([
      { cargoInstanceId: 'oversized-box__0', cargoTemplateId: 'oversized-box', reason: 'ROTATION_CONFLICT' },
    ]);
  });

  it('cargo có clearance > 0 vẫn được đặt đúng, không overlap và trong bounds', () => {
    const itemWithClearance = makeCargoTemplate({
      id: 'clearance-box',
      length: 300,
      width: 200,
      height: 100,
      weight: 5,
      quantity: 2,
      allowedOrientations: [[300, 200, 100]],
      clearance: { left: 10, right: 10, front: 10, back: 10, top: 0, bottom: 0 },
    });

    const sortedItems = expandCargoQuantity([itemWithClearance]);

    const { container, unfit } = packContainer({
      containerTemplate: smallTestContainer,
      containerInstanceId: 'container-test-clearance',
      containerIndex: 0,
      sortedItems,
      weights: PLACEMENT_SCORE_WEIGHTS,
    });

    expect(unfit).toHaveLength(0);
    expect(container.placements).toHaveLength(2);

    for (let i = 0; i < container.placements.length; i++) {
      for (let j = i + 1; j < container.placements.length; j++) {
        expect(overlaps(container.placements[i], container.placements[j])).toBe(false);
      }
    }
    for (const placement of container.placements) {
      expect(fitsInsideContainer(placement, smallTestContainer)).toBe(true);
      // Kích thước thật lưu trong Placement không bao gồm clearance
      expect(placement.length).toBe(300);
      expect(placement.width).toBe(200);
    }
  });

  it('hàng không lấp đầy hết chiều dài container phải ép sát vách trước (x+length = innerLength), không để hở đầu đó', () => {
    // Container dài 2000mm, chỉ đủ hàng dài 500mm -> chắc chắn còn khoảng trống theo trục x.
    // Khoảng trống đó phải nằm ở phía CỬA (x nhỏ), không phải phía vách trước (x lớn).
    const item = makeCargoTemplate({
      id: 'single-box',
      length: 500,
      width: 500,
      height: 200,
      weight: 20,
      quantity: 1,
      allowedOrientations: [[500, 500, 200]],
    });

    const sortedItems = expandCargoQuantity([item]);

    const { container, unfit } = packContainer({
      containerTemplate: smallTestContainer,
      containerInstanceId: 'container-test-front-wall',
      containerIndex: 0,
      sortedItems,
      weights: PLACEMENT_SCORE_WEIGHTS,
    });

    expect(unfit).toHaveLength(0);
    expect(container.placements).toHaveLength(1);
    const [placement] = container.placements;
    // Ép sát vách trước: mặt xa của box phải chạm đúng đầu container (innerLength), không phải
    // đứng sát x=0 (cửa) để hở khoảng trống ở đầu vách trước như bug cũ.
    expect(placement.x + placement.length).toBe(smallTestContainer.innerLength);
  });

  it('hàng dễ vỡ không bị đè: item khác không được xếp lên trên hàng fragile dù đó là chỗ trống duy nhất', () => {
    // Hàng fragile phủ kín toàn bộ đáy container (2000x1000) -> chỗ trống duy nhất còn lại cho
    // item tiếp theo là XẾP LÊN TRÊN nó. Vì fragile=true, respectsStacking phải chặn -> item đó
    // phải rơi vào unfit, KHÔNG được đặt đè lên trên.
    const fragileFloor = makeCargoTemplate({
      id: 'fragile-floor',
      length: 2000,
      width: 1000,
      height: 400,
      weight: 50,
      fragile: true,
      quantity: 1,
      allowedOrientations: [[2000, 1000, 400]],
    });
    const wouldStackOnTop = makeCargoTemplate({
      id: 'would-stack-on-fragile',
      length: 2000,
      width: 1000,
      height: 200,
      weight: 10,
      quantity: 1,
      allowedOrientations: [[2000, 1000, 200]],
    });

    const sortedItems = expandCargoQuantity([fragileFloor, wouldStackOnTop]);

    const { container, unfit } = packContainer({
      containerTemplate: smallTestContainer,
      containerInstanceId: 'container-test-fragile',
      containerIndex: 0,
      sortedItems,
      weights: PLACEMENT_SCORE_WEIGHTS,
    });

    expect(container.placements.map((p) => p.cargoTemplateId)).toEqual(['fragile-floor']);
    expect(container.placements.some((p) => p.cargoTemplateId === 'would-stack-on-fragile')).toBe(false);
    expect(unfit.map((u) => u.cargoTemplateId)).toEqual(['would-stack-on-fragile']);
  });

  it('không vượt trọng lượng tối đa container: hàng vượt payload bị đánh dấu unfit (OVERWEIGHT) thay vì cố nhét vào', () => {
    // smallTestContainer.maxPayload = 500kg. 3 kiện x 300kg = 900kg > 500kg -> chỉ 1 kiện vừa.
    const heavyItem = makeCargoTemplate({
      id: 'heavy-item',
      length: 200,
      width: 200,
      height: 200,
      weight: 300,
      quantity: 3,
      allowedOrientations: [[200, 200, 200]],
    });

    const sortedItems = expandCargoQuantity([heavyItem]);

    const { container, unfit } = packContainer({
      containerTemplate: smallTestContainer,
      containerInstanceId: 'container-test-overweight',
      containerIndex: 0,
      sortedItems,
      weights: PLACEMENT_SCORE_WEIGHTS,
    });

    expect(container.totalWeight).toBeLessThanOrEqual(smallTestContainer.maxPayload);
    expect(container.placements).toHaveLength(1);
    expect(unfit).toHaveLength(2);
    expect(unfit.every((u) => u.reason === 'OVERWEIGHT')).toBe(true);
  });

  it('xếp theo kiểu shelf (lớp phẳng): các kiện cùng kích thước lấp đầy hết bề rộng tại một vị trí chiều dài trước khi tiến sâu hơn, tất cả cùng 1 lớp (z bằng nhau)', () => {
    // smallTestContainer rộng 1000mm -> vừa đúng 2 kiện 500mm cạnh nhau theo chiều rộng.
    // 4 kiện cùng kích thước -> phải tạo 2 "hàng ngang" (mỗi hàng 2 kiện lấp đầy hết bề rộng),
    // không phải rải rác/lởm chởm theo nhiều độ cao hay bỏ dở 1 hàng để nhảy sang hàng khác.
    const box = makeCargoTemplate({
      id: 'shelf-box',
      length: 500,
      width: 500,
      height: 200,
      weight: 5,
      quantity: 4,
      allowedOrientations: [[500, 500, 200]],
    });

    const sortedItems = sortCargo(expandCargoQuantity([box]));

    const { container, unfit } = packContainer({
      containerTemplate: smallTestContainer,
      containerInstanceId: 'container-test-shelf',
      containerIndex: 0,
      sortedItems,
      weights: PLACEMENT_SCORE_WEIGHTS,
    });

    expect(unfit).toHaveLength(0);
    expect(container.placements).toHaveLength(4);

    // Tất cả nằm cùng 1 lớp (z giống nhau) — không lởm chởm nhiều độ cao.
    const zs = new Set(container.placements.map((p) => p.z));
    expect(zs.size).toBe(1);

    // Mỗi vị trí x (chiều dài) được dùng phải có ĐỦ 2 kiện lấp đầy hết bề rộng container
    // (2 x 500mm = 1000mm) trước khi thuật toán dùng tới 1 vị trí x khác.
    const countByX = new Map<number, number>();
    for (const p of container.placements) {
      countByX.set(p.x, (countByX.get(p.x) ?? 0) + 1);
    }
    expect(countByX.size).toBe(2);
    for (const count of countByX.values()) {
      expect(count).toBe(2);
    }
  });
});
