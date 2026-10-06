import { describe, expect, it } from 'vitest';
import { generateSolution } from '../../src/engine/optimization/generateSolutions';
import { segregationNotesFor } from '../../src/engine/segregation';
import { makeCargoTemplate } from '../fixtures/cargo';
import { palletCarton } from '../fixtures/pallet';
import { smallTestContainer } from '../fixtures/containers';
import type { CargoTemplate, ContainerTemplate } from '../../src/domain/types';

const bigContainer: ContainerTemplate = { ...smallTestContainer, id: 'big', innerLength: 6000, innerWidth: 2400, innerHeight: 2400, maxPayload: 20000 };

const portItem = (id: string, destinationPort?: string, customer?: string, quantity = 3): CargoTemplate =>
  makeCargoTemplate({ id, sku: id.toUpperCase(), quantity, ...(destinationPort ? { destinationPort } : {}), ...(customer ? { customer } : {}) });

const idsIn = (container: { placements: Array<{ cargoTemplateId: string }> }) => new Set(container.placements.map((p) => p.cargoTemplateId));

describe('generateSolution — tách container theo cảng đích', () => {
  it('hai cảng đích khác nhau không bao giờ chung container', () => {
    const items = [portItem('a', 'Hải Phòng'), portItem('b', 'Cát Lái'), portItem('c', 'hải  phòng')];
    const portOf = new Map(items.map((t) => [t.id, t.destinationPort!.trim().replace(/\s+/g, ' ').toLowerCase()]));
    const solution = generateSolution(items, bigContainer);
    expect(solution.containers.length).toBeGreaterThanOrEqual(2);
    for (const c of solution.containers) {
      expect(new Set([...idsIn(c)].map((id) => portOf.get(id))).size).toBe(1);
    }
    // A và C cùng cảng (không phân biệt hoa thường/khoảng trắng) được chung container
    const withA = solution.containers.find((c) => idsIn(c).has('a'))!;
    expect(idsIn(withA).has('c')).toBe(true);
    expect(idsIn(withA).has('b')).toBe(false);
  });

  it('ghi lý do tách và cảng đích của từng container trong kế hoạch', () => {
    const solution = generateSolution([portItem('a', 'Hải Phòng'), portItem('b', 'Cát Lái')], bigContainer);
    expect(solution.segregation.reasons.some((r) => r.includes('khác cảng đích'))).toBe(true);
    expect(solution.segregation.sets.map((s) => s.destinationPort).sort()).toEqual(['Cát Lái', 'Hải Phòng']);
    const idOfA = solution.containers.find((c) => idsIn(c).has('a'))!.id;
    const notes = segregationNotesFor(solution.segregation, idOfA).join('\n');
    expect(notes).toContain('Cảng đích: Hải Phòng');
    expect(notes).toContain('khác cảng đích');
  });

  it('hàng chưa ghi cảng đích không chung container với hàng đã ghi cảng', () => {
    const solution = generateSolution([portItem('a', 'Hải Phòng'), portItem('b')], bigContainer);
    for (const c of solution.containers) expect(idsIn(c).size).toBe(1);
  });

  it('cùng cảng, khác khách hàng vẫn chung container; không có cảng nào -> không có lý do tách', () => {
    const same = generateSolution([portItem('a', 'Hải Phòng', 'X'), portItem('b', 'Hải Phòng', 'Y')], bigContainer);
    expect(same.containers).toHaveLength(1);
    expect(same.segregation.reasons).toEqual([]);
    const none = generateSolution([portItem('a'), portItem('b')], bigContainer);
    expect(none.segregation.reasons).toEqual([]);
  });

  it('kết hợp với nhóm tương thích: cùng cảng nhưng nhóm hàng xung đột vẫn tách container', () => {
    const food = { ...portItem('f', 'Hải Phòng'), cargoGroup: 'FOOD' as const };
    const smelly = { ...portItem('s', 'Hải Phòng'), cargoGroup: 'ODOROUS' as const };
    const solution = generateSolution([food, smelly], bigContainer, undefined, [{ a: 'FOOD', b: 'ODOROUS' }]);
    for (const c of solution.containers) expect(idsIn(c).size).toBe(1);
  });
});

describe('generateSolution — khách hàng trên pallet riêng, pallet cùng khách liền nhau', () => {
  const carton = (id: string, customer: string) => palletCarton({ id, sku: id.toUpperCase(), customer, quantity: 64 });
  // 2 mã hàng của khách Alpha, 1 mã của khách Beta, nhập xen kẽ
  const items = [carton('a1', 'Alpha'), carton('m1', 'Beta'), carton('z1', 'Alpha')];
  const solution = generateSolution(items, bigContainer);
  const customerOf = new Map(items.map((t) => [t.id, t.customer]));
  const pallets = solution.containers.flatMap((c) => c.placements.filter((p) => p.palletLoad));

  it('mỗi pallet chỉ chứa hàng của một khách hàng', () => {
    expect(pallets).toHaveLength(6);
    for (const p of pallets) {
      expect(customerOf.has(p.palletLoad!.cargoTemplateId)).toBe(true);
    }
    expect(solution.unfitCargo).toHaveLength(0);
  });

  it('các pallet cùng khách hàng đặt liền nhau (không bị khách khác xen giữa)', () => {
    expect(solution.containers).toHaveLength(1);
    // thứ tự từ vách trong ra cửa: x giảm dần (x = 0 là cửa), mỗi hàng đi theo y tăng dần
    const order = [...pallets].sort((a, b) => b.x - a.x || a.y - b.y).map((p) => customerOf.get(p.palletLoad!.cargoTemplateId));
    const runs = order.filter((c, i) => i === 0 || c !== order[i - 1]);
    expect(runs).toHaveLength(new Set(order).size);
  });

  it('kế hoạch ghi khách hàng nằm trên pallet riêng', () => {
    const notes = segregationNotesFor(solution.segregation, solution.containers[0].id).join('\n');
    expect(notes).toContain('Khách hàng: Alpha, Beta');
    expect(notes).toContain('pallet riêng');
  });
});
