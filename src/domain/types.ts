// ============================================================
// 1. ENUMS & LITERAL TYPES
// ============================================================

// CYLINDER: hình trụ tròn — kích thước nhập là Đường kính + Chiều cao, nhưng vẫn LƯU dưới dạng
// khối bao quanh length x width x height (length = width = đường kính) để thuật toán xếp hàng
// dùng chung logic với BOX, không cần đổi gì trong engine/. Chỉ khác ở lớp hiển thị 3D
// (CargoBox3D vẽ CylinderGeometry thay vì BoxGeometry) và ở form nhập (nhãn Đường kính/Chiều cao).
export type CargoShapeType = 'BOX' | 'CYLINDER' | 'PALLET' | 'DRUM';

export type ContainerStandardType =
  | '20FT'
  | '20FT_REEFER'
  | '20FT_HC'
  | '40FT_GP'
  | '40FT_HC'
  | '40FT_REEFER'
  | '45FT'
  | 'CUSTOM_TRUCK';

// NONE: không xoay | YAW: chỉ xoay trên mặt sàn, giữ đứng | FULL: xoay tự do 6 hướng
export type RotationAxis = 'NONE' | 'YAW' | 'FULL';

export type UnfitReason =
  | 'NO_SPACE'
  | 'OVERWEIGHT'
  | 'ROTATION_CONFLICT'
  | 'STACK_CONFLICT';

export type EditActionType = 'MOVE' | 'ROTATE' | 'SWAP' | 'DELETE' | 'REPACK';

export type ViolationType =
  | 'OUT_OF_BOUNDS'
  | 'COLLISION'
  | 'STACK_VIOLATION'
  | 'PAYLOAD_VIOLATION'
  | 'LOW_SUPPORT'
  | 'CG_OUT_OF_RANGE'
  | 'ROTATION_NOT_ALLOWED'; // hướng xoay đề xuất khi chỉnh tay không nằm trong allowedOrientations

// ============================================================
// 2. CONTAINER LIBRARY (P1)
// ============================================================

export interface ContainerTemplate {
  id: string;
  name: string;                 // "40ft HC", "Xe tải 5 tấn"
  standardType: ContainerStandardType;

  innerLength: number;          // mm — lòng trong thực tế, không dùng kích thước phủ ngoài
  innerWidth: number;
  innerHeight: number;

  tareWeight?: number;
  grossWeight?: number;
  maxPayload: number;           // kg = grossWeight - tareWeight

  // mm — kích thước lọt lòng cửa container (theo ISO 668). Hiện chưa có constraint nào trong
  // engine dùng tới (docs/algorithm-design.md không có mục "door clearance"), chỉ lưu để tham
  // khảo/hiển thị; nếu sau này cần kiểm tra hàng có lọt qua cửa để đưa vào trong không (khác với
  // fit trong lòng container) thì đây là nơi bổ sung.
  doorWidth?: number;
  doorHeight?: number;

  // Ghi chú tự do, CHỈ để hiển thị cho người dùng tham khảo (VD: nhiệt độ tối thiểu của
  // container lạnh/reefer) — không được đọc bởi bất kỳ constraint/engine nào.
  notes?: string;

  // Dùng cho panel "Chi phí vận chuyển" (TransportCostPanel.tsx) — Đơn giá cước tính theo quãng
  // đường thực tế (VNĐ/km, nhân với số km nhập tay), Giá container là chi phí CỐ ĐỊNH cho MỖI
  // container cần dùng (VNĐ/container, không phụ thuộc quãng đường — vd phí nâng hạ/thuê vỏ), rồi
  // nhân với số lượng container mà generateSolutions.ts tính ra. Optional vì container tự thêm
  // (isCustom) chưa chắc người dùng đã điền ngay; container chuẩn trong containerSeed.ts LUÔN có
  // giá trị mặc định tham khảo theo thị trường Việt Nam.
  costPerTrip?: number;         // Giá container (VNĐ/container)
  costPerKm?: number;           // Đơn giá cước (VNĐ/km)

  isCustom: boolean;
}

// ============================================================
// 3. CARGO IMPORT (Excel) & CARGO TEMPLATE (P1)
// ============================================================

export interface CargoImportRow {
  rowIndex: number;
  sku: string;
  name: string;
  length: number;
  width: number;
  height: number;
  weight: number;
  quantity: number;
  rotationRaw?: string;         // giá trị thô từ excel, map sang RotationAxis khi validate
  colorRaw?: string;            // giá trị thô cột "Màu" từ excel (hex), chuẩn hóa khi validate
  valid: boolean;
  errors?: string[];
}

