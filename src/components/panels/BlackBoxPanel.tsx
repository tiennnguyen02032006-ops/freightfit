import { useMemo, useState } from 'react';
import type { BlackBoxCaseRecord, BlackBoxInfo, BlackBoxSource } from '../../domain/types';
import {
  BLACKBOX_CASES,
  BLACKBOX_SOURCES,
  BLACKBOX_STATS,
  CAUSE_ACTIONS,
  CAUSE_LABEL,
  SOURCE_LABEL,
  clockLabel,
  investigate,
  maskSources,
  valueLabel,
} from '../../engine/blackbox';

// Tab "Black Box": điều tra sự cố logistics trên dữ liệu MÔ PHỎNG. Toàn bộ nội dung nằm gọn trong
// MỘT màn hình (không cuộn trang). Panel này chỉ hiển thị — mọi tính toán nằm trong
// engine/blackbox (CLAUDE.md: components không tự tính logic nghiệp vụ). State cục bộ (chọn ca,
// bật/tắt nguồn) chỉ tồn tại lúc chạy, không dùng store hay localStorage.

const SOURCE_SHORT: Record<BlackBoxSource, string> = {
  gps: 'GPS',
  temp: 'Nhiệt độ',
  door: 'Cửa',
  camera: 'Camera',
  engine: 'Telemetry xe',
  traffic: 'Giao thông',
  docs: 'Chứng từ',
  driver: 'Lời khai',
};

const TIERS: Record<'A' | 'B' | 'D', BlackBoxSource[]> = {
  A: ['gps', 'docs', 'driver'],
  B: ['gps', 'docs', 'driver', 'temp', 'engine'],
  D: BLACKBOX_SOURCES,
};

const pct = (p: number) => (p >= 0.995 ? '≥99%' : p < 0.005 ? '<1%' : `${Math.round(p * 100)}%`);
const pct0 = (p: number) => `${Math.round(p * 100)}%`;

interface Shade {
  a: number;
  b: number;
  className: string;
}

interface LineChartProps {
  label: string;
  xmax: number;
  ymin: number;
  ymax: number;
  yticks: number[];
  points: Array<[number, number]>;
  shades?: Shade[];
  hline?: { value: number; label: string };
  lineClass?: string;
}

// Vẽ theo đúng thang đo: mọi tick/nhãn/điểm đều đi qua cùng 1 hàm x()/y().
function LineChart({ label, xmax, ymin, ymax, yticks, points, shades = [], hline, lineClass = 'bb-line' }: LineChartProps) {
  const W = 460, H = 118, L = 28, R = 6, T = 6, B = 17;
  const x = (t: number) => L + (t / xmax) * (W - L - R);
  const y = (v: number) => H - B - ((v - ymin) / (ymax - ymin)) * (H - B - T);
  const xticks: number[] = [];
  for (let t = 0; t <= xmax; t += 60) xticks.push(t);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="bb-chart">
      {yticks.map((v) => (
        <g key={`y${v}`}>
          <line className="bb-grid" x1={L} x2={W - R} y1={y(v)} y2={y(v)} />
          <text x={L - 4} y={y(v) + 3} textAnchor="end">{v}</text>
        </g>
      ))}
      {xticks.map((t) => (
        <text key={`x${t}`} x={x(t)} y={H - 4} textAnchor={t + 60 > xmax ? 'end' : 'middle'}>{clockLabel(t)}</text>
      ))}
      {shades.map((s, i) => (
        <rect
          key={`s${i}`}
          className={s.className}
          x={x(s.a)}
          y={T}
          width={Math.max(1, x(Math.min(s.b, xmax)) - x(s.a))}
          height={H - B - T}
        />
      ))}
      {hline && (
        <g>
          <line className="bb-hline" x1={L} x2={W - R} y1={y(hline.value)} y2={y(hline.value)} />
          <text className="bb-hline-label" x={W - R} y={y(hline.value) - 3} textAnchor="end">{hline.label}</text>
        </g>
      )}
      <polyline
        className={lineClass}
        points={points
          .map(([t, v]) => `${x(t).toFixed(1)},${y(Math.min(ymax, Math.max(ymin, v))).toFixed(1)}`)
          .join(' ')}
      />
    </svg>
  );
}

