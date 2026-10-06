import type { ContainerTemplate } from '../../domain/types';
import { DUNNAGE_CONFIG, type DunnageConfig } from '../config';
import { gapRange, isGapInsertable } from '../optimization/airbagSizes';
import type { ExpandedCargoItem } from '../preprocessing/normalizeCargo';

// Bố cục vuông vức cho pallet trong container: TẤT CẢ pallet cùng kích thước đáy đặt CÙNG HƯỚNG,
// thành các hàng thẳng sát vách trước và vách trái (y = 0), sát nhau không chừa khe; lấp đầy từng hàng
// ngang (theo chiều rộng container) trước rồi mới sang hàng kế (theo chiều dài). Thuật toán xếp
// (packContainer, ưu tiên z -> x -> y tăng dần từ góc vách trước/vách trái) tự tạo đúng bố cục này khi mọi
// pallet cùng hướng — module này chỉ chọn HƯỚNG tốt nhất rồi khoá hướng đó lại.

export type PalletOrientationChoice = 'LONG_ALONG_LENGTH' | 'LONG_ALONG_WIDTH';

export interface PalletOrientationScore {
  orientation: PalletOrientationChoice;
  /** Kích thước đáy pallet theo chiều dài container (x) và chiều rộng container (y), mm. */
  alongLength: number;
  alongWidth: number;
  feasible: boolean;
  perRow: number;        // số pallet mỗi hàng ngang (theo chiều rộng container)
  maxRows: number;       // số hàng tối đa theo chiều dài container
  rows: number;          // số hàng cần cho toàn bộ pallet (qua mọi container)
  containers: number;    // số container cần (chỉ tính sàn)
  wasteArea: number;     // mm² sàn bị bỏ trống trong các hàng đã dùng (khe cuối hàng + phần trống hàng cuối)
}

const EPS = 1e-6;

export interface FloorSpec {
  innerLength: number;
  innerWidth: number;
  innerHeight: number;
}

/**
 * Chấm điểm 1 hướng đặt: `count` pallet đáy long x short, cao tối đa `palletHeight`, chồng tối đa
 * `maxTiers` tầng — chỉ tính SÀN (các tầng trên xếp đúng lên trên tầng sàn).
 */
export function scorePalletOrientation(
  floor: FloorSpec,
  orientation: PalletOrientationChoice,
  long: number,
  short: number,
  count: number,
  palletHeight: number,
  maxTiers: number,
): PalletOrientationScore {
  const alongLength = orientation === 'LONG_ALONG_LENGTH' ? long : short;
  const alongWidth = orientation === 'LONG_ALONG_LENGTH' ? short : long;
  const perRow = Math.floor((floor.innerWidth + EPS) / alongWidth);
  const maxRows = Math.floor((floor.innerLength + EPS) / alongLength);
  const tiersFit = Math.max(1, Math.min(maxTiers, Math.floor((floor.innerHeight + EPS) / Math.max(palletHeight, 1))));
  const fits = palletHeight <= floor.innerHeight + EPS;

  if (perRow < 1 || maxRows < 1 || !fits) {
    return { orientation, alongLength, alongWidth, feasible: false, perRow, maxRows, rows: Infinity, containers: Infinity, wasteArea: Infinity };
  }
  const floorPallets = Math.ceil(count / tiersFit);
  const rows = Math.ceil(floorPallets / perRow);
  const containers = Math.ceil(rows / maxRows);
  const wasteArea = rows * alongLength * floor.innerWidth - floorPallets * alongLength * alongWidth;
  return { orientation, alongLength, alongWidth, feasible: true, perRow, maxRows, rows, containers, wasteArea };
}

/**
 * Chọn hướng pallet (cạnh dài theo chiều dài hay chiều rộng container) cho ra ít container, rồi ít
 * hàng, rồi ít khoảng trống sàn nhất; hòa thì ưu tiên cạnh dài theo chiều dài container. Pallet vuông chỉ
 * có 1 hướng. Trả về null nếu không hướng nào đặt vừa container.
 */
export function choosePalletOrientation(
  floor: FloorSpec,
  long: number,
  short: number,
  count: number,
  palletHeight: number,
  maxTiers: number,
): PalletOrientationScore | null {
  const options: PalletOrientationChoice[] = long === short ? ['LONG_ALONG_LENGTH'] : ['LONG_ALONG_LENGTH', 'LONG_ALONG_WIDTH'];
  const scores = options
    .map((o) => scorePalletOrientation(floor, o, long, short, count, palletHeight, maxTiers))
    .filter((s) => s.feasible);
  if (scores.length === 0) return null;
  scores.sort((a, b) => a.containers - b.containers || a.rows - b.rows || a.wasteArea - b.wasteArea);
  return scores[0];
}

