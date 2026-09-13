import { describe, expect, it } from 'vitest';
import { revalidatePlacement } from '../../src/engine/revalidate';
import { makeCargoTemplate } from '../fixtures/cargo';
import { makePlacement } from '../fixtures/placement';
import { smallTestContainer } from '../fixtures/containers';

// smallTestContainer: 2000 x 1000 x 1000 mm.

describe('revalidatePlacement', () => {
  it('vị trí mới hợp lệ (trong lòng container, không đè kiện khác) -> valid=true và có computed', () => {
    const template = makeCargoTemplate({ id: 'a', allowedOrientations: [[400, 300, 200]] });
    const placementA = makePlacement({ id: 'a', cargoTemplateId: 'a', x: 0, y: 0, z: 0, length: 400, width: 300, height: 200 });

    const result = revalidatePlacement({
      placementId: 'a',
      candidate: { x: 800, y: 0, z: 0, length: 400, width: 300, height: 200 },
      template,
      placements: [placementA],
      containerTemplate: smallTestContainer,
      templatesById: new Map([['a', template]]),
    });

    expect(result.valid).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.computed).toEqual({
      stackLevel: 0,
      supportRatio: 1,
      supportedByPlacementIds: [],
    });
  });

  it('vị trí mới đè lên kiện khác -> valid=false, có violation COLLISION', () => {
    const templateA = makeCargoTemplate({ id: 'a', allowedOrientations: [[400, 300, 200]] });
    const templateB = makeCargoTemplate({ id: 'b', allowedOrientations: [[400, 300, 200]] });
    const placementA = makePlacement({ id: 'a', cargoTemplateId: 'a', x: 0, y: 0, z: 0, length: 400, width: 300, height: 200 });
    const placementB = makePlacement({ id: 'b', cargoTemplateId: 'b', x: 500, y: 0, z: 0, length: 400, width: 300, height: 200 });

    // Kéo A tới đúng vị trí B đang đứng -> chắc chắn chồng lấn.
    const result = revalidatePlacement({
      placementId: 'a',
      candidate: { x: 500, y: 0, z: 0, length: 400, width: 300, height: 200 },
      template: templateA,
      placements: [placementA, placementB],
      containerTemplate: smallTestContainer,
      templatesById: new Map([['a', templateA], ['b', templateB]]),
    });

    expect(result.valid).toBe(false);
    expect(result.computed).toBeUndefined();
    expect(result.violations.some((v) => v.type === 'COLLISION')).toBe(true);
  });

  it('vị trí mới vượt ra ngoài container -> valid=false, có violation OUT_OF_BOUNDS', () => {
    const template = makeCargoTemplate({ id: 'a', allowedOrientations: [[400, 300, 200]] });
    const placementA = makePlacement({ id: 'a', cargoTemplateId: 'a', x: 0, y: 0, z: 0, length: 400, width: 300, height: 200 });

    // innerLength = 2000, x=1800 + length 400 = 2200 > 2000 -> vượt ra ngoài.
    const result = revalidatePlacement({
      placementId: 'a',
      candidate: { x: 1800, y: 0, z: 0, length: 400, width: 300, height: 200 },
      template,
      placements: [placementA],
      containerTemplate: smallTestContainer,
      templatesById: new Map([['a', template]]),
    });

    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.type === 'OUT_OF_BOUNDS')).toBe(true);
  });

  it('xoay sang hướng không được phép (không có trong allowedOrientations) -> valid=false, ROTATION_NOT_ALLOWED', () => {
    // rotation NONE -> chỉ có đúng 1 orientation (400,300,200), không cho phép (300,400,200).
    const template = makeCargoTemplate({
      id: 'a',
      rotation: 'NONE',
      allowedOrientations: [[400, 300, 200]],
    });
    const placementA = makePlacement({ id: 'a', cargoTemplateId: 'a', x: 0, y: 0, z: 0, length: 400, width: 300, height: 200 });

    const result = revalidatePlacement({
      placementId: 'a',
      candidate: { x: 0, y: 0, z: 0, length: 300, width: 400, height: 200 },
      template,
      placements: [placementA],
      containerTemplate: smallTestContainer,
      templatesById: new Map([['a', template]]),
    });

    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.type === 'ROTATION_NOT_ALLOWED')).toBe(true);
  });

  it('xoay sang hướng CÓ trong allowedOrientations -> valid=true', () => {
    // rotation YAW -> 2 orientation: (400,300,200) và (300,400,200).
    const template = makeCargoTemplate({
      id: 'a',
      rotation: 'YAW',
      allowedOrientations: [
        [400, 300, 200],
        [300, 400, 200],
      ],
    });
    const placementA = makePlacement({ id: 'a', cargoTemplateId: 'a', x: 0, y: 0, z: 0, length: 400, width: 300, height: 200 });

    const result = revalidatePlacement({
      placementId: 'a',
      candidate: { x: 0, y: 0, z: 0, length: 300, width: 400, height: 200 },
      template,
      placements: [placementA],
      containerTemplate: smallTestContainer,
      templatesById: new Map([['a', template]]),
    });

    expect(result.valid).toBe(true);
  });

  it('đặt lên trên kiện dễ vỡ (fragile) -> valid=false, STACK_VIOLATION', () => {
    const fragileBelow = makeCargoTemplate({ id: 'below', fragile: true, allowedOrientations: [[1000, 1000, 200]] });
    const movingTemplate = makeCargoTemplate({ id: 'a', allowedOrientations: [[400, 300, 200]] });
    const placementBelow = makePlacement({
      id: 'below',
      cargoTemplateId: 'below',
      x: 0,
      y: 0,
      z: 0,
      length: 1000,
      width: 1000,
      height: 200,
    });
    const placementA = makePlacement({
      id: 'a',
      cargoTemplateId: 'a',
      x: 1200,
      y: 0,
      z: 0,
      length: 400,
      width: 300,
      height: 200,
    });

    // Kéo A lên đúng trên nóc kiện fragile (z = 200, khớp mặt trên của "below").
    const result = revalidatePlacement({
      placementId: 'a',
      candidate: { x: 0, y: 0, z: 200, length: 400, width: 300, height: 200 },
      template: movingTemplate,
      placements: [placementBelow, placementA],
      containerTemplate: smallTestContainer,
      templatesById: new Map([['below', fragileBelow], ['a', movingTemplate]]),
    });

    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.type === 'STACK_VIOLATION')).toBe(true);
  });

  it('hoán đổi 2 kiện (otherMovingPlacementIds loại trừ kiện kia) -> không báo COLLISION giả do đứng chờ ở vị trí cũ của nhau', () => {
    const templateA = makeCargoTemplate({ id: 'a', allowedOrientations: [[400, 300, 200]] });
    const templateB = makeCargoTemplate({ id: 'b', allowedOrientations: [[400, 300, 200]] });
    const placementA = makePlacement({ id: 'a', cargoTemplateId: 'a', x: 0, y: 0, z: 0, length: 400, width: 300, height: 200 });
    const placementB = makePlacement({ id: 'b', cargoTemplateId: 'b', x: 500, y: 0, z: 0, length: 400, width: 300, height: 200 });

    // A nhận vị trí cũ của B — nếu KHÔNG loại trừ B khỏi danh sách "kiện khác" thì sẽ báo COLLISION
    // sai (vì B vẫn đang "đứng" ở đúng chỗ A muốn tới, dù B cũng sắp dời đi).
    const result = revalidatePlacement({
      placementId: 'a',
      candidate: { x: 500, y: 0, z: 0, length: 400, width: 300, height: 200 },
      template: templateA,
      placements: [placementA, placementB],
      containerTemplate: smallTestContainer,
      templatesById: new Map([['a', templateA], ['b', templateB]]),
      otherMovingPlacementIds: ['b'],
    });

    expect(result.valid).toBe(true);
  });
});
