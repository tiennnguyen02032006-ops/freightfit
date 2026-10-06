import type {
  CargoTemplate,
  SegregationRule,
  ToleranceSettings,
  CenterOfGravityWarning,
  ContainerInstance,
  ContainerTemplate,
  PackingSolution,
  UnfitCargo,
  VehiclePlan,
} from '../../domain/types';
import { PLACEMENT_SCORE_WEIGHTS } from '../config';
import type { ExpandedCargoItem } from '../preprocessing/normalizeCargo';
import { expandCargoWithPallets } from '../palletizing/palletBlock';
import { planPalletLayout } from '../palletizing/palletLayout';
import { describeTolerance, wallMarginOf } from '../tolerance';
import { buildSegregationPlan, partitionCompatibleSets, type CompatibleSet } from '../segregation';
import { describeReeferContainer, formatTemperature, isColdCargo, isReefer, packableContainer, reeferTolerance, withAirGap } from '../reefer';
import { sortCargo } from '../preprocessing/sortCargo';
import { packContainer } from '../packing/packContainer';
import { computeCgWarnings } from './centerOfGravity';
import { computeSolutionStats } from './stats';

// Giới hạn AN TOÀN (không phải quy tắc nghiệp vụ) để chặn vòng lặp vô hạn nếu engine có lỗi
// không lường trước — thực tế vòng lặp bên dưới luôn tự dừng ngay khi 1 container MỚI (trống)
// không xếp được thêm bất kỳ món nào (xem giải thích ở generateSolution).
const MAX_CONTAINERS = 50;

/**
 * Sinh 1 PackingSolution — tự động tính SỐ CONTAINER CẦN DÙNG bằng cách lặp lại packContainer()
 * nhiều lần cùng 1 loại container (containerTemplate), mỗi lần xếp phần hàng CÒN LẠI từ lần trước:
 *
 * 1. `expandCargoQuantity` + `sortCargo` một lần duy nhất cho TOÀN BỘ hàng hóa — thứ tự này (nhóm
 *    theo điểm giao: giao SAU xử lý trước để nằm sâu trong container, xem sortCargo.ts) là thứ tự
 *    TOÀN CỤC, không tính lại theo từng container.
 * 2. Vòng lặp: gọi packContainer() với đúng danh sách "remaining" hiện tại (ban đầu = toàn bộ hàng
 *    đã sort). packContainer() luôn xử lý đúng 1 container độc lập, trả về `container` (đã xếp
 *    được gì) và `unfit` (phần KHÔNG xếp được vào container đó).
 * 3. Vì `sortedItems` được xử lý TUẦN TỰ đúng thứ tự đã sort, và `unfit` được packContainer() đẩy
 *    vào theo ĐÚNG thứ tự duyệt qua sortedItems (xem packContainer.ts, `unfit.push(...)` nằm ngay
 *    trong vòng lặp `for (const item of sortedItems)`), nên `unfit` của container N đã SẴN đúng
 *    thứ tự để làm "sortedItems" đầu vào cho container N+1 — không cần gọi lại sortCargo(). Đây
 *    chính là cách 1 điểm giao có thể "trải qua nhiều container": nếu hàng của điểm giao đó chưa
 *    xếp hết vào container N (KHÔNG PHẢI vì không đủ chỗ theo thứ tự ưu tiên mà đơn giản vì
 *    container đã đầy), phần còn lại tự động tiếp tục được ưu tiên xếp NGAY ĐẦU container N+1 theo
 *    đúng thứ tự cũ, không bị xáo trộn hay lẫn với hàng của điểm giao khác.
 * 4. Dừng vòng lặp khi: (a) không còn hàng nào "unfit" (đã xếp hết), HOẶC (b) 1 container MỚI TẠO
 *    (hoàn toàn trống khi bắt đầu xếp) vẫn không xếp được MỘT món nào trong "remaining" — nghĩa là
 *    những món này (quá khổ so với container, hoặc nặng hơn tải trọng tối đa dù xếp một mình) chắc
 *    chắn cũng sẽ thất bại y hệt ở BẤT KỲ container nào khác cùng loại, nên dừng ngay thay vì tạo
 *    thêm container trống vô ích — toàn bộ phần còn lại trở thành `unfitCargo` cuối cùng.
 * 5. Số container CẦN DÙNG = `containers.length` sau vòng lặp — đây chính là câu trả lời cho "cần
 *    bao nhiêu container" (yêu cầu chính của tính năng), không cần tính trước bằng công thức ước
 *    lượng thể tích/trọng lượng (vốn không chính xác vì bỏ qua hình học xếp thật).
 */
