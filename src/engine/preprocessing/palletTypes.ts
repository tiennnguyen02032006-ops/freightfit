import type { PalletTypeId } from '../../domain/types';

// Pallet gỗ chuẩn (kích thước mm). 121.9x101.6 cm = 48"x40" (pallet GMA, phổ biến ở thị trường Mỹ).
export interface PalletType {
  id: PalletTypeId;
  label: string;   // hiển thị trong UI, đơn vị cm
  length: number;  // mm
  width: number;   // mm
  weight: number;  // kg — khối lượng bản thân pallet gỗ (giá trị tham khảo phổ biến)
}

export const PALLET_TYPES: PalletType[] = [
  { id: '120x80', label: '120×80 cm', length: 1200, width: 800, weight: 25 },
  { id: '120x100', label: '120×100 cm', length: 1200, width: 1000, weight: 30 },
  { id: '110x110', label: '110×110 cm', length: 1100, width: 1100, weight: 28 },
  { id: '121.9x101.6', label: '121,9×101,6 cm', length: 1219, width: 1016, weight: 22 },
];

// Chiều cao đế pallet gỗ (mm), dùng chung cho mọi loại — được tính vào chiều cao tối đa của pallet.
export const PALLET_BASE_HEIGHT_MM = 150;

export function getPalletType(id: PalletTypeId): PalletType {
  const found = PALLET_TYPES.find((p) => p.id === id);
  if (!found) throw new Error(`Loại pallet không hợp lệ: ${id}`);
  return found;
}
