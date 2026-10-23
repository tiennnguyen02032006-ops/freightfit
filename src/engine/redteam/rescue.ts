import type {
  RedTeamHighlight,
  RedTeamIncident,
  RedTeamPallet,
  RedTeamReport,
  RedTeamRescueOption,
  RedTeamScenario,
} from '../../domain/types';
import { evaluate } from './evaluate';
import { REDTEAM_ASSUMPTIONS } from './defaults';
import { deliveryStopByOrder } from './simulate';

/**
 * Thứ tự dỡ thực tế của từng đơn (số nhỏ = dỡ sớm): chỉ số điểm dỡ, đơn "giao sớm" tính ngay SAU các đơn gốc của điểm đó
 * (cộng 0,5) — dùng để đổi sơ đồ xếp sao cho hàng dỡ sớm nằm gần cửa hơn.
 */
export function effectiveOrderRanks(scenario: RedTeamScenario, incidents: RedTeamIncident[]): Map<string, number> {
  const index = new Map(scenario.stops.map((s, i) => [s.id, i] as const));
  const deliveryStop = deliveryStopByOrder(scenario, incidents);
  const ranks = new Map<string, number>();
  for (const stop of scenario.stops) {
    const at = deliveryStop.get(stop.id) ?? stop.id;
    ranks.set(stop.id, (index.get(at) ?? 0) + (at === stop.id ? 0 : 0.5));
  }
  return ranks;
}

const footprintKey = (p: RedTeamPallet) => `${Math.round(p.length)}x${Math.round(p.width)}x${Math.round(p.height)}`;

/**
 * "Đổi sơ đồ xếp" (bestLayout): trong các pallet CÙNG kích thước, hoán đổi chỗ cho nhau sao cho đơn dỡ sớm chiếm các ô gần cửa
 * nhất (rồi tầng thấp, rồi làn). Hoán đổi các ô cùng kích thước nên không va chạm; CHƯA kiểm tra lại trọng tâm/tải
 * tầng — chỉ là đề xuất để xem xét. Không đổi thuật toán xếp hàng.
 */
export function improveLayout(pallets: RedTeamPallet[], ranks: Map<string, number>): { pallets: RedTeamPallet[]; moved: string[] } {
  const groups = new Map<string, RedTeamPallet[]>();
  for (const p of pallets) groups.set(footprintKey(p), [...(groups.get(footprintKey(p)) ?? []), p]);

  const next = new Map<string, RedTeamPallet>();
  const moved: string[] = [];
  for (const group of groups.values()) {
    const slots = group
      .map((p) => ({ x: p.x, y: p.y, z: p.z, lane: p.lane }))
      .sort((a, b) => a.x - b.x || a.z - b.z || a.y - b.y);
    const order = [...group].sort(
      (a, b) => (ranks.get(a.orderId) ?? 0) - (ranks.get(b.orderId) ?? 0) || a.x - b.x || a.z - b.z || a.y - b.y,
    );
    order.forEach((p, i) => {
      const slot = slots[i];
      const changed = slot.x !== p.x || slot.y !== p.y || slot.z !== p.z;
      if (changed) moved.push(p.id);
      next.set(p.id, changed ? { ...p, x: slot.x, y: slot.y, z: slot.z, lane: slot.lane } : p);
    });
  }
  return { pallets: pallets.map((p) => next.get(p.id) ?? p), moved };
}

/** Tô sáng từ tổ hợp tệ nhất của báo cáo: pallet bị chắn và pallet đang chắn. */
function highlightOf(report: RedTeamReport): RedTeamHighlight {
  const worst = report.combos[0]?.sim;
  return {
    blocked: Array.from(new Set(worst?.links.map((l) => l.blockedPalletId) ?? [])),
    blockers: Array.from(new Set(worst?.links.map((l) => l.blockerPalletId) ?? [])),
    moved: [],
  };
}

function summarize(report: RedTeamReport) {
  return {
    total: report.total,
    brokenCount: report.brokenCount,
    maxLateness: report.combos.reduce((m, c) => Math.max(m, c.sim.maxLateness), 0),
    totalLateness: report.combos.reduce((sum, c) => sum + c.sim.totalLateness, 0),
  };
}

/** Đơn nên tách: đơn đang bị đẩy giao sớm; nếu không có thì đơn chắn nhiều pallet nhất ở tổ hợp tệ nhất. */
function splitCandidate(scenario: RedTeamScenario, incidents: RedTeamIncident[], base: RedTeamReport): string | null {
  for (const i of incidents) {
    if (i.type === 'EXPEDITE' && scenario.stops.some((s) => s.id === i.orderId)) return i.orderId;
  }
  const counts = new Map<string, number>();
  for (const l of base.combos[0]?.sim.links ?? []) counts.set(l.blockerOrderId, (counts.get(l.blockerOrderId) ?? 0) + 1);
  const best = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : null;
}

/** Bỏ 1 điểm khỏi lộ trình (đơn tách sang chuyến phụ): chặng của điểm kế tiếp cộng thêm chặng bị bỏ. */
function removeStop(scenario: RedTeamScenario, orderId: string): RedTeamScenario {
  const stops = scenario.stops.map((s) => ({ ...s }));
  const i = stops.findIndex((s) => s.id === orderId);
  if (i < 0) return scenario;
  if (i + 1 < stops.length) stops[i + 1].legMinutes += stops[i].legMinutes;
  stops.splice(i, 1);
  return { ...scenario, stops, pallets: scenario.pallets.filter((p) => p.orderId !== orderId) };
}

