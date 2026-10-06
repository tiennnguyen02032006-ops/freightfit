import type { TripPlanCargoRef, TripPlanRecord, TripPlanStop } from '../domain/types';

// Nhóm kiện ĐANG XẾP theo cargoTemplateId, kèm tên điểm giao lấy từ cột "Điểm giao" của file
// import (CargoTemplate.deliveryPoint) — undefined nếu hàng nhập tay/file không có cột này.
export interface CargoGroupForTrip {
  cargoTemplateId: string;
  instanceIds: string[];
  deliveryPoint?: string;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Đồng bộ danh sách điểm giao + gán hàng của 1 chuyến theo cột "Điểm giao" trong file import:
 * - Điểm giao chưa có trong chuyến (so tên không phân biệt hoa/thường) -> tự thêm, theo thứ tự
 *   xuất hiện đầu tiên trong file.
 * - Nhóm hàng có deliveryPoint -> gán đúng điểm giao trùng tên (không cần gán tay).
 * - Nhóm hàng KHÔNG có deliveryPoint -> giữ nguyên gán cũ; chưa gán thì gán điểm đầu tiên (nếu có).
 * Trả về null nếu chuyến không cần thay đổi gì (để nơi gọi tránh ghi lại vô ích).
 */
export function reconcileTripWithCargo(
  plan: TripPlanRecord,
  groups: CargoGroupForTrip[],
  newStopId: () => string,
): TripPlanRecord | null {
  const stops: TripPlanStop[] = [...plan.stops];
  let changed = false;

  for (const g of groups) {
    const name = g.deliveryPoint?.trim();
    if (!name) continue;
    if (!stops.some((s) => normalizeName(s.name) === normalizeName(name))) {
      stops.push({ stopId: newStopId(), order: stops.length, name });
      changed = true;
    }
  }

  let cargo: TripPlanCargoRef[] = plan.cargo;
  for (const g of groups) {
    const name = g.deliveryPoint?.trim();
    const existing = cargo.filter((c) => c.cargoTemplateId === g.cargoTemplateId);
    let targetStopId: string | undefined;
    if (name) {
      targetStopId = stops.find((s) => normalizeName(s.name) === normalizeName(name))?.stopId;
    } else if (existing.length === 0) {
      targetStopId = stops[0]?.stopId;
    } else {
      continue;
    }
    if (!targetStopId) continue;

    const stopId = targetStopId;
    const upToDate =
      existing.length === g.instanceIds.length &&
      existing.every((c) => c.stopId === stopId) &&
      g.instanceIds.every((id) => existing.some((c) => c.cargoInstanceId === id));
    if (upToDate) continue;

    cargo = [
      ...cargo.filter((c) => c.cargoTemplateId !== g.cargoTemplateId),
      ...g.instanceIds.map((cargoInstanceId) => ({ cargoInstanceId, cargoTemplateId: g.cargoTemplateId, stopId })),
    ];
    changed = true;
  }

  return changed ? { ...plan, stops, cargo } : null;
}

/** Tách văn bản dán vào thành danh sách tên điểm giao: mỗi dòng 1 điểm, bỏ dòng trống, bỏ tên trùng. */
export function parseStopNames(text: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const name = line.trim();
    if (!name || seen.has(normalizeName(name))) continue;
    seen.add(normalizeName(name));
    names.push(name);
  }
  return names;
}

/** Tên mặc định "Điểm N" (N = số điểm hiện có + 1), tăng dần cho tới khi không trùng tên đã có. */
export function defaultStopName(existingNames: string[]): string {
  const taken = new Set(existingNames.map(normalizeName));
  let n = existingNames.length + 1;
  while (taken.has(normalizeName(`Điểm ${n}`))) n++;
  return `Điểm ${n}`;
}

/**
 * Thêm nhiều điểm giao cùng lúc từ danh sách tên (mỗi phần tử 1 điểm). Tên rỗng -> đặt tên mặc
 * định "Điểm N"; tên đã có trong chuyến (không phân biệt hoa/thường) bị bỏ qua.
 */
export function appendStops(stops: TripPlanStop[], names: string[], newStopId: () => string): TripPlanStop[] {
  const result = [...stops];
  for (const raw of names) {
    const name = raw.trim() || defaultStopName(result.map((s) => s.name));
    if (result.some((s) => normalizeName(s.name) === normalizeName(name))) continue;
    result.push({ stopId: newStopId(), order: result.length, name });
  }
  return result;
}
