import type { ContainerTemplate, DunnageAxis, DunnageBag, DunnageGap, Placement } from '../../domain/types';
import { DUNNAGE_CONFIG, type AirbagSize, type DunnageConfig } from '../config';
import { airbagSizeLabel, chooseCenterBagPlan, chooseGenericSize, gapRange, isGapInsertable } from './airbagSizes';

// Tìm các KHE cần chèn lót bằng TÚI KHÍ trong 1 container đã xếp hàng. Chỉ là thông tin hiển thị/ước lượng
// vật tư — KHÔNG ảnh hưởng thuật toán xếp hàng hay ràng buộc nào. Hai loại khe:
//  1. Khe GIỮA hai cột pallet (CENTER): bố cục hai cột pallet sát hai vách bên (xem palletizing/palletLayout.ts)
//     chừa 1 khe giữa chạy dọc chiều dài container; mỗi HÀNG pallet (mỗi tầng) đặt túi dài bằng hàng pallet.
//     Cỡ túi chọn từ danh sách cấu hình (airbagSizes.ts): cỡ nhỏ nhất chèn được khe và cao >= 2/3 chiều cao
//     pallet; không cỡ nào đủ cao thì 2 túi chồng lên nhau.
//  2. Khe tổng quát (GENERIC): khoảng trống phẳng giữa 2 mặt song song (hàng với hàng, hàng với vách/cửa); mặt
//     khe chia thành các ô theo cỡ túi nhỏ nhất chèn được khe đó.
// Chỉ khe có độ rộng nằm trong khoảng chèn được của ít nhất 1 cỡ túi (mặc định chung 5–40 cm) mới chèn;
// khe khác bỏ qua. Pallet được xét theo khối bao của cả pallet.

interface Box {
  x: number;
  y: number;
  z: number;
  length: number;
  width: number;
  height: number;
  wall?: boolean;
}

interface AxisAccessors {
  axis: DunnageAxis;
  /** toạ độ thấp / kích thước theo trục khe */
  lo: (b: Box) => number;
  size: (b: Box) => number;
  /** 2 trục còn lại: u = trục ngang (mặt phẳng sàn), v = chiều cao */
  uLo: (b: Box) => number;
  uSize: (b: Box) => number;
  vLo: (b: Box) => number;
  vSize: (b: Box) => number;
}

const LENGTH_AXIS: AxisAccessors = {
  axis: 'LENGTH',
  lo: (b) => b.x,
  size: (b) => b.length,
  uLo: (b) => b.y,
  uSize: (b) => b.width,
  vLo: (b) => b.z,
  vSize: (b) => b.height,
};

const WIDTH_AXIS: AxisAccessors = {
  axis: 'WIDTH',
  lo: (b) => b.y,
  size: (b) => b.width,
  uLo: (b) => b.x,
  uSize: (b) => b.length,
  vLo: (b) => b.z,
  vSize: (b) => b.height,
};

const EPS = 1e-6;

interface RawGap {
  axis: DunnageAxis;
  lo: number;       // toạ độ bắt đầu khe theo trục khe
  size: number;     // d
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  wall: boolean;
}

function intersect(a0: number, a1: number, b0: number, b1: number): [number, number] | null {
  const lo = Math.max(a0, b0);
  const hi = Math.min(a1, b1);
  return hi - lo > EPS ? [lo, hi] : null;
}

function wallBoxes(axis: AxisAccessors, template: ContainerTemplate): Box[] {
  const { innerLength: L, innerWidth: W, innerHeight: H } = template;
  if (axis.axis === 'LENGTH') {
    return [
      { x: -1, y: 0, z: 0, length: 1, width: W, height: H, wall: true },
      { x: L, y: 0, z: 0, length: 1, width: W, height: H, wall: true },
    ];
  }
  return [
    { x: 0, y: -1, z: 0, length: L, width: 1, height: H, wall: true },
    { x: 0, y: W, z: 0, length: L, width: 1, height: H, wall: true },
  ];
}

