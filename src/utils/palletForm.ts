import { convertToMm, type LengthUnit } from '../import/parseExcel';
import { PALLET_BASE_HEIGHT_MM } from '../engine/preprocessing/palletTypes';

// Kiểm tra các ô của khối "Xếp lên pallet" trong form nhập hàng — hàm thuần để hiện lỗi ngay dưới từng ô và để test.

export interface PalletFormValues {
  palletMaxHeight: string; // theo đơn vị đang chọn ở form (cm/inch/feet), đã gồm đế pallet
  palletMaxWeight: string; // kg
  palletMaxTiers: string;  // số tầng pallet tối đa (số nguyên >= 1)
}

export interface PalletFormErrors {
  height?: string;
  weight?: string;
  tiers?: string;
}

/** Gợi ý mờ (placeholder) cho ô chiều cao theo đơn vị đang chọn (~150 cm). */
export const PALLET_HEIGHT_PLACEHOLDER: Record<'cm' | 'in' | 'ft', string> = { cm: '150', in: '59', ft: '4.9' };

export function validatePalletForm(values: PalletFormValues, unit: Extract<LengthUnit, 'cm' | 'in' | 'ft'>): PalletFormErrors {
  const errors: PalletFormErrors = {};

  if (values.palletMaxHeight.trim() === '') {
    errors.height = 'Nhập chiều cao tối đa';
  } else if (!(convertToMm(Number(values.palletMaxHeight), unit) > PALLET_BASE_HEIGHT_MM)) {
    errors.height = `Phải lớn hơn ${PALLET_BASE_HEIGHT_MM / 10} cm (đế pallet)`;
  }

  if (values.palletMaxWeight.trim() === '') {
    errors.weight = 'Nhập khối lượng tối đa';
  } else if (!(Number(values.palletMaxWeight) > 0)) {
    errors.weight = 'Phải lớn hơn 0';
  }

  const tiers = Number(values.palletMaxTiers);
  if (values.palletMaxTiers.trim() === '' || !Number.isInteger(tiers) || tiers < 1) {
    errors.tiers = 'Nhập số nguyên từ 1 trở lên';
  }

  return errors;
}

export function hasPalletFormErrors(errors: PalletFormErrors): boolean {
  return Object.keys(errors).length > 0;
}
