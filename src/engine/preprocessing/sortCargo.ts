import { PRIORITY_WEIGHTS, type PriorityWeights } from '../config';
import type { ExpandedCargoItem } from './normalizeCargo';

function normalize(values: number[]): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return values.map(() => 0);
  return values.map((v) => (v - min) / (max - min));
}

/**
 * priorityScore theo docs/algorithm-design.md mục 2. Chỉ dùng MỘT bộ trọng số duy nhất
 * (PRIORITY_WEIGHTS) — app không còn khái niệm nhiều strategy/phương án, và cũng không còn khái
 * niệm nhóm hàng theo điểm giao (đã bỏ hẳn `deliveryPriority` — xem sortCargo bên dưới).
 */
export function computePriorityScores(
  items: ExpandedCargoItem[],
  weights: PriorityWeights,
): number[] {
  const volumes = items.map((i) => i.template.length * i.template.width * i.template.height);
  const weightsRaw = items.map((i) => i.template.weight);

  const normVolume = normalize(volumes);
  const normWeight = normalize(weightsRaw);

  return items.map((item, idx) => {
    return (
      weights.volume * normVolume[idx] +
      weights.weight * normWeight[idx] +
      weights.fragile * (item.template.fragile ? 1 : 0) +
      weights.upright * (item.template.mustKeepUpright ? 1 : 0)
    );
  });
}

/**
 * Sort cargo theo extreme-point heuristic kiểu EasyCargo — TOÀN BỘ hàng hóa xếp chung 1 LÔ DUY
 * NHẤT (đã bỏ hẳn khái niệm nhóm/ưu tiên theo điểm giao hàng — app không còn quản lý điểm
 * giao/đơn hàng nữa, xem panels đã bỏ và ghi chú ở generateSolutions.ts):
 * 1. Thể tích GIẢM DẦN (hàng to xếp trước, đúng nguyên tắc bin packing cổ điển — xếp hàng to
 *    trước dễ tìm chỗ hơn xếp sau).
 * 2. Cùng thể tích: NHÓM theo cargoTemplateId — các kiện CÙNG LOẠI (cùng kích thước thật, không
 *    chỉ trùng thể tích ngẫu nhiên) phải xử lý LIÊN TỤC nhau, để thuật toán đặt chúng cạnh nhau
 *    thành khối/hàng đồng nhất thay vì xen kẽ với loại khác có cùng thể tích nhưng khác hình dạng.
 * 3. Nếu vẫn hòa (cùng thể tích, cùng template): dùng priorityScore (PRIORITY_WEIGHTS) làm
 *    tie-break cuối cùng để thứ tự luôn xác định (deterministic).
 */
export function sortCargo(items: ExpandedCargoItem[]): ExpandedCargoItem[] {
  const priorityScores = computePriorityScores(items, PRIORITY_WEIGHTS);

  return items
    .map((item, idx) => ({ item, priorityScore: priorityScores[idx] }))
    .sort((a, b) => {
      const volumeA = a.item.template.length * a.item.template.width * a.item.template.height;
      const volumeB = b.item.template.length * b.item.template.width * b.item.template.height;
      if (volumeA !== volumeB) return volumeB - volumeA;
      if (a.item.cargoTemplateId !== b.item.cargoTemplateId) {
        return a.item.cargoTemplateId.localeCompare(b.item.cargoTemplateId);
      }
      return b.priorityScore - a.priorityScore;
    })
    .map((entry) => entry.item);
}