export interface Clearance {
  left: number;
  right: number;
  front: number;
  back: number;
  top: number;
  bottom: number;
}

export interface CargoTemplate {
  id: string;
  sku: string;
  name: string;
  shapeType: CargoShapeType;

  length: number;                // D
  width: number;                 // R
  height: number;                // C
  weight: number;                // kg / đơn vị
  quantity: number;

  rotation: RotationAxis;
  allowedOrientations: Array<[number, number, number]>; // (l,w,h) suy ra từ rotation

  color: string;                // mã hex (#rrggbb) tô box trong scene 3D, tự gán hoặc người dùng tự chỉnh

  stackable: boolean;
  maxStackLevel?: number;
  maxLoadOnTop?: number;         // kg

  fragile: boolean;
  mustKeepUpright: boolean;
  clearance: Clearance;

  priority?: number;
}

// ============================================================
// 4. ALGORITHM DOMAIN MODELS — Placement / Extreme Point / Container instance
// ============================================================

export interface Placement {
  id: string;
  cargoInstanceId: string;       // id sau khi expand theo quantity
  cargoTemplateId: string;
  containerInstanceId: string;

  x: number;
  y: number;
  z: number;
  length: number;
  width: number;
  height: number;
  orientationIndex: number;

  weight: number;
  centerX: number;
  centerY: number;
  centerZ: number;

  supportRatio: number;              // 0..1
  supportedByPlacementIds: string[]; // rỗng nếu đặt trực tiếp trên sàn
  stackLevel: number;
}

export interface ExtremePoint {
  x: number;
  y: number;
  z: number;
}

export interface ContainerInstance {
  id: string;
  templateId: string;
  index: number;                 // thứ tự trong vehicle plan (multi-container)

  placements: Placement[];
  extremePoints: ExtremePoint[];

  totalWeight: number;
  usedVolume: number;
  centerOfGravity: { x: number; y: number; z: number };

  // Độ lệch trọng tâm so với tâm lý tưởng của container, tỉ lệ 0..1+ (0.18 = lệch 18%) — xem
  // engine/optimization/centerOfGravity.ts. offsetXRatio = lệch NGANG (theo chiều rộng),
  // offsetZRatio = lệch DỌC (theo chiều dài, tính từ giữa chiều dài container).
  cgOffsetXRatio: number;
  cgOffsetZRatio: number;
}

// ============================================================
// 5. VEHICLE PLAN / MULTI-CONTAINER (P3)
// ============================================================

export interface VehiclePlanItem {
  containerTemplateId: string;
  quantity: number;
}

export interface VehiclePlan {
  id: string;
  items: VehiclePlanItem[];      // ví dụ: [{40ftHC, 1}, {20ft, 1}]
  totalCost: number;
  feasible: boolean;
}

// ============================================================
// 6. CENTER OF GRAVITY WARNING (P2)
// ============================================================

export interface CenterOfGravityWarning {
  containerInstanceId: string;
  // X = lệch ngang (chiều rộng), Z = lệch dọc (chiều dài) — xem ContainerInstance.cgOffsetXRatio/
  // cgOffsetZRatio. Y (lệch theo chiều cao) hiện chưa có ngưỡng cảnh báo nào dùng tới.
  axis: 'X' | 'Y' | 'Z';
  offsetRatio: number;            // độ lệch so với tâm lý tưởng, tỉ lệ 0..1+ (0.18 = lệch 18%)
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
}

// ============================================================
// 7. STEP-BY-STEP LOADING SIMULATION (P2)
// ============================================================

export interface LoadingStep {
  stepIndex: number;
  containerInstanceId: string;
  placementIds: string[];         // các kiện xuất hiện ở bước này
  note?: string;
}

// ============================================================
// 8. UNFIT CARGO & STATS (P1)
// ============================================================

export interface UnfitCargo {
  cargoInstanceId: string;
  cargoTemplateId: string;
  reason: UnfitReason;
}

export interface SolutionStats {
  volumeFillPercent: number;
  payloadUsagePercent: number;
  containerCount: number;
  totalCost: number;
}

// ============================================================
// 9. PACKING SOLUTION (kết quả đóng gói — 1 thuật toán extreme point duy nhất)
// ============================================================

