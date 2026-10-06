import { describe, expect, it } from 'vitest';
import { applyPastedDistanceTable, getDistance, parseKm, setDistance } from '../../src/utils/tripDistances';
import type { TripPlanStop, TripStopDistance } from '../../src/domain/types';

const stops: TripPlanStop[] = [
  { stopId: 's1', order: 0, name: 'Hà Nội' },
  { stopId: 's2', order: 1, name: 'Huế' },
  { stopId: 's3', order: 2, name: 'Đà Nẵng' },
];

describe('parseKm / getDistance / setDistance', () => {
  it('parseKm: số, dấu phẩy thập phân, rỗng/chữ/âm -> null', () => {
    expect(parseKm('12.5')).toBe(12.5);
    expect(parseKm(' 12,5 ')).toBe(12.5);
    expect(parseKm('')).toBeNull();
    expect(parseKm('abc')).toBeNull();
    expect(parseKm('-3')).toBeNull();
  });

  it('setDistance đối xứng và null xoá cặp (để trống)', () => {
    let d: TripStopDistance[] = setDistance([], 's1', 's2', 5);
    expect(getDistance(d, 's2', 's1')).toBe(5);
    d = setDistance(d, 's2', 's1', 7);
    expect(d).toHaveLength(1);
    expect(getDistance(d, 's1', 's2')).toBe(7);
    d = setDistance(d, 's1', 's2', null);
    expect(getDistance(d, 's1', 's2')).toBeNull();
  });
});

describe('applyPastedDistanceTable', () => {
  it('có tiêu đề tên điểm: đặt theo tên, ô trống của tam giác đối xứng không xoá số đã có', () => {
    const text = ['\tHà Nội\tHuế\tĐà Nẵng', 'Hà Nội\t\t660\t760', 'Huế\t\t\t100', 'Đà Nẵng\t\t\t'].join('\n');
    const result = applyPastedDistanceTable(stops, [], text);
    expect(getDistance(result, 's1', 's2')).toBe(660);
    expect(getDistance(result, 's1', 's3')).toBe(760);
    expect(getDistance(result, 's2', 's3')).toBe(100);
  });

  it('không có tiêu đề: bắt đầu từ ô đang chọn; ô trống xoá cặp đã biết, ô chữ bị bỏ qua', () => {
    const existing = setDistance(setDistance([], 's2', 's3', 50), 's1', 's2', 9);
    const result = applyPastedDistanceTable(stops, existing, '10\t\n\t20x', 1, 1);
    // hàng 1 (Huế): cột 1 (đường chéo) bỏ qua, cột 2 (Đà Nẵng) trống -> xoá; hàng 2: cột 1 trống -> xoá.
    expect(getDistance(result, 's2', 's3')).toBeNull();
    expect(getDistance(result, 's1', 's2')).toBe(9);
  });

  it('bỏ qua ô ngoài phạm vi số điểm giao', () => {
    const result = applyPastedDistanceTable(stops, [], '1\t2\t3\t4\t5', 0, 0);
    expect(getDistance(result, 's1', 's2')).toBe(2);
    expect(getDistance(result, 's1', 's3')).toBe(3);
    expect(result).toHaveLength(2);
  });
});
