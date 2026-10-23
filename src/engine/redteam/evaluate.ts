import type { RedTeamBreakRow, RedTeamComboResult, RedTeamIncident, RedTeamReport, RedTeamScenario } from '../../domain/types';
import { simulate } from './simulate';

// Số sự cố tối đa tham gia tổ hợp (2^8 = 256 tổ hợp) — giữ thời gian chạy tức thì trên giao diện.
export const MAX_REDTEAM_INCIDENTS = 8;

/** Mọi tập con của danh sách sự cố, kể cả tập rỗng ("không sự cố"), xếp theo số sự cố tăng dần. */
export function incidentCombos(incidents: RedTeamIncident[]): RedTeamIncident[][] {
  const list = incidents.slice(0, MAX_REDTEAM_INCIDENTS);
  const combos: RedTeamIncident[][] = [];
  for (let mask = 0; mask < 1 << list.length; mask++) {
    combos.push(list.filter((_, i) => (mask >> i) & 1));
  }
  return combos.sort((a, b) => a.length - b.length);
}

export function comboLabel(combo: RedTeamIncident[]): string {
  return combo.length === 0 ? 'Không sự cố' : combo.map((i) => i.label).join(' + ');
}

/**
 * Chạy MỌI tổ hợp sự cố trên kịch bản, trả về bảng điểm gãy (đơn trễ hạn) xếp theo mức trễ giảm dần và danh sách tổ hợp
 * xếp từ tệ nhất.
 */
export function evaluate(scenario: RedTeamScenario, incidents: RedTeamIncident[]): RedTeamReport {
  const combos: RedTeamComboResult[] = incidentCombos(incidents).map((combo) => ({
    incidentIds: combo.map((i) => i.id),
    label: comboLabel(combo),
    sim: simulate(scenario, combo),
  }));

  combos.sort(
    (a, b) =>
      b.sim.maxLateness - a.sim.maxLateness ||
      b.sim.totalLateness - a.sim.totalLateness ||
      b.sim.links.length - a.sim.links.length ||
      a.incidentIds.length - b.incidentIds.length,
  );

  const rows = new Map<string, RedTeamBreakRow>();
  for (const combo of combos) {
    for (const event of combo.sim.events) {
      for (const order of event.orders) {
        if (order.lateness <= 0) continue;
        const row = rows.get(order.orderId) ?? {
          orderId: order.orderId,
          name: scenario.stops.find((s) => s.id === order.orderId)?.name ?? order.orderId,
          breakCount: 0,
          maxLateness: 0,
          worstComboLabel: combo.label,
        };
        row.breakCount += 1;
        if (order.lateness > row.maxLateness) {
          row.maxLateness = order.lateness;
          row.worstComboLabel = combo.label;
        }
        rows.set(order.orderId, row);
      }
    }
  }

  return {
    total: combos.length,
    brokenCount: combos.filter((c) => c.sim.brokenOrderIds.length > 0).length,
    combos,
    breakTable: Array.from(rows.values()).sort((a, b) => b.maxLateness - a.maxLateness || b.breakCount - a.breakCount),
  };
}
