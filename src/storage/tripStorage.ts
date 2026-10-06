import type {
  StoredTripEntry,
  StoredTrips,
  TripActualRecord,
  TripActualStopResult,
  TripPlanCargoRef,
  TripPlanRecord,
  TripPlanStop,
  TripRouteProposal,
  TripRouteResult,
  TripStopDistance,
} from '../domain/types';

/**
 * Lưu "kế hoạch chuyến" (từ lúc xếp hàng 3D) + dữ liệu thực tế nhập cho Black Box vào
 * localStorage — NGOẠI LỆ persistence DUY NHẤT được phép trong app (xem CLAUDE.md), giới hạn
 * ĐÚNG 1 khóa `TRIP_STORAGE_KEY` này, KHÔNG dùng localStorage/IndexedDB ở bất kỳ module nào khác
 * trong dự án. Module này THUẦN TypeScript — không import React/Three/store — chỉ đọc/ghi 1 khóa
 * JSON, để dùng được từ component lẫn test mà không kéo theo phụ thuộc UI.
 *
 * Mọi hàm đọc/ghi đều bọc try/catch và trả về `StorageResult<T>` thay vì ném lỗi ra ngoài — trình
 * duyệt có thể chặn localStorage (chế độ ẩn danh nghiêm ngặt, cài đặt riêng tư) hoặc hết dung
 * lượng (QuotaExceededError khi setItem) bất cứ lúc nào, không được để những lỗi đó làm app crash.
 *
 * Khi ĐỌC: dữ liệu phải đúng cấu trúc StoredTrips (bao gồm đúng `version: 1`) mới được dùng — dữ
 * liệu hỏng (JSON lỗi) hoặc sai kiểu (thiếu field, sai version) đều bị BỎ QUA (không dùng liều
 * lĩnh một phần dữ liệu không rõ hợp lệ hay không) và báo lỗi tiếng Việt qua `error`.
 */

export const TRIP_STORAGE_KEY = 'freightfit:trips:v1';

export type StorageResult<T> = { ok: true; data: T } | { ok: false; error: string };

const EMPTY_TRIPS: StoredTrips = { version: 1, trips: [] };

function isTripPlanStop(v: unknown): v is TripPlanStop {
  if (!v || typeof v !== 'object') return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.stopId === 'string' &&
    typeof s.order === 'number' &&
    typeof s.name === 'string' &&
    (s.etaMinutes === undefined || typeof s.etaMinutes === 'number') &&
    (s.etaClock === undefined || typeof s.etaClock === 'string')
  );
}

function isTripPlanCargoRef(v: unknown): v is TripPlanCargoRef {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  return (
    typeof c.cargoInstanceId === 'string' &&
    typeof c.cargoTemplateId === 'string' &&
    typeof c.stopId === 'string'
  );
}

function isTripStopDistance(v: unknown): v is TripStopDistance {
  if (!v || typeof v !== 'object') return false;
  const d = v as Record<string, unknown>;
  return typeof d.stopIdA === 'string' && typeof d.stopIdB === 'string' && typeof d.km === 'number';
}

function isTripPlanRecord(v: unknown): v is TripPlanRecord {
  if (!v || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.tripId === 'string' &&
    typeof p.name === 'string' &&
    typeof p.createdAt === 'number' &&
    (p.departureTime === undefined || typeof p.departureTime === 'string') &&
    Array.isArray(p.stops) &&
    p.stops.every(isTripPlanStop) &&
    Array.isArray(p.cargo) &&
    p.cargo.every(isTripPlanCargoRef) &&
    // distances là field optional (thêm sau, xem Giai đoạn C) — chuyến lưu TRƯỚC khi có tính năng
    // này sẽ không có field này, phải chấp nhận thiếu/undefined để không bị coi là dữ liệu hỏng.
    (p.distances === undefined || (Array.isArray(p.distances) && p.distances.every(isTripStopDistance)))
  );
}

function isTripRouteProposal(v: unknown): v is TripRouteProposal {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.containerTemplateId === 'string' &&
    Array.isArray(r.stopOrder) &&
    r.stopOrder.every((s) => typeof s === 'string') &&
    typeof r.estimatedDistanceKm === 'number' &&
    typeof r.shortestPossibleDistanceKm === 'number' &&
    typeof r.fillRatioPercent === 'number' &&
    (r.unknownLegCount === undefined || typeof r.unknownLegCount === 'number') &&
    typeof r.blockedCount === 'number' &&
    typeof r.usedHeuristic === 'boolean' &&
    typeof r.generatedAt === 'number'
  );
}

function isTripRouteResult(v: unknown): v is TripRouteResult {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  if (r.feasible === true) return isTripRouteProposal(r.proposal);
  if (r.feasible === false) return typeof r.reason === 'string' && typeof r.suggestion === 'string';
  return false;
}

function isTripActualStopResult(v: unknown): v is TripActualStopResult {
  if (!v || typeof v !== 'object') return false;
  const s = v as Record<string, unknown>;
  return typeof s.stopId === 'string' && typeof s.deliveredCount === 'number';
}

