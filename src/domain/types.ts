// ============================================================
// 1. ENUMS & LITERAL TYPES
// ============================================================

// CYLINDER: hình trụ tròn — kích thước nhập là Đường kính + Chiều cao, nhưng vẫn LƯU dưới dạng
// khối bao quanh length x width x height (length = width = đường kính) để thuật toán xếp hàng
// dùng chung logic với BOX, không cần đổi gì trong engine/. Chỉ khác ở lớp hiển thị 3D
// (CargoBox3D vẽ CylinderGeometry thay vì BoxGeometry) và ở form nhập (nhãn Đường kính/Chiều cao).
export type CargoShapeType = 'BOX' | 'CYLINDER' | 'PALLET' | 'DRUM';

// Pallet gỗ chuẩn cho tuỳ chọn "Hàng trên pallet" — danh sách kích thước ở
// engine/preprocessing/palletTypes.ts.
export type PalletTypeId = '120x80' | '120x100' | '110x110' | '121.9x101.6';

// Tuỳ chọn "Xếp lên pallet" của 1 CargoTemplate (thùng carton): app tự xếp từng thùng lên pallet theo
// lớp, kết quả (số pallet, số thùng mỗi pallet) tính bởi engine/palletizing/palletizeCargo.ts.
// Chưa đưa pallet vào container — chỉ là kế hoạch xếp pallet.
// Cấu hình dung sai xếp hàng (xem engine/tolerance.ts): dung sai kích thước mỗi chiều của từng loại hàng
// (CargoTemplate.tolerance, mặc định defaultDimensionTolerance) và khe giữa các pallet / giữa pallet với vách.
// Được cộng vào trường clearance sẵn có khi kiểm tra va chạm, số thùng mỗi lớp trên pallet và vừa pallet;
// 3D vẫn vẽ kích thước thật.
export interface ToleranceSettings {
  enabled: boolean;
  defaultDimensionTolerance: number; // mm mỗi chiều — mặc định 15 (1,5 cm) cho thùng carton
  palletGap: number;                 // mm — khe pallet–pallet và pallet–vách container, mặc định 30 (3 cm)
}

export interface PalletizeParams {
  palletType: PalletTypeId;
  maxHeight: number;    // mm — chiều cao tối đa của pallet, ĐÃ GỒM đế pallet
  maxWeight: number;    // kg — khối lượng hàng tối đa mỗi pallet (không gồm bản thân pallet)
  // Số tầng pallet tối đa khi xếp vào container (1 = không chồng pallet lên nhau; không đặt = 1).
  maxTiers?: number;
}

// Vị trí 1 thùng trong 1 lớp, toạ độ mm tính từ góc pallet (x theo chiều dài, y theo chiều rộng).
export interface PalletBoxRect {
  x: number;
  y: number;
  length: number;
  width: number;
}

export interface PalletLayer {
  orientation: [number, number, number];  // hướng đặt thùng (l, w, h) của lớp này — cả lớp cùng hướng
  boxes: PalletBoxRect[];
}

export interface PalletLoad {
  id: string;
  cargoTemplateId: string;  // mỗi pallet chỉ chứa 1 SKU/template
  sku: string;
  palletType: PalletTypeId;
  layers: PalletLayer[];
  boxCount: number;
  totalWeight: number;      // kg hàng (chỉ các thùng, không gồm pallet) — dùng cho giới hạn khối lượng tối đa mỗi pallet
  palletWeight: number;     // kg bản thân pallet gỗ (vỏ) — cộng vào khối lượng khi xếp vào container
  totalHeight: number;      // mm, gồm đế pallet và dung sai chiều cao của từng lớp
  tolerance?: number;       // mm dung sai mỗi chiều đã tính cho thùng trên pallet này (0/không có = không dung sai)
  isPartial: boolean;       // true = pallet lẻ (ít thùng hơn 1 pallet đầy)
}

