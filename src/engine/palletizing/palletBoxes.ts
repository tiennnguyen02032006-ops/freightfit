import type { Placement } from '../../domain/types';
import { PALLET_BASE_HEIGHT_MM, getPalletType } from '../preprocessing/palletTypes';

// Quy vị trí từng thùng trên pallet (PalletLoad.layers — toạ độ cục bộ theo pallet) ra toạ độ
// container, để hiển thị 3D và thống kê theo thùng. Pallet vẫn là khối cứng khi xếp/chỉnh tay; các
// hàm ở đây chỉ ĐỌC, không bao giờ đổi vị trí pallet.

/** Số thùng/kiện thật của 1 placement (pallet = số thùng trên pallet, kiện rời = 1). */
export function placementBoxCount(placement: Placement): number {
  return placement.palletLoad?.boxCount ?? 1;
}

/**
 * Danh sách placement TỪNG THÙNG của 1 pallet (toạ độ tuyệt đối trong container). Pallet có thể
 * xoay 90° ngang trong container: lúc đó mỗi lớp được xoay theo (x' = y, y' = L - x - dài thùng).
 * Placement không phải pallet -> trả về chính nó.
 */
export function palletBoxPlacements(placement: Placement): Placement[] {
  const load = placement.palletLoad;
  if (!load) return [placement];

  const pallet = getPalletType(load.palletType);
  const rotated = pallet.length !== pallet.width && Math.abs(placement.length - pallet.length) > 1e-6;
  const boxWeight = load.boxCount > 0 ? load.totalWeight / load.boxCount : 0;

  const boxes: Placement[] = [];
  const tolerance = load.tolerance ?? 0;
  let layerBottom = placement.z + PALLET_BASE_HEIGHT_MM;
  for (const layer of load.layers) {
    const height = layer.orientation[2];
    for (const rect of layer.boxes) {
      const x = rotated ? rect.y : rect.x;
      const y = rotated ? pallet.length - rect.x - rect.length : rect.y;
      const length = rotated ? rect.width : rect.length;
      const width = rotated ? rect.length : rect.width;
      const n = boxes.length + 1;
      const bx = placement.x + x;
      const by = placement.y + y;
      boxes.push({
        id: `${placement.id}__box-${n}`,
        cargoInstanceId: `${placement.cargoInstanceId}__box-${n}`,
        cargoTemplateId: placement.cargoTemplateId,
        containerInstanceId: placement.containerInstanceId,
        x: bx,
        y: by,
        z: layerBottom + tolerance / 2, // thùng nằm giữa ô cao (h + dung sai)
        length,
        width,
        height,
        orientationIndex: 0,
        weight: boxWeight,
        centerX: bx + length / 2,
        centerY: by + width / 2,
        centerZ: layerBottom + tolerance / 2 + height / 2,
        supportRatio: 1,
        supportedByPlacementIds: [],
        stackLevel: placement.stackLevel,
      });
    }
    layerBottom += height + tolerance;
  }
  return boxes;
}

/** Trải mọi pallet trong danh sách thành từng thùng (kiện rời giữ nguyên) — dùng cho thống kê theo thùng. */
export function expandToBoxPlacements(placements: Placement[]): Placement[] {
  return placements.flatMap(palletBoxPlacements);
}

export function countPlacementBoxes(placements: Placement[]): number {
  return placements.reduce((sum, p) => sum + placementBoxCount(p), 0);
}

export function countPlacementPallets(placements: Placement[]): number {
  return placements.filter((p) => p.palletLoad).length;
}

/** Số thùng thừa của SKU xếp pallet đang xếp RỜI (không nằm trên pallet) trong danh sách placement. */
export function countLooseBoxes(placements: Placement[]): number {
  return placements.filter((p) => p.palletLeftover).length;
}

/** Các "Pallet lẻ" (pallet cuối của 1 SKU, ít thùng hơn pallet đầy) trong danh sách placement. */
export function partialPalletsOf(placements: Placement[]): Placement[] {
  return placements.filter((p) => p.palletLoad?.isPartial);
}

export interface PalletBoxInfo {
  box: Placement;           // placement của thùng (toạ độ container)
  boxNumber: number;        // thứ tự thùng trong pallet, từ 1
  boxTotal: number;         // tổng số thùng trên pallet
  layerNumber: number;      // lớp chứa thùng, từ 1 (lớp dưới cùng)
  layerCount: number;       // tổng số lớp
  indexInLayer: number;     // thứ tự trong lớp, từ 1
  layerBoxCount: number;    // số thùng trong lớp đó
}

/** Tra thông tin 1 thùng của pallet theo id (`${placement.id}__box-${n}`); null nếu không phải pallet/không có thùng đó. */
export function findPalletBox(placement: Placement, boxId: string): PalletBoxInfo | null {
  const load = placement.palletLoad;
  if (!load) return null;
  const boxes = palletBoxPlacements(placement);
  const index = boxes.findIndex((b) => b.id === boxId);
  if (index < 0) return null;

  let remaining = index;
  for (let layerIndex = 0; layerIndex < load.layers.length; layerIndex++) {
    const layerBoxCount = load.layers[layerIndex].boxes.length;
    if (remaining < layerBoxCount) {
      return {
        box: boxes[index],
        boxNumber: index + 1,
        boxTotal: boxes.length,
        layerNumber: layerIndex + 1,
        layerCount: load.layers.length,
        indexInLayer: remaining + 1,
        layerBoxCount,
      };
    }
    remaining -= layerBoxCount;
  }
  return null;
}
