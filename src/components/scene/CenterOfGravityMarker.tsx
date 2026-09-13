import { Billboard, Line } from '@react-three/drei';
import type { ContainerInstance, ContainerTemplate } from '../../domain/types';

interface CenterOfGravityMarkerProps {
  container: ContainerInstance | undefined;
  containerTemplate: ContainerTemplate;
}

const CG_COLOR = '#f5c518';
const IDEAL_COLOR = '#3fb950';

/**
 * Quy ước trục hiển thị GIỐNG CargoBox3D: threeX <- engine x (chiều dài, gốc ở cửa),
 * threeY <- engine z (chiều cao, gốc ở sàn), threeZ <- engine y (chiều rộng, gốc giữa).
 *
 * Trọng tâm thực tế: quả cầu tại `container.centerOfGravity` (đổi trục như trên) + đường thẳng
 * đứng chiếu xuống sàn (Y=0) cùng X/Z để dễ đọc vị trí ngang. Quả cầu LUÔN giữ 1 màu cố định
 * (vàng) — không đổi màu theo cgWarnings nữa (yêu cầu: cảnh báo lệch trọng tâm chỉ thể hiện qua
 * banner chữ + chỉ số % ở SceneStatsBar, không phải qua màu quả cầu). Cả quả cầu lẫn đường chiếu
 * đều cố ý vẽ NHỎ/MỜ (bán trong suốt) — chỉ để NHẬN BIẾT vị trí, không được che khuất/lấn át hàng
 * hóa hay mũi tên xoay ngang nổi phía trên kiện hàng đang chọn (xem RotationArcHandle.tsx).
 *
 * Tâm lý tưởng: dấu "+" màu xanh tại chính giữa container theo chiều dài/rộng, cao 1/3 chiều cao
 * container — vẽ bằng Billboard (luôn xoay mặt về camera) + 2 đoạn thẳng ngắn vuông góc, đơn giản
 * và rõ hơn so với cố tạo geometry 3D cho 1 ký hiệu vốn chỉ cần đọc được từ mọi góc nhìn.
 *
 * Luôn tự hiển thị khi đã có `container` (đã tạo phương án xếp hàng) — không có nút bật/tắt.
 */
export function CenterOfGravityMarker({ container, containerTemplate }: CenterOfGravityMarkerProps) {
  if (!container || container.totalWeight <= 0) return null;

  const minDim = Math.min(containerTemplate.innerLength, containerTemplate.innerWidth, containerTemplate.innerHeight);
  const sphereRadius = Math.min(200, Math.max(40, minDim * 0.03));
  // Dấu "+" tâm lý tưởng cố ý vẽ MỜ/NHỎ/MẢNH hơn hẳn quả cầu trọng tâm thực tế — nó chỉ là 1 mốc
  // tham chiếu phụ, không được lấn át hàng hóa/container xung quanh: giảm 60% kích thước (còn 40%)
  // so với mức trước đây, nét mảnh hơn (giảm lineWidth) và bán trong suốt (opacity ~0.45). Tính
  // trên `sphereRadius` GỐC (chưa thu nhỏ ở dưới) để không đổi tỉ lệ đã chốt trước đó.
  const crossSize = sphereRadius * 1.4 * 0.4;
  const IDEAL_LINE_WIDTH = 1;
  const IDEAL_OPACITY = 0.45;

  // Quả cầu trọng tâm thực tế + đường chiếu xuống sàn: cũng chỉ mang tính tham chiếu, không được
  // che khuất/lấn át hàng hóa hay mũi tên xoay ngang phía trên kiện — thu nhỏ còn 50%, bán trong
  // suốt (opacity ~0.55), đường chiếu mảnh và mờ đi tương ứng.
  const actualSphereRadius = sphereRadius * 0.5;
  const ACTUAL_SPHERE_OPACITY = 0.55;
  const ACTUAL_LINE_WIDTH = 1;
  const ACTUAL_LINE_OPACITY = 0.55;

  const actualPos: [number, number, number] = [
    container.centerOfGravity.x,
    container.centerOfGravity.z,
    container.centerOfGravity.y,
  ];
  const idealPos: [number, number, number] = [
    containerTemplate.innerLength / 2,
    containerTemplate.innerHeight / 3,
    containerTemplate.innerWidth / 2,
  ];

  return (
    <group>
      {/* Trọng tâm thực tế */}
      <mesh position={actualPos}>
        <sphereGeometry args={[actualSphereRadius, 20, 16]} />
        <meshStandardMaterial
          color={CG_COLOR}
          roughness={0.4}
          metalness={0.1}
          transparent
          opacity={ACTUAL_SPHERE_OPACITY}
        />
      </mesh>

      {/* Đường chiếu thẳng xuống sàn để đọc vị trí ngang/dọc */}
      <Line
        points={[actualPos, [actualPos[0], 0, actualPos[2]]]}
        color={CG_COLOR}
        lineWidth={ACTUAL_LINE_WIDTH}
        dashed
        dashSize={30}
        gapSize={20}
        transparent
        opacity={ACTUAL_LINE_OPACITY}
      />

      {/* Tâm lý tưởng: dấu "+" xanh mờ/nhỏ/mảnh, luôn xoay mặt về camera — chỉ mang tính tham
          chiếu phụ, không nổi bật hơn quả cầu trọng tâm thực tế hay hàng hóa xung quanh. */}
      <Billboard position={idealPos}>
        <Line
          points={[
            [-crossSize, 0, 0],
            [crossSize, 0, 0],
          ]}
          color={IDEAL_COLOR}
          lineWidth={IDEAL_LINE_WIDTH}
          transparent
          opacity={IDEAL_OPACITY}
        />
        <Line
          points={[
            [0, -crossSize, 0],
            [0, crossSize, 0],
          ]}
          color={IDEAL_COLOR}
          lineWidth={IDEAL_LINE_WIDTH}
          transparent
          opacity={IDEAL_OPACITY}
        />
      </Billboard>
    </group>
  );
}
