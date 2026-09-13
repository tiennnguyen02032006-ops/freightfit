import { useRef, useState } from 'react';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { Plane, Raycaster, Vector2, Vector3, type Group } from 'three';
import type { CargoTemplate, ContainerTemplate, Placement } from '../../domain/types';
import { getAvailableRotationAxes } from '../../engine/rotationAvailability';
import { snapCandidatePosition, snapVerticalPosition, type SnapBox3D } from '../../engine/snapping';
import type { RotateAxis3D } from '../../store/slices/editSlice';
import { CargoBox3D } from './CargoBox3D';
import { RotationArcHandle } from './RotationArcHandle';
import { SnapFaceHighlight } from './SnapFaceHighlight';

interface DraggablePlacementProps {
  placement: Placement;
  template: CargoTemplate | undefined;
  highlighted: boolean;
  onSelect: (placementId: string, shiftKey: boolean) => void;
  // Trả về true nếu store CHẤP NHẬN vị trí mới (đã revalidate hợp lệ), false nếu bị từ chối —
  // xem editSlice.ts movePlacement. DraggablePlacement dùng giá trị này để tự "snap back" về vị
  // trí cũ khi bị từ chối, KHÔNG dựa vào việc React có tự re-render lại prop hay không (store
  // không đổi -> prop không đổi -> group.position (mutate three.js object trực tiếp, không qua
  // React) sẽ KHÔNG tự trở lại nếu không tự tay reset).
  onCommitMove: (target: { x: number; y: number; z: number }) => boolean;
  // Xoay 90° theo 1 trong 3 trục X/Y/Z — dùng cho các mũi tên cong (RotationArcHandle), chỉ hiện
  // khi `rotateModeActive` bật. Cùng cơ chế trả về true/false như onCommitMove (xem editSlice.ts
  // rotatePlacement) để RotationArcHandle biết có nên phát hiệu ứng xoay mượt hay không.
  onRotateAxis: (axis: RotateAxis3D) => boolean;
  // true = đang ở "chế độ xoay" cho kiện hàng này (hiện đủ mũi tên cong X/Y/Z, KHÔNG kéo thân kiện
  // được nữa) — false (mặc định) = "chế độ di chuyển" (kéo thân kiện, KHÔNG hiện mũi tên nào). Bật
  // qua nút "Xoay 3 chiều" ở CameraToolbar, xem ContainerScene.tsx/store/index.ts rotateModeActive.
  rotateModeActive: boolean;
  containerTemplate: ContainerTemplate;
  // Các placement KHÁC trong cùng container (không gồm chính kiện đang kéo) — dùng làm target snap.
  otherPlacements: SnapBox3D[];
}

interface SnapHighlightState {
  position: [number, number, number];
  rotation: [number, number, number];
  width: number;
  height: number;
}

type DragMode = 'floor' | 'height';

interface DragAnchor {
  mode: DragMode;
  // Tọa độ engine (x/y/z) tại thời điểm vừa CHỌN mode này (mỗi lần đổi mode giữa chừng — bấm/nhả
  // Shift trong lúc kéo — phải "chốt" lại đây, không dùng chung mốc từ đầu buổi kéo, để không bị
  // giật hình khi đổi mode).
  anchorEngine: { x: number; y: number; z: number };
  // Điểm giao (world space) giữa tia chuột và mặt phẳng tương ứng, TẠI THỜI ĐIỂM chốt mode ở trên.
  anchorPoint: Vector3;
}

