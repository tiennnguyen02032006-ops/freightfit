import { useEffect, useRef, useState } from 'react';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { Plane, Raycaster, Vector2, Vector3, type Group } from 'three';
import type { CargoTemplate, ContainerTemplate, Placement } from '../../domain/types';
import { getAvailableRotationAxes } from '../../engine/rotationAvailability';
import { revalidatePlacement } from '../../engine/revalidate';
import { computeFloorZ, snapCandidatePosition } from '../../engine/snapping';
import type { RotateAxis3D } from '../../store/slices/editSlice';
import { CargoBox3D } from './CargoBox3D';
import { RejectRing, REJECT_RING_DURATION_MS } from './RejectRing';
import { RotationArcHandle } from './RotationArcHandle';
import { SnapFaceHighlight } from './SnapFaceHighlight';

interface DraggablePlacementProps {
  placement: Placement;
  template: CargoTemplate | undefined;
  highlighted: boolean;
  // Kiện thuộc loại đang bị làm mờ trong CargoVisibilityPanel — chỉ đổi hiển thị (xuyên xuống
  // CargoBox3D), kéo/xoay tay vẫn hoạt động bình thường.
  faded?: boolean;
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
  // Xóa thông báo lỗi (editNotice) còn sót lại từ lần kéo/thả THẤT BẠI trước đó — gọi ngay lúc BẮT
  // ĐẦU 1 lượt kéo mới, để thông báo cũ không còn dính lại trên đầu màn hình gây hiểu lầm là vị trí
  // MỚI đang thử cũng bị lỗi (xem handlePointerDown, yêu cầu tính năng "sửa lỗi preview/commit lệch
  // nhau").
  clearEditNotice: () => void;
  // true = đang ở "chế độ xoay" cho kiện hàng này (hiện đủ mũi tên cong X/Y/Z, KHÔNG kéo thân kiện
  // được nữa) — false (mặc định) = "chế độ di chuyển" (kéo thân kiện, KHÔNG hiện mũi tên nào). Bật
  // qua nút "Xoay 3 chiều" ở CameraToolbar, xem ContainerScene.tsx/store/index.ts rotateModeActive.
  rotateModeActive: boolean;
  containerTemplate: ContainerTemplate;
  // Các placement KHÁC trong cùng container (không gồm chính kiện đang kéo) — dùng làm target snap
  // (snapCandidatePosition/snapVerticalPosition chỉ cần tập con SnapBox3D của Placement) VÀ để
  // revalidate "xem trước" (previewTint) mỗi lần di chuột, xem applySnapAndUpdate.
  otherPlacements: Placement[];
  // Tra CargoTemplate của các kiện KHÁC — cần cho revalidatePlacement (check stacking/load-on-top
  // theo đúng thuộc tính riêng của từng loại hàng, vd fragile) khi tính previewTint.
  templatesById: Map<string, CargoTemplate>;
}

interface SnapHighlightState {
  position: [number, number, number];
  rotation: [number, number, number];
  width: number;
  height: number;
}

interface DragAnchor {
  // Tọa độ ngang (x/y engine) tại thời điểm BẮT ĐẦU kéo.
  anchorEngine: { x: number; y: number };
  // Điểm giao (world space) giữa tia chuột và mặt phẳng ngang, TẠI THỜI ĐIỂM bắt đầu kéo.
  anchorPoint: Vector3;
}

