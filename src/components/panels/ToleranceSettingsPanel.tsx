import { useState } from 'react';
import { useAppStore } from '../../store';
import { mmToCmText, parseToleranceCm } from '../../utils/toleranceForm';
import { SwitchBlock } from '../shared/SwitchBlock';
import { UnitField } from '../shared/UnitField';

/**
 * Cấu hình dung sai xếp hàng (xem engine/tolerance.ts): công tắc bật/tắt (tắt thì ẩn hẳn các ô, bật thì trượt mở),
 * dung sai mặc định mỗi chiều của thùng (chỉnh riêng từng SKU ở form nhập hàng) và khe giữa các pallet / giữa pallet với
 * vách container. Dung sai được cộng vào trường clearance sẵn có khi xếp (kiểm tra va chạm, số thùng mỗi lớp, vừa
 * pallet); 3D vẫn vẽ kích thước thật. Thay đổi có tác dụng ở lần "Tạo phương án xếp hàng" kế tiếp.
 *
 * Ô nhập giữ bản nháp dạng chữ: chỉ ghi vào store khi giá trị hợp lệ (số >= 0); giá trị sai báo lỗi ngay dưới ô và store
 * giữ lại giá trị hợp lệ gần nhất. Tắt rồi bật lại không mất giá trị đã nhập (bản nháp và store đều còn nguyên).
 */
export function ToleranceSettingsPanel() {
  const tolerance = useAppStore((s) => s.tolerance);
  const setTolerance = useAppStore((s) => s.setTolerance);

  const [drafts, setDrafts] = useState({
    dimension: mmToCmText(tolerance.defaultDimensionTolerance),
    gap: mmToCmText(tolerance.palletGap),
  });

  const dimension = parseToleranceCm(drafts.dimension);
  const gap = parseToleranceCm(drafts.gap);

  const onDimensionChange = (text: string) => {
    setDrafts((d) => ({ ...d, dimension: text }));
    const parsed = parseToleranceCm(text);
    if (parsed.ok) setTolerance({ defaultDimensionTolerance: parsed.mm });
  };
  const onGapChange = (text: string) => {
    setDrafts((d) => ({ ...d, gap: text }));
    const parsed = parseToleranceCm(text);
    if (parsed.ok) setTolerance({ palletGap: parsed.mm });
  };

  return (
    <div className="panel tolerance-panel">
      <SwitchBlock
        flush
        title="Dung sai xếp hàng"
        subtitle="Chừa thêm chỗ cho thùng phồng và khe giữa các pallet khi xếp"
        checked={tolerance.enabled}
        onChange={(enabled) => setTolerance({ enabled })}
      >
        <UnitField
          id="tolerance-dimension"
          label="Dung sai thùng"
          unitLabel="cm/chiều"
          hint="Thùng carton thường phồng thêm 1 đến 2 cm"
          error={dimension.ok ? undefined : dimension.error}
        >
          {({ id, describedBy }) => (
            <input
              id={id}
              type="number"
              min="0"
              step="0.1"
              inputMode="decimal"
              placeholder="1.5"
              aria-describedby={describedBy}
              aria-invalid={!dimension.ok}
              value={drafts.dimension}
              onChange={(e) => onDimensionChange(e.target.value)}
            />
          )}
        </UnitField>

        <UnitField
          id="tolerance-gap"
          label="Khe pallet–vách"
          unitLabel="cm"
          hint="Khe giữa hai pallet và giữa pallet với vách container"
          error={gap.ok ? undefined : gap.error}
        >
          {({ id, describedBy }) => (
            <input
              id={id}
              type="number"
              min="0"
              step="0.1"
              inputMode="decimal"
              placeholder="3"
              aria-describedby={describedBy}
              aria-invalid={!gap.ok}
              value={drafts.gap}
              onChange={(e) => onGapChange(e.target.value)}
            />
          )}
        </UnitField>
      </SwitchBlock>
    </div>
  );
}
