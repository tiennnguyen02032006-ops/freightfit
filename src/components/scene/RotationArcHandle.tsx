import { useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { MathUtils, type Group } from 'three';
import type { RotateAxis3D } from '../../store/slices/editSlice';

interface RotationArcHandleProps {
  // Tâm THẬT của kiện hàng (X/Y/Z three.js) — cả 3 mũi tên đều xoay quanh đúng điểm này, giống bố
  // cục gizmo xoay 3 trục quen thuộc (mỗi vòng cung bao quanh tâm khối, không lệch sang 1 bên).
  centerX: number;
  centerY: number;
  centerZ: number;
  length: number;
  width: number;
  height: number;
  // Group bọc <CargoBox3D> mà các mũi tên này điều khiển hiệu ứng xoay "mượt" (xem
  // DraggablePlacement.tsx) — chỉ MUTATE trực tiếp rotation.x/y/z của group này mỗi frame (không
  // qua React state) để không bắt React render lại 60 lần/giây trong lúc xoay.
  spinGroupRef: React.RefObject<Group | null>;
  // Trục nào THẬT SỰ xoay được cho kiện hàng này (xem engine/rotationAvailability.ts) — chỉ hiện
  // mũi tên cho trục còn dùng được, không hiện mũi tên chắc chắn sẽ bị revalidate.ts từ chối.
  axesAvailable: { canRotateX: boolean; canRotateY: boolean; canRotateZ: boolean };
  // Bấm đầu mũi tên của 1 trục -> gọi hàm này với đúng trục đó. Trả về true nếu store CHẤP NHẬN
  // (đã revalidate hợp lệ, xem editSlice.ts rotatePlacement) — chỉ phát hiệu ứng xoay mượt khi
  // được chấp nhận, để không "diễn" hiệu ứng cho 1 thao tác thực ra đã bị từ chối.
  onRotateStep: (axis: RotateAxis3D) => boolean;
}

const SPIN_DURATION_MS = 220;
const ARC_SWEEP = Math.PI * 1.6;
// Đầu mũi tên "nảy to" nhẹ khi hover, mượt qua vài frame thay vì đổi kích thước tức thời — dễ nhìn
// thấy là sắp bấm trúng mà không giật cục.
const HOVER_SCALE = 1.35;
const HOVER_LERP_SPEED = 0.25;

// Mỗi trục 1 màu riêng (thường/đậm khi hover), dễ phân biệt — quy ước màu giống các gizmo xoay 3
// trục quen thuộc (X đỏ/Y xanh dương/Z cam), tránh trùng màu xanh lá (dấu "+" tâm lý tưởng) và
// vàng (quả cầu trọng tâm) đã dùng ở CenterOfGravityMarker.tsx để không gây nhầm lẫn khi cả hai
// cùng hiện.
const AXIS_COLOR: Record<RotateAxis3D, { base: string; hover: string }> = {
  X: { base: '#ff5c5c', hover: '#ffa1a1' },
  Y: { base: '#2f7dff', hover: '#8ab4ff' },
  Z: { base: '#ffb020', hover: '#ffd480' },
};

// Bán kính TƯƠNG ĐỐI của mỗi trục so với 1 bán kính gốc chung — cố ý CHÊNH LỆCH RÕ RỆT (Y nhỏ
// nhất, X trung bình, Z lớn nhất) để 3 vòng cung không chồng lên nhau tại cùng 1 điểm, tránh bấm
// nhầm đầu mũi tên trục này sang trục khác khi nhìn từ góc camera dễ bị chồng hình (vd nhìn thẳng
// từ trên xuống).
const AXIS_RADIUS_SCALE: Record<RotateAxis3D, number> = { Y: 0.8, X: 1, Z: 1.25 };

// Góc xoay [x,y,z] của TOÀN BỘ 1 vòng cung để đưa mặt phẳng "tự nhiên" (mặt XY, trục lỗ Z) của
// TorusGeometry mặc định về đúng mặt phẳng vuông góc với trục xoay tương ứng — suy ra bằng cách
// áp ma trận xoay lên vector trục lỗ (0,0,1):
//   X: rotation quanh Y 90° đưa trục lỗ Z -> X (mặt phẳng vòng cung nằm trong mặt YZ)
//   Y: rotation quanh X 90° đưa trục lỗ Z -> Y (mặt phẳng vòng cung nằm trong mặt XZ, nằm ngang)
//   Z: không cần xoay, trục lỗ đã là Z (mặt phẳng vòng cung nằm trong mặt XY)
const RING_ROTATION: Record<RotateAxis3D, [number, number, number]> = {
  X: [0, Math.PI / 2, 0],
  Y: [Math.PI / 2, 0, 0],
  Z: [0, 0, 0],
};

// Kênh rotation.[x|y|z] trên spinGroupRef mà mỗi trục điều khiển khi phát hiệu ứng xoay mượt.
const SPIN_CHANNEL: Record<RotateAxis3D, 'x' | 'y' | 'z'> = { X: 'x', Y: 'y', Z: 'z' };

interface SingleArcProps {
  axis: RotateAxis3D;
  radius: number;
  tubeRadius: number;
  spinGroupRef: React.RefObject<Group | null>;
  onRotateStep: (axis: RotateAxis3D) => boolean;
}

/** 1 mũi tên cong của đúng 1 trục — xem RotationArcHandle để biết bố cục tổng thể. */
function SingleRotationArc({ axis, radius, tubeRadius, spinGroupRef, onRotateStep }: SingleArcProps) {
  const spinAnimRef = useRef<{ active: boolean; fromRad: number; startedAt: number }>({
    active: false,
    fromRad: 0,
    startedAt: 0,
  });
  const arrowGroupRef = useRef<Group>(null);
  const [hovered, setHovered] = useState(false);
  const { base, hover } = AXIS_COLOR[axis];
  const color = hovered ? hover : base;
  const channel = SPIN_CHANNEL[axis];

  useFrame(() => {
    // Hiệu ứng xoay mượt giữa các nấc 90°.
    const anim = spinAnimRef.current;
    const spinGroup = spinGroupRef.current;
    if (anim.active && spinGroup) {
      const t = MathUtils.clamp((performance.now() - anim.startedAt) / SPIN_DURATION_MS, 0, 1);
      const eased = 1 - (1 - t) ** 3;
      spinGroup.rotation[channel] = MathUtils.lerp(anim.fromRad, 0, eased);
      if (t >= 1) {
        anim.active = false;
        spinGroup.rotation[channel] = 0;
      }
    }

    // Hiệu ứng "nảy to" nhẹ khi rê chuột gần đầu mũi tên — báo trước sắp bấm trúng.
    const arrowGroup = arrowGroupRef.current;
    if (arrowGroup) {
      const targetScale = hovered ? HOVER_SCALE : 1;
      const nextScale = MathUtils.lerp(arrowGroup.scale.x, targetScale, HOVER_LERP_SPEED);
      arrowGroup.scale.setScalar(nextScale);
    }
  });

  const handleClickArrow = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const committed = onRotateStep(axis);
    if (!committed) return;
    const group = spinGroupRef.current;
    if (group) group.rotation[channel] = Math.PI / 2;
    spinAnimRef.current = { active: true, fromRad: Math.PI / 2, startedAt: performance.now() };
  };

  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(true);
  };
  const handlePointerOut = () => setHovered(false);

  // Đầu mút cung tròn (trong hệ tọa độ RIÊNG, chưa xoay theo RING_ROTATION — group cha lo việc đó)
  // và hướng tiếp tuyến tại đó (xem chứng minh trong comment đầu file: xoay hình nón quanh Z một
  // góc đúng bằng ARC_SWEEP sẽ tự trỏ đúng chiều tiếp tuyến).
  const arrowX = radius * Math.cos(ARC_SWEEP);
  const arrowY = radius * Math.sin(ARC_SWEEP);

  return (
    <group rotation={RING_ROTATION[axis]}>
      {/* Thân mũi tên cong — THUẦN HIỂN THỊ, không gắn handler nào (xem lý do ở vùng bấm bên dưới). */}
      <mesh renderOrder={30}>
        <torusGeometry args={[radius, tubeRadius, 10, 48, ARC_SWEEP]} />
        <meshBasicMaterial color={base} depthTest={false} />
      </mesh>

      {/* Đầu mũi tên: hình nón nhỏ, THUẦN HIỂN THỊ (không gắn onClick/hover trực tiếp lên nó) — bọc
          trong 1 group riêng để có thể "nảy to" (scale) toàn bộ đầu mũi tên khi hover mà không ảnh
          hưởng thân cung tròn. */}
      <group ref={arrowGroupRef} position={[arrowX, arrowY, 0]} rotation={[0, 0, ARC_SWEEP]}>
        <mesh renderOrder={30}>
          <coneGeometry args={[tubeRadius * 2.6, tubeRadius * 6.5, 12]} />
          <meshBasicMaterial color={color} depthTest={false} />
        </mesh>
        {/* Vùng bấm/hover DUY NHẤT — lớn hơn hẳn hình nón thật để dễ trúng từ mọi góc camera. Cố
            tình KHÔNG gắn thêm handler lên cả hình nón lẫn quả cầu này cùng lúc (bài học rút ra khi
            tự kiểm chứng: gắn onClick lên CẢ HAI khiến 1 cú bấm duy nhất có lúc bắn onClick 2 LẦN
            — do raycaster của react-three-fiber vẫn có thể phát sự kiện tới nhiều mesh chồng nhau
            tại cùng 1 điểm dù đã gọi stopPropagation ở mesh đầu tiên — với trục Z (phép xoay tự
            nghịch đảo, xoay 2 lần liên tiếp = quay lại y hệt ban đầu) lỗi này khiến kiện hàng "xoay
            xong lại tự xoay ngược trở lại", nhìn như bấm không có tác dụng gì). Chỉ 1 mesh duy nhất
            nhận sự kiện loại bỏ hẳn khả năng này.

            LƯU Ý QUAN TRỌNG THỨ 2 (xem CargoBox3D.tsx `disableSelect`): quả cầu vô hình này nằm
            RẤT GẦN/CHỒNG vào khối kiện hàng trong không gian 3D thật (dù luôn được vẽ đè lên trên
            nhờ depthTest=false ở mọi mesh trong file này) — nếu mesh THÂN kiện hàng vẫn còn gắn
            onClick, raycaster có thể xác định thân kiện GẦN CAMERA HƠN quả cầu này tại đúng điểm
            bấm và gọi stopPropagation() TRƯỚC KHI tia chạm tới quả cầu, khiến bấm mũi tên im lặng
            không có tác dụng (dù mũi tên vẫn nhận hover bình thường vì hover không gọi
            stopPropagation trên thân kiện — thân kiện không có handler hover nào). Bắt buộc
            DraggablePlacement.tsx/ContainerScene.tsx phải truyền `disableSelect` (= rotateModeActive)
            xuống MỌI CargoBox3D khi đang ở chế độ xoay để tháo hẳn onClick khỏi thân kiện, không chỉ
            bỏ qua bên trong handler. */}
        <mesh onClick={handleClickArrow} onPointerOver={handlePointerOver} onPointerOut={handlePointerOut}>
          <sphereGeometry args={[tubeRadius * 9, 10, 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} depthTest={false} />
        </mesh>
      </group>
    </group>
  );
}