export interface PackingSolution {
  id: string;
  vehiclePlan: VehiclePlan;
  containers: ContainerInstance[];
  unfitCargo: UnfitCargo[];
  cgWarnings: CenterOfGravityWarning[];   // P2
  loadingSteps: LoadingStep[];            // P2
  stats: SolutionStats;
}

// Gợi ý đổi loại container/xe cho CONTAINER CUỐI CÙNG của 1 solution nhiều container, khi
// container đó dùng quá ít so với thể tích/tải trọng thật (xem
// engine/optimization/suggestBetterContainer.ts) — tách khỏi PackingSolution vì đây là kết quả
// PHÂN TÍCH SAU khi đã có solution (không phải một phần của thuật toán packing), lưu riêng ở
// SolutionSlice (xem store/slices/solutionSlice.ts) theo đúng gợi ý trong yêu cầu tính năng.
export interface ContainerSuggestion {
  suggestedTemplateId: string;
  fillRatioBefore: number;        // 0..1 — tỷ lệ lấp đầy cao hơn giữa thể tích/tải trọng TRƯỚC khi đổi
  estimatedSavings: number | null; // VNĐ/chuyến, ước tính so với costPerTrip hiện tại — null nếu thiếu số liệu costPerTrip để so
}

// ============================================================
// 10. MANUAL EDIT / HISTORY (P3)
// ============================================================

export interface Violation {
  type: ViolationType;
  placementId?: string;
  relatedPlacementIds?: string[];
  message?: string;
}

export interface RevalidationResult {
  valid: boolean;
  violations: Violation[];
}

export interface ManualEditAction {
  id: string;
  timestamp: number;
  type: EditActionType;
  containerInstanceId: string;
  beforePlacement?: Placement;
  afterPlacement?: Placement;
  swappedWithPlacementId?: string;
}

export interface EditHistoryState {
  actions: ManualEditAction[];
  currentIndex: number;           // hỗ trợ undo/redo
}

// ============================================================
// 11. ROOT APP STATE (in-memory, mất khi refresh — không backend)
// ============================================================

export interface AppState {
  containerLibrary: ContainerTemplate[];

  cargoImportRows: CargoImportRow[];
  cargoTemplates: CargoTemplate[];

  candidateVehiclePlans: VehiclePlan[];

  solution: PackingSolution | null;    // 1 thuật toán extreme point duy nhất, không còn chọn phương án
  lastContainerSuggestion: ContainerSuggestion | null; // gợi ý đổi xe cho container cuối, xem ContainerSuggestion

  // Quãng đường vận chuyển (km) người dùng nhập ở TransportCostPanel — nâng lên store (thay vì
  // state cục bộ của riêng panel đó) để suggestBetterContainer cũng dùng được cùng 1 giá trị khi
  // so sánh chi phí costPerTrip + costPerKm*km giữa các loại xe/container (xem
  // engine/optimization/suggestBetterContainer.ts). 0 = chưa nhập/không tính theo cước km.
  transportDistanceKm: number;

  activeContainerInstanceId: string | null;
  editHistory: EditHistoryState;

  currentStepIndex: number;            // cho mô phỏng bốc xếp theo bước (P2)

  ui: {
    viewMode: '3D' | 'STATS' | 'STEP_SIMULATION';
    selectedPlacementId: string | null;
    isLoading: boolean;
    // true = đang ở "chế độ xoay" cho kiện đang chọn (hiện đủ 3 mũi tên cong X/Y/Z, bấm đầu mũi
    // tên để xoay 90°/lần) thay vì chế độ di chuyển mặc định (kéo thân kiện, không hiện mũi tên
    // nào) — xem CameraToolbar.tsx/DraggablePlacement.tsx. Luôn tắt khi bỏ chọn kiện hàng.
    rotateModeActive: boolean;
  };
}
// ============================================================
// 12. LOGISTICS BLACK BOX — điều tra sự cố (tab riêng, dữ liệu MÔ PHỎNG)
// ============================================================
// Lưu ý đơn vị: khác với phần xếp hàng (mm/kg), Black Box dùng PHÚT tính từ lúc xuất phát (t=0),
// km cho quãng đường/độ lệch tuyến, °C cho nhiệt độ. Không dùng chung với Placement/CargoTemplate.

export type BlackBoxCause =
  | 'offplan_handling'
  | 'traffic'
  | 'reefer_failure'
  | 'route_deviation'
  | 'breakdown'
  | 'driver_rest';

export type BlackBoxSource =
  | 'gps'
  | 'temp'
  | 'door'
  | 'camera'
  | 'engine'
  | 'traffic'
  | 'docs'
  | 'driver';

