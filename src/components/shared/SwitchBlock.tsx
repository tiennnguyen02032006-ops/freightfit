import { useId, type ReactNode } from 'react';

interface SwitchBlockProps {
  title: string;
  subtitle: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  // true = không viền/nền riêng (khi khối đã nằm trong 1 panel có khung sẵn)
  flush?: boolean;
  children: ReactNode;
}

/**
 * Khối có tiêu đề + dòng mô tả + công tắc bật/tắt. Phần chi tiết (children, nằm trong <fieldset>) ẨN HẲN khi tắt và
 * trượt mở mượt khi bật (CSS grid 0fr -> 1fr). Giá trị các ô nằm ở state của nơi dùng nên được giữ nguyên khi bật/tắt
 * qua lại; khi đóng, nội dung không focus/nhập được (visibility: hidden + fieldset disabled).
 */
export function SwitchBlock({ title, subtitle, checked, onChange, flush = false, children }: SwitchBlockProps) {
  const uid = useId();
  const titleId = `${uid}-title`;
  const detailsId = `${uid}-details`;

  return (
    <section
      className={`switch-block${checked ? ' is-on' : ''}${flush ? ' switch-block--flush' : ''}`}
      aria-labelledby={titleId}
      style={{ containerType: 'inline-size' }}
    >
      <div className="switch-block-head">
        <div className="switch-block-titles">
          <h3 id={titleId}>{title}</h3>
          <span className="switch-block-sub">{subtitle}</span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-labelledby={titleId}
          aria-controls={detailsId}
          className="switch-toggle"
          onClick={() => onChange(!checked)}
        >
          <span className="switch-toggle-knob" />
        </button>
      </div>

      <div className={`switch-collapse${checked ? ' is-open' : ''}`} id={detailsId}>
        <div className="switch-collapse-inner">
          <div className="switch-collapse-pad">
            <fieldset className="form-grid" disabled={!checked}>
              {children}
            </fieldset>
          </div>
        </div>
      </div>
    </section>
  );
}