function findRawGaps(boxes: Box[], axis: AxisAccessors, template: ContainerTemplate, cfg: DunnageConfig): RawGap[] {
  const range = gapRange(cfg);
  if (!range) return [];
  const all = [...boxes, ...wallBoxes(axis, template)].sort((a, b) => axis.lo(a) - axis.lo(b));
  const maxExtent = Math.max(...all.filter((b) => !b.wall).map(axis.size), 0);
  const raw: RawGap[] = [];

  for (let i = 0; i < all.length; i++) {
    const a = all[i];
    const aEnd = axis.lo(a) + axis.size(a);
    for (let j = i + 1; j < all.length; j++) {
      const b = all[j];
      const bLo = axis.lo(b);
      if (bLo - aEnd > range.max + EPS) break; // đã quá xa (mảng sắp theo toạ độ thấp)
      const d = bLo - aEnd;
      if (d < range.min - EPS || !isGapInsertable(d, cfg)) continue;
      if (a.wall && b.wall) continue;

      const u = intersect(axis.uLo(a), axis.uLo(a) + axis.uSize(a), axis.uLo(b), axis.uLo(b) + axis.uSize(b));
      const v = intersect(axis.vLo(a), axis.vLo(a) + axis.vSize(a), axis.vLo(b), axis.vLo(b) + axis.vSize(b));
      if (!u || !v) continue;
      if (u[1] - u[0] < cfg.minLateral - EPS || v[1] - v[0] < cfg.minLateral - EPS) continue;

      // Khe phải TRỐNG hoàn toàn: không có kiện/vách nào khác chen vào vùng khe.
      let blocked = false;
      for (let k = 0; k < all.length && !blocked; k++) {
        const c = all[k];
        if (c === a || c === b) continue;
        const cLo = axis.lo(c);
        if (cLo >= bLo) break;
        if (cLo + axis.size(c) <= aEnd + EPS) continue;
        if (cLo < aEnd - maxExtent - 1) continue;
        const cu = intersect(u[0], u[1], axis.uLo(c), axis.uLo(c) + axis.uSize(c));
        const cv = intersect(v[0], v[1], axis.vLo(c), axis.vLo(c) + axis.vSize(c));
        if (cu && cv) blocked = true;
      }
      if (blocked) continue;

      raw.push({ axis: axis.axis, lo: aEnd, size: d, u0: u[0], u1: u[1], v0: v[0], v1: v[1], wall: !!(a.wall || b.wall) });
    }
  }
  return raw;
}

/**
 * Gộp các khe liền kề cùng mặt phẳng (cùng toạ độ + bề dày) thành 1 khe lớn, và bỏ khe nằm gọn trong
 * khe khác — mỗi dãy pallet/thùng sinh ra nhiều cặp mặt đối diện nhưng thực tế chỉ là 1 khe.
 */
function mergeRawGaps(gaps: RawGap[]): RawGap[] {
  const byPlane = new Map<string, RawGap[]>();
  for (const g of gaps) {
    const key = `${g.axis}|${Math.round(g.lo)}|${Math.round(g.size)}`;
    byPlane.set(key, [...(byPlane.get(key) ?? []), g]);
  }

  const result: RawGap[] = [];
  for (const group of byPlane.values()) {
    let rects = group.map((g) => ({ ...g }));
    let changed = true;
    while (changed) {
      changed = false;
      outer: for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i];
          const b = rects[j];
          const sameV = Math.abs(a.v0 - b.v0) < 1 && Math.abs(a.v1 - b.v1) < 1;
          const sameU = Math.abs(a.u0 - b.u0) < 1 && Math.abs(a.u1 - b.u1) < 1;
          const uTouch = a.u0 <= b.u1 + 1 && b.u0 <= a.u1 + 1;
          const vTouch = a.v0 <= b.v1 + 1 && b.v0 <= a.v1 + 1;
          const contained =
            a.u0 <= b.u0 + 1 && a.u1 >= b.u1 - 1 && a.v0 <= b.v0 + 1 && a.v1 >= b.v1 - 1;
          if (contained) {
            rects.splice(j, 1);
            changed = true;
            break outer;
          }
          if ((sameV && uTouch) || (sameU && vTouch)) {
            rects[i] = {
              ...a,
              u0: Math.min(a.u0, b.u0),
              u1: Math.max(a.u1, b.u1),
              v0: Math.min(a.v0, b.v0),
              v1: Math.max(a.v1, b.v1),
              wall: a.wall || b.wall,
            };
            rects.splice(j, 1);
            changed = true;
            break outer;
          }
        }
      }
    }
    rects = rects.filter((r) => r.u1 - r.u0 > EPS && r.v1 - r.v0 > EPS);
    result.push(...rects);
  }
  return result;
}

function toBox(g: RawGap): DunnageBag {
  return g.axis === 'LENGTH'
    ? { x: g.lo, y: g.u0, z: g.v0, length: g.size, width: g.u1 - g.u0, height: g.v1 - g.v0 }
    : { x: g.u0, y: g.lo, z: g.v0, length: g.u1 - g.u0, width: g.size, height: g.v1 - g.v0 };
}

