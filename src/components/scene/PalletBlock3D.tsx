import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { Edges, Html } from '@react-three/drei';
import { BufferAttribute, BufferGeometry, Color, InstancedMesh, Object3D } from 'three';
import type { CargoTemplate, Placement } from '../../domain/types';
import { palletBoxPlacements } from '../../engine/palletizing/palletBoxes';
import { PALLET_BASE_HEIGHT_MM } from '../../engine/preprocessing/palletTypes';
import { useAppStore } from '../../store';
import { getCargoLabelTexture } from './boxLabelTexture';
import { boxInstancesRelativeToPallet, buildBoxEdgePositions, palletBaseParts } from './palletGeometry';

interface PalletBlock3DProps {
  placement: Placement;
  template: CargoTemplate | undefined;
  edgeColor: string;
  edgeWidth: number;
  emissive: string;
  emissiveIntensity: number;
  faded: boolean;
  renderAtOrigin: boolean;
  onClick?: (event: ThreeEvent<MouseEvent>) => void;
}

const WOOD = new Color('#b98a52');
const WOOD_DARK = new Color('#8f6a3b');
const WHITE = new Color('#ffffff');
const SELECTED_BOX_TINT = new Color(1.35, 1.25, 0.85);
const noRaycast = () => null;
const PARTIAL_EDGE_COLOR = '#d946ef'; // viền tím cho "Pallet lẻ"
const FRAME_INSET = 4; // mm

