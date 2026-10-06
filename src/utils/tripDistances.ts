import type { TripPlanStop, TripStopDistance } from '../domain/types';

function samePair(d: TripStopDistance, a: string, b: string): boolean {
  return (d.stopIdA === a && d.stopIdB === b) || (d.stopIdA === b && d.stopIdB === a);
}

/** Khoảng cách (km) đã nhập giữa 2 điểm giao (đối xứng); null nếu cặp này còn để trống. */
export function getDistance(distances: TripStopDistance[], a: string, b: string): number | null {
  const found = distances.find((d) => samePair(d, a, b));
  return found ? found.km : null;
}

/** Đặt khoảng cách của 1 cặp điểm giao; km = null -> xoá (để trống cặp đó). */
export function setDistance(distances: TripStopDistance[], a: string, b: string, km: number | null): TripStopDistance[] {
  const without = distances.filter((d) => !samePair(d, a, b));
  return km === null ? without : [...without, { stopIdA: a, stopIdB: b, km }];
}

/** Đọc 1 ô số km (chấp nhận dấu phẩy thập phân kiểu Excel VN); rỗng/không phải số/âm -> null. */
export function parseKm(cell: string): number | null {
  const text = cell.trim().replace(',', '.');
  if (text === '') return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function isBlank(cell: string | undefined): boolean {
  return cell === undefined || cell.trim() === '';
}

function isHeaderCell(cell: string | undefined): boolean {
  return !isBlank(cell) && parseKm(cell!) === null;
}

/**
 * Áp dữ liệu dán từ Excel (TSV, mỗi dòng 1 hàng bảng) vào ma trận khoảng cách:
 * - Nếu dữ liệu có hàng/cột tiêu đề là chữ (tên điểm giao), ô được đặt theo TÊN điểm (không phân biệt
 *   hoa/thường); tiêu đề không khớp tên nào thì đặt theo vị trí.
 * - Nếu không có tiêu đề, ô đầu tiên khớp với ô đang chọn (anchorRow, anchorCol) rồi lan sang phải/xuống.
 * - Ô số -> đặt khoảng cách (đối xứng, số thắng ô trống của cặp đối xứng); ô TRỐNG -> xoá cặp đó
 *   (chưa biết); ô chữ khác, đường chéo và ô ngoài phạm vi bị bỏ qua.
 */
export function applyPastedDistanceTable(
  stops: TripPlanStop[],
  distances: TripStopDistance[],
  text: string,
  anchorRow = 0,
  anchorCol = 0,
): TripStopDistance[] {
  const lines = text.replace(/\r/g, '').split('\n');
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  const table = lines.map((line) => line.split('\t'));
  if (table.length === 0) return distances;

  const hasHeaderRow = table.length > 1 && table[0].slice(1).some(isHeaderCell) && table[0].slice(1).every((c) => isBlank(c) || isHeaderCell(c));
  const bodyRows = table.slice(hasHeaderRow ? 1 : 0);
  const firstCol = bodyRows.map((r) => r[0]);
  const hasHeaderCol = firstCol.some(isHeaderCell) && firstCol.every((c) => isBlank(c) || isHeaderCell(c));

  const indexByName = new Map(stops.map((s, i) => [s.name.trim().toLowerCase(), i] as const));
  const resolveHeader = (label: string | undefined, positional: number): number =>
    (label !== undefined ? indexByName.get(label.trim().toLowerCase()) : undefined) ?? positional;

  const hasHeader = hasHeaderRow || hasHeaderCol;
  const rowBase = hasHeader ? 0 : anchorRow;
  const colBase = hasHeader ? 0 : anchorCol;

  const sets = new Map<string, { a: string; b: string; km: number }>();
  const clears: Array<{ a: string; b: string }> = [];
  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

  bodyRows.forEach((row, r) => {
    const rowIdx = hasHeaderCol ? resolveHeader(row[0], r) : rowBase + r;
    const cells = hasHeaderCol ? row.slice(1) : row;
    cells.forEach((cell, c) => {
      const colIdx = hasHeaderRow ? resolveHeader(table[0][c + (hasHeaderCol ? 1 : 0)], c) : colBase + c;
      const rowStop = stops[rowIdx];
      const colStop = stops[colIdx];
      if (!rowStop || !colStop || rowStop.stopId === colStop.stopId) return;
      const km = parseKm(cell);
      if (km !== null) sets.set(key(rowStop.stopId, colStop.stopId), { a: rowStop.stopId, b: colStop.stopId, km });
      else if (isBlank(cell)) clears.push({ a: rowStop.stopId, b: colStop.stopId });
    });
  });

  let result = distances;
  for (const c of clears) {
    if (!sets.has(key(c.a, c.b))) result = setDistance(result, c.a, c.b, null);
  }
  for (const s of sets.values()) result = setDistance(result, s.a, s.b, s.km);
  return result;
}
