import { containerWallThickness, wheelRadiusFor } from './containerGeometry';

interface TruckDecorationProps {
  length: number;
  width: number;
  height: number;
}

/**
 * Dựng lại HOÀN TOÀN theo đúng 8 khối hình được yêu cầu — KHÔNG thêm bất kỳ khối/chi tiết nào
 * khác ngoài danh sách này (không rim bánh xe, không khung gầm, không cửa/tay nắm/cửa sổ hông,
 * không ống xả, không thanh lưới tản nhiệt rời, không viền kính, không ốp chân cabin...). Mọi
 * kích thước là SỐ MM TUYỆT ĐỐI (không còn tính theo tỷ lệ container) vì đầu kéo là 1 phương
 * tiện có kích thước thật cố định, không phóng to/thu nhỏ theo container gắn kèm.
 */
const CABIN_WIDTH_MM = 2200;
const CABIN_DEPTH_MM = 1800;
const CABIN_HEIGHT_MM = 2400;

const GRILLE_HEIGHT_MM = 300;
const GRILLE_THICKNESS_MM = 150;
const BUMPER_HEIGHT_MM = 250;
const BUMPER_THICKNESS_MM = 200;

const FAIRING_LENGTH_MM = 1000; // dài theo phương nghiêng, chưa chiếu lên trục ngang
const FAIRING_THICKNESS_MM = 120;
const FAIRING_RISE_MM = 500; // nhô cao thêm so với nóc cabin
const FAIRING_TILT_RAD = Math.PI / 6; // 30 độ

const WHEEL_THICKNESS_MM = 280;

const CABIN_COLOR = '#1a3a6e';
const GLASS_COLOR = '#0d1b2a';
const GRILLE_COLOR = '#9fa6ad';
const BUMPER_COLOR = '#141414';
const HEADLIGHT_COLOR = '#fff2b0';
const WHEEL_COLOR = '#161616';
const MIRROR_COLOR = '#141414';

const disableRaycast = () => null;

/**
 * Đầu kéo trang trí thuần túy: không đọc/ghi store, không gọi hàm trong engine/, mọi mesh dùng
 * raycast={disableRaycast} nên không thể click chọn được (đúng quy tắc đã chốt: đầu xe chỉ để
 * trang trí, không tính vào thống kê).
 *
 * Quy ước trục: threeX <- engine x (chiều dài), threeY <- engine z (chiều cao, hướng lên),
 * threeZ <- engine y (chiều rộng) — khớp với ContainerShell/CargoBox3D. Lưng cabin (x nhỏ nhất
 * của đầu xe) áp sát mặt ngoài vách hậu container, mũi xe hướng ra xa container (x tăng dần).
 */