function SpeedChart({ rec, info }: { rec: BlackBoxCaseRecord; info: BlackBoxInfo }) {
  if (!rec.gps) return <div className="bb-na">Nguồn GPS đang tắt</div>;
  const xmax = Math.ceil(rec.meta.ata / 60) * 60;
  const shades: Shade[] = [
    ...info.stops.map((w) => ({ a: w[0], b: w[1], className: 'bb-shade-stop' })),
    ...info.crawls.map((w) => ({ a: w[0], b: w[1], className: 'bb-shade-crawl' })),
  ];
  if (info.offroute) shades.push({ a: info.offroute[0], b: info.offroute[1], className: 'bb-shade-off' });
  return (
    <LineChart
      label="Tốc độ theo thời gian"
      xmax={xmax}
      ymin={0}
      ymax={80}
      yticks={[0, 40, 80]}
      points={rec.gps.map((p) => [p.t, p.v])}
      shades={shades}
    />
  );
}

function TempChart({ rec, info }: { rec: BlackBoxCaseRecord; info: BlackBoxInfo }) {
  if (!rec.temp) return <div className="bb-na">Cảm biến nhiệt độ đang tắt</div>;
  const xmax = Math.ceil(rec.meta.ata / 60) * 60;
  const maxT = Math.max(...rec.temp.map((p) => p.T));
  const ymax = Math.max(12, Math.ceil(maxT / 4) * 4);
  const shades: Shade[] = info.doorOpen.map((w) => ({ a: w[0], b: w[1], className: 'bb-shade-off' }));
  return (
    <LineChart
      label="Nhiệt độ theo thời gian"
      xmax={xmax}
      ymin={0}
      ymax={ymax}
      yticks={[0, ymax / 2, ymax].map((v) => Math.round(v))}
      points={rec.temp.map((p) => [p.t, p.T])}
      shades={shades}
      hline={{ value: rec.meta.setpoint + 1.5, label: 'ngưỡng' }}
      lineClass="bb-line-hot"
    />
  );
}

