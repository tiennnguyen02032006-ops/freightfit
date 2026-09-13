/**
 * Lưu màu tùy chỉnh theo SKU vào localStorage — ngoại lệ persistence được yêu cầu rõ (CLAUDE.md
 * mặc định cấm localStorage, nhưng cho phép khi có yêu cầu cụ thể). Toàn bộ state khác của app
 * vẫn in-memory như cũ; refresh trang chỉ riêng màu theo SKU được nhớ lại, để lần sau thêm/import
 * lại đúng SKU đó thì màu cũ tự động áp dụng lại.
 */
const STORAGE_KEY = 'freightfit:sku-colors';

function readAll(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Bỏ qua nếu trình duyệt chặn localStorage (chế độ ẩn danh, v.v.) — màu vẫn hoạt động
    // bình thường trong phiên hiện tại, chỉ không được nhớ lại sau khi refresh.
  }
}

export function getPersistedSkuColor(sku: string): string | undefined {
  return readAll()[sku];
}

export function setPersistedSkuColor(sku: string, color: string): void {
  const map = readAll();
  map[sku] = color;
  writeAll(map);
}