export interface PalletizationResult {
  cargoTemplateId: string;
  sku: string;
  params: PalletizeParams;
  pallets: PalletLoad[];
  unpalletizedBoxCount: number;  // thùng không xếp lên pallet nào được (kèm reason)
  // Thùng thừa không đủ tạo 1 lớp pallet: không lên pallet, xếp RỜI vào khoảng trống trong container
  // (xem palletizing/palletBlock.ts expandCargoWithPallets).
  looseBoxCount: number;
  reason?: string;
  tolerance?: number;            // mm dung sai mỗi chiều đã tính khi xếp thùng lên pallet (hiển thị "đã tính dung sai X cm")
  reasonCode?: UnfitReason;      // dạng mã của reason, dùng khi đưa các thùng này vào danh sách không xếp vừa
}

// Nhóm hàng đặc biệt (xem engine/segregation.ts): thực phẩm, hàng có mùi, hóa chất, hàng nguy hiểm (kèm lớp IMDG 1–9).
// Không đặt = hàng thường. Dùng để chia lô hàng thành các nhóm tương thích, xếp riêng vào các container khác nhau.
export type SpecialGroup = 'FOOD' | 'ODOROUS' | 'CHEMICAL' | 'DANGEROUS';
export type DangerClass = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
// Khoá nhóm hiệu lực của 1 loại hàng; hàng nguy hiểm tách theo lớp (DG1..DG9).
export type GroupKey = 'GENERAL' | 'FOOD' | 'ODOROUS' | 'CHEMICAL' | `DG${DangerClass}`;
// Khoá dùng trong bảng quy tắc: thêm 'DANGEROUS' = mọi lớp nguy hiểm.
export type RuleKey = GroupKey | 'DANGEROUS';

// Quy tắc: 2 nhóm a và b (không phân biệt thứ tự) KHÔNG được chung container. Người dùng chỉnh được; cặp mặc định
// chỉ là ví dụ, phải đối chiếu quy định IMDG hiện hành.
export interface SegregationRule {
  a: RuleKey;
  b: RuleKey;
}

// Kế hoạch tách nhóm của 1 phương án (hiển thị ở bảng kết quả và PDF).
export interface SegregationSet {
  index: number;            // thứ tự bộ (từ 1)
  groupKeys: GroupKey[];    // các nhóm hàng tương thích nằm chung trong bộ này
  skus: string[];
  containerIds: string[];   // container dùng cho bộ này (không bộ nào dùng chung container với bộ khác)
  destinationPort?: string; // cảng đích chung của bộ hàng (không có = hàng chưa ghi cảng đích)
  temperatureC?: number;    // nhiệt độ cài đặt chung của bộ hàng lạnh (không có = hàng không đặt nhiệt độ)
  containerNotes?: string[]; // ghi chú container lạnh: nhiệt độ cài đặt, vạch chiều cao, khe luồng khí
}

