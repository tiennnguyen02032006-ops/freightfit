import { describe, expect, it } from 'vitest';
import {
  addExtremePoints,
  createInitialExtremePoints,
  fitsInsideContainer,
  generateNewExtremePoints,
  removeExtremePoint,
} from '../../../src/engine/packing/extremePoints';

describe('createInitialExtremePoints', () => {
  it('trả về đúng 1 điểm gốc (0,0,0)', () => {
    expect(createInitialExtremePoints()).toEqual([{ x: 0, y: 0, z: 0 }]);
  });
});

describe('generateNewExtremePoints', () => {
  it('sinh đúng 3 điểm mới theo (x+l,y,z),(x,y+w,z),(x,y,z+h)', () => {
    const points = generateNewExtremePoints({ x: 0, y: 0, z: 0, length: 100, width: 50, height: 20 });
    expect(points).toEqual([
      { x: 100, y: 0, z: 0 },
      { x: 0, y: 50, z: 0 },
      { x: 0, y: 0, z: 20 },
    ]);
  });
});

describe('fitsInsideContainer', () => {
  const container = { innerLength: 1000, innerWidth: 500, innerHeight: 500 };

  it('hợp lệ: box nằm trọn trong bounds container', () => {
    const box = { x: 0, y: 0, z: 0, length: 100, width: 100, height: 100 };
    expect(fitsInsideContainer(box, container)).toBe(true);
  });

  it('vi phạm: box vượt quá chiều dài container', () => {
    const box = { x: 950, y: 0, z: 0, length: 100, width: 100, height: 100 };
    expect(fitsInsideContainer(box, container)).toBe(false);
  });
});

describe('addExtremePoints / removeExtremePoint', () => {
  it('addExtremePoints khử trùng lặp điểm đã tồn tại', () => {
    const existing = [{ x: 0, y: 0, z: 0 }];
    const result = addExtremePoints(existing, [{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }]);
    expect(result).toEqual([
      { x: 0, y: 0, z: 0 },
      { x: 100, y: 0, z: 0 },
    ]);
  });

  it('removeExtremePoint loại bỏ đúng điểm đã dùng', () => {
    const points = [{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }];
    const result = removeExtremePoint(points, { x: 0, y: 0, z: 0 });
    expect(result).toEqual([{ x: 100, y: 0, z: 0 }]);
  });
});
