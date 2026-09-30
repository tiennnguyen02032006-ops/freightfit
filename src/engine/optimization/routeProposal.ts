import type {
  CargoTemplate,
  ContainerTemplate,
  Placement,
  TripPlanStop,
  TripRouteProposal,
  TripRouteResult,
  TripStopDistance,
} from '../../domain/types';
import { findBlockingPairs } from '../constraints/deliveryOrder';
import { generateSolution } from './generateSolutions';

// "Giai đoạn C: chọn 1 phương án giao hàng duy nhất" — module RIÊNG, KHÔNG sửa
// packContainer.ts/generateSolutions.ts (những file đó không biết gì về điểm giao/thứ tự giao).
// Thuật toán ở đây CHỈ đọc kết quả xếp (placements) do generateSolution() trả về rồi thử các thứ
// tự giao khác nhau trên TRÊN CÙNG 1 cách xếp đó (packing không đổi theo thứ tự giao).
//
// Với N điểm giao nhỏ (<= EXHAUSTIVE_MAX_STOPS), duyệt TOÀN BỘ hoán vị (đúng theo yêu cầu "duyệt
// các thứ tự giao theo quãng đường tăng dần"). Với N lớn hơn (được đề bài minh hoạ ở mốc 10 điểm
// giao/200 kiện), duyệt hết là bất khả thi trong ~3 giây nên chuyển sang heuristic (nearest-
// neighbor + vài hoán vị ngẫu nhiên), có đánh dấu `usedHeuristic` để UI ghi rõ không đảm bảo tối ưu
// tuyệt đối — đúng như đề bài cho phép.

const DEFAULT_TIME_BUDGET_MS = 3000;
const EXHAUSTIVE_MAX_STOPS = 6; // 6! = 720 hoán vị, đủ nhanh để duyệt hết trong ngân sách thời gian

function distanceLookup(distances: TripStopDistance[]): (a: string, b: string) => number | undefined {
  const map = new Map<string, number>();
  for (const d of distances) {
    map.set(`${d.stopIdA}|${d.stopIdB}`, d.km);
    map.set(`${d.stopIdB}|${d.stopIdA}`, d.km);
  }
  return (a, b) => map.get(`${a}|${b}`);
}

function routeDistance(order: string[], lookup: (a: string, b: string) => number | undefined): number | null {
  let total = 0;
  for (let i = 0; i < order.length - 1; i++) {
    const d = lookup(order[i], order[i + 1]);
    if (d === undefined) return null;
    total += d;
  }
  return total;
}

/** Heap's algorithm — sinh mọi hoán vị của mảng, dùng cho nhánh duyệt hết (N nhỏ). */
function* permutations<T>(arr: T[]): Generator<T[]> {
  const a = arr.slice();
  const n = a.length;
  if (n === 0) return;
  const c = new Array<number>(n).fill(0);
  yield a.slice();
  let i = 0;
  while (i < n) {
    if (c[i] < i) {
      if (i % 2 === 0) {
        [a[0], a[i]] = [a[i], a[0]];
      } else {
        [a[c[i]], a[i]] = [a[i], a[c[i]]];
      }
      yield a.slice();
      c[i]++;
      i = 0;
    } else {
      c[i] = 0;
      i++;
    }
  }
}

