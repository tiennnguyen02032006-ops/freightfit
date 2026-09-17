import type {
  CargoTemplate,
  ContainerInstance,
  ContainerTemplate,
  Placement,
  UnfitCargo,
} from '../../domain/types';
import { MIN_SUPPORT_RATIO, type PlacementScoreWeights } from '../config';
import { respectsContainerPayload, respectsLoadOnTop } from '../constraints/payload';
import { respectsStacking } from '../constraints/stacking';
import { hasCollision } from '../constraints/collision';
import { applyClearance } from '../constraints/clearance';
import {
  centerOfGravityOK,
  computeSupportRatio,
  findSupportingPlacements,
  meetsMinSupportRatio,
} from '../constraints/support';
import { addExtremePoints, createInitialExtremePoints, fitsInsideContainer, generateNewExtremePoints, removeExtremePoint } from './extremePoints';
import { computeContactRatio, placementScore } from './placementScoring';
import { determineUnfitReason } from './unfitReason';
import type { ExpandedCargoItem } from '../preprocessing/normalizeCargo';
import { computeCenterOfGravity, computeCgOffsets } from '../optimization/centerOfGravity';

export interface PackContainerParams {
  containerTemplate: ContainerTemplate;
  containerInstanceId: string;
  containerIndex: number;
  sortedItems: ExpandedCargoItem[];
  weights: PlacementScoreWeights;
  minSupportRatio?: number;
}

export interface PackContainerResult {
  container: ContainerInstance;
  unfit: UnfitCargo[];
}

interface BestCandidate {
  pointIndex: number;
  x: number;
  y: number;
  z: number;
  fitLength: number;
  fitWidth: number;
  fitHeight: number;
  orientationIndex: number;
  supportingPlacements: Placement[];
  stackLevel: number;
  supportRatio: number;
  score: number;
}

/**
 * So sánh 2 candidate theo thứ tự ưu tiên "xếp theo lớp phẳng" (thay cho chọn thẳng theo
 * placementScore nhỏ nhất trước đây — xem lịch sử thay đổi ở packContainer):
 * 1. z (chiều cao) TĂNG DẦN — ưu tiên tuyệt đối lấp ĐẦY một lớp cùng độ cao trước khi bắt đầu
 *    lớp cao hơn, để mặt trên mỗi lớp phẳng thay vì lởm chởm.
 * 2. Trong cùng lớp (z bằng nhau): x (chiều dài, khung nội bộ) TĂNG DẦN — ưu tiên tiến sâu theo
 *    chiều dài từng chút một (không nhảy cóc), để mép mỗi "hàng ngang" thẳng theo chiều dài.
 * 3. Trong cùng lớp + cùng vị trí dọc chiều dài (x bằng nhau): y (chiều rộng) TĂNG DẦN — ưu tiên
 *    lấp đầy hết bề rộng container trước khi tiến sâu thêm theo chiều dài, để mép hàng thẳng
 *    theo chiều rộng.
 * 4. Chỉ khi (z, x, y) trùng nhau tuyệt đối (hiếm — cùng 1 điểm, khác orientation) mới dùng
 *    placementScore (khít nhất/support/delivery...) cũ làm tie-break cuối.
 *
 * Đây là kiểu "shelf algorithm" cổ điển trong bin packing (lớp -> hàng -> vị trí trong hàng),
 * ưu tiên bề mặt phẳng/thực tế hơn là lấp đầy tối đa — chấp nhận tỷ lệ lấp đầy có thể giảm nhẹ.
 */
function compareCandidatePriority(
  a: { x: number; y: number; z: number; score: number },
  b: { x: number; y: number; z: number; score: number },
): number {
  if (a.z !== b.z) return a.z - b.z;
  if (a.x !== b.x) return a.x - b.x;
  if (a.y !== b.y) return a.y - b.y;
  return a.score - b.score;
}

/**
 * packContainer chỉ xử lý 1 container (không loop vehicle plan / multi-container).
 * Theo đúng pipeline mục 4-5 docs/algorithm-design.md: với mỗi item (đã sort), thử từng
 * orientation x extreme point, lọc qua fit -> collision -> stacking -> payload ->
 * support/CG -> chọn candidate theo compareCandidatePriority (lớp phẳng trước, placementScore
 * chỉ là tie-break cuối).
 */
