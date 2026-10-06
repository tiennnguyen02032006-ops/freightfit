import type { PalletTypeId } from '../../domain/types';
import { PALLET_BASE_HEIGHT_MM, PALLET_TYPES } from '../../engine/preprocessing/palletTypes';
import { PALLET_HEIGHT_PLACEHOLDER, validatePalletForm, type PalletFormErrors } from '../../utils/palletForm';
import { SwitchBlock } from '../shared/SwitchBlock';
import { UnitField } from '../shared/UnitField';

export interface PalletFormState {
  palletize: boolean;
  palletType: PalletTypeId;
  palletMaxHeight: string;
  palletMaxWeight: string;
  palletMaxTiers: string;
}

interface PalletFormSectionProps {
  value: PalletFormState;
  unit: 'cm' | 'in' | 'ft';
  onChange: (patch: Partial<PalletFormState>) => void;
  // true sau khi bấm "Thêm hàng"/"Lưu" mà còn lỗi -> hiện cả lỗi "ô còn trống"; trước đó chỉ báo lỗi ô đã nhập.
  showAllErrors: boolean;
}

/**
 * Khối "Xếp lên pallet" của form nhập hàng: tiêu đề + công tắc bật/tắt (SwitchBlock — tắt thì ẩn hẳn các ô bên dưới,
 * bật thì trượt mở), lưới 2 cột với các ô cao bằng nhau; ô "Loại pallet" chiếm nguyên hàng đầu kèm nút chọn nhanh cỡ
 * pallet. Dữ liệu/cách lưu như trước (xem AddCargoPanel.tsx), chỉ đổi cách hiển thị và báo lỗi.
 */
export function PalletFormSection({ value, unit, onChange, showAllErrors }: PalletFormSectionProps) {
  const errors: PalletFormErrors = validatePalletForm(value, unit);
  // Chỉ hiện lỗi của ô khi đã có nội dung (đang gõ sai) hoặc sau khi đã thử gửi form.
  const visible = (key: keyof PalletFormErrors, text: string): string | undefined =>
    errors[key] && (showAllErrors || text.trim() !== '') ? errors[key] : undefined;

  return (
    <SwitchBlock
      title="Xếp lên pallet"
      subtitle="Tự xếp thùng lên pallet theo từng lớp, rồi mới đưa pallet vào container"
      checked={value.palletize}
      onChange={(palletize) => onChange({ palletize })}
    >
      <div className="unit-field unit-field-wide">
        <label className="unit-field-label" htmlFor="pallet-type">
          Loại pallet
        </label>
        <select id="pallet-type" value={value.palletType} onChange={(e) => onChange({ palletType: e.target.value as PalletTypeId })}>
          {PALLET_TYPES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <div className="pallet-quick" role="group" aria-label="Chọn nhanh cỡ pallet">
          {PALLET_TYPES.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`pallet-quick-btn${value.palletType === p.id ? ' is-active' : ''}`}
              aria-pressed={value.palletType === p.id}
              onClick={() => onChange({ palletType: p.id })}
            >
              {p.label.replace(' cm', '')}
            </button>
          ))}
        </div>
        <span className="unit-field-hint">Kích thước mặt pallet (dài × rộng, cm)</span>
      </div>

      <UnitField
        id="pallet-max-height"
        label="Cao tối đa"
        unitLabel={unit}
        hint={`Gồm cả đế pallet (đế cao ${PALLET_BASE_HEIGHT_MM / 10} cm)`}
        error={visible('height', value.palletMaxHeight)}
      >
        {({ id, describedBy }) => (
          <input
            id={id}
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            placeholder={PALLET_HEIGHT_PLACEHOLDER[unit]}
            aria-describedby={describedBy}
            aria-invalid={!!visible('height', value.palletMaxHeight)}
            value={value.palletMaxHeight}
            onChange={(e) => onChange({ palletMaxHeight: e.target.value })}
          />
        )}
      </UnitField>

      <UnitField
        id="pallet-max-weight"
        label="Nặng tối đa"
        unitLabel="kg"
        hint="Chỉ tính hàng, không gồm pallet"
        error={visible('weight', value.palletMaxWeight)}
      >
        {({ id, describedBy }) => (
          <input
            id={id}
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            placeholder="1000"
            aria-describedby={describedBy}
            aria-invalid={!!visible('weight', value.palletMaxWeight)}
            value={value.palletMaxWeight}
            onChange={(e) => onChange({ palletMaxWeight: e.target.value })}
          />
        )}
      </UnitField>

      <UnitField id="pallet-max-tiers" label="Chồng tối đa" unitLabel="tầng" hint="1 = không chồng pallet" error={visible('tiers', value.palletMaxTiers)}>
        {({ id, describedBy }) => (
          <input
            id={id}
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            placeholder="1"
            aria-describedby={describedBy}
            aria-invalid={!!visible('tiers', value.palletMaxTiers)}
            value={value.palletMaxTiers}
            onChange={(e) => onChange({ palletMaxTiers: e.target.value })}
          />
        )}
      </UnitField>

      <div className="pallet-note">
        <span className="pallet-note-title">Cách xếp</span>
        <span className="unit-field-hint">Mỗi pallet chỉ chứa một loại hàng; thùng dư không đủ 1 lớp sẽ xếp rời.</span>
      </div>
    </SwitchBlock>
  );
}
