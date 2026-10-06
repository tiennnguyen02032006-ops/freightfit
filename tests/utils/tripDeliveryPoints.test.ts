import { describe, expect, it } from 'vitest';
import { appendStops, defaultStopName, parseStopNames, reconcileTripWithCargo } from '../../src/utils/tripDeliveryPoints';
import type { TripPlanRecord } from '../../src/domain/types';

function emptyPlan(overrides: Partial<TripPlanRecord> = {}): TripPlanRecord {
  return { tripId: 't1', name: 'Chuyến', createdAt: 0, stops: [], cargo: [], ...overrides };
}

function idGen() {
  let n = 0;
  return () => `stop-${++n}`;
}

describe('reconcileTripWithCargo', () => {
  it('tạo điểm giao theo thứ tự xuất hiện và gán từng nhóm đúng điểm', () => {
    const result = reconcileTripWithCargo(
      emptyPlan(),
      [
        { cargoTemplateId: 'a', instanceIds: ['a-1', 'a-2'], deliveryPoint: 'Hà Nội' },
        { cargoTemplateId: 'b', instanceIds: ['b-1'], deliveryPoint: 'Huế' },
        { cargoTemplateId: 'c', instanceIds: ['c-1'], deliveryPoint: ' hà nội ' },
      ],
      idGen(),
    );
    expect(result?.stops.map((s) => s.name)).toEqual(['Hà Nội', 'Huế']);
    expect(result?.stops.map((s) => s.order)).toEqual([0, 1]);
    const stopOf = (id: string) => result?.cargo.find((c) => c.cargoInstanceId === id)?.stopId;
    expect(stopOf('a-1')).toBe('stop-1');
    expect(stopOf('a-2')).toBe('stop-1');
    expect(stopOf('b-1')).toBe('stop-2');
    expect(stopOf('c-1')).toBe('stop-1');
  });

  it('idempotent: chạy lại trên kết quả cũ trả về null', () => {
    const groups = [{ cargoTemplateId: 'a', instanceIds: ['a-1'], deliveryPoint: 'Hà Nội' }];
    const first = reconcileTripWithCargo(emptyPlan(), groups, idGen());
    expect(first).not.toBeNull();
    expect(reconcileTripWithCargo(first!, groups, idGen())).toBeNull();
  });

  it('nhóm không có điểm giao: gán điểm đầu tiên nếu chưa gán, giữ nguyên nếu đã gán tay', () => {
    const plan = emptyPlan({
      stops: [
        { stopId: 's1', order: 0, name: 'A', etaMinutes: 0 },
        { stopId: 's2', order: 1, name: 'B', etaMinutes: 0 },
      ],
      cargo: [{ cargoInstanceId: 'y-1', cargoTemplateId: 'y', stopId: 's2' }],
    });
    const result = reconcileTripWithCargo(
      plan,
      [
        { cargoTemplateId: 'x', instanceIds: ['x-1'] },
        { cargoTemplateId: 'y', instanceIds: ['y-1'] },
      ],
      idGen(),
    );
    expect(result?.cargo.find((c) => c.cargoInstanceId === 'x-1')?.stopId).toBe('s1');
    expect(result?.cargo.find((c) => c.cargoInstanceId === 'y-1')?.stopId).toBe('s2');
  });

  it('điểm giao trong file ghi đè gán tay cũ của nhóm đó', () => {
    const plan = emptyPlan({
      stops: [
        { stopId: 's1', order: 0, name: 'A', etaMinutes: 0 },
        { stopId: 's2', order: 1, name: 'B', etaMinutes: 0 },
      ],
      cargo: [{ cargoInstanceId: 'x-1', cargoTemplateId: 'x', stopId: 's1' }],
    });
    const result = reconcileTripWithCargo(plan, [{ cargoTemplateId: 'x', instanceIds: ['x-1'], deliveryPoint: 'B' }], idGen());
    expect(result?.stops).toHaveLength(2);
    expect(result?.cargo[0].stopId).toBe('s2');
  });

  it('không có điểm giao nào và chuyến chưa có stop: không đổi gì', () => {
    expect(reconcileTripWithCargo(emptyPlan(), [{ cargoTemplateId: 'x', instanceIds: ['x-1'] }], idGen())).toBeNull();
  });
});

describe('parseStopNames / defaultStopName / appendStops', () => {
  it('parseStopNames: mỗi dòng 1 điểm, bỏ dòng trống và tên trùng', () => {
    expect(parseStopNames('Hà Nội\r\n\n  Huế \nhà nội\nĐà Nẵng')).toEqual(['Hà Nội', 'Huế', 'Đà Nẵng']);
  });

  it('defaultStopName: "Điểm N" và tránh trùng tên đã có', () => {
    expect(defaultStopName([])).toBe('Điểm 1');
    expect(defaultStopName(['Điểm 2'])).toBe('Điểm 3');
  });

  it('appendStops: tên rỗng lấy tên mặc định, tên trùng bị bỏ qua, order nối tiếp', () => {
    const existing = [{ stopId: 's1', order: 0, name: 'Hà Nội', etaMinutes: 0 }];
    const result = appendStops(existing, ['huế', '', 'HÀ NỘI', ''], idGen());
    expect(result.map((s) => s.name)).toEqual(['Hà Nội', 'huế', 'Điểm 3', 'Điểm 4']);
    expect(result.map((s) => s.order)).toEqual([0, 1, 2, 3]);
  });
});