function isTripActualRecord(v: unknown): v is TripActualRecord {
  if (!v || typeof v !== 'object') return false;
  const a = v as Record<string, unknown>;
  return (
    typeof a.tripId === 'string' &&
    typeof a.actualArrivalMinutes === 'number' &&
    Array.isArray(a.stops) &&
    a.stops.every(isTripActualStopResult)
  );
}

function isStoredTripEntry(v: unknown): v is StoredTripEntry {
  if (!v || typeof v !== 'object') return false;
  const e = v as Record<string, unknown>;
  return (
    isTripPlanRecord(e.plan) &&
    (e.actual === null || isTripActualRecord(e.actual)) &&
    // route là field optional (thêm sau, xem Giai đoạn C) — chuyến lưu trước đó không có field
    // này, phải chấp nhận thiếu/undefined/null để không bị coi là dữ liệu hỏng.
    (e.route === undefined || e.route === null || isTripRouteResult(e.route))
  );
}

function isStoredTrips(v: unknown): v is StoredTrips {
  if (!v || typeof v !== 'object') return false;
  const t = v as Record<string, unknown>;
  return t.version === 1 && Array.isArray(t.trips) && t.trips.every(isStoredTripEntry);
}

function readRaw(): StorageResult<string | null> {
  try {
    return { ok: true, data: localStorage.getItem(TRIP_STORAGE_KEY) };
  } catch {
    return {
      ok: false,
      error: 'Không đọc được dữ liệu chuyến đã lưu (trình duyệt có thể đang chặn localStorage).',
    };
  }
}

function writeRaw(json: string): StorageResult<void> {
  try {
    localStorage.setItem(TRIP_STORAGE_KEY, json);
    return { ok: true, data: undefined };
  } catch {
    return {
      ok: false,
      error: 'Không lưu được dữ liệu chuyến (bộ nhớ trình duyệt có thể đã đầy hoặc bị chặn).',
    };
  }
}

/** Đọc toàn bộ dữ liệu chuyến đã lưu — chưa từng lưu gì (chưa có key) trả về danh sách rỗng hợp lệ. */
export function loadTrips(): StorageResult<StoredTrips> {
  const raw = readRaw();
  if (!raw.ok) return raw;
  if (raw.data === null) return { ok: true, data: EMPTY_TRIPS };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.data);
  } catch {
    return { ok: false, error: 'Dữ liệu chuyến đã lưu bị hỏng (không đọc được định dạng JSON), đã bỏ qua.' };
  }
  if (!isStoredTrips(parsed)) {
    return { ok: false, error: 'Dữ liệu chuyến đã lưu sai định dạng hoặc không đúng phiên bản, đã bỏ qua.' };
  }
  return { ok: true, data: parsed };
}

function persist(next: StoredTrips): StorageResult<StoredTrips> {
  let json: string;
  try {
    json = JSON.stringify(next);
  } catch {
    return { ok: false, error: 'Không chuyển được dữ liệu chuyến sang định dạng lưu trữ.' };
  }
  const written = writeRaw(json);
  if (!written.ok) return written;
  return { ok: true, data: next };
}

/** Lưu 1 chuyến — thêm mới, hoặc GHI ĐÈ nếu đã có chuyến cùng tripId (upsert theo tripId). */
export function saveTrip(entry: StoredTripEntry): StorageResult<StoredTrips> {
  const current = loadTrips();
  const base = current.ok ? current.data : EMPTY_TRIPS;
  const withoutSame = base.trips.filter((t) => t.plan.tripId !== entry.plan.tripId);
  return persist({ version: 1, trips: [...withoutSame, entry] });
}

/** Xóa 1 chuyến theo tripId — không lỗi nếu tripId không tồn tại (coi như đã xóa). */
export function deleteTrip(tripId: string): StorageResult<StoredTrips> {
  const current = loadTrips();
  const base = current.ok ? current.data : EMPTY_TRIPS;
  return persist({ version: 1, trips: base.trips.filter((t) => t.plan.tripId !== tripId) });
}

/** Xuất toàn bộ dữ liệu chuyến hiện có thành chuỗi JSON (đẹp, thụt lề) để người dùng tải về sao lưu. */
export function exportTripsJson(): StorageResult<string> {
  const current = loadTrips();
  const data = current.ok ? current.data : EMPTY_TRIPS;
  try {
    return { ok: true, data: JSON.stringify(data, null, 2) };
  } catch {
    return { ok: false, error: 'Không xuất được dữ liệu chuyến sang JSON.' };
  }
}

/** Nhập dữ liệu chuyến từ chuỗi JSON (vd nội dung file người dùng chọn) — THAY THẾ toàn bộ dữ liệu
 * hiện có bằng nội dung file nếu hợp lệ; sai định dạng/cấu trúc/version thì từ chối, KHÔNG ghi gì. */
export function importTripsJson(text: string): StorageResult<StoredTrips> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'File nhập không đúng định dạng JSON.' };
  }
  if (!isStoredTrips(parsed)) {
    return { ok: false, error: 'File nhập không đúng cấu trúc dữ liệu chuyến hoặc sai phiên bản.' };
  }
  return persist(parsed);
}
