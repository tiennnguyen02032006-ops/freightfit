import type { CargoTemplate, ContainerInstance, RedTeamPallet, RedTeamScenario } from '../../domain/types';
import { REDTEAM_DEFAULT_PARAMS, defaultStops } from './defaults';

// Số kiện tối đa đưa vào mô phỏng khi container không có pallet (dùng kiện rời) — giữ mô phỏng nhanh.
export const MAX_REDTEAM_UNITS = 300;

export interface RedTeamSource {
  scenario: RedTeamScenario | null;
  note: string | null;   // lưu ý hiển thị (vd bỏ kiện rời, quá nhiều kiện)
}

/** Đơn/nhóm hàng của 1 loại hàng: điểm giao ghi trong hàng, nếu không có thì khách hàng, nếu không có thì SKU. */
export function orderKeyOf(template: Pick<CargoTemplate, 'deliveryPoint' | 'customer' | 'sku'>): string {
  return template.deliveryPoint?.trim() || template.customer?.trim() || template.sku;
}

/**
 * Dựng kịch bản Red Team từ 1 container đã xếp: mỗi nhóm hàng (xem orderKeyOf) là 1 điểm giao, vị trí thật của từng
 * pallet lấy nguyên từ phương án (x = chiều sâu tính từ cửa, y = bên trái/phải) — KHÔNG sửa phương án. Thứ tự điểm giao mặc
 * định: nhóm nằm gần cửa nhất giao trước. Chỉ ĐỌC dữ liệu, tách biệt khỏi thuật toán xếp.
 */
export function buildRedTeamScenario(
  container: ContainerInstance,
  templatesById: Map<string, CargoTemplate>,
  innerWidth: number,
): RedTeamSource {
  const pallets = container.placements.filter((p) => p.palletLoad);
  let units = pallets;
  let note: string | null = null;
  if (pallets.length > 0) {
    const loose = container.placements.length - pallets.length;
    if (loose > 0) note = `Đã bỏ ${loose} kiện rời (không phải pallet) khỏi mô phỏng.`;
  } else {
    units = container.placements;
    if (units.length > MAX_REDTEAM_UNITS) {
      return { scenario: null, note: `Container có ${units.length} kiện rời, vượt ${MAX_REDTEAM_UNITS} kiện — Red Team dùng cho phương án xếp pallet hoặc ít kiện.` };
    }
  }
  if (units.length === 0) return { scenario: null, note: 'Container chưa có pallet/kiện nào để mô phỏng.' };

  const counters = new Map<string, number>();
  const redPallets: RedTeamPallet[] = units.map((p) => {
    const template = templatesById.get(p.cargoTemplateId);
    const sku = template?.sku ?? p.cargoTemplateId;
    const n = (counters.get(sku) ?? 0) + 1;
    counters.set(sku, n);
    return {
      id: p.id,
      label: `${sku} #${n}`,
      orderId: template ? orderKeyOf(template) : p.cargoTemplateId,
      lane: p.y + p.width / 2 < innerWidth / 2 ? 'LEFT' : 'RIGHT',
      x: p.x,
      y: p.y,
      z: p.z,
      length: p.length,
      width: p.width,
      height: p.height,
    };
  });

  // Nhóm gần cửa nhất (x trung bình nhỏ nhất) giao trước.
  const depth = new Map<string, { sum: number; n: number }>();
  for (const p of redPallets) {
    const d = depth.get(p.orderId) ?? { sum: 0, n: 0 };
    depth.set(p.orderId, { sum: d.sum + p.x + p.length / 2, n: d.n + 1 });
  }
  const orders = Array.from(depth.entries())
    .sort((a, b) => a[1].sum / a[1].n - b[1].sum / b[1].n || a[0].localeCompare(b[0]))
    .map(([id]) => ({ id, name: id }));

  return { scenario: { stops: defaultStops(orders), pallets: redPallets, params: { ...REDTEAM_DEFAULT_PARAMS } }, note };
}
