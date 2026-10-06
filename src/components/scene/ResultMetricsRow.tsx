import { useEffect, useRef, useState } from 'react';
import type { ContainerSuggestion } from '../../domain/types';
import type { ResultMetrics, ResultWarning } from '../../utils/resultMetrics';
import { formatNumber } from '../shared/formatUnits';

interface ResultMetricsRowProps {
  metrics: ResultMetrics | null; // null = chưa có phương án cho container đang xem
  airbagCount: number;
  warnings: ResultWarning[];
  // Gợi ý đổi xe cho container cuối (nếu có) — hiện trong danh sách sau huy hiệu, kèm nút "Áp dụng".
  suggestion: ContainerSuggestion | null;
  suggestedTemplateName: string | undefined;
  onApplySuggestion: () => void;
}

interface TileProps {
  label: string;
  value: string;
  // Tiến trình 0..100+ (thanh tiến trình, vẽ tối đa 100%); undefined = ô không có thanh.
  progress?: number;
  title?: string;
}

function Tile({ label, value, progress, title }: TileProps) {
  return (
    <div className="result-tile" title={title}>
      <div className="result-tile-value">{value}</div>
      <div className="result-tile-label">{label}</div>
      {progress !== undefined && (
        <div className="result-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} aria-label={label}>
          <div className="result-progress-fill" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
      )}
    </div>
  );
}

/**
 * Huy hiệu cảnh báo DUY NHẤT: chỉ hiện số lượng; bấm vào mới xổ ra danh sách (đóng bằng bấm ra ngoài/Esc).
 * Gợi ý đổi xe (nếu có) nằm trong cùng danh sách, kèm nút "Áp dụng".
 */
function WarningsBadge({ warnings, suggestion, suggestedTemplateName, onApplySuggestion }: Pick<ResultMetricsRowProps, 'warnings' | 'suggestion' | 'suggestedTemplateName' | 'onApplySuggestion'>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const hasSuggestion = !!suggestion && !!suggestedTemplateName;
  const count = warnings.length + (hasSuggestion ? 1 : 0);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="result-warnings" ref={rootRef}>
      <button
        type="button"
        className={`result-badge${count > 0 ? ' has-items' : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
        title={count > 0 ? 'Bấm để xem danh sách cảnh báo' : 'Không có cảnh báo nào'}
      >
        <span className="result-badge-count">{count}</span>
        <span className="result-badge-label">Cảnh báo</span>
      </button>
      {open && (
        <div className="result-warnings-popover" role="dialog" aria-label="Danh sách cảnh báo">
          {count === 0 ? (
            <p className="result-muted">Không có cảnh báo nào.</p>
          ) : (
            <ul>
              {warnings.map((w) => (
                <li key={w.id}>{w.text}</li>
              ))}
              {hasSuggestion && suggestion && (
                <li>
                  <div>
                    Gợi ý: container/xe cuối chỉ dùng {formatNumber(suggestion.fillRatioBefore * 100, 0)}% — đổi sang{' '}
                    <strong>{suggestedTemplateName}</strong> vì lòng xe nhỏ hơn.
                  </div>
                  <button type="button" className="result-btn result-btn-small" onClick={onApplySuggestion}>
                    Áp dụng
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Hàng số liệu gọn dưới thanh trên cùng: Khối lượng và Thể tích (thanh tiến trình có phần trăm), Thùng và pallet, Cân
 * bằng, Túi khí — mỗi ô chỉ một số lớn kèm nhãn nhỏ; số chi tiết (kg, m³, độ lệch từng trục...) nằm ở bảng bên phải.
 * Mọi cảnh báo gộp trong 1 huy hiệu ở cuối hàng.
 */
export function ResultMetricsRow({ metrics, airbagCount, warnings, suggestion, suggestedTemplateName, onApplySuggestion }: ResultMetricsRowProps) {
  const pct = (n: number) => `${formatNumber(n, 0)}%`;
  return (
    <div className="result-metrics" role="group" aria-label="Số liệu phương án xếp hàng">
      <div className="result-tiles">
        <Tile
          label="Khối lượng"
          value={metrics ? pct(metrics.weightPercent) : '—'}
          progress={metrics ? metrics.weightPercent : 0}
          title={metrics ? `${formatNumber(metrics.usedWeightKg, 0)} / ${formatNumber(metrics.maxPayloadKg, 0)} kg` : undefined}
        />
        <Tile
          label="Thể tích"
          value={metrics ? pct(metrics.volumePercent) : '—'}
          progress={metrics ? metrics.volumePercent : 0}
          title={metrics ? `${formatNumber(metrics.usedVolumeM3)} / ${formatNumber(metrics.totalVolumeM3)} m³` : undefined}
        />
        <Tile
          label={metrics && metrics.palletCount > 0 ? `Thùng · ${metrics.palletCount} pallet` : 'Thùng / kiện'}
          value={metrics ? String(metrics.boxCount) : '—'}
        />
        <Tile
          label="Cân bằng (độ lệch)"
          value={metrics ? pct(metrics.balancePercent) : '—'}
          title={metrics ? `Lệch ngang ${formatNumber(metrics.balanceXPercent, 0)}% · lệch dọc ${formatNumber(metrics.balanceZPercent, 0)}%` : undefined}
        />
        <Tile label="Túi khí" value={metrics ? String(airbagCount) : '—'} />
      </div>
      <WarningsBadge
        warnings={warnings}
        suggestion={suggestion}
        suggestedTemplateName={suggestedTemplateName}
        onApplySuggestion={onApplySuggestion}
      />
    </div>
  );
}
