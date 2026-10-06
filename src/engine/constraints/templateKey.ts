import type { Placement } from '../../domain/types';

// Template dùng để kiểm tra constraint của kiện BÊN DƯỚI được tra theo "khoá template". Một SKU xếp
// pallet có thể có CẢ pallet (khối cứng, giới hạn theo số tầng pallet) lẫn thùng thừa xếp rời (giới
// hạn theo chính thùng) trong cùng container, nên pallet dùng khoá riêng thay vì cargoTemplateId.
const PALLET_KEY_SUFFIX = '__pallet';

export function palletTemplateKey(cargoTemplateId: string): string {
  return `${cargoTemplateId}${PALLET_KEY_SUFFIX}`;
}

export function templateKeyOf(placement: Pick<Placement, 'cargoTemplateId' | 'palletLoad'>): string {
  return placement.palletLoad ? palletTemplateKey(placement.cargoTemplateId) : placement.cargoTemplateId;
}
