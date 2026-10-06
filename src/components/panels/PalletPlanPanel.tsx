import { useAppStore } from '../../store';
import { palletizeAll } from '../../engine/palletizing/palletizeCargo';
import { toleranceLabel } from '../../engine/tolerance';
import { getPalletType } from '../../engine/preprocessing/palletTypes';
import type { PalletLoad } from '../../domain/types';
import { formatMmAsCm, formatNumber } from '../shared/formatUnits';

// Gộp các pallet liền nhau có cùng số thùng/số lớp (các pallet đầy giống hệt nhau) thành 1 dòng
// "Pallet 1–11", pallet lẻ ở dòng riêng.
interface PalletGroup {
  first: number;
  last: number;
  sample: PalletLoad;
}

function groupPallets(pallets: PalletLoad[]): PalletGroup[] {
  const groups: PalletGroup[] = [];
  pallets.forEach((p, i) => {
    const prev = groups[groups.length - 1];
    if (prev && prev.sample.boxCount === p.boxCount && prev.sample.layers.length === p.layers.length && prev.sample.isPartial === p.isPartial) {
      prev.last = i + 1;
    } else {
      groups.push({ first: i + 1, last: i + 1, sample: p });
    }
  });
  return groups;
}

/**
 * Kế hoạch xếp thùng lên pallet (CHƯA đưa vào container): với mỗi loại hàng bật "Xếp lên pallet",
 * hiện số pallet cần dùng và số thùng trên từng pallet. Chỉ đọc cargoTemplates qua store, mọi tính
 * toán nằm ở engine/palletizing/palletizeCargo.ts.
 */
export function PalletPlanPanel() {
  const cargoTemplates = useAppStore((s) => s.cargoTemplates);
  const tolerance = useAppStore((s) => s.tolerance);
  const results = palletizeAll(cargoTemplates, tolerance);

  if (results.length === 0) return null;

  return (
    <div className="panel pallet-plan-panel">
      <div className="panel-header">
        <h2>Kế hoạch xếp pallet</h2>
      </div>
      <p className="trip-hint">Kế hoạch xếp thùng lên pallet. Khi bấm "Tạo phương án xếp hàng", mỗi pallet được xếp vào container như một khối cứng (không tách thùng khỏi pallet).</p>
      {results.map((r) => {
        const pallet = getPalletType(r.params.palletType);
        const placedBoxes = r.pallets.reduce((sum, p) => sum + p.boxCount, 0);
        return (
          <div key={r.cargoTemplateId} className="pallet-plan-item">
            <strong>
              {r.sku} — {r.pallets.length} pallet {pallet.label}
            </strong>
            <span className="pallet-plan-meta">
              {placedBoxes} thùng · tối đa cao {formatMmAsCm(r.params.maxHeight)} cm, {formatNumber(r.params.maxWeight, 0)} kg/pallet, chồng tối đa {r.params.maxTiers ?? 1} tầng
              {toleranceLabel(r.tolerance) ? ` · ${toleranceLabel(r.tolerance)}` : ''}
            </span>
            <ul className="pallet-plan-list">
              {groupPallets(r.pallets).map((g) => (
                <li key={g.first}>
                  {g.first === g.last ? `Pallet ${g.first}` : `Pallet ${g.first}–${g.last}`}
                  {g.sample.isPartial ? ' — Pallet lẻ' : ''}: {g.sample.boxCount} thùng/pallet · {g.sample.layers.length} lớp · cao{' '}
                  {formatMmAsCm(g.sample.totalHeight)} cm · {formatNumber(g.sample.totalWeight + g.sample.palletWeight, 0)} kg (gồm pallet {formatNumber(g.sample.palletWeight, 0)} kg)
                </li>
              ))}
            </ul>
            {r.looseBoxCount > 0 && (
              <p className="pallet-plan-meta">
                + {r.looseBoxCount} thùng rời: không đủ 1 lớp pallet, sẽ xếp rời vào khoảng trống trong container.
              </p>
            )}
            {r.unpalletizedBoxCount > 0 && (
              <p className="form-error">
                {r.unpalletizedBoxCount} thùng không xếp lên pallet được{r.reason ? `: ${r.reason}` : '.'}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