/**
 * Kéo kiện hàng ĐANG CHỌN trực tiếp bằng cách bấm-giữ-kéo vào THÂN kiện (không dùng gizmo mũi
 * tên/vòng cung xoay của TransformControls nữa — đã BỎ HẲN theo yêu cầu, xem lịch sử sửa file
 * này: từng dùng `@react-three/drei` TransformControls cho cả di chuyển lẫn xoay, nay thay bằng
 * raycasting tay để kéo, còn xoay chuyển hẳn sang 3 nút bấm trong CargoDetailPopup.tsx).
 *
 * CÁCH KÉO: bắt `onPointerDown` ngay trên <group> bọc kiện hàng (bong bóng lên từ mesh con qua cơ
 * chế event của react-three-fiber, không cần gắn riêng trên mesh) → tự dựng 1 MẶT PHẲNG ảo và
 * dùng `Raycaster` chiếu từ camera qua vị trí con trỏ để tìm điểm giao — so điểm giao MỚI với điểm
 * giao lúc bắt đầu kéo để ra độ dời, cộng vào tọa độ gốc. Theo dõi `pointermove`/`pointerup` bằng
 * listener gắn thẳng lên `window` (không dùng onPointerMove của r3f) vì con trỏ chắc chắn sẽ di
 * chuyển ra khỏi vùng chiếu của kiện hàng khi kéo đi xa — event trên mesh sẽ ngừng bắn ngay khi
 * tia không còn trúng nó nữa.
 *
 * 2 MẶT PHẲNG chiếu, chọn theo phím Shift (đọc TRỰC TIẾP từ event mỗi lần di chuột — đổi qua lại
 * được NGAY GIỮA LÚC đang kéo, không cần nhả chuột):
 * - "floor" (mặc định, KHÔNG giữ Shift): mặt phẳng NẰM NGANG tại đúng độ cao hiện tại của kiện —
 *   kéo chuột chỉ đổi X/Z (mặt sàn), độ cao giữ nguyên.
 * - "height" (giữ Shift): mặt phẳng ĐỨNG, luôn quay mặt về camera, đi qua vị trí hiện tại của
 *   kiện theo chiều ngang — kéo chuột chỉ lấy phần chiếu theo trục Y (chỉ đổi độ cao).
 * Mỗi lần đổi qua lại giữa 2 mode, "chốt" lại mốc (anchorEngine/anchorPoint) tại đúng vị trí HIỆN
 * TẠI (không phải vị trí lúc bắt đầu buổi kéo) để không bị nhảy/giật khi đổi mode.
 *
 * DISABLE OrbitControls trong lúc kéo: đọc `state.controls` (r3f, do <OrbitControls makeDefault>
 * ở ContainerScene.tsx đăng ký) và tự set `.enabled = false/true` ngay trong
 * onPointerDown/onPointerUp (mutate thẳng, không qua React state) — tương tự bài học rút ra khi
 * còn dùng TransformControls: nếu chỉ tắt qua React state, OrbitControls vẫn kịp bắt
 * pointerdown/xoay camera trước khi React re-render xong.
 *
 * SNAP + REVALIDATE: TÁI SỬ DỤNG NGUYÊN VẸN `snapCandidatePosition`/`snapVerticalPosition`
 * (engine/snapping.ts) mỗi lần con trỏ di chuyển (giống hệt logic từng chạy trong
 * TransformControls' onObjectChange trước đây — không đổi gì ở tầng thuật toán, chỉ đổi CÁCH lấy
 * input vị trí), và `onCommitMove` (revalidate qua editSlice.ts) khi thả chuột — không đổi gì ở
 * 2 tầng đó so với bản gizmo cũ.
 *
 * CargoBox3D bên trong dùng `renderAtOrigin` để không cộng dồn 2 lớp tọa độ (group cha mang vị
 * trí thật tính từ tâm khối, mesh con vẽ tại gốc [0,0,0] cục bộ của group).
 *
 * TÁCH RÕ 2 CHẾ ĐỘ (`rotateModeActive`, bật/tắt bằng nút "Xoay 3 chiều" ở CameraToolbar):
 * - "Di chuyển" (mặc định, rotateModeActive=false): KHÔNG hiện mũi tên/vòng cung nào — chỉ kéo
 *   thân kiện để di chuyển như mô tả ở trên. `handlePointerDown` (kéo-thả) chỉ được gắn ở mode này.
 * - "Xoay" (rotateModeActive=true): kéo thân kiện bị TẮT hẳn (không gắn onPointerDown di chuyển
 *   nữa) — thay vào đó hiện đủ 3 mũi tên cong (X/Y/Z, mỗi trục 1 màu, xem RotationArcHandle.tsx),
 *   bao quanh tâm kiện hàng. Chỉ hiện mũi tên cho trục THẬT SỰ xoay được (tra `allowedOrientations`
 *   qua `getAvailableRotationAxes` — hàng 'NONE' sẽ không hiện mũi tên nào). BẤM (không cần kéo)
 *   vào đầu mũi tên là xoay đúng 90° theo trục đó, có hiệu ứng xoay mượt giữa các nấc.
 */
