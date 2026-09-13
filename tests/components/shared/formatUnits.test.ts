import { describe, expect, it } from 'vitest';
import { formatMmAsCm, formatNumber } from '../../../src/components/shared/formatUnits';
import { convertToMm } from '../../../src/import/parseExcel';

describe('formatMmAsCm', () => {
  it('quy đổi đúng hệ số 10 giữa mm (lưu trữ nội bộ) và cm (hiển thị)', () => {
    expect(formatMmAsCm(1000)).toBe('100');
  });

  it('hiển thị đúng kích thước container 40ft GP (12032mm -> 1203.2cm) theo định dạng vi-VN', () => {
    expect(formatMmAsCm(12032)).toBe('1.203,2');
  });

  it('làm tròn đúng theo số chữ số thập phân truyền vào', () => {
    expect(formatMmAsCm(1234, 0)).toBe('123');
  });
});

describe('formatNumber', () => {
  it('định dạng số nguyên lớn có dấu chấm ngăn nghìn kiểu vi-VN', () => {
    expect(formatNumber(28180, 0)).toBe('28.180');
  });
});

describe('round-trip cm (form nhập tay) -> mm (lưu trữ) -> cm (hiển thị)', () => {
  it('người dùng nhập 120.32 cm phải lưu đúng 1203.2mm và hiển thị lại đúng 120.3cm', () => {
    const storedMm = convertToMm(120.32, 'cm');
    expect(storedMm).toBeCloseTo(1203.2);
    expect(formatMmAsCm(storedMm)).toBe('120,3');
  });

  it('không được lưu nhầm bằng giá trị cm chưa nhân 10 (bug lẽ ra phải tránh)', () => {
    const storedMm = convertToMm(50, 'cm');
    expect(storedMm).toBe(500);
    expect(storedMm).not.toBe(50);
  });
});
