import { useState } from 'react';
import { useAppStore } from '../../store';
import { computeAllowedOrientations } from '../../engine/preprocessing/orientation';
import { DANGER_CLASSES, SPECIAL_GROUPS, groupLabel, groupKeyOf } from '../../engine/segregation';
import { getPalletType } from '../../engine/preprocessing/palletTypes';
import { hasPalletFormErrors, validatePalletForm } from '../../utils/palletForm';
import { PalletFormSection } from './PalletFormSection';
import { convertToMm, type LengthUnit } from '../../import/parseExcel';
import { generateDistinctColor } from '../../utils/colorBySku';
import { getPersistedSkuColor, setPersistedSkuColor } from '../../utils/skuColorStorage';
import { formatMmAsCm } from '../shared/formatUnits';
import type { CargoShapeType, CargoTemplate, DangerClass, PalletTypeId, PalletizeParams, RotationAxis, SpecialGroup } from '../../domain/types';

const zeroClearance = { left: 0, right: 0, front: 0, back: 0, top: 0, bottom: 0 };

// Đơn vị nhập tay cho L/W/H (và D/H hình trụ): cm/inch/feet, chọn qua dropdown ngay cạnh ô nhập
// (xem field.unit trong form). Đổi đơn vị KHÔNG tự quy đổi số đang hiển thị — chỉ áp dụng đúng
// đơn vị đang chọn TẠI THỜI ĐIỂM LƯU (handleSubmit) khi quy đổi sang mm (đơn vị lưu trữ nội bộ
// thống nhất toàn hệ thống, xem CLAUDE.md), giống cách import/parseExcel.ts convert ngay khi đọc
// file thay vì để rải rác nơi khác.
export type ManualEntryUnit = Extract<LengthUnit, 'cm' | 'in' | 'ft'>;

const emptyForm = {
  sku: '',
  shapeType: 'BOX' as CargoShapeType,
  palletize: false,
  palletType: '120x80' as PalletTypeId,
  palletMaxHeight: '',
  palletMaxWeight: '',
  palletMaxTiers: '1',
  length: '',
  width: '',
  height: '',
  unit: 'cm' as ManualEntryUnit,
  weight: '',
  quantity: '1',
  rotation: 'FULL' as RotationAxis,
  stackable: true,
  fragile: false,
  mustKeepUpright: false,
  maxStackLevel: '',
  maxLoadOnTop: '',
  cargoGroup: 'GENERAL' as 'GENERAL' | SpecialGroup, // nhóm hàng đặc biệt (xem engine/segregation.ts)
  dangerClass: '3', // lớp IMDG 1–9, chỉ dùng khi cargoGroup = DANGEROUS
  customer: '', // khách hàng — màu hàng trong 3D mặc định tô theo khách hàng
  destinationPort: '',
  temperature: '', // nhiệt độ cài đặt °C của hàng lạnh; trống = không phải hàng lạnh (xem engine/reefer.ts)
  tolerance: '', // cm mỗi chiều; trống = dùng dung sai mặc định (xem ToleranceSettingsPanel)
};

