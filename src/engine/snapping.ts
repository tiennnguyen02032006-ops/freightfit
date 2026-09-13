import { SNAP_THRESHOLD_MIN_MM, SNAP_THRESHOLD_RATIO } from './config';

/**
 * Snap (hút khớp) khi kéo tay di chuyển kiện hàng trong khung 3D — xem
 * components/scene/DraggablePlacement.tsx. File này CHỈ tính toán hình học thuần túy (không đụng
 * React/Three.js). Gồm 2 nhóm hàm:
 * - `snapCandidatePosition`: snap 2 trục NGANG (chiều dài/chiều rộng) — hút vào mặt gần nhất
 *   trong số TẤT CẢ mặt tham chiếu (vách container + mặt kiện khác), không quan tâm có đang chồng
 *   lên nhau theo trục còn lại hay không (giống snap-to-edge thông thường).
 * - `snapVerticalPosition`: snap trục ĐỨNG (chiều cao) — khác về bản chất: đây vừa là snap vừa là
 *   RÀNG BUỘC CỨNG (không được xuyên sàn / xuyên nóc kiện bên dưới), nên chỉ xét các kiện có
 *   CHÂN ĐẾ (footprint X/Y) chồng lên kiện đang kéo — xem ghi chú tại hàm đó.
 *
 * Ngưỡng snap = max(SNAP_THRESHOLD_RATIO × kích thước cạnh đang kéo theo trục đó,
 * SNAP_THRESHOLD_MIN_MM) — ví dụ kiện dài 2000mm -> ngưỡng = max(100, 30) = 100mm; kiện dài
 * 200mm (rất nhỏ) -> ngưỡng = max(10, 30) = 30mm (không tụt xuống dưới 3cm dù 5% rất nhỏ).
 */
export function computeSnapThreshold(sizeMm: number): number {
  return Math.max(SNAP_THRESHOLD_RATIO * sizeMm, SNAP_THRESHOLD_MIN_MM);
}

export interface AxisSnapResult {
  value: number; // tọa độ mặt MIN của kiện đang kéo sau khi snap (giữ nguyên nếu không snap)
  snapped: boolean;
  snappedFace?: 'MIN' | 'MAX'; // mặt nào của kiện đang kéo được hút khít vào target
  snappedTargetValue?: number; // tọa độ mặt tham chiếu đã khớp vào (dùng để vẽ highlight)
}

/**
 * Snap 1 trục: kiện đang kéo có mặt MIN tại `candidateMin` và mặt MAX tại `candidateMin + size`.
 * Với MỖI mặt tham chiếu trong `targets` (tường container hoặc mặt kiện khác), kiểm tra khoảng
 * cách tới CẢ 2 mặt của kiện đang kéo — nếu khoảng cách nhỏ hơn `thresholdMm`, coi là ứng viên
 * snap; chọn ứng viên có khoảng cách NHỎ NHẤT trong số tất cả (gần nhất luôn thắng, không chỉ lấy
 * target đầu tiên đủ gần).
 */
export function computeAxisSnap(
  candidateMin: number,
  size: number,
  targets: number[],
  thresholdMm: number,
): AxisSnapResult {
  const candidateMax = candidateMin + size;
  let best: { absDelta: number; newMin: number; face: 'MIN' | 'MAX'; target: number } | null = null;

  for (const target of targets) {
    const deltaForMin = target - candidateMin; // dịch mặt MIN vào đúng target
    const deltaForMax = target - candidateMax; // dịch mặt MAX vào đúng target (MIN dịch cùng lượng)

    if (Math.abs(deltaForMin) <= thresholdMm && (!best || Math.abs(deltaForMin) < best.absDelta)) {
      best = { absDelta: Math.abs(deltaForMin), newMin: candidateMin + deltaForMin, face: 'MIN', target };
    }
    if (Math.abs(deltaForMax) <= thresholdMm && (!best || Math.abs(deltaForMax) < best.absDelta)) {
      best = { absDelta: Math.abs(deltaForMax), newMin: candidateMin + deltaForMax, face: 'MAX', target };
    }
  }

  if (!best) return { value: candidateMin, snapped: false };
  return { value: best.newMin, snapped: true, snappedFace: best.face, snappedTargetValue: best.target };
}

export interface SnapBox2D {
  x: number;
  y: number;
  length: number;
  width: number;
}

export interface SnapCandidateParams {
  candidate: { x: number; y: number; length: number; width: number };
  containerInnerLength: number;
  containerInnerWidth: number;
  otherPlacements: SnapBox2D[];
}

export interface SnapCandidateResult {
  x: number;
  y: number;
  snappedX: boolean;
  snappedY: boolean;
  snapXTargetValue?: number;
  snapYTargetValue?: number;
}

/**
 * Snap đồng thời 2 trục ngang (X = chiều dài, Y = chiều rộng) — ĐỘC LẬP với nhau (trục này snap
 * không phụ thuộc trục kia có snap hay không, đúng yêu cầu "áp dụng cho từng trục độc lập").
 * Target snap gồm: 2 vách container (0 và innerLength/innerWidth) + mặt các kiện khác đã xếp
 * (không giới hạn theo vùng lân cận — kéo lại gần bất kỳ kiện nào cũng có thể hút khớp, giống
 * cách snap-to-edge của các phần mềm dựng hình 3D thông dụng).
 */
