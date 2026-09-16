import type { StateCreator } from 'zustand';
import type { CargoTemplate, ContainerSuggestion, PackingSolution, VehiclePlan } from '../../domain/types';
import { PLACEMENT_SCORE_WEIGHTS } from '../../engine/config';
import { generateSolution } from '../../engine/optimization/generateSolutions';
import { computeCgWarnings } from '../../engine/optimization/centerOfGravity';
import { computeSolutionStats } from '../../engine/optimization/stats';
import { expandContainerPlacements, suggestBetterContainer } from '../../engine/optimization/suggestBetterContainer';
import { packContainer } from '../../engine/packing/packContainer';
import type { RootStore } from '../index';

// Đã bỏ khái niệm nhiều phương án (cost/space/balanced) — chỉ còn 1 thuật toán extreme point
// duy nhất, nên state chỉ giữ ĐÚNG 1 solution (hoặc null nếu chưa tạo), không cần activeSolutionId
// để chọn giữa nhiều phương án nữa.
export interface SolutionSlice {
  solution: PackingSolution | null;
  candidateVehiclePlans: VehiclePlan[];
  // Gợi ý đổi loại container/xe cho CONTAINER CUỐI CÙNG của `solution` (xem
  // engine/optimization/suggestBetterContainer.ts) — tính lại mỗi lần generateSolutionForContainer
  // chạy, null nếu không có gợi ý nào (container cuối đã đủ đầy, hoặc không loại nào xếp vừa hết).
  lastContainerSuggestion: ContainerSuggestion | null;
  generateSolutionForContainer: (containerTemplateId: string) => void;
  // Bấm nút "Áp dụng" ở gợi ý — pack lại ĐÚNG container cuối bằng template mới (không chạy lại
  // generateSolution từ đầu, xem yêu cầu tính năng), thay thế trong solution.containers rồi tính
  // lại cgWarnings/stats của riêng container đó + tổng thể.
  applyContainerSuggestion: () => void;
}