export function DraggablePlacement({
  placement,
  template,
  highlighted,
  onSelect,
  onCommitMove,
  onRotateAxis,
  rotateModeActive,
  containerTemplate,
  otherPlacements,
}: DraggablePlacementProps) {
  const groupRef = useRef<Group>(null);
  // Group con bọc CargoBox3D — RotationArcHandle chỉ mutate rotation.y của group NÀY (hiệu ứng xoay
  // "mượt", xem RotationArcHandle.tsx), tách riêng khỏi groupRef (mang vị trí thật, do kéo-thả di
  // chuyển điều khiển) để 2 hiệu ứng không giẫm chân nhau.
  const spinGroupRef = useRef<Group>(null);
  const [snapHighlights, setSnapHighlights] = useState<SnapHighlightState[]>([]);

  const camera = useThree((s) => s.camera);
  const glDomElement = useThree((s) => s.gl.domElement);
  const getControlsEnabled = useThree((s) => s.controls) as { enabled?: boolean } | null;

  const raycasterRef = useRef(new Raycaster());
  const currentEngineRef = useRef({ x: placement.x, y: placement.y, z: placement.z });
  const anchorRef = useRef<DragAnchor | null>(null);

  const centerPosition: [number, number, number] = [
    placement.x + placement.length / 2,
    placement.z + placement.height / 2,
    placement.y + placement.width / 2,
  ];

  const ndcFromClient = (clientX: number, clientY: number): Vector2 => {
    const rect = glDomElement.getBoundingClientRect();
    return new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  };

  const raycastPlane = (clientX: number, clientY: number, plane: Plane): Vector3 | null => {
    raycasterRef.current.setFromCamera(ndcFromClient(clientX, clientY), camera);
    const target = new Vector3();
    return raycasterRef.current.ray.intersectPlane(plane, target);
  };

  const planeForMode = (mode: DragMode, engine: { x: number; y: number; z: number }): Plane => {
    if (mode === 'floor') {
      const worldY = engine.z + placement.height / 2;
      return new Plane(new Vector3(0, 1, 0), -worldY);
    }
    const facing = new Vector3();
    camera.getWorldDirection(facing);
    facing.y = 0;
    if (facing.lengthSq() < 1e-6) facing.set(0, 0, 1);
    facing.normalize();
    const point = new Vector3(engine.x + placement.length / 2, 0, engine.y + placement.width / 2);
    return new Plane(facing, -facing.dot(point));
  };

  const applySnapAndUpdate = (engine: { x: number; y: number; z: number }) => {
    const group = groupRef.current;
    if (!group) return;

    const horizontal = snapCandidatePosition({
      candidate: { x: engine.x, y: engine.y, length: placement.length, width: placement.width },
      containerInnerLength: containerTemplate.innerLength,
      containerInnerWidth: containerTemplate.innerWidth,
      otherPlacements,
    });
    const vertical = snapVerticalPosition({
      candidate: {
        x: horizontal.x,
        y: horizontal.y,
        z: engine.z,
        length: placement.length,
        width: placement.width,
        height: placement.height,
      },
      containerInnerHeight: containerTemplate.innerHeight,
      otherPlacements,
    });

    const finalEngine = { x: horizontal.x, y: horizontal.y, z: vertical.z };
    currentEngineRef.current = finalEngine;

    group.position.set(
      finalEngine.x + placement.length / 2,
      finalEngine.z + placement.height / 2,
      finalEngine.y + placement.width / 2,
    );

    const highlights: SnapHighlightState[] = [];
    if (horizontal.snappedX && horizontal.snapXTargetValue !== undefined) {
      highlights.push({
        position: [horizontal.snapXTargetValue, group.position.y, group.position.z],
        rotation: [0, Math.PI / 2, 0],
        width: placement.width,
        height: placement.height,
      });
    }
    if (horizontal.snappedY && horizontal.snapYTargetValue !== undefined) {
      highlights.push({
        position: [group.position.x, group.position.y, horizontal.snapYTargetValue],
        rotation: [0, 0, 0],
        width: placement.length,
        height: placement.height,
      });
    }
    if (vertical.snapped && vertical.snapTargetValue !== undefined) {
      highlights.push({
        position: [group.position.x, vertical.snapTargetValue, group.position.z],
        rotation: [-Math.PI / 2, 0, 0],
        width: placement.length,
        height: placement.width,
      });
    }
    setSnapHighlights(highlights);
  };

  const handleWindowPointerMove = (e: PointerEvent) => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const wantMode: DragMode = e.shiftKey ? 'height' : 'floor';
    if (wantMode !== anchor.mode) {
      // Đổi mode giữa chừng — chốt lại mốc tại vị trí HIỆN TẠI (đã snap từ trước), không dùng vị
      // trí gốc lúc bắt đầu kéo, để không bị nhảy hình khi đổi qua lại.
      const plane = planeForMode(wantMode, currentEngineRef.current);
      const anchorPoint = raycastPlane(e.clientX, e.clientY, plane);
      if (!anchorPoint) return;
      anchorRef.current = { mode: wantMode, anchorEngine: { ...currentEngineRef.current }, anchorPoint };
      return;
    }

    const plane = planeForMode(anchor.mode, anchor.anchorEngine);
    const hit = raycastPlane(e.clientX, e.clientY, plane);
    if (!hit) return;
    const delta = hit.clone().sub(anchor.anchorPoint);

    const nextEngine = { ...currentEngineRef.current };
    if (anchor.mode === 'floor') {
      nextEngine.x = anchor.anchorEngine.x + delta.x;
      nextEngine.y = anchor.anchorEngine.y + delta.z;
    } else {
      nextEngine.z = anchor.anchorEngine.z + delta.y;
    }
    applySnapAndUpdate(nextEngine);
  };

  const handleWindowPointerUp = () => {
    window.removeEventListener('pointermove', handleWindowPointerMove);
    window.removeEventListener('pointerup', handleWindowPointerUp);
    anchorRef.current = null;
    if (getControlsEnabled) getControlsEnabled.enabled = true;

    setSnapHighlights([]);
    const committed = onCommitMove(currentEngineRef.current);
    if (!committed) {
      currentEngineRef.current = { x: placement.x, y: placement.y, z: placement.z };
      const group = groupRef.current;
      if (group) group.position.set(centerPosition[0], centerPosition[1], centerPosition[2]);
    }
  };

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (getControlsEnabled) getControlsEnabled.enabled = false;

    currentEngineRef.current = { x: placement.x, y: placement.y, z: placement.z };
    const mode: DragMode = e.nativeEvent.shiftKey ? 'height' : 'floor';
    const plane = planeForMode(mode, currentEngineRef.current);
    const anchorPoint = raycastPlane(e.nativeEvent.clientX, e.nativeEvent.clientY, plane);
    if (!anchorPoint) return;
    anchorRef.current = { mode, anchorEngine: { ...currentEngineRef.current }, anchorPoint };

    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);
  };

  const rotationAxes = template ? getAvailableRotationAxes(placement, template.allowedOrientations) : undefined;

  return (
    <>
      <group ref={groupRef} position={centerPosition} onPointerDown={rotateModeActive ? undefined : handlePointerDown}>
        <group ref={spinGroupRef}>
          <CargoBox3D
            placement={placement}
            template={template}
            selected
            highlighted={highlighted}
            onSelect={onSelect}
            renderAtOrigin
            disableSelect={rotateModeActive}
          />
        </group>
      </group>
      {rotateModeActive && rotationAxes && (
        <RotationArcHandle
          centerX={centerPosition[0]}
          centerY={centerPosition[1]}
          centerZ={centerPosition[2]}
          length={placement.length}
          width={placement.width}
          height={placement.height}
          spinGroupRef={spinGroupRef}
          axesAvailable={rotationAxes}
          onRotateStep={onRotateAxis}
        />
      )}
      {snapHighlights.map((h, i) => (
        <SnapFaceHighlight key={i} position={h.position} rotation={h.rotation} width={h.width} height={h.height} />
      ))}
    </>
  );
}
