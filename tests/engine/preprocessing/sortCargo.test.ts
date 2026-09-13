import { describe, expect, it } from 'vitest';
import { sortCargo } from '../../../src/engine/preprocessing/sortCargo';
import { expandCargoQuantity } from '../../../src/engine/preprocessing/normalizeCargo';
import { makeCargoTemplate } from '../../fixtures/cargo';

describe('sortCargo', () => {
  it('thể tích giảm dần: hàng to xếp trước hàng nhỏ', () => {
    const small = makeCargoTemplate({
      id: 'small',
      length: 100,
      width: 100,
      height: 100,
      quantity: 1,
    });
    const big = makeCargoTemplate({
      id: 'big',
      length: 500,
      width: 500,
      height: 500,
      quantity: 1,
    });

    const sorted = sortCargo(expandCargoQuantity([small, big]));

    expect(sorted.map((i) => i.cargoTemplateId)).toEqual(['big', 'small']);
  });

  it('cùng thể tích, khác template: nhóm theo cargoTemplateId (thứ tự xác định, không xen kẽ)', () => {
    const templateA = makeCargoTemplate({
      id: 'template-a',
      length: 200,
      width: 200,
      height: 200,
      quantity: 2,
    });
    const templateB = makeCargoTemplate({
      id: 'template-b',
      length: 200,
      width: 200,
      height: 200,
      quantity: 2,
    });

    const sorted = sortCargo(expandCargoQuantity([templateB, templateA]));
    const templateIds = sorted.map((i) => i.cargoTemplateId);

    expect(templateIds).toEqual(['template-a', 'template-a', 'template-b', 'template-b']);
  });

  it('cùng thể tích và cùng template: priorityScore làm tie-break cuối (fragile được ưu tiên đặt trước)', () => {
    const normal = makeCargoTemplate({
      id: 'normal-item',
      length: 200,
      width: 200,
      height: 200,
      weight: 10,
      fragile: false,
      quantity: 1,
    });
    const fragile = makeCargoTemplate({
      id: 'fragile-item',
      length: 200,
      width: 200,
      height: 200,
      weight: 10,
      fragile: true,
      quantity: 1,
    });

    const sorted = sortCargo(expandCargoQuantity([normal, fragile]));

    expect(sorted.map((i) => i.cargoTemplateId)).toEqual(['fragile-item', 'normal-item']);
  });
});
