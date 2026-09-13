import { create } from 'zustand';
import type { EditHistoryState } from '../domain/types';
import { createContainerSlice, type ContainerSlice } from './slices/containerSlice';
import { createCargoSlice, type CargoSlice } from './slices/cargoSlice';
import { createSolutionSlice, type SolutionSlice } from './slices/solutionSlice';
import { createEditSlice, type EditSlice } from './slices/editSlice';

export interface UiState {
  viewMode: '3D' | 'STATS' | 'STEP_SIMULATION';
  selectedPlacementId: string | null;
  isLoading: boolean;
  // true = đang ở "chế độ xoay" (hiện đủ 3 mũi tên cong X/Y/Z, bấm đầu mũi tên để xoay) cho kiện
  // đang chọn, thay cho chế độ di chuyển mặc định — xem CameraToolbar.tsx/DraggablePlacement.tsx.
  rotateModeActive: boolean;
}

// Phần state chưa dùng ở Phase 1 (activeContainerInstanceId/editHistory/currentStepIndex
// thuộc Phase 2-3), giữ nguyên field theo AppState trong domain/types.ts nhưng không có
// logic engine đi kèm ở phase này.
export interface RootExtraState {
  // id của container ĐANG XEM trong khung 3D khi solution có nhiều hơn 1 container (tự động tính
  // số container cần dùng — xem generateSolutions.ts) — null nếu chưa có solution nào. Đổi qua
  // setActiveContainer (dải tab "Container 1/3"... xem ContainerTabsBar.tsx).
  activeContainerInstanceId: string | null;
  editHistory: EditHistoryState;
  currentStepIndex: number;
  ui: UiState;
  selectPlacement: (placementId: string | null) => void;
  setViewMode: (mode: UiState['viewMode']) => void;
  setCurrentStepIndex: (index: number) => void;
  // Bật/tắt (hoặc đặt thẳng true/false, dùng khi thoát bằng Esc) chế độ xoay cho kiện đang chọn —
  // xem UiState.rotateModeActive.
  toggleRotateMode: () => void;
  setRotateMode: (active: boolean) => void;
  // Chuyển sang xem container KHÁC (khi solution có nhiều container) — các tính năng chỉnh tay
  // (chọn/di chuyển/xoay) và bước mô phỏng đang áp dụng cho container CŨ không còn ý nghĩa gì với
  // container mới (kiện hàng khác hẳn), nên reset kèm theo luôn, tránh mang lựa chọn/trạng thái cũ
  // sang nhầm container mới.
  setActiveContainer: (containerInstanceId: string | null) => void;
}

export type RootStore = ContainerSlice & CargoSlice & SolutionSlice & EditSlice & RootExtraState;

export const useAppStore = create<RootStore>()((set, get, api) => ({
  ...createContainerSlice(set, get, api),
  ...createCargoSlice(set, get, api),
  ...createSolutionSlice(set, get, api),
  ...createEditSlice(set, get, api),

  activeContainerInstanceId: null,
  editHistory: { actions: [], currentIndex: -1 },
  currentStepIndex: 0,
  ui: { viewMode: '3D', selectedPlacementId: null, isLoading: false, rotateModeActive: false },
  // Bỏ chọn kiện hàng (placementId = null) luôn tắt kèm chế độ xoay — mũi tên xoay chỉ có ý nghĩa
  // khi đang chọn đúng 1 kiện, giữ chế độ xoay bật cho 1 lựa chọn "trống" sẽ chỉ gây rối.
  selectPlacement: (placementId) =>
    set((state) => ({
      ui: { ...state.ui, selectedPlacementId: placementId, rotateModeActive: placementId ? state.ui.rotateModeActive : false },
    })),
  toggleRotateMode: () => set((state) => ({ ui: { ...state.ui, rotateModeActive: !state.ui.rotateModeActive } })),
  setRotateMode: (active) => set((state) => ({ ui: { ...state.ui, rotateModeActive: active } })),
  setActiveContainer: (containerInstanceId) =>
    set((state) => ({
      activeContainerInstanceId: containerInstanceId,
      currentStepIndex: 0,
      ui: { ...state.ui, selectedPlacementId: null, rotateModeActive: false },
    })),

  // Bật chế độ mô phỏng ('STEP_SIMULATION') luôn reset về bước 0 (container trống) — điểm bắt
  // đầu tự nhiên của việc "xem lại quá trình xếp hàng từ đầu". Tắt (chuyển về '3D') không cần
  // reset gì thêm vì currentStepIndex chỉ có ý nghĩa khi đang ở chế độ simulation.
  setViewMode: (mode) =>
    set((state) => ({
      ui: { ...state.ui, viewMode: mode },
      currentStepIndex: mode === 'STEP_SIMULATION' ? 0 : state.currentStepIndex,
    })),
  setCurrentStepIndex: (index) => set({ currentStepIndex: index }),
}));
