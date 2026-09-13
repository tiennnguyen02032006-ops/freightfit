import type { CargoTemplate, Placement } from '../../domain/types';

interface StepSimulationControlsProps {
  stepIndex: number; // 0 = container trống, N = đã hiện N kiện đầu tiên theo load order
  total: number; // tổng số kiện (= placements.length)
  currentPlacement: Placement | undefined; // kiện vừa thêm ở bước hiện tại (undefined khi stepIndex === 0)
  currentTemplate: CargoTemplate | undefined;
  onPrev: () => void;
  onNext: () => void;
  onScrub: (index: number) => void;
}

/**
 * Thanh điều khiển mô phỏng xếp hàng từng bước, cố định dưới đáy khung 3D. Load order = thứ tự
 * CÓ SẴN trong `container.placements` (mảng này đã đúng thứ tự thuật toán xếp hàng quyết định —
 * xem packContainer.ts, mỗi vòng lặp push đúng 1 placement theo thứ tự xếp) — không tính lại gì
 * cả, chỉ đọc `placements[stepIndex - 1]` để biết kiện vừa thêm.
 */
export function StepSimulationControls({
  stepIndex,
  total,
  currentPlacement,
  currentTemplate,
  onPrev,
  onNext,
  onScrub,
}: StepSimulationControlsProps) {
  const itemLabel =
    stepIndex === 0 || !currentPlacement
      ? 'Container trống'
      : `${currentTemplate?.name || currentTemplate?.sku || currentPlacement.cargoTemplateId}${
          currentTemplate?.sku ? ` (${currentTemplate.sku})` : ''
        }`;

  return (
    <div className="step-sim-bar">
      <div className="step-sim-controls">
        <button type="button" onClick={onPrev} disabled={stepIndex <= 0}>
          ◀ Trước
        </button>
        <input
          type="range"
          min={0}
          max={total}
          value={stepIndex}
          onChange={(e) => onScrub(Number(e.target.value))}
          className="step-sim-slider"
          aria-label="Nhảy đến bước"
        />
        <button type="button" onClick={onNext} disabled={stepIndex >= total}>
          Tiếp theo ▶
        </button>
      </div>
      <div className="step-sim-label">
        Bước {stepIndex} / {total}: {itemLabel}
      </div>
    </div>
  );
}
