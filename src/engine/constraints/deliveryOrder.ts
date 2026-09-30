import type { Placement } from '../../domain/types';

// Ràng buộc "không kiện nào bị chắn" theo thứ tự giao (LIFO qua cửa duy nhất) — module RIÊNG cho
// tính năng "Giai đoạn C: chọn 1 phương án giao hàng duy nhất" (xem
// engine/optimization/routeProposal.ts). KHÔNG dùng trong packContainer.ts/generateSolutions.ts —
// thuật toán xếp hàng chính không biết gì về điểm giao, chỉ tính năng này mới cần kiểm tra thêm.
//
// Quy ước toạ độ: Placement.x là khoảng cách thật tính từ CỬA container — x càng NHỎ càng gần
// cửa, x càng LỚN càng sâu bên trong (xem docs/algorithm-design.md).

/** True nếu 2 box chồng lấn theo (y,z) — bỏ qua trục x. Nếu KHÔNG chồng lấn y/z thì 2 kiện không
 * hề nằm chung "hành lang" dọc trục x, nên dù ở độ sâu x nào cũng không cản đường nhau. */
function overlapsYZ(a: Placement, b: Placement): boolean {
  return !(
    a.y + a.width <= b.y ||
    b.y + b.width <= a.y ||
    a.z + a.height <= b.z ||
    b.z + b.height <= a.z
  );
}

export interface BlockingPair {
  /** placement.id đứng GẦN cửa hơn (x nhỏ hơn) — phải dỡ ra trước blockedId mới lấy được blockedId ra. */
  blockerId: string;
  /** placement.id đứng XA cửa hơn (x lớn hơn). */
  blockedId: string;
}

/**
 * Tìm mọi cặp kiện CÙNG hành lang (y,z) trong 1 container — kiện có x nhỏ hơn (gần cửa) luôn phải
 * dỡ ra TRƯỚC kiện có x lớn hơn (sâu hơn) cùng hành lang đó, thuần theo hình học, KHÔNG phụ thuộc
 * điểm giao/thứ tự giao nào. Dùng làm input cho checkDeliveryOrder và cho vòng lặp tìm thứ tự giao
 * trong engine/optimization/routeProposal.ts.
 */
export function findBlockingPairs(placements: Placement[]): BlockingPair[] {
  const pairs: BlockingPair[] = [];
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      const a = placements[i];
      const b = placements[j];
      if (a.x === b.x) continue; // cùng độ sâu, không cái nào cản cái nào theo trục x
      if (!overlapsYZ(a, b)) continue;
      const [near, far] = a.x < b.x ? [a, b] : [b, a];
      pairs.push({ blockerId: near.id, blockedId: far.id });
    }
  }
  return pairs;
}

export interface DeliveryOrderCheckResult {
  /** id các placement bị chắn (không thể dỡ ra đúng lúc cần vì kiện giao sau vẫn đang chắn đường). */
  blockedPlacementIds: string[];
}

/**
 * Kiểm tra ràng buộc "không kiện nào bị chắn" cho MỘT thứ tự giao cụ thể. Kiện P (đứng xa cửa hơn
 * kiện Q, cùng hành lang y/z) bị CHẮN nếu Q được giao ở điểm giao SAU điểm giao của P — tức khi
 * cần dỡ P ra (đến lượt điểm giao của P) thì Q (còn phải chở tiếp, chưa được dỡ) vẫn đang đứng
 * chắn đường P ra cửa.
 *
 * @param stopIdByCargoTemplateId gán điểm giao theo cargoTemplateId (cả nhóm SKU cùng 1 điểm giao,
 *   khớp với cơ chế gán ở SavedTripsPanel.tsx Bước 2 — không cần chi tiết tới từng cargoInstanceId).
 * @param stopOrder thứ tự giao (mảng stopId, phần tử đầu = giao đầu tiên).
 */
export function checkDeliveryOrder(
  placements: Placement[],
  stopIdByCargoTemplateId: Map<string, string>,
  stopOrder: string[],
): DeliveryOrderCheckResult {
  const stopIndex = new Map(stopOrder.map((id, i) => [id, i] as const));
  const placementById = new Map(placements.map((p) => [p.id, p] as const));
  const blocked = new Set<string>();

  for (const pair of findBlockingPairs(placements)) {
    const near = placementById.get(pair.blockerId);
    const far = placementById.get(pair.blockedId);
    if (!near || !far) continue;
    const nearStop = stopIdByCargoTemplateId.get(near.cargoTemplateId);
    const farStop = stopIdByCargoTemplateId.get(far.cargoTemplateId);
    if (nearStop === undefined || farStop === undefined) continue; // chưa gán điểm giao -> bỏ qua
    const nearOrder = stopIndex.get(nearStop);
    const farOrder = stopIndex.get(farStop);
    if (nearOrder === undefined || farOrder === undefined) continue;
    // far (sâu hơn, cần dỡ sau near về mặt vật lý) nhưng lại phải giao ở điểm SỚM HƠN near
    // (farOrder < nearOrder) -> khi tới lúc giao far thì near (giao muộn hơn) vẫn còn chắn đường.
    if (farOrder < nearOrder) {
      blocked.add(far.id);
    }
  }

  return { blockedPlacementIds: Array.from(blocked) };
}
