import { describe, expect, it } from 'vitest';
import type { RedTeamIncident, RedTeamPallet, RedTeamScenario, RedTeamStop } from '../../../src/domain/types';
import { blockLink } from '../../../src/engine/redteam/blocking';
import { simulate } from '../../../src/engine/redteam/simulate';
import { evaluate, incidentCombos } from '../../../src/engine/redteam/evaluate';
import { buildRescueOptions, improveLayout, effectiveOrderRanks } from '../../../src/engine/redteam/rescue';
import { buildRedTeamScenario, orderKeyOf } from '../../../src/engine/redteam/fromSolution';
import { generateSolution } from '../../../src/engine/optimization/generateSolutions';
import { makeCargoTemplate } from '../../fixtures/cargo';
import { palletCarton } from '../../fixtures/pallet';
import { smallTestContainer } from '../../fixtures/containers';

const L = 1200;
const W = 800;

const pallet = (id: string, orderId: string, row: number, lane: 'LEFT' | 'RIGHT', z = 0): RedTeamPallet => ({
  id,
  label: id,
  orderId,
  lane,
  x: row * L,
  y: lane === 'LEFT' ? 0 : 1000,
  z,
  length: L,
  width: W,
  height: 1000,
});

// 5 điểm giao A, B, C, D, F (F là điểm thứ 5), mỗi đơn 2 pallet (trái + phải); A nằm gần cửa nhất, F sâu nhất (đúng thứ tự dỡ).
// Chặng đầu 30 phút, các chặng sau 15 phút, dỡ 10 phút/điểm, hạn = giờ xong kế hoạch + 15 phút dư.
function fixture(): RedTeamScenario {
  const orders = ['A', 'B', 'C', 'D', 'F'];
  const stops: RedTeamStop[] = [];
  let clock = 0;
  orders.forEach((id, i) => {
    const leg = i === 0 ? 30 : 15;
    clock += leg + 10;
    stops.push({ id, name: id, legMinutes: leg, unloadMinutes: 10, deadlineMin: clock + 15 });
  });
  const pallets = orders.flatMap((id, row) => [pallet(`${id}-L`, id, row, 'LEFT'), pallet(`${id}-R`, id, row, 'RIGHT')]);
  return { stops, pallets, params: { rehandleMinPerPallet: 2, extraUnloadMinPerPallet: 2.5, departureAdvanceMin: 0 } };
}

const delay15: RedTeamIncident = { id: 'delay15', label: 'Chậm 15 phút', type: 'DELAY', minutes: 15, leg: 1 };
const expediteF: RedTeamIncident = { id: 'f-early', label: 'Giao F sớm', type: 'EXPEDITE', orderId: 'F', atPosition: 2 };

describe('blockLink', () => {
  it('pallet gần cửa hơn cùng làn chắn pallet phía sau; khác làn thì không', () => {
    const near = pallet('n', 'A', 0, 'LEFT');
    const far = pallet('f', 'B', 1, 'LEFT');
    const farRight = pallet('fr', 'B', 1, 'RIGHT');
    expect(blockLink(near, far)).toMatchObject({ kind: 'DOOR', lane: 'LEFT', blockerPalletId: 'n', blockedPalletId: 'f' });
    expect(blockLink(near, farRight)).toBeNull();
    expect(blockLink(far, near)).toBeNull(); // pallet phía sau không chắn pallet gần cửa
  });

  it('pallet nằm đè phía trên chắn pallet bên dưới; cùng đơn không chắn nhau', () => {
    const below = pallet('b', 'A', 2, 'LEFT');
    const above = pallet('t', 'B', 2, 'LEFT', 1000);
    expect(blockLink(above, below)).toMatchObject({ kind: 'TOP' });
    expect(blockLink(pallet('x', 'A', 0, 'LEFT'), pallet('y', 'A', 1, 'LEFT'))).toBeNull();
  });
});

