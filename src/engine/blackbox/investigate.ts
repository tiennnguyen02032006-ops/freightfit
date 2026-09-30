import type {
  BlackBoxCaseRecord,
  BlackBoxInfo,
  BlackBoxInvestigation,
  BlackBoxSource,
  BlackBoxTimelineEvent,
} from '../../domain/types';
import { BLACKBOX_FEATURES, extractFeatures } from './extract';
import { BLACKBOX_CAUSES, discriminationGain, evidenceFor, posterior } from './model';
import { FEATURE_SOURCE } from './text';

/** Đổi phút kể từ lúc xuất phát (t=0 ~ 08:00) thành giờ "HH:MM". */
export function clockLabel(t: number, startHour = 8): string {
  const m = Math.round(t);
  return `${String(startHour + Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function buildTimeline(rec: BlackBoxCaseRecord, info: BlackBoxInfo): BlackBoxTimelineEvent[] {
  const ev: BlackBoxTimelineEvent[] = [
    { t: 0, text: 'Xuất phát', level: 'info' },
    { t: rec.meta.planned, text: `ETA kế hoạch ${clockLabel(rec.meta.planned)}`, level: 'info' },
  ];
  for (const s of info.stops) {
    ev.push({ t: s[0], text: `GPS: xe dừng ${Math.round(s[2])} phút (${clockLabel(s[0])}–${clockLabel(s[1])})`, level: 'warn' });
  }
  for (const s of info.crawls) {
    ev.push({ t: s[0], text: `GPS: xe bò chậm ${Math.round(s[2])} phút`, level: 'warn' });
  }
  if (info.offroute) {
    const [a, b, m] = info.offroute;
    ev.push({ t: a, text: `GPS: lệch tuyến tối đa ${m.toFixed(1)} km (${clockLabel(a)}–${clockLabel(b)})`, level: 'warn' });
  }
  if (info.tempOnsetT !== null) {
    ev.push({ t: info.tempOnsetT, text: 'Nhiệt độ vượt ngưỡng cảnh báo (+1,5°C)', level: 'bad' });
  }
  for (const w of info.doorOpen) {
    ev.push({ t: w[0], text: `Cảm biến cửa: mở ${Math.round(w[1] - w[0])} phút`, level: 'warn' });
  }
  if (info.camera.length > 0) {
    ev.push({ t: info.camera[0], text: `Camera: phát hiện hoạt động bốc/dỡ (${info.camera.length} lần ghi nhận)`, level: 'warn' });
  }
  for (const [t, kind] of info.faults) {
    ev.push({ t, text: kind === 'engine' ? 'Mã lỗi động cơ' : 'Cảnh báo thiết bị làm lạnh', level: 'bad' });
  }
  ev.push({
    t: rec.meta.ata,
    text: `Giao hàng ${clockLabel(rec.meta.ata)} (trễ ${Math.round(rec.meta.delay)} phút)`,
    level: rec.meta.delay > 20 ? 'bad' : 'info',
  });
  return ev.sort((a, b) => a.t - b.t);
}

/** Điều tra 1 ca: bằng chứng -> timeline -> mâu thuẫn -> giả thuyết xếp hạng (độ tin cậy đã hiệu chỉnh). */
export function investigate(rec: BlackBoxCaseRecord): BlackBoxInvestigation {
  const { features, info } = extractFeatures(rec);
  const post = posterior(features);
  const ranked = [...BLACKBOX_CAUSES].sort((a, b) => post[b] - post[a]);

  const hypotheses = ranked.slice(0, 3).map((cause) => {
    const ev = evidenceFor(features, cause);
    return {
      cause,
      confidence: post[cause],
      support: ev.filter((e) => e[2] > 0.5).sort((a, b) => b[2] - a[2]),
      refute: ev.filter((e) => e[2] < -0.5).sort((a, b) => a[2] - b[2]),
    };
  });

  // Nguồn dữ liệu nào (đang thiếu) giúp phân biệt top 1 và top 2 nhiều nhất?
  const bySource = new Map<BlackBoxSource, number>();
  for (const f of BLACKBOX_FEATURES) {
    if (features[f] !== null) continue;
    const g = discriminationGain(f, ranked[0], ranked[1]);
    const s = FEATURE_SOURCE[f];
    bySource.set(s, Math.max(bySource.get(s) ?? 0, g));
  }
  const requests = [...bySource.entries()].filter(([, g]) => g > 0.15).sort((a, b) => b[1] - a[1]).slice(0, 3);

  return { features, info, hypotheses, topCause: ranked[0], timeline: buildTimeline(rec, info), requests };
}
