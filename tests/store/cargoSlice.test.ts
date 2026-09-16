import { describe, expect, it } from 'vitest';
import { useAppStore } from '../../src/store';
import type { CargoTemplate } from '../../src/domain/types';
import { makeCargoTemplate } from '../fixtures/cargo';

describe('removeCargoTemplate (store)', () => {
  it('xóa 1 loại hàng đã có trong phương án -> kiện hàng của loại đó biến mất khỏi kết quả xếp, không còn placement nào tham chiếu tới nó', () => {
    const containerTemplate = useAppStore.getState().containerLibrary[0];
    expect(containerTemplate).toBeDefined();

    useAppStore.getState().addCargoTemplates([
      makeCargoTemplate({ id: 'cargo-keep', sku: 'KEEP', quantity: 1 }),
      makeCargoTemplate({ id: 'cargo-to-remove', sku: 'REMOVE-ME', quantity: 2 }),
    ]);

    useAppStore.getState().generateSolutionForContainer(containerTemplate.id);

    const placementsBefore =
      useAppStore.getState().solution?.containers.flatMap((c) => c.placements) ?? [];
    // Phương án phải thật sự chứa placement của cargo sắp bị xóa, nếu không test không có ý nghĩa.
    expect(placementsBefore.some((p) => p.cargoTemplateId === 'cargo-to-remove')).toBe(true);

    useAppStore.getState().removeCargoTemplate('cargo-to-remove');

    const state = useAppStore.getState();
    expect(state.cargoTemplates.some((t) => t.id === 'cargo-to-remove')).toBe(false);

    // Bug đã sửa: trước đây solution không được tính lại, nên placement cũ của SKU đã xóa vẫn
    // còn nguyên trong container.placements (chỉ đổi màu xám do template lookup ra undefined).
    const placementsAfter = state.solution?.containers.flatMap((c) => c.placements) ?? [];
    expect(placementsAfter.some((p) => p.cargoTemplateId === 'cargo-to-remove')).toBe(false);
    // Hàng còn lại (không bị xóa) vẫn phải được xếp lại bình thường, không bị xóa nhầm theo.
    expect(placementsAfter.some((p) => p.cargoTemplateId === 'cargo-keep')).toBe(true);
  });
});

describe('updateCargoTemplate (store)', () => {
  it('sửa 1 loại hàng đã có trong phương án -> giữ nguyên id (không tạo thêm template mới), phương án tính lại ngay theo dữ liệu mới', () => {
    const containerTemplate = useAppStore.getState().containerLibrary[0];
    expect(containerTemplate).toBeDefined();

    const original: CargoTemplate = makeCargoTemplate({
      id: 'cargo-to-update',
      sku: 'UPDATE-ME',
      quantity: 1,
      length: 400,
      width: 300,
      height: 200,
      allowedOrientations: [[400, 300, 200]],
    });
    useAppStore.getState().addCargoTemplates([original]);
    useAppStore.getState().generateSolutionForContainer(containerTemplate.id);

    const placementsBefore =
      useAppStore.getState().solution?.containers.flatMap((c) => c.placements) ?? [];
    const placementBefore = placementsBefore.find((p) => p.cargoTemplateId === 'cargo-to-update');
    // Phương án phải thật sự chứa placement của cargo sắp sửa, nếu không test không có ý nghĩa.
    expect(placementBefore).toBeDefined();
    expect(placementBefore?.length).toBe(400);

    // Đổi kích thước LỚN HƠN HẲN (400 -> 900mm) để chắc chắn phân biệt được placement cũ/mới.
    const updated: CargoTemplate = { ...original, length: 900, allowedOrientations: [[900, 300, 200]] };
    useAppStore.getState().updateCargoTemplate(updated);

    const state = useAppStore.getState();
    // Không tạo thêm template mới -> đúng 1 phần tử id 'cargo-to-update', kích thước đã đổi.
    expect(state.cargoTemplates.filter((t) => t.id === 'cargo-to-update')).toHaveLength(1);
    expect(state.cargoTemplates.find((t) => t.id === 'cargo-to-update')?.length).toBe(900);

    // Bug tương tự removeCargoTemplate: nếu không tính lại solution, khung 3D vẫn vẽ placement
    // theo kích thước CŨ (400mm) vì container.placements là kết quả pack sẵn, không đọc trực tiếp
    // cargoTemplates.
    const placementsAfter = state.solution?.containers.flatMap((c) => c.placements) ?? [];
    const placementAfter = placementsAfter.find((p) => p.cargoTemplateId === 'cargo-to-update');
    expect(placementAfter).toBeDefined();
    expect(placementAfter?.length).toBe(900);
  });
});
