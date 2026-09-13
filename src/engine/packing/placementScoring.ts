import type { Placement } from '../../domain/types';
import type { PlacementScoreWeights } from '../config';

export interface ScoreCandidate {
  x: number;
  y: number;
  z: number;
}

export function distanceFromOrigin(candidate: ScoreCandidate): number {
  return Math.sqrt(candidate.x ** 2 + candidate.y ** 2 + candidate.z ** 2);
}

export interface ContactBox {
  x: number;
  y: number;
  z: number;
  length: number;
  width: number;
  height: number;
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * "Khít nhất" (extreme-point heuristic kiểu EasyCargo, docs/algorithm-design.md mục 5): thay vì
 * đo khoảng trống thừa trực tiếp (tốn kém, cần cấu trúc dữ liệu không gian trống), dùng số MẶT
 * ÁP SÁT của candidate (0..3: mặt x, mặt y, mặt z) làm proxy — một mặt được coi là "áp sát" nếu
 * chạm vách/sàn container (tọa độ 0) HOẶC chạm đúng mặt của một placement khác (có chồng lấn ở
 * 2 trục còn lại). Càng nhiều mặt áp sát, vị trí càng khít, càng ít khoảng trống xung quanh.
 */
export function computeContactRatio(candidate: ContactBox, placements: Placement[]): number {
  const touchesX =
    candidate.x === 0 ||
    placements.some(
      (p) =>
        p.x + p.length === candidate.x &&
        rangesOverlap(candidate.y, candidate.y + candidate.width, p.y, p.y + p.width) &&
        rangesOverlap(candidate.z, candidate.z + candidate.height, p.z, p.z + p.height),
    );

  const touchesY =
    candidate.y === 0 ||
    placements.some(
      (p) =>
        p.y + p.width === candidate.y &&
        rangesOverlap(candidate.x, candidate.x + candidate.length, p.x, p.x + p.length) &&
        rangesOverlap(candidate.z, candidate.z + candidate.height, p.z, p.z + p.height),
    );

  const touchesZ =
    candidate.z === 0 ||
    placements.some(
      (p) =>
        p.z + p.height === candidate.z &&
        rangesOverlap(candidate.x, candidate.x + candidate.length, p.x, p.x + p.length) &&
        rangesOverlap(candidate.y, candidate.y + candidate.width, p.y, p.y + p.width),
    );

  return ((touchesX ? 1 : 0) + (touchesY ? 1 : 0) + (touchesZ ? 1 : 0)) / 3;
}

/**
 * placementScore = a*distanceFromOrigin + b*(1-supportRatio) + c*height + e*(1-contactRatio)
 * (docs/algorithm-design.md mục 5 — đã bỏ số hạng `d*deliveryDistanceMismatch` cùng với việc bỏ
 * hẳn khái niệm nhóm hàng theo điểm giao, xem generateSolutions.ts/sortCargo.ts). Càng nhỏ càng
 * tốt. Số hạng `e` là tiêu chí "khít nhất" (tightest fit) — trọng số lớn nhất trong các số hạng
 * (xem config.ts) vì đây là tiêu chí CHÍNH khi chọn extreme point, các số hạng còn lại chỉ phá vỡ
 * hòa (tie-break) giữa các vị trí có độ khít ngang nhau.
 */
export function placementScore(
  candidate: ScoreCandidate,
  supportRatio: number,
  contactRatio: number,
  weights: PlacementScoreWeights,
): number {
  return (
    weights.a * distanceFromOrigin(candidate) +
    weights.b * (1 - supportRatio) +
    weights.c * candidate.z +
    weights.e * (1 - contactRatio)
  );
}
