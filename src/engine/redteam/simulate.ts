import type {
  RedTeamBlockLink,
  RedTeamCause,
  RedTeamIncident,
  RedTeamOrderResult,
  RedTeamPallet,
  RedTeamScenario,
  RedTeamSimResult,
  RedTeamStopEvent,
} from '../../domain/types';
import { findBlockLinks } from './blocking';

const fmt = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

/**
 * Mỗi đơn được dỡ ở điểm nào: mặc định ở đúng điểm của nó; đơn bị EXPEDITE ("giao sớm") được dỡ cùng điểm thứ
 * `atPosition` — chỉ có tác dụng khi điểm đó nằm TRƯỚC điểm gốc của đơn. Lộ trình không đổi.
 */
export function deliveryStopByOrder(scenario: RedTeamScenario, incidents: RedTeamIncident[]): Map<string, string> {
  const stops = scenario.stops;
  const index = new Map(stops.map((s, i) => [s.id, i] as const));
  const result = new Map(stops.map((s) => [s.id, s.id] as const));
  for (const incident of incidents) {
    if (incident.type !== 'EXPEDITE') continue;
    const own = index.get(incident.orderId);
    if (own === undefined) continue;
    const target = Math.min(Math.max(Math.round(incident.atPosition), 1), stops.length) - 1;
    const current = index.get(result.get(incident.orderId)!)!;
    if (target < own && target < current) result.set(incident.orderId, stops[target].id);
  }
  return result;
}

/**
 * Mô phỏng 1 chuyến theo luật (số liệu giả định): xe đi qua các điểm theo thứ tự kế hoạch; tại mỗi điểm dỡ hàng của các đơn
 * được giao ở đó, và PHẢI dỡ ra rồi xếp lại mọi pallet còn trên xe đang chắn các pallet cần lấy (`rehandleMinPerPallet`
 * mỗi pallet). Một đơn "trễ" khi xong dỡ muộn hơn hạn giao của chính đơn đó.
 */
