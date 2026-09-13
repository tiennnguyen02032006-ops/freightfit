import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../store';
import type { ContainerTemplate } from '../../domain/types';
import { formatMmAsCm, formatNumber } from '../shared/formatUnits';

const emptyCustomForm = { name: '', innerLength: '', innerWidth: '', innerHeight: '', maxPayload: '' };

interface ContainerPickerProps {
  label: string;
}

/**
 * Thay cho ContainerLibraryPanel cố định ở cột trái (đã bỏ) — cùng logic chọn container /
 * thêm container custom hệt như cũ, chỉ đổi chỗ hiển thị: giờ là dropdown xổ ra từ chính dòng
 * tên container trong SceneStatsBar. Không đổi cách hoạt động (đọc/ghi store y hệt).
 */
export function ContainerPicker({ label }: ContainerPickerProps) {
  const containerLibrary = useAppStore((s) => s.containerLibrary);
  const addCustomContainer = useAppStore((s) => s.addCustomContainer);
  const selectedId = useAppStore((s) => s.selectedContainerTemplateId);
  const setSelectedId = useAppStore((s) => s.setSelectedContainerTemplateId);

  const [open, setOpen] = useState(false);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customForm, setCustomForm] = useState(emptyCustomForm);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowCustomForm(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setShowCustomForm(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setOpen(false);
    setShowCustomForm(false);
  };

  const handleAddCustom = () => {
    const innerLength = Number(customForm.innerLength);
    const innerWidth = Number(customForm.innerWidth);
    const innerHeight = Number(customForm.innerHeight);
    const maxPayload = Number(customForm.maxPayload);
    if (!customForm.name || !(innerLength > 0) || !(innerWidth > 0) || !(innerHeight > 0) || !(maxPayload > 0)) {
      return;
    }
    const template: ContainerTemplate = {
      id: `custom-${Date.now()}`,
      name: customForm.name,
      standardType: 'CUSTOM_TRUCK',
      innerLength,
      innerWidth,
      innerHeight,
      maxPayload,
      isCustom: true,
    };
    addCustomContainer(template);
    setSelectedId(template.id);
    setCustomForm(emptyCustomForm);
    setShowCustomForm(false);
    setOpen(false);
  };

  const handleCancelCustom = () => {
    setCustomForm(emptyCustomForm);
    setShowCustomForm(false);
  };

  return (
    <div className="container-picker" ref={rootRef}>
      <button
        type="button"
        className="container-picker-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="scene-stats-bar-title">{label}</span>
        <span className="container-picker-caret" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="container-picker-dropdown">
          <ul className="container-picker-list">
            {containerLibrary.map((template) => (
              <li key={template.id}>
                <button
                  type="button"
                  className={`container-picker-option${selectedId === template.id ? ' is-selected' : ''}`}
                  onClick={() => handleSelect(template.id)}
                >
                  <span>
                    {template.name} ({formatMmAsCm(template.innerLength)}×{formatMmAsCm(template.innerWidth)}×
                    {formatMmAsCm(template.innerHeight)} cm, {formatNumber(template.maxPayload, 0)} kg)
                  </span>
                  {template.notes && <span className="container-picker-option-note">{template.notes}</span>}
                </button>
              </li>
            ))}
          </ul>

          {showCustomForm ? (
            <div className="custom-container-form">
              <input
                placeholder="Tên container"
                value={customForm.name}
                onChange={(e) => setCustomForm({ ...customForm, name: e.target.value })}
              />
              <input
                placeholder="Dài (mm)"
                value={customForm.innerLength}
                onChange={(e) => setCustomForm({ ...customForm, innerLength: e.target.value })}
              />
              <input
                placeholder="Rộng (mm)"
                value={customForm.innerWidth}
                onChange={(e) => setCustomForm({ ...customForm, innerWidth: e.target.value })}
              />
              <input
                placeholder="Cao (mm)"
                value={customForm.innerHeight}
                onChange={(e) => setCustomForm({ ...customForm, innerHeight: e.target.value })}
              />
              <input
                placeholder="Tải trọng tối đa (kg)"
                value={customForm.maxPayload}
                onChange={(e) => setCustomForm({ ...customForm, maxPayload: e.target.value })}
              />
              <div className="form-actions">
                <button type="button" onClick={handleCancelCustom}>
                  Hủy
                </button>
                <button type="button" className="primary" onClick={handleAddCustom}>
                  Lưu custom
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setShowCustomForm(true)}>
              + Thêm container custom
            </button>
          )}
        </div>
      )}
    </div>
  );
}
