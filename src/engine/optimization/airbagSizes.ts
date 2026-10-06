import { DUNNAGE_CONFIG, type AirbagSize, type DunnageConfig } from '../config';

// Chọn cỡ túi khí từ danh sách cấu hình (DunnageConfig.bagSizes): mỗi cỡ có rộng x cao và khoảng khe tối
// thiểu–tối đa mà cỡ đó chèn được. Hàm thuần, dùng cho dunnage.ts và palletizing/palletLayout.ts.

const EPS = 1e-6;

/** Khoảng khe nhỏ nhất–lớn nhất mà BẤT KỲ cỡ nào trong danh sách chèn được (null nếu danh sách rỗng). */
export function gapRange(cfg: DunnageConfig = DUNNAGE_CONFIG): { min: number; max: number } | null {
  if (cfg.bagSizes.length === 0) return null;
  return {
    min: Math.min(...cfg.bagSizes.map((s) => s.minGap)),
    max: Math.max(...cfg.bagSizes.map((s) => s.maxGap)),
  };
}

/** Các cỡ túi chèn được khe `gap` (mm). */
export function fittingSizes(gap: number, cfg: DunnageConfig = DUNNAGE_CONFIG): AirbagSize[] {
  return cfg.bagSizes.filter((s) => gap >= s.minGap - EPS && gap <= s.maxGap + EPS);
}

export function isGapInsertable(gap: number, cfg: DunnageConfig = DUNNAGE_CONFIG): boolean {
  return fittingSizes(gap, cfg).length > 0;
}

/** Cỡ nhỏ nhất (theo diện tích mặt túi, rồi chiều cao) trong danh sách. */
function bySmallest(a: AirbagSize, b: AirbagSize): number {
  return a.width * a.height - b.width * b.height || a.height - b.height || a.width - b.width;
}

/** Cỡ túi nhỏ nhất chèn được khe tổng quát `gap` (không yêu cầu chiều cao); null nếu không cỡ nào vừa. */
export function chooseGenericSize(gap: number, cfg: DunnageConfig = DUNNAGE_CONFIG): AirbagSize | null {
  return [...fittingSizes(gap, cfg)].sort(bySmallest)[0] ?? null;
}

export interface CenterBagPlan {
  size: AirbagSize;
  stackCount: 1 | 2;       // số túi chồng lên nhau theo chiều cao
  bagHeight: number;       // chiều cao hiển thị của MỖI túi (mm)
  coveredHeight: number;   // tổng chiều cao 2 túi chồng/1 túi, đã giới hạn bằng chiều cao pallet
  alongCount: number;      // số túi đặt nối nhau dọc chiều dài hàng pallet (1 nếu rộng túi >= chiều dài hàng)
  bagLength: number;       // chiều dài mỗi túi dọc hàng (mm)
}

/**
 * Chọn túi cho khe giữa hai cột pallet, mỗi HÀNG pallet:
 *  1. Chỉ xét các cỡ chèn được khe `gap`.
 *  2. Cỡ nhỏ nhất có chiều cao >= centerBagHeightRatio (2/3) x chiều cao pallet -> 1 túi.
 *  3. Không cỡ nào đủ cao -> HAI túi chồng lên nhau: cỡ nhỏ nhất mà 2 túi chồng đủ cao (không có thì cỡ
 *     cao nhất). Chiều cao hiển thị không vượt chiều cao pallet (túi phồng ép vừa), chia đều cho 2 túi.
 *  4. Rộng túi nhỏ hơn chiều dài hàng -> nhiều túi nối nhau dọc hàng (alongCount = ceil(dài hàng / rộng túi)).
 * Trả về null nếu không cỡ nào chèn được khe.
 */
export function chooseCenterBagPlan(
  gap: number,
  palletHeight: number,
  rowLength: number,
  cfg: DunnageConfig = DUNNAGE_CONFIG,
): CenterBagPlan | null {
  const fits = fittingSizes(gap, cfg);
  if (fits.length === 0) return null;
  const target = palletHeight * cfg.centerBagHeightRatio;

  const single = fits.filter((s) => s.height >= target - EPS).sort(bySmallest)[0];
  let size: AirbagSize;
  let stackCount: 1 | 2;
  if (single) {
    size = single;
    stackCount = 1;
  } else {
    const stackable = fits.filter((s) => s.height * 2 >= target - EPS).sort(bySmallest)[0];
    size = stackable ?? [...fits].sort((a, b) => b.height - a.height || bySmallest(a, b))[0];
    stackCount = 2;
  }

  const coveredHeight = Math.min(size.height * stackCount, palletHeight);
  const alongCount = Math.max(1, Math.ceil(rowLength / size.width - EPS));
  return {
    size,
    stackCount,
    bagHeight: coveredHeight / stackCount,
    coveredHeight,
    alongCount,
    bagLength: rowLength / alongCount,
  };
}

/** Nhãn ngắn của 1 cỡ túi để hiển thị, vd "M 1250×1000 mm". */
export function airbagSizeLabel(size: AirbagSize): string {
  return `${size.name} ${size.width}×${size.height} mm`;
}
