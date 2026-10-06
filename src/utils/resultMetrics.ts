import type { CenterOfGravityWarning, ContainerInstance, ContainerTemplate, PackingSolution } from '../domain/types';
import { countLooseBoxes, countPlacementBoxes, countPlacementPallets, partialPalletsOf } from '../engine/palletizing/palletBoxes';

// Số liệu và cảnh báo hiển thị ở khu vực kết quả xếp hàng (hàng số liệu, huy hiệu cảnh báo, bảng bên phải).
// Hàm thuần để test được — component chỉ đọc kết quả, không tự tính.

export interface ResultMetrics {
  usedWeightKg: number;
  maxPayloadKg: number;
  weightPercent: number;      // khối lượng đã xếp / tải trọng tối đa (có thể > 100 nếu quá tải)
  usedVolumeM3: number;
  totalVolumeM3: number;
  volumePercent: number;      // thể tích khối đã chiếm / thể tích lòng container
  boxCount: number;           // tổng số thùng/kiện (thùng trên pallet + kiện rời)
  palletCount: number;
  looseBoxCount: number;      // thùng thừa của SKU xếp pallet đang xếp rời
  partialPalletCount: number;
  balanceXPercent: number;    // lệch trọng tâm ngang (theo chiều rộng)
  balanceZPercent: number;    // lệch trọng tâm dọc (theo chiều dài)
  balancePercent: number;     // độ lệch lớn hơn trong 2 trục — số hiển thị chính của ô "Cân bằng"
}

const CUBIC_MM_PER_M3 = 1_000_000_000;

export function computeResultMetrics(
  container: ContainerInstance,
  containerTemplate: ContainerTemplate,
  maxPayloadKg: number,
): ResultMetrics {
  const totalVolumeM3 = (containerTemplate.innerLength * containerTemplate.innerWidth * containerTemplate.innerHeight) / CUBIC_MM_PER_M3;
  const usedVolumeM3 = container.usedVolume / CUBIC_MM_PER_M3;
  const balanceXPercent = container.cgOffsetXRatio * 100;
  const balanceZPercent = container.cgOffsetZRatio * 100;
  return {
    usedWeightKg: container.totalWeight,
    maxPayloadKg,
    weightPercent: maxPayloadKg > 0 ? (container.totalWeight / maxPayloadKg) * 100 : 0,
    usedVolumeM3,
    totalVolumeM3,
    volumePercent: totalVolumeM3 > 0 ? (usedVolumeM3 / totalVolumeM3) * 100 : 0,
    boxCount: countPlacementBoxes(container.placements),
    palletCount: countPlacementPallets(container.placements),
    looseBoxCount: countLooseBoxes(container.placements),
    partialPalletCount: partialPalletsOf(container.placements).length,
    balanceXPercent,
    balanceZPercent,
    balancePercent: Math.max(balanceXPercent, balanceZPercent),
  };
}

/** Tỷ lệ đỡ (supportRatio) THẤP NHẤT trong các kiện nằm trên kiện khác (z > 0); null nếu mọi kiện nằm sàn. */
export function minSupportRatio(container: ContainerInstance): number | null {
  const elevated = container.placements.filter((p) => p.z > 0);
  return elevated.length === 0 ? null : Math.min(...elevated.map((p) => p.supportRatio));
}

export interface ResultWarning {
  id: string;
  text: string;
}

const CG_AXIS_LABEL: Record<CenterOfGravityWarning['axis'], string> = {
  X: 'lệch ngang',
  Y: 'lệch cao',
  Z: 'lệch dọc',
};

export interface CollectWarningsInput {
  cgWarnings: CenterOfGravityWarning[];
  container: ContainerInstance | undefined;
  maxPayloadKg: number;
  layoutWarnings: string[];
  unfitBoxCount: number;
}

/**
 * Gộp MỌI cảnh báo của container đang xem thành 1 danh sách (hiển thị sau huy hiệu cảnh báo): lệch trọng tâm,
 * vượt tải trọng, cảnh báo bố cục (vd khe giữa hai cột pallet ngoài khoảng túi khí), hàng không xếp vừa.
 * Lời lẽ chỉ nêu cảnh báo ổn định hình học (stability heuristic), không khẳng định "an toàn tuyệt đối".
 */
export function collectResultWarnings(input: CollectWarningsInput): ResultWarning[] {
  const { cgWarnings, container, maxPayloadKg, layoutWarnings, unfitBoxCount } = input;
  const warnings: ResultWarning[] = [];

  for (const w of cgWarnings) {
    warnings.push({
      id: `cg-${w.axis}`,
      text: `Trọng tâm ${CG_AXIS_LABEL[w.axis]} ${Math.round(w.offsetRatio * 100)}% — khuyến nghị phân bổ lại hàng hóa`,
    });
  }
  if (container && container.totalWeight > maxPayloadKg) {
    warnings.push({
      id: 'payload',
      text: `Trọng lượng đã xếp (${Math.round(container.totalWeight)} kg) vượt quá tải trọng tối đa (${Math.round(maxPayloadKg)} kg)`,
    });
  }
  layoutWarnings.forEach((text, i) => warnings.push({ id: `layout-${i}`, text }));
  if (unfitBoxCount > 0) {
    warnings.push({ id: 'unfit', text: `${unfitBoxCount} kiện hàng không xếp vừa` });
  }
  return warnings;
}

/** Tổng số kiện không xếp vừa của phương án, tính theo THÙNG (pallet chưa xếp được chứa nhiều thùng). */
export function countUnfitBoxes(solution: PackingSolution | null): number {
  return solution ? solution.unfitCargo.reduce((sum, u) => sum + (u.boxCount ?? 1), 0) : 0;
}
