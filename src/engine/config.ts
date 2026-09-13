// Ngưỡng support ratio tối thiểu (0.7~0.8 theo docs/algorithm-design.md mục 6)
export const MIN_SUPPORT_RATIO = 0.75;

// Số lượng vehicle plan tối đa giữ lại khi sinh tổ hợp (chưa dùng ở Phase 1, dùng ở Phase 3)
export const PLAN_LIMIT = 20;

// Trọng số placementScore = a*distanceFromOrigin + b*(1-supportRatio) + c*height +
// e*(1-contactRatio) — đã bỏ số hạng `d*deliveryDistanceMismatch` cùng với việc bỏ hẳn khái niệm
// nhóm hàng theo điểm giao (xem generateSolutions.ts/sortCargo.ts). `e` (tiêu chí "khít nhất" —
// extreme point heuristic kiểu EasyCargo) là số hạng LỚN NHẤT vì đây là tiêu chí chính khi chọn
// vị trí, đúng yêu cầu "chọn vị trí khít nhất, ít không gian trống thừa xung quanh nhất".
export interface PlacementScoreWeights {
  a: number;
  b: number;
  c: number;
  e: number;
}

export const PLACEMENT_SCORE_WEIGHTS: PlacementScoreWeights = {
  a: 1.0,
  b: 5.0,
  c: 2.0,
  e: 6.0,
};

// Trọng số evaluator score (chưa dùng đầy đủ ở Phase 1, đặt sẵn cho Phase 3)
export interface EvaluatorWeights {
  w1: number;
  w2: number;
  w3: number;
  w4: number;
  w5: number;
  w6: number;
}

export const EVALUATOR_WEIGHTS: EvaluatorWeights = {
  w1: 10.0,
  w2: 5.0,
  w3: 3.0,
  w4: 2.0,
  w5: 4.0,
  w6: 1.0,
};

// Local search (chưa dùng ở Phase 1, dùng ở Phase 3)
export const LOCAL_SEARCH_TIME_LIMIT_MS = 3000;
export const MAX_LOCAL_SEARCH_ITERATIONS = 200;

// Trọng số priorityScore (docs/algorithm-design.md mục 2) — dùng làm tie-break cuối trong
// sortCargo khi các item cùng thể tích. Chỉ MỘT bộ trọng số duy nhất (đã bỏ 3 bộ theo strategy
// cost/space/balanced — app giờ chỉ có 1 thuật toán xếp hàng). Đã bỏ `deliveryPriority` cùng với
// việc bỏ hẳn khái niệm nhóm hàng theo điểm giao (app giờ xếp chung 1 lô duy nhất, không còn phân
// biệt điểm giao/thứ tự giao hàng — xem sortCargo.ts).
export interface PriorityWeights {
  volume: number;
  weight: number;
  fragile: number;
  upright: number;
}

export const PRIORITY_WEIGHTS: PriorityWeights = {
  volume: 5,
  weight: 4,
  fragile: 5,
  upright: 6,
};

// Ngưỡng "hút khớp" (snap) khi kéo tay di chuyển kiện hàng trong khung 3D (xem
// engine/snapping.ts) — áp dụng ĐỘC LẬP cho từng trục X/Z. Ngưỡng = max(tỉ lệ % cạnh đang kéo,
// một mức tối thiểu cố định) để kiện rất nhỏ vẫn có vùng hút hợp lý (không quá bé đến mức không
// bao giờ kích hoạt), còn kiện rất lớn thì không hút quá xa (tỉ lệ % làm chủ khi cạnh đủ lớn).
export const SNAP_THRESHOLD_RATIO = 0.05; // 5% kích thước cạnh đang kéo (theo trục đang xét)
export const SNAP_THRESHOLD_MIN_MM = 30; // tối thiểu 3cm bất kể kích thước kiện
