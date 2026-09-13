import { describe, expect, it } from 'vitest';
import { convertToMm, mapRowToCargoTemplate, validateImportRow } from '../../src/import/parseExcel';
import type { CargoImportRow } from '../../src/domain/types';

function makeRow(overrides: Partial<CargoImportRow> = {}): CargoImportRow {
  return {
    rowIndex: 0,
    sku: 'SKU-1',
    name: 'Hàng mẫu',
    length: 40,
    width: 30,
    height: 20,
    weight: 10,
    quantity: 2,
    valid: true,
    ...overrides,
  };
}

describe('convertToMm', () => {
  it('convert cm sang mm nhân 10', () => {
    expect(convertToMm(40, 'cm')).toBe(400);
  });

  it('convert m sang mm nhân 1000', () => {
    expect(convertToMm(1.2, 'm')).toBeCloseTo(1200);
  });
});

describe('validateImportRow', () => {
  it('hợp lệ: đầy đủ dữ liệu hợp lệ thì valid=true, không có errors', () => {
    const result = validateImportRow(makeRow());
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it('vi phạm: thiếu weight thì valid=false và có error tương ứng', () => {
    const result = validateImportRow(makeRow({ weight: 0 }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Weight phải > 0');
  });
});

describe('mapRowToCargoTemplate', () => {
  it('convert đơn vị cm sang mm và điền allowedOrientations theo rotation NONE', () => {
    const row = makeRow({ rotationRaw: 'NONE' });
    const template = mapRowToCargoTemplate(row, { unit: 'cm', color: '#3388ff' });

    expect(template.length).toBe(400);
    expect(template.width).toBe(300);
    expect(template.height).toBe(200);
    expect(template.allowedOrientations).toEqual([[400, 300, 200]]);
    expect(template.quantity).toBe(2);
    expect(template.color).toBe('#3388ff');
  });
});