export function AddCargoPanel() {
  const cargoTemplates = useAppStore((s) => s.cargoTemplates);
  const addCargoTemplates = useAppStore((s) => s.addCargoTemplates);
  const updateCargoTemplate = useAppStore((s) => s.updateCargoTemplate);
  const removeCargoTemplate = useAppStore((s) => s.removeCargoTemplate);
  const setCargoColor = useAppStore((s) => s.setCargoColor);

  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  // Hiện cả lỗi "ô còn trống" của khối Xếp lên pallet sau khi đã thử gửi form (trước đó chỉ báo lỗi ô đã nhập sai).
  const [showPalletErrors, setShowPalletErrors] = useState(false);
  const [formOpen, setFormOpen] = useState(true);
  // id của template ĐANG SỬA (null = đang ở chế độ thêm mới) — cùng 1 form/state duy nhất cho cả
  // thêm mới và sửa, chỉ khác ở chỗ handleSubmit gọi updateCargoTemplate (giữ nguyên id) thay vì
  // addCargoTemplates (tạo template mới) khi editingId khác null. Xem handleEdit/handleSubmit.
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleCancel = () => {
    setShowPalletErrors(false);
    setForm(emptyForm);
    setError(null);
    setEditingId(null);
    setFormOpen(false);
  };

  // Mở form ở chế độ SỬA cho đúng template `t` — điền lại L/W/H bằng cm (dữ liệu lưu trong mm,
  // xem CLAUDE.md đơn vị thống nhất mm) để người dùng dễ sửa, KHÔNG dùng formatMmAsCm (dành cho
  // hiển thị, trả về chuỗi kiểu vi-VN dùng dấu phẩy thập phân — không parse lại được bằng Number()
  // cho input type="number"), mà chia thẳng cho 10 lấy số thô.
  const handleEdit = (t: CargoTemplate) => {
    setError(null);
    setShowPalletErrors(false);
    setEditingId(t.id);
    setFormOpen(true);
    setForm({
      sku: t.sku,
      shapeType: t.shapeType,
      palletize: t.palletize !== undefined,
      palletType: t.palletize?.palletType ?? '120x80',
      palletMaxHeight: t.palletize ? String(t.palletize.maxHeight / 10) : '',
      palletMaxWeight: t.palletize ? String(t.palletize.maxWeight) : '',
      palletMaxTiers: String(t.palletize?.maxTiers ?? 1),
      length: String(t.length / 10),
      width: String(t.width / 10),
      height: String(t.height / 10),
      unit: 'cm',
      weight: String(t.weight),
      quantity: String(t.quantity),
      rotation: t.rotation,
      stackable: t.stackable,
      fragile: t.fragile,
      mustKeepUpright: t.mustKeepUpright,
      maxStackLevel: t.maxStackLevel != null ? String(t.maxStackLevel) : '',
      maxLoadOnTop: t.maxLoadOnTop != null ? String(t.maxLoadOnTop) : '',
      tolerance: t.tolerance != null ? String(t.tolerance / 10) : '',
      cargoGroup: t.cargoGroup ?? 'GENERAL',
      dangerClass: String(t.dangerClass ?? 3),
      temperature: t.setTemperatureC != null ? String(t.setTemperatureC) : '',
      customer: t.customer ?? '',
      destinationPort: t.destinationPort ?? '',
    });
  };

  const update = <K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const isCylinder = form.shapeType === 'CYLINDER';
    const weight = Number(form.weight);
    const quantity = Number(form.quantity);

    if (!form.sku.trim()) return setError('Thiếu SKU');
    if (!(weight > 0)) return setError('Khối lượng phải > 0');
    if (!(quantity >= 1)) return setError('Số lượng phải >= 1');

    // Hàng bao (BAG) dùng chung ô nhập L/W/H và xếp qua extreme point giống hệt BOX — chỉ khác
    // ở lớp hiển thị 3D (CargoBox3D vẽ hình dáng bao thay vì khối hộp vuông vắn).
    const length = convertToMm(Number(form.length), form.unit);
    // Hình trụ: khối bao quanh là Đường kính x Đường kính x Chiều cao — không có ô W riêng,
    // width luôn bằng đúng length (đường kính) nhập ở trên.
    const width = isCylinder ? length : convertToMm(Number(form.width), form.unit);
    const height = convertToMm(Number(form.height), form.unit);
    if (!(length > 0) || !(width > 0) || !(height > 0)) return setError('Kích thước phải > 0');

    const sku = form.sku.trim();

    // Hàng nguy hiểm phải có lớp IMDG 1–9.
    const temperatureText = form.temperature.trim().replace(',', '.');
    const temperature = Number(temperatureText);
    if (temperatureText !== '' && !Number.isFinite(temperature)) {
      return setError('Nhiệt độ cài đặt phải là số (°C)');
    }
    const dangerClass = Number(form.dangerClass);
    if (form.cargoGroup === 'DANGEROUS' && !(Number.isInteger(dangerClass) && dangerClass >= 1 && dangerClass <= 9)) {
      return setError('Lớp hàng nguy hiểm phải là số nguyên từ 1 đến 9');
    }

    // "Xếp lên pallet": chiều cao tối đa (đơn vị đang chọn, đã gồm đế pallet) + khối lượng tối đa/pallet.
    let palletize: PalletizeParams | undefined;
    if (form.palletize && !isCylinder) {
      // Lỗi hiện ngay dưới từng ô (PalletFormSection); ở đây chỉ chặn gửi form khi còn ô không hợp lệ.
      if (hasPalletFormErrors(validatePalletForm(form, form.unit))) {
        setShowPalletErrors(true);
        return setError('Kiểm tra lại các ô trong khối "Xếp lên pallet"');
      }
      palletize = {
        palletType: form.palletType,
        maxHeight: convertToMm(Number(form.palletMaxHeight), form.unit),
        maxWeight: Number(form.palletMaxWeight),
        maxTiers: Number(form.palletMaxTiers),
      };
    }

    // Màu: chế độ SỬA giữ NGUYÊN màu cũ của template (màu chỉnh riêng qua color picker trong
    // cargo-list, không phải qua form này — xem yêu cầu tính năng chỉ liệt kê các field khác).
    // Chế độ THÊM MỚI: dùng lại màu đã lưu từ trước cho đúng SKU này (nếu có, kể cả sau khi F5),
    // nếu chưa từng có thì tự sinh 1 màu khác các SKU đang hiển thị.
    const editingTemplate = editingId ? cargoTemplates.find((t) => t.id === editingId) : undefined;
    let color: string;
    if (editingTemplate) {
      color = editingTemplate.color;
    } else {
      const persistedColor = getPersistedSkuColor(sku);
      color = persistedColor ?? generateDistinctColor(cargoTemplates.map((t) => t.color));
      if (!persistedColor) setPersistedSkuColor(sku, color);
    }

    // Hình trụ luôn giữ đứng (trục thẳng đứng) bất kể ô "Giữ đứng" — CargoBox3D vẽ hình trụ theo
    // trục Y cố định, xoay nằm ngang sẽ không khớp với khối bao quanh D x D x H đã tính.
    const mustKeepUpright = isCylinder ? true : form.mustKeepUpright;

    const template: CargoTemplate = {
      id: editingId ?? `cargo-manual-${Date.now()}`,
      sku,
      name: sku,
      shapeType: form.shapeType,
      length,
      width,
      height,
      weight,
      quantity,
      rotation: form.rotation,
      allowedOrientations: computeAllowedOrientations(length, width, height, form.rotation, mustKeepUpright),
      color,
      stackable: form.stackable,
      maxStackLevel: form.maxStackLevel ? Number(form.maxStackLevel) : undefined,
      maxLoadOnTop: form.maxLoadOnTop ? Number(form.maxLoadOnTop) : undefined,
      // Dung sai riêng của SKU này (cm -> mm); trống = dùng dung sai mặc định của ToleranceSettings.
      tolerance: form.tolerance.trim() !== '' && Number(form.tolerance) >= 0 ? Math.round(Number(form.tolerance) * 10) : undefined,
      fragile: form.fragile,
      mustKeepUpright,
      clearance: zeroClearance,
      palletize,
      ...(form.customer.trim() ? { customer: form.customer.trim() } : {}),
      ...(form.destinationPort.trim() ? { destinationPort: form.destinationPort.trim() } : {}),
      ...(temperatureText !== '' ? { setTemperatureC: temperature } : {}),
      ...(form.cargoGroup !== 'GENERAL'
        ? { cargoGroup: form.cargoGroup, ...(form.cargoGroup === 'DANGEROUS' ? { dangerClass: dangerClass as DangerClass } : {}) }
        : {}),
    };

    if (editingId) {
      updateCargoTemplate(template);
    } else {
      addCargoTemplates([template]);
    }
    setForm(emptyForm);
    setEditingId(null);
    setShowPalletErrors(false);
  };

  return (
    <div className="panel add-cargo-panel">
      <div className="panel-header">
        <h2>Nhập hàng thủ công</h2>
        <button type="button" className="link-button" onClick={() => setFormOpen((o) => !o)}>
          {formOpen ? 'Thu gọn' : '+ Thêm hàng mới'}
        </button>
      </div>

      {formOpen && (
      <form className="cargo-form" onSubmit={handleSubmit}>
        <div className="field-row">
          <label className="field">
            <span>Tên / Mã hàng (SKU)</span>
            <input value={form.sku} onChange={(e) => update('sku', e.target.value)} />
          </label>
        </div>

        <div className="field-row">
          <div className="field field-sm">
            <span>Hình dạng</span>
            <div className="shape-toggle-row">
              <button
                type="button"
                className={`shape-toggle${form.shapeType === 'BOX' ? ' is-active' : ''}`}
                onClick={() => update('shapeType', 'BOX')}
                aria-pressed={form.shapeType === 'BOX'}
              >
                Hình hộp
              </button>
              <button
                type="button"
                className={`shape-toggle${form.shapeType === 'CYLINDER' ? ' is-active' : ''}`}
                onClick={() => setForm((f) => ({ ...f, shapeType: 'CYLINDER', palletize: false }))}
                aria-pressed={form.shapeType === 'CYLINDER'}
              >
                Hình trụ
              </button>
            </div>
          </div>
        </div>

        <div className="field-row">
          {form.shapeType === 'CYLINDER' ? (
            <>
              <label className="field field-sm field-dim">
                <span>D</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={form.length}
                  onChange={(e) => update('length', e.target.value)}
                />
              </label>
              <label className="field field-sm field-dim">
                <span>H</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={form.height}
                  onChange={(e) => update('height', e.target.value)}
                />
              </label>
            </>
          ) : (
            <>
              <label className="field field-sm field-dim">
                <span>L</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={form.length}
                  onChange={(e) => update('length', e.target.value)}
                />
              </label>
              <label className="field field-sm field-dim">
                <span>W</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={form.width}
                  onChange={(e) => update('width', e.target.value)}
                />
              </label>
              <label className="field field-sm field-dim">
                <span>H</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={form.height}
                  onChange={(e) => update('height', e.target.value)}
                />
              </label>
            </>
          )}
          <select
            className="field-row-unit-select"
            value={form.unit}
            onChange={(e) => update('unit', e.target.value as ManualEntryUnit)}
            aria-label="Đơn vị kích thước"
          >
            <option value="cm">cm</option>
            <option value="in">inch</option>
            <option value="ft">feet</option>
          </select>
        </div>

        {form.shapeType === 'BOX' && (
          <PalletFormSection
            value={form}
            unit={form.unit}
            onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
            showAllErrors={showPalletErrors}
          />
        )}

        <div className="field-row icon-toggle-row">
          <button
            type="button"
            className={`icon-toggle${form.stackable ? ' is-active' : ''}`}
            onClick={() => update('stackable', !form.stackable)}
            title="Cho phép xếp chồng"
            aria-pressed={form.stackable}
            aria-label="Cho phép xếp chồng"
          >
            🧱
          </button>
          <button
            type="button"
            className={`icon-toggle${form.fragile ? ' is-active' : ''}`}
            onClick={() => update('fragile', !form.fragile)}
            title="Dễ vỡ"
            aria-pressed={form.fragile}
            aria-label="Dễ vỡ"
          >
            ❗
          </button>
          <button
            type="button"
            className={`icon-toggle${form.mustKeepUpright ? ' is-active' : ''}`}
            onClick={() => update('mustKeepUpright', !form.mustKeepUpright)}
            title="Giữ đứng"
            aria-pressed={form.mustKeepUpright}
            aria-label="Giữ đứng"
          >
            ⬆️
          </button>
        </div>

        <div className="field-row">
          <label className="field field-sm">
            <span>Khối lượng (kg)</span>
            <input
              type="number"
              min="0"
              step="any"
              value={form.weight}
              onChange={(e) => update('weight', e.target.value)}
            />
          </label>
          <label className="field field-sm">
            <span>Số lượng</span>
            <input type="number" min="1" value={form.quantity} onChange={(e) => update('quantity', e.target.value)} />
          </label>
          <label className="field field-sm">
            <span>Xoay</span>
            <select value={form.rotation} onChange={(e) => update('rotation', e.target.value as RotationAxis)}>
              <option value="NONE">Không xoay</option>
              <option value="YAW">Xoay ngang</option>
              <option value="FULL">Tự do</option>
            </select>
          </label>
        </div>

        <div className="field-row">
          <label className="field field-sm">
            <span>Số tầng xếp tối đa</span>
            <input
              type="number"
              min="0"
              value={form.maxStackLevel}
              onChange={(e) => update('maxStackLevel', e.target.value)}
              placeholder="không giới hạn"
            />
          </label>
          <label className="field field-sm">
            <span>Tải trọng đè lên trên (kg)</span>
            <input
              type="number"
              min="0"
              step="any"
              value={form.maxLoadOnTop}
              onChange={(e) => update('maxLoadOnTop', e.target.value)}
              placeholder="không giới hạn"
            />
          </label>
        </div>

        <div className="field-row">
          <label className="field field-sm">
            <span>Khách hàng</span>
            <input value={form.customer} onChange={(e) => update('customer', e.target.value)} placeholder="tên khách hàng" />
          </label>
          <label className="field field-sm">
            <span>Cảng đích</span>
            <input value={form.destinationPort} onChange={(e) => update('destinationPort', e.target.value)} placeholder="cảng dỡ hàng" />
          </label>
        </div>

        <div className="field-row">
          <label className="field field-sm">
            <span>Nhóm hàng</span>
            <select value={form.cargoGroup} onChange={(e) => update('cargoGroup', e.target.value as 'GENERAL' | SpecialGroup)}>
              {SPECIAL_GROUPS.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
          {form.cargoGroup === 'DANGEROUS' && (
            <label className="field field-sm">
              <span>Lớp (IMDG)</span>
              <select value={form.dangerClass} onChange={(e) => update('dangerClass', e.target.value)}>
                {DANGER_CLASSES.map((c) => (
                  <option key={c} value={String(c)}>
                    Lớp {c}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field field-sm">
            <span>Nhiệt độ cài đặt (°C)</span>
            <input
              type="number"
              step="0.5"
              value={form.temperature}
              onChange={(e) => update('temperature', e.target.value)}
              placeholder="hàng thường: để trống"
            />
          </label>
        </div>

        <div className="field-row">
          <label className="field field-sm">
            <span>Dung sai kích thước (cm/chiều)</span>
            <input
              type="number"
              min="0"
              step="0.1"
              value={form.tolerance}
              onChange={(e) => update('tolerance', e.target.value)}
              placeholder="mặc định"
            />
          </label>
        </div>

        {error && <p className="form-error">{error}</p>}

        <div className="form-actions">
          <button type="button" onClick={handleCancel}>
            Hủy
          </button>
          <button type="submit" className="primary">
            {editingId ? 'Lưu thay đổi' : '+ Thêm hàng'}
          </button>
        </div>
      </form>
      )}

      {cargoTemplates.length > 0 && (
        <ul className="cargo-list">
          {cargoTemplates.map((t) => (
            <li key={t.id} className="cargo-list-item">
              <input
                type="color"
                className="cargo-list-color-input"
                value={t.color}
                onChange={(e) => setCargoColor(t.sku, e.target.value)}
                title={`Đổi màu cho SKU ${t.sku}`}
                aria-label={`Đổi màu cho SKU ${t.sku}`}
              />
              <div className="cargo-list-info">
                <strong>
                  {t.sku}
                  {t.palletize && (
                    <span className="cargo-list-pallet-badge"> 🟫 Xếp lên pallet {getPalletType(t.palletize.palletType).label}</span>
                  )}
                </strong>
                <span>
                  {formatMmAsCm(t.length)}×{formatMmAsCm(t.width)}×{formatMmAsCm(t.height)} cm · {t.weight} kg{t.tolerance != null ? ` · dung sai ${t.tolerance / 10} cm` : ''}{t.cargoGroup ? ` · ${groupLabel(groupKeyOf(t))}` : ''}{t.customer ? ` · KH ${t.customer}` : ''}{t.destinationPort ? ` · cảng ${t.destinationPort}` : ''}{t.setTemperatureC != null ? ` · lạnh ${t.setTemperatureC} °C` : ''} · SL{' '}
                  {t.quantity}
                </span>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => handleEdit(t)}
                aria-label={`Sửa ${t.sku}`}
                title="Sửa"
              >
                ✏️
              </button>
              <button type="button" className="icon-button" onClick={() => removeCargoTemplate(t.id)} aria-label="Xóa">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
