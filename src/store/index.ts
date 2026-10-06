import { create } from 'zustand';
import type { EditHistoryState, SegregationRule, ToleranceSettings } from '../domain/types';
import { DEFAULT_TOLERANCE_SETTINGS } from '../engine/config';
import { DEFAULT_SEGREGATION_RULES } from '../engine/segregation';
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
  // Thùng đang chọn trong 1 pallet (xem domain/types.ts AppState.ui.selectedBoxId) — luôn bị xóa khi
  // đổi/bỏ chọn kiện qua selectPlacement; chỉ selectPalletBox mới đặt giá trị.
  selectedBoxId: string | null;
  // Hiện lớp "Chèn lót" trong khung 3D (mặc định true) — xem domain/types.ts AppState.ui.showDunnage.
  showDunnage: boolean;
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
  // Dung sai xếp hàng (bật/tắt, dung sai mặc định mỗi chiều của thùng, khe pallet–pallet/vách) — mặc định bật
  // với thùng 1,5 cm và khe 3 cm (xem engine/tolerance.ts). Đổi ở đây chỉ có tác dụng ở lần "Tạo phương án" kế tiếp.
  tolerance: ToleranceSettings;
  setTolerance: (patch: Partial<ToleranceSettings>) => void;
  // Bảng quy tắc "nhóm nào không được chung container" (xem engine/segregation.ts) — người dùng chỉnh được; mặc định chỉ là
  // vài cặp ví dụ, phải đối chiếu quy định IMDG hiện hành. Chỉ có tác dụng ở lần "Tạo phương án" kế tiếp.
  segregationRules: SegregationRule[];
  setSegregationRules: (rules: SegregationRule[]) => void;
  selectPlacement: (placementId: string | null) => void;
  // Chọn 1 thùng trong pallet (gọi SAU selectPlacement của pallet chứa nó).
  selectPalletBox: (boxId: string | null) => void;
  toggleDunnage: () => void;
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
  tolerance: DEFAULT_TOLERANCE_SETTINGS,
  setTolerance: (patch) => set((state) => ({ tolerance: { ...state.tolerance, ...patch } })),
  segregationRules: DEFAULT_SEGREGATION_RULES,
  setSegregationRules: (rules) => set({ segregationRules: rules }),
  ui: { viewMode: '3D', selectedPlacementId: null, selectedBoxId: null, showDunnage: true, isLoading: false, rotateModeActive: false },
  // Bỏ chọn kiện hàng (placementId = null) luôn tắt kèm chế độ xoay — mũi tên xoay chỉ có ý nghĩa
  // khi đang chọn đúng 1 kiện, giữ chế độ xoay bật cho 1 lựa chọn "trống" sẽ chỉ gây rối.
  selectPlacement: (placementId) =>
    set((state) => ({
      ui: {
        ...state.ui,
        selectedPlacementId: placementId,
        selectedBoxId: null,
        rotateModeActive: placementId ? state.ui.rotateModeActive : false,
      },
    })),
  toggleDunnage: () => set((state) => ({ ui: { ...state.ui, showDunnage: !state.ui.showDunnage } })),
  selectPalletBox: (boxId) => set((state) => ({ ui: { ...state.ui, selectedBoxId: boxId } })),
  toggleRotateMode: () => set((state) => ({ ui: { ...state.ui, rotateModeActive: !state.ui.rotateModeActive } })),
  setRotateMode: (active) => set((state) => ({ ui: { ...state.ui, rotateModeActive: active } })),
  setActiveContainer: (containerInstanceId) =>
    set((state) => ({
      activeContainerInstanceId: containerInstanceId,
      currentStepIndex: 0,
      ui: { ...state.ui, selectedPlacementId: null, selectedBoxId: null, rotateModeActive: false },
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
