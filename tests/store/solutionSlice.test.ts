import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../../src/store';
import { makeCargoTemplate } from '../fixtures/cargo';

// Bối cảnh cả 2 describe dưới đây: 20ft Standard (std-20ft, maxPayload 28280kg) chỉ chở vừa 14
// kiện 500x500x500mm nặng 2000kg/kiện (14*2000=28000 <= 28280, phần thể tích rất nhỏ nên KHÔNG
// phải yếu tố giới hạn) — dùng 44 kiện (14*3 + 2 dư) để container cuối chỉ còn 2 kiện (4000kg,
// ~14% tải trọng std-20ft) -> suggestBetterContainer() gợi ý đổi sang xe tải nhỏ (Isuzu 5.5 tấn,
// maxPayload 5500kg, xem containerSeed.ts) — đúng kịch bản báo lỗi "Áp dụng không phản ứng".
//
// cargoTemplates KHÔNG tự reset giữa các test (store là 1 instance singleton dùng chung, giống
// cargoSlice.test.ts) — phải tự dọn về rỗng ở beforeEach, nếu không addCargoTemplates() tích lũy
// dần qua từng test sẽ làm lệch hẳn kết quả pack (và trùng id nếu cùng dùng 'suggestion-cargo').
beforeEach(() => {
  useAppStore.setState({ cargoTemplates: [], solution: null, lastContainerSuggestion: null, editNotice: null });
});

function seedLowFillLastContainer() {
  useAppStore.getState().addCargoTemplates([
    makeCargoTemplate({
      id: 'suggestion-cargo',
      sku: 'SUGGESTION-BOX',
      length: 500,
      width: 500,
      height: 500,
      weight: 2000,
      quantity: 44,
      allowedOrientations: [[500, 500, 500]],
    }),
  ]);
  useAppStore.getState().generateSolutionForContainer('std-20ft');
}

describe('applyContainerSuggestion (store)', () => {
  it('dữ liệu nhất quán -> áp dụng thành công, container cuối đổi sang template được gợi ý, không có editNotice', () => {
    seedLowFillLastContainer();
    const before = useAppStore.getState();
    expect(before.lastContainerSuggestion).not.toBeNull();
    const suggestedId = before.lastContainerSuggestion!.suggestedTemplateId;

    useAppStore.getState().applyContainerSuggestion();

    const after = useAppStore.getState();
    expect(after.editNotice).toBeNull();
    expect(after.lastContainerSuggestion).toBeNull();
    const lastContainer = after.solution!.containers[after.solution!.containers.length - 1];
    expect(lastContainer.templateId).toBe(suggestedId);
  });

  it('không có solution/gợi ý nào -> set editNotice rõ ràng thay vì im lặng', () => {
    useAppStore.setState({ solution: null, lastContainerSuggestion: null, editNotice: null });
    useAppStore.getState().applyContainerSuggestion();
    expect(useAppStore.getState().editNotice).not.toBeNull();
  });

  // BUG đã sửa: lastContainerSuggestion được tính SẴN dựa trên cargoTemplates tại lúc
  // generateSolutionForContainer chạy — nếu dữ liệu cargoTemplates "trôi" khỏi solution hiện tại
  // (vd 1 cargoTemplate đang có mặt trong container cuối bị đổi weight qua 1 đường không tự tính
  // lại phương án) thì packContainer() lúc bấm "Áp dụng" có thể unfit dù lúc gợi ý đã xác nhận vừa
  // khít — trước đây hàm chỉ `return` im lặng ở đây, nút "Áp dụng" nhìn như không phản ứng gì.
  it('cargoTemplates trôi khỏi solution hiện tại (gợi ý lỗi thời) -> set editNotice rõ ràng, không âm thầm return', () => {
    seedLowFillLastContainer();
    expect(useAppStore.getState().lastContainerSuggestion).not.toBeNull();

    // Mô phỏng dữ liệu trôi: đổi thẳng weight của cargoTemplate đang nằm trong container cuối lên
    // mức vượt quá maxPayload của xe tải được gợi ý (5500kg), KHÔNG qua updateCargoTemplate (hàm
    // đó tự tính lại phương án ngay nên sẽ tự làm mới gợi ý, không tái hiện được tình huống lỗi
    // thời) — đại diện cho MỌI đường đi trong tương lai có thể làm cargoTemplates lệch khỏi
    // solution hiện tại mà không refresh lastContainerSuggestion.
    useAppStore.setState((s) => ({
      cargoTemplates: s.cargoTemplates.map((t) =>
        t.id === 'suggestion-cargo' ? { ...t, weight: 4000 } : t,
      ),
    }));

    const solutionBefore = useAppStore.getState().solution;
    useAppStore.getState().applyContainerSuggestion();

    const after = useAppStore.getState();
    expect(after.editNotice).not.toBeNull();
    expect(after.lastContainerSuggestion).toBeNull();
    // Không áp dụng dở dang — solution giữ nguyên như trước khi bấm.
    expect(after.solution).toBe(solutionBefore);
  });

  it('addCargoTemplates thêm hàng mới -> xóa gợi ý cũ (tránh áp dụng gợi ý tính từ bộ hàng đã lỗi thời)', () => {
    seedLowFillLastContainer();
    expect(useAppStore.getState().lastContainerSuggestion).not.toBeNull();

    useAppStore.getState().addCargoTemplates([makeCargoTemplate({ id: 'extra-cargo', sku: 'EXTRA', quantity: 1 })]);

    expect(useAppStore.getState().lastContainerSuggestion).toBeNull();
  });

  it('áp dụng thành công -> selectedContainerTemplateId tự đổi sang đúng loại vừa áp dụng, các container KHÁC (chưa đổi) vẫn hiển thị đầy đủ', () => {
    seedLowFillLastContainer();
    const suggestedId = useAppStore.getState().lastContainerSuggestion!.suggestedTemplateId;
    // Có ít nhất 1 container KHÁC container cuối, vẫn giữ template cũ ('std-20ft') sau khi áp dụng
    // — nếu không có, không thể kiểm tra được việc solution giờ có NHIỀU template khác nhau.
    const containersBefore = useAppStore.getState().solution!.containers;
    expect(containersBefore.length).toBeGreaterThan(1);

    useAppStore.getState().applyContainerSuggestion();

    const after = useAppStore.getState();
    expect(after.selectedContainerTemplateId).toBe(suggestedId);
    const containers = after.solution!.containers;
    // Solution giờ có 2 loại template khác nhau (các container trước vẫn 'std-20ft', container
    // cuối đã đổi sang suggestedId) — BUG có thể xảy ra: nếu component chỉ so template của
    // containers[0] với selectedContainerTemplateId (giờ đã đổi sang suggestedId) để quyết định có
    // hiển thị solution hay không, nó sẽ ẩn nhầm TOÀN BỘ hàng hóa. Test này chỉ kiểm tra đúng dữ
    // liệu store (containers[0] vẫn 'std-20ft', không bị mất/đổi nhầm) — phần hiển thị 3D
    // (ContainerScene.tsx solutionContainers) được sửa riêng để không còn phụ thuộc single-template
    // assumption này.
    expect(containers[0].templateId).toBe('std-20ft');
    expect(containers[containers.length - 1].templateId).toBe(suggestedId);
  });
});
