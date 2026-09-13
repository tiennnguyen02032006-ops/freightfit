/**
 * Xác định vòng cung xoay (X/Y/Z) nào THẬT SỰ có tác dụng cho một kiện hàng cụ thể — dùng để ẩn
 * bớt vòng cung trong RotationArcHandle.tsx (không hiện vòng cung chắc chắn sẽ bị revalidate.ts từ
 * chối) và để hiện lý do bị khóa trong CargoDetailPopup.tsx.
 *
 * "Có tác dụng" nghĩa là: xoay 90° quanh trục đó (đổi 2 trong 3 chiều dài/rộng/cao — xem
 * editSlice.ts swapDimsForAxis) tạo ra một tổ hợp kích thước NẰM TRONG `allowedOrientations` của
 * CargoTemplate. Với hàng 'NONE' (chỉ 1 orientation) hoặc 'YAW'/'Giữ đứng' (2 orientation, chỉ
 * khác nhau ở chiều dài/rộng — xem orientation.ts), phép xoay X/Z (đổi cả chiều cao) sẽ KHÔNG bao
 * giờ khớp bất kỳ orientation nào trong danh sách, nên tự động trả về false mà không cần biết
 * trước loại rotation/mustKeepUpright — chỉ cần tra đúng `allowedOrientations` đã tính sẵn.
 */
export function getAvailableRotationAxes(
  placement: { length: number; width: number; height: number },
  allowedOrientations: ReadonlyArray<readonly [number, number, number]>,
): { canRotateX: boolean; canRotateY: boolean; canRotateZ: boolean } {
  const { length, width, height } = placement;
  const has = (l: number, w: number, h: number) =>
    allowedOrientations.some(([al, aw, ah]) => al === l && aw === w && ah === h);

  return {
    canRotateX: has(length, height, width), // xoay quanh trục dài -> đổi rộng<->cao
    canRotateY: has(width, length, height), // xoay quanh trục cao -> đổi dài<->rộng
    canRotateZ: has(height, width, length), // xoay quanh trục rộng -> đổi dài<->cao
  };
}
