import { useState } from 'react';
import { useAppStore } from '../../store';
import type { CenterOfGravityWarning, ContainerInstance, ContainerTemplate, DunnageGap, PackingSolution } from '../../domain/types';
import { DUNNAGE_CONFIG } from '../../engine/config';
import { gapRange } from '../../engine/optimization/airbagSizes';
import { describeAirbagUsage, summarizeDunnage } from '../../engine/optimization/dunnage';
import { partialPalletsOf } from '../../engine/palletizing/palletBoxes';
import { getPalletType } from '../../engine/preprocessing/palletTypes';
import { segregationNotesFor } from '../../engine/segregation';
import { minSupportRatio, type ResultMetrics } from '../../utils/resultMetrics';
import { formatMmAsCm, formatNumber } from '../shared/formatUnits';

type TabId = 'overview' | 'pallet' | 'dunnage' | 'safety';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'overview', label: 'Tổng quan' },
  { id: 'pallet', label: 'Pallet' },
  { id: 'dunnage', label: 'Chèn lót' },
  { id: 'safety', label: 'An toàn' },
];

interface ResultSidePanelProps {
  solution: PackingSolution | null;
  solutionContainers: ContainerInstance[];
  containerTemplate: ContainerTemplate; // template THẬT của container đang xem
  container: ContainerInstance | undefined;
  metrics: ResultMetrics | null;
  cgWarnings: CenterOfGravityWarning[];
  dunnageGaps: DunnageGap[];
  unfitBoxCount: number;
  // Tải trọng tối đa đang dùng (có thể đã chỉnh TẠM THỜI cho lần xem này, không ghi ngược vào thư viện).
  maxPayload: number;
  onMaxPayloadChange: (kg: number) => void;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="result-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function OverviewTab({ solution, solutionContainers, containerTemplate, container, metrics, unfitBoxCount, maxPayload, onMaxPayloadChange }: ResultSidePanelProps) {
  const containerLibrary = useAppStore((s) => s.containerLibrary);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const commit = () => {
    const parsed = Number(draft);
    if (Number.isFinite(parsed) && parsed > 0) onMaxPayloadChange(parsed);
    setEditing(false);
  };

  // Phương án dùng bao nhiêu container, theo từng loại (container cuối có thể đã đổi loại qua gợi ý đổi xe).
  const groups = new Map<string, number>();
  for (const c of solutionContainers) groups.set(c.templateId, (groups.get(c.templateId) ?? 0) + 1);
  const summary = Array.from(groups.entries())
    .map(([id, count]) => `${count} × ${containerLibrary.find((t) => t.id === id)?.name ?? 'container'}`)
    .join(' + ');

  return (
    <dl className="result-dl">
      <Row label="Container">
        {containerTemplate.name} ({formatMmAsCm(containerTemplate.innerLength)} × {formatMmAsCm(containerTemplate.innerWidth)} ×{' '}
        {formatMmAsCm(containerTemplate.innerHeight)} cm)
      </Row>
      {containerTemplate.notes && <Row label="Ghi chú">{containerTemplate.notes}</Row>}
      {solution && solutionContainers.length > 0 && (
        <Row label="Phương án">
          Cần dùng {solutionContainers.length} container: {summary}
          {container ? ` · đang xem ${container.id.replace('container-', 'container ')}` : ''}
        </Row>
      )}
      {metrics && (
        <>
          <Row label="Khối lượng">
            {formatNumber(metrics.usedWeightKg, 0)} /{' '}
            {editing ? (
              <input
                type="number"
                min="1"
                step="any"
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commit();
                }}
                className="result-payload-input"
                aria-label="Tải trọng tối đa tạm thời (kg)"
              />
            ) : (
              <button
                type="button"
                className="result-link"
                onClick={() => {
                  setDraft(String(maxPayload));
                  setEditing(true);
                }}
                title="Bấm để chỉnh tải trọng tối đa tạm thời cho container đang xem (không đổi dữ liệu gốc trong thư viện)"
              >
                {formatNumber(maxPayload, 0)}
              </button>
            )}{' '}
            kg ({formatNumber(metrics.weightPercent, 0)}%)
          </Row>
          <Row label="Thể tích">
            {formatNumber(metrics.usedVolumeM3)} / {formatNumber(metrics.totalVolumeM3)} m³ ({formatNumber(metrics.volumePercent, 0)}%)
          </Row>
        </>
      )}
      {solution && <Row label="Lấp đầy trung bình">{formatNumber(solution.stats.volumeFillPercent, 0)}% thể tích</Row>}
      {unfitBoxCount > 0 && <Row label="Không xếp vừa">{unfitBoxCount} kiện</Row>}
      {solution && container && segregationNotesFor(solution.segregation, container.id).length > 0 && (
        <Row label="Nhóm hàng">
          <ul className="result-list">
            {segregationNotesFor(solution.segregation, container.id).map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </Row>
      )}
      {solution && solution.toleranceNotes.length > 0 && (
        <Row label="Dung sai">
          <ul className="result-list">
            {solution.toleranceNotes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </Row>
      )}
      {!solution && <p className="result-muted">Chưa có phương án — thêm hàng rồi bấm &quot;Tạo phương án xếp hàng&quot;.</p>}
    </dl>
  );
}

