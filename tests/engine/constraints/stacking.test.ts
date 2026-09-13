import { describe, expect, it } from 'vitest';
import { respectsStacking } from '../../../src/engine/constraints/stacking';
import { makeCargoTemplate } from '../../fixtures/cargo';
import { makePlacement } from '../../fixtures/placement';

describe('respectsStacking', () => {
  it('hợp lệ: item bên dưới stackable=true và chưa vượt maxStackLevel', () => {
    const below = makeCargoTemplate({ id: 'below', stackable: true, maxStackLevel: 3 });
    const map = new Map([[below.id, below]]);
    const placement = makePlacement({ cargoTemplateId: below.id, stackLevel: 0 });
    expect(respectsStacking([placement], map, 1)).toBe(true);
  });

  it('vi phạm: item bên dưới stackable=false', () => {
    const below = makeCargoTemplate({ id: 'below', stackable: false });
    const map = new Map([[below.id, below]]);
    const placement = makePlacement({ cargoTemplateId: below.id, stackLevel: 0 });
    expect(respectsStacking([placement], map, 1)).toBe(false);
  });

  it('vi phạm: vượt quá maxStackLevel cho phép', () => {
    const below = makeCargoTemplate({ id: 'below', stackable: true, maxStackLevel: 1 });
    const map = new Map([[below.id, below]]);
    const placement = makePlacement({ cargoTemplateId: below.id, stackLevel: 0 });
    expect(respectsStacking([placement], map, 2)).toBe(false);
  });

  it('vi phạm: item bên dưới đánh dấu fragile=true, dù stackable=true và chưa vượt maxStackLevel', () => {
    const below = makeCargoTemplate({ id: 'below', stackable: true, fragile: true, maxStackLevel: 5 });
    const map = new Map([[below.id, below]]);
    const placement = makePlacement({ cargoTemplateId: below.id, stackLevel: 0 });
    expect(respectsStacking([placement], map, 1)).toBe(false);
  });
});