export type BlackBoxFeatureName =
  | 'stop_dur'
  | 'crawl'
  | 'offroute'
  | 'temp_exc'
  | 'temp_onset'
  | 'temp_slope'
  | 'door'
  | 'camera'
  | 'engine_off'
  | 'fault'
  | 'traffic_hi'
  | 'count_mismatch'
  | 'driver_contra'
  | 'delay';

// null = nguồn dữ liệu tương ứng đang thiếu -> không tính vào suy luận.
export type BlackBoxFeatures = Record<BlackBoxFeatureName, string | null>;

export interface BlackBoxGpsPing {
  t: number;    // phút kể từ lúc xuất phát
  s: number;    // km đã đi dọc tuyến
  off: number;  // km lệch khỏi tuyến kế hoạch
  v: number;    // km/h
}

export interface BlackBoxCaseRecord {
  tripId: string;
  meta: { depart: number; ata: number; planned: number; delay: number; setpoint: number };
  gps: BlackBoxGpsPing[] | null;
  temp: Array<{ t: number; T: number }> | null;
  door: Array<[number, number]> | null;                 // các khoảng [mở, đóng] (phút)
  camera: number[] | null;                              // thời điểm camera thấy hoạt động bốc/dỡ
  engine: {
    tel: Array<{ t: number; on: boolean }>;
    faults: Array<[number, 'engine' | 'reefer']>;
  } | null;
  traffic: Array<{ t: number; idx: number }> | null;    // chỉ số tắc đường 0..1
  docs: { loaded: number; delivered: number } | null;   // số kiện xếp / số kiện giao
  driver: { stop: boolean; dev: boolean; door: boolean } | null; // lời khai: có dừng / lệch tuyến / mở cửa không
  truth: { causes: BlackBoxCause[] };                   // đáp án của ca mô phỏng — engine KHÔNG được đọc
}

// [bắt đầu, kết thúc, thời lượng] (phút)
export type BlackBoxWindow = [number, number, number];

export interface BlackBoxInfo {
  stops: BlackBoxWindow[];
  crawls: BlackBoxWindow[];
  slow: BlackBoxWindow[];
  offroute: [number, number, number] | null;            // [bắt đầu, kết thúc, độ lệch tối đa km]
  tempOnsetT: number | null;
  contradictions: Array<[string, string]>;              // [lời khai, bằng chứng cảm biến]
  doorOpen: Array<[number, number]>;
  camera: number[];
  faults: Array<[number, 'engine' | 'reefer']>;
}

export interface BlackBoxModelData {
  T: number;                                            // nhiệt độ hiệu chỉnh độ tin cậy
  logp: Record<BlackBoxCause, Record<BlackBoxFeatureName, Record<string, number>>>;
  stats: {
    top1: number;
    chance: number;
    tiers: Array<[string, number]>;
    mixedExactPair: number;
    worstCase: number;
  };
}

export type BlackBoxEvidence = [BlackBoxFeatureName, string, number]; // [đặc trưng, giá trị, LLR đã hiệu chỉnh]

export interface BlackBoxHypothesis {
  cause: BlackBoxCause;
  confidence: number;            // 0..1
  support: BlackBoxEvidence[];
  refute: BlackBoxEvidence[];
}

export interface BlackBoxTimelineEvent {
  t: number;
  text: string;
  level: 'info' | 'warn' | 'bad';
}

export interface BlackBoxInvestigation {
  features: BlackBoxFeatures;
  info: BlackBoxInfo;
  hypotheses: BlackBoxHypothesis[];        // top 3, xếp theo độ tin cậy giảm dần
  topCause: BlackBoxCause;
  timeline: BlackBoxTimelineEvent[];
  requests: Array<[BlackBoxSource, number]>; // nguồn dữ liệu nên bổ sung để phân biệt top 1 và top 2
}

// ============================================================
// 13. TRIP STORAGE (localStorage — NGOẠI LỆ persistence duy nhất được phép trong app, xem
// CLAUDE.md và src/storage/tripStorage.ts) — "kế hoạch chuyến" giữ thông tin từ lúc xếp hàng 3D
// tới lúc nhập dữ liệu thực tế cho Black Box. Chỉ types.ts khai báo các interface này; mọi
// đọc/ghi localStorage phải đi qua đúng src/storage/tripStorage.ts, không tự thêm ở nơi khác.
// ============================================================

