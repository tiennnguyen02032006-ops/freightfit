import { describe, expect, it } from 'vitest';
import type { BlackBoxSource } from '../../../src/domain/types';
import {
  BLACKBOX_CASES,
  BLACKBOX_SOURCES,
  extractFeatures,
  investigate,
  maskSources,
  posterior,
} from '../../../src/engine/blackbox';

const allOn = Object.fromEntries(BLACKBOX_SOURCES.map((s) => [s, true])) as Record<BlackBoxSource, boolean>;
const only = (keep: BlackBoxSource[]) =>
  Object.fromEntries(BLACKBOX_SOURCES.map((s) => [s, keep.includes(s)])) as Record<BlackBoxSource, boolean>;

// Ca số 0 là vụ mẫu "bốc/dỡ ngoài kế hoạch": cửa mở + camera + thiếu kiện + tài xế khai không dừng xe.
const demoCase = BLACKBOX_CASES[0];

describe('extractFeatures', () => {
  it('nhận ra dấu hiệu bốc/dỡ ngoài kế hoạch từ dữ liệu đầy đủ', () => {
    const { features, info } = extractFeatures(demoCase);
    expect(features.door).toBe('long');
    expect(features.camera).toBe('yes');
    expect(features.count_mismatch).toBe('yes');
    expect(features.driver_contra).toBe('yes');
    expect(info.stops.length).toBeGreaterThan(0);
  });

  it('đặt đặc trưng về null khi nguồn dữ liệu bị tắt', () => {
    const { features } = extractFeatures(maskSources(demoCase, only(['gps'])));
    expect(features.temp_exc).toBeNull();
    expect(features.door).toBeNull();
    expect(features.driver_contra).toBeNull();
    expect(features.stop_dur).not.toBeNull();
  });

  it('maskSources không sửa ca gốc', () => {
    maskSources(demoCase, only([]));
    expect(demoCase.gps).not.toBeNull();
    expect(demoCase.temp).not.toBeNull();
  });
});

describe('investigate', () => {
  it('xếp "bốc/dỡ ngoài kế hoạch" đầu tiên và phát hiện mâu thuẫn lời khai', () => {
    const r = investigate(demoCase);
    expect(r.topCause).toBe('offplan_handling');
    expect(r.hypotheses[0].confidence).toBeGreaterThan(0.9);
    expect(r.info.contradictions.length).toBeGreaterThan(0);
    expect(r.hypotheses[0].support.length).toBeGreaterThan(0);
  });

  it('timeline sắp theo thời gian, bắt đầu bằng xuất phát và kết thúc bằng giao hàng', () => {
    const { timeline } = investigate(demoCase);
    expect(timeline[0].text).toBe('Xuất phát');
    expect(timeline[timeline.length - 1].text.startsWith('Giao hàng')).toBe(true);
    for (let i = 1; i < timeline.length; i++) {
      expect(timeline[i].t).toBeGreaterThanOrEqual(timeline[i - 1].t);
    }
  });

  it('xác suất các giả thuyết luôn cộng lại bằng 1, với mọi ca và mọi cấu hình nguồn', () => {
    const configs = [allOn, only(['gps', 'docs', 'driver']), only(['gps']), only([])];
    for (const rec of BLACKBOX_CASES) {
      for (const cfg of configs) {
        const { features } = extractFeatures(maskSources(rec, cfg));
        const sum = Object.values(posterior(features)).reduce((a, b) => a + b, 0);
        expect(sum).toBeCloseTo(1, 6);
      }
    }
  });

  it('không có nguồn nào thì vẫn trả kết quả hợp lệ, độ tin cậy không quá cao', () => {
    const r = investigate(maskSources(demoCase, only([])));
    expect(r.hypotheses).toHaveLength(3);
    expect(r.hypotheses[0].confidence).toBeLessThan(0.9);
  });

  it('bớt nguồn dữ liệu thì độ tin cậy vào đáp án đúng của ca mẫu không tăng lên', () => {
    const full = investigate(demoCase).hypotheses[0].confidence;
    const reduced = investigate(maskSources(demoCase, only(['gps', 'docs', 'driver']))).hypotheses[0].confidence;
    expect(reduced).toBeLessThanOrEqual(full + 1e-9);
  });

  it('non-regression: ca một nguyên nhân, dữ liệu đầy đủ, đoán đúng ít nhất 22/25 ca', () => {
    const singles = BLACKBOX_CASES.filter((c) => c.truth.causes.length === 1);
    const hits = singles.filter((c) => investigate(c).topCause === c.truth.causes[0]).length;
    expect(singles.length).toBe(25);
    expect(hits).toBeGreaterThanOrEqual(22);
  });

  it('không đọc đáp án của ca (truth) khi điều tra', () => {
    const swapped = { ...demoCase, truth: { causes: ['traffic' as const] } };
    expect(investigate(swapped).topCause).toBe(investigate(demoCase).topCause);
  });
});
