import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SEGREGATION_RULES,
  buildSegregationPlan,
  groupKeyOf,
  groupsConflict,
  partitionCompatibleSets,
  segregationNotesFor,
  validateNewRule,
} from '../../src/engine/segregation';
import { generateSolution } from '../../src/engine/optimization/generateSolutions';
import { parseCargoGroup } from '../../src/import/parseExcel';
import { makeCargoTemplate } from '../fixtures/cargo';
import { smallTestContainer } from '../fixtures/containers';
import type { CargoTemplate, SegregationRule } from '../../src/domain/types';

const food = makeCargoTemplate({ id: 'food', sku: 'FOOD-1', cargoGroup: 'FOOD' });
const smelly = makeCargoTemplate({ id: 'smelly', sku: 'ODOR-1', cargoGroup: 'ODOROUS' });
const dg3 = makeCargoTemplate({ id: 'dg3', sku: 'DG-3', cargoGroup: 'DANGEROUS', dangerClass: 3 });
const general = makeCargoTemplate({ id: 'general', sku: 'GEN-1' });

function containerGroups(templates: CargoTemplate[], rules: SegregationRule[]) {
  const solution = generateSolution(templates, smallTestContainer, undefined, rules);
  return {
    solution,
    perContainer: solution.containers.map((c) => {
      const ids = new Set(c.placements.map((p) => p.cargoTemplateId.replace(/__pallet$/, '')));
      return templates.filter((t) => ids.has(t.id)).map(groupKeyOf);
    }),
  };
}

describe('groupsConflict / validateNewRule', () => {
  it('cặp mặc định xung đột không phân biệt thứ tự, DANGEROUS khớp mọi lớp', () => {
    expect(groupsConflict('FOOD', 'ODOROUS', DEFAULT_SEGREGATION_RULES)).toBe(true);
    expect(groupsConflict('ODOROUS', 'FOOD', DEFAULT_SEGREGATION_RULES)).toBe(true);
    expect(groupsConflict('FOOD', 'DG8', DEFAULT_SEGREGATION_RULES)).toBe(true);
  });

  it('nhóm không có quy tắc, hoặc cùng một nhóm, không xung đột', () => {
    expect(groupsConflict('FOOD', 'GENERAL', DEFAULT_SEGREGATION_RULES)).toBe(false);
    expect(groupsConflict('FOOD', 'FOOD', DEFAULT_SEGREGATION_RULES)).toBe(false);
  });

  it('validateNewRule chặn quy tắc trùng và hai nhóm giống nhau', () => {
    expect(validateNewRule(DEFAULT_SEGREGATION_RULES, 'ODOROUS', 'FOOD')).not.toBeNull();
    expect(validateNewRule([], 'FOOD', 'FOOD')).not.toBeNull();
    expect(validateNewRule([], 'FOOD', 'GENERAL')).toBeNull();
  });
});

describe('partitionCompatibleSets', () => {
  it('không có xung đột -> đúng 1 bộ', () => {
    expect(partitionCompatibleSets([food, general], DEFAULT_SEGREGATION_RULES)).toHaveLength(1);
  });

  it('thực phẩm + hàng có mùi + hàng nguy hiểm -> mỗi bộ không chứa cặp xung đột', () => {
    const sets = partitionCompatibleSets([food, smelly, dg3, general], DEFAULT_SEGREGATION_RULES);
    expect(sets.length).toBeGreaterThan(1);
    for (const set of sets) {
      for (const a of set.groupKeys) {
        for (const b of set.groupKeys) expect(groupsConflict(a, b, DEFAULT_SEGREGATION_RULES)).toBe(false);
      }
    }
    expect(sets.flatMap((s) => s.templateIds).sort()).toEqual(['dg3', 'food', 'general', 'smelly']);
  });
});

