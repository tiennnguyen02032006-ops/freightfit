import type {
  CargoTemplate,
  ContainerTemplate,
  Placement,
  RevalidationResult,
  Violation,
} from '../domain/types';
import { hasCollision } from './constraints/collision';
import { fitsInsideContainer } from './packing/extremePoints';
import { respectsLoadOnTop } from './constraints/payload';
import { respectsStacking } from './constraints/stacking';
import { centerOfGravityOK, computeSupportRatio, findSupportingPlacements, meetsMinSupportRatio } from './constraints/support';

/**
 * revalidate.ts — dùng khi người dùng kéo tay chỉnh sửa (move/rotate/swap) một placement đã xếp
 * trong khung 3D (Phase 3, xem CLAUDE.md mục "Manual edit"). File này CHƯA tồn tại trong dự án
 * trước đây (đã kiểm tra bằng Glob "**\/revalidate.ts" — không có kết quả nào) — đây là bản TẠO
 * MỚI đầu tiên, không phải sửa lại file cũ.
 *
 * Vai trò: kiểm tra lại MỘT candidate placement (vị trí/kích thước mới do người dùng kéo/xoay đề
 * xuất) có còn thỏa mọi hard constraint hay không, TÁI SỬ DỤNG đúng các hàm constraint đã có sẵn
 * trong engine/constraints/ (không viết lại logic collision/stacking/support/... riêng cho case
 * chỉnh tay) — đảm bảo một kiện hàng bị kéo tay không bao giờ được phép vi phạm constraint mà lúc
 * xếp tự động không được phép vi phạm (đúng nguyên tắc "hard constraint không đổi lấy score đẹp
 * hơn" của CLAUDE.md).
 *
 * KHÔNG check lại `respectsContainerPayload` (tổng tải trọng container) vì move/rotate/swap
 * không làm đổi tổng khối lượng hàng trong container (không thêm/bớt kiện, chỉ đổi vị trí) — nếu
 * tổng tải trọng đã hợp lệ trước đó thì vẫn hợp lệ sau khi chỉ di chuyển nội bộ.
 *
 * GIỚI HẠN Ý THỨC: chỉ revalidate placement ĐANG được chỉnh, không đi kiểm tra dây chuyền các
 * placement khác từng "đứng nhờ" (supportedByPlacementIds) trên nó — nếu kéo một kiện ra khỏi vị
 * trí cũ khiến kiện phía trên nó hụt chân, phần mềm KHÔNG tự phát hiện lại điều đó (yêu cầu không
 * đề cập, và đây là bài toán tái-revalidate dây chuyền lớn hơn hẳn phạm vi "move/rotate/swap 1
 * hoặc 2 kiện" hiện tại).
 */

export interface CandidateBox {
  x: number;
  y: number;
  z: number;
  length: number;
  width: number;
  height: number;
}

export interface RevalidateParams {
  placementId: string;
  candidate: CandidateBox;
  template: CargoTemplate;
  /** Toàn bộ placement HIỆN CÓ trong container (bao gồm chính placementId, ở vị trí CŨ). */
  placements: Placement[];
  containerTemplate: ContainerTemplate;
  /** Tra cứu CargoTemplate của các kiện KHÁC (để check stacking/load-on-top của kiện bên dưới). */
  templatesById: Map<string, CargoTemplate>;
  /**
   * Các placementId khác cũng đang được chỉnh ĐỒNG THỜI trong cùng thao tác (vd hoán đổi 2 kiện —
   * xem swapPlacements trong editSlice.ts) — loại khỏi danh sách "placement khác" khi kiểm tra va
   * chạm/support/stacking, vì bản thân chúng cũng đang có candidate vị trí mới
   * riêng, sẽ được revalidate ở lần gọi khác (không dùng vị trí CŨ của chúng để chặn nhau).
   */
  otherMovingPlacementIds?: string[];
}

/** Các trường phái sinh cần cập nhật lại lên Placement khi commit — tránh lưu dữ liệu sai lệch
 * (stackLevel/supportRatio/supportedByPlacementIds phải khớp đúng vị trí MỚI). */
export interface RevalidateComputed {
  stackLevel: number;
  supportRatio: number;
  supportedByPlacementIds: string[];
}