export interface TwoColumnOption {
  orientation: PalletOrientationChoice;
  alongLength: number;
  alongWidth: number;
  /**
   * Độ rộng khe THẬT giữa hai cột pallet (mm) = rộng vùng xếp - 2 x bề rộng pallet - khe pallet–pallet (dung sai);
   * âm nếu không đặt vừa 2 cột. Không dung sai: = rộng container - 2 x bề rộng pallet.
   */
  gap: number;
  /** Bề rộng phụ mỗi pallet "chiếm" thêm khi xếp để chừa khe giữa (= (gap - khe pallet–pallet) / 2). */
  pad: number;
  /** Đặt vừa 2 cột (bề rộng, chiều cao) — chưa xét khe có chèn được túi khí hay không. */
  fits: boolean;
  rows: number;
  /** Đặt vừa 2 cột sát hai vách VÀ khe giữa nằm trong khoảng túi khí cho phép [khoảng khe túi khí chèn được]. */
  valid: boolean;
}

/**
 * Bố cục HAI CỘT pallet sát hai vách bên, chừa 1 khe giữa chạy dọc chiều dài container (để chèn túi khí) —
 * đánh giá 1 hướng đặt pallet.
 */
export function evaluateTwoColumnLayout(
  floor: FloorSpec,
  orientation: PalletOrientationChoice,
  long: number,
  short: number,
  palletHeight: number,
  cfg: DunnageConfig = DUNNAGE_CONFIG,
  spacing = 0, // khe pallet–pallet (dung sai), mm
  margin = 0, // lề mỗi bên vách container (dung sai), mm
): TwoColumnOption {
  const alongLength = orientation === 'LONG_ALONG_LENGTH' ? long : short;
  const alongWidth = orientation === 'LONG_ALONG_LENGTH' ? short : long;
  const usableWidth = floor.innerWidth - 2 * margin;
  const usableLength = floor.innerLength - 2 * margin;
  const gap = usableWidth - 2 * alongWidth - spacing;
  const pad = (gap - spacing) / 2;
  const rows = Math.floor((usableLength + EPS) / (alongLength + spacing));
  const fits = rows >= 1 && pad >= -EPS && palletHeight <= floor.innerHeight + EPS;
  const valid = fits && isGapInsertable(gap, cfg);
  return { orientation, alongLength, alongWidth, gap, pad: Math.max(pad, 0), fits, rows: fits ? rows : 0, valid };
}

/**
 * Chọn hướng pallet cho bố cục hai cột: trong các hướng có khe giữa nằm trong khoảng túi khí cho phép, lấy hướng
 * xếp được nhiều pallet mỗi container hơn (rồi khe nhỏ hơn). Không hướng nào hợp lệ -> null.
 */
export function chooseTwoColumnLayout(
  floor: FloorSpec,
  long: number,
  short: number,
  palletHeight: number,
  cfg: DunnageConfig = DUNNAGE_CONFIG,
  spacing = 0,
  margin = 0,
): { best: TwoColumnOption | null; options: TwoColumnOption[] } {
  const orientations: PalletOrientationChoice[] = long === short ? ['LONG_ALONG_LENGTH'] : ['LONG_ALONG_LENGTH', 'LONG_ALONG_WIDTH'];
  const options = orientations.map((o) => evaluateTwoColumnLayout(floor, o, long, short, palletHeight, cfg, spacing, margin));
  const valid = options.filter((o) => o.valid).sort((a, b) => b.rows - a.rows || a.gap - b.gap);
  return { best: valid[0] ?? null, options };
}

export interface PalletLayoutPlan {
  items: ExpandedCargoItem[];
  /** Cảnh báo bố cục (Tiếng Việt), vd khe giữa nằm ngoài khoảng túi khí cho phép ở mọi hướng thử. */
  warnings: string[];
}

const cm = (mm: number) => Math.round(mm / 10);

function gapWarning(label: string, options: TwoColumnOption[], cfg: DunnageConfig): string {
  const range = gapRange(cfg);
  const rangeText = range ? `${cm(range.min)}–${cm(range.max)} cm` : 'chưa cấu hình cỡ túi nào';
  const detail = options
    .map((o) => (!o.fits ? 'không đặt vừa 2 cột' : `khe ${cm(o.gap)} cm`) + ` (${cm(o.alongLength)}×${cm(o.alongWidth)} cm)`)
    .join(' / ');
  return `Pallet ${label}: không đưa được khe giữa hai cột pallet về khoảng túi khí cho phép ${rangeText} ở các hướng đã thử — ${detail}. Không thể chèn túi khí giữa các cột pallet.`;
}