export interface SegregationPlan {
  sets: SegregationSet[];
  reasons: string[];        // lý do tách: cặp nhóm đang có trong lô mà quy tắc cấm chung container
}

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
  | 'STACK_CONFLICT'
  | 'TEMPERATURE_MISMATCH'; // hàng lạnh nhưng container đã chọn không phải container lạnh

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

  // Container lạnh (reefer): chỉ hàng cùng nhiệt độ cài đặt mới chung container, chừa khe luồng khí quanh hàng, và
  // `maxStackHeight` (mm, tính từ sàn) là vạch giới hạn chiều cao xếp — hàng không được vượt vạch (xem engine/reefer.ts).
  refrigerated?: boolean;
  maxStackHeight?: number;

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
  deliveryPointRaw?: string;    // giá trị thô cột "Điểm giao" từ excel (tên điểm giao của hàng)
  cargoGroupRaw?: string;       // giá trị thô cột "Nhóm hàng" từ excel (thường/thực phẩm/có mùi/hóa chất/nguy hiểm)
  dangerClassRaw?: string;      // giá trị thô cột "Lớp" (IMDG 1–9) từ excel
  customerRaw?: string;         // giá trị thô cột "Khách hàng" từ excel
  destinationPortRaw?: string;  // giá trị thô cột "Cảng đích" từ excel
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

  // Có mặt = bật "Xếp lên pallet" cho loại thùng này (xem PalletizeParams). Không ảnh hưởng cách
  // xếp vào container hiện tại — thùng vẫn là kiện rời trong packContainer.
  palletize?: PalletizeParams;

  // Dung sai kích thước MỖI CHIỀU (mm) riêng cho loại hàng này; không đặt = dùng ToleranceSettings.defaultDimensionTolerance.
  // Chỉ có tác dụng khi ToleranceSettings.enabled (xem engine/tolerance.ts).
  tolerance?: number;

  // Khách hàng và cảng đích của loại hàng (thông tin hiển thị; màu hàng trong 3D mặc định tô theo khách hàng, xem utils/customerColor.ts).
  customer?: string;
  destinationPort?: string;

  // Nhiệt độ cài đặt (°C) của hàng lạnh — chỉ xếp được vào container lạnh, và chỉ hàng cùng nhiệt độ mới chung container.
  setTemperatureC?: number;

  // Nhóm hàng đặc biệt (không đặt = hàng thường) và lớp IMDG 1–9 (chỉ có nghĩa khi cargoGroup = 'DANGEROUS').
  cargoGroup?: SpecialGroup;
  dangerClass?: DangerClass;

  // Tên điểm giao lấy từ cột "Điểm giao" của file import (không có nếu nhập tay/file thiếu cột).
  // Dùng để tự tạo danh sách điểm giao + gán hàng của chuyến, xem utils/tripDeliveryPoints.ts.
  deliveryPoint?: string;
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

  // Có mặt = placement này là 1 PALLET đã xếp thùng (khối cứng — không tách thùng khỏi pallet): length/
  // width/height/weight là của CẢ khối, còn vị trí từng thùng lưu trong palletLoad.layers (toạ độ
  // cục bộ theo pallet, xem engine/palletizing/palletBoxes.ts để quy ra toạ độ container).
  palletLoad?: PalletLoad;

  // true = thùng THỪA của SKU xếp pallet (không đủ 1 lớp pallet) được xếp rời vào container — khác
  // với hàng trên pallet (palletLoad) và hàng thường không bật xếp pallet.
  palletLeftover?: boolean;
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
  // Số thùng thật của mục này: pallet chưa xếp được chứa nhiều thùng; không có = 1 (kiện rời).
  boxCount?: number;
}

export interface SolutionStats {
  volumeFillPercent: number;
  payloadUsagePercent: number;
  containerCount: number;
  // Thống kê THEO THÙNG: pallet là khối cứng nhưng vẫn đếm từng thùng bên trong.
  boxCount: number;               // tổng số thùng/kiện đã xếp (thùng trên pallet + kiện rời)
  palletCount: number;            // số pallet đã xếp vào container
  looseBoxCount: number;          // số thùng thừa của SKU xếp pallet được xếp rời (không nằm trên pallet)
  partialPalletCount: number;     // số "Pallet lẻ" (pallet cuối ít thùng hơn pallet đầy)
  partialPalletBoxCount: number;  // tổng số thùng nằm trên các pallet lẻ
  airbagCount: number;            // số túi khí chèn lót cần dùng (khe giữa hai cột pallet + các khe khác)
  boxVolumeFillPercent: number;   // % thể tích container do CHÍNH các thùng/kiện chiếm (không tính khoảng trống/đế pallet)
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
  // Cảnh báo bố cục (vd khe giữa hai cột pallet nằm ngoài khoảng túi khí cho phép) — hiển thị ở thanh tổng kết/PDF.
  layoutWarnings: string[];
  // Ghi chú "đã tính dung sai X cm" (rỗng nếu tắt dung sai) — hiển thị ở tổng kết và bản xuất PDF.
  toleranceNotes: string[];
  // Tách nhóm hàng không được chung container (xem engine/segregation.ts).
  segregation: SegregationPlan;
}

