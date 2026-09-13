import type { StateCreator } from 'zustand';
import type { PackingSolution, VehiclePlan } from '../../domain/types';
import { generateSolution } from '../../engine/optimization/generateSolutions';
import type { RootStore } from '../index';

// Đã bỏ khái niệm nhiều phương án (cost/space/balanced) — chỉ còn 1 thuật toán extreme point
// duy nhất, nên state chỉ giữ ĐÚNG 1 solution (hoặc null nếu chưa tạo), không cần activeSolutionId
// để chọn giữa nhiều phương án nữa.
export interface SolutionSlice {
  solution: PackingSolution | null;
  candidateVehiclePlans: VehiclePlan[];
  generateSolutionForContainer: (containerTemplateId: string) => void;
}

export const createSolutionSlice: StateCreator<RootStore, [], [], SolutionSlice> = (set, get) => ({
  solution: null,
  candidateVehiclePlans: [],

  generateSolutionForContainer: (containerTemplateId) => {
    const containerTemplate = get().containerLibrary.find((c) => c.id === containerTemplateId);
    if (!containerTemplate) return;
    const cargoTemplates = get().cargoTemplates;
    const solution = generateSolution(cargoTemplates, containerTemplate);
    // Luôn xem container ĐẦU TIÊN sau khi tạo phương án mới — solution.containers có thể có nhiều
    // hơn 1 phần tử nếu hàng hóa vượt quá 1 container (xem generateSolutions.ts), và lựa
    // chọn/bước mô phỏng của phương án CŨ (nếu có) không còn ý nghĩa gì với phương án vừa tạo.
    set((state) => ({
      solution,
      activeContainerInstanceId: solution.containers[0]?.id ?? null,
      currentStepIndex: 0,
      ui: { ...state.ui, selectedPlacementId: null, rotateModeActive: false },
    }));
  },
});
