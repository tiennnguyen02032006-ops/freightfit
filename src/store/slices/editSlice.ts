import type { StateCreator } from 'zustand';
import type { Placement } from '../../domain/types';
import { revalidatePlacement, type CandidateBox } from '../../engine/revalidate';
import { applyPlacementsToSolution } from '../../engine/optimization/applyEdit';
import type { RootStore } from '../index';

// Trục KHÔNG GIAN BA CHIỀU để xoay 90° khi chỉnh tay — KHÁC với `RotationAxis` trong
// domain/types.ts (đó là CHÍNH SÁCH xoay cho phép của CargoTemplate: NONE/YAW/FULL). X = trục
// three.js X (chiều dài), Y = trục three.js Y (chiều cao, xoay ngang tại chỗ), Z = trục three.js Z
// (chiều rộng). Khôi phục lại đủ 3 trục cho nút "Xoay 3 chiều" (từng bị rút gọn còn 1 trục Y).
export type RotateAxis3D = 'X' | 'Y' | 'Z';

export interface EditSlice {
  // Thông báo ngắn khi 1 thao tác chỉnh tay (move/rotate/swap) bị từ chối — null = không có gì
  // để hiện. UI (ContainerScene) tự xóa sau vài giây, xem clearEditNotice.
  editNotice: string | null;
  clearEditNotice: () => void;
  // Trả về true nếu thao tác được CHẤP NHẬN (đã commit vào solution), false nếu bị từ chối (hoặc
  // dữ liệu đầu vào không hợp lệ, vd container/placement không tồn tại) — UI dùng giá trị này để
  // biết có cần "snap back" hay không (xem DraggablePlacement.tsx).
  movePlacement: (containerInstanceId: string, placementId: string, target: { x: number; y: number; z: number }) => boolean;
  // axis: trục xoay 90° — xem RotateAxis3D. X/Z (lật đứng, đổi mặt nào tiếp đất) chỉ thật sự có
  // hiệu lực khi tổ hợp kích thước mới nằm trong `template.allowedOrientations` — revalidate.ts đã
  // tự kiểm tra việc này (không cần chặn riêng ở đây), nên hàng 'NONE'/'Giữ đứng' gọi X/Z vẫn AN
  // TOÀN (chỉ bị từ chối lịch sự qua editNotice), dù UI (RotationArcHandle.tsx) đã ẩn mũi tên
  // tương ứng trước để không cho thử nhầm.
  rotatePlacement: (containerInstanceId: string, placementId: string, axis: RotateAxis3D) => boolean;
  swapPlacements: (containerInstanceId: string, placementIdA: string, placementIdB: string) => boolean;
}

/** Đổi 2 trong 3 chiều theo đúng trục xoay 90° — trục còn lại (trùng trục xoay) giữ nguyên. */
function swapDimsForAxis(
  placement: Placement,
  axis: RotateAxis3D,
): { length: number; width: number; height: number } {
  switch (axis) {
    case 'X': // xoay quanh trục dài -> đổi rộng<->cao
      return { length: placement.length, width: placement.height, height: placement.width };
    case 'Z': // xoay quanh trục rộng -> đổi dài<->cao
      return { length: placement.height, width: placement.width, height: placement.length };
    case 'Y': // xoay quanh trục cao (nằm ngang tại chỗ) -> đổi dài<->rộng
    default:
      return { length: placement.width, width: placement.length, height: placement.height };
  }
}

function buildCandidate(placement: Placement, overrides: Partial<CandidateBox>): CandidateBox {
  return {
    x: placement.x,
    y: placement.y,
    z: placement.z,
    length: placement.length,
    width: placement.width,
    height: placement.height,
    ...overrides,
  };
}

function withCandidate(placement: Placement, candidate: CandidateBox, computed: { stackLevel: number; supportRatio: number; supportedByPlacementIds: string[] }): Placement {
  return {
    ...placement,
    x: candidate.x,
    y: candidate.y,
    z: candidate.z,
    length: candidate.length,
    width: candidate.width,
    height: candidate.height,
    centerX: candidate.x + candidate.length / 2,
    centerY: candidate.y + candidate.width / 2,
    centerZ: candidate.z + candidate.height / 2,
    stackLevel: computed.stackLevel,
    supportRatio: computed.supportRatio,
    supportedByPlacementIds: computed.supportedByPlacementIds,
  };
}

