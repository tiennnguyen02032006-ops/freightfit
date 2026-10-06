import * as XLSX from 'xlsx';
import type { CargoImportRow, CargoTemplate, Clearance, DangerClass, RotationAxis, SpecialGroup } from '../domain/types';
import { computeAllowedOrientations } from '../engine/preprocessing/orientation';

export type LengthUnit = 'mm' | 'cm' | 'm' | 'in' | 'ft';

const UNIT_TO_MM: Record<LengthUnit, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
  in: 25.4, // 1 inch = 2,54 cm
  ft: 304.8, // 1 ft = 30,48 cm
};

export function convertToMm(value: number, unit: LengthUnit): number {
  return value * UNIT_TO_MM[unit];
}

const ROTATION_RAW_MAP: Record<string, RotationAxis> = {
  none: 'NONE',
  khong: 'NONE',
  'không xoay': 'NONE',
  yaw: 'YAW',
  full: 'FULL',
  'tu do': 'FULL',
  'tự do': 'FULL',
};

export function mapRotationRaw(rotationRaw: string | undefined): RotationAxis {
  if (!rotationRaw) return 'NONE';
  const normalized = rotationRaw.trim().toLowerCase();
  return ROTATION_RAW_MAP[normalized] ?? 'NONE';
}

/**
 * Đọc sheet đầu tiên của file Excel/CSV thành danh sách CargoImportRow thô (chưa convert đơn vị,
 * chưa validate). File I/O + thư viện xlsx nên KHÔNG đặt trong engine/ (vi phạm ranh giới pure).
 */
export async function parseExcelFile(file: File): Promise<CargoImportRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  return rows.map((row, index) => toImportRow(row, index));
}

/**
 * Chuẩn hoá tên cột để so khớp không phân biệt hoa/thường, khoảng trắng thừa hay ký tự BOM
 * (thường gặp ở đầu cột đầu tiên khi export CSV từ Excel).
 */
const BOM_CHAR_CODE = 0xfeff; // U+FEFF — tránh viết ký tự BOM thật trong source (bị no-irregular-whitespace chặn)

function normalizeHeaderKey(key: string): string {
  const withoutBom = key.charCodeAt(0) === BOM_CHAR_CODE ? key.slice(1) : key;
  return withoutBom.trim().toLowerCase();
}

/**
 * Lấy giá trị của một cột trong dòng dữ liệu, chấp nhận nhiều biến thể tên cột (không phân biệt
 * hoa/thường, có khoảng trắng thừa, tên tiếng Anh lẫn tiếng Việt).
 */
function getField(row: Record<string, unknown>, aliases: string[]): unknown {
  const normalizedAliases = aliases.map(normalizeHeaderKey);
  for (const rawKey of Object.keys(row)) {
    if (normalizedAliases.includes(normalizeHeaderKey(rawKey))) {
      return row[rawKey];
    }
  }
  return undefined;
}

const CUSTOMER_ALIASES = ['Khách hàng', 'khach hang', 'Khách', 'khach', 'Tên khách hàng', 'ten khach hang', 'customer', 'customer name', 'client'];
const DESTINATION_PORT_ALIASES = ['Cảng đích', 'cang dich', 'Cảng đến', 'cang den', 'Cảng', 'cang', 'destination port', 'destination', 'port of discharge', 'port'];

const DELIVERY_POINT_ALIASES = ['Điểm giao', 'diem giao', 'Điểm giao hàng', 'diem giao hang', 'delivery point', 'delivery'];

