/**
 * Độ dày vách/sàn container dùng chung giữa ContainerShell (vẽ vách) và ContainerScene
 * (đặt ContactShadows dưới đáy sàn) — tách riêng file này (không phải component) để
 * không vi phạm quy tắc Fast Refresh của react-refresh/only-export-components.
 */
export function containerWallThickness(maxDim: number): number {
  return Math.max(20, maxDim * 0.006);
}

/**
 * Tổng chiều dài đầu kéo trang trí (mm), tính từ lưng cabin tới mũi cản trước — dùng chung
 * giữa TruckDecoration (vẽ xe) và ContainerScene (tính khoảng cách camera/vùng đổ bóng để
 * luôn thấy trọn cả xe). Đầu kéo dựng lại theo kích thước THẬT cố định (không còn tỷ lệ theo
 * container): cabin sâu 1800mm + lưới tản nhiệt dày 150mm + cản trước dày 200mm = 2150mm.
 * PHẢI khớp đúng tổng 3 hằng số depth trong TruckDecoration.tsx, nếu đổi kích thước ở đó phải
 * cập nhật lại số này theo.
 */
export const TRUCK_LENGTH_MM = 2150;

/**
 * Bán kính bánh xe = 450mm CỐ ĐỊNH (không còn phụ thuộc chiều cao container) — theo yêu cầu
 * "bán kính 0,45m, không lớn hơn". Giữ nguyên tham số containerHeight (không dùng tới) để không
 * phải sửa lại các nơi đang gọi hàm này (ContainerScene.tsx dùng để tính khoảng hở mặt đất).
 */
export function wheelRadiusFor(_containerHeight: number): number {
  return 450;
}

/**
 * Khoảng hở thẳng đứng giữa đáy sàn container/cabin (y = -thickness, mốc cố định dùng cho
 * ContainerShell/CargoBox3D — KHÔNG được đổi để tránh lệch tọa độ hàng hóa) và MẶT ĐẤT THẬT bên
 * dưới bánh xe = đúng bằng ĐƯỜNG KÍNH bánh xe (nóc bánh chạm thẳng vào đáy sàn/khung gầm, không
 * chừa thêm khoảng trống nào khác) — dùng chung giữa TruckDecoration (đặt bánh/khung ở đây) và
 * ContainerScene (hạ mặt đất/ContactShadows xuống đúng bằng khoảng này, và cộng thêm vào chiều
 * cao cảnh để camera luôn thấy trọn cả bánh xe, không bị cắt hình).
 */
export function vehicleGroundClearance(containerHeight: number): number {
  return wheelRadiusFor(containerHeight) * 2;
}
