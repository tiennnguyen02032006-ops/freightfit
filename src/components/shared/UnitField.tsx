import type { ReactNode } from 'react';

interface UnitFieldProps {
  id: string;
  label: string;
  unitLabel: string;
  hint: string;
  error?: string;
  children: (props: { id: string; describedBy: string }) => ReactNode;
}

/** Một ô nhập: nhãn ngắn 1 dòng, ô nhập có đơn vị nằm TRONG ô, dòng giải thích nhỏ, lỗi ngay bên dưới. */
export function UnitField({ id, label, unitLabel, hint, error, children }: UnitFieldProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  return (
    <div className="unit-field">
      <label className="unit-field-label" htmlFor={id}>
        {label}
      </label>
      <div className={`unit-input${error ? ' has-error' : ''}`}>
        {children({ id, describedBy: error ? `${hintId} ${errorId}` : hintId })}
        <span className="unit-input-unit">{unitLabel}</span>
      </div>
      <span className="unit-field-hint" id={hintId}>
        {hint}
      </span>
      {error && (
        <span className="unit-field-error" id={errorId} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
