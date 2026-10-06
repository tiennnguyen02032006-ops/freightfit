import { describe, expect, it } from 'vitest';
import { generateSolution } from '../../src/engine/optimization/generateSolutions';
import { revalidatePlacement } from '../../src/engine/revalidate';
import { REEFER_AIR_GAP_MM } from '../../src/engine/config';
import { isReefer, packableContainer, stackHeightLimit } from '../../src/engine/reefer';
import { segregationNotesFor } from '../../src/engine/segregation';
import { makeCargoTemplate } from '../fixtures/cargo';
import { smallTestContainer } from '../fixtures/containers';
import type { CargoTemplate, ContainerTemplate } from '../../src/domain/types';

const LINE = 600;
const reeferContainer: ContainerTemplate = { ...smallTestContainer, id: 'test-reefer', refrigerated: true, maxStackHeight: LINE, maxPayload: 5000 };
const dryContainer: ContainerTemplate = { ...smallTestContainer, maxPayload: 5000 };

const cold = (id: string, setTemperatureC: number, quantity = 4): CargoTemplate =>
  makeCargoTemplate({ id, sku: id.toUpperCase(), setTemperatureC, quantity });

function templateIdsIn(container: { placements: Array<{ cargoTemplateId: string }> }): Set<string> {
  return new Set(container.placements.map((p) => p.cargoTemplateId));
}

describe('reefer helpers', () => {
  it('vạch giới hạn chỉ áp dụng cho container lạnh và không vượt lòng xe', () => {
    expect(stackHeightLimit(reeferContainer)).toBe(LINE);
    expect(stackHeightLimit({ ...reeferContainer, maxStackHeight: 5000 })).toBe(1000);
    expect(stackHeightLimit({ ...smallTestContainer, maxStackHeight: LINE })).toBe(1000);
    expect(packableContainer(reeferContainer).innerHeight).toBe(LINE);
    expect(isReefer(dryContainer)).toBe(false);
  });
});

describe('generateSolution — container lạnh', () => {
  it('hàng khác nhiệt độ không bao giờ chung container; ghi nhiệt độ cài đặt và lý do tách', () => {
    const items = [cold('a', 2), cold('b', -18), cold('c', 2)];
    const solution = generateSolution(items, reeferContainer);
    const tempOf = new Map(items.map((t) => [t.id, t.setTemperatureC]));
    expect(solution.containers.length).toBeGreaterThanOrEqual(2);
    for (const c of solution.containers) {
      const temps = new Set([...templateIdsIn(c)].map((id) => tempOf.get(id)));
      expect(temps.size).toBe(1);
    }
    // A và C cùng 2 °C được chung container, B (-18 °C) ở container khác
    const withA = solution.containers.find((c) => templateIdsIn(c).has('a'))!;
    expect(templateIdsIn(withA).has('c')).toBe(true);
    expect(templateIdsIn(withA).has('b')).toBe(false);
    expect(solution.segregation.reasons.some((r) => r.includes('khác nhiệt độ'))).toBe(true);
    const notes = segregationNotesFor(solution.segregation, withA.id).join('\n');
    expect(notes).toContain('Nhiệt độ cài đặt: 2 °C');
    expect(notes).toContain('Vạch giới hạn chiều cao xếp');
    const notesB = segregationNotesFor(solution.segregation, solution.containers.find((c) => templateIdsIn(c).has('b'))!.id).join('\n');
    expect(notesB).toContain('Nhiệt độ cài đặt: -18 °C');
  });

  it('hàng không đặt nhiệt độ cũng không chung container lạnh với hàng lạnh', () => {
    const plain = makeCargoTemplate({ id: 'plain', sku: 'PLAIN', quantity: 3 });
    const solution = generateSolution([cold('a', 2), plain], reeferContainer);
    for (const c of solution.containers) {
      const ids = templateIdsIn(c);
      expect(ids.has('a') && ids.has('plain')).toBe(false);
    }
  });

  it('hàng lạnh vào container thường -> không xếp được (TEMPERATURE_MISMATCH)', () => {
    const solution = generateSolution([cold('a', 2, 3)], dryContainer);
    expect(solution.unfitCargo).toHaveLength(3);
    expect(solution.unfitCargo.every((u) => u.reason === 'TEMPERATURE_MISMATCH')).toBe(true);
    expect(solution.containers.every((c) => c.placements.length === 0)).toBe(true);
    expect(solution.segregation.reasons.some((r) => r.includes('cần container lạnh'))).toBe(true);
  });

  it('hàng không vượt vạch giới hạn chiều cao (container thường thì vượt được)', () => {
    const tall = makeCargoTemplate({ id: 'tall', sku: 'TALL', setTemperatureC: 2, quantity: 60, weight: 5 });
    const dry = generateSolution([{ ...tall, setTemperatureC: undefined }], dryContainer);
    expect(Math.max(...dry.containers.flatMap((c) => c.placements.map((p) => p.z + p.height)))).toBeGreaterThan(LINE);

    const solution = generateSolution([tall], reeferContainer);
    const placements = solution.containers.flatMap((c) => c.placements);
    expect(placements.length).toBeGreaterThan(0);
    for (const p of placements) expect(p.z + p.height).toBeLessThanOrEqual(LINE);
  });

  it('chừa khe luồng khí giữa các kiện và với vách', () => {
    const solution = generateSolution([cold('a', 2, 12)], reeferContainer);
    const placements = solution.containers.flatMap((c) => c.placements);
    const axisGap = (a: number, al: number, b: number, bl: number) => Math.max(b - (a + al), a - (b + bl));
    for (let i = 0; i < placements.length; i++) {
      const p = placements[i];
      expect(p.x).toBeGreaterThanOrEqual(REEFER_AIR_GAP_MM / 2 - 1e-6);
      for (let j = i + 1; j < placements.length; j++) {
        const q = placements[j];
        const gap = Math.max(axisGap(p.x, p.length, q.x, q.length), axisGap(p.y, p.width, q.y, q.width), axisGap(p.z, p.height, q.z, q.height));
        expect(gap).toBeGreaterThanOrEqual(REEFER_AIR_GAP_MM - 1e-6);
      }
    }
  });

  it('kéo tay vượt vạch giới hạn bị chặn (OUT_OF_BOUNDS)', () => {
    const template = cold('a', 2, 1);
    const solution = generateSolution([template], reeferContainer);
    const placement = solution.containers[0].placements[0];
    const outcome = revalidatePlacement({
      placementId: placement.id,
      candidate: { ...placement, z: LINE - placement.height + 50 },
      placements: solution.containers[0].placements,
      containerTemplate: reeferContainer,
      template,
      templatesById: new Map([[template.id, template]]),
    });
    expect(outcome.violations.some((v) => v.type === 'OUT_OF_BOUNDS')).toBe(true);
  });
});