export function BlackBoxPanel() {
  const [caseIndex, setCaseIndex] = useState(0);
  const [enabled, setEnabled] = useState<Record<BlackBoxSource, boolean>>(
    () => Object.fromEntries(BLACKBOX_SOURCES.map((s) => [s, true])) as Record<BlackBoxSource, boolean>,
  );
  const [reveal, setReveal] = useState(false);

  const fullCase = BLACKBOX_CASES[caseIndex];
  const maskedCase = useMemo(() => maskSources(fullCase, enabled), [fullCase, enabled]);
  const result = useMemo(() => investigate(maskedCase), [maskedCase]);

  const applyTier = (tier: 'A' | 'B' | 'D') => {
    const keep = TIERS[tier];
    setEnabled(Object.fromEntries(BLACKBOX_SOURCES.map((s) => [s, keep.includes(s)])) as Record<BlackBoxSource, boolean>);
  };
  const pickRandom = () => {
    if (BLACKBOX_CASES.length < 2) return;
    let n = caseIndex;
    while (n === caseIndex) n = Math.floor(Math.random() * BLACKBOX_CASES.length);
    setCaseIndex(n);
  };

  const truth = fullCase.truth.causes;
  const hit = truth.includes(result.topCause);
  const maxTemp = fullCase.temp ? Math.max(...fullCase.temp.map((p) => p.T)) : null;
  const sourcesOn = BLACKBOX_SOURCES.filter((s) => enabled[s]).length;
  const claims = fullCase.driver
    ? [
        !fullCase.driver.stop && 'không dừng xe',
        !fullCase.driver.dev && 'không lệch tuyến',
        !fullCase.driver.door && 'không mở cửa',
      ].filter(Boolean).join(', ')
    : '';

  return (
    <div className="bb-root">
      {/* Hàng 1: chọn ca + cảnh báo dữ liệu mô phỏng */}
      <div className="bb-bar">
        <label htmlFor="bb-case" className="bb-bar-label">Ca</label>
        <select id="bb-case" className="bb-select" value={caseIndex} onChange={(e) => setCaseIndex(Number(e.target.value))}>
          {BLACKBOX_CASES.map((c, i) => (
            <option key={c.tripId} value={i}>
              {i === 0 ? '★ ' : ''}{c.tripId} · trễ {Math.round(c.meta.delay)}′{c.truth.causes.length > 1 ? ' · nhiều nguyên nhân' : ''}
            </option>
          ))}
        </select>
        <button type="button" className="bb-btn bb-btn-primary" onClick={pickRandom}>Ca ngẫu nhiên</button>
        <label className="bb-inline-check">
          <input type="checkbox" checked={reveal} onChange={(e) => setReveal(e.target.checked)} />
          Hiện đáp án thật
        </label>
        <span className="bb-banner">Dữ liệu MÔ PHỎNG · kết quả là suy luận, chưa phải kết luận chắc chắn</span>
      </div>

      {/* Hàng 2: nguồn dữ liệu — bật/tắt ở đây, kết quả đổi ngay bên dưới */}
      <div className="bb-bar">
        <span className="bb-bar-label">Nguồn dữ liệu ({sourcesOn}/{BLACKBOX_SOURCES.length})</span>
        {BLACKBOX_SOURCES.map((s) => (
          <label key={s} className={`bb-src ${enabled[s] ? 'is-on' : ''}`}>
            <input
              type="checkbox"
              checked={enabled[s]}
              onChange={(e) => setEnabled((prev) => ({ ...prev, [s]: e.target.checked }))}
            />
            {SOURCE_SHORT[s]}
          </label>
        ))}
        <span className="bb-sep" />
        <button type="button" className="bb-btn" onClick={() => applyTier('A')} title="GPS, chứng từ, lời khai">Gói A</button>
        <button type="button" className="bb-btn" onClick={() => applyTier('B')} title="Gói A + nhiệt độ + telemetry xe">Gói B</button>
        <button type="button" className="bb-btn" onClick={() => applyTier('D')}>Đầy đủ</button>
      </div>

      {/* Bảng chính: 3 cột, vừa một màn hình */}
      <div className="bb-board">
        <section className="bb-col">
          <div className="bb-card">
            <h2>Ca {fullCase.tripId}</h2>
            <div className="bb-chips">
              <span className={`bb-chip ${fullCase.meta.delay > 20 ? 'bb-chip-bad' : ''}`}>Trễ {Math.round(fullCase.meta.delay)} phút</span>
              {maxTemp !== null && (
                <span className={`bb-chip ${maxTemp - fullCase.meta.setpoint > 1.5 ? 'bb-chip-bad' : ''}`}>{maxTemp.toFixed(1)}°C tối đa</span>
              )}
              {fullCase.docs && fullCase.docs.loaded !== fullCase.docs.delivered && (
                <span className="bb-chip bb-chip-warn">Thiếu {fullCase.docs.loaded - fullCase.docs.delivered} kiện</span>
              )}
              {fullCase.driver && <span className="bb-chip">Tài xế khai: {claims || 'không nêu bất thường'}</span>}
            </div>
          </div>
          <div className="bb-card">
            <h2>
              Tốc độ (km/h)
              <span className="bb-key"><i className="bb-shade-stop" />dừng<i className="bb-shade-crawl" />bò chậm<i className="bb-shade-off" />lệch tuyến</span>
            </h2>
            <SpeedChart rec={maskedCase} info={result.info} />
          </div>
          <div className="bb-card">
            <h2>
              Nhiệt độ thùng hàng (°C)
              <span className="bb-key"><i className="bb-shade-off" />cửa mở</span>
            </h2>
            <TempChart rec={maskedCase} info={result.info} />
          </div>
        </section>

        <section className="bb-col">
          <div className="bb-card bb-grow">
            <h2>Timeline dựng lại</h2>
            <ul className="bb-timeline">
              {result.timeline.map((e, i) => (
                <li key={`${e.t}-${i}`} className={`bb-tl-${e.level}`}>
                  <b>{clockLabel(e.t)}</b>
                  <span>{e.text}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="bb-card">
            <h2>Mâu thuẫn giữa các nguồn</h2>
            {result.info.contradictions.length > 0 ? (
              result.info.contradictions.map(([claim, evidence]) => (
                <div key={claim} className="bb-contra">
                  <span>{claim}</span><em>≠</em><span>{evidence}</span>
                </div>
              ))
            ) : (
              <p className="bb-none">{enabled.driver ? 'Không phát hiện mâu thuẫn.' : 'Chưa có lời khai để đối chiếu.'}</p>
            )}
          </div>
          <div className="bb-card">
            <h2>Cần bổ sung bằng chứng</h2>
            <ul className="bb-list">
              {result.requests.length > 0 ? (
                result.requests.map(([s]) => <li key={s}>{SOURCE_LABEL[s]}</li>)
              ) : (
                <li className="bb-muted">Bằng chứng hiện có đã đủ phân biệt.</li>
              )}
            </ul>
          </div>
        </section>

        <section className="bb-col">
          <div className="bb-card bb-grow">
            <h2>Giả thuyết nguyên nhân (độ tin cậy ước lượng)</h2>
            {reveal && (
              <p className={`bb-verdict ${hit ? 'bb-good' : 'bb-miss'}`}>
                Đáp án thật: <b>{truth.map((c) => CAUSE_LABEL[c]).join(' + ')}</b> → engine {hit ? 'xếp đúng' : 'xếp sai'}
                {truth.length > 1 ? ' (ca nhiều nguyên nhân)' : ''}.
              </p>
            )}
            {result.hypotheses.map((h, i) => (
              <div key={h.cause} className={`bb-hyp ${i === 0 ? 'bb-hyp-top' : ''}`}>
                <div className="bb-hyp-head">
                  <b>{CAUSE_LABEL[h.cause]}</b>
                  <span className="bb-conf">{pct(h.confidence)}</span>
                </div>
                <div className="bb-bar-track"><i style={{ width: `${(h.confidence * 100).toFixed(1)}%` }} /></div>
                <ul className="bb-evidence">
                  {h.support.slice(0, i === 0 ? 4 : 1).map(([f, v]) => (
                    <li key={`s-${f}`} className="bb-yes">✓ {valueLabel(f, v)}</li>
                  ))}
                  {h.refute.slice(0, i === 0 ? 1 : 1).map(([f, v]) => (
                    <li key={`r-${f}`} className="bb-no">✗ {valueLabel(f, v)}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="bb-card">
            <h2>Đề xuất hành động</h2>
            <ul className="bb-list">
              {CAUSE_ACTIONS[result.topCause].map((a) => <li key={a}>{a}</li>)}
            </ul>
          </div>
        </section>
      </div>

      {/* Hàng cuối: độ tin cậy của prototype, luôn hiện trên 1 dòng */}
      <footer className="bb-foot">
        <b>Độ tin cậy prototype (dữ liệu mô phỏng):</b>
        {BLACKBOX_STATS.tiers.map(([name, v], i) =>
          i === 2 ? null : (
            <span key={name}>{['Gói A', 'Gói B', '', 'Đầy đủ'][i]}: <b>{pct0(v)}</b></span>
          ),
        )}
        <span>2 nguyên nhân cùng lúc: <b>{pct0(BLACKBOX_STATS.mixedExactPair)}</b></span>
        <span>nhiễu nặng: <b>{pct0(BLACKBOX_STATS.worstCase)}</b></span>
        <span>ngẫu nhiên: {pct0(BLACKBOX_STATS.chance)}</span>
      </footer>
    </div>
  );
}
