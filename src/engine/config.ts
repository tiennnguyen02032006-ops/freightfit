import type { ToleranceSettings } from '../domain/types';

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

// Ngưỡng lấp đầy tối thiểu (0..1, theo tỷ lệ CAO HƠN giữa thể tích/tải trọng đã dùng) của
// CONTAINER/XE CUỐI CÙNG trong 1 solution nhiều container — dưới ngưỡng này coi là "chỉ chở hàng
// dư thừa", engine gợi ý đổi sang loại container/xe khác rẻ hơn/nhỏ hơn nhưng vẫn xếp vừa hết số
// hàng đó (xem engine/optimization/suggestBetterContainer.ts). 35% được chọn làm mức "rõ ràng
// lãng phí" — đủ thấp để không gợi ý sai khi container cuối vẫn còn kha khá hàng (50-60% vẫn là
// mức dùng hợp lý, đổi xe không đáng), nhưng đủ cao để bắt được trường hợp điển hình "vài kiện lẻ
// dư ra sau khi đã lấp đầy các container trước".
export const LAST_CONTAINER_MIN_FILL_RATIO = 0.35;

// Ngưỡng "hút khớp" (snap) khi kéo tay di chuyển kiện hàng trong khung 3D (xem
// engine/snapping.ts) — áp dụng ĐỘC LẬP cho từng trục X/Z. Ngưỡng = max(tỉ lệ % cạnh đang kéo,
// một mức tối thiểu cố định) để kiện rất nhỏ vẫn có vùng hút hợp lý (không quá bé đến mức không
// bao giờ kích hoạt), còn kiện rất lớn thì không hút quá xa (tỉ lệ % làm chủ khi cạnh đủ lớn).
export const SNAP_THRESHOLD_RATIO = 0.05; // 5% kích thước cạnh đang kéo (theo trục đang xét)
export const SNAP_THRESHOLD_MIN_MM = 30; // tối thiểu 3cm bất kể kích thước kiện

// Chèn lót bằng TÚI KHÍ — xem engine/optimization/dunnage.ts, airbagSizes.ts và engine/palletizing/palletLayout.ts.
// Chỉ phục vụ bố cục pallet/hiển thị/ước lượng vật tư, không phải ràng buộc xếp hàng. Kích thước theo mm.

/** 1 cỡ túi khí: mặt túi rộng x cao và khoảng khe (bề dày) tối thiểu–tối đa mà cỡ này chèn được. */
export interface AirbagSize {
  name: string;    // tên hiển thị, vd "M"
  width: number;   // bề rộng mặt túi (mm) — theo chiều dài hàng pallet
  height: number;  // chiều cao mặt túi (mm)
  minGap: number;  // khe nhỏ nhất chèn được (mm)
  maxGap: number;  // khe lớn nhất chèn được (mm)
}

export interface DunnageConfig {
  bagSizes: AirbagSize[];   // danh sách cỡ túi cấu hình được; khoảng khe cho phép chung = hợp các khoảng của từng cỡ
  minLateral: number;       // mặt khe nhỏ hơn mức này (rộng hoặc cao) thì bỏ qua
  centerBagHeightRatio: number; // túi khe giữa hai cột pallet phải che ít nhất tỷ lệ này x chiều cao pallet (2/3)
  maxGaps: number;          // giữ tối đa chừng này khe tổng quát lớn nhất để hiển thị luôn nhẹ
}

// Mặc định: 3 cỡ, khe chèn được chung 5–40 cm.
export const DUNNAGE_CONFIG: DunnageConfig = {
  bagSizes: [
    { name: 'S', width: 1250, height: 800, minGap: 50, maxGap: 150 },
    { name: 'M', width: 1250, height: 1000, minGap: 100, maxGap: 250 },
    { name: 'L', width: 1250, height: 1200, minGap: 200, maxGap: 400 },
  ],
  minLateral: 100,
  centerBagHeightRatio: 2 / 3,
  maxGaps: 300,
};

// Dung sai xếp hàng — xem engine/tolerance.ts. Mặc định khi BẬT: thùng carton 1,5 cm mỗi chiều, khe pallet–pallet và
// pallet–vách container 3 cm. NO_TOLERANCE là giá trị mặc định của các hàm engine (không dung sai) để hành vi cũ
// giữ nguyên khi không truyền cấu hình.
export const DEFAULT_TOLERANCE_SETTINGS: ToleranceSettings = {
  enabled: true,
  defaultDimensionTolerance: 15,
  palletGap: 30,
};

export const NO_TOLERANCE: ToleranceSettings = {
  enabled: false,
  defaultDimensionTolerance: 15,
  palletGap: 30,
};

// Khe luồng khí (mm) chừa quanh hàng trong container lạnh — xem engine/reefer.ts. Giá trị giả định, chỉnh theo thiết bị thực tế.
export const REEFER_AIR_GAP_MM = 20;