export function simulate(scenario: RedTeamScenario, incidents: RedTeamIncident[] = []): RedTeamSimResult {
  const { stops, pallets, params } = scenario;
  const stopIndex = new Map(stops.map((s, i) => [s.id, i] as const));
  const nameOf = (id: string) => stops.find((s) => s.id === id)?.name ?? id;
  const palletById = new Map(pallets.map((p) => [p.id, p] as const));
  const deliveryStop = deliveryStopByOrder(scenario, incidents);
  const deliveredAtIndex = (p: RedTeamPallet) => stopIndex.get(deliveryStop.get(p.orderId) ?? p.orderId) ?? 0;

  const slowFactor = incidents.reduce((sum, i) => sum + (i.type === 'SLOW_UNLOAD' ? i.percent / 100 : 0), 0);
  const lateDepart = incidents.reduce((sum, i) => sum + (i.type === 'LATE_DEPART' ? i.minutes : 0), 0);

  const causes: Array<RedTeamCause & { eventIndex: number }> = [];
  let t = -params.departureAdvanceMin + lateDepart;
  const startMin = t;
  if (params.departureAdvanceMin > 0) {
    causes.push({ kind: 'LATE_DEPART', minutes: -params.departureAdvanceMin, text: `Xuất phát sớm ${fmt(params.departureAdvanceMin)} phút`, eventIndex: 0 });
  }
  for (const i of incidents) {
    if (i.type === 'LATE_DEPART' && i.minutes !== 0) {
      causes.push({ kind: 'LATE_DEPART', minutes: i.minutes, text: `${i.label}: +${fmt(i.minutes)} phút`, eventIndex: 0 });
    }
  }

  const events: RedTeamStopEvent[] = [];
  const allLinks: RedTeamBlockLink[] = [];

  stops.forEach((stop, i) => {
    const delay = incidents.reduce((sum, inc) => sum + (inc.type === 'DELAY' && inc.leg === i + 1 ? inc.minutes : 0), 0);
    for (const inc of incidents) {
      if (inc.type === 'DELAY' && inc.leg === i + 1 && inc.minutes !== 0) {
        causes.push({ kind: 'DELAY', minutes: inc.minutes, stopId: stop.id, text: `${inc.label} (chặng ${i + 1}): +${fmt(inc.minutes)} phút`, eventIndex: i });
      }
    }
    const arrival = t + stop.legMinutes + delay;

    const drop = pallets.filter((p) => deliveredAtIndex(p) === i);
    const own = drop.filter((p) => p.orderId === stop.id);
    const extra = drop.filter((p) => p.orderId !== stop.id);
    const ownTotal = pallets.filter((p) => p.orderId === stop.id).length;
    const baseUnload = ownTotal === 0 || own.length > 0 ? stop.unloadMinutes : 0;
    const extraUnload = extra.length * params.extraUnloadMinPerPallet;

    if (extra.length > 0) {
      const orders = Array.from(new Set(extra.map((p) => nameOf(p.orderId)))).join(', ');
      causes.push({
        kind: 'EXPEDITE',
        minutes: extraUnload,
        stopId: stop.id,
        text: `Đơn ${orders} giao sớm tại Điểm ${i + 1}: dỡ thêm ${extra.length} pallet (+${fmt(extraUnload)} phút)`,
        eventIndex: i,
      });
    }
    const slowExtra = (baseUnload + extraUnload) * slowFactor;
    if (slowExtra > 0) {
      causes.push({ kind: 'SLOW_UNLOAD', minutes: slowExtra, stopId: stop.id, text: `Dỡ hàng chậm tại Điểm ${i + 1}: +${fmt(slowExtra)} phút`, eventIndex: i });
    }

    // Pallet còn trên xe sau điểm này (giao ở điểm sau) mà chắn pallet cần lấy ra bây giờ.
    const remaining = pallets.filter((p) => deliveredAtIndex(p) > i);
    const links = findBlockLinks(remaining, drop);
    const blockerIds = Array.from(new Set(links.map((l) => l.blockerPalletId)));
    const rehandleMin = blockerIds.length * params.rehandleMinPerPallet;
    if (blockerIds.length > 0) {
      const byOrder = new Map<string, string[]>();
      for (const id of blockerIds) {
        const p = palletById.get(id)!;
        byOrder.set(p.orderId, [...(byOrder.get(p.orderId) ?? []), p.label]);
      }
      const detail = Array.from(byOrder.entries()).map(([o, labels]) => `${nameOf(o)}: ${labels.join(', ')}`).join('; ');
      causes.push({
        kind: 'REHANDLE',
        minutes: rehandleMin,
        stopId: stop.id,
        text: `Dỡ/xếp lại ${blockerIds.length} pallet đang chắn tại Điểm ${i + 1} (${detail}): +${fmt(rehandleMin)} phút`,
        eventIndex: i,
      });
    }

    const finish = arrival + (baseUnload + extraUnload + slowExtra) + rehandleMin;

    const deliveredOrders = Array.from(new Set(drop.map((p) => p.orderId)));
    if (ownTotal === 0) deliveredOrders.push(stop.id);
    const orders: RedTeamOrderResult[] = deliveredOrders.map((orderId) => {
      const deadlineMin = stops[stopIndex.get(orderId) ?? i].deadlineMin;
      return { orderId, deadlineMin, lateness: Math.max(0, finish - deadlineMin) };
    });

    allLinks.push(...links);
    events.push({
      stopId: stop.id,
      name: stop.name,
      position: i + 1,
      plannedPosition: i + 1,
      arrival,
      finish,
      orders,
      lateness: orders.reduce((m, o) => Math.max(m, o.lateness), 0),
      rehandleMin,
      blocked: links,
    });
    t = finish;
  });

  const broken = events.flatMap((e) => e.orders.filter((o) => o.lateness > 0));
  const brokenOrderIds = Array.from(new Set(broken.map((o) => o.orderId)));
  const firstBreak = events.find((e) => e.lateness > 0) ?? null;
  const upTo = firstBreak ? firstBreak.position - 1 : events.length - 1;
  const usedCauses: RedTeamCause[] = causes
    .filter((c) => c.eventIndex <= upTo)
    .map((c) => ({ kind: c.kind, minutes: c.minutes, text: c.text, ...(c.stopId ? { stopId: c.stopId } : {}) }));

  const seen = new Set<string>();
  const links = allLinks.filter((l) => {
    const key = `${l.blockedPalletId}>${l.blockerPalletId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const result: RedTeamSimResult = {
    incidentIds: incidents.map((i) => i.id),
    startMin,
    events,
    brokenOrderIds,
    firstBreakStopId: firstBreak?.stopId ?? null,
    maxLateness: events.reduce((m, e) => Math.max(m, e.lateness), 0),
    totalLateness: broken.reduce((sum, o) => sum + o.lateness, 0),
    links,
    causes: usedCauses,
    explanation: [],
  };
  result.explanation = explain(scenario, result, palletById);
  return result;
}

function explain(scenario: RedTeamScenario, sim: RedTeamSimResult, palletById: Map<string, RedTeamPallet>): string[] {
  const nameOf = (id: string) => scenario.stops.find((s) => s.id === id)?.name ?? id;
  const lines: string[] = [];
  const first = sim.events.find((e) => e.lateness > 0);
  if (!first) {
    const tightest = sim.events
      .flatMap((e) => e.orders.map((o) => ({ e, slack: o.deadlineMin - e.finish })))
      .sort((a, b) => a.slack - b.slack)[0];
    lines.push('Không có điểm nào trễ hạn trong tổ hợp sự cố này.');
    if (tightest) lines.push(`Điểm sát hạn nhất: Điểm ${tightest.e.plannedPosition} (${tightest.e.name}), còn dư ${fmt(tightest.slack)} phút.`);
    return lines;
  }
  const order = first.orders.filter((o) => o.lateness > 0).sort((a, b) => b.lateness - a.lateness)[0];
  lines.push(
    `Gãy đầu tiên ở Điểm ${first.plannedPosition} (${first.name}): xong lúc phút ${fmt(first.finish)}, hạn ${fmt(order.deadlineMin)} → trễ ${fmt(order.lateness)} phút.`,
  );
  if (sim.causes.length > 0) {
    lines.push('Nguyên nhân cộng dồn tới điểm này:');
    for (const c of sim.causes) lines.push(`• ${c.text}`);
  }
  const shown = new Set<string>();
  for (const e of sim.events) {
    if (e.position > first.position) break;
    for (const l of e.blocked) {
      const key = `${l.blockedPalletId}>${l.blockerPalletId}`;
      if (shown.has(key) || shown.size >= 6) continue;
      shown.add(key);
      const blocked = palletById.get(l.blockedPalletId);
      const blocker = palletById.get(l.blockerPalletId);
      lines.push(
        `• Đơn ${nameOf(l.blockedOrderId)} (pallet ${blocked?.label ?? l.blockedPalletId}) bị chắn bởi đơn ${nameOf(l.blockerOrderId)} (pallet ${blocker?.label ?? l.blockerPalletId}) — ${l.kind === 'TOP' ? 'nằm đè phía trên' : `nằm gần cửa hơn ở làn ${l.lane === 'LEFT' ? 'trái' : 'phải'}`}.`,
      );
    }
  }
  const others = sim.brokenOrderIds.filter((id) => id !== order.orderId);
  if (others.length > 0) lines.push(`Các đơn khác cũng trễ: ${others.map(nameOf).join(', ')}.`);
  return lines;
}
