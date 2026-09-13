import { describe, expect, it } from 'vitest';
import { colorBySku, generateDistinctColor, normalizeHexColor } from '../../src/utils/colorBySku';

describe('colorBySku', () => {
  it('cùng 1 SKU luôn trả về cùng 1 màu (deterministic)', () => {
    expect(colorBySku('SKU-ABC')).toBe(colorBySku('SKU-ABC'));
  });

  it('2 SKU khác nhau thường trả về màu khác nhau', () => {
    expect(colorBySku('SKU-ABC')).not.toBe(colorBySku('SKU-XYZ'));
  });

  it('trả về chuỗi hex hợp lệ dạng #rrggbb', () => {
    expect(colorBySku('SKU-1')).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('generateDistinctColor', () => {
  it('hợp lệ: trả về hex hợp lệ khi danh sách màu hiện có rỗng', () => {
    expect(generateDistinctColor([])).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('sinh màu khác nhau cho các index (số lượng màu đã có) khác nhau', () => {
    const first = generateDistinctColor([]);
    const second = generateDistinctColor(['#111111']);
    expect(first).not.toBe(second);
  });
});

describe('normalizeHexColor', () => {
  it('hợp lệ: chuẩn hóa hex thiếu dấu # và viết hoa về "#rrggbb" viết thường', () => {
    expect(normalizeHexColor('3388FF')).toBe('#3388ff');
    expect(normalizeHexColor('#AABBCC')).toBe('#aabbcc');
  });

  it('vi phạm: chuỗi không phải hex hợp lệ trả về undefined', () => {
    expect(normalizeHexColor('not-a-color')).toBeUndefined();
    expect(normalizeHexColor(undefined)).toBeUndefined();
  });
});