export function packContainer(params: PackContainerParams): PackContainerResult {
  const {
    containerTemplate,
    containerInstanceId,
    containerIndex,
    sortedItems,
    weights,
    minSupportRatio = MIN_SUPPORT_RATIO,
  } = params;

  const templatesById = new Map<string, CargoTemplate>();
  for (const item of sortedItems) {
    templatesById.set(item.cargoTemplateId, item.template);
  }

  // === Khung tọa độ x dùng NỘI BỘ trong vòng lặp bên dưới ===
  // createInitialExtremePoints() luôn seed đúng 1 điểm (0,0,0) -> item đầu tiên BẮT BUỘC phải
  // đặt tại x=0 (không có điểm nào khác để chọn), và toàn bộ extreme point sinh ra sau đó chỉ
  // mọc dần theo +x từ đó. Nói cách khác thuật toán luôn ép sát hàng vào vách tại "x nội bộ = 0"
  // trước, để trống (nếu thiếu hàng) ở đầu "x nội bộ lớn".
  //
  // BUG đã sửa: trước đây "x nội bộ" bị dùng thẳng làm x thật (x=0 = cửa, theo quy ước render ở
  // TruckDecoration/ContainerShell) -> hàng luôn ép sát CỬA, còn vách trước/đầu xe (x thật =
  // containerTemplate.innerLength) thì bị bỏ trống bất kể còn hàng hay không. Đây chính là
  // khoảng trống phía trước mà người dùng thấy trong 3D. Không phải do cộng nhầm offset/padding,
  // không phải nhầm tâm/góc container, và không phải do tính sai độ dày vách (vách chỉ tồn tại ở
  // lớp render, containerGeometry.ts không hề được engine import) — mà do GÓC BẮT ĐẦU LẤP ĐẦY
  // (điểm extreme point gốc) bị gán cho đúng cái vách sai (cửa thay vì vách trước).
  //
  // Cách sửa: coi "x nội bộ" (biến candidateBox.x/point.x/chosen.x xuyên suốt vòng lặp bên dưới)
  // là khoảng cách tính từ VÁCH TRƯỚC (x thật = containerTemplate.innerLength) đi vào phía cửa —
  // tức x nội bộ = containerTemplate.innerLength - x_thật - chiều_dài_box. Nhờ đó item đầu tiên
  // (điểm seed x nội bộ = 0) luôn nằm sát vách trước, gap (nếu có) dồn về phía cửa — đúng thực tế
  // xếp hàng (đẩy sát đầu xe để chống xô lệch khi phanh, chừa lối cửa để dễ bốc dỡ). Vì phép đổi
  // trục này là phép LẬT (mirror) toàn phần dọc x, mọi so sánh HÌNH HỌC thuần túy (collision, fit
  // bounds, support ratio, stacking, center of gravity theo support polygon) không cần đổi gì —
  // chúng chỉ so sánh khoảng chồng lấn tương đối, vẫn đúng trong khung x nội bộ. CHỈ Placement.x/
  // centerX cuối cùng trả ra ngoài mới thực sự cần quy đổi sang x thật (khoảng cách tới cửa) —
  // quy đổi 1 lần sau khi vòng lặp kết thúc, xem đoạn "Quy đổi x nội bộ -> x thật" phía dưới.
  const placements: Placement[] = [];
  let extremePoints = createInitialExtremePoints();
  let totalWeight = 0;
  let usedVolume = 0;
  const unfit: UnfitCargo[] = [];
  // Lý do rớt GẦN NHẤT (cập nhật lại mỗi lần tryPlaceItem thất bại cho item đó) — dùng khi vòng
  // lặp thử lại cuối cùng bỏ cuộc hẳn với 1 item, xem tryPlaceItem/vòng lặp thử lại bên dưới.
  const lastUnfitReasonByInstanceId = new Map<string, UnfitCargo>();

  /**
   * Thử đặt 1 kiện hàng vào vị trí tốt nhất trong số extremePoints HIỆN TẠI (đọc/ghi trực tiếp
   * placements/extremePoints/totalWeight/usedVolume ở closure ngoài) — trả về true nếu đặt được
   * (đã push placement + cập nhật state), false nếu không. KHÔNG tự push vào `unfit` khi thất bại
   * (chỉ ghi lại lý do gần nhất vào lastUnfitReasonByInstanceId) — để nơi gọi tự quyết định lúc
   * nào mới coi là rớt hẳn (vòng lặp chính đẩy vào retryQueue để thử lại, chỉ vòng lặp thử lại
   * cuối cùng mới thực sự kết luận unfit, xem bên dưới).
   */
  function tryPlaceItem(item: ExpandedCargoItem): boolean {
    const template = item.template;
    let best: BestCandidate | null = null;
    let anyOrientationFitsContainer = false;
    let hadAnyFitCandidate = false;
    let allFitCandidatesFailedStacking = true;

    template.allowedOrientations.forEach(([l, w, h], orientationIndex) => {
      const fitDims = applyClearance({ length: l, width: w, height: h }, template.clearance);
      const orientationFitsContainer =
        fitDims.length <= containerTemplate.innerLength &&
        fitDims.width <= containerTemplate.innerWidth &&
        fitDims.height <= containerTemplate.innerHeight;
      if (orientationFitsContainer) anyOrientationFitsContainer = true;

      extremePoints.forEach((point, pointIndex) => {
        const candidateBox = {
          x: point.x,
          y: point.y,
          z: point.z,
          length: fitDims.length,
          width: fitDims.width,
          height: fitDims.height,
        };

        if (!fitsInsideContainer(candidateBox, containerTemplate)) return;
        if (hasCollision(candidateBox, placements)) return;

        hadAnyFitCandidate = true;

        const supportingPlacements = findSupportingPlacements(candidateBox, placements);
        const newStackLevel =
          supportingPlacements.length === 0
            ? 0
            : Math.max(...supportingPlacements.map((p) => p.stackLevel)) + 1;

        if (!respectsStacking(supportingPlacements, templatesById, newStackLevel)) return;
        allFitCandidatesFailedStacking = false;

        if (!respectsContainerPayload(totalWeight, template.weight, containerTemplate.maxPayload)) return;
        if (!respectsLoadOnTop(supportingPlacements, templatesById, template.weight)) return;

        const supportRatio = computeSupportRatio(candidateBox, supportingPlacements);
        if (!meetsMinSupportRatio(supportRatio, minSupportRatio)) return;

        const centerX = candidateBox.x + fitDims.length / 2;
        const centerY = candidateBox.y + fitDims.width / 2;
        if (!centerOfGravityOK({ centerX, centerY, z: candidateBox.z }, supportingPlacements)) return;

        // "Khít nhất" (yêu cầu chính của extreme point heuristic kiểu EasyCargo) — xem
        // computeContactRatio trong placementScoring.ts. Tính trong khung x nội bộ (u-space) là
        // đúng vì đây thuần là quan hệ hình học tương đối giữa các placement, bất biến qua phép
        // lật trục x (xem giải thích khung tọa độ ở đầu file).
        const contactRatio = computeContactRatio(candidateBox, placements);
        const score = placementScore(candidateBox, supportRatio, contactRatio, weights);

        if (
          !best ||
          compareCandidatePriority(
            { x: candidateBox.x, y: candidateBox.y, z: candidateBox.z, score },
            { x: best.x, y: best.y, z: best.z, score: best.score },
          ) < 0
        ) {
          best = {
            pointIndex,
            x: point.x,
            y: point.y,
            z: point.z,
            fitLength: fitDims.length,
            fitWidth: fitDims.width,
            fitHeight: fitDims.height,
            orientationIndex,
            supportingPlacements,
            stackLevel: newStackLevel,
            supportRatio,
            score,
          };
        }
      });
    });

    if (!best) {
      lastUnfitReasonByInstanceId.set(item.cargoInstanceId, {
        cargoInstanceId: item.cargoInstanceId,
        cargoTemplateId: item.cargoTemplateId,
        reason: determineUnfitReason({
          exceedsPayloadAlone: totalWeight + template.weight > containerTemplate.maxPayload,
          noOrientationFitsContainerBounds: !anyOrientationFitsContainer,
          allFailuresWereStacking: hadAnyFitCandidate && allFitCandidatesFailedStacking,
        }),
      });
      return false;
    }

    const chosen: BestCandidate = best;
    const [l, w, h] = template.allowedOrientations[chosen.orientationIndex];
    const placementX = chosen.x + template.clearance.left;
    const placementY = chosen.y + template.clearance.front;
    const placementZ = chosen.z + template.clearance.bottom;

    const placement: Placement = {
      id: `${containerInstanceId}__${item.cargoInstanceId}`,
      cargoInstanceId: item.cargoInstanceId,
      cargoTemplateId: item.cargoTemplateId,
      containerInstanceId,
      x: placementX,
      y: placementY,
      z: placementZ,
      length: l,
      width: w,
      height: h,
      orientationIndex: chosen.orientationIndex,
      weight: template.weight,
      centerX: placementX + l / 2,
      centerY: placementY + w / 2,
      centerZ: placementZ + h / 2,
      supportRatio: chosen.supportRatio,
      supportedByPlacementIds: chosen.supportingPlacements.map((p) => p.id),
      stackLevel: chosen.stackLevel,
    };

    placements.push(placement);
    totalWeight += template.weight;
    usedVolume += l * w * h;

    const usedPoint = extremePoints[chosen.pointIndex];
    extremePoints = removeExtremePoint(extremePoints, usedPoint);
    const newPoints = generateNewExtremePoints({
      x: chosen.x,
      y: chosen.y,
      z: chosen.z,
      length: chosen.fitLength,
      width: chosen.fitWidth,
      height: chosen.fitHeight,
    });
    extremePoints = addExtremePoints(extremePoints, newPoints);
    return true;
  }

  // Vòng lặp chính: đúng thứ tự sortedItems, item nào không đặt được ngay thì đưa vào retryQueue
  // thay vì kết luận unfit ngay lập tức.
  let retryQueue: ExpandedCargoItem[] = [];
  for (const item of sortedItems) {
    if (!tryPlaceItem(item)) retryQueue.push(item);
  }

  // Vòng lặp "thử lại" kiểu fixed-point: các item bị rớt sớm có thể xếp vừa vào extremePoints MỚI
  // sinh ra bởi các item xếp SAU đó trong cùng lượt (vd lấp khoảng trống "lối đi ở giữa" — xem giải
  // thích tính năng ở đầu file/lịch sử thay đổi). Lặp nhiều lượt tới khi 1 lượt không còn đặt thêm
  // được món nào (không có tiến triển) thì dừng. Hằng số an toàn: tối đa bằng đúng số item còn lại
  // lúc bắt đầu vòng lặp thử lại — mỗi lượt CÓ tiến triển đặt được ít nhất 1 món, nên không bao giờ
  // cần nhiều lượt hơn số item, phòng lỗi logic ngoài dự kiến khiến vòng lặp không tự dừng đúng lúc
  // (giống style MAX_CONTAINERS ở generateSolutions.ts).
  const maxRetryPasses = retryQueue.length;
  for (let pass = 0; pass < maxRetryPasses && retryQueue.length > 0; pass++) {
    const stillUnfit: ExpandedCargoItem[] = [];
    let progressed = false;
    for (const item of retryQueue) {
      if (tryPlaceItem(item)) {
        progressed = true;
      } else {
        stillUnfit.push(item);
      }
    }
    retryQueue = stillUnfit;
    if (!progressed) break;
  }

  for (const item of retryQueue) {
    // lastUnfitReasonByInstanceId LUÔN có entry cho item ở đây — tryPlaceItem ghi lại lý do ngay
    // trước khi trả về false, và item chỉ còn trong retryQueue nếu lần thử GẦN NHẤT của nó thất bại.
    unfit.push(lastUnfitReasonByInstanceId.get(item.cargoInstanceId)!);
  }

  // Quy đổi x nội bộ -> x thật: toàn bộ vòng lặp trên xếp hàng trong khung x nội bộ (khoảng
  // cách tới vách trước), phải đổi 1 lần ở đây trước khi trả Placement ra ngoài, vì mọi nơi khác
  // trong app (rendering, revalidate...) đều hiểu x theo khoảng cách tới cửa (x=0 = cửa) như quy
  // ước gốc.
  for (const p of placements) {
    const realX = containerTemplate.innerLength - p.x - p.length;
    const realCenterX = containerTemplate.innerLength - p.centerX;
    p.x = realX;
    p.centerX = realCenterX;
  }

  const centerOfGravity = computeCenterOfGravity(placements);
  const { offsetXRatio, offsetZRatio } = computeCgOffsets(centerOfGravity, containerTemplate);

  const container: ContainerInstance = {
    id: containerInstanceId,
    templateId: containerTemplate.id,
    index: containerIndex,
    placements,
    // Lưu ý: các điểm còn lại ở đây vẫn ở khung x NỘI BỘ (khoảng cách tới vách trước), chưa quy
    // đổi sang x thật như placements ở trên — hiện chưa có nơi nào đọc tọa độ x thật của
    // extremePoints (revalidate.ts P3 chưa xây dựng), nên chưa cần đổi. Nếu sau này có chỗ dùng
    // trực tiếp x của các điểm này để suy ra vị trí thật, phải quy đổi tương tự đoạn trên.
    extremePoints,
    totalWeight,
    usedVolume,
    centerOfGravity,
    cgOffsetXRatio: offsetXRatio,
    cgOffsetZRatio: offsetZRatio,
  };

  return { container, unfit };
}
