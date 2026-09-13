import type { Clearance } from '../../domain/types';

export interface Dimensions3D {
  length: number;
  width: number;
  height: number;
}

/**
 * Kích thước dùng để check fit/collision = kích thước thật + clearance.
 * Quy ước trục: length (x) <- left/right, width (y) <- front/back, height (z) <- top/bottom.
 * Kích thước thật vẫn được lưu riêng trong Placement để hiển thị đúng.
 */
export function applyClearance(dims: Dimensions3D, clearance: Clearance): Dimensions3D {
  return {
    length: dims.length + clearance.left + clearance.right,
    width: dims.width + clearance.front + clearance.back,
    height: dims.height + clearance.top + clearance.bottom,
  };
}
