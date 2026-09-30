import type {
  BlackBoxCaseRecord,
  BlackBoxFeatureName,
  BlackBoxFeatures,
  BlackBoxGpsPing,
  BlackBoxInfo,
  BlackBoxSource,
  BlackBoxWindow,
} from '../../domain/types';

// THUẦN TypeScript: không import React/Three/store (xem CLAUDE.md, mục Ranh giới bắt buộc).

export const PING_MINUTES = 5;

export const BLACKBOX_FEATURES: BlackBoxFeatureName[] = [
  'stop_dur', 'crawl', 'offroute', 'temp_exc', 'temp_onset', 'temp_slope', 'door',
  'camera', 'engine_off', 'fault', 'traffic_hi', 'count_mismatch', 'driver_contra', 'delay',
];

export const BLACKBOX_SOURCES: BlackBoxSource[] = [
  'gps', 'temp', 'door', 'camera', 'engine', 'traffic', 'docs', 'driver',
];

/** Trả về bản sao của ca với các nguồn dữ liệu bị tắt được đặt về null (= không có dữ liệu). */
export function maskSources(
  rec: BlackBoxCaseRecord,
  enabled: Record<BlackBoxSource, boolean>,
): BlackBoxCaseRecord {
  const out: BlackBoxCaseRecord = { ...rec };
  for (const s of BLACKBOX_SOURCES) {
    if (!enabled[s]) out[s] = null;
  }
  return out;
}

function runs<T>(items: T[], pred: (item: T) => boolean): T[][] {
  const result: T[][] = [];
  let cur: T[] = [];
  for (const item of items) {
    if (pred(item)) cur.push(item);
    else if (cur.length > 0) {
      result.push(cur);
      cur = [];
    }
  }
  if (cur.length > 0) result.push(cur);
  return result;
}

function emptyFeatures(): BlackBoxFeatures {
  const f = {} as BlackBoxFeatures;
  for (const k of BLACKBOX_FEATURES) f[k] = null;
  return f;
}

/** Phát hiện bất thường + gom bằng chứng từ dữ liệu thô của 1 ca. Giá trị null = thiếu nguồn. */
export function extractFeatures(rec: BlackBoxCaseRecord): { features: BlackBoxFeatures; info: BlackBoxInfo } {
  const f = emptyFeatures();
  const info: BlackBoxInfo = {
    stops: [], crawls: [], slow: [], offroute: null, tempOnsetT: null,
    contradictions: [], doorOpen: [], camera: [], faults: [],
  };
  const { ata, delay, setpoint } = rec.meta;
  f.delay = delay < 20 ? 'small' : delay <= 60 ? 'moderate' : 'large';

  if (rec.gps) {
    for (const run of runs<BlackBoxGpsPing>(rec.gps, (p) => p.v < 15)) {
      const dur = run[run.length - 1].t - run[0].t + PING_MINUTES;
      if (dur < 10) continue;
      const stopFrac = run.filter((p) => p.v < 3).length / run.length;
      const w: BlackBoxWindow = [run[0].t, run[run.length - 1].t + PING_MINUTES, dur];
      info.slow.push(w);
      (stopFrac >= 0.6 ? info.stops : info.crawls).push(w);
    }
    info.crawls = info.crawls.filter((c) => c[2] >= 15);
    const longest = Math.max(0, ...info.stops.map((s) => s[2]));
    f.stop_dur = longest < 10 ? 'none' : longest < 20 ? 'short' : longest < 40 ? 'medium' : 'long';
    f.crawl = info.crawls.length > 0 ? 'yes' : 'no';
    const off = runs<BlackBoxGpsPing>(rec.gps, (p) => p.off > 1.5).filter((r) => r.length >= 2);
    f.offroute = off.length > 0 ? 'yes' : 'no';
    if (off.length > 0) {
      const r = off.reduce((a, b) => (b.length > a.length ? b : a));
      info.offroute = [r[0].t, r[r.length - 1].t, Math.max(...r.map((p) => p.off))];
    }
  }

  if (rec.temp) {
    const tp = rec.temp;
    const exc = Math.max(...tp.map((x) => x.T)) - setpoint;
    f.temp_exc = exc < 1.5 ? 'none' : exc <= 4 ? 'mild' : 'major';
    if (exc >= 1.5) {
      const onset = tp.find((x) => x.T > setpoint + 1.5)?.t ?? 0;
      info.tempOnsetT = onset;
      f.temp_onset = info.slow.some((w) => w[0] - 10 <= onset && onset <= w[1] + 10) ? 'in_stop' : 'in_motion';
      let slope = 0;
      for (let i = 0; i < tp.length - 2; i++) {
        slope = Math.max(slope, (tp[i + 2].T - tp[i].T) / (2 * PING_MINUTES));
      }
      f.temp_slope = slope > 0.2 ? 'fast' : 'slow';
    }
  }

  if (rec.door) {
    info.doorOpen = rec.door.filter((w) => w[0] < ata - 5);
    const mx = Math.max(0, ...info.doorOpen.map((w) => w[1] - w[0]));
    f.door = info.doorOpen.length === 0 ? 'no' : mx >= 5 ? 'long' : 'brief';
  }

  if (rec.camera) {
    info.camera = rec.camera.filter((t) => t < ata - 5);
    f.camera = info.camera.length > 0 ? 'yes' : 'no';
  }

  if (rec.engine) {
    info.faults = rec.engine.faults;
    const kinds = new Set(rec.engine.faults.map((x) => x[1]));
    f.fault = kinds.has('engine') ? 'engine' : kinds.has('reefer') ? 'reefer' : 'none';
    if (info.stops.length > 0 && rec.gps) {
      const tel = new Map(rec.engine.tel.map((p) => [p.t, p.on] as const));
      const ls = info.stops.reduce((a, b) => (b[2] > a[2] ? b : a));
      const ons: boolean[] = [];
      for (let t = ls[0]; t < ls[1]; t += PING_MINUTES) {
        const on = tel.get(t);
        if (on !== undefined) ons.push(on);
      }
      if (ons.length > 0) f.engine_off = ons.filter((o) => !o).length / ons.length > 0.5 ? 'yes' : 'no';
    }
  }

  if (rec.traffic && (info.stops.length > 0 || info.crawls.length > 0)) {
    const wins = [...info.stops, ...info.crawls];
    const hi = rec.traffic.some((x) => x.idx > 0.7 && wins.some((w) => w[0] - 10 <= x.t && x.t <= w[1] + 10));
    f.traffic_hi = hi ? 'yes' : 'no';
  }

  if (rec.docs) f.count_mismatch = rec.docs.loaded !== rec.docs.delivered ? 'yes' : 'no';

  if (rec.driver && (rec.gps || rec.door)) {
    const cl = rec.driver;
    if (rec.gps && !cl.stop && info.stops.length > 0) {
      const mx = Math.max(...info.stops.map((s) => Math.round(s[2])));
      info.contradictions.push(['Tài xế khai "không dừng xe ngoài kế hoạch"', `GPS ghi nhận dừng ${mx} phút`]);
    }
    if (rec.gps && !cl.dev && info.offroute) {
      info.contradictions.push(['Tài xế khai "không đi lệch tuyến"', `GPS: lệch tối đa ${info.offroute[2].toFixed(1)} km`]);
    }
    if (rec.door && !cl.door && f.door === 'long') {
      info.contradictions.push(['Tài xế khai "không mở cửa thùng"', 'Cảm biến cửa: mở cửa kéo dài']);
    }
    f.driver_contra = info.contradictions.length > 0 ? 'yes' : 'no';
  }

  return { features: f, info };
}
