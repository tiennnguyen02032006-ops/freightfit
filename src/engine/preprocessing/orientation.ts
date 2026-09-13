import type { RotationAxis } from '../../domain/types';

type Dimensions = [number, number, number];

function dedupe(orientations: Dimensions[]): Dimensions[] {
  const seen = new Set<string>();
  const result: Dimensions[] = [];
  for (const o of orientations) {
    const key = o.join('x');
    if (!seen.has(key)) {
      seen.add(key);
      result.push(o);
    }
  }
  return result;
}

/**
 * Sinh danh sách orientation (l,w,h) hợp lệ từ kích thước gốc + RotationAxis.
 * mustKeepUpright=true thu hẹp FULL về 2 orientation giống YAW (giữ height cố định) —
 * giả định vì docs/algorithm-design.md không định nghĩa tương tác rotation x mustKeepUpright.
 */
export function computeAllowedOrientations(
  length: number,
  width: number,
  height: number,
  rotation: RotationAxis,
  mustKeepUpright = false,
): Dimensions[] {
  if (rotation === 'NONE') {
    return [[length, width, height]];
  }

  if (rotation === 'YAW' || (rotation === 'FULL' && mustKeepUpright)) {
    return dedupe([
      [length, width, height],
      [width, length, height],
    ]);
  }

  // FULL không upright: 6 hoán vị đầy đủ của (l,w,h)
  return dedupe([
    [length, width, height],
    [width, length, height],
    [length, height, width],
    [height, length, width],
    [width, height, length],
    [height, width, length],
  ]);
}