/**
 * Chia mặt khe thành các ô vừa cỡ 1 túi khí `size` (rộng x cao tối đa), các ô liền nhau và lấp kín mặt khe:
 * số ô = số túi cần dùng.
 */
export function splitIntoBags(gap: Omit<DunnageGap, 'id' | 'source' | 'bags' | 'bagCount' | 'wall'>, size: AirbagSize): DunnageBag[] {
  const horizontal = gap.axis === 'LENGTH' ? gap.width : gap.length;
  const nH = Math.max(1, Math.ceil(horizontal / size.width - EPS));
  const nV = Math.max(1, Math.ceil(gap.height / size.height - EPS));
  const cellH = horizontal / nH;
  const cellV = gap.height / nV;
  const sizeLabel = airbagSizeLabel(size);
  const bags: DunnageBag[] = [];
  for (let i = 0; i < nH; i++) {
    for (let k = 0; k < nV; k++) {
      bags.push(
        gap.axis === 'LENGTH'
          ? { sizeLabel, stackCount: 1, x: gap.x, y: gap.y + i * cellH, z: gap.z + k * cellV, length: gap.length, width: cellH, height: cellV }
          : { sizeLabel, stackCount: 1, x: gap.x + i * cellH, y: gap.y, z: gap.z + k * cellV, length: cellH, width: gap.width, height: cellV },
      );
    }
  }
  return bags;
}

function overlap3D(a: DunnageBag, b: DunnageBag): boolean {
  return (
    a.x < b.x + b.length - EPS && b.x < a.x + a.length - EPS &&
    a.y < b.y + b.width - EPS && b.y < a.y + a.width - EPS &&
    a.z < b.z + b.height - EPS && b.z < a.z + a.height - EPS
  );
}

type NewGap = Omit<DunnageGap, 'id'>;

/**
 * Khe giữa hai cột pallet: trong mỗi hàng pallet (cùng tầng z, cùng x, cùng chiều dài), 2 pallet liền kề theo
 * chiều rộng cách nhau d (chèn được bằng ít nhất 1 cỡ túi) -> túi dài bằng hàng pallet (theo trục dọc container),
 * cỡ/số túi chồng theo chooseCenterBagPlan, đặt giữa chiều cao pallet. Mỗi tầng pallet 1 khe (kèm các túi).
 */
function detectPalletCenterGaps(placements: Placement[], cfg: DunnageConfig): NewGap[] {
  const rows = new Map<string, Placement[]>();
  for (const p of placements) {
    if (!p.palletLoad) continue;
    const key = `${Math.round(p.z)}|${Math.round(p.x)}|${Math.round(p.length)}`;
    rows.set(key, [...(rows.get(key) ?? []), p]);
  }

  const tiers = new Map<string, { z: number; gapSize: number; bags: DunnageBag[]; height: number }>();
  for (const row of rows.values()) {
    const sorted = [...row].sort((a, b) => a.y - b.y);
    for (let i = 0; i + 1 < sorted.length; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      const gap = b.y - (a.y + a.width);
      const height = Math.min(a.height, b.height);
      const plan = chooseCenterBagPlan(gap, height, a.length, cfg);
      if (!plan) continue; // không cỡ túi nào chèn được khe này
      const sizeLabel = airbagSizeLabel(plan.size);
      const bottom = a.z + (height - plan.coveredHeight) / 2;
      const rowBags: DunnageBag[] = [];
      for (let along = 0; along < plan.alongCount; along++) {
        for (let layer = 0; layer < plan.stackCount; layer++) {
          rowBags.push({
            sizeLabel,
            stackCount: plan.stackCount,
            x: a.x + along * plan.bagLength,
            y: a.y + a.width,
            z: bottom + layer * plan.bagHeight,
            length: plan.bagLength,
            width: gap,
            height: plan.bagHeight,
          });
        }
      }
      const key = `${Math.round(a.z)}|${Math.round(gap)}`;
      const tier = tiers.get(key) ?? { z: a.z, gapSize: gap, bags: [], height: 0 };
      tier.bags.push(...rowBags);
      tier.height = Math.max(tier.height, height);
      tiers.set(key, tier);
    }
  }

  return Array.from(tiers.values())
    .sort((a, b) => a.z - b.z)
    .map((tier) => {
      const bags = [...tier.bags].sort((a, b) => a.x - b.x);
      const x0 = Math.min(...bags.map((b) => b.x));
      const x1 = Math.max(...bags.map((b) => b.x + b.length));
      return {
        source: 'CENTER' as const,
        axis: 'WIDTH' as const,
        gapSize: tier.gapSize,
        wall: false,
        x: x0,
        y: bags[0].y,
        z: tier.z,
        length: x1 - x0,
        width: tier.gapSize,
        height: tier.height,
        bags,
        bagCount: bags.length,
      };
    });
}