export interface TripPlanStop {
  stopId: string;
  order: number;          // thứ tự giao hàng, 0 = giao đầu tiên
  name: string;            // tên/địa chỉ điểm giao, nhập tay
  etaMinutes: number;      // ETA tính từ lúc xuất phát (phút) — cùng mốc thời gian với Black Box (t=0 lúc xuất phát)
}

// Tham chiếu 1 kiện hàng đã xếp (không copy lại toàn bộ CargoTemplate) tới điểm giao của nó — xem
// naming *TemplateId/*InstanceId ở CLAUDE.md.
export interface TripPlanCargoRef {
  cargoInstanceId: string;
  cargoTemplateId: string;
  stopId: string;
}

export interface TripPlanRecord {
  tripId: string;
  name: string;
  createdAt: number;       // epoch ms, Date.now() lúc lưu
  stops: TripPlanStop[];
  cargo: TripPlanCargoRef[];
  // Khoảng cách (km) giữa từng CẶP điểm giao — người dùng tự nhập tay (app không có nguồn toạ
  // độ/bản đồ thật). Optional để tương thích ngược với chuyến đã lưu trước khi có Giai đoạn C
  // (đọc thấy thiếu field này thì coi là mảng rỗng, xem src/storage/tripStorage.ts).
  distances?: TripStopDistance[];
}

export interface TripActualStopResult {
  stopId: string;
  deliveredCount: number;  // số kiện thực giao tại điểm này
}

export interface TripActualRecord {
  tripId: string;
  actualArrivalMinutes: number;        // giờ đến thực tế (phút từ lúc xuất phát)
  stops: TripActualStopResult[];       // số kiện giao thực tế TỪNG điểm
}

export interface StoredTripEntry {
  plan: TripPlanRecord;
  actual: TripActualRecord | null;     // null = chưa nhập dữ liệu thực tế
  // Phương án giao hàng đề xuất (Giai đoạn C) — optional để tương thích ngược với chuyến đã lưu
  // trước khi có tính năng này; null/undefined = chưa tính/chưa lưu phương án nào.
  route?: TripRouteResult | null;
}

export interface StoredTrips {
  version: 1;
  trips: StoredTripEntry[];
}

// ============================================================
// 14. TRIP ROUTE PROPOSAL (Giai đoạn C — chọn 1 phương án giao hàng duy nhất) — xem
// engine/constraints/deliveryOrder.ts (ràng buộc "không kiện nào bị chắn" theo thứ tự giao, RIÊNG
// cho tính năng này, KHÔNG dùng trong packContainer.ts/generateSolutions.ts) và
// engine/optimization/routeProposal.ts (thuật toán chọn thứ tự giao + xe). Quãng đường luôn là ƯỚC
// LƯỢNG dựa trên khoảng cách người dùng tự nhập (TripPlanRecord.distances), không phải dữ liệu bản
// đồ thật.
// ============================================================

// Khoảng cách (km) giữa 2 điểm giao — đối xứng (A->B = B->A), người dùng tự nhập tay.
export interface TripStopDistance {
  stopIdA: string;
  stopIdB: string;
  km: number;
}

export interface TripRouteProposal {
  containerTemplateId: string;         // loại xe/container được chọn cho phương án này
  stopOrder: string[];                 // thứ tự stopId đề xuất (điểm giao đầu tiên ở vị trí 0)
  estimatedDistanceKm: number;         // tổng quãng đường ước lượng của thứ tự ĐƯỢC CHỌN
  shortestPossibleDistanceKm: number;  // quãng đường của thứ tự ngắn nhất đã xét (không xét ràng buộc chắn hàng) — để so sánh
  fillRatioPercent: number;            // tỷ lệ lấp đầy container ở phương án xếp được chọn (0..100)
  blockedCount: number;                // số kiện bị chắn ở phương án ĐƯỢC CHỌN — luôn = 0
  usedHeuristic: boolean;              // true nếu vượt ngưỡng tính đúng toàn bộ, phải dùng heuristic (không đảm bảo tối ưu tuyệt đối)
  generatedAt: number;                 // epoch ms
}

export type TripRouteResult =
  | { feasible: true; proposal: TripRouteProposal }
  | {
      feasible: false;
      reason: string;       // lý do cụ thể phương án không tồn tại
      suggestion: string;   // gợi ý cách nới (xe lớn hơn / chấp nhận chắn ít kiện nhất) — CHỈ hiện gợi ý, không tự áp dụng
    };
