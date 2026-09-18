import { useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { Edges } from '@react-three/drei';
import type { CargoTemplate, Placement } from '../../domain/types';
import { getCargoLabelTexture } from './boxLabelTexture';

interface CargoBox3DProps {
  placement: Placement;
  template: CargoTemplate | undefined;
  selected: boolean;
  // shiftKey: giữ Shift khi bấm = yêu cầu hoán đổi với kiện đang chọn (xem ContainerScene.tsx
  // handleSelectPlacement) — không phải chọn thường.
  onSelect: (placementId: string, shiftKey: boolean) => void;
  // Kiện vừa được "thêm vào" ở bước hiện tại của mô phỏng xếp hàng từng bước (xem
  // StepSimulationControls.tsx/ContainerScene.tsx) — viền + vật liệu phát sáng tạm thời, KHÁC với
  // `selected` (chọn tay để xem chi tiết, không tự tắt).
  highlighted?: boolean;
  // Khi true, mesh được vẽ tại gốc tọa độ cục bộ [0,0,0] thay vì vị trí tuyệt đối tính từ
  // placement.x/y/z — dùng khi ContainerScene bọc kiện ĐANG CHỌN trong 1 <group> riêng do
  // DraggablePlacement điều khiển (kéo-thả), để group cha mang vị trí thật, tránh cộng dồn 2 lớp
  // tọa độ chồng nhau.
  renderAtOrigin?: boolean;
  // true = KHÔNG gắn onClick (chọn/hoán đổi) lên mesh này — dùng khi đang ở "chế độ xoay"
  // (rotateModeActive, xem ContainerScene.tsx/RotationArcHandle.tsx). Bắt buộc phải THÁO HẲN
  // handler (không chỉ bỏ qua bên trong handler) vì lý do rất tinh vi tự kiểm chứng được: mũi tên
  // xoay của kiện đang chọn nằm RẤT GẦN/CHỒNG vào khối kiện hàng trong không gian 3D thật (dù luôn
  // được VẼ đè lên trên nhờ depthTest=false) — nếu mesh thân kiện vẫn còn onClick, raycaster của
  // react-three-fiber có thể xác định thân kiện GẦN CAMERA HƠN mũi tên tại đúng điểm bấm, gọi
  // stopPropagation() trong handleClick TRƯỚC KHI tia chạm tới được mũi tên, khiến việc bấm đầu mũi
  // tên hoàn toàn không có tác dụng (im lặng, không lỗi) dù mũi tên vẫn nhận hover bình thường.
  disableSelect?: boolean;
  // Tô "xem trước" (ghost) trong lúc đang KÉO TAY di chuyển kiện hàng (DraggablePlacement.tsx) —
  // 'valid' (xanh) nếu vị trí hiện tại (chưa thả chuột) hợp lệ theo revalidatePlacement, 'invalid'
  // (đỏ) nếu không, để người dùng biết ngay mà không cần thả ra mới thấy báo lỗi. undefined = màu
  // bình thường theo SKU (không đang kéo, hoặc chưa kịp tính validity ở lần di chuột đầu tiên).
  previewTint?: 'valid' | 'invalid';
  // true = chỉ vẽ KHUNG DÂY (viền), không tô mặt nào — dùng khi người dùng làm mờ 1 LOẠI hàng trong
  // CargoVisibilityPanel để dễ quan sát loại hàng đang quan tâm mà vẫn hình dung được vị trí/số
  // lượng của loại đó. Không dùng opacity/transparent/depthWrite (nhiều lớp mờ cộng dồn thành
  // đậm khi có hàng trăm kiện) nên luôn nhìn xuyên thấu hoàn toàn.
  faded?: boolean;
}

/**
 * Quy ước trục hiển thị: threeX <- engine x (length), threeY <- engine z (height, up),
 * threeZ <- engine y (width/depth) — khớp với ContainerShell.
 *
 * Hình trụ (shapeType === 'CYLINDER'): thuật toán xếp hàng vẫn coi là khối bao quanh
 * length x width x height (length = width = đường kính, xem AddCargoPanel.tsx) — placement ở
 * đây không đổi gì cả. Chỉ lớp hiển thị này vẽ CylinderGeometry (trục cao theo Y, đúng chiều
 * "up" mặc định của CylinderGeometry, không cần xoay) thay vì BoxGeometry, đặt vừa khít trong
 * đúng khối bao quanh đã tính (bán kính = length/2 = width/2, chiều cao = height).
 */
export function CargoBox3D({
  placement,
  template,
  selected,
  onSelect,
  highlighted = false,
  renderAtOrigin = false,
  disableSelect = false,
  previewTint,
  faded = false,
}: CargoBox3DProps) {
  // Màu lấy trực tiếp từ CargoTemplate.color (tự gán khi tạo hoặc người dùng tự chỉnh qua
  // color picker trong AddCargoPanel) — đổi màu ở đó sẽ tự phản ánh lên đây ngay vì cùng đọc
  // từ 1 nguồn state (cargoTemplates trong store).
  const color = template?.color ?? '#999999';
  const sku = template?.sku ?? '?';
  const isCylinder = template?.shapeType === 'CYLINDER';

  const labelTexture = useMemo(() => getCargoLabelTexture(sku, color), [sku, color]);

  const position: [number, number, number] = renderAtOrigin
    ? [0, 0, 0]
    : [
        placement.x + placement.length / 2,
        placement.z + placement.height / 2,
        placement.y + placement.width / 2,
      ];
  // previewTint (đang kéo tay, xem DraggablePlacement.tsx) ƯU TIÊN CAO NHẤT — luôn xảy ra độc lập
  // với highlighted (hiệu ứng step-simulation, không bao giờ trùng thời điểm với kéo tay vì
  // canEdit=false khi đang simulate) nên không cần lo tranh chấp giữa 2 hiệu ứng.
  const previewColor = previewTint === 'valid' ? '#22c55e' : previewTint === 'invalid' ? '#ef4444' : null;
  // faded: khung dây là thứ DUY NHẤT còn hiển thị nên viền rõ hơn; bỏ qua mọi trạng thái khác (selected/highlighted không có ý nghĩa khi
  // đã làm mờ để nhường chỗ quan sát loại khác).
  const edgeColor = faded
    ? '#999999'
    : (previewColor ?? (highlighted ? '#ffe066' : selected ? '#ffffff' : '#1c1c1c'));
  const edgeWidth = faded ? 1 : (previewTint ? 3 : highlighted ? 3.5 : selected ? 2.5 : 1.25);
  // Phát sáng nhẹ (emissive) khi highlighted — chỉ dùng cho hiệu ứng "vừa thêm vào" tạm thời của
  // simulation, tự tắt sau vài giây (xem ContainerScene.tsx), không phải trạng thái `selected`.
  const emissive = previewColor ?? (highlighted ? '#ffe066' : '#000000');
  const emissiveIntensity = previewTint ? 0.5 : highlighted ? 0.6 : 0;

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect(placement.id, event.shiftKey);
  };

  if (isCylinder) {
    // Đường kính lấy từ length (= width, xem AddCargoPanel.tsx) -> bán kính = length/2.
    const radius = placement.length / 2;
    return (
      <mesh position={position} castShadow={!faded} receiveShadow={!faded} onClick={disableSelect ? undefined : handleClick}>
        <cylinderGeometry args={[radius, radius, placement.height, 32]} />
        {/* Vật liệu theo group của CylinderGeometry: 0 = mặt bên, 1 = đáy trên, 2 = đáy dưới. */}
        <meshStandardMaterial
          attach="material-0"
          map={labelTexture}
          roughness={0.85}
          metalness={0}
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
          visible={!faded}
        />
        <meshStandardMaterial
          attach="material-1"
          color={color}
          roughness={0.85}
          metalness={0}
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
          visible={!faded}
        />
        <meshStandardMaterial
          attach="material-2"
          color={color}
          roughness={0.85}
          metalness={0}
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
          visible={!faded}
        />
        <Edges color={edgeColor} linewidth={edgeWidth} />
      </mesh>
    );
  }

  return (
    <mesh position={position} castShadow={!faded} receiveShadow={!faded} onClick={disableSelect ? undefined : handleClick}>
      <boxGeometry args={[placement.length, placement.height, placement.width]} />
      {/*
        Vật liệu luôn ĐẶC (opacity=1, transparent=false): transparent=true từng khiến nhiều box
        xếp cạnh/chồng nhau bị Three.js sort sai thứ tự vẽ, nhìn như "đè xuyên" nhau dù dữ liệu
        không overlap. Khi `faded` chỉ vẽ KHUNG DÂY (<Edges>): vật liệu đặt visible={false} thay vì
        bỏ hẳn (mesh không có vật liệu sẽ bị Three.js tự gán MeshBasicMaterial trắng đặc).
        material.visible=false không vẽ mặt nào nhưng mesh vẫn raycast được nên click chọn kiện
        vẫn hoạt động.
      */}
      <meshStandardMaterial
        map={labelTexture}
        roughness={0.85}
        metalness={0}
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        visible={!faded}
      />
      <Edges color={edgeColor} linewidth={edgeWidth} />
    </mesh>
  );
}