describe('generateSolution — tách nhóm xung đột', () => {
  it('hai nhóm xung đột không bao giờ nằm chung một container', () => {
    const items = [food, smelly, dg3, general].map((t) => ({ ...t, quantity: 3 }));
    const { perContainer, solution } = containerGroups(items, DEFAULT_SEGREGATION_RULES);
    expect(solution.containers.length).toBeGreaterThan(1);
    for (const groups of perContainer) {
      for (const a of groups) for (const b of groups) expect(groupsConflict(a, b, DEFAULT_SEGREGATION_RULES)).toBe(false);
    }
    const total = solution.containers.reduce((n, c) => n + c.placements.length, 0);
    expect(total + solution.unfitCargo.reduce((n, u) => n + u.quantity, 0)).toBe(12);
  });

  it('ngẫu nhiên: mọi tổ hợp nhóm/số lượng đều không có container chứa cặp xung đột', () => {
    const pool = [food, smelly, dg3, general, makeCargoTemplate({ id: 'chem', sku: 'CHEM', cargoGroup: 'CHEMICAL' })];
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let round = 0; round < 25; round++) {
      const items = pool.filter(() => rand() > 0.3).map((t) => ({ ...t, quantity: 1 + Math.floor(rand() * 8) }));
      if (items.length === 0) continue;
      const { perContainer } = containerGroups(items, DEFAULT_SEGREGATION_RULES);
      for (const groups of perContainer) {
        for (const a of groups) for (const b of groups) expect(groupsConflict(a, b, DEFAULT_SEGREGATION_RULES)).toBe(false);
      }
    }
  });

  it('có quy tắc xung đột thì ghi lý do tách và lời nhắc IMDG; id container liên tục', () => {
    const { solution } = containerGroups([food, smelly], DEFAULT_SEGREGATION_RULES);
    expect(solution.segregation.reasons.length).toBe(1);
    expect(solution.segregation.reasons[0]).toContain('FOOD-1');
    expect(solution.segregation.reasons[0]).toContain('ODOR-1');
    expect(solution.segregation.sets).toHaveLength(2);
    const ids = solution.containers.map((c) => c.id);
    expect(ids).toEqual(ids.map((_, i) => `container-${i + 1}`));
    const notes = segregationNotesFor(solution.segregation, ids[0]);
    expect(notes.some((n) => n.includes('Nhóm hàng trong container này'))).toBe(true);
  });

  it('không có quy tắc (bảng rỗng) thì hai nhóm được chung container, không có lý do tách', () => {
    const { solution } = containerGroups([food, smelly], []);
    expect(solution.segregation.reasons).toHaveLength(0);
    expect(solution.segregation.sets).toHaveLength(1);
    expect(solution.containers).toHaveLength(1);
  });

  it('chỉ hàng thường -> không có ghi chú tách nhóm', () => {
    const { solution } = containerGroups([general], DEFAULT_SEGREGATION_RULES);
    expect(segregationNotesFor(solution.segregation, solution.containers[0].id)).toEqual([]);
  });
});

describe('buildSegregationPlan', () => {
  it('ghi đúng container của từng bộ', () => {
    const sets = partitionCompatibleSets([food, smelly], DEFAULT_SEGREGATION_RULES);
    const plan = buildSegregationPlan(sets, [food, smelly], DEFAULT_SEGREGATION_RULES, [['container-1'], ['container-2']]);
    expect(plan.sets.map((s) => s.containerIds)).toEqual([['container-1'], ['container-2']]);
  });
});

describe('parseCargoGroup (Excel)', () => {
  it('trống = hàng thường', () => {
    expect(parseCargoGroup('', '')).toEqual({ ok: true });
  });

  it('đọc tiếng Việt có/không dấu', () => {
    expect(parseCargoGroup('Thực phẩm')).toEqual({ ok: true, cargoGroup: 'FOOD' });
    expect(parseCargoGroup('hang co mui')).toEqual({ ok: true, cargoGroup: 'ODOROUS' });
    expect(parseCargoGroup('Hóa chất')).toEqual({ ok: true, cargoGroup: 'CHEMICAL' });
  });

  it('hàng nguy hiểm đọc lớp từ cột Lớp hoặc dạng gộp', () => {
    expect(parseCargoGroup('Nguy hiểm', '3')).toEqual({ ok: true, cargoGroup: 'DANGEROUS', dangerClass: 3 });
    expect(parseCargoGroup('DG8')).toEqual({ ok: true, cargoGroup: 'DANGEROUS', dangerClass: 8 });
  });

  it('báo lỗi: nhóm lạ, nguy hiểm thiếu lớp, lớp ngoài 1–9', () => {
    expect(parseCargoGroup('abc').ok).toBe(false);
    expect(parseCargoGroup('Nguy hiểm', '').ok).toBe(false);
    expect(parseCargoGroup('Nguy hiểm', '10').ok).toBe(false);
  });
});