/**
 * Đề xuất phương án cứu và CHẤM mỗi phương án trên mọi tổ hợp sự cố: giữ nguyên, đổi sơ đồ xếp, xuất phát sớm, tách đơn.
 * Phương án khuyến nghị = ít tổ hợp gãy nhất (rồi trễ tối đa thấp nhất); không khuyến nghị gì nếu giữ nguyên đã không gãy.
 */
export function buildRescueOptions(
  scenario: RedTeamScenario,
  incidents: RedTeamIncident[],
  earlyDepartMin: number = REDTEAM_ASSUMPTIONS.earlyDepartMinutes,
): RedTeamRescueOption[] {
  const baseReport = evaluate(scenario, incidents);
  const options: RedTeamRescueOption[] = [];
  const add = (
    option: Omit<RedTeamRescueOption, 'total' | 'brokenCount' | 'maxLateness' | 'totalLateness' | 'recommended' | 'highlight'>,
    report: RedTeamReport,
    highlight?: RedTeamHighlight,
  ) => options.push({ ...option, ...summarize(report), recommended: false, highlight: highlight ?? highlightOf(report) });

  add({ id: 'keep', kind: 'KEEP', title: 'Giữ nguyên', detail: 'Không thay đổi sơ đồ xếp, giờ xuất phát hay đơn hàng.', scenario }, baseReport);

  // bestLayout: thử các thứ tự dỡ khả dĩ (đúng kế hoạch, hoặc tính cả đơn giao sớm), chấm từng sơ đồ trên MỌI tổ hợp và chỉ
  // đề xuất sơ đồ tốt nhất nếu nó thật sự tốt hơn giữ nguyên — đưa đơn giao sớm ra gần cửa có thể làm đơn khác bị chắn.
  const baseScore = summarize(baseReport);
  const better = (x: ReturnType<typeof summarize>, y: ReturnType<typeof summarize>) =>
    x.brokenCount - y.brokenCount || x.maxLateness - y.maxLateness || x.totalLateness - y.totalLateness;
  let bestLayout: { scenario: RedTeamScenario; moved: string[]; report: RedTeamReport } | null = null;
  for (const ranks of [effectiveOrderRanks(scenario, []), effectiveOrderRanks(scenario, incidents)]) {
    const { pallets: improved, moved } = improveLayout(scenario.pallets, ranks);
    if (moved.length === 0) continue;
    const candidate = { ...scenario, pallets: improved };
    const report = evaluate(candidate, incidents);
    if (better(summarize(report), baseScore) >= 0) continue;
    if (!bestLayout || better(summarize(report), summarize(bestLayout.report)) < 0) bestLayout = { scenario: candidate, moved, report };
  }
  if (bestLayout) {
    add(
      {
        id: 'relayout',
        kind: 'RELAYOUT',
        title: 'Đổi sơ đồ xếp',
        detail: `Hoán đổi chỗ ${bestLayout.moved.length} pallet cùng kích thước để hàng dỡ sớm nằm gần cửa hơn. Cần kiểm tra lại trọng tâm/tải tầng trước khi áp dụng.`,
        scenario: bestLayout.scenario,
      },
      bestLayout.report,
      { ...highlightOf(bestLayout.report), moved: bestLayout.moved },
    );
  }

  if (earlyDepartMin > 0) {
    const early = { ...scenario, params: { ...scenario.params, departureAdvanceMin: scenario.params.departureAdvanceMin + earlyDepartMin } };
    add(
      { id: 'early-depart', kind: 'EARLY_DEPART', title: `Xuất phát sớm ${earlyDepartMin} phút`, detail: 'Giữ nguyên sơ đồ, xe rời kho sớm hơn kế hoạch để có thêm thời gian đệm.', scenario: early },
      evaluate(early, incidents),
      highlightOf(baseReport),
    );
  }

  const candidate = splitCandidate(scenario, incidents, baseReport);
  if (candidate && scenario.stops.length > 1) {
    const split = removeStop(scenario, candidate);
    const name = scenario.stops.find((s) => s.id === candidate)?.name ?? candidate;
    const splitIds = scenario.pallets.filter((p) => p.orderId === candidate).map((p) => p.id);
    add(
      { id: 'split', kind: 'SPLIT_ORDER', title: `Tách đơn ${name}`, detail: `Đơn ${name} đi chuyến phụ bằng xe khác (giả định giao đúng hạn); xe chính không phải dỡ lại pallet vì đơn này.`, scenario: split },
      evaluate(split, incidents),
      { ...highlightOf(baseReport), moved: splitIds },
    );
  }

  options.sort((a, b) => a.brokenCount - b.brokenCount || a.maxLateness - b.maxLateness || a.totalLateness - b.totalLateness);
  const keep = options.find((o) => o.kind === 'KEEP')!;
  if (keep.brokenCount > 0) {
    const best = options.find((o) => o.kind !== 'KEEP');
    if (best && (best.brokenCount < keep.brokenCount || best.maxLateness < keep.maxLateness)) best.recommended = true;
  }
  return options;
}