export function TruckDecoration({ length, width, height }: TruckDecorationProps) {
  const thickness = containerWallThickness(Math.max(length, width, height));
  const groundY = -thickness; // mốc sàn cố định, dùng chung với ContainerShell/CargoBox3D

  // Rộng cabin lấy đúng 2,2m theo yêu cầu, chỉ thu nhỏ lại (Math.min) khi container hẹp hơn mức
  // đó để cabin không bao giờ tràn ra ngoài bề rộng container.
  const cabinWidth = Math.min(CABIN_WIDTH_MM, width * 0.96);
  const centerZ = width / 2;
  const sideZ = cabinWidth / 2;

  const cabBackX = length + thickness; // sát mặt ngoài vách hậu
  const cabFrontX = cabBackX + CABIN_DEPTH_MM;
  const cabinCenterX = cabBackX + CABIN_DEPTH_MM / 2;
  const cabinTopY = groundY + CABIN_HEIGHT_MM;

  // ---- 2. Kính chắn gió: chiếm 70% rộng, nửa trên chiều cao cabin, nghiêng 10 độ ra sau ----
  const windshieldWidth = cabinWidth * 0.7;
  const windshieldBottomY = groundY + CABIN_HEIGHT_MM * 0.5;
  const windshieldHeight = CABIN_HEIGHT_MM * 0.5;
  const windshieldCenterY = windshieldBottomY + windshieldHeight / 2;
  const windshieldTiltRad = Math.PI / 18; // 10 độ

  // ---- 3. Lưới tản nhiệt: 60% rộng cabin, cao 0,3m, ngay dưới kính chắn gió ----
  const grilleWidth = cabinWidth * 0.6;
  const grilleTopY = windshieldBottomY;
  const grilleCenterY = grilleTopY - GRILLE_HEIGHT_MM / 2;
  const grilleFrontX = cabFrontX + GRILLE_THICKNESS_MM / 2;

  // ---- 4. Cản trước: rộng bằng cabin, cao 0,25m, sát đáy mặt trước, dưới lưới tản nhiệt ----
  const bumperCenterY = groundY + BUMPER_HEIGHT_MM / 2;
  const bumperFrontX = cabFrontX + BUMPER_THICKNESS_MM / 2;

  // ---- 6. Tấm chắn gió nóc: 1 khối mỏng, dài bằng bề rộng cabin, nghiêng 30 độ ra sau, nhô cao
  // thêm 0,5m so với nóc cabin. Đặt trên nóc, chính giữa chiều sâu cabin. ----
  const fairingCenterX = cabBackX + CABIN_DEPTH_MM / 2;
  const fairingCenterY = cabinTopY + FAIRING_RISE_MM / 2;

  // ---- 7. Bánh xe: ĐÚNG 6 bánh tổng cộng theo yêu cầu mới nhất:
  // - Đầu xe (cabin): 2 bánh (1 trục), trái + phải, dưới chính giữa chiều sâu cabin.
  // - Thùng xe/rơ-moóc: 4 bánh (2 trục), mỗi trục trái + phải, đặt gần ĐUÔI rơ-moóc (x nhỏ, phía
  //   xa cabin nhất — KHÔNG trải dài hết chiều dài container), 2 trục cách nhau 1,1m (trong
  //   khoảng 1-1,2m yêu cầu), không chồng lấn (1,1m > đường kính bánh 0,9m).
  // Tất cả bánh dùng chung wheelRadius/wheelCenterY -> luôn cùng kích thước, cùng chạm đất trên
  // một đường thẳng. Lấy bán kính qua wheelRadiusFor (dùng chung với ContainerScene.tsx tính
  // khoảng hở mặt đất) để không bao giờ lệch giá trị. ----
  const wheelRadius = wheelRadiusFor(height);
  const wheelCenterY = groundY - wheelRadius; // nóc bánh chạm đúng đáy sàn/cabin
  const wheelInset = 150; // lùi vào trong so với mép cabin/container

  // Trục bánh đầu xe: 1 trục, chính giữa chiều sâu cabin, trái + phải.
  const frontAxleX = cabinCenterX;
  const frontHalfTrack = sideZ - wheelInset;

  // 2 trục bánh rơ-moóc: gom cụm gần ĐUÔI container (x nhỏ, xa cabin nhất), cách nhau 1,1m —
  // clamp theo chiều dài container để không vượt ra ngoài với container ngắn.
  const trailerAxleSpacing = 1100;
  const trailerAxleCenterX = Math.max(trailerAxleSpacing / 2 + 200, Math.min(1000, length * 0.25));
  const trailerAxleXs = [trailerAxleCenterX - trailerAxleSpacing / 2, trailerAxleCenterX + trailerAxleSpacing / 2];
  const trailerHalfTrack = width / 2 - wheelInset;

  // ---- 8. Gương chiếu hậu: 2 khối mỏng nhỏ, gắn 2 bên cabin gần kính chắn gió ----
  const mirrorX = cabFrontX - 150;
  const mirrorY = windshieldCenterY + windshieldHeight * 0.25;

  return (
    <group>
      {/* ---- 1. Thân cabin ---- */}
      <mesh position={[cabinCenterX, groundY + CABIN_HEIGHT_MM / 2, centerZ]} castShadow raycast={disableRaycast}>
        <boxGeometry args={[CABIN_DEPTH_MM, CABIN_HEIGHT_MM, cabinWidth]} />
        <meshStandardMaterial color={CABIN_COLOR} roughness={0.45} metalness={0.25} />
      </mesh>

      {/* ---- 2. Kính chắn gió ---- */}
      <mesh position={[cabFrontX, windshieldCenterY, centerZ]} rotation={[0, 0, windshieldTiltRad]} raycast={disableRaycast}>
        <boxGeometry args={[20, windshieldHeight, windshieldWidth]} />
        <meshStandardMaterial color={GLASS_COLOR} transparent opacity={0.6} roughness={0.1} metalness={0.5} />
      </mesh>

      {/* ---- 3. Lưới tản nhiệt ---- */}
      <mesh position={[grilleFrontX, grilleCenterY, centerZ]} raycast={disableRaycast}>
        <boxGeometry args={[GRILLE_THICKNESS_MM, GRILLE_HEIGHT_MM, grilleWidth]} />
        <meshStandardMaterial color={GRILLE_COLOR} roughness={0.35} metalness={0.75} />
      </mesh>

      {/* ---- 4. Cản trước ---- */}
      <mesh position={[bumperFrontX, bumperCenterY, centerZ]} castShadow raycast={disableRaycast}>
        <boxGeometry args={[BUMPER_THICKNESS_MM, BUMPER_HEIGHT_MM, cabinWidth]} />
        <meshStandardMaterial color={BUMPER_COLOR} roughness={0.55} metalness={0.3} />
      </mesh>

      {/* ---- 5. Đèn pha: 2 khối nhỏ ở 2 góc cản trước ---- */}
      {[centerZ - sideZ + 130, centerZ + sideZ - 130].map((z) => (
        <mesh key={`headlight-${z}`} position={[bumperFrontX, bumperCenterY, z]} raycast={disableRaycast}>
          <boxGeometry args={[60, 140, 180]} />
          <meshStandardMaterial color={HEADLIGHT_COLOR} emissive="#ffe9a0" emissiveIntensity={0.5} roughness={0.3} />
        </mesh>
      ))}

      {/* ---- 6. Tấm chắn gió nóc ---- */}
      <mesh
        position={[fairingCenterX, fairingCenterY, centerZ]}
        rotation={[0, 0, -FAIRING_TILT_RAD]}
        castShadow
        raycast={disableRaycast}
      >
        <boxGeometry args={[FAIRING_LENGTH_MM, FAIRING_THICKNESS_MM, cabinWidth]} />
        <meshStandardMaterial color={CABIN_COLOR} roughness={0.45} metalness={0.25} />
      </mesh>

      {/* ---- 7. Bánh xe: đúng 6 bánh — 2 ở đầu xe (1 trục) + 4 ở rơ-moóc (2 trục) ---- */}
      {[centerZ - frontHalfTrack, centerZ + frontHalfTrack].map((z) => (
        <mesh
          key={`front-wheel-${z}`}
          position={[frontAxleX, wheelCenterY, z]}
          rotation={[Math.PI / 2, 0, 0]}
          castShadow
          raycast={disableRaycast}
        >
          <cylinderGeometry args={[wheelRadius, wheelRadius, WHEEL_THICKNESS_MM, 24]} />
          <meshStandardMaterial color={WHEEL_COLOR} roughness={0.8} metalness={0.1} />
        </mesh>
      ))}
      {trailerAxleXs.map((axleX) =>
        [centerZ - trailerHalfTrack, centerZ + trailerHalfTrack].map((z) => (
          <mesh
            key={`trailer-wheel-${axleX}-${z}`}
            position={[axleX, wheelCenterY, z]}
            rotation={[Math.PI / 2, 0, 0]}
            castShadow
            raycast={disableRaycast}
          >
            <cylinderGeometry args={[wheelRadius, wheelRadius, WHEEL_THICKNESS_MM, 24]} />
            <meshStandardMaterial color={WHEEL_COLOR} roughness={0.8} metalness={0.1} />
          </mesh>
        )),
      )}

      {/* ---- 8. Gương chiếu hậu: 2 khối mỏng nhỏ ---- */}
      {[-1, 1].map((side) => (
        <mesh
          key={`mirror-${side}`}
          position={[mirrorX, mirrorY, centerZ + side * (sideZ + 60)]}
          raycast={disableRaycast}
        >
          <boxGeometry args={[30, 130, 120]} />
          <meshStandardMaterial color={MIRROR_COLOR} roughness={0.4} metalness={0.5} />
        </mesh>
      ))}
    </group>
  );
}
