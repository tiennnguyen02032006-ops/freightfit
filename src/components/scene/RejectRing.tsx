import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { MathUtils, type MeshBasicMaterial } from 'three';

// Thời lượng hiệu ứng (ms) — DraggablePlacement.tsx dùng ĐÚNG hằng số này cho setTimeout tắt
// `rotateRejectedAt`, để vòng tròn luôn mờ hết (opacity ~0) đúng lúc bị unmount, không bị "cắt
// ngang" giữa chừng animation.
export const REJECT_RING_DURATION_MS = 450;

interface RejectRingProps {
  // Tâm THẬT của kiện hàng (X/Y/Z three.js) — giống hệt tâm dùng cho RotationArcHandle.tsx, để
  // vòng tròn bao đúng quanh kiện hàng bất kể vị trí.
  centerX: number;
  centerY: number;
  centerZ: number;
  length: number;
  width: number;
  height: number;
}

/**
 * Vòng tròn đỏ chớp lên rồi mờ dần quanh kiện hàng — phản hồi hình ảnh khi 1 thao tác xoay bị từ
 * chối (xem DraggablePlacement.tsx `rotateRejectedAt`). Component này chỉ MOUNT trong đúng
 * `REJECT_RING_DURATION_MS`, dùng `key={rejectedAt}` ở nơi gọi để mỗi lần bị từ chối MỚI (kể cả
 * bấm liên tục trước khi hết hiệu ứng cũ) đều buộc React tạo lại 1 instance MỚI — animation opacity
 * tự khởi động lại từ đầu, không cần tự quản lý reset bên trong.
 *
 * Dùng TorusGeometry (như các vòng cung xoay trong RotationArcHandle.tsx) thay vì RingGeometry
 * phẳng — nhìn RÕ là 1 "vòng bao quanh" từ MỌI góc camera (RingGeometry phẳng chỉ hiện rõ khi nhìn
 * gần như thẳng từ trên xuống, còn lại chỉ thấy 1 nét mảnh). Nằm NGANG (giống trục Y của
 * RotationArcHandle — rotation.x = 90°) để bao quanh kiện hàng như 1 "vòng eo" ngang tầm tâm khối.
 *
 * Bán kính = Math.max(length, width, height) NHÂN THÊM hệ số > 1 (thay vì chia đôi) theo đúng yêu
 * cầu tính năng "bán kính lớn hơn 1 chút so với kích thước kiện hàng lớn nhất" — cố ý RỘNG RÃI để
 * chắc chắn bao trọn khối bất kể tỉ lệ dài/rộng/cao, không cần tính đường chéo chính xác.
 *
 * ANIMATE bằng cách MUTATE TRỰC TIẾP `material.opacity` qua ref trong `useFrame` (không qua React
 * state) — cùng kỹ thuật performance.now() + useFrame đã dùng ở RotationArcHandle.tsx
 * (SingleRotationArc) để hiệu ứng mượt, không bắt React re-render mỗi frame.
 */
export function RejectRing({ centerX, centerY, centerZ, length, width, height }: RejectRingProps) {
  // null lúc render đầu (KHÔNG gọi performance.now() ngay trong thân component — impure, vi phạm
  // quy tắc render thuần túy) — chốt mốc thời gian THẬT ở lần useFrame ĐẦU TIÊN thay vào đó (cùng
  // cách RotationArcHandle.tsx chỉ gọi performance.now() bên trong handler/useFrame, không bao
  // giờ trong thân component).
  const startedAtRef = useRef<number | null>(null);
  const materialRef = useRef<MeshBasicMaterial>(null);

  const radius = Math.max(length, width, height) * 0.65;
  const tubeRadius = Math.max(6, radius * 0.035);

  useFrame(() => {
    const material = materialRef.current;
    if (!material) return;
    if (startedAtRef.current === null) startedAtRef.current = performance.now();
    const t = MathUtils.clamp((performance.now() - startedAtRef.current) / REJECT_RING_DURATION_MS, 0, 1);
    // Ease-in: giữ gần như đậm màu (opacity cao) một lúc rồi mới mờ nhanh dần về cuối — đúng cảm
    // giác "chớp lên RỒI mới mờ dần" thay vì mờ đều tuyến tính ngay từ đầu.
    const eased = 1 - t;
    material.opacity = eased * eased;
  });

  return (
    <mesh position={[centerX, centerY, centerZ]} rotation={[Math.PI / 2, 0, 0]} renderOrder={30}>
      <torusGeometry args={[radius, tubeRadius, 10, 48]} />
      <meshBasicMaterial ref={materialRef} color="#ef4444" transparent opacity={1} depthWrite={false} depthTest={false} />
    </mesh>
  );
}
