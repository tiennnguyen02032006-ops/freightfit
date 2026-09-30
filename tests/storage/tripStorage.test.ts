import { beforeEach, describe, expect, it } from 'vitest';
import type { StoredTripEntry } from '../../src/domain/types';
import {
  TRIP_STORAGE_KEY,
  deleteTrip,
  exportTripsJson,
  importTripsJson,
  loadTrips,
  saveTrip,
} from '../../src/storage/tripStorage';

// Mock localStorage thuần (môi trường test dùng vitest environment 'node', không có sẵn
// localStorage như trình duyệt thật) — hỗ trợ 2 chế độ lỗi để test đúng yêu cầu: blockRead (mô
// phỏng trình duyệt chặn đọc, vd chế độ ẩn danh nghiêm ngặt) và blockWrite (mô phỏng hết dung
// lượng, QuotaExceededError khi setItem).
class MockStorage implements Storage {
  private store = new Map<string, string>();
  blockRead = false;
  blockWrite = false;

  get length() {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    if (this.blockRead) throw new DOMException('blocked', 'SecurityError');
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    if (this.blockWrite) throw new DOMException('QuotaExceededError', 'QuotaExceededError');
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
}

let mock: MockStorage;

beforeEach(() => {
  mock = new MockStorage();
  // localStorage không tồn tại sẵn trong environment 'node' của vitest — gán trực tiếp vào global
  // giống cách app thật sẽ đọc `localStorage` (biến toàn cục của trình duyệt).
  (globalThis as unknown as { localStorage: Storage }).localStorage = mock;
});

function makeEntry(tripId: string): StoredTripEntry {
  return {
    plan: {
      tripId,
      name: `Chuyến ${tripId}`,
      createdAt: 1000,
      stops: [{ stopId: 'stop-1', order: 0, name: 'Kho A', etaMinutes: 60 }],
      cargo: [{ cargoInstanceId: 'c1__0', cargoTemplateId: 'c1', stopId: 'stop-1' }],
    },
    actual: null,
  };
}

describe('loadTrips', () => {
  it('chưa từng lưu gì -> trả về danh sách rỗng hợp lệ, không lỗi', () => {
    const result = loadTrips();
    expect(result).toEqual({ ok: true, data: { version: 1, trips: [] } });
  });

  it('dữ liệu hỏng (JSON lỗi cú pháp) bị bỏ qua, báo lỗi tiếng Việt, không ném lỗi ra ngoài', () => {
    mock.setItem(TRIP_STORAGE_KEY, '{not valid json');
    const result = loadTrips();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/hỏng|định dạng/);
  });

  it('dữ liệu sai kiểu (đúng JSON nhưng sai cấu trúc/version) bị bỏ qua, báo lỗi', () => {
    mock.setItem(TRIP_STORAGE_KEY, JSON.stringify({ version: 2, trips: 'not-an-array' }));
    const result = loadTrips();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/sai định dạng|phiên bản/);
  });

  it('trình duyệt chặn đọc -> trả lỗi có thông báo, không ném lỗi ra ngoài', () => {
    mock.blockRead = true;
    expect(() => loadTrips()).not.toThrow();
    const result = loadTrips();
    expect(result.ok).toBe(false);
  });
});

describe('saveTrip / loadTrips', () => {
  it('lưu rồi đọc lại đúng dữ liệu vừa lưu', () => {
    const entry = makeEntry('trip-1');
    const saveResult = saveTrip(entry);
    expect(saveResult.ok).toBe(true);

    const loaded = loadTrips();
    expect(loaded).toEqual({ ok: true, data: { version: 1, trips: [entry] } });
  });

  it('lưu 2 lần cùng tripId -> GHI ĐÈ (upsert), không tạo bản ghi trùng', () => {
    saveTrip(makeEntry('trip-1'));
    const updated = { ...makeEntry('trip-1'), plan: { ...makeEntry('trip-1').plan, name: 'Đã đổi tên' } };
    saveTrip(updated);

    const loaded = loadTrips();
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.data.trips).toHaveLength(1);
      expect(loaded.data.trips[0].plan.name).toBe('Đã đổi tên');
    }
  });

  it('lỗi ghi (đầy dung lượng / QuotaExceededError) không ném lỗi ra ngoài, trả kết quả lỗi', () => {
    mock.blockWrite = true;
    expect(() => saveTrip(makeEntry('trip-1'))).not.toThrow();
    const result = saveTrip(makeEntry('trip-1'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
  });
});

describe('deleteTrip', () => {
  it('xóa đúng chuyến theo tripId, giữ nguyên các chuyến khác', () => {
    saveTrip(makeEntry('trip-1'));
    saveTrip(makeEntry('trip-2'));
    deleteTrip('trip-1');

    const loaded = loadTrips();
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.data.trips.map((t) => t.plan.tripId)).toEqual(['trip-2']);
    }
  });

  it('xóa tripId không tồn tại -> không lỗi, dữ liệu giữ nguyên', () => {
    saveTrip(makeEntry('trip-1'));
    const result = deleteTrip('không-tồn-tại');
    expect(result.ok).toBe(true);
    const loaded = loadTrips();
    expect(loaded.ok && loaded.data.trips).toHaveLength(1);
  });
});

describe('exportTripsJson / importTripsJson', () => {
  it('xuất rồi nhập lại (roundtrip) ra đúng dữ liệu cũ', () => {
    saveTrip(makeEntry('trip-1'));
    saveTrip(makeEntry('trip-2'));

    const exported = exportTripsJson();
    expect(exported.ok).toBe(true);

    // Xóa sạch rồi nhập lại từ chuỗi đã xuất — phải khôi phục đúng.
    deleteTrip('trip-1');
    deleteTrip('trip-2');
    expect(loadTrips()).toEqual({ ok: true, data: { version: 1, trips: [] } });

    if (exported.ok) {
      const imported = importTripsJson(exported.data);
      expect(imported.ok).toBe(true);
    }
    const loaded = loadTrips();
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.data.trips.map((t) => t.plan.tripId).sort()).toEqual(['trip-1', 'trip-2']);
    }
  });

  it('import chuỗi không phải JSON -> bị từ chối, không ghi đè dữ liệu hiện có', () => {
    saveTrip(makeEntry('trip-1'));
    const result = importTripsJson('đây không phải JSON {{{');
    expect(result.ok).toBe(false);

    const loaded = loadTrips();
    expect(loaded.ok && loaded.data.trips.map((t) => t.plan.tripId)).toEqual(['trip-1']);
  });

  it('import JSON hợp lệ nhưng sai cấu trúc StoredTrips -> bị từ chối, không ghi đè', () => {
    saveTrip(makeEntry('trip-1'));
    const result = importTripsJson(JSON.stringify({ foo: 'bar' }));
    expect(result.ok).toBe(false);

    const loaded = loadTrips();
    expect(loaded.ok && loaded.data.trips.map((t) => t.plan.tripId)).toEqual(['trip-1']);
  });

  it('import version khác 1 -> bị từ chối', () => {
    const result = importTripsJson(JSON.stringify({ version: 2, trips: [] }));
    expect(result.ok).toBe(false);
  });
});