function nearestNeighborOrder(
  start: string,
  stopIds: string[],
  lookup: (a: string, b: string) => number | undefined,
): string[] {
  const remaining = new Set(stopIds);
  remaining.delete(start);
  const order = [start];
  let current = start;
  while (remaining.size > 0) {
    let bestNext: string | null = null;
    let bestD = Infinity;
    for (const s of remaining) {
      const d = lookup(current, s);
      if (d !== undefined && d < bestD) {
        bestD = d;
        bestNext = s;
      }
    }
    if (bestNext === null) {
      bestNext = remaining.values().next().value as string; // thiếu khoảng cách -> lấy đại điểm còn lại
    }
    order.push(bestNext);
    remaining.delete(bestNext);
    current = bestNext;
  }
  return order;
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface ChooseStopOrderParams {
  placements: Placement[];
  /** gán điểm giao theo cargoTemplateId (cả nhóm SKU cùng 1 điểm giao). */
  stopIdByCargoTemplateId: Map<string, string>;
  stops: TripPlanStop[];
  distances: TripStopDistance[];
  timeBudgetMs?: number;
}

export type ChooseStopOrderResult =
  | {
      feasible: true;
      stopOrder: string[];
      estimatedDistanceKm: number;
      shortestPossibleDistanceKm: number;
      usedHeuristic: boolean;
    }
  | { feasible: false; reason: string; usedHeuristic: boolean };

/**
 * Tìm thứ tự giao NGẮN NHẤT (theo ma trận khoảng cách nhập tay) mà không kiện nào bị chắn, cho MỘT
 * cách xếp cố định (placements đã có sẵn toạ độ thật). Duyệt các thứ tự theo quãng đường tăng dần,
 * dừng ngay khi tìm được thứ tự đầu tiên thoả — đúng yêu cầu "thứ tự đầu tiên thoả ràng buộc cứng
 * là phương án đề xuất".
 */
export function chooseBestStopOrder(params: ChooseStopOrderParams): ChooseStopOrderResult {
  const { placements, stopIdByCargoTemplateId, stops, distances, timeBudgetMs = DEFAULT_TIME_BUDGET_MS } = params;
  const stopIds = stops.map((s) => s.stopId);

  if (stopIds.length === 0) {
    return { feasible: false, reason: 'Chưa có điểm giao nào.', usedHeuristic: false };
  }
  if (stopIds.length === 1) {
    return {
      feasible: true,
      stopOrder: stopIds,
      estimatedDistanceKm: 0,
      shortestPossibleDistanceKm: 0,
      usedHeuristic: false,
    };
  }

  const lookup = distanceLookup(distances);

  // Gộp các cặp kiện cản nhau (thuần hình học) thành ràng buộc CẤP ĐIỂM GIAO — nhanh hơn nhiều so
  // với kiểm tra lại toàn bộ cặp kiện cho MỖI thứ tự ứng viên (đặc biệt khi có tới 200 kiện).
  const placementById = new Map(placements.map((p) => [p.id, p] as const));
  const stopPairConstraints: Array<{ nearStop: string; farStop: string }> = [];
  for (const pair of findBlockingPairs(placements)) {
    const near = placementById.get(pair.blockerId);
    const far = placementById.get(pair.blockedId);
    if (!near || !far) continue;
    const nearStop = stopIdByCargoTemplateId.get(near.cargoTemplateId);
    const farStop = stopIdByCargoTemplateId.get(far.cargoTemplateId);
    if (!nearStop || !farStop || nearStop === farStop) continue;
    stopPairConstraints.push({ nearStop, farStop });
  }

  const isOrderValid = (order: string[]): boolean => {
    const index = new Map(order.map((id, i) => [id, i] as const));
    for (const c of stopPairConstraints) {
      const nearOrder = index.get(c.nearStop);
      const farOrder = index.get(c.farStop);
      if (nearOrder === undefined || farOrder === undefined) continue;
      if (farOrder < nearOrder) return false;
    }
    return true;
  };

  const deadline = Date.now() + timeBudgetMs;
  let usedHeuristic = stopIds.length > EXHAUSTIVE_MAX_STOPS;
  let best: { order: string[]; distance: number } | null = null;
  let shortestSeen: number;

  if (!usedHeuristic) {
    const all: Array<{ order: string[]; distance: number }> = [];
    for (const perm of permutations(stopIds)) {
      const d = routeDistance(perm, lookup);
      if (d === null) continue;
      all.push({ order: perm, distance: d });
    }
    if (all.length === 0) {
      return { feasible: false, reason: 'Thiếu khoảng cách giữa một số cặp điểm giao — chưa nhập đủ.', usedHeuristic: false };
    }
    all.sort((a, b) => a.distance - b.distance);
    shortestSeen = all[0].distance;
    for (const cand of all) {
      if (Date.now() > deadline) {
        usedHeuristic = true;
        break;
      }
      if (isOrderValid(cand.order)) {
        best = cand;
        break;
      }
    }
  } else {
    const candidates: Array<{ order: string[]; distance: number }> = [];
    for (const start of stopIds) {
      if (Date.now() > deadline) break;
      const order = nearestNeighborOrder(start, stopIds, lookup);
      const d = routeDistance(order, lookup);
      if (d !== null) candidates.push({ order, distance: d });
    }
    while (Date.now() < deadline && candidates.length < stopIds.length + 50) {
      const order = shuffle(stopIds);
      const d = routeDistance(order, lookup);
      if (d !== null) candidates.push({ order, distance: d });
    }
    if (candidates.length === 0) {
      return { feasible: false, reason: 'Thiếu khoảng cách giữa một số cặp điểm giao — chưa nhập đủ.', usedHeuristic: true };
    }
    candidates.sort((a, b) => a.distance - b.distance);
    shortestSeen = candidates[0].distance;
    for (const cand of candidates) {
      if (Date.now() > deadline) break;
      if (isOrderValid(cand.order)) {
        best = cand;
        break;
      }
    }
  }

  if (!best) {
    return {
      feasible: false,
      reason: 'Không tìm được thứ tự giao nào tránh được việc kiện hàng bị chắn với cách xếp hiện tại.',
      usedHeuristic,
    };
  }

  return {
    feasible: true,
    stopOrder: best.order,
    estimatedDistanceKm: best.distance,
    shortestPossibleDistanceKm: shortestSeen,
    usedHeuristic,
  };
}

export interface ProposeSingleRouteParams {
  cargoTemplates: CargoTemplate[];
  containerLibrary: ContainerTemplate[];
  stops: TripPlanStop[];
  distances: TripStopDistance[];
  stopIdByCargoTemplateId: Map<string, string>;
  timeBudgetMs?: number;
}

/**
 * Chọn MỘT phương án giao hàng duy nhất: thử từng loại xe (nhỏ -> lớn theo thể tích lòng, bỏ qua
 * bước thử nhiều loại nếu thư viện chỉ có 1 loại), với mỗi loại xe xếp thử bằng ĐÚNG engine hiện có
 * (generateSolution) rồi tìm thứ tự giao ngắn nhất không kiện nào bị chắn. Trả về ngay phương án
 * đầu tiên khả thi; nếu không có phương án nào, trả lý do + gợi ý nới (KHÔNG tự áp dụng).
 */
export function proposeSingleRoute(params: ProposeSingleRouteParams): TripRouteResult {
  const { cargoTemplates, containerLibrary, stops, distances, stopIdByCargoTemplateId, timeBudgetMs } = params;

  if (cargoTemplates.length === 0) {
    return { feasible: false, reason: 'Chưa có hàng hoá nào để xếp.', suggestion: 'Thêm hàng hoá trước khi đề xuất phương án.' };
  }
  if (stops.length === 0) {
    return { feasible: false, reason: 'Chưa có điểm giao nào.', suggestion: 'Thêm ít nhất 1 điểm giao ở Bước 1.' };
  }
  if (containerLibrary.length === 0) {
    return { feasible: false, reason: 'Chưa có loại xe/container nào trong thư viện.', suggestion: 'Thêm 1 loại xe/container trước.' };
  }

  const candidates = [...containerLibrary].sort(
    (a, b) => a.innerLength * a.innerWidth * a.innerHeight - b.innerLength * b.innerWidth * b.innerHeight,
  );

  let bestAttemptReason: string | null = null;

  for (const template of candidates) {
    const solution = generateSolution(cargoTemplates, template);
    if (solution.unfitCargo.length > 0 || solution.containers.length !== 1) {
      bestAttemptReason = `Xe "${template.name}" không chở hết toàn bộ hàng hoá trong 1 chuyến.`;
      if (containerLibrary.length <= 1) break;
      continue;
    }

    const container = solution.containers[0];
    const orderResult = chooseBestStopOrder({
      placements: container.placements,
      stopIdByCargoTemplateId,
      stops,
      distances,
      timeBudgetMs,
    });

    if (orderResult.feasible) {
      const volume = template.innerLength * template.innerWidth * template.innerHeight;
      const fillRatioPercent = volume > 0 ? (container.usedVolume / volume) * 100 : 0;
      const proposal: TripRouteProposal = {
        containerTemplateId: template.id,
        stopOrder: orderResult.stopOrder,
        estimatedDistanceKm: orderResult.estimatedDistanceKm,
        shortestPossibleDistanceKm: orderResult.shortestPossibleDistanceKm,
        fillRatioPercent,
        blockedCount: 0,
        usedHeuristic: orderResult.usedHeuristic,
        generatedAt: Date.now(),
      };
      return { feasible: true, proposal };
    }

    bestAttemptReason = `Xe "${template.name}": ${orderResult.reason}`;
    if (containerLibrary.length <= 1) break; // chỉ có 1 loại xe -> không thử thêm (yêu cầu 4)
  }

  return {
    feasible: false,
    reason: bestAttemptReason ?? 'Không có loại xe nào trong thư viện chở hết được toàn bộ hàng hoá trong 1 chuyến.',
    suggestion: 'Thử chọn xe lớn hơn, hoặc chấp nhận phương án có kiện bị chắn ít nhất (cần bạn xác nhận mới áp dụng).',
  };
}