interface PackedSet {
  containers: ContainerInstance[];
  cgWarnings: CenterOfGravityWarning[];
  unfit: UnfitCargo[];
  layoutWarnings: string[];
}

/**
 * Xếp 1 BỘ hàng tương thích (xem engine/segregation.ts) vào các container riêng của bộ đó, theo đúng cách mô tả ở trên.
 * `indexOffset` = số container đã dùng cho các bộ trước (để đánh số container-N liên tục và không trùng id);
 * `keepEmptyFirst` chỉ true cho bộ đầu tiên (giữ 1 container dù trống để UI luôn có container để hiển thị).
 */
function packSet(
  setTemplates: CargoTemplate[],
  containerTemplate: ContainerTemplate,
  tolerance: ToleranceSettings | undefined,
  indexOffset: number,
  keepEmptyFirst: boolean,
): PackedSet {
  // Dung sai (nếu bật): cộng vào clearance của từng loại hàng, khe giữa các pallet và với vách container, số thùng
  // mỗi lớp trên pallet — xem engine/tolerance.ts. Không truyền = không dung sai.
  const wallMargin = wallMarginOf(tolerance);
  // Template bật "Xếp lên pallet" nở thành từng pallet (khối cứng); thùng không lên pallet được
  // (quá khổ/quá nặng so với pallet) đi thẳng vào danh sách không xếp vừa.
  const { items: expanded, unpalletized } = expandCargoWithPallets(setTemplates, tolerance);
  // Pallet: khoá chung 1 hướng tốt nhất (bố cục hàng thẳng, sát nhau) cho cả lô — xem palletLayout.ts.
  const { items: sortedItems, warnings: layoutWarnings } = planPalletLayout(sortCargo(expanded), containerTemplate, undefined, { wallMargin });
  const itemsByInstanceId = new Map(sortedItems.map((item) => [item.cargoInstanceId, item] as const));

  const containers: ContainerInstance[] = [];
  let cgWarnings: CenterOfGravityWarning[] = [];
  let remaining: ExpandedCargoItem[] = sortedItems;
  let finalUnfit: UnfitCargo[] = [];
  // Mục không xếp vừa là pallet thì ghi số thùng thật của nó (thống kê theo thùng).
  const withBoxCount = (u: UnfitCargo): UnfitCargo => {
    const boxCount = itemsByInstanceId.get(u.cargoInstanceId)?.palletLoad?.boxCount;
    return boxCount === undefined ? u : { ...u, boxCount };
  };

  do {
    const containerIndex = indexOffset + containers.length;
    const containerInstanceId = `container-${containerIndex + 1}`;

    const { container, unfit } = packContainer({
      containerTemplate,
      containerInstanceId,
      containerIndex,
      sortedItems: remaining,
      wallMargin,
      weights: PLACEMENT_SCORE_WEIGHTS,
    });

    const madeProgress = container.placements.length > 0;
    // Luôn giữ lại container ĐẦU TIÊN của cả phương án dù trống (vd không có hàng nào cả, hoặc không món nào xếp vừa dù
    // chỉ 1 container) để UI vẫn có đúng 1 container để hiển thị — các container trống khác không đưa vào kết quả.
    if (madeProgress || (containers.length === 0 && keepEmptyFirst)) {
      containers.push(container);
      cgWarnings = cgWarnings.concat(
        computeCgWarnings(containerInstanceId, {
          offsetXRatio: container.cgOffsetXRatio,
          offsetZRatio: container.cgOffsetZRatio,
        }),
      );
    }

    if (!madeProgress) {
      // Dùng thẳng `unfit` (đã có sẵn `reason` cụ thể từ packContainer() — vd 'ROTATION_CONFLICT'
      // nếu quá khổ, 'OVERWEIGHT' nếu quá nặng) thay vì remap qua ExpandedCargoItem rồi mất field
      // `reason`.
      finalUnfit = unfit.map(withBoxCount);
      remaining = [];
      break;
    }

    remaining = unfit.map((u) => itemsByInstanceId.get(u.cargoInstanceId)!);
  } while (remaining.length > 0 && containers.length < MAX_CONTAINERS);

  if (remaining.length > 0) {
    // Chỉ có thể xảy ra khi chạm MAX_CONTAINERS (giới hạn an toàn ở trên) — mỗi item còn lại ở
    // đây CHƯA từng được packContainer() thử qua nên không có UnfitReason cụ thể, gán tạm
    // 'NO_SPACE'.
    finalUnfit = remaining.map((item) => ({
      cargoInstanceId: item.cargoInstanceId,
      cargoTemplateId: item.cargoTemplateId,
      reason: 'NO_SPACE' as const,
      ...(item.palletLoad ? { boxCount: item.palletLoad.boxCount } : {}),
    }));
  }

  return { containers, cgWarnings, unfit: finalUnfit.concat(unpalletized), layoutWarnings };
}