/**
 * "Chế độ xoay" cho kiện hàng đang chọn: 3 mũi tên cong (mỗi trục 1 màu), bao quanh tâm kiện hàng
 * như 1 gizmo xoay 3 trục quen thuộc — bấm vào đầu mũi tên là xoay đúng 90° theo trục đó (không
 * cần kéo). Chỉ hiện khi ContainerScene/DraggablePlacement đang bật `ui.rotateModeActive` cho đúng
 * kiện đang chọn — chế độ mặc định (di chuyển) KHÔNG hiện bất kỳ mũi tên nào.
 *
 * BÁN KÍNH KHÁC NHAU THEO TRỤC (`AXIS_RADIUS_SCALE`): 3 vòng cung đồng tâm nếu cùng bán kính sẽ
 * chồng khít lên nhau ở nhiều góc nhìn (đặc biệt nhìn thẳng theo 1 trục bất kỳ), khiến đầu mũi tên
 * của 2-3 trục nằm sát/trùng nhau trên màn hình, rất dễ bấm nhầm trục. Giãn rõ bán kính theo từng
 * trục giải quyết việc này mà không cần đổi bố cục tổng thể (vẫn đồng tâm, vẫn 1 kiểu gizmo quen
 * thuộc).
 *
 * HIỆU ỨNG HOVER (`hovered` state trong SingleRotationArc): rê chuột gần đầu mũi tên (trúng vùng
 * bấm vô hình, RỘNG HƠN hẳn hình nón thật để dễ trúng từ mọi góc camera) sẽ phóng to nhẹ + sáng
 * màu đầu mũi tên đó (lerp mượt qua useFrame, không đổi tức thời) — báo trước cho người dùng biết
 * sắp bấm trúng, trước khi thực sự bấm.
 *
 * HIỆU ỨNG XOAY MƯỢT: vì editSlice.ts chỉ đổi tức thời kích thước bao quanh (không có khái niệm
 * góc xoay liên tục ở tầng dữ liệu), hiệu ứng chỉ là NHÌN: ngay sau khi 1 nấc được CHẤP NHẬN, đặt
 * kênh rotation tương ứng (x/y/z) của `spinGroupRef` bật lên 90° rồi dùng `useFrame` cho nó
 * "xoay êm" (ease-out) VỀ LẠI 0 trong SPIN_DURATION_MS.
 *
 * KHÔNG cần tắt OrbitControls: bấm đầu mũi tên chỉ là 1 CÚ CLICK đơn (dùng thẳng `onClick` của
 * react-three-fiber, giống hệt cơ chế chọn kiện hàng ở CargoBox3D), không có giai đoạn kéo-giữ nào
 * có thể xung đột với việc xoay camera.
 */