/**
 * Khoá hướng pallet cho 1 container: gom các pallet cùng kích thước đáy rồi
 *  1. ƯU TIÊN bố cục hai cột sát hai vách, khe giữa chạy dọc container: thử các hướng pallet, chọn hướng có khe giữa
 *     trong [khoảng khe túi khí chèn được] (mặc định 5–40 cm). Mỗi pallet được "chiếm" thêm nửa khe bề rộng khi xếp
 *     (palletSlotPad) để thuật toán xếp tự chừa khe; packContainer trả lại bề rộng thật và dịch cột phải sát vách.
 *  2. Không hướng nào đưa khe về trong khoảng -> cảnh báo, rồi dùng bố cục hàng sát nhau như trước
 *     (choosePalletOrientation).
 * Chỉ ảnh hưởng bước xếp tự động — xoay tay (revalidate) vẫn dùng đủ 2 hướng của pallet. Nhóm chỉ có 1 pallet
 * không có "khe giữa" nên bỏ qua bước 1. Mục không phải pallet giữ nguyên.
 */
export function planPalletLayout(
  items: ExpandedCargoItem[],
  container: ContainerTemplate,
  cfg: DunnageConfig = DUNNAGE_CONFIG,
  options: { wallMargin?: number } = {},
): PalletLayoutPlan {
  // Dung sai: khe pallet–pallet lấy từ clearance của chính pallet (mỗi phía gap/2), lề vách container do packContainer
  // chừa (wallMargin) — với wallMargin = gap/2 thì pallet cách vách đúng `gap`.
  const margin = options.wallMargin ?? 0;
  const groups = new Map<string, ExpandedCargoItem[]>();
  for (const item of items) {
    if (!item.palletLoad) continue;
    const key = `${item.template.length}x${item.template.width}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  if (groups.size === 0) return { items, warnings: [] };

  const locked = new Map<string, { orientation: [number, number, number]; pad: number }>();
  const warnings: string[] = [];
  for (const group of groups.values()) {
    const { length, width } = group[0].template;
    const long = Math.max(length, width);
    const short = Math.min(length, width);
    const height = Math.max(...group.map((i) => i.template.height));
    const tiers = Math.min(...group.map((i) => (i.template.maxStackLevel ?? 0) + 1));
    const spacing = group[0].template.clearance.left + group[0].template.clearance.right;

    if (group.length >= 2) {
      const { best, options: tried } = chooseTwoColumnLayout(container, long, short, height, cfg, spacing, margin);
      if (best) {
        for (const item of group) {
          locked.set(item.cargoInstanceId, {
            orientation: [best.alongLength, best.alongWidth + best.pad, item.template.height],
            pad: best.pad,
          });
        }
        continue;
      }
      warnings.push(gapWarning(`${cm(long)}×${cm(short)} cm`, tried, cfg));
    }

    // Bố cục hàng sát nhau: ô của pallet = kích thước thật + khe pallet–pallet, vùng xếp = container trừ lề vách.
    const usableFloor = { innerLength: container.innerLength - 2 * margin, innerWidth: container.innerWidth - 2 * margin, innerHeight: container.innerHeight };
    const fallback = choosePalletOrientation(usableFloor, long + spacing, short + spacing, group.length, height, tiers);
    if (!fallback) continue; // không hướng nào vừa container: giữ nguyên để bước xếp báo không xếp vừa
    for (const item of group) {
      locked.set(item.cargoInstanceId, {
        orientation: [fallback.alongLength - spacing, fallback.alongWidth - spacing, item.template.height],
        pad: 0,
      });
    }
  }

  return {
    items: items.map((item) => {
      const lock = locked.get(item.cargoInstanceId);
      if (!lock) return item;
      return {
        ...item,
        template: { ...item.template, allowedOrientations: [lock.orientation] },
        ...(lock.pad > 0 ? { palletSlotPad: lock.pad } : {}),
      };
    }),
    warnings,
  };
}

/** Như planPalletLayout nhưng chỉ trả danh sách mục đã khoá hướng (bỏ qua cảnh báo). */
export function applyPalletLayout(items: ExpandedCargoItem[], container: ContainerTemplate, wallMargin = 0): ExpandedCargoItem[] {
  return planPalletLayout(items, container, undefined, { wallMargin }).items;
}
