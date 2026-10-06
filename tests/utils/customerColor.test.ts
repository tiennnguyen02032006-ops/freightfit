import { describe, expect, it } from 'vitest';
import { NO_CUSTOMER_COLOR, customerColor, displayColor, normalizeCustomer } from '../../src/utils/customerColor';

describe('customerColor', () => {
  it('cùng khách hàng luôn cùng màu (không phân biệt hoa thường/khoảng trắng thừa)', () => {
    expect(customerColor('Công ty A')).toBe(customerColor('  công  ty a '));
    expect(customerColor('Công ty A')).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('màu cố định theo tên, không phụ thuộc khách hàng khác hay thứ tự', () => {
    const first = customerColor('ACME');
    customerColor('Beta');
    customerColor('Gamma');
    expect(customerColor('ACME')).toBe(first);
  });

  it('các khách hàng khác nhau có màu khác nhau', () => {
    const colors = ['ACME', 'Beta', 'Gamma', 'Delta', 'Công ty A', 'Công ty B'].map(customerColor);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it('không có khách hàng -> màu trung tính', () => {
    expect(customerColor(undefined)).toBe(NO_CUSTOMER_COLOR);
    expect(customerColor('   ')).toBe(NO_CUSTOMER_COLOR);
    expect(normalizeCustomer('  ')).toBeUndefined();
  });

  it('displayColor: theo khách hàng hoặc quay lại màu SKU', () => {
    const t = { color: '#112233', customer: 'ACME' };
    expect(displayColor(t, 'customer')).toBe(customerColor('ACME'));
    expect(displayColor(t, 'sku')).toBe('#112233');
  });
});
