import type { ExtremePoint } from '../../domain/types';

export function createInitialExtremePoints(): ExtremePoint[] {
  return [{ x: 0, y: 0, z: 0 }];
}

/**
 * Sau khi đặt một placement, sinh 3 extreme point mới theo docs/algorithm-design.md mục 5:
 * (x+l, y, z), (x, y+w, z), (x, y, z+h)
 */
export function generateNewExtremePoints(placement: {
  x: number;
  y: number;
  z: number;
  length: number;
  width: number;
  height: number;
}): ExtremePoint[] {
  return [
    { x: placement.x + placement.length, y: placement.y, z: placement.z },
    { x: placement.x, y: placement.y + placement.width, z: placement.z },
    { x: placement.x, y: placement.y, z: placement.z + placement.height },
  ];
}

export function fitsInsideContainer(
  candidate: { x: number; y: number; z: number; length: number; width: number; height: number },
  container: { innerLength: number; innerWidth: number; innerHeight: number },
): boolean {
  return (
    candidate.x >= 0 &&
    candidate.y >= 0 &&
    candidate.z >= 0 &&
    candidate.x + candidate.length <= container.innerLength &&
    candidate.y + candidate.width <= container.innerWidth &&
    candidate.z + candidate.height <= container.innerHeight
  );
}

export function addExtremePoints(existing: ExtremePoint[], newPoints: ExtremePoint[]): ExtremePoint[] {
  const seen = new Set(existing.map((p) => `${p.x},${p.y},${p.z}`));
  const result = [...existing];
  for (const p of newPoints) {
    const key = `${p.x},${p.y},${p.z}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(p);
    }
  }
  return result;
}

export function removeExtremePoint(points: ExtremePoint[], used: ExtremePoint): ExtremePoint[] {
  return points.filter((p) => !(p.x === used.x && p.y === used.y && p.z === used.z));
}
