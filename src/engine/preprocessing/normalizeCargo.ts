import type { CargoTemplate, PalletLoad, ToleranceSettings } from '../../domain/types';
import { expandCargoWithPallets } from '../palletizing/palletBlock';

export interface ExpandedCargoItem {
  cargoInstanceId: string;
  cargoTemplateId: string;
  template: CargoTemplate;
  // Có mặt = mục này là 1 PALLET đã xếp thùng (khối cứng); `template` khi đó là template của cả khối
  // (xem palletizing/palletBlock.ts), còn cargoTemplateId vẫn là SKU thùng gốc.
  palletLoad?: PalletLoad;
  // true = thùng thừa của SKU xếp pallet, xếp rời (xem palletizing/palletBlock.ts).
  palletLeftover?: boolean;
  // Bề rộng PHỤ (mm) cộng vào chỗ pallet chiếm khi xếp để chừa khe giữa hai cột pallet — packContainer trả lại
  // bề rộng thật và dịch pallet cột phải sát vách sau khi xếp (xem palletizing/palletLayout.ts).
  palletSlotPad?: number;
}

/**
 * Expand CargoTemplate theo quantity thành từng instance riêng (cargoInstanceId),
 * chuẩn bị cho packing (mỗi instance được đặt độc lập vào 1 vị trí cụ thể). Template bật "Xếp lên
 * pallet" nở thành từng PALLET (khối cứng) thay vì từng thùng — xem palletizing/palletBlock.ts.
 */
export function expandCargoQuantity(templates: CargoTemplate[], settings?: ToleranceSettings): ExpandedCargoItem[] {
  return expandCargoWithPallets(templates, settings).items;
}