export const createEditSlice: StateCreator<RootStore, [], [], EditSlice> = (set, get) => ({
  editNotice: null,
  clearEditNotice: () => set({ editNotice: null }),

  movePlacement: (containerInstanceId, placementId, target) => {
    const { solution, containerLibrary, cargoTemplates } = get();
    const container = solution?.containers.find((c) => c.id === containerInstanceId);
    const containerTemplate = containerLibrary.find((t) => t.id === container?.templateId);
    const placement = container?.placements.find((p) => p.id === placementId);
    const template = cargoTemplates.find((t) => t.id === placement?.cargoTemplateId);
    if (!solution || !container || !containerTemplate || !placement || !template) return false;

    const templatesById = new Map(cargoTemplates.map((t) => [t.id, t] as const));
    const candidate = buildCandidate(placement, { x: target.x, y: target.y, z: target.z });

    const result = revalidatePlacement({
      placementId,
      candidate,
      template,
      placements: container.placements,
      containerTemplate,
      templatesById,
    });

    if (!result.valid || !result.computed) {
      set({ editNotice: result.violations[0]?.message ?? 'Không thể đặt ở vị trí này' });
      return false;
    }

    const updatedPlacements = container.placements.map((p) =>
      p.id === placementId ? withCandidate(placement, candidate, result.computed!) : p,
    );
    commitPlacements(set, get, solution, containerInstanceId, updatedPlacements, containerTemplate);
    return true;
  },

  rotatePlacement: (containerInstanceId, placementId, axis) => {
    const { solution, containerLibrary, cargoTemplates } = get();
    const container = solution?.containers.find((c) => c.id === containerInstanceId);
    const containerTemplate = containerLibrary.find((t) => t.id === container?.templateId);
    const placement = container?.placements.find((p) => p.id === placementId);
    const template = cargoTemplates.find((t) => t.id === placement?.cargoTemplateId);
    if (!solution || !container || !containerTemplate || !placement || !template) return false;

    const templatesById = new Map(cargoTemplates.map((t) => [t.id, t] as const));
    // Xoay 90° quanh đúng trục yêu cầu — giữ nguyên vị trí góc (x,y,z), chỉ đổi kích thước bao
    // quanh theo 2 chiều vuông góc với trục xoay (xem swapDimsForAxis).
    const candidate = buildCandidate(placement, swapDimsForAxis(placement, axis));

    const result = revalidatePlacement({
      placementId,
      candidate,
      template,
      placements: container.placements,
      containerTemplate,
      templatesById,
    });

    if (!result.valid || !result.computed) {
      set({ editNotice: result.violations[0]?.message ?? 'Không thể xoay kiện hàng này' });
      return false;
    }

    const orientationIndex = template.allowedOrientations.findIndex(
      ([l, w, h]) => l === candidate.length && w === candidate.width && h === candidate.height,
    );
    const updatedPlacements = container.placements.map((p) => {
      if (p.id !== placementId) return p;
      const updated = withCandidate(placement, candidate, result.computed!);
      return orientationIndex >= 0 ? { ...updated, orientationIndex } : updated;
    });
    commitPlacements(set, get, solution, containerInstanceId, updatedPlacements, containerTemplate);
    return true;
  },

  swapPlacements: (containerInstanceId, placementIdA, placementIdB) => {
    if (placementIdA === placementIdB) return false;
    const { solution, containerLibrary, cargoTemplates } = get();
    const container = solution?.containers.find((c) => c.id === containerInstanceId);
    const containerTemplate = containerLibrary.find((t) => t.id === container?.templateId);
    const placementA = container?.placements.find((p) => p.id === placementIdA);
    const placementB = container?.placements.find((p) => p.id === placementIdB);
    const templatesById = new Map(cargoTemplates.map((t) => [t.id, t] as const));
    const templateA = placementA ? templatesById.get(placementA.cargoTemplateId) : undefined;
    const templateB = placementB ? templatesById.get(placementB.cargoTemplateId) : undefined;
    if (!solution || !container || !containerTemplate || !placementA || !placementB || !templateA || !templateB) {
      return false;
    }

    // Hoán đổi VỊ TRÍ (x,y,z) — mỗi kiện giữ nguyên kích thước/hướng của chính nó, chỉ chuyển tới
    // góc tọa độ của kiện kia. Loại trừ lẫn nhau (otherMovingPlacementIds) khi revalidate vì cả
    // hai đều đang rời khỏi vị trí cũ, không được dùng vị trí cũ của nhau để báo COLLISION giả.
    const candidateA = buildCandidate(placementA, { x: placementB.x, y: placementB.y, z: placementB.z });
    const candidateB = buildCandidate(placementB, { x: placementA.x, y: placementA.y, z: placementA.z });

    const resultA = revalidatePlacement({
      placementId: placementIdA,
      candidate: candidateA,
      template: templateA,
      placements: container.placements,
      containerTemplate,
      templatesById,
      otherMovingPlacementIds: [placementIdB],
    });
    const resultB = revalidatePlacement({
      placementId: placementIdB,
      candidate: candidateB,
      template: templateB,
      placements: container.placements,
      containerTemplate,
      templatesById,
      otherMovingPlacementIds: [placementIdA],
    });

    if (!resultA.valid || !resultB.valid || !resultA.computed || !resultB.computed) {
      const message =
        resultA.violations[0]?.message ?? resultB.violations[0]?.message ?? 'Không thể hoán đổi 2 kiện hàng này';
      set({ editNotice: message });
      return false;
    }

    const updatedPlacements = container.placements.map((p) => {
      if (p.id === placementIdA) return withCandidate(placementA, candidateA, resultA.computed!);
      if (p.id === placementIdB) return withCandidate(placementB, candidateB, resultB.computed!);
      return p;
    });
    commitPlacements(set, get, solution, containerInstanceId, updatedPlacements, containerTemplate);
    return true;
  },
});

function commitPlacements(
  set: (partial: Partial<RootStore>) => void,
  get: () => RootStore,
  solution: NonNullable<RootStore['solution']>,
  containerInstanceId: string,
  updatedPlacements: Placement[],
  containerTemplate: RootStore['containerLibrary'][number],
) {
  const containerTemplatesById = new Map(get().containerLibrary.map((t) => [t.id, t] as const));
  const newSolution = applyPlacementsToSolution(
    solution,
    containerInstanceId,
    updatedPlacements,
    containerTemplate,
    containerTemplatesById,
  );
  set({ solution: newSolution, editNotice: null });
}
