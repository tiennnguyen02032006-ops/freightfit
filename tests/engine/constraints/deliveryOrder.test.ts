import { describe, expect, it } from 'vitest';
import { checkDeliveryOrder, findBlockingPairs } from '../../../src/engine/constraints/deliveryOrder';
import { makePlacement } from '../../fixtures/placement';

describe('findBlockingPairs', () => {
  it('2 box cùng hành lang y/z, khác x -> box gần cửa (x nhỏ) là blocker của box xa hơn', () => {
    const near = makePlacement({ id: 'near', x: 0, y: 0, z: 0 });
    const far = makePlacement({ id: 'far', x: 400, y: 0, z: 0 });
    expect(findBlockingPairs([near, far])).toEqual([{ blockerId: 'near', blockedId: 'far' }]);
  });

  it('2 box khác hành lang (không chồng y/z) -> không cản nhau', () => {
    const a = makePlacement({ id: 'a', x: 0, y: 0, z: 0 });
    const b = makePlacement({ id: 'b', x: 400, y: 1000, z: 0 });
    expect(findBlockingPairs([a, b])).toEqual([]);
  });
});

describe('checkDeliveryOrder', () => {
  it('hợp lệ: kiện giao trước nằm gần cửa hơn kiện giao sau -> không kiện nào bị chắn', () => {
    // stop-1 giao trước (order 0), stop-2 giao sau (order 1) -> hàng của stop-1 phải gần cửa hơn.
    const nearItem = makePlacement({ id: 'p-near', cargoTemplateId: 'sku-a', x: 0, y: 0, z: 0 });
    const farItem = makePlacement({ id: 'p-far', cargoTemplateId: 'sku-b', x: 400, y: 0, z: 0 });
    const stopByTemplate = new Map([
      ['sku-a', 'stop-1'],
      ['sku-b', 'stop-2'],
    ]);

    const result = checkDeliveryOrder([nearItem, farItem], stopByTemplate, ['stop-1', 'stop-2']);
    expect(result.blockedPlacementIds).toEqual([]);
  });

  it('vi phạm: kiện giao trước bị xếp sâu hơn (xa cửa) kiện giao sau -> bị chắn', () => {
    // sku-a (gán stop-1, giao trước) lại nằm SÂU HƠN sku-b (gán stop-2, giao sau) -> khi cần giao
    // stop-1 thì kiện của stop-2 vẫn đang chắn đường ra cửa.
    const earlyStopItem = makePlacement({ id: 'p-early', cargoTemplateId: 'sku-a', x: 400, y: 0, z: 0 });
    const laterStopItem = makePlacement({ id: 'p-later', cargoTemplateId: 'sku-b', x: 0, y: 0, z: 0 });
    const stopByTemplate = new Map([
      ['sku-a', 'stop-1'],
      ['sku-b', 'stop-2'],
    ]);

    const result = checkDeliveryOrder([earlyStopItem, laterStopItem], stopByTemplate, ['stop-1', 'stop-2']);
    expect(result.blockedPlacementIds).toEqual(['p-early']);
  });
});
