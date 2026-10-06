import { describe, expect, it } from 'vitest';
import { convertToMm, mapRowToCargoTemplate, toImportRow, validateImportRow } from '../../src/import/parseExcel';
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

describe('mapRowToCargoTemplate — cột "Điểm giao"', () => {
  it('chép deliveryPointRaw (đã trim) sang deliveryPoint', () => {
    const template = mapRowToCargoTemplate(makeRow({ deliveryPointRaw: '  Hà Nội ' }), { unit: 'cm', color: '#3388ff' });
    expect(template.deliveryPoint).toBe('Hà Nội');
  });

  it('không có cột thì deliveryPoint là undefined', () => {
    const template = mapRowToCargoTemplate(makeRow(), { unit: 'cm', color: '#3388ff' });
    expect(template.deliveryPoint).toBeUndefined();
  });
});

describe('đọc cột "Khách hàng" và "Cảng đích" từ Excel', () => {
  const base = { SKU: 'S1', 'Tên hàng': 'Hàng', Dài: 40, Rộng: 30, Cao: 20, 'Trọng lượng': 5, 'Số lượng': 2 };

  it('nhận tên cột tiếng Việt', () => {
    const row = toImportRow({ ...base, 'Khách hàng': '  Công ty A ', 'Cảng đích': ' Hải Phòng ' }, 0);
    expect(row.customerRaw).toBe('Công ty A');
    expect(row.destinationPortRaw).toBe('Hải Phòng');
    const template = mapRowToCargoTemplate(row, { unit: 'cm', color: '#3388ff' });
    expect(template.customer).toBe('Công ty A');
    expect(template.destinationPort).toBe('Hải Phòng');
  });

  it('nhận tên cột tiếng Anh (không phân biệt hoa thường)', () => {
    const row = toImportRow({ ...base, CUSTOMER: 'ACME', 'Destination Port': 'Singapore' }, 0);
    expect(row.customerRaw).toBe('ACME');
    expect(row.destinationPortRaw).toBe('Singapore');
  });

  it('nhận tên cột không dấu và biến thể ngắn', () => {
    const row = toImportRow({ ...base, 'khach hang': 'B', Port: 'Busan' }, 0);
    expect(row.customerRaw).toBe('B');
    expect(row.destinationPortRaw).toBe('Busan');
  });

  it('thiếu cột hoặc ô trống -> undefined, dòng vẫn hợp lệ', () => {
    const row = toImportRow({ ...base, 'Khách hàng': '   ' }, 0);
    expect(row.customerRaw).toBeUndefined();
    expect(row.destinationPortRaw).toBeUndefined();
    expect(row.valid).toBe(true);
    const template = mapRowToCargoTemplate(row, { unit: 'cm', color: '#3388ff' });
    expect(template.customer).toBeUndefined();
    expect(template.destinationPort).toBeUndefined();
  });
});
