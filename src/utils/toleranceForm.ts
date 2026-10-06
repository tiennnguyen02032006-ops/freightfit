// Đọc ô nhập của cấu hình dung sai (đơn vị cm trên giao diện, lưu mm trong store) — hàm thuần để hiện lỗi ngay dưới ô.

export type ToleranceParse = { ok: true; mm: number } | { ok: false; error: string };

/** Giá trị cm trong ô nhập -> mm (làm tròn 1 mm). Trống/không phải số/âm là lỗi. */
export function parseToleranceCm(text: string): ToleranceParse {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return { ok: false, error: 'Nhập một số (0 = không dung sai)' };
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return { ok: false, error: 'Không phải số hợp lệ' };
  if (value < 0) return { ok: false, error: 'Không được nhỏ hơn 0' };
  return { ok: true, mm: Math.round(value * 10) };
}

export function mmToCmText(mm: number): string {
  return String(Math.round(mm) / 10);
}
