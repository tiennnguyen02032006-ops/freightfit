import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../../store';
import type {
  CargoTemplate,
  ContainerInstance,
  RedTeamIncident,
  RedTeamParams,
  RedTeamRescueOption,
  RedTeamScenario,
  RedTeamSimResult,
  RedTeamStop,
} from '../../domain/types';
import { buildRedTeamScenario } from '../../engine/redteam/fromSolution';
import { REDTEAM_ASSUMPTIONS, defaultIncidents } from '../../engine/redteam/defaults';
import { evaluate, MAX_REDTEAM_INCIDENTS } from '../../engine/redteam/evaluate';
import { buildRescueOptions } from '../../engine/redteam/rescue';

interface RedTeamPanelProps {
  container: ContainerInstance | undefined;
  templatesById: Map<string, CargoTemplate>;
  innerWidth: number;
  onClose: () => void;
}

const fmt = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');
const comboKey = (ids: string[]) => ids.join('|');

function NumField({ label, value, onChange, unit, min = 0, step = 1 }: { label: string; value: number; onChange: (v: number) => void; unit?: string; min?: number; step?: number }) {
  return (
    <label className="redteam-field">
      <span>{label}</span>
      <span className="redteam-input">
        <input
          type="number"
          min={min}
          step={step}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => {
            const v = Number(e.target.value);
            onChange(Number.isFinite(v) ? Math.max(min, v) : min);
          }}
        />
        {unit && <em>{unit}</em>}
      </span>
    </label>
  );
}

/** Biểu đồ thời gian từng điểm giao: lái xe (xám), dỡ hàng (xanh), dỡ/xếp lại pallet bị chắn (đỏ), vạch hạn giao, phần trễ. */
function Timeline({ sim, scenario }: { sim: RedTeamSimResult; scenario: RedTeamScenario }) {
  const deadlines = scenario.stops.map((s) => s.deadlineMin);
  const maxT = Math.max(1, ...sim.events.map((e) => e.finish), ...deadlines) * 1.04;
  const minT = Math.min(0, sim.startMin);
  const pos = (t: number) => `${((t - minT) / (maxT - minT)) * 100}%`;
  const width = (a: number, b: number) => `${(Math.max(0, b - a) / (maxT - minT)) * 100}%`;

  return (
    <div className="redteam-timeline" role="img" aria-label="Biểu đồ thời gian từng điểm giao">
      {sim.events.map((e, index) => {
        const prevEnd = index === 0 ? sim.startMin : sim.events[index - 1].finish;
        const stop = scenario.stops[e.plannedPosition - 1];
        const unloadEnd = e.finish - e.rehandleMin;
        return (
          <div key={e.stopId} className={`redteam-row${e.lateness > 0 ? ' is-late' : ''}`}>
            <span className="redteam-row-label">
              Điểm {e.plannedPosition} · {e.name}
            </span>
            <div className="redteam-track">
              <span className="redteam-bar redteam-travel" style={{ left: pos(prevEnd), width: width(prevEnd, e.arrival) }} />
              <span className="redteam-bar redteam-unload" style={{ left: pos(e.arrival), width: width(e.arrival, unloadEnd) }} />
              <span className="redteam-bar redteam-rehandle" style={{ left: pos(unloadEnd), width: width(unloadEnd, e.finish) }} />
              <span className="redteam-deadline" style={{ left: pos(stop.deadlineMin) }} title={`Hạn giao ${fmt(stop.deadlineMin)} phút`} />
            </div>
            <span className="redteam-row-value">{e.lateness > 0 ? `trễ ${fmt(e.lateness)}′` : `xong ${fmt(e.finish)}′`}</span>
          </div>
        );
      })}
      <div className="redteam-legend">
        <span><i className="redteam-travel" /> Lái xe (gồm chậm trễ)</span>
        <span><i className="redteam-unload" /> Dỡ hàng</span>
        <span><i className="redteam-rehandle" /> Dỡ/xếp lại pallet bị chắn</span>
        <span><i className="redteam-deadline-swatch" /> Hạn giao</span>
      </div>
    </div>
  );
}