/**
 * Kéo kiện hàng ĐANG CHỌN trực tiếp bằng cách bấm-giữ-kéo vào THÂN kiện (không dùng gizmo mũi
 * tên/vòng cung xoay của TransformControls nữa — đã BỎ HẲN theo yêu cầu, xem lịch sử sửa file
 * này: từng dùng `@react-three/drei` TransformControls cho cả di chuyển lẫn xoay, nay thay bằng
 * raycasting tay để kéo, còn xoay chuyển hẳn sang 3 nút bấm trong CargoDetailPopup.tsx).
 *
 * KIỂU "TRỌNG LỰC" (gravity-drop) — người dùng CHỈ điều khiển 2 TRỤC NGANG (X/Y engine, tức
 * chiều dài/chiều rộng đáy container), KHÔNG còn cách nào để tự kéo trục ĐỨNG (Z, độ cao) nữa
 * (đã bỏ hẳn chế độ giữ Shift để kéo theo chiều cao của bản trước đây). Độ cao LUÔN được tính TỰ
 * ĐỘNG = floorZ (mặt phẳng cao nhất ngay dưới chân đế hiện tại — sàn container nếu không có gì
 * đỡ, hoặc nóc kiện đỡ gần nhất) MỖI KHI vị trí ngang thay đổi, giống như kiện hàng bị "rơi" áp
 * sát xuống ngay lập tức — đối xứng cho cả hạ tầng (kéo ra khỏi vùng đang đỡ -> tự rơi xuống thấp
 * hơn) lẫn lên tầng (kéo vào đúng phía trên 1 kiện khác -> tự áp lên đúng nóc kiện đó).
 *
 * CÁCH KÉO: bắt `onPointerDown` ngay trên <group> bọc kiện hàng (bong bóng lên từ mesh con qua cơ
 * chế event của react-three-fiber, không cần gắn riêng trên mesh) → dựng 1 MẶT PHẲNG NGANG ảo CỐ
 * ĐỊNH tại đúng độ cao kiện hàng lúc BẮT ĐẦU kéo (không đổi trong suốt buổi kéo — không còn khái
 * niệm đổi mặt phẳng theo Shift nữa) → dùng `Raycaster` chiếu từ camera qua vị trí con trỏ để tìm
 * điểm giao trên mặt phẳng đó → so điểm giao MỚI với điểm giao lúc bắt đầu kéo để ra độ dời NGANG
 * (X/Z world, tương ứng x/y engine), cộng vào tọa độ gốc. Theo dõi `pointermove`/`pointerup` bằng
 * listener gắn thẳng lên `window` (không dùng onPointerMove của r3f) vì con trỏ chắc chắn sẽ di
 * chuyển ra khỏi vùng chiếu của kiện hàng khi kéo đi xa — event trên mesh sẽ ngừng bắn ngay khi
 * tia không còn trúng nó nữa.
 *
 * DISABLE OrbitControls trong lúc kéo: đọc `state.controls` (r3f, do <OrbitControls makeDefault>
 * ở ContainerScene.tsx đăng ký) và tự set `.enabled = false/true` ngay trong
 * onPointerDown/onPointerUp (mutate thẳng, không qua React state) — tương tự bài học rút ra khi
 * còn dùng TransformControls: nếu chỉ tắt qua React state, OrbitControls vẫn kịp bắt
 * pointerdown/xoay camera trước khi React re-render xong.
 *
 * TÍNH floorZ: dùng `computeFloorZ` (engine/snapping.ts) — hàm MỚI nhưng TÁI SỬ DỤNG đúng phép
 * kiểm tra "chồng lấn chân đế" (`footprintOverlaps`) vốn đã có sẵn bên trong `snapVerticalPosition`,
 * chỉ khác cách TỔNG HỢP kết quả: trả thẳng "mặt phẳng cao nhất bên dưới chân đế" mà KHÔNG cần
 * phân loại "đỡ dưới"/"chặn trên" theo so sánh TÂM với 1 vị trí Z đang kéo tới (kiểu kéo trọng
 * lực không còn khái niệm "Z hiện tại" để so sánh — Z không do người dùng điều khiển nữa). ĐÃ THỬ
 * cách khác (ép `candidate.z: 0` rồi gọi thẳng `snapVerticalPosition` cũ) nhưng SAI: phép phân
 * loại theo tâm của hàm đó coi 1 kiện đỡ CAO (tâm > candidate.height/2 khi z bị ép về 0) là "chặn
 * trên" thay vì "đỡ dưới", khiến kiện hàng không áp lên được các kiện đỡ cao — vì vậy cần 1 hàm
 * MỚI đúng ngữ nghĩa "trọng lực" (không có khái niệm ceiling) thay vì gọi lại hàm cũ vốn được
 * thiết kế cho model kéo tay tự do theo Z (đã bỏ).
 *
 * PHỐI HỢP SNAP NGANG + DỌC khi HẠ/LÊN 1 mặt đỡ cụ thể: trong `applySnapAndUpdate`,
 * 1. "Dò" `computeFloorZ` bằng vị trí ngang RAW (x/y con trỏ, chưa snap) để biết chân đế hiện tại
 *    đang chồng lấn lên ĐÚNG 1 kiện cụ thể nào (floorZ > 0) hay không.
 * 2. Nếu có — gọi `snapCandidatePosition` CHỈ với `otherPlacements: [floorSupportPlacement]`
 *    (thay vì toàn bộ danh sách) để trục ngang ưu tiên CĂN THEO ĐÚNG kiện đỡ đó, tăng diện tích
 *    tiếp xúc (support ratio) thay vì bị hút nhầm sang 1 mặt tham chiếu không liên quan; nếu
 *    không (đang ở trên sàn trống, không kiện nào đỡ) — snap ngang theo mọi mặt tham chiếu như cũ.
 * 3. Tính lại `computeFloorZ` CUỐI CÙNG (đặt thẳng làm Z) dựa trên vị trí ngang SAU KHI snap ở
 *    bước 2.
 *
 * VALIDATE KHÔNG ĐỔI: revalidate lúc kéo (dragValidity, xem CargoBox3D.tsx previewTint) VÀ lúc
 * thả tay (`onCommitMove` -> movePlacement trong editSlice.ts) vẫn dùng ĐÚNG `revalidatePlacement`
 * như trước — collision/stacking/payload/support ratio/trọng tâm cục bộ đều được kiểm tra đầy đủ
 * khi commit, floorZ tự động chỉ quyết định Z ĐỀ XUẤT trong lúc kéo, không tự nới lỏng constraint
 * nào (vd nếu người dùng cố tình kéo vào 1 vị trí mà support ratio không đủ dù đã áp sát floorZ
 * đúng, commit vẫn bị từ chối như bình thường).
 *
 * BUG ĐÃ SỬA (giữ nguyên) — preview "tô xanh" (mặt phẳng SnapFaceHighlight) lệch với validate thật
 * lúc commit: `snapCandidatePosition`/`snapVerticalPosition` CHỈ xét khoảng cách hình học, không tự
 * kiểm tra support ratio/stacking/payload/CG. SỬA: chỉ hiển thị `SnapFaceHighlight` khi
 * `dragValidity === 'valid'` (đã revalidate qua ĐÚNG CÙNG 1 hàm `revalidatePlacement` dùng khi
 * commit) — không còn 2 nguồn tín hiệu "trông có vẻ đúng" và "thực sự hợp lệ" tách rời nhau.
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
 *
 * PHẢN HỒI KHI XOAY BỊ TỪ CHỐI: trước đây bấm mũi tên xoay mà `onRotateAxis` trả về false (kích
 * thước sau khi xoay vượt container, vi phạm collision/stacking/support/CG...) chỉ có dòng
 * editNotice nhỏ ở đầu màn hình, KHÔNG có phản ứng gì ngay tại kiện hàng. `handleRotateStep` (bọc
 * `onRotateAxis` trước khi truyền cho `RotationArcHandle`) giờ tự set `rotateRejectedAt` (timestamp
 * lúc bị từ chối) trong đúng `REJECT_RING_DURATION_MS` (450ms, xem RejectRing.tsx) rồi tự tắt qua
 * `setTimeout` — trong khoảng đó: (1) `previewTint="invalid"` xuống CargoBox3D (TÁI DÙNG đúng viền
 * đỏ/phát sáng đỏ đã có sẵn cho lúc kéo tay không hợp lệ, không viết thêm màu/hiệu ứng riêng), và
 * (2) hiện thêm `<RejectRing>` — vòng tròn đỏ chớp rồi mờ dần quanh kiện hàng. KHÔNG đổi gì ở
 * `revalidatePlacement`/editSlice.ts — chỉ đọc lại kết quả true/false vốn đã có sẵn.
 */