describe('simulate', () => {
  it('chuyến đúng thứ tự dỡ, không sự cố: không pallet nào bị chắn, mọi điểm kịp hạn', () => {
    const sim = simulate(fixture(), []);
    expect(sim.links).toHaveLength(0);
    expect(sim.brokenOrderIds).toEqual([]);
    expect(sim.firstBreakStopId).toBeNull();
    expect(sim.events.map((e) => e.finish)).toEqual([40, 65, 90, 115, 140]);
  });

  it('chậm 15 phút một mình hoặc giao F sớm một mình đều chưa làm điểm nào gãy', () => {
    expect(simulate(fixture(), [delay15]).brokenOrderIds).toEqual([]);
    expect(simulate(fixture(), [expediteF]).brokenOrderIds).toEqual([]);
  });

  it('chậm 15 phút cộng giao F sớm: gãy ở điểm 2 (B), kèm giải thích đơn bị chắn', () => {
    const sim = simulate(fixture(), [delay15, expediteF]);
    expect(sim.firstBreakStopId).toBe('B');
    expect(sim.events.find((e) => e.stopId === 'B')?.plannedPosition).toBe(2);
    expect(sim.brokenOrderIds).toContain('B');
    // F nằm sâu nhất nên bị C và D chắn khi dỡ sớm ở điểm 2; B chắn... không, B được dỡ cùng lúc
    const links = sim.events.find((e) => e.stopId === 'B')!.blocked;
    expect(links.length).toBeGreaterThan(0);
    expect(links.every((l) => l.blockedOrderId === 'F' && ['C', 'D'].includes(l.blockerOrderId))).toBe(true);
    const text = sim.explanation.join('\n');
    expect(text).toContain('Gãy đầu tiên ở Điểm 2 (B)');
    expect(text).toContain('bị chắn bởi đơn');
    expect(sim.causes.some((c) => c.kind === 'DELAY')).toBe(true);
    expect(sim.causes.some((c) => c.kind === 'REHANDLE')).toBe(true);
  });

  it('đơn giao sớm được dỡ ở điểm sớm, điểm gốc của nó không còn dỡ nữa', () => {
    const sim = simulate(fixture(), [expediteF]);
    const b = sim.events.find((e) => e.stopId === 'B')!;
    expect(b.orders.map((o) => o.orderId).sort()).toEqual(['B', 'F']);
    const f = sim.events.find((e) => e.stopId === 'F')!;
    expect(f.orders).toEqual([]);
    expect(f.finish - f.arrival).toBe(0);
  });

  it('xuất phát muộn và dỡ chậm cộng dồn vào giờ xong', () => {
    const sim = simulate(fixture(), [
      { id: 'late', label: 'Muộn', type: 'LATE_DEPART', minutes: 10 },
      { id: 'slow', label: 'Chậm', type: 'SLOW_UNLOAD', percent: 50 },
    ]);
    expect(sim.events[0].finish).toBe(10 + 30 + 15);
    expect(sim.brokenOrderIds.length).toBeGreaterThan(0);
  });
});

describe('evaluate', () => {
  const incidents = [delay15, expediteF, { id: 'slow', label: 'Dỡ chậm 30%', type: 'SLOW_UNLOAD', percent: 30 } as RedTeamIncident];

  it('chạy mọi tổ hợp (2^n kể cả không sự cố)', () => {
    expect(incidentCombos(incidents)).toHaveLength(8);
    const report = evaluate(fixture(), incidents);
    expect(report.total).toBe(8);
    expect(report.combos.some((c) => c.incidentIds.length === 0)).toBe(true);
  });

  it('bảng điểm gãy xếp theo mức trễ giảm dần và ghi tổ hợp tệ nhất', () => {
    const report = evaluate(fixture(), incidents);
    expect(report.brokenCount).toBeGreaterThan(0);
    const lateness = report.breakTable.map((r) => r.maxLateness);
    expect([...lateness].sort((a, b) => b - a)).toEqual(lateness);
    expect(report.breakTable.some((r) => r.orderId === 'B')).toBe(true);
    expect(report.combos[0].sim.maxLateness).toBe(Math.max(...report.combos.map((c) => c.sim.maxLateness)));
  });
});

