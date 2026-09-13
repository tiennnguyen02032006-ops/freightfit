import type { StateCreator } from 'zustand';
import type { ContainerTemplate } from '../../domain/types';
import { STANDARD_CONTAINER_TEMPLATES } from '../../engine/preprocessing/containerSeed';
import type { RootStore } from '../index';

export interface ContainerSlice {
  containerLibrary: ContainerTemplate[];
  selectedContainerTemplateId: string | null;
  addCustomContainer: (template: ContainerTemplate) => void;
  setSelectedContainerTemplateId: (id: string) => void;
}

export const createContainerSlice: StateCreator<RootStore, [], [], ContainerSlice> = (set) => ({
  containerLibrary: STANDARD_CONTAINER_TEMPLATES,
  // Container đang chọn để xem trước trong scene 3D — tách khỏi solution đã tạo, để đổi
  // container luôn phản ánh ngay lên khung nhìn 3D thay vì phải chờ bấm "Tạo phương án".
  selectedContainerTemplateId: STANDARD_CONTAINER_TEMPLATES[0]?.id ?? null,

  addCustomContainer: (template) =>
    set((state) => ({ containerLibrary: [...state.containerLibrary, template] })),

  setSelectedContainerTemplateId: (id) => set({ selectedContainerTemplateId: id }),
});