function incidentEditor(incident: RedTeamIncident, stops: RedTeamStop[], onChange: (next: RedTeamIncident) => void) {
  switch (incident.type) {
    case 'LATE_DEPART':
      return <NumField label="Muộn" unit="phút" value={incident.minutes} onChange={(v) => onChange({ ...incident, minutes: v })} />;
    case 'DELAY':
      return (
        <>
          <NumField label="Chậm" unit="phút" value={incident.minutes} onChange={(v) => onChange({ ...incident, minutes: v })} />
          <NumField label="Ở chặng" min={1} value={incident.leg} onChange={(v) => onChange({ ...incident, leg: Math.max(1, Math.round(v)) })} />
        </>
      );
    case 'SLOW_UNLOAD':
      return <NumField label="Chậm thêm" unit="%" value={incident.percent} onChange={(v) => onChange({ ...incident, percent: v })} />;
    case 'EXPEDITE':
      return (
        <>
          <label className="redteam-field">
            <span>Đơn giao sớm</span>
            <select value={incident.orderId} onChange={(e) => onChange({ ...incident, orderId: e.target.value })}>
              {stops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <NumField label="Dỡ ở điểm" min={1} value={incident.atPosition} onChange={(v) => onChange({ ...incident, atPosition: Math.max(1, Math.round(v)) })} />
        </>
      );
  }
}

function RedTeamBody({ scenario: source, onClose }: { scenario: RedTeamScenario; onClose: () => void }) {
  const setHighlight = useAppStore((s) => s.setRedTeamHighlight);
  const [stops, setStops] = useState<RedTeamStop[]>(source.stops);
  const [params, setParams] = useState<RedTeamParams>(source.params);
  const [incidents, setIncidents] = useState<RedTeamIncident[]>(() => defaultIncidents(source.stops));
  const [enabled, setEnabled] = useState<Set<string>>(() => new Set(incidents.map((i) => i.id)));
  const [earlyMin, setEarlyMin] = useState<number>(REDTEAM_ASSUMPTIONS.earlyDepartMinutes);
  const [selectedCombo, setSelectedCombo] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  // Rời bảng thì bỏ tô sáng pallet trong khung 3D.
  useEffect(() => () => setHighlight(null), [setHighlight]);

  const scenario = useMemo<RedTeamScenario>(() => ({ stops, pallets: source.pallets, params }), [stops, source.pallets, params]);
  const active = useMemo(() => incidents.filter((i) => enabled.has(i.id)).slice(0, MAX_REDTEAM_INCIDENTS), [incidents, enabled]);
  const report = useMemo(() => evaluate(scenario, active), [scenario, active]);
  const options = useMemo(() => buildRescueOptions(scenario, active, earlyMin), [scenario, active, earlyMin]);

  const shownCombo = report.combos.find((c) => comboKey(c.incidentIds) === selectedCombo) ?? report.combos[0];

  const moveStop = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= stops.length) return;
    const next = [...stops];
    [next[index], next[target]] = [next[target], next[index]];
    setStops(next);
  };
  const patchStop = (index: number, patch: Partial<RedTeamStop>) => setStops(stops.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  const patchIncident = (next: RedTeamIncident) => setIncidents(incidents.map((i) => (i.id === next.id ? next : i)));

  const chooseOption = (option: RedTeamRescueOption) => {
    setSelectedOption(option.id);
    setHighlight(option.highlight);
  };

  return (
    <div className="redteam-panel" role="region" aria-label="Red Team">
      <div className="redteam-head">
        <strong>Red Team — thử sự cố trên chuyến giao</strong>
        <button type="button" className="result-btn" onClick={onClose}>
          Đóng
        </button>
      </div>
      <p className="redteam-disclaimer" role="note">
        Đây là mô phỏng theo luật với số liệu GIẢ ĐỊNH (thời gian chặng, thời gian dỡ, hạn giao, mức chậm và các sự cố mặc định đều do app
        tự đặt, chưa đo thực tế; có thể chỉnh bên dưới). Kết quả dùng để so sánh phương án xếp và phương án cứu, không phải dự báo.
      </p>

      <section className="redteam-section">
        <h3>1. Điểm giao, hạn giao và thời gian chặng</h3>
        <p className="redteam-hint">
          Mỗi nhóm hàng (điểm giao ghi trong hàng, hoặc khách hàng, hoặc SKU) giao ở một điểm. Thứ tự mặc định: nhóm gần cửa nhất giao trước.
          Hạn giao tính bằng phút sau giờ xuất phát kế hoạch (gồm cả dỡ hàng).
        </p>
        <div className="redteam-stops">
          {stops.map((stop, i) => (
            <div key={stop.id} className="redteam-stop">
              <span className="redteam-stop-no">{i + 1}</span>
              <label className="redteam-field redteam-field-wide">
                <span>Tên điểm</span>
                <input value={stop.name} onChange={(e) => patchStop(i, { name: e.target.value })} />
              </label>
              <NumField label="Chặng tới" unit="phút" value={stop.legMinutes} onChange={(v) => patchStop(i, { legMinutes: v })} />
              <NumField label="Dỡ hàng" unit="phút" value={stop.unloadMinutes} onChange={(v) => patchStop(i, { unloadMinutes: v })} />
              <NumField label="Hạn giao" unit="phút" value={stop.deadlineMin} onChange={(v) => patchStop(i, { deadlineMin: v })} />
              <span className="redteam-move">
                <button type="button" aria-label="Chuyển lên" disabled={i === 0} onClick={() => moveStop(i, -1)}>
                  ↑
                </button>
                <button type="button" aria-label="Chuyển xuống" disabled={i === stops.length - 1} onClick={() => moveStop(i, 1)}>
                  ↓
                </button>
              </span>
            </div>
          ))}
        </div>
        <div className="redteam-params">
          <NumField label="Dỡ/xếp lại mỗi pallet bị chắn" unit="phút" step={0.5} value={params.rehandleMinPerPallet} onChange={(v) => setParams({ ...params, rehandleMinPerPallet: v })} />
          <NumField label="Dỡ thêm mỗi pallet giao sớm" unit="phút" step={0.5} value={params.extraUnloadMinPerPallet} onChange={(v) => setParams({ ...params, extraUnloadMinPerPallet: v })} />
        </div>
      </section>

      <section className="redteam-section">
        <h3>2. Sự cố cần thử (mặc định là giả định)</h3>
        <p className="redteam-hint">
          Chạy mọi tổ hợp của các sự cố được tích ({active.length} sự cố → {2 ** active.length} tổ hợp, tối đa {MAX_REDTEAM_INCIDENTS} sự cố).
        </p>
        <div className="redteam-incidents">
          {incidents.map((incident) => (
            <div key={incident.id} className="redteam-incident">
              <label className="redteam-check">
                <input
                  type="checkbox"
                  checked={enabled.has(incident.id)}
                  onChange={() => {
                    const next = new Set(enabled);
                    if (next.has(incident.id)) next.delete(incident.id);
                    else next.add(incident.id);
                    setEnabled(next);
                  }}
                />
                <span>{incident.label}</span>
              </label>
              <div className="redteam-incident-fields">{incidentEditor(incident, stops, patchIncident)}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="redteam-section">
        <h3>3. Điểm gãy theo mức trễ</h3>
        <p className="redteam-summary">
          {report.brokenCount === 0 ? (
            <>Không tổ hợp nào làm đơn nào trễ hạn ({report.total} tổ hợp đã chạy).</>
          ) : (
            <>
              <b>{report.brokenCount}</b>/{report.total} tổ hợp làm ít nhất một đơn trễ hạn.
            </>
          )}
        </p>
        {report.breakTable.length > 0 && (
          <div className="redteam-table-wrap">
            <table className="redteam-table">
              <thead>
                <tr>
                  <th>Điểm giao</th>
                  <th>Số tổ hợp gãy</th>
                  <th>Trễ tối đa</th>
                  <th>Tổ hợp tệ nhất</th>
                </tr>
              </thead>
              <tbody>
                {report.breakTable.map((row) => (
                  <tr key={row.orderId}>
                    <td>
                      Điểm {stops.findIndex((s) => s.id === row.orderId) + 1} · {row.name}
                    </td>
                    <td>
                      {row.breakCount}/{report.total}
                    </td>
                    <td>{fmt(row.maxLateness)} phút</td>
                    <td>{row.worstComboLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="redteam-section">
        <h3>4. Thời gian từng điểm giao và nguyên nhân</h3>
        <label className="redteam-field redteam-field-wide">
          <span>Tổ hợp sự cố đang xem (xếp từ tệ nhất)</span>
          <select value={comboKey(shownCombo.incidentIds)} onChange={(e) => setSelectedCombo(e.target.value)}>
            {report.combos.map((c) => (
              <option key={comboKey(c.incidentIds)} value={comboKey(c.incidentIds)}>
                {c.label}
                {c.sim.maxLateness > 0 ? ` — trễ tối đa ${fmt(c.sim.maxLateness)} phút` : ' — kịp hạn'}
              </option>
            ))}
          </select>
        </label>
        <Timeline sim={shownCombo.sim} scenario={scenario} />
        <ul className="redteam-explain">
          {shownCombo.sim.explanation.map((line, i) => (
            <li key={i} className={line.startsWith('• ') ? 'is-cause' : undefined}>
              {line.replace(/^• /, '')}
            </li>
          ))}
        </ul>
      </section>

      <section className="redteam-section">
        <h3>5. Phương án cứu (chấm trên mọi tổ hợp)</h3>
        <NumField label="Xuất phát sớm (phương án cứu)" unit="phút" value={earlyMin} onChange={setEarlyMin} />
        <p className="redteam-hint">
          Bấm vào một phương án để tô sáng pallet trong khung 3D: <i className="redteam-dot redteam-dot-blocked" /> bị chắn,{' '}
          <i className="redteam-dot redteam-dot-blocker" /> đang chắn, <i className="redteam-dot redteam-dot-moved" /> cần đổi chỗ/tách đơn.
        </p>
        <div className="redteam-options">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`redteam-option${selectedOption === option.id ? ' is-selected' : ''}${option.recommended ? ' is-recommended' : ''}`}
              aria-pressed={selectedOption === option.id}
              onClick={() => chooseOption(option)}
            >
              <span className="redteam-option-title">
                {option.title}
                {option.recommended && <em>Đề xuất</em>}
              </span>
              <span className="redteam-option-detail">{option.detail}</span>
              <span className="redteam-option-score">
                Gãy {option.brokenCount}/{option.total} tổ hợp · trễ tối đa {fmt(option.maxLateness)} phút · tổng trễ {fmt(option.totalLateness)} phút
              </span>
            </button>
          ))}
        </div>
        {selectedOption && (
          <button
            type="button"
            className="result-btn"
            onClick={() => {
              setSelectedOption(null);
              setHighlight(null);
            }}
          >
            Bỏ tô sáng
          </button>
        )}
      </section>
    </div>
  );
}

/** Bảng điều khiển Red Team của container đang xem — đọc phương án xếp có sẵn, không sửa gì ở thuật toán xếp. */
export function RedTeamPanel({ container, templatesById, innerWidth, onClose }: RedTeamPanelProps) {
  const built = useMemo(() => (container ? buildRedTeamScenario(container, templatesById, innerWidth) : null), [container, templatesById, innerWidth]);

  if (!container || !built?.scenario) {
    return (
      <div className="redteam-panel" role="region" aria-label="Red Team">
        <div className="redteam-head">
          <strong>Red Team — thử sự cố trên chuyến giao</strong>
          <button type="button" className="result-btn" onClick={onClose}>
            Đóng
          </button>
        </div>
        <p className="redteam-hint">{built?.note ?? 'Hãy tạo phương án xếp hàng trước, rồi mở Red Team để thử sự cố.'}</p>
      </div>
    );
  }

  // Đổi container hoặc phương án thì dựng lại toàn bộ trạng thái nhập (key đổi).
  const key = `${container.id}:${container.placements.length}:${container.placements[0]?.id ?? ''}:${built.scenario.pallets.map((p) => p.orderId).join(',').length}`;
  return (
    <>
      {built.note && <p className="redteam-hint redteam-note">{built.note}</p>}
      <RedTeamBody key={key} scenario={built.scenario} onClose={onClose} />
    </>
  );
}
