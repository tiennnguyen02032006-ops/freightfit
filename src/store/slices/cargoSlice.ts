import type { StateCreator } from 'zustand';
import type { CargoImportRow, CargoTemplate } from '../../domain/types';
import { setPersistedSkuColor } from '../../utils/skuColorStorage';
import type { RootStore } from '../index';

export interface CargoSlice {
  cargoImportRows: CargoImportRow[];
  cargoTemplates: CargoTemplate[];
  setImportRows: (rows: CargoImportRow[]) => void;
  addCargoTemplates: (templates: CargoTemplate[]) => void;
  removeCargoTemplate: (id: string) => void;
  setCargoColor: (sku: string, color: string) => void;
}

export const createCargoSlice: StateCreator<RootStore, [], [], CargoSlice> = (set, get) => ({
  cargoImportRows: [],
  cargoTemplates: [],

  setImportRows: (rows) => set({ cargoImportRows: rows }),

  addCargoTemplates: (templates) =>
    set((state) => ({ cargoTemplates: [...state.cargoTemplates, ...templates] })),

  // BUG đã sửa: trước đây chỉ lọc bỏ template khỏi cargoTemplates, không đụng gì tới `solution`
  // — nhưng khung 3D (ContainerScene) vẽ hàng hóa từ `container.placements` của solution ĐÃ TẠO
  // SẴN (packing result), không phải từ cargoTemplates trực tiếp. Placement cũ của SKU vừa xóa
  // vẫn còn nguyên trong solution -> kiện hàng KHÔNG biến mất, chỉ chuyển sang màu xám (xem
  // CargoBox3D.tsx: `template?.color ?? '#999999'` — template lookup trả về undefined vì
  // cargoTemplateId đó không còn tồn tại trong cargoTemplates nữa).
  //
  // Cách sửa: nếu đã từng bấm "Tạo phương án xếp hàng" (đã có solution), tính lại NGAY phương án
  // cho đúng container đó sau khi xóa — vừa loại bỏ hẳn placement của SKU đã xóa khỏi khung 3D,
  // vừa cập nhật lại đúng thống kê (volumeFillPercent, unfitCargo...) thay vì để số liệu cũ sai
  // lệch. Nếu chưa từng tạo phương án (solution null) thì không có gì để tính lại.
  removeCargoTemplate: (id) => {
    set((state) => ({ cargoTemplates: state.cargoTemplates.filter((t) => t.id !== id) }));

    const { solution, generateSolutionForContainer } = get();
    const containerTemplateId = solution?.containers[0]?.templateId;
    if (containerTemplateId) {
      generateSolutionForContainer(containerTemplateId);
    }
  },

  // Đổi màu áp dụng cho MỌI template cùng SKU (1 loại hàng = 1 màu) và lưu lại vào localStorage
  // để lần sau thêm/import lại đúng SKU này thì màu cũ tự động được dùng lại.
  setCargoColor: (sku, color) => {
    setPersistedSkuColor(sku, color);
    set((state) => ({
      cargoTemplates: state.cargoTemplates.map((t) => (t.sku === sku ? { ...t, color } : t)),
    }));
  },
});