describe('phương án cứu', () => {
  const incidents = [delay15, expediteF];

  it('improveLayout đưa đơn dỡ sớm (kể cả F giao sớm) ra gần cửa, chỉ hoán đổi pallet cùng kích thước', () => {
    const scenario = fixture();
    const { pallets, moved } = improveLayout(scenario.pallets, effectiveOrderRanks(scenario, incidents));
    expect(moved.length).toBeGreaterThan(0);
    const xOf = (order: string) => Math.max(...pallets.filter((p) => p.orderId === order).map((p) => p.x));
    expect(xOf('F')).toBeLessThan(xOf('C'));
    expect(xOf('F')).toBeLessThan(xOf('D'));
    // không hai pallet nào trùng ô
    const cells = pallets.map((p) => `${p.x}/${p.y}/${p.z}`);
    expect(new Set(cells).size).toBe(cells.length);
  });

  // Sơ đồ xếp NGƯỢC: F nằm gần cửa nhất, A sâu nhất — trong khi kế hoạch giao A trước.
  function reversedLayout(): RedTeamScenario {
    const base = fixture();
    const rowOf = new Map([['A', 4], ['B', 3], ['C', 2], ['D', 1], ['F', 0]]);
    return { ...base, pallets: base.pallets.map((p) => ({ ...p, x: rowOf.get(p.orderId)! * L })) };
  }

  it('chấm mọi phương án trên mọi tổ hợp; đổi sơ đồ, xuất phát sớm và tách đơn đều tốt hơn giữ nguyên', () => {
    const options = buildRescueOptions(reversedLayout(), incidents);
    const keep = options.find((o) => o.kind === 'KEEP')!;
    const relayout = options.find((o) => o.kind === 'RELAYOUT')!;
    const early = options.find((o) => o.kind === 'EARLY_DEPART')!;
    const split = options.find((o) => o.kind === 'SPLIT_ORDER')!;
    expect(options.every((o) => o.total === 4)).toBe(true);
    expect(keep.brokenCount).toBeGreaterThan(0);
    expect(relayout.brokenCount).toBeLessThan(keep.brokenCount);
    expect(relayout.maxLateness).toBeLessThan(keep.maxLateness);
    expect(early.maxLateness).toBeLessThan(keep.maxLateness);
    expect(split.maxLateness).toBeLessThan(keep.maxLateness);
    expect(options.filter((o) => o.recommended)).toHaveLength(1);
    expect(options[0].kind).not.toBe('KEEP');
    expect(options.find((o) => o.recommended)).toBe(options[0]);
    expect(relayout.highlight.moved.length).toBeGreaterThan(0);
    expect(keep.highlight.blocked.length).toBeGreaterThan(0);
    expect(keep.highlight.blockers.length).toBeGreaterThan(0);
    expect(split.highlight.moved.sort()).toEqual(['F-L', 'F-R']);
    // tách đơn F: điểm F rời khỏi lộ trình của xe chính
    expect(split.scenario.stops.map((st) => st.id)).not.toContain('F');
  });

  it('không đề xuất đổi sơ đồ khi nó làm tổ hợp khác tệ đi (đưa F giao sớm ra gần cửa làm C, D bị chắn)', () => {
    const options = buildRescueOptions(fixture(), incidents);
    expect(options.find((o) => o.kind === 'RELAYOUT')).toBeUndefined();
    const keep = options.find((o) => o.kind === 'KEEP')!;
    const split = options.find((o) => o.kind === 'SPLIT_ORDER')!;
    expect(split.brokenCount).toBeLessThan(keep.brokenCount);
  });

  it('xuất phát sớm cho thêm thời gian đệm nhưng không gỡ được pallet bị chắn', () => {
    const options = buildRescueOptions(fixture(), incidents, 15);
    const early = options.find((o) => o.kind === 'EARLY_DEPART')!;
    const keep = options.find((o) => o.kind === 'KEEP')!;
    expect(early.maxLateness).toBeLessThan(keep.maxLateness);
    expect(early.highlight.blockers).toEqual(keep.highlight.blockers);
  });

  it('không khuyến nghị gì khi giữ nguyên đã không gãy ở mọi tổ hợp', () => {
    const options = buildRescueOptions(fixture(), [{ id: 'late', label: 'Muộn 1 phút', type: 'LATE_DEPART', minutes: 1 }]);
    expect(options.find((o) => o.kind === 'KEEP')!.brokenCount).toBe(0);
    expect(options.some((o) => o.recommended)).toBe(false);
  });
});