function PalletTab({ container, metrics }: ResultSidePanelProps) {
  if (!container || !metrics) return <p className="result-muted">Chưa có phương án cho container này.</p>;
  const pallets = container.placements.filter((p) => p.palletLoad);
  if (pallets.length === 0 && metrics.looseBoxCount === 0) {
    return <p className="result-muted">Container này không có pallet.</p>;
  }

  // Gộp pallet liền nhau cùng số thùng/số lớp/chiều cao (các pallet đầy giống hệt nhau) thành 1 dòng.
  const rows: Array<{ first: number; last: number; boxCount: number; layers: number; height: number; kg: number; partial: boolean; tolerance: number }> = [];
  pallets.forEach((p, i) => {
    const load = p.palletLoad!;
    const prev = rows[rows.length - 1];
    if (prev && prev.boxCount === load.boxCount && prev.layers === load.layers.length && prev.partial === !!load.isPartial && prev.height === p.height) {
      prev.last = i + 1;
    } else {
      rows.push({ first: i + 1, last: i + 1, boxCount: load.boxCount, layers: load.layers.length, height: p.height, kg: p.weight, partial: !!load.isPartial, tolerance: load.tolerance ?? 0 });
    }
  });
  const partials = partialPalletsOf(container.placements);
  const palletType = pallets[0]?.palletLoad ? getPalletType(pallets[0].palletLoad.palletType).label : null;

  return (
    <div className="result-section">
      <dl className="result-dl">
        <Row label="Pallet">{metrics.palletCount}{palletType ? ` (${palletType})` : ''}</Row>
        <Row label="Thùng trên pallet">{metrics.boxCount - metrics.looseBoxCount}</Row>
        {metrics.looseBoxCount > 0 && <Row label="Thùng rời">{metrics.looseBoxCount} (không đủ 1 lớp pallet, viền cam trong 3D)</Row>}
        {partials.length > 0 && (
          <Row label="Pallet lẻ">
            {partials.map((p) => `${p.palletLoad?.boxCount ?? 0} thùng`).join(', ')}
          </Row>
        )}
      </dl>
      {rows.length > 0 && (
        <ul className="result-list">
          {rows.map((r) => (
            <li key={r.first}>
              {r.first === r.last ? `Pallet ${r.first}` : `Pallet ${r.first}–${r.last}`}
              {r.partial ? ' (Pallet lẻ)' : ''}: {r.boxCount} thùng · {r.layers} lớp · cao {formatMmAsCm(r.height)} cm · {formatNumber(r.kg, 0)} kg
              {r.tolerance > 0 ? ` · đã tính dung sai ${formatNumber(r.tolerance / 10, 1)} cm` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DunnageTab({ dunnageGaps }: ResultSidePanelProps) {
  const showDunnage = useAppStore((s) => s.ui.showDunnage);
  const toggleDunnage = useAppStore((s) => s.toggleDunnage);
  const airbags = summarizeDunnage(dunnageGaps).airbags;
  const usage = describeAirbagUsage(dunnageGaps);
  const range = gapRange(DUNNAGE_CONFIG);

  return (
    <div className="result-section">
      <label className="result-check">
        <input type="checkbox" checked={showDunnage} onChange={toggleDunnage} /> Hiện lớp chèn lót trong 3D
      </label>
      <dl className="result-dl">
        <Row label="Túi khí cần dùng">{airbags} túi</Row>
        {range && (
          <Row label="Khe chèn được">
            {formatNumber(range.min / 10, 0)}–{formatNumber(range.max / 10, 0)} cm ·{' '}
            {DUNNAGE_CONFIG.bagSizes.map((s) => `${s.name} ${s.width}×${s.height} mm`).join(', ')}
          </Row>
        )}
      </dl>
      {usage.length > 0 && (
        <ul className="result-list">
          {usage.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      {dunnageGaps.length > 0 ? (
        <ul className="result-list">
          {dunnageGaps.map((g) => (
            <li key={g.id}>
              {g.source === 'CENTER' ? 'Khe giữa hai cột pallet' : g.wall ? 'Khe sát vách/cửa' : 'Khe giữa các hàng'}: {formatNumber(g.gapSize / 10, 1)} cm
              {' → '}
              {g.bagCount} túi
            </li>
          ))}
        </ul>
      ) : (
        <p className="result-muted">Không có khe nào cần chèn túi khí.</p>
      )}
    </div>
  );
}

function SafetyTab({ container, metrics, cgWarnings }: ResultSidePanelProps) {
  if (!container || !metrics) return <p className="result-muted">Chưa có phương án cho container này.</p>;
  const support = minSupportRatio(container);
  return (
    <div className="result-section">
      <dl className="result-dl">
        <Row label="Lệch trọng tâm ngang">{formatNumber(metrics.balanceXPercent, 0)}%</Row>
        <Row label="Lệch trọng tâm dọc">{formatNumber(metrics.balanceZPercent, 0)}%</Row>
        <Row label="Tải trọng đã dùng">{formatNumber(metrics.weightPercent, 0)}%</Row>
        <Row label="Tỷ lệ đỡ thấp nhất">{support === null ? 'mọi kiện nằm trên sàn' : `${formatNumber(support * 100, 0)}%`}</Row>
        <Row label="Cảnh báo trọng tâm">{cgWarnings.length === 0 ? 'không có' : `${cgWarnings.length} (xem huy hiệu Cảnh báo)`}</Row>
      </dl>
      <p className="result-muted">
        Đây chỉ là cảnh báo ổn định hình học (stability heuristic: tỷ lệ đỡ, trọng tâm, tải trọng) — không mô phỏng lực phanh, rung hay ma sát
        khi vận chuyển.
      </p>
    </div>
  );
}

/**
 * Bảng bên phải thu gọn được, gồm 4 tab: Tổng quan, Pallet, Chèn lót, An toàn — chứa các chi tiết đã bỏ khỏi hàng số
 * liệu (kg/m³ cụ thể, tải trọng chỉnh tạm thời, danh sách pallet, túi khí, độ lệch trọng tâm...). Thu gọn chỉ còn một
 * nút mở lại; trạng thái tab/thu gọn là state cục bộ (không lưu trữ).
 */
export function ResultSidePanel(props: ResultSidePanelProps) {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<TabId>('overview');

  if (!open) {
    return (
      <aside className="result-side is-collapsed">
        <button type="button" className="result-side-toggle" onClick={() => setOpen(true)} aria-label="Mở bảng chi tiết" title="Mở bảng chi tiết">
          ‹
        </button>
      </aside>
    );
  }

  return (
    <aside className="result-side" aria-label="Chi tiết phương án">
      <div className="result-side-head">
        <div className="result-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`result-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`result-panel-${t.id}`}
              className={`result-tab${tab === t.id ? ' is-active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button type="button" className="result-side-toggle" onClick={() => setOpen(false)} aria-label="Thu gọn bảng chi tiết" title="Thu gọn">
          ›
        </button>
      </div>
      <div className="result-side-body" role="tabpanel" id={`result-panel-${tab}`} aria-labelledby={`result-tab-${tab}`}>
        {tab === 'overview' && <OverviewTab {...props} />}
        {tab === 'pallet' && <PalletTab {...props} />}
        {tab === 'dunnage' && <DunnageTab {...props} />}
        {tab === 'safety' && <SafetyTab {...props} />}
      </div>
    </aside>
  );
}
