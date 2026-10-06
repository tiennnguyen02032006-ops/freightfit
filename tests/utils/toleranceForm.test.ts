import { describe, expect, it } from 'vitest';
import { mmToCmText, parseToleranceCm } from '../../src/utils/toleranceForm';

describe('parseToleranceCm', () => {
  it('số hợp lệ (kể cả dấu phẩy thập phân và 0) -> mm làm tròn 1 mm', () => {
    expect(parseToleranceCm('1.5')).toEqual({ ok: true, mm: 15 });
    expect(parseToleranceCm(' 3 ')).toEqual({ ok: true, mm: 30 });
    expect(parseToleranceCm('0,75')).toEqual({ ok: true, mm: 8 });
    expect(parseToleranceCm('0')).toEqual({ ok: true, mm: 0 });
  });

  it('số âm, trống, không phải số -> lỗi có lời báo', () => {
    expect(parseToleranceCm('-1')).toEqual({ ok: false, error: 'Không được nhỏ hơn 0' });
    expect(parseToleranceCm('')).toMatchObject({ ok: false });
    expect(parseToleranceCm('  ')).toMatchObject({ ok: false });
    expect(parseToleranceCm('abc')).toEqual({ ok: false, error: 'Không phải số hợp lệ' });
  });

  it('mmToCmText đổi mm sang cm cho ô nhập', () => {
    expect(mmToCmText(15)).toBe('1.5');
    expect(mmToCmText(30)).toBe('3');
  });
});
