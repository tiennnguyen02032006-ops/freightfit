/**
 * Định dạng số kiểu vi-VN (dấu . ngăn nghìn) dùng chung cho các hiển thị trong app (SceneStatsBar,
 * ContainerPicker, CargoDetailPopup, AddCargoPanel...) — tách riêng để không lặp lại giữa các file.
 */
export function formatNumber(value: number, maxDecimals = 2): string {
  return Number(value.toFixed(maxDecimals)).toLocaleString('vi-VN', { maximumFractionDigits: maxDecimals });
}

/**
 * Toàn hệ thống lưu kích thước bằng mm (xem CLAUDE.md / domain/types.ts), nhưng hiển thị cho
 * người dùng thống nhất bằng cm (khớp với đơn vị cố định của form nhập hàng thủ công) — quy đổi
 * chỉ ở lớp hiển thị này, không đụng vào dữ liệu lưu trữ.
 */
export function formatMmAsCm(mm: number, decimals = 1): string {
  return formatNumber(mm / 10, decimals);
}