function applyMatrices(mesh: InstancedMesh, items: Array<{ position: [number, number, number]; size: [number, number, number] }>) {
  const dummy = new Object3D();
  items.forEach((item, i) => {
    dummy.position.set(...item.position);
    dummy.scale.set(...item.size);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
}

/**
 * Vẽ 1 pallet (khối cứng) trong container: đế gỗ + TỪNG thùng đúng vị trí đã lưu trong
 * placement.palletLoad (xem palletizing/palletBoxes.ts), kèm khung viền quanh CẢ khối.
 *
 * Hiệu năng (hàng nghìn thùng): mỗi pallet chỉ tốn vài draw call cố định, không phụ thuộc số thùng —
 * toàn bộ thùng là 1 InstancedMesh, 13 bộ phận đế gỗ là 1 InstancedMesh, viền mọi thùng gộp thành 1
 * LineSegments (xem palletGeometry.ts). Dữ liệu chỉ tính lại khi placement đổi (useMemo/useLayoutEffect).
 *
 * Chọn thùng: bấm 1 thùng -> chọn pallet chứa nó (kéo/xoay như 1 kiện) + đánh dấu thùng đó
 * (store.ui.selectedBoxId), CargoDetailPopup hiện thông tin thùng và pallet. Bấm đế pallet -> chỉ
 * chọn pallet. Quy ước trục như CargoBox3D: three (x, y, z) <- engine (x, z, y).
 */
export function PalletBlock3D({
  placement,
  template,
  edgeColor,
  edgeWidth,
  emissive,
  emissiveIntensity,
  faded,
  renderAtOrigin,
  onClick,
}: PalletBlock3DProps) {
  const color = template?.color ?? '#999999';
  const isPartial = placement.palletLoad?.isPartial === true;
  const sku = template?.sku ?? '?';
  const labelTexture = useMemo(() => getCargoLabelTexture(sku, color), [sku, color]);

  const boxes = useMemo(() => palletBoxPlacements(placement), [placement]);
  const boxInstances = useMemo(() => boxInstancesRelativeToPallet(placement, boxes), [placement, boxes]);
  const baseParts = useMemo(
    () => palletBaseParts(placement.length, placement.width, PALLET_BASE_HEIGHT_MM),
    [placement.length, placement.width],
  );
  const edgeGeometry = useMemo(() => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(buildBoxEdgePositions(boxInstances), 3));
    return geometry;
  }, [boxInstances]);
  useEffect(() => () => edgeGeometry.dispose(), [edgeGeometry]);

  // Chỉ pallet CHỨA thùng đang chọn mới re-render khi đổi thùng chọn (selector trả null cho pallet khác).
  const selectedBoxId = useAppStore((s) => (s.ui.selectedBoxId?.startsWith(`${placement.id}__box-`) ? s.ui.selectedBoxId : null));
  const selectPalletBox = useAppStore((s) => s.selectPalletBox);
  const selectedIndex = selectedBoxId ? boxes.findIndex((b) => b.id === selectedBoxId) : -1;

  const boxMesh = useRef<InstancedMesh>(null);
  const baseMesh = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    if (boxMesh.current) applyMatrices(boxMesh.current, boxInstances);
  }, [boxInstances]);

  useLayoutEffect(() => {
    const mesh = boxMesh.current;
    if (!mesh) return;
    boxInstances.forEach((_, i) => mesh.setColorAt(i, i === selectedIndex ? SELECTED_BOX_TINT : WHITE));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [boxInstances, selectedIndex]);

  useLayoutEffect(() => {
    const mesh = baseMesh.current;
    if (!mesh) return;
    applyMatrices(mesh, baseParts);
    baseParts.forEach((part, i) => mesh.setColorAt(i, part.kind === 'block' ? WOOD_DARK : WOOD));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [baseParts]);

  const center: [number, number, number] = renderAtOrigin
    ? [0, 0, 0]
    : [
        placement.x + placement.length / 2,
        placement.z + placement.height / 2,
        placement.y + placement.width / 2,
      ];

  const handleBoxClick = (event: ThreeEvent<MouseEvent>) => {
    if (event.instanceId === undefined) return;
    const box = boxes[event.instanceId];
    onClick?.(event); // chọn/hoán đổi pallet như 1 kiện (xóa thùng chọn cũ)
    if (box) selectPalletBox(box.id);
  };

  const selectedBox = selectedIndex >= 0 ? boxInstances[selectedIndex] : null;

  return (
    <group position={center}>
      {/* Khối bao quanh cả pallet: không vẽ mặt nào, chỉ để vẽ viền. Chỉ nhận click khi `faded` (lúc
          đó thùng/đế không vẽ) — nếu không, mặt khối trùng mặt thùng ngoài cùng sẽ tranh click với thùng. */}
      <mesh onClick={faded ? onClick : undefined} raycast={faded ? undefined : noRaycast}>
        {/* Thụt vào FRAME_INSET mỗi phía để khung của các pallet kề nhau/chồng lên nhau không trùng đúng
            1 nét (tránh nét đôi/nhấp nháy) — mỗi pallet chỉ có đúng 1 khung mảnh bao quanh. */}
        <boxGeometry args={[placement.length - 2 * FRAME_INSET, placement.height - 2 * FRAME_INSET, placement.width - 2 * FRAME_INSET]} />
        <meshBasicMaterial visible={false} />
        <Edges color={isPartial && edgeColor === '#1c1c1c' ? PARTIAL_EDGE_COLOR : edgeColor} linewidth={edgeWidth} />
      </mesh>
      {isPartial && !faded && (
        // Nhãn "Pallet lẻ" kèm số thùng của pallet — chỉ có đúng 1 pallet lẻ mỗi SKU nên chỉ 1 nhãn.
        <Html position={[0, placement.height / 2 + 120, 0]} center style={{ pointerEvents: 'none' }} zIndexRange={[10, 0]}>
          <div className="pallet-partial-tag">Pallet lẻ · {placement.palletLoad?.boxCount ?? 0} thùng</div>
        </Html>
      )}
      {!faded && (
        <>
          {/* Đế gỗ nằm ở ĐÁY khối pallet (palletBaseParts tính quanh tâm của chính đế). */}
          <group position={[0, -placement.height / 2 + PALLET_BASE_HEIGHT_MM / 2, 0]}>
            <instancedMesh
              key={`base-${baseParts.length}`}
              ref={baseMesh}
              args={[undefined, undefined, baseParts.length]}
              castShadow
              receiveShadow
              onClick={onClick}
            >
              <boxGeometry args={[1, 1, 1]} />
              <meshStandardMaterial roughness={0.9} metalness={0} />
            </instancedMesh>
          </group>
          <instancedMesh
            key={`boxes-${boxInstances.length}`}
            ref={boxMesh}
            args={[undefined, undefined, boxInstances.length]}
            castShadow
            receiveShadow
            onClick={onClick ? handleBoxClick : undefined}
          >
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial
              map={labelTexture}
              roughness={0.85}
              metalness={0}
              emissive={emissive}
              emissiveIntensity={emissiveIntensity}
            />
          </instancedMesh>
          <lineSegments geometry={edgeGeometry} raycast={noRaycast}>
            <lineBasicMaterial color="#1c1c1c" />
          </lineSegments>
          {selectedBox && (
            <mesh position={selectedBox.position} scale={selectedBox.size} raycast={noRaycast}>
              <boxGeometry args={[1.02, 1.02, 1.02]} />
              <meshBasicMaterial visible={false} />
              <Edges color="#ffe066" linewidth={3} />
            </mesh>
          )}
        </>
      )}
    </group>
  );
}