export const createSolutionSlice: StateCreator<RootStore, [], [], SolutionSlice> = (set, get) => ({
  solution: null,
  candidateVehiclePlans: [],
  lastContainerSuggestion: null,

  generateSolutionForContainer: (containerTemplateId) => {
    const containerTemplate = get().containerLibrary.find((c) => c.id === containerTemplateId);
    if (!containerTemplate) return;
    const cargoTemplates = get().cargoTemplates;
    const solution = generateSolution(cargoTemplates, containerTemplate);

    const lastContainer = solution.containers[solution.containers.length - 1];
    const cargoTemplatesById = new Map(cargoTemplates.map((t) => [t.id, t] as const));
    const lastContainerSuggestion = lastContainer
      ? suggestBetterContainer({
          lastContainer,
          currentTemplate: containerTemplate,
          cargoTemplatesById,
          containerLibrary: get().containerLibrary,
          distanceKm: get().transportDistanceKm,
        })
      : null;

    // Luôn xem container ĐẦU TIÊN sau khi tạo phương án mới — solution.containers có thể có nhiều
    // hơn 1 phần tử nếu hàng hóa vượt quá 1 container (xem generateSolutions.ts), và lựa
    // chọn/bước mô phỏng của phương án CŨ (nếu có) không còn ý nghĩa gì với phương án vừa tạo.
    set((state) => ({
      solution,
      lastContainerSuggestion,
      activeContainerInstanceId: solution.containers[0]?.id ?? null,
      currentStepIndex: 0,
      ui: { ...state.ui, selectedPlacementId: null, rotateModeActive: false },
    }));
  },

  applyContainerSuggestion: () => {
    const state = get();
    const { solution, lastContainerSuggestion } = state;
    // BUG đã sửa: cả 3 nhánh dừng sớm trong hàm này trước đây `return` ÂM THẦM (không set
    // editNotice) — nhìn như nút "Áp dụng" không phản ứng gì, không có cách nào để người dùng biết
    // vì sao. Nguyên nhân gốc đã xác nhận qua debug (thêm console.log tạm thời ở cả 2 nơi gọi
    // packContainer, so sánh output): `lastContainerSuggestion` được tính SẴN lúc
    // generateSolutionForContainer chạy, dựa trên `cargoTemplates` TẠI THỜI ĐIỂM ĐÓ — nếu dữ liệu
    // cargoTemplates "trôi" khỏi solution hiện tại (vd 1 cargoTemplate đang được dùng trong
    // container cuối bị đổi weight/kích thước qua 1 đường nào đó KHÔNG tự tính lại phương án) thì
    // packContainer() ở đây có thể trả về unfit dù suggestBetterContainer() đã xác nhận vừa khít lúc
    // tính gợi ý — xem addCargoTemplates trong cargoSlice.ts (đã sửa để tự xóa
    // lastContainerSuggestion mỗi khi thêm hàng mới, ngăn áp dụng gợi ý lỗi thời). Dù nguyên nhân cụ
    // thể là gì, MỌI nhánh thất bại ở đây giờ đều set editNotice rõ ràng thay vì im lặng.
    if (!solution || !lastContainerSuggestion || solution.containers.length === 0) {
      set({ editNotice: 'Không có gợi ý nào để áp dụng — hãy tạo phương án xếp hàng trước' });
      return;
    }

    const newTemplate = state.containerLibrary.find((t) => t.id === lastContainerSuggestion.suggestedTemplateId);
    if (!newTemplate) {
      set({ editNotice: 'Không tìm thấy loại container/xe được gợi ý — hãy tạo lại phương án', lastContainerSuggestion: null });
      return;
    }

    const lastIndex = solution.containers.length - 1;
    const lastContainer = solution.containers[lastIndex];
    const cargoTemplatesById: Map<string, CargoTemplate> = new Map(
      state.cargoTemplates.map((t) => [t.id, t] as const),
    );
    const sortedItems = expandContainerPlacements(lastContainer, cargoTemplatesById);

    // Giữ nguyên containerInstanceId/containerIndex — chỉ đổi TEMPLATE dùng để xếp, không đổi vị
    // trí của container này trong danh sách (cgWarnings/UI đang tham chiếu theo containerInstanceId
    // này, xem bên dưới).
    const { container: repacked, unfit } = packContainer({
      containerTemplate: newTemplate,
      containerInstanceId: lastContainer.id,
      containerIndex: lastContainer.index,
      sortedItems,
      weights: PLACEMENT_SCORE_WEIGHTS,
    });
    // An toàn: suggestBetterContainer() đã xác nhận newTemplate xếp vừa HẾT đúng bộ hàng này nên
    // đáng lẽ không bao giờ unfit ở đây — nhưng vẫn phòng hờ (vd cargoTemplates đã đổi kể từ lúc
    // tính gợi ý) thay vì áp dụng 1 kết quả xếp dở dang, mất hàng. lastContainerSuggestion cũng bị
    // xóa vì nó đã được xác nhận là KHÔNG còn đúng với dữ liệu hiện tại.
    if (unfit.length > 0) {
      set({
        editNotice: 'Không thể áp dụng gợi ý này, có thể dữ liệu hàng hóa đã thay đổi — hãy tạo lại phương án',
        lastContainerSuggestion: null,
      });
      return;
    }

    const containers = solution.containers.map((c, i) => (i === lastIndex ? repacked : c));
    const cgWarnings = solution.cgWarnings
      .filter((w) => w.containerInstanceId !== lastContainer.id)
      .concat(
        computeCgWarnings(lastContainer.id, {
          offsetXRatio: repacked.cgOffsetXRatio,
          offsetZRatio: repacked.cgOffsetZRatio,
        }),
      );

    // templatesById phải dựng từ TOÀN BỘ containerLibrary (không chỉ 1 template như
    // generateSolutions.ts) vì containers giờ có thể thuộc 2 template KHÁC NHAU (container cuối
    // vừa đổi sang newTemplate, các container trước vẫn giữ containerTemplate cũ).
    const templatesById = new Map(state.containerLibrary.map((t) => [t.id, t] as const));
    const stats = computeSolutionStats(containers, templatesById);

    const newSolution: PackingSolution = {
      ...solution,
      containers,
      cgWarnings,
      stats,
      // vehiclePlan.items vẫn mô tả plan CŨ (1 loại/số lượng) — chưa đúng thực tế "container cuối
      // giờ khác loại" (cần cấu trúc nhiều items khác template, thuộc phạm vi
      // vehicle/generatePlans.ts P3 chưa xây), chỉ cập nhật totalCost cho khớp stats mới, không tự
      // bịa cấu trúc plan multi-loại chưa được yêu cầu.
      vehiclePlan: { ...solution.vehiclePlan, totalCost: stats.totalCost },
    };

    set({ solution: newSolution, lastContainerSuggestion: null });
  },
});
