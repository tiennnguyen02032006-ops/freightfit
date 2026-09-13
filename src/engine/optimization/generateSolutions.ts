import type {
  CargoTemplate,
  CenterOfGravityWarning,
  ContainerInstance,
  ContainerTemplate,
  PackingSolution,
  UnfitCargo,
  VehiclePlan,
} from '../../domain/types';
import { PLACEMENT_SCORE_WEIGHTS } from '../config';
import { expandCargoQuantity, type ExpandedCargoItem } from '../preprocessing/normalizeCargo';
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
export function generateSolution(cargoTemplates: CargoTemplate[], containerTemplate: ContainerTemplate): PackingSolution {
  const expanded = expandCargoQuantity(cargoTemplates);
  const sortedItems = sortCargo(expanded);
  const itemsByInstanceId = new Map(sortedItems.map((item) => [item.cargoInstanceId, item] as const));

  const containers: ContainerInstance[] = [];
  let cgWarnings: CenterOfGravityWarning[] = [];
  let remaining: ExpandedCargoItem[] = sortedItems;
  let finalUnfit: UnfitCargo[] = [];

  do {
    const containerIndex = containers.length;
    const containerInstanceId = `container-${containerIndex + 1}`;

    const { container, unfit } = packContainer({
      containerTemplate,
      containerInstanceId,
      containerIndex,
      sortedItems: remaining,
      weights: PLACEMENT_SCORE_WEIGHTS,
    });

    const madeProgress = container.placements.length > 0;
    // Luôn giữ lại container ĐẦU TIÊN dù trống (vd không có hàng nào cả, hoặc không món nào xếp
    // vừa dù chỉ 1 container) để UI vẫn có đúng 1 container để hiển thị — từ container thứ 2 trở
    // đi, 1 container trống hoàn toàn không mang lại giá trị gì, không đưa vào kết quả.
    if (madeProgress || containerIndex === 0) {
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
      finalUnfit = unfit;
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
    }));
  }

  const templatesById = new Map([[containerTemplate.id, containerTemplate]]);
  const stats = computeSolutionStats(containers, templatesById);

  const vehiclePlan: VehiclePlan = {
    id: 'plan-1',
    items: [{ containerTemplateId: containerTemplate.id, quantity: containers.length }],
    totalCost: stats.totalCost,
    feasible: finalUnfit.length === 0,
  };

  return {
    id: 'solution-1',
    vehiclePlan,
    containers,
    unfitCargo: finalUnfit,
    cgWarnings,
    loadingSteps: [],
    stats,
  };
}