export function toImportRow(row: Record<string, unknown>, index: number): CargoImportRow {
  const colorCell = getField(row, ['color', 'Màu', 'mau']);

  // Một số file mẫu gộp chung SKU và tên hàng vào 1 cột (vd "Tên mặt hàng/sku"). Khi đó dùng
  // luôn giá trị này cho cả sku lẫn name nếu không có cột sku/name riêng.
  const combinedCell = getField(row, ['Tên mặt hàng/sku', 'ten mat hang/sku', 'ten mat hang / sku']);
  const skuCell = getField(row, ['sku', 'Mã SKU', 'ma sku', 'Mã hàng', 'ma hang']);
  const nameCell = getField(row, ['name', 'Tên hàng', 'ten hang', 'Tên', 'ten']);

  const importRow: CargoImportRow = {
    rowIndex: index,
    sku: String(skuCell ?? combinedCell ?? '').trim(),
    name: String(nameCell ?? combinedCell ?? '').trim(),
    length: Number(getField(row, ['length', 'Dài', 'dai', 'L']) ?? 0),
    width: Number(getField(row, ['width', 'Rộng', 'rong', 'W']) ?? 0),
    height: Number(getField(row, ['height', 'Cao', 'Chiều cao', 'chieu cao', 'H']) ?? 0),
    weight: Number(getField(row, ['weight', 'Trọng lượng', 'trong luong', 'Khối lượng', 'khoi luong']) ?? 0),
    quantity: Number(getField(row, ['quantity', 'Số lượng', 'so luong', 'SL']) ?? 0),
    rotationRaw: (() => {
      const v = getField(row, ['rotation', 'Xoay']);
      return v ? String(v) : undefined;
    })(),
    colorRaw: colorCell ? String(colorCell) : undefined,
    deliveryPointRaw: String(getField(row, DELIVERY_POINT_ALIASES) ?? '').trim() || undefined,
    customerRaw: String(getField(row, CUSTOMER_ALIASES) ?? '').trim() || undefined,
    destinationPortRaw: String(getField(row, DESTINATION_PORT_ALIASES) ?? '').trim() || undefined,
    cargoGroupRaw: String(getField(row, ['Nhóm hàng', 'nhom hang', 'Nhóm', 'nhom', 'cargo group', 'group']) ?? '').trim() || undefined,
    dangerClassRaw: String(getField(row, ['Lớp', 'lop', 'Lớp nguy hiểm', 'lop nguy hiem', 'class', 'dg class', 'imdg class']) ?? '').trim() || undefined,
    valid: true,
  };
  return validateImportRow(importRow);
}

// ---------- Nhóm hàng đặc biệt (cột "Nhóm hàng" + "Lớp") ----------

export type CargoGroupParse =
  | { ok: true; cargoGroup?: SpecialGroup; dangerClass?: DangerClass }
  | { ok: false; error: string };

// bỏ dấu, hạ chữ thường, gộp khoảng trắng — để "Thực phẩm"/"thuc pham"/"THỰC  PHẨM" cùng khớp
function foldText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const GROUP_TEXT: Record<string, SpecialGroup | 'GENERAL'> = {
  '': 'GENERAL',
  thuong: 'GENERAL',
  'hang thuong': 'GENERAL',
  'binh thuong': 'GENERAL',
  general: 'GENERAL',
  normal: 'GENERAL',
  'thuc pham': 'FOOD',
  food: 'FOOD',
  'co mui': 'ODOROUS',
  'hang co mui': 'ODOROUS',
  mui: 'ODOROUS',
  odorous: 'ODOROUS',
  odor: 'ODOROUS',
  'hoa chat': 'CHEMICAL',
  chemical: 'CHEMICAL',
  'nguy hiem': 'DANGEROUS',
  'hang nguy hiem': 'DANGEROUS',
  dangerous: 'DANGEROUS',
  dg: 'DANGEROUS',
  imdg: 'DANGEROUS',
};

function parseDangerClass(text: string): DangerClass | null {
  const match = /^(?:lop|class|dg)?\s*-?\s*([1-9])$/.exec(foldText(text));
  return match ? (Number(match[1]) as DangerClass) : null;
}

/**
 * Đọc cột "Nhóm hàng" (thường/thực phẩm/có mùi/hóa chất/nguy hiểm) và cột "Lớp" (1–9, chỉ cần với hàng nguy hiểm). Chấp nhận
 * cả dạng gộp trong 1 ô như "DG3", "Nguy hiểm 3", "Lớp 3". Trống = hàng thường. Giá trị lạ hoặc hàng nguy hiểm thiếu/sai
 * lớp là lỗi (dòng bị đánh dấu không hợp lệ ở bước xem trước import).
 */
