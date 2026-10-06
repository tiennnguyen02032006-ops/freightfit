import type { CargoTemplate } from '../domain/types';
import { hslToHex } from './colorBySku';

/** Cách tô màu hàng trong khung 3D và chú giải: theo khách hàng (mặc định) hoặc theo SKU (màu của từng loại hàng). */
export type ColorMode = 'customer' | 'sku';

/** Màu cho hàng chưa ghi khách hàng (chế độ theo khách hàng). */
export const NO_CUSTOMER_COLOR = '#9aa0a6';
export const NO_CUSTOMER_LABEL = 'Chưa có khách hàng';

/** Tên khách hàng đã chuẩn hóa ("Công ty A " và "công ty a" là cùng 1 khách); rỗng/không có -> undefined. */
export function normalizeCustomer(customer: string | undefined): string | undefined {
  const key = (customer ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  return key === '' ? undefined : key;
}

/**
 * Màu cố định của 1 khách hàng: suy ra thuần từ tên (hash FNV-1a -> hue) nên cùng 1 khách luôn cùng màu ở mọi lần chạy
 * và mọi phương án, không phụ thuộc thứ tự nhập hay các khách khác, không cần lưu trữ.
 */
export function customerColor(customer: string | undefined): string {
  const key = normalizeCustomer(customer);
  if (!key) return NO_CUSTOMER_COLOR;
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hslToHex(hash % 360, 68, 52);
}

/** Màu dùng để vẽ 1 loại hàng theo chế độ đang chọn. */
export function displayColor(template: Pick<CargoTemplate, 'color' | 'customer'>, mode: ColorMode): string {
  return mode === 'customer' ? customerColor(template.customer) : template.color;
}
