import * as XLSX from 'xlsx';
import type { CargoImportRow, CargoTemplate, Clearance, RotationAxis } from '../domain/types';
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

function toImportRow(row: Record<string, unknown>, index: number): CargoImportRow {
  const colorCell = row.color ?? row.Color ?? row['Màu'] ?? row['màu'];

  const importRow: CargoImportRow = {
    rowIndex: index,
    sku: String(row.sku ?? row.SKU ?? '').trim(),
    name: String(row.name ?? row.Name ?? '').trim(),
    length: Number(row.length ?? row.Length ?? 0),
    width: Number(row.width ?? row.Width ?? 0),
    height: Number(row.height ?? row.Height ?? 0),
    weight: Number(row.weight ?? row.Weight ?? 0),
    quantity: Number(row.quantity ?? row.Quantity ?? 0),
    rotationRaw: row.rotation ? String(row.rotation) : undefined,
    colorRaw: colorCell ? String(colorCell) : undefined,
    valid: true,
  };
  return validateImportRow(importRow);
}

export function validateImportRow(row: CargoImportRow): CargoImportRow {
  const errors: string[] = [];
  if (!row.sku) errors.push('Thiếu SKU');
  if (!(row.length > 0)) errors.push('Length phải > 0');
  if (!(row.width > 0)) errors.push('Width phải > 0');
  if (!(row.height > 0)) errors.push('Height phải > 0');
  if (!(row.weight > 0)) errors.push('Weight phải > 0');
  if (!(row.quantity >= 1)) errors.push('Quantity phải >= 1');

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
  };
}
