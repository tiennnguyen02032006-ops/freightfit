import type { StateCreator } from 'zustand';
import type { CargoImportRow, CargoTemplate } from '../../domain/types';
import { setPersistedSkuColor } from '../../utils/skuColorStorage';
import type { RootStore } from '../index';

export interface CargoSlice {
  cargoImportRows: CargoImportRow[];
  cargoTemplates: CargoTemplate[];
  setImportRows: (rows: CargoImportRow[]) => void;
  addCargoTemplates: (templates: CargoTemplate[]) => void;
  updateCargoTemplate: (template: CargoTemplate) => void;
  removeCargoTemplate: (id: string) => void;
  setCargoColor: (sku: string, color: string) => void;
}

export const createCargoSlice: StateCreator<RootStore, [], [], CargoSlice> = (set, get) => ({
  cargoImportRows: [],
  cargoTemplates: [],

  setImportRows: (rows) => set({ cargoImportRows: rows }),

  // BUG đã sửa: thêm hàng mới KHÔNG tự tính lại phương án (người dùng có thể muốn thêm nhiều đợt
  // rồi mới bấm "Tạo phương án xếp hàng" 1 lần) — nhưng `lastContainerSuggestion` (gợi ý đổi
  // container/xe cho container cuối) đã tính SẴN dựa trên bộ cargoTemplates CŨ, trước khi có hàng
  // mới này. Nếu để nguyên, bấm "Áp dụng" gợi ý cũ sẽ pack lại đúng container cuối (không đổi, chỉ
  // dùng lại y nguyên placements cũ) nên KHÔNG bị sai bởi hàng mới thêm — nhưng để nhất quán với
  // nguyên tắc "mọi thay đổi cargoTemplates phải làm mất hiệu lực gợi ý cũ" (tránh mọi khả năng gợi
  // ý lỗi thời dù hiện tại hay sau này), xóa gợi ý ngay khi thêm hàng — buộc người dùng tạo lại
  // phương án để có gợi ý mới đúng với bộ hàng đầy đủ.
  addCargoTemplates: (templates) =>
    set((state) => ({ cargoTemplates: [...state.cargoTemplates, ...templates], lastContainerSuggestion: null })),

  // Cập nhật ĐÚNG 1 template đã có (giữ nguyên `id`) thay vì tạo thêm 1 template mới — dùng khi
  // sửa hàng đã nhập qua AddCargoPanel.tsx (nút bút chì trong cargo-list, mở lại chính form nhập
  // tay, điền sẵn dữ liệu cũ). Cùng lý do BUG đã giải thích ở removeCargoTemplate ngay dưới đây:
  // khung 3D vẽ theo `solution.containers[].placements` (kết quả pack SẴN), không đọc trực tiếp
  // cargoTemplates, nên sửa xong phải tính lại phương án ngay để kích thước/khối lượng mới phản
  // ánh đúng lên khung 3D thay vì vẫn hiện placement theo dữ liệu cũ.
  updateCargoTemplate: (template) => {
    set((state) => ({
      cargoTemplates: state.cargoTemplates.map((t) => (t.id === template.id ? template : t)),
    }));

    const { solution, generateSolutionForContainer } = get();
    const containerTemplateId = solution?.containers[0]?.templateId;
    if (containerTemplateId) {
      generateSolutionForContainer(containerTemplateId);
    }
  },

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
