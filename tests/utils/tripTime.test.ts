import { describe, expect, it } from 'vitest';
import { clockToMinutesAfterDeparture, parseClock, recomputeStopEtas } from '../../src/utils/tripTime';

describe('parseClock', () => {
  it('đọc HH:MM hợp lệ, từ chối rỗng/sai định dạng/ngoài khoảng', () => {
    expect(parseClock('08:30')).toBe(510);
    expect(parseClock('8:05')).toBe(485);
    expect(parseClock('')).toBeNull();
    expect(parseClock(undefined)).toBeNull();
    expect(parseClock('25:00')).toBeNull();
    expect(parseClock('abc')).toBeNull();
  });
});

describe('clockToMinutesAfterDeparture', () => {
  it('quy đổi sang phút sau khi xuất phát', () => {
    expect(clockToMinutesAfterDeparture('08:30', '06:00')).toBe(150);
    expect(clockToMinutesAfterDeparture('06:00', '06:00')).toBe(0);
  });

  it('giờ đến sớm hơn giờ xuất phát -> sang ngày hôm sau', () => {
    expect(clockToMinutesAfterDeparture('01:00', '23:00')).toBe(120);
  });

  it('để trống giờ đến hoặc chưa có giờ xuất phát -> undefined', () => {
    expect(clockToMinutesAfterDeparture('', '06:00')).toBeUndefined();
    expect(clockToMinutesAfterDeparture('08:30', '')).toBeUndefined();
    expect(clockToMinutesAfterDeparture('08:30', undefined)).toBeUndefined();
  });
});

describe('recomputeStopEtas', () => {
  it('tính lại theo giờ xuất phát mới, bỏ qua điểm chưa có giờ đến', () => {
    const stops = [
      { stopId: 'a', order: 0, name: 'A', etaClock: '09:00', etaMinutes: 180 },
      { stopId: 'b', order: 1, name: 'B' },
    ];
    const result = recomputeStopEtas(stops, '08:00');
    expect(result[0].etaMinutes).toBe(60);
    expect(result[1]).toEqual(stops[1]);
  });
});