// Chèn lót (xem engine/optimization/dunnage.ts): khe trống phẳng giữa 2 mặt song song (hàng với hàng,
// hàng với vách/cửa) cần chèn túi khí hoặc khối gỗ. Toạ độ/kích thước theo hệ toạ độ container (mm).
// Mọi khe đều chèn bằng túi khí (không còn khối gỗ): khe ngoài khoảng túi khí cho phép không được chèn.
// source: CENTER = khe giữa hai cột pallet (mỗi hàng pallet 1 túi); GENERIC = khe khác (chia ô túi tiêu chuẩn).
export type DunnageSource = 'CENTER' | 'GENERIC';
export type DunnageAxis = 'LENGTH' | 'WIDTH'; // trục theo bề dày khe: chiều dài (x) hoặc chiều rộng (y) container

export interface DunnageBag {
  // Cỡ túi khí (nhãn) và số túi chồng lên nhau theo chiều cao (1 hoặc 2) — chỉ có ở túi do dunnage.ts tạo.
  sizeLabel?: string;
  stackCount?: number;
  x: number;
  y: number;
  z: number;
  length: number;
  width: number;
  height: number;
}

export interface DunnageGap extends DunnageBag {
  id: string;
  source: DunnageSource;
  axis: DunnageAxis;
  gapSize: number;     // bề dày khe (mm) theo trục khe
  wall: boolean;       // true nếu 1 bên của khe là vách/cửa container
  bags: DunnageBag[];  // từng túi khí trong khe
  bagCount: number;    // số túi khí cần dùng
}

// Gợi ý đổi loại container/xe cho CONTAINER CUỐI CÙNG của 1 solution nhiều container, khi
// container đó dùng quá ít so với thể tích/tải trọng thật (xem
// engine/optimization/suggestBetterContainer.ts) — tách khỏi PackingSolution vì đây là kết quả
// PHÂN TÍCH SAU khi đã có solution (không phải một phần của thuật toán packing), lưu riêng ở
// SolutionSlice (xem store/slices/solutionSlice.ts) theo đúng gợi ý trong yêu cầu tính năng.
export interface ContainerSuggestion {
  suggestedTemplateId: string;
  fillRatioBefore: number;        // 0..1 — tỷ lệ lấp đầy cao hơn giữa thể tích/tải trọng TRƯỚC khi đổi
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
    // Id thùng (trong 1 pallet) đang chọn để xem thông tin — dạng `${placementId}__box-${n}` (xem
    // engine/palletizing/palletBoxes.ts); chỉ có nghĩa khi pallet chứa nó đang được chọn.
    selectedBoxId: string | null;
    // Bật/tắt lớp "Chèn lót" (túi khí/khối gỗ trong các khe) trong khung 3D — mặc định bật.
    showDunnage: boolean;
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
  // Giờ dự kiến đến dạng giờ đồng hồ "HH:MM" người dùng nhập — để trống được (undefined/rỗng).
  etaClock?: string;
  // ETA quy đổi từ etaClock so với TripPlanRecord.departureTime, tính từ lúc xuất phát (phút) — cùng
  // mốc thời gian với Black Box (t=0 lúc xuất phát). undefined nếu để trống giờ đến hoặc chưa nhập
  // giờ xuất phát. Xem utils/tripTime.ts.
  etaMinutes?: number;
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
  // Giờ xuất phát dạng "HH:MM" (mốc t=0 để quy đổi etaClock của từng điểm giao sang etaMinutes).
  departureTime?: string;
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
  // Số đoạn liên tiếp trong thứ tự được chọn mà người dùng CHƯA nhập khoảng cách (để trống) — các
  // đoạn đó KHÔNG được tính vào estimatedDistanceKm. Optional để tương thích với phương án đã lưu.
  unknownLegCount?: number;
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
