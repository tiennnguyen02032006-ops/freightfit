import { useEffect, useState } from 'react';
import { useAppStore } from '../../store';
import { formatNumber } from '../shared/formatUnits';

/**
 * Thay thế panel "Đơn hàng & điểm giao" đã bỏ hẳn (xem cargoSlice.ts/domain/types.ts) — tính chi
 * phí vận chuyển ước tính dựa trên quãng đường nhập tay và đơn giá cước/giá container. Số km nằm ở
 * STORE (`transportDistanceKm`, không còn là state cục bộ như trước) để suggestBetterContainer.ts
 * (gợi ý đổi xe cho container cuối) cũng dùng được cùng giá trị khi so sánh chi phí — xem
 * domain/types.ts AppState.transportDistanceKm.
 *
 * BUG đã sửa: `solution.containers` KHÔNG PHẢI lúc nào cũng cùng 1 loại template — sau khi bấm "Áp
 * dụng" gợi ý đổi xe cho container cuối (applyContainerSuggestion, solutionSlice.ts), container
 * CUỐI có thể thuộc 1 template KHÁC hẳn các container còn lại, và selectedContainerTemplateId lúc
 * đó cũng tự đổi theo loại VỪA áp dụng — điều kiện cũ (so `containers[0].templateId` với
 * `selectedTemplate.id`) coi trường hợp này là "không hợp lệ", ẩn hẳn khối chi phí dù thực ra vẫn
 * tính được bình thường.
 *
 * Sửa: TÁCH RIÊNG container CUỐI (`lastContainer`) khỏi các container ĐẦU (`otherContainers`) —
 * applyContainerSuggestion CHỈ BAO GIỜ đổi template của đúng container cuối (generateSolution luôn
 * dùng đồng nhất 1 loại cho toàn bộ solution ban đầu), nên container cuối là container DUY NHẤT có
 * khả năng khác loại. Các container đầu dùng giá đang CHỈNH TAY (costPerKmInput/costPerTripInput,
 * mặc định nạp theo `otherTemplate`). Container cuối có 1 ô chỉnh tay RIÊNG cho "Đơn giá cước"
 * (`lastCostPerKmInput`) — mặc định = costPerKm GỐC của đúng loại xe đang dùng (`lastTemplate`), để
 * người dùng có thể thương lượng giá cước khác nếu cần; effect nạp giá trị này dùng ĐÚNG
 * `lastTemplate?.id` làm dependency (không dùng biến nào khác) nên TỰ ĐỘNG cập nhật lại đúng giá
 * gốc của loại xe MỚI mỗi khi container cuối đổi loại (vd sau khi bấm "Áp dụng" gợi ý đổi xe),
 * không bao giờ giữ lại giá trị cũ của loại xe trước đó. Riêng "Tiền container" (costPerTrip) của
 * container cuối vẫn KHÔNG cho chỉnh tay, LUÔN lấy đúng costPerTrip GỐC (tra theo containerLibrary)
 * — giá thuê container phải khớp đúng với loại xe thực tế đang chở, không thể tùy ý sửa khác đi.
 * UI hiện tách khối "Container cuối" riêng trong `.transport-cost-summary` khi có từ 2 container
 * trở lên (xem `otherContainers.length > 0`).
 *
 * BUG đã sửa: `otherTemplate` (đại diện loại THẬT của các container ĐẦU) PHẢI tra theo DỮ LIỆU
 * SOLUTION (`otherContainers[0].templateId`), KHÔNG dùng thẳng `selectedContainerTemplateId`/
 * `selectedTemplate` — vì applyContainerSuggestion tự đổi `selectedContainerTemplateId` sang loại
 * VỪA áp dụng cho container CUỐI, nên sau khi áp dụng gợi ý, giá trị đó không còn đại diện đúng cho
 * các container đầu nữa (vd container 1-2 vẫn là "20ft Standard" thật, nhưng
 * selectedContainerTemplateId lại trỏ sang "Xe tải Isuzu..." vừa áp dụng cho container cuối). Nếu
 * dùng thẳng `selectedTemplate` để xác định "có phải xe tải không", các container đầu (thực chất
 * vẫn là container ISO) sẽ bị tính NHẦM thành xe tải, ẩn mất hẳn "Tiền container" dù lẽ ra phải có
 * — đây là bug thực tế đã xảy ra. `otherTemplate` chỉ fallback về `selectedTemplate` khi CHƯA có
 * solution (`otherContainers` rỗng), để ô giá vẫn nạp mặc định lúc người dùng mới chọn loại
 * container/xe, trước khi bấm "Tạo phương án".
 *
 * "Tiền container" (costPerTrip) CHỈ áp dụng cho container ISO THẬT (standardType khác
 * 'CUSTOM_TRUCK' — xem domain/types.ts ContainerStandardType, vd 20ft/40ft/45ft) — xe tải
 * (standardType === 'CUSTOM_TRUCK') KHÔNG phải thuê thêm container rời, giá thuê xe/vận hành đã gộp
 * sẵn vào đơn giá cước theo km, nên chỉ tính "Tiền cước", không có khoản "Tiền container" nào cả
 * (ô nhập "Giá thuê container" cũng ẩn đi khi loại của `otherTemplate` là xe tải).
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
  const [lastCostPerKmInput, setLastCostPerKmInput] = useState('');

  const containers = solution?.containers ?? [];
  const containerCount = containers.length;
  // Container CUỐI tách riêng khỏi các container ĐẦU — vì applyContainerSuggestion (solutionSlice.ts)
  // chỉ bao giờ đổi template của ĐÚNG container cuối, nên nó là container DUY NHẤT có khả năng khác
  // loại so với phần còn lại của solution (luôn đồng nhất 1 loại theo generateSolution).
  const lastContainer = containers[containerCount - 1];
  const otherContainers = containers.slice(0, -1);

  const templatesById = new Map(containerLibrary.map((t) => [t.id, t] as const));
  const lastTemplate = lastContainer ? templatesById.get(lastContainer.templateId) : undefined;

  // BUG đã sửa: loại THẬT của các container ĐẦU phải tra theo DỮ LIỆU SOLUTION
  // (otherContainers[0].templateId), KHÔNG dùng thẳng selectedContainerTemplateId — vì
  // applyContainerSuggestion tự đổi selectedContainerTemplateId sang loại của container CUỐI sau khi
  // áp dụng gợi ý, nên nó không còn đại diện đúng cho các container đầu nữa (xem JSDoc đầu file).
  // Khi CHƯA có solution (otherContainers rỗng) -> fallback về selectedTemplate như cũ, để ô giá vẫn
  // nạp mặc định lúc người dùng mới chọn loại container/xe, trước khi bấm "Tạo phương án".
  const otherTemplateId = otherContainers[0]?.templateId;
  const otherTemplate = otherTemplateId ? templatesById.get(otherTemplateId) : selectedTemplate;

  // Đổi loại container -> nạp lại giá gốc của loại đó, xóa mọi chỉnh sửa tạm thời trước đó.
  useEffect(() => {
    setCostPerKmInput(otherTemplate?.costPerKm != null ? String(otherTemplate.costPerKm) : '');
    setCostPerTripInput(otherTemplate?.costPerTrip != null ? String(otherTemplate.costPerTrip) : '');
  }, [otherTemplate?.id]);

  const costPerKm = Number(costPerKmInput);
  const costPerTrip = Number(costPerTripInput);

  // Ô chỉnh tay "Đơn giá cước" RIÊNG cho container CUỐI — dependency BẮT BUỘC là lastTemplate?.id
  // (không dùng biến nào khác) để tự nạp lại ĐÚNG giá gốc mỗi khi container cuối đổi sang loại xe
  // khác (vd sau khi bấm "Áp dụng" gợi ý đổi xe), không giữ giá trị cũ của loại xe trước đó — đây
  // là lỗi đã gặp và fix ở lần sửa trước, lần này đảm bảo không lặp lại.
  useEffect(() => {
    setLastCostPerKmInput(lastTemplate?.costPerKm != null ? String(lastTemplate.costPerKm) : '');
  }, [lastTemplate?.id]);

  const lastCostPerKm = Number(lastCostPerKmInput);

  const showCalculation = km > 0 && containerCount > 0;

  // Các container ĐẦU (trừ container cuối) -> dùng giá đang CHỈNH TAY (costPerKmInput/
  // costPerTripInput, mặc định nạp theo otherTemplate) — đúng như trước, vì các container này LUÔN
  // cùng loại với otherTemplate.
  const otherFreightCost = showCalculation ? km * costPerKm * otherContainers.length : 0;
  // "Tiền container" CHỈ áp dụng cho container ISO THẬT (standardType khác CUSTOM_TRUCK) — xe tải
  // không thuê thêm container rời, giá thuê chính là chi phí vận hành đã gộp vào đơn giá cước/km.
  const otherContainerCost =
    showCalculation && otherTemplate?.standardType !== 'CUSTOM_TRUCK'
      ? costPerTrip * otherContainers.length
      : 0;

  // Container CUỐI -> "Tiền cước" dùng giá đã CHỈNH TAY RIÊNG (lastCostPerKmInput, mặc định nạp
  // theo lastTemplate — xem effect ở trên); "Tiền container" (bên dưới) vẫn LUÔN lấy costPerTrip
  // GỐC, KHÔNG cho chỉnh tay — chỉ "Đơn giá cước" mới cho phép thương lượng giá khác.
  const lastFreightCost = showCalculation && lastTemplate ? km * lastCostPerKm : 0;
  // Tương tự otherContainerCost — chỉ tính khi container cuối là ISO container thật, không phải xe tải.
  const lastContainerCost =
    showCalculation && lastTemplate && lastTemplate.standardType !== 'CUSTOM_TRUCK'
      ? (lastTemplate.costPerTrip ?? 0)
      : 0;

  const freightCost = otherFreightCost + lastFreightCost;
  const containerCost = otherContainerCost + lastContainerCost;
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
        {otherTemplate?.standardType !== 'CUSTOM_TRUCK' && (
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
        )}
      </div>

      {showCalculation && (
        <div className="transport-cost-summary">
          <div className="transport-cost-summary-row">
            <span>Tiền cước</span>
            <strong>{formatNumber(freightCost, 0)} đ</strong>
          </div>
          {/* containerCost tự động = 0 khi TOÀN BỘ container đang tính đều là xe tải (xem
              otherContainerCost/lastContainerCost) — ẩn hẳn dòng này thay vì hiện "0 đ" gây hiểu
              nhầm là có tính phí container mà chỉ đơn giản đang bằng 0. */}
          {containerCost > 0 && (
            <div className="transport-cost-summary-row">
              <span>Tiền container</span>
              <strong>{formatNumber(containerCost, 0)} đ</strong>
            </div>
          )}
          {/* Chỉ tách riêng khi THỰC SỰ có từ 2 container trở lên — solution chỉ 1 container thì
              "container cuối" cũng chính là container duy nhất, tách riêng vô nghĩa. */}
          {otherContainers.length > 0 && lastTemplate && (
            <div className="transport-cost-summary-group">
              <div className="transport-cost-summary-row transport-cost-summary-subheading">
                <span>Container cuối ({lastTemplate.name})</span>
              </div>
              <div className="field-row">
                <label className="field field-sm">
                  <span>Đơn giá cước (VNĐ/km)</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={lastCostPerKmInput}
                    onChange={(e) => setLastCostPerKmInput(e.target.value)}
                  />
                </label>
              </div>
              <div className="transport-cost-summary-row">
                <span>Tiền cước</span>
                <strong>{formatNumber(lastFreightCost, 0)} đ</strong>
              </div>
              {lastContainerCost > 0 && (
                <div className="transport-cost-summary-row">
                  <span>Tiền container</span>
                  <strong>{formatNumber(lastContainerCost, 0)} đ</strong>
                </div>
              )}
            </div>
          )}

          <div className="transport-cost-summary-row transport-cost-summary-total">
            <span>Tổng chi phí (ước tính)</span>
            <strong>{formatNumber(totalCost, 0)} đ</strong>
          </div>
        </div>
      )}
    </div>
  );
}
