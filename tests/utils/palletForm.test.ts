import { describe, expect, it } from 'vitest';
import { hasPalletFormErrors, validatePalletForm } from '../../src/utils/palletForm';

const valid = { palletMaxHeight: '150', palletMaxWeight: '1000', palletMaxTiers: '1' };

describe('validatePalletForm', () => {
  it('giá trị hợp lệ -> không có lỗi', () => {
    const errors = validatePalletForm(valid, 'cm');
    expect(errors).toEqual({});
    expect(hasPalletFormErrors(errors)).toBe(false);
  });

  it('ô trống -> báo "Nhập ..." từng ô', () => {
    const errors = validatePalletForm({ palletMaxHeight: '', palletMaxWeight: ' ', palletMaxTiers: '' }, 'cm');
    expect(errors.height).toBe('Nhập chiều cao tối đa');
    expect(errors.weight).toBe('Nhập khối lượng tối đa');
    expect(errors.tiers).toBe('Nhập số nguyên từ 1 trở lên');
    expect(hasPalletFormErrors(errors)).toBe(true);
  });

  it('chiều cao phải lớn hơn đế pallet (15 cm), tính theo đơn vị đang chọn', () => {
    expect(validatePalletForm({ ...valid, palletMaxHeight: '15' }, 'cm').height).toContain('15 cm');
    expect(validatePalletForm({ ...valid, palletMaxHeight: '16' }, 'cm').height).toBeUndefined();
    // 5 inch = 12,7 cm < 15 cm; 7 inch = 17,8 cm > 15 cm
    expect(validatePalletForm({ ...valid, palletMaxHeight: '5' }, 'in').height).toBeDefined();
    expect(validatePalletForm({ ...valid, palletMaxHeight: '7' }, 'in').height).toBeUndefined();
    expect(validatePalletForm({ ...valid, palletMaxHeight: '0.4' }, 'ft').height).toBeDefined(); // 12,2 cm
  });

  it('khối lượng phải > 0; số tầng phải là số nguyên >= 1', () => {
    expect(validatePalletForm({ ...valid, palletMaxWeight: '0' }, 'cm').weight).toBe('Phải lớn hơn 0');
    expect(validatePalletForm({ ...valid, palletMaxWeight: '-5' }, 'cm').weight).toBe('Phải lớn hơn 0');
    expect(validatePalletForm({ ...valid, palletMaxTiers: '0' }, 'cm').tiers).toBeDefined();
    expect(validatePalletForm({ ...valid, palletMaxTiers: '1.5' }, 'cm').tiers).toBeDefined();
    expect(validatePalletForm({ ...valid, palletMaxTiers: '3' }, 'cm').tiers).toBeUndefined();
  });
});