export function RotationArcHandle({
  centerX,
  centerY,
  centerZ,
  length,
  width,
  height,
  spinGroupRef,
  axesAvailable,
  onRotateStep,
}: RotationArcHandleProps) {
  // Thu nhỏ còn ~65% so với mức trước đây (yêu cầu: còn khoảng 60-70%) để bớt choán không gian
  // quanh kiện hàng — sau đó mỗi trục còn nhân thêm hệ số riêng (AXIS_RADIUS_SCALE) để tạo chênh
  // lệch bán kính rõ rệt giữa 3 trục.
  const baseRadius = MathUtils.clamp(Math.max(length, width, height) * 0.65, 120, 700) * 0.65;

  const radiusFor = (axis: RotateAxis3D) => baseRadius * AXIS_RADIUS_SCALE[axis];
  const tubeRadiusFor = (radius: number) => Math.max(4, radius * 0.045);

  return (
    <group position={[centerX, centerY, centerZ]}>
      {axesAvailable.canRotateX && (
        <SingleRotationArc
          axis="X"
          radius={radiusFor('X')}
          tubeRadius={tubeRadiusFor(radiusFor('X'))}
          spinGroupRef={spinGroupRef}
          onRotateStep={onRotateStep}
        />
      )}
      {axesAvailable.canRotateY && (
        <SingleRotationArc
          axis="Y"
          radius={radiusFor('Y')}
          tubeRadius={tubeRadiusFor(radiusFor('Y'))}
          spinGroupRef={spinGroupRef}
          onRotateStep={onRotateStep}
        />
      )}
      {axesAvailable.canRotateZ && (
        <SingleRotationArc
          axis="Z"
          radius={radiusFor('Z')}
          tubeRadius={tubeRadiusFor(radiusFor('Z'))}
          spinGroupRef={spinGroupRef}
          onRotateStep={onRotateStep}
        />
      )}
    </group>
  );
}
