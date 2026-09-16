import { useEffect, useState } from 'react';
import { useAppStore } from '../../store';
import { formatNumber } from '../shared/formatUnits';

/**
 * Thay thế panel "Đơn hàng & điểm giao" đã bỏ hẳn (xem cargoSlice.ts/domain/types.ts) — tính chi
 * phí vận chuyển ước tính dựa trên quãng đường nhập tay và đơn giá cước/giá container của loại
 * container ĐANG ĐƯỢC CHỌN trong thư viện (selectedContainerTemplateId, xem ContainerPicker.tsx).
 * Số km nằm ở STORE (`transportDistanceKm`, không còn là state cục bộ như trước) để
 * suggestBetterContainer.ts (gợi ý đổi xe cho container cuối) cũng dùng được cùng giá trị khi so
 * sánh chi phí — xem domain/types.ts AppState.transportDistanceKm. 2 ô giá vẫn là state cục bộ:
 * luôn tự nạp lại theo giá gốc của loại container mỗi khi người dùng đổi loại, chỉnh tay ở đây chỉ
 * áp dụng TẠM THỜI cho lần tính hiện tại — không ghi ngược vào thư viện container.
 */
export function TransportCostPanel() {
  const containerLibrary = useAppStore((s) => s.containerLibrary);
  const selectedContainerTemplateId = useAppStore((s) => s.selectedContainerTemplateId);
  const solution = useAppStore((s) => s.solution);
  const km = useAppStore((s) => s.transportDistanceKm);
  const setTransportDistanceKm = useAppStore((s) => s.setTransportDistanceKm);

  const selectedTemplate = containerLibrary.find((t) => t.id === selectedContainerTemplateId);

  const [costPerKmInput, setCostPerKmInput] = useState('');
  const [costPerTripInput, setCostPerTripInput] = useState('');

  // Đổi loại container -> nạp lại giá gốc của loại đó, xóa mọi chỉnh sửa tạm thời trước đó.
  useEffect(() => {
    setCostPerKmInput(selectedTemplate?.costPerKm != null ? String(selectedTemplate.costPerKm) : '');
    setCostPerTripInput(selectedTemplate?.costPerTrip != null ? String(selectedTemplate.costPerTrip) : '');
  }, [selectedTemplate?.id]);

  const costPerKm = Number(costPerKmInput);
  const costPerTrip = Number(costPerTripInput);

  const containerCount = solution?.containers.length ?? 0;
  const usedTemplateId = solution?.containers[0]?.templateId;
  const showCalculation =
    km > 0 && containerCount > 0 && usedTemplateId === selectedTemplate?.id;

  const freightCost = showCalculation ? km * costPerKm : 0;
  const containerCost = showCalculation ? costPerTrip * containerCount : 0;
  const totalCost = freightCost + containerCost;

  return (
    <div className="panel transport-cost-panel">
      <div className="panel-header">
        <h2>Chi phí vận chuyển</h2>
      </div>

      <div className="field-row">
        <label className="field field-sm">
          <span>Quãng đường (km)</span>
          <input
            type="number"
            min="0"
            step="any"
            value={km === 0 ? '' : km}
            onChange={(e) => setTransportDistanceKm(Number(e.target.value))}
          />
        </label>
      </div>

      <div className="field-row">
        <label className="field field-sm">
          <span>Đơn giá cước (VNĐ/km)</span>
          <input
            type="number"
            min="0"
            step="any"
            value={costPerKmInput}
            onChange={(e) => setCostPerKmInput(e.target.value)}
          />
        </label>
        <label className="field field-sm">
          <span>Giá thuê container (VNĐ)</span>
          <input
            type="number"
            min="0"
            step="any"
            value={costPerTripInput}
            onChange={(e) => setCostPerTripInput(e.target.value)}
          />
        </label>
      </div>

      {showCalculation && (
        <div className="transport-cost-summary">
          <div className="transport-cost-summary-row">
            <span>Tiền cước</span>
            <strong>{formatNumber(freightCost, 0)} đ</strong>
          </div>
          <div className="transport-cost-summary-row">
            <span>Tiền container</span>
            <strong>{formatNumber(containerCost, 0)} đ</strong>
          </div>
          <div className="transport-cost-summary-row transport-cost-summary-total">
            <span>Tổng chi phí (ước tính)</span>
            <strong>{formatNumber(totalCost, 0)} đ</strong>
          </div>
        </div>
      )}
    </div>
  );
}
