import type { Placement } from '../../domain/types';
import { MIN_SUPPORT_RATIO } from '../config';

export interface FootprintBox {
  x: number;
  y: number;
  z: number;
  length: number;
  width: number;
}

function rectOverlapArea(
  ax: number,
  ay: number,
  al: number,
  aw: number,
  bx: number,
  by: number,
  bl: number,
  bw: number,
): number {
  const overlapX = Math.max(0, Math.min(ax + al, bx + bl) - Math.max(ax, bx));
  const overlapY = Math.max(0, Math.min(ay + aw, by + bw) - Math.max(ay, by));
  return overlapX * overlapY;
}

/**
 * Danh sách placement mà mặt trên (z + height) chạm đúng đáy candidate (z).
 */
export function findSupportingPlacements(candidate: FootprintBox, placements: Placement[]): Placement[] {
  return placements.filter((p) => p.z + p.height === candidate.z);
}

export function computeSupportArea(candidate: FootprintBox, supportingPlacements: Placement[]): number {
  return supportingPlacements.reduce(
    (sum, p) =>
      sum + rectOverlapArea(candidate.x, candidate.y, candidate.length, candidate.width, p.x, p.y, p.length, p.width),
    0,
  );
}

/**
 * supportRatio = 1.0 nếu đặt trực tiếp trên sàn container (z=0), bỏ qua CG check.
 */
export function computeSupportRatio(candidate: FootprintBox, supportingPlacements: Placement[]): number {
  if (candidate.z === 0) return 1.0;
  const area = candidate.length * candidate.width;
  if (area === 0) return 0;
  return computeSupportArea(candidate, supportingPlacements) / area;
}

export function meetsMinSupportRatio(supportRatio: number, minRatio: number = MIN_SUPPORT_RATIO): boolean {
  return supportRatio >= minRatio;
}

/**
 * Đơn giản hóa: kiểm tra hình chiếu tâm khối candidate nằm trong bounding box hợp nhất
 * (union AABB) của các placement đỡ bên dưới, thay vì polygon lồi thật.
 * Nếu đặt trên sàn (z=0) thì luôn true (theo docs/algorithm-design.md mục 6).
 */
export function centerOfGravityOK(
  candidate: { centerX: number; centerY: number; z: number },
  supportingPlacements: Placement[],
): boolean {
  if (candidate.z === 0) return true;
  if (supportingPlacements.length === 0) return false;

  const minX = Math.min(...supportingPlacements.map((p) => p.x));
  const maxX = Math.max(...supportingPlacements.map((p) => p.x + p.length));
  const minY = Math.min(...supportingPlacements.map((p) => p.y));
  const maxY = Math.max(...supportingPlacements.map((p) => p.y + p.width));

  return (
    candidate.centerX >= minX &&
    candidate.centerX <= maxX &&
    candidate.centerY >= minY &&
    candidate.centerY <= maxY
  );
}