type PlannedSet = CompatibleSet & { temperatureC?: number; destinationPort?: string };

const portKeyOf = (t: CargoTemplate): string => (t.destinationPort ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Chia lô hàng thành các bộ xếp riêng: trước hết theo CẢNG ĐÍCH (hàng khác cảng đích không bao giờ chung container; hàng
 * chưa ghi cảng đích là 1 nhóm riêng khi lô có ghi cảng), rồi theo NHIỆT ĐỘ CÀI ĐẶT (hàng khác nhiệt độ, kể cả hàng không
 * đặt nhiệt độ, không chung container), rồi trong mỗi nhóm theo quy tắc tách nhóm hàng (engine/segregation.ts).
 */
function partitionSets(cargoTemplates: CargoTemplate[], rules: SegregationRule[]): PlannedSet[] {
  const portKeys: string[] = [];
  for (const t of cargoTemplates) if (!portKeys.includes(portKeyOf(t))) portKeys.push(portKeyOf(t));
  const sets: PlannedSet[] = [];
  for (const portKey of portKeys) {
    const inPort = cargoTemplates.filter((t) => portKeyOf(t) === portKey);
    const destinationPort = portKey === '' ? undefined : (inPort[0].destinationPort ?? '').trim();
    const temps = Array.from(new Set(inPort.filter(isColdCargo).map((t) => t.setTemperatureC as number))).sort((a, b) => a - b);
    const buckets: Array<number | undefined> = [undefined, ...temps];
    for (const temperatureC of buckets) {
      const subset = inPort.filter((t) => (temperatureC === undefined ? !isColdCargo(t) : t.setTemperatureC === temperatureC));
      if (subset.length === 0) continue;
      for (const set of partitionCompatibleSets(subset, rules)) {
        sets.push({ ...set, ...(temperatureC !== undefined ? { temperatureC } : {}), ...(destinationPort ? { destinationPort } : {}) });
      }
    }
  }
  return sets;
}

/**
 * Sinh 1 PackingSolution. Trước hết CHIA lô hàng thành các bộ tương thích: hàng khác cảng đích hoặc khác nhiệt độ cài đặt không chung container,
 * và hai nhóm hàng có quy tắc xung đột (`segregationRules`, xem engine/segregation.ts) cũng thuộc 2 bộ khác nhau; mỗi bộ được
 * xếp riêng (mô tả chi tiết ở trên) vào các container của riêng nó. Container lạnh: lòng xe bị hạ xuống vạch giới hạn chiều
 * cao xếp và mọi hàng được chừa khe luồng khí (engine/reefer.ts); hàng lạnh vào container thường -> không xếp được
 * (TEMPERATURE_MISMATCH). Không có gì cần tách -> đúng 1 bộ, hành vi như trước.
 */
export function generateSolution(
  cargoTemplates: CargoTemplate[],
  containerTemplate: ContainerTemplate,
  tolerance?: ToleranceSettings,
  segregationRules: SegregationRule[] = [],
): PackingSolution {
  const sets = partitionSets(cargoTemplates, segregationRules);
  const groups: PlannedSet[] = sets.length > 0 ? sets : [{ groupKeys: [], templateIds: [] }];

  const reefer = isReefer(containerTemplate);
  const packTemplate = packableContainer(containerTemplate);
  const packTolerance = reefer ? reeferTolerance(tolerance) : tolerance;

  const containers: ContainerInstance[] = [];
  let cgWarnings: CenterOfGravityWarning[] = [];
  let finalUnfit: UnfitCargo[] = [];
  const layoutWarnings: string[] = [];
  const containerIdsBySet: string[][] = [];

  groups.forEach((set, i) => {
    let setTemplates = cargoTemplates.filter((t) => set.templateIds.includes(t.id));
    if (set.temperatureC !== undefined && !reefer) {
      // Hàng lạnh không được xếp vào container thường.
      const { items, unpalletized } = expandCargoWithPallets(setTemplates, packTolerance);
      finalUnfit = finalUnfit.concat(
        items.map((item) => ({
          cargoInstanceId: item.cargoInstanceId,
          cargoTemplateId: item.cargoTemplateId,
          reason: 'TEMPERATURE_MISMATCH' as const,
          ...(item.palletLoad ? { boxCount: item.palletLoad.boxCount } : {}),
        })),
        unpalletized,
      );
      containerIdsBySet.push([]);
      return;
    }
    if (reefer) setTemplates = withAirGap(setTemplates, tolerance);
    const packed = packSet(setTemplates, packTemplate, packTolerance, containers.length, i === 0);
    containerIdsBySet.push(packed.containers.map((c) => c.id));
    containers.push(...packed.containers);
    cgWarnings = cgWarnings.concat(packed.cgWarnings);
    finalUnfit = finalUnfit.concat(packed.unfit);
    for (const w of packed.layoutWarnings) if (!layoutWarnings.includes(w)) layoutWarnings.push(w);
  });

  if (containers.length === 0) {
    // Mọi bộ đều không xếp được (vd chỉ có hàng lạnh mà container không phải container lạnh): vẫn giữ 1 container trống để hiển thị.
    containers.push(...packSet([], packTemplate, packTolerance, 0, true).containers);
  }

  const templatesById = new Map([[containerTemplate.id, containerTemplate]]);
  const stats = computeSolutionStats(containers, templatesById);

  const vehiclePlan: VehiclePlan = {
    id: 'plan-1',
    items: [{ containerTemplateId: containerTemplate.id, quantity: containers.length }],
    feasible: finalUnfit.length === 0,
  };

  const segregation = buildSegregationPlan(sets, cargoTemplates, segregationRules, containerIdsBySet);
  segregation.sets.forEach((s, i) => {
    const { temperatureC, destinationPort } = groups[i];
    if (temperatureC !== undefined) s.temperatureC = temperatureC;
    if (destinationPort) s.destinationPort = destinationPort;
    if (s.containerIds.length === 0) return;
    const notes: string[] = [];
    if (destinationPort) notes.push(`Cảng đích: ${destinationPort}`);
    const customers = Array.from(
      new Set(cargoTemplates.filter((t) => groups[i].templateIds.includes(t.id)).map((t) => (t.customer ?? '').trim()).filter((c) => c !== '')),
    );
    if (customers.length > 0) {
      notes.push(`Khách hàng: ${customers.join(', ')}${customers.length > 1 ? ' — mỗi khách hàng nằm trên các pallet riêng, pallet cùng khách đặt liền nhau' : ''}`);
    }
    if (reefer) notes.push(...describeReeferContainer(containerTemplate, temperatureC));
    if (notes.length > 0) s.containerNotes = notes;
  });

  // Lý do tách theo cảng đích: liệt kê các cảng đích đang có trong lô.
  const portLabels = Array.from(new Set(cargoTemplates.map(portKeyOf)));
  if (portLabels.length > 1) {
    const parts = portLabels.map((key) => {
      const inPort = cargoTemplates.filter((t) => portKeyOf(t) === key);
      return `${key === '' ? 'chưa ghi cảng đích' : (inPort[0].destinationPort ?? '').trim()} (${inPort.map((t) => t.sku).join(', ')})`;
    });
    segregation.reasons.push(`Hàng khác cảng đích không được chung container — xếp riêng: ${parts.join('; ')}`);
  }

  // Lý do tách theo nhiệt độ: liệt kê các nhiệt độ cài đặt đang có trong lô.
  const bucketSkus = (temperatureC: number | undefined) =>
    cargoTemplates.filter((t) => (temperatureC === undefined ? !isColdCargo(t) : t.setTemperatureC === temperatureC)).map((t) => t.sku);
  const temps = Array.from(new Set(cargoTemplates.filter(isColdCargo).map((t) => t.setTemperatureC as number))).sort((a, b) => a - b);
  if (temps.length > 0 && (temps.length > 1 || cargoTemplates.some((t) => !isColdCargo(t)))) {
    const parts = temps.map((c) => `${formatTemperature(c)} (${bucketSkus(c).join(', ')})`);
    if (cargoTemplates.some((t) => !isColdCargo(t))) parts.push(`không đặt nhiệt độ (${bucketSkus(undefined).join(', ')})`);
    segregation.reasons.push(`Hàng khác nhiệt độ cài đặt không được chung container lạnh — xếp riêng: ${parts.join('; ')}`);
  }
  if (temps.length > 0 && !reefer) {
    const cold = cargoTemplates.filter(isColdCargo).map((t) => t.sku);
    segregation.reasons.push(`Hàng lạnh (${cold.join(', ')}) cần container lạnh — container đã chọn không phải container lạnh nên không xếp được`);
  }

  return {
    id: 'solution-1',
    vehiclePlan,
    containers,
    unfitCargo: finalUnfit,
    cgWarnings,
    loadingSteps: [],
    stats,
    layoutWarnings,
    toleranceNotes: describeTolerance(cargoTemplates, tolerance),
    segregation,
  };
}