/**
 * Các khe cần chèn túi khí của 1 container: khe giữa hai cột pallet (mỗi hàng 1 túi) trước, rồi các khe tổng
 * quát (gộp khe liền kề, loại khe không cỡ túi nào chèn được, bỏ khe trùng khe giữa); chỉ giữ tối đa `maxGaps`
 * khe tổng quát lớn nhất (nhẹ khi có hàng nghìn kiện). Kết quả ổn định theo toạ độ.
 */
export function computeDunnageGaps(
  placements: Placement[],
  template: ContainerTemplate,
  cfg: DunnageConfig = DUNNAGE_CONFIG,
): DunnageGap[] {
  if (placements.length === 0) return [];
  const center = detectPalletCenterGaps(placements, cfg);

  const boxes: Box[] = placements;
  const raw = [
    ...findRawGaps(boxes, LENGTH_AXIS, template, cfg),
    ...findRawGaps(boxes, WIDTH_AXIS, template, cfg),
  ];
  const generic: NewGap[] = mergeRawGaps(raw)
    .filter((g) => g.u1 - g.u0 >= cfg.minLateral - EPS && g.v1 - g.v0 >= cfg.minLateral - EPS)
    .sort((a, b) => (b.u1 - b.u0) * (b.v1 - b.v0) - (a.u1 - a.u0) * (a.v1 - a.v0))
    .map((g) => {
      const base = { axis: g.axis, gapSize: g.size, ...toBox(g) };
      const size = chooseGenericSize(g.size, cfg);
      const bags = size ? splitIntoBags(base, size) : [];
      return { source: 'GENERIC' as const, wall: g.wall, ...base, bags, bagCount: bags.length };
    })
    .filter((g) => g.bagCount > 0)
    .filter((g) => !center.some((c) => overlap3D(g, c)))
    .slice(0, cfg.maxGaps)
    .sort((a, b) => a.axis.localeCompare(b.axis) || a.x - b.x || a.y - b.y || a.z - b.z);

  return [...center, ...generic].map((g, index) => ({ id: `dunnage-${index + 1}`, ...g }));
}

export interface AirbagUsage {
  sizeLabel: string;
  stackCount: number;     // số túi chồng lên nhau theo chiều cao (1 hoặc 2)
  bagHeight: number;      // chiều cao hiển thị của mỗi túi (mm)
  coveredHeight: number;  // tổng chiều cao che được = stackCount x bagHeight (mm)
  count: number;          // số túi thuộc nhóm này
}

/** Tổng số túi khí cần dùng + thống kê theo cỡ túi/số túi chồng/chiều cao (để hiển thị ở thống kê và PDF). */
export function summarizeDunnage(gaps: DunnageGap[]): { airbags: number; usage: AirbagUsage[] } {
  const groups = new Map<string, AirbagUsage>();
  for (const gap of gaps) {
    for (const bag of gap.bags) {
      const sizeLabel = bag.sizeLabel ?? 'túi khí';
      const stackCount = bag.stackCount ?? 1;
      const key = `${sizeLabel}|${stackCount}|${Math.round(bag.height)}`;
      const entry = groups.get(key) ?? { sizeLabel, stackCount, bagHeight: bag.height, coveredHeight: bag.height * stackCount, count: 0 };
      entry.count += 1;
      groups.set(key, entry);
    }
  }
  const usage = Array.from(groups.values()).sort((a, b) => a.sizeLabel.localeCompare(b.sizeLabel) || a.stackCount - b.stackCount);
  return { airbags: gaps.reduce((sum, g) => sum + g.bagCount, 0), usage };
}

/** Dòng mô tả đúng cỡ, chiều cao và số túi, vd "12 túi cỡ L 1250×1200 mm — chồng 2 túi, mỗi túi cao 105 cm (tổng 210 cm)". */
export function describeAirbagUsage(gaps: DunnageGap[]): string[] {
  const cm = (mm: number) => Math.round(mm / 10);
  return summarizeDunnage(gaps).usage.map((u) =>
    u.stackCount > 1
      ? `${u.count} túi cỡ ${u.sizeLabel} — chồng ${u.stackCount} túi, mỗi túi cao ${cm(u.bagHeight)} cm (tổng ${cm(u.coveredHeight)} cm)`
      : `${u.count} túi cỡ ${u.sizeLabel} — cao ${cm(u.bagHeight)} cm`,
  );
}
