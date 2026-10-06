import type { TripPlanStop } from '../domain/types';

const MINUTES_PER_DAY = 24 * 60;

/** "08:30" -> 510 phút kể từ 00:00; chuỗi rỗng/sai định dạng -> null. */
export function parseClock(value: string | undefined): number | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Quy đổi giờ đến (giờ đồng hồ, vd "08:30") sang số phút SAU KHI XUẤT PHÁT — cùng mốc t=0 với
 * TripPlanStop.etaMinutes/Black Box. Giờ đến sớm hơn giờ xuất phát coi là sang ngày hôm sau
 * (cộng 24h). Trả về undefined nếu để trống giờ đến, hoặc chưa có/sai giờ xuất phát.
 */
export function clockToMinutesAfterDeparture(
  arrivalClock: string | undefined,
  departureClock: string | undefined,
): number | undefined {
  const arrival = parseClock(arrivalClock);
  const departure = parseClock(departureClock);
  if (arrival === null || departure === null) return undefined;
  return (arrival - departure + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

/** Tính lại etaMinutes của mọi điểm giao từ etaClock + giờ xuất phát (dùng khi giờ xuất phát đổi). */
export function recomputeStopEtas(stops: TripPlanStop[], departureClock: string | undefined): TripPlanStop[] {
  return stops.map((s) =>
    s.etaClock === undefined ? s : { ...s, etaMinutes: clockToMinutesAfterDeparture(s.etaClock, departureClock) },
  );
}