export function parseCargoGroup(groupRaw?: string, classRaw?: string): CargoGroupParse {
  const group = foldText(groupRaw ?? '');
  const classText = (classRaw ?? '').trim();

  // dạng gộp: "DG3", "Nguy hiem 3", "Class 3"
  const merged = /^(?:dg|class|lop|nguy hiem|hang nguy hiem|dangerous)\s*-?\s*([1-9])$/.exec(group);
  if (merged) return { ok: true, cargoGroup: 'DANGEROUS', dangerClass: Number(merged[1]) as DangerClass };

  const kind = GROUP_TEXT[group];
  if (kind === undefined) return { ok: false, error: `Nhóm hàng không hợp lệ: "${(groupRaw ?? '').trim()}"` };
  if (kind === 'GENERAL') return { ok: true };
  if (kind !== 'DANGEROUS') return { ok: true, cargoGroup: kind };

  if (classText === '') return { ok: false, error: 'Hàng nguy hiểm cần ghi lớp 1–9' };
  const dangerClass = parseDangerClass(classText);
  if (dangerClass === null) return { ok: false, error: `Lớp hàng nguy hiểm phải từ 1 đến 9 (đang là "${classText}")` };
  return { ok: true, cargoGroup: 'DANGEROUS', dangerClass };
}

export function validateImportRow(row: CargoImportRow): CargoImportRow {
  const errors: string[] = [];
  if (!row.sku) errors.push('Thiếu SKU');
  if (!(row.length > 0)) errors.push('Length phải > 0');
  if (!(row.width > 0)) errors.push('Width phải > 0');
  if (!(row.height > 0)) errors.push('Height phải > 0');
  if (!(row.weight > 0)) errors.push('Weight phải > 0');
  if (!(row.quantity >= 1)) errors.push('Quantity phải >= 1');
  const groupParse = parseCargoGroup(row.cargoGroupRaw, row.dangerClassRaw);
  if (!groupParse.ok) errors.push(groupParse.error);

  return {
    ...row,
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}

const DEFAULT_CLEARANCE: Clearance = { left: 0, right: 0, front: 0, back: 0, top: 0, bottom: 0 };

export interface MapRowOptions {
  unit: LengthUnit;
  color: string;
}

/**
 * Map CargoImportRow (đã validate) -> CargoTemplate, convert đơn vị kích thước về mm ngay tại đây.
 * Field không có cột trong CargoImportRow (stackable/fragile/mustKeepUpright/clearance) dùng
 * default an toàn, chỉnh tay sau qua UI.
 */
export function mapRowToCargoTemplate(row: CargoImportRow, options: MapRowOptions): CargoTemplate {
  const length = convertToMm(row.length, options.unit);
  const width = convertToMm(row.width, options.unit);
  const height = convertToMm(row.height, options.unit);
  const rotation = mapRotationRaw(row.rotationRaw);
  const groupParse = parseCargoGroup(row.cargoGroupRaw, row.dangerClassRaw);

  return {
    id: `cargo-${row.sku}-${row.rowIndex}`,
    sku: row.sku,
    name: row.name || row.sku,
    shapeType: 'BOX',
    length,
    width,
    height,
    weight: row.weight,
    quantity: row.quantity,
    rotation,
    allowedOrientations: computeAllowedOrientations(length, width, height, rotation),
    color: options.color,
    stackable: true,
    fragile: false,
    mustKeepUpright: false,
    clearance: DEFAULT_CLEARANCE,
    deliveryPoint: row.deliveryPointRaw?.trim() || undefined,
    customer: row.customerRaw?.trim() || undefined,
    destinationPort: row.destinationPortRaw?.trim() || undefined,
    ...(groupParse.ok && groupParse.cargoGroup ? { cargoGroup: groupParse.cargoGroup, dangerClass: groupParse.dangerClass } : {}),
  };
}
