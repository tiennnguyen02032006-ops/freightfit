function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const light = l / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;

  let r: number;
  let g: number;
  let b: number;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Sinh màu hex ổn định từ SKU (hash string) — dùng làm fallback cuối cùng khi không có
 * CargoTemplate.color nào (ví dụ template chưa xác định). Pure function, không phụ thuộc DOM.
 */
export function colorBySku(sku: string): string {
  let hash = 0;
  for (let i = 0; i < sku.length; i++) {
    hash = (hash << 5) - hash + sku.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return hslToHex(hue, 65, 55);
}

/**
 * Sinh màu hex mới, cách các màu đã dùng bằng "golden angle" (~137.5°) để rải hue đều nhau,
 * dùng khi thêm SKU mới cần màu khác các SKU đang có. Không đảm bảo tuyệt đối duy nhất (bước
 * hue liên tục nên gần như không trùng), nhưng đủ tốt vì người dùng có thể tự đổi lại sau.
 */
export function generateDistinctColor(existingColors: string[] = []): string {
  const hue = (existingColors.length * 137.508) % 360;
  return hslToHex(hue, 65, 55);
}

/**
 * Chuẩn hóa 1 giá trị màu thô (ví dụ từ cột "Màu" trong Excel) về đúng dạng "#rrggbb" viết
 * thường. Trả về undefined nếu không phải hex hợp lệ (bỏ qua thay vì lỗi, vì cột màu là tùy chọn).
 */
export function normalizeHexColor(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  return /^#[0-9a-fA-F]{6}$/.test(withHash) ? withHash.toLowerCase() : undefined;
}