describe('buildRedTeamScenario — từ phương án xếp thật', () => {
  const bigContainer = { ...smallTestContainer, id: 'big', innerLength: 6000, innerWidth: 2400, innerHeight: 2400, maxPayload: 20000 };
  const items = [
    palletCarton({ id: 'c1', sku: 'C1', customer: 'Alpha', quantity: 64 }),
    palletCarton({ id: 'c2', sku: 'C2', customer: 'Beta', quantity: 64 }),
    palletCarton({ id: 'c3', sku: 'C3', customer: 'Gamma', quantity: 64 }),
  ];
  const solution = generateSolution(items, bigContainer);
  const templatesById = new Map(items.map((t) => [t.id, t]));

  it('mỗi khách là một điểm giao, vị trí pallet lấy nguyên từ phương án (x tính từ cửa)', () => {
    const { scenario } = buildRedTeamScenario(solution.containers[0], templatesById, bigContainer.innerWidth);
    expect(scenario).not.toBeNull();
    expect(scenario!.stops.map((s) => s.id).sort()).toEqual(['Alpha', 'Beta', 'Gamma']);
    const real = solution.containers[0].placements.filter((p) => p.palletLoad);
    expect(scenario!.pallets).toHaveLength(real.length);
    for (const p of scenario!.pallets) {
      const source = real.find((r) => r.id === p.id)!;
      expect([p.x, p.y, p.z]).toEqual([source.x, source.y, source.z]);
      expect(p.lane).toBe(source.y + source.width / 2 < bigContainer.innerWidth / 2 ? 'LEFT' : 'RIGHT');
    }
    // điểm giao đầu tiên là nhóm gần cửa nhất
    const meanX = (id: string) => {
      const ps = scenario!.pallets.filter((p) => p.orderId === id);
      return ps.reduce((s, p) => s + p.x, 0) / ps.length;
    };
    const ids = scenario!.stops.map((s) => s.id);
    expect([...ids].sort((a, b) => meanX(a) - meanX(b))).toEqual(ids);
    // mặc định giao theo thứ tự gần cửa -> không có pallet bị chắn
    expect(simulate(scenario!, []).links).toHaveLength(0);
  });

  it('orderKeyOf ưu tiên điểm giao, rồi khách hàng, rồi SKU', () => {
    expect(orderKeyOf(makeCargoTemplate({ sku: 'S', customer: 'K', deliveryPoint: 'P' }))).toBe('P');
    expect(orderKeyOf(makeCargoTemplate({ sku: 'S', customer: 'K' }))).toBe('K');
    expect(orderKeyOf(makeCargoTemplate({ sku: 'S' }))).toBe('S');
  });

  it('container trống thì không có kịch bản', () => {
    const empty = generateSolution([], bigContainer).containers[0];
    expect(buildRedTeamScenario(empty, templatesById, bigContainer.innerWidth).scenario).toBeNull();
  });
});
