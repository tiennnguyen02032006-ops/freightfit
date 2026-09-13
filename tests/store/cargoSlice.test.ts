import { describe, expect, it } from 'vitest';
import { useAppStore } from '../../src/store';
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