export function DraggablePlacement({
  placement,
  template,
  highlighted,
  faded = false,
  onSelect,
  onCommitMove,
  onRotateAxis,
  clearEditNotice,
  rotateModeActive,
  containerTemplate,
  otherPlacements,
  templatesById,
}: DraggablePlacementProps) {
  const groupRef = useRef<Group>(null);
  // Group con bọc CargoBox3D — RotationArcHandle chỉ mutate rotation.y của group NÀY (hiệu ứng xoay
  // "mượt", xem RotationArcHandle.tsx), tách riêng khỏi groupRef (mang vị trí thật, do kéo-thả di
  // chuyển điều khiển) để 2 hiệu ứng không giẫm chân nhau.
  const spinGroupRef = useRef<Group>(null);
  const [snapHighlights, setSnapHighlights] = useState<SnapHighlightState[]>([]);
  // Tô "xem trước" xanh/đỏ trong lúc đang kéo (trước khi thả chuột) — null khi không đang kéo (màu
  // bình thường theo SKU, xem CargoBox3D.tsx previewTint).
  const [dragValidity, setDragValidity] = useState<'valid' | 'invalid' | null>(null);
  // Thời điểm (performance.now()) của lần XOAY BỊ TỪ CHỐI gần nhất — null = không có gì để hiện.
  // Dùng timestamp (thay vì boolean đơn thuần) để làm `key` cho <RejectRing> bên dưới: bấm liên
  // tục trước khi hết hiệu ứng cũ vẫn tạo timestamp MỚI mỗi lần, buộc React tạo lại instance
  // RejectRing MỚI (animation opacity tự khởi động lại từ đầu, xem RejectRing.tsx) thay vì phải tự
  // quản lý reset animation giữa chừng.
  const [rotateRejectedAt, setRotateRejectedAt] = useState<number | null>(null);
  const rotateRejectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dọn timer khi component unmount giữa chừng hiệu ứng (vd đổi container/bỏ chọn kiện hàng ngay
  // sau khi vừa bị từ chối xoay) — tránh gọi setState trên component đã unmount.
  useEffect(() => {
    return () => {
      if (rotateRejectTimeoutRef.current) clearTimeout(rotateRejectTimeoutRef.current);
    };
  }, []);

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

  // Mặt phẳng NGANG ảo dùng để raycast ra vị trí X/Y engine từ con trỏ chuột — CỐ ĐỊNH tại độ cao
  // world hiện tại của kiện hàng (không đổi trong suốt buổi kéo, vì Z không còn do người dùng điều
  // khiển nữa nên không cần "chốt lại mốc theo mode" như bản kéo-3-trục cũ).
  const horizontalDragPlane = (worldY: number): Plane => new Plane(new Vector3(0, 1, 0), -worldY);

  const applySnapAndUpdate = (engine: { x: number; y: number }) => {
    const group = groupRef.current;
    if (!group) return;

    // Bước 1: DÒ floorZ bằng vị trí ngang RAW (chưa snap) — z: 0 để LUÔN ép clamp cứng của
    // computeFloorZ trả về đúng floorZ (xem giải thích ở JSDoc trên) — chỉ dùng kết quả này để
    // biết có đang ở trên ĐÚNG 1 kiện đỡ cụ thể hay không (floorSupportPlacement).
    const floorProbe = computeFloorZ(
      { x: engine.x, y: engine.y, length: placement.length, width: placement.width },
      otherPlacements,
    );

    // Bước 2: snap ngang — ưu tiên CĂN THEO ĐÚNG kiện đỡ vừa phát hiện (nếu có) thay vì mọi mặt
    // tham chiếu khác, để chân đế chồng khít hơn lên đúng kiện đó (tăng khả năng đạt
    // MIN_SUPPORT_RATIO); nếu không có kiện nào đỡ (đang ở trên sàn trống) — snap ngang theo mọi
    // mặt tham chiếu như bình thường.
    const horizontal = snapCandidatePosition({
      candidate: { x: engine.x, y: engine.y, length: placement.length, width: placement.width },
      containerInnerLength: containerTemplate.innerLength,
      containerInnerWidth: containerTemplate.innerWidth,
      otherPlacements: floorProbe.floorSupportPlacement ? [floorProbe.floorSupportPlacement] : otherPlacements,
    });

    // Bước 3: tính floorZ CUỐI CÙNG bằng vị trí ngang SAU KHI snap ở bước 2 — LUÔN đặt thẳng làm Z
    // (yêu cầu tính năng "luôn áp dụng floorZ", không còn Z tự do theo con trỏ nữa).
    const floorFinal = computeFloorZ(
      { x: horizontal.x, y: horizontal.y, length: placement.length, width: placement.width },
      otherPlacements,
    );

    const finalEngine = { x: horizontal.x, y: horizontal.y, z: floorFinal.floorZ };
    currentEngineRef.current = finalEngine;

    group.position.set(
      finalEngine.x + placement.length / 2,
      finalEngine.z + placement.height / 2,
      finalEngine.y + placement.width / 2,
    );

    // Revalidate NGAY tại vị trí xem trước (chưa thả chuột) — TÁI SỬ DỤNG NGUYÊN VẸN
    // revalidatePlacement (engine/revalidate.ts), đúng hàm dùng khi thật sự commit (onCommitMove),
    // chỉ khác là kết quả ở đây CHỈ đổi màu ghost, không ghi vào store.
    if (template) {
      const outcome = revalidatePlacement({
        placementId: placement.id,
        candidate: {
          x: finalEngine.x,
          y: finalEngine.y,
          z: finalEngine.z,
          length: placement.length,
          width: placement.width,
          height: placement.height,
        },
        template,
        placements: otherPlacements,
        containerTemplate,
        templatesById,
      });
      setDragValidity(outcome.valid ? 'valid' : 'invalid');
    }

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
    // Z LUÔN = floorZ (kiểu kéo trọng lực, xem JSDoc) — luôn highlight mặt sàn/nóc kiện đỡ hiện
    // đang chạm tới, coi như chỉ báo liên tục "đang áp vào đâu" trong lúc kéo.
    highlights.push({
      position: [group.position.x, floorFinal.floorZ, group.position.z],
      rotation: [-Math.PI / 2, 0, 0],
      width: placement.length,
      height: placement.width,
    });
    setSnapHighlights(highlights);
  };

  const handleWindowPointerMove = (e: PointerEvent) => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const hit = raycastPlane(e.clientX, e.clientY, horizontalDragPlane(anchor.anchorPoint.y));
    if (!hit) return;
    const delta = hit.clone().sub(anchor.anchorPoint);

    applySnapAndUpdate({
      x: anchor.anchorEngine.x + delta.x,
      y: anchor.anchorEngine.y + delta.z,
    });
  };

  const handleWindowPointerUp = () => {
    window.removeEventListener('pointermove', handleWindowPointerMove);
    window.removeEventListener('pointerup', handleWindowPointerUp);
    anchorRef.current = null;
    if (getControlsEnabled) getControlsEnabled.enabled = true;

    setSnapHighlights([]);
    setDragValidity(null);
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

    // Xóa ngay thông báo lỗi (nếu còn) từ lần kéo THẤT BẠI trước đó — bắt đầu 1 lượt kéo mới nghĩa
    // là người dùng đang THỬ VỊ TRÍ KHÁC, không được để thông báo cũ dính lại gây hiểu lầm.
    clearEditNotice();

    currentEngineRef.current = { x: placement.x, y: placement.y, z: placement.z };
    const plane = horizontalDragPlane(placement.z + placement.height / 2);
    const anchorPoint = raycastPlane(e.nativeEvent.clientX, e.nativeEvent.clientY, plane);
    if (!anchorPoint) return;
    anchorRef.current = { anchorEngine: { x: placement.x, y: placement.y }, anchorPoint };

    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);
  };

  const rotationAxes = template ? getAvailableRotationAxes(placement, template.allowedOrientations) : undefined;

  // Bọc onRotateAxis: khi 1 nấc xoay bị TỪ CHỐI (editSlice.ts rotatePlacement trả về false — vượt
  // kích thước container, vi phạm collision/stacking/support/CG...), phát thêm phản hồi hình ảnh
  // NGAY TẠI kiện hàng (viền đỏ + vòng tròn đỏ chớp rồi mờ dần) bên cạnh dòng editNotice đã có sẵn
  // — KHÔNG đổi gì ở logic validate, chỉ đọc kết quả true/false đã có sẵn từ store.
  const handleRotateStep = (axis: RotateAxis3D): boolean => {
    const committed = onRotateAxis(axis);
    if (!committed) {
      if (rotateRejectTimeoutRef.current) clearTimeout(rotateRejectTimeoutRef.current);
      setRotateRejectedAt(performance.now());
      rotateRejectTimeoutRef.current = setTimeout(() => setRotateRejectedAt(null), REJECT_RING_DURATION_MS);
    }
    return committed;
  };

  return (
    <>
      <group ref={groupRef} position={centerPosition} onPointerDown={rotateModeActive ? undefined : handlePointerDown}>
        <group ref={spinGroupRef}>
          <CargoBox3D
            placement={placement}
            template={template}
            selected
            highlighted={highlighted}
            faded={faded}
            onSelect={onSelect}
            renderAtOrigin
            disableSelect={rotateModeActive}
            previewTint={rotateRejectedAt !== null ? 'invalid' : (dragValidity ?? undefined)}
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
          onRotateStep={handleRotateStep}
        />
      )}
      {rotateModeActive && rotateRejectedAt !== null && (
        <RejectRing
          key={rotateRejectedAt}
          centerX={centerPosition[0]}
          centerY={centerPosition[1]}
          centerZ={centerPosition[2]}
          length={placement.length}
          width={placement.width}
          height={placement.height}
        />
      )}
      {/* Chỉ hiện mặt phẳng "đã khớp" khi vị trí SAU KHI SNAP thật sự HỢP LỆ (dragValidity ===
          'valid', tính qua revalidatePlacement — xem applySnapAndUpdate) — nếu không, khớp mép
          hình học xong vẫn có thể vi phạm support/stacking/CG, hiện mặt sáng lên đây sẽ đánh lừa
          người dùng tưởng vị trí đó hợp lệ. */}
      {dragValidity === 'valid' &&
        snapHighlights.map((h, i) => (
          <SnapFaceHighlight key={i} position={h.position} rotation={h.rotation} width={h.width} height={h.height} />
        ))}
    </>
  );
}