export function snapCandidatePosition(params: SnapCandidateParams): SnapCandidateResult {
  const { candidate, containerInnerLength, containerInnerWidth, otherPlacements } = params;

  const xTargets = [0, containerInnerLength, ...otherPlacements.flatMap((p) => [p.x, p.x + p.length])];
  const yTargets = [0, containerInnerWidth, ...otherPlacements.flatMap((p) => [p.y, p.y + p.width])];

  const xThreshold = computeSnapThreshold(candidate.length);
  const yThreshold = computeSnapThreshold(candidate.width);

  const snapX = computeAxisSnap(candidate.x, candidate.length, xTargets, xThreshold);
  const snapY = computeAxisSnap(candidate.y, candidate.width, yTargets, yThreshold);

  return {
    x: snapX.value,
    y: snapY.value,
    snappedX: snapX.snapped,
    snappedY: snapY.snapped,
    snapXTargetValue: snapX.snappedTargetValue,
    snapYTargetValue: snapY.snappedTargetValue,
  };
}

export interface SnapBox3D extends SnapBox2D {
  z: number;
  height: number;
}

function footprintOverlaps(
  a: { x: number; y: number; length: number; width: number },
  b: { x: number; y: number; length: number; width: number },
): boolean {
  return !(a.x + a.length <= b.x || b.x + b.length <= a.x || a.y + a.width <= b.y || b.y + b.width <= a.y);
}

export interface SnapVerticalParams {
  candidate: { x: number; y: number; z: number; length: number; width: number; height: number };
  containerInnerHeight: number;
  otherPlacements: SnapBox3D[];
}

export interface SnapVerticalResult {
  z: number;
  snapped: boolean;
  snapTargetValue?: number; // tọa độ MẶT PHẲNG NGANG đã khớp vào (sàn / nóc kiện dưới / trần)
}

/**
 * Snap + RÀNG BUỘC CỨNG trục đứng (chiều cao). Khác `computeAxisSnap` ở chỗ: kiện hàng chỉ có
 * thể "đứng" trên MẶT PHẲNG NGANG ngay bên dưới CHÂN ĐẾ (footprint X/Y) của chính nó — không phải
 * bất kỳ mặt kiện nào trong container (kiện ở góc khác không liên quan tới cột không gian này).
 *
 * `floorZ` = mặt phẳng cao nhất ngay dưới chân đế (0 nếu không có kiện nào đỡ — tức sàn container).
 * `ceilingZ` = độ cao tối đa để đỉnh kiện không vượt trần container HOẶC không xuyên lên kiện chặn
 * phía trên (nếu có) — TÍNH TỪ CÁC KIỆN CÓ FOOTPRINT CHỒNG LÊN kiện đang kéo, phân loại "đỡ dưới"
 * hay "chặn trên" bằng cách so TÂM (không so trực tiếp 2 mặt) để vẫn đúng cả khi con trỏ kéo
 * nhảy một bước lớn khiến `candidate.z` rơi thẳng vào GIỮA một kiện khác. Luôn CLAMP `candidate.z`
 * vào [floorZ, ceilingZ] trước — đây là ràng buộc CỨNG (không cho xuyên sàn/kiện dưới/trần/kiện
 * trên) — rồi mới xét SNAP MỀM (kéo tới gần floorZ/ceilingZ trong ngưỡng thì hút khít, kể cả khi
 * chưa thật sự chạm tới do đã bị clamp).
 */
export function snapVerticalPosition(params: SnapVerticalParams): SnapVerticalResult {
  const { candidate, containerInnerHeight, otherPlacements } = params;
  const candidateCenterZ = candidate.z + candidate.height / 2;

  // Với MỖI kiện có footprint chồng lên kiện đang kéo, quyết định nó là "ĐỠ BÊN DƯỚI" hay "CHẶN
  // BÊN TRÊN" bằng cách so sánh TÂM (không phải so trực tiếp candidate.z) — cách này vẫn đúng kể
  // cả khi con trỏ kéo nhảy một bước lớn khiến candidate.z rơi THẲNG VÀO GIỮA kiện kia (candidate.z
  // không còn rõ ràng "đang ở trên" hay "đang ở dưới" nếu chỉ so 2 mặt) — tự phát hiện qua test:
  // so trực tiếp p.z + p.height <= candidate.z bỏ sót đúng trường hợp này.
  const floorCandidates: number[] = [];
  const ceilingCandidates: number[] = [];
  for (const p of otherPlacements) {
    if (!footprintOverlaps(candidate, p)) continue;
    const pCenterZ = p.z + p.height / 2;
    if (candidateCenterZ >= pCenterZ) {
      floorCandidates.push(p.z + p.height); // kiện này đỡ bên dưới -> đứng lên trên mặt nóc nó
    } else {
      ceilingCandidates.push(p.z - candidate.height); // kiện này chặn bên trên -> treo dưới mặt đáy nó
    }
  }
  const floorZ = Math.max(0, ...floorCandidates);
  const ceilingFromAbove = ceilingCandidates.length > 0 ? Math.min(...ceilingCandidates) : Infinity;
  const ceilingZ = Math.max(floorZ, Math.min(containerInnerHeight - candidate.height, ceilingFromAbove));

  const z = Math.min(Math.max(candidate.z, floorZ), ceilingZ);

  const threshold = computeSnapThreshold(candidate.height);
  if (Math.abs(z - floorZ) <= threshold) {
    return { z: floorZ, snapped: true, snapTargetValue: floorZ };
  }
  // Mặt phẳng "trần" của cột không gian này — chính là containerInnerHeight thật nếu không có
  // kiện nào chặn phía trên, hoặc mặt đáy của kiện chặn phía trên nếu có (xem ceilingFromAbove).
  const ceilingSurface = ceilingZ + candidate.height;
  if (Math.abs(z - ceilingZ) <= threshold) {
    return { z: ceilingZ, snapped: true, snapTargetValue: ceilingSurface };
  }
  return { z, snapped: false };
}
