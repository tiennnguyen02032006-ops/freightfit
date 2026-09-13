import { DoubleSide } from 'three';

interface SnapFaceHighlightProps {
  position: [number, number, number];
  // Góc xoay [x,y,z] (three.js) để mặt phẳng (mặc định nằm trong mặt XY, pháp tuyến +Z) hướng
  // đúng pháp tuyến — xem DraggablePlacement.tsx:
  //   [0, 0, 0]        pháp tuyến theo Z (khớp trục rộng)
  //   [0, π/2, 0]      pháp tuyến theo X (khớp trục dài)
  //   [-π/2, 0, 0]     pháp tuyến theo Y (khớp trục cao — sàn/nóc kiện dưới/trần)
  rotation: [number, number, number];
  width: number;
  height: number;
}

/**
 * Mặt phẳng bán trong suốt, phát sáng, đánh dấu MẶT sắp được "hút khớp" (snap) vào khi đang kéo
 * kiện hàng — xem DraggablePlacement.tsx. Chỉ hiển thị trong lúc kéo VÀ đang trong ngưỡng snap
 * (điều kiện render nằm ở component cha).
 */
export function SnapFaceHighlight({ position, rotation, width, height }: SnapFaceHighlightProps) {
  return (
    <mesh position={position} rotation={rotation} renderOrder={20}>
      <planeGeometry args={[width, height]} />
      {/*
        depthTest=false: mặt highlight PHẢI luôn hiện rõ dù đứng sau vách container hay kiện khác
        về mặt độ sâu (nó vốn nằm SÁT vào bề mặt đang nhắm khớp, dễ bị z-fighting/che khuất bởi
        chính bề mặt đó nếu vẫn so độ sâu bình thường) — tự kiểm chứng qua ảnh chụp: không bật cờ
        này, mặt highlight không hiện rõ trên vách container dù logic snap đã chạy đúng.
      */}
      <meshBasicMaterial
        color="#22e6c8"
        transparent
        opacity={0.5}
        side={DoubleSide}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  );
}
