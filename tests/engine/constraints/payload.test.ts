import { describe, expect, it } from 'vitest';
import { respectsContainerPayload, respectsLoadOnTop } from '../../../src/engine/constraints/payload';
import { makeCargoTemplate } from '../../fixtures/cargo';
import { makePlacement } from '../../fixtures/placement';

describe('respectsContainerPayload', () => {
  it('hợp lệ: tổng trọng lượng sau khi thêm không vượt maxPayload', () => {
    expect(respectsContainerPayload(400, 50, 500)).toBe(true);
  });

  it('vi phạm: tổng trọng lượng sau khi thêm vượt maxPayload', () => {
    expect(respectsContainerPayload(480, 50, 500)).toBe(false);
  });
});

describe('respectsLoadOnTop', () => {
  it('hợp lệ: trọng lượng item mới không vượt maxLoadOnTop của item bên dưới', () => {
    const below = makeCargoTemplate({ id: 'below', maxLoadOnTop: 100 });
    const map = new Map([[below.id, below]]);
    const placement = makePlacement({ cargoTemplateId: below.id });
    expect(respectsLoadOnTop([placement], map, 80)).toBe(true);
  });

  it('vi phạm: trọng lượng item mới vượt maxLoadOnTop của item bên dưới', () => {
    const below = makeCargoTemplate({ id: 'below', maxLoadOnTop: 50 });
    const map = new Map([[below.id, below]]);
    const placement = makePlacement({ cargoTemplateId: below.id });
    expect(respectsLoadOnTop([placement], map, 80)).toBe(false);
  });
});
