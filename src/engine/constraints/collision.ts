import type { Placement } from '../../domain/types';

export interface Box {
  x: number;
  y: number;
  z: number;
  length: number;
  width: number;
  height: number;
}

/**
 * Hai box overlap nếu cả 3 trục đều chồng lấn (docs/algorithm-design.md mục 6).
 */
export function overlaps(a: Box, b: Box): boolean {
  return !(
    a.x + a.length <= b.x ||
    b.x + b.length <= a.x ||
    a.y + a.width <= b.y ||
    b.y + b.width <= a.y ||
    a.z + a.height <= b.z ||
    b.z + b.height <= a.z
  );
}

export function hasCollision(candidate: Box, existingPlacements: Placement[]): boolean {
  return existingPlacements.some((p) => overlaps(candidate, p));
}
