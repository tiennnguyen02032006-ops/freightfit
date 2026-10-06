import { describe, expect, it } from 'vitest';
import {
  countPlacementBoxes,
  countPlacementPallets,
  expandToBoxPlacements,
  palletBoxPlacements,
  placementBoxCount,
} from '../../../src/engine/palletizing/palletBoxes';
import { palletizeTemplate } from '../../../src/engine/palletizing/palletizeCargo';
import { PALLET_BASE_HEIGHT_MM } from '../../../src/engine/preprocessing/palletTypes';
import type { Placement } from '../../../src/domain/types';
import { makePlacement } from '../../fixtures/placement';
import { palletCarton } from '../../fixtures/pallet';

function palletPlacement(rotated = false): Placement {
  const load = palletizeTemplate(palletCarton({ quantity: 20 }))!.pallets[0];
  return makePlacement({
    id: 'pl1',
    cargoInstanceId: 'carton__pallet__1',
    cargoTemplateId: 'carton',
    x: 100,
    y: 50,
    z: 0,
    length: rotated ? 800 : 1200,
    width: rotated ? 1200 : 800,
    height: load.totalHeight,
    weight: load.totalWeight,
    palletLoad: load,
  });
}

function overlaps(a: Placement, b: Placement): boolean {
  return (
    a.x < b.x + b.length - 1e-6 &&
    b.x < a.x + a.length - 1e-6 &&
    a.y < b.y + b.width - 1e-6 &&
    b.y < a.y + a.width - 1e-6 &&
    a.z < b.z + b.height - 1e-6 &&
    b.z < a.z + a.height - 1e-6
  );
}

describe.each([
  ['không xoay', false],
  ['xoay 90° ngang', true],
])('palletBoxPlacements (%s)', (_name, rotated) => {
  const pallet = palletPlacement(rotated);
  const boxes = palletBoxPlacements(pallet);

  it('giữ nguyên số thùng và khối lượng của pallet', () => {
    expect(boxes).toHaveLength(pallet.palletLoad!.boxCount);
    expect(boxes.reduce((sum, b) => sum + b.weight, 0)).toBeCloseTo(pallet.weight);
    expect(boxes.every((b) => b.cargoTemplateId === 'carton')).toBe(true);
  });

  it('mọi thùng nằm trong khối pallet, phía trên đế, và không chồng nhau', () => {
    for (const b of boxes) {
      expect(b.x).toBeGreaterThanOrEqual(pallet.x - 1e-6);
      expect(b.y).toBeGreaterThanOrEqual(pallet.y - 1e-6);
      expect(b.z).toBeGreaterThanOrEqual(pallet.z + PALLET_BASE_HEIGHT_MM - 1e-6);
      expect(b.x + b.length).toBeLessThanOrEqual(pallet.x + pallet.length + 1e-6);
      expect(b.y + b.width).toBeLessThanOrEqual(pallet.y + pallet.width + 1e-6);
      expect(b.z + b.height).toBeLessThanOrEqual(pallet.z + pallet.height + 1e-6);
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i], boxes[j])).toBe(false);
    }
  });
});

describe('đếm theo thùng', () => {
  it('placement không phải pallet giữ nguyên và tính là 1 thùng', () => {
    const loose = makePlacement({ id: 'loose' });
    expect(palletBoxPlacements(loose)).toEqual([loose]);
    expect(placementBoxCount(loose)).toBe(1);
  });

  it('expandToBoxPlacements / countPlacementBoxes / countPlacementPallets', () => {
    const pallet = palletPlacement();
    const loose = makePlacement({ id: 'loose' });
    expect(expandToBoxPlacements([pallet, loose])).toHaveLength(pallet.palletLoad!.boxCount + 1);
    expect(countPlacementBoxes([pallet, loose])).toBe(pallet.palletLoad!.boxCount + 1);
    expect(countPlacementPallets([pallet, loose])).toBe(1);
  });
});