export interface RevalidateOutcome extends RevalidationResult {
  /** Chỉ có giá trị khi valid === true — dùng để build lại Placement khi commit. */
  computed?: RevalidateComputed;
}

/**
 * Kiểm tra candidate theo ĐÚNG các hard constraint dùng khi xếp tự động (packContainer.ts):
 * orientation hợp lệ, trong lòng container, không đè kiện khác, stacking (dễ vỡ/không cho xếp
 * chồng/vượt số tầng), tải trọng đè lên kiện bên dưới, support ratio, trọng tâm cục bộ. Trả về
 * TẤT CẢ vi phạm tìm thấy (không dừng ở vi phạm đầu tiên) để có đủ thông tin hiển thị, nhưng
 * `valid` chỉ true khi không còn vi phạm nào.
 *
 * (Đã bỏ constraint "thứ tự giao hàng" — app không còn khái niệm nhóm hàng theo điểm giao nữa,
 * xem generateSolutions.ts/sortCargo.ts: mọi hàng hóa nay xếp chung 1 lô duy nhất.)
 */
export function revalidatePlacement(params: RevalidateParams): RevalidateOutcome {
  const {
    placementId,
    candidate,
    template,
    placements,
    containerTemplate,
    templatesById,
    otherMovingPlacementIds = [],
  } = params;
  const violations: Violation[] = [];

  const isAllowedOrientation = template.allowedOrientations.some(
    ([l, w, h]) => l === candidate.length && w === candidate.width && h === candidate.height,
  );
  if (!isAllowedOrientation) {
    violations.push({
      type: 'ROTATION_NOT_ALLOWED',
      placementId,
      message: 'Không thể xoay: hướng này không được phép với loại hàng này',
    });
  }

  if (!fitsInsideContainer(candidate, containerTemplate)) {
    violations.push({
      type: 'OUT_OF_BOUNDS',
      placementId,
      message: 'Không thể đặt: vượt ra ngoài container',
    });
  }

  const excludeIds = new Set([placementId, ...otherMovingPlacementIds]);
  const otherPlacements = placements.filter((p) => !excludeIds.has(p.id));

  if (hasCollision(candidate, otherPlacements)) {
    violations.push({
      type: 'COLLISION',
      placementId,
      message: 'Không thể đặt: đè lên kiện khác',
    });
  }

  const supportingPlacements = findSupportingPlacements(candidate, otherPlacements);
  const stackLevel =
    supportingPlacements.length === 0 ? 0 : Math.max(...supportingPlacements.map((p) => p.stackLevel)) + 1;

  if (!respectsStacking(supportingPlacements, templatesById, stackLevel)) {
    violations.push({
      type: 'STACK_VIOLATION',
      placementId,
      message: 'Không thể đặt: vi phạm ràng buộc dễ vỡ / không cho xếp chồng / vượt số tầng tối đa',
    });
  }

  if (!respectsLoadOnTop(supportingPlacements, templatesById, template.weight)) {
    violations.push({
      type: 'PAYLOAD_VIOLATION',
      placementId,
      message: 'Không thể đặt: vượt quá tải trọng cho phép đè lên kiện bên dưới',
    });
  }

  const supportRatio = computeSupportRatio(candidate, supportingPlacements);
  if (!meetsMinSupportRatio(supportRatio)) {
    violations.push({
      type: 'LOW_SUPPORT',
      placementId,
      message: 'Không thể đặt: diện tích tiếp xúc bên dưới không đủ (ổn định hình học kém)',
    });
  }

  const centerX = candidate.x + candidate.length / 2;
  const centerY = candidate.y + candidate.width / 2;
  if (!centerOfGravityOK({ centerX, centerY, z: candidate.z }, supportingPlacements)) {
    violations.push({
      type: 'CG_OUT_OF_RANGE',
      placementId,
      message: 'Không thể đặt: trọng tâm kiện hàng lệch ra ngoài vùng đỡ bên dưới',
    });
  }

  if (violations.length > 0) {
    return { valid: false, violations };
  }

  return {
    valid: true,
    violations: [],
    computed: {
      stackLevel,
      supportRatio,
      supportedByPlacementIds: supportingPlacements.map((p) => p.id),
    },
  };
}
