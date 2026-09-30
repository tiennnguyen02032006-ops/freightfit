import { describe, expect, it } from 'vitest';
import { checkDeliveryOrder } from '../../../src/engine/constraints/deliveryOrder';
import { chooseBestStopOrder } from '../../../src/engine/optimization/routeProposal';
import { makePlacement } from '../../fixtures/placement';
import type { TripPlanStop, TripStopDistance } from '../../../src/domain/types';

function stop(stopId: string, order: number): TripPlanStop {
  return { stopId, order, name: stopId, etaMinutes: 0 };
}

describe('chooseBestStopOrder', () => {
  it('thứ tự ngắn nhất bị chắn -> chọn thứ tự dài hơn, ràng buộc cứng vẫn thoả (blockedCount=0)', () => {
    // 3 điểm giao, khoảng cách: 1-2=1, 2-3=1, 1-3=10 -> 2 thứ tự ngắn nhất (=2) là [1,2,3] và
    // [3,2,1], cả 2 đều bị chắn theo cách xếp dưới đây; thứ tự dài hơn (=11) như [2,1,3] mới thoả.
    const stops = [stop('stop-1', 0), stop('stop-2', 1), stop('stop-3', 2)];
    const distances: TripStopDistance[] = [
      { stopIdA: 'stop-1', stopIdB: 'stop-2', km: 1 },
      { stopIdA: 'stop-2', stopIdB: 'stop-3', km: 1 },
      { stopIdA: 'stop-1', stopIdB: 'stop-3', km: 10 },
    ];
    const placements = [
      makePlacement({ id: 'p-a', cargoTemplateId: 'sku-a', x: 400, y: 0, z: 0 }),
      makePlacement({ id: 'p-b1', cargoTemplateId: 'sku-b', x: 0, y: 0, z: 0 }),
      makePlacement({ id: 'p-b2', cargoTemplateId: 'sku-b', x: 0, y: 1000, z: 0 }),
      makePlacement({ id: 'p-c', cargoTemplateId: 'sku-c', x: 400, y: 1000, z: 0 }),
    ];
    const stopIdByCargoTemplateId = new Map([
      ['sku-a', 'stop-1'],
      ['sku-b', 'stop-2'],
      ['sku-c', 'stop-3'],
    ]);

    const result = chooseBestStopOrder({ placements, stopIdByCargoTemplateId, stops, distances });

    expect(result.feasible).toBe(true);
    if (!result.feasible) return;
    expect(result.shortestPossibleDistanceKm).toBe(2);
    expect(result.estimatedDistanceKm).toBeGreaterThan(result.shortestPossibleDistanceKm);
    expect(result.estimatedDistanceKm).toBe(11);

    const check = checkDeliveryOrder(placements, stopIdByCargoTemplateId, result.stopOrder);
    expect(check.blockedPlacementIds).toEqual([]);
  });

  it('không có thứ tự nào thoả hết (2 kiện chắn nhau theo cả 2 chiều) -> infeasible kèm lý do', () => {
    const stops = [stop('stop-1', 0), stop('stop-2', 1)];
    const distances: TripStopDistance[] = [{ stopIdA: 'stop-1', stopIdB: 'stop-2', km: 5 }];
    const placements = [
      makePlacement({ id: 'p1', cargoTemplateId: 'sku-x', x: 0, y: 0, z: 0 }),
      makePlacement({ id: 'p2', cargoTemplateId: 'sku-y', x: 400, y: 0, z: 0 }),
      makePlacement({ id: 'p3', cargoTemplateId: 'sku-y', x: 0, y: 1000, z: 0 }),
      makePlacement({ id: 'p4', cargoTemplateId: 'sku-x', x: 400, y: 1000, z: 0 }),
    ];
    const stopIdByCargoTemplateId = new Map([
      ['sku-x', 'stop-1'],
      ['sku-y', 'stop-2'],
    ]);

    const result = chooseBestStopOrder({ placements, stopIdByCargoTemplateId, stops, distances });

    expect(result.feasible).toBe(false);
    if (result.feasible) return;
    expect(result.reason.length).toBeGreaterThan(0);
  });

  it('phương án được chọn (khi khả thi) luôn không có kiện nào bị chắn', () => {
    const stops = [stop('stop-1', 0), stop('stop-2', 1)];
    const distances: TripStopDistance[] = [{ stopIdA: 'stop-1', stopIdB: 'stop-2', km: 3 }];
    const placements = [
      makePlacement({ id: 'p1', cargoTemplateId: 'sku-x', x: 0, y: 0, z: 0 }),
      makePlacement({ id: 'p2', cargoTemplateId: 'sku-y', x: 400, y: 0, z: 0 }),
    ];
    const stopIdByCargoTemplateId = new Map([
      ['sku-x', 'stop-1'],
      ['sku-y', 'stop-2'],
    ]);

    const result = chooseBestStopOrder({ placements, stopIdByCargoTemplateId, stops, distances });
    expect(result.feasible).toBe(true);
    if (!result.feasible) return;

    const check = checkDeliveryOrder(placements, stopIdByCargoTemplateId, result.stopOrder);
    expect(check.blockedPlacementIds).toEqual([]);
  });
});
