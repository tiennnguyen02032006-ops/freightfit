import type { CargoTemplate, ContainerInstance, ContainerSuggestion, ContainerTemplate } from '../../domain/types';
import { LAST_CONTAINER_MIN_FILL_RATIO, PLACEMENT_SCORE_WEIGHTS } from '../config';
import type { ExpandedCargoItem } from '../preprocessing/normalizeCargo';
import { sortCargo } from '../preprocessing/sortCargo';
import { packContainer } from '../packing/packContainer';

/**
 * Vấn đề: khi 1 solution cần NHIỀU container cùng loại để chở hết hàng (xem
 * generateSolutions.ts), container CUỐI CÙNG thường chỉ còn vài kiện dư ra sau khi các container
 * trước đã lấp gần đầy — dùng nguyên 1 container/xe to cho lượng hàng ít ỏi đó rất lãng phí. Module
 * này chỉ lo phần "gợi ý" (tính toán thuần túy, không đọc/ghi store) — nơi gọi (solutionSlice.ts)
 * chịu trách nhiệm lưu kết quả vào state và áp dụng khi người dùng bấm "Áp dụng".
 */

function templateVolume(t: ContainerTemplate): number {
  return t.innerLength * t.innerWidth * t.innerHeight;
}

/**
 * Tỷ lệ lấp đầy = tỷ lệ CAO HƠN giữa thể tích đã dùng/thể tích lòng container VÀ tổng trọng
 * lượng/tải trọng tối đa — lấy tỷ lệ cao hơn làm đại diện vì container có thể "đầy" theo bất kỳ 1
 * trong 2 tiêu chí trước (hàng nặng nhưng nhỏ gọn thì đầy tải trọng trước khi đầy thể tích, và
 * ngược lại với hàng cồng kềnh nhẹ).
 */
export function computeContainerFillRatio(container: ContainerInstance, template: ContainerTemplate): number {
  const volume = templateVolume(template);
  const volumeRatio = volume > 0 ? container.usedVolume / volume : 0;
  const payloadRatio = template.maxPayload > 0 ? container.totalWeight / template.maxPayload : 0;
  return Math.max(volumeRatio, payloadRatio);
}

/**
 * Dựng lại danh sách ExpandedCargoItem từ placements đã có sẵn trong 1 container (dùng để
 * packContainer() lại vào template khác) — cargoInstanceId/cargoTemplateId giữ nguyên từ
 * placement gốc (không tạo instance mới), chỉ tra lại CargoTemplate đầy đủ theo cargoTemplateId
 * để có allowedOrientations/clearance/... mà packContainer() cần. Sort lại bằng sortCargo() (cùng
 * tiêu chí dùng trong generateSolutions.ts) để thứ tự xếp nhất quán — dùng chung cho cả bước "thử
 * xếp" (suggestBetterContainer) và bước "áp dụng thật" (solutionSlice.applyContainerSuggestion),
 * tránh lặp logic.
 */
export function expandContainerPlacements(
  container: ContainerInstance,
  cargoTemplatesById: Map<string, CargoTemplate>,
): ExpandedCargoItem[] {
  const items: ExpandedCargoItem[] = [];
  for (const placement of container.placements) {
    const template = cargoTemplatesById.get(placement.cargoTemplateId);
    // Không nên xảy ra (mọi cargoTemplateId trong placement đều bắt nguồn từ cargoTemplates hiện
    // có) — bỏ qua an toàn thay vì throw, tránh sập tính năng gợi ý vì 1 dữ liệu lệch.
    if (!template) continue;
    items.push({ cargoInstanceId: placement.cargoInstanceId, cargoTemplateId: placement.cargoTemplateId, template });
  }
  return sortCargo(items);
}

/** Chi phí ước tính 1 chuyến = costPerTrip + costPerKm*km — null nếu KHÔNG có costPerTrip (không đủ dữ liệu để so). */
function estimatedTripCost(template: ContainerTemplate, distanceKm: number): number | null {
  if (template.costPerTrip == null) return null;
  return template.costPerTrip + (template.costPerKm ?? 0) * distanceKm;
}

/**
 * So sánh 2 container/xe ứng viên (đều đã xác nhận xếp vừa HẾT số hàng đang xét, và đều đã qua bộ
 * lọc "thực sự nhỏ hơn currentTemplate" ở suggestBetterContainer — xem candidates bên dưới):
 * 1. CẢ HAI đều có costPerTrip -> so theo chi phí ước tính thấp hơn.
 * 2. THIẾU costPerTrip ở ÍT NHẤT 1 BÊN (kể cả thiếu ở CẢ HAI, vd 2 xe tải mới thêm chưa có số
 *    liệu giá) -> so bằng THỂ TÍCH LÒNG nhỏ hơn thay vì so chi phí. Đây là điểm sửa quan trọng so
 *    với bản trước: bản trước coi thiếu costPerTrip là "chi phí vô cực", khiến các xe tải nhỏ mới
 *    thêm (chưa có số liệu giá thị trường) luôn thua MỌI container tiêu chuẩn có costPerTrip dù
 *    nhỏ hơn/hợp lý hơn nhiều lần (vd gợi ý sai "20ft Standard -> 20ft Reefer" cho lô hàng vài
 *    trăm kg thay vì xe tải nhỏ) — thiếu giá KHÔNG được là lý do loại bỏ 1 lựa chọn nhỏ hơn hợp lý.
 * 3. Hòa ở tiêu chí chính (cùng chi phí, hoặc cùng thể tích) -> ưu tiên XE TẢI NHỎ (CUSTOM_TRUCK)
 *    hơn container tiêu chuẩn (đúng yêu cầu "ưu tiên xe tải nhỏ hơn container tiêu chuẩn nếu cùng
 *    đáp ứng").
 * 4. Vẫn hòa -> thể tích nhỏ hơn thắng, để luôn có kết quả xác định (deterministic).
 */
function compareCandidates(a: ContainerTemplate, b: ContainerTemplate, distanceKm: number): number {
  const costA = estimatedTripCost(a, distanceKm);
  const costB = estimatedTripCost(b, distanceKm);

  if (costA != null && costB != null) {
    if (costA !== costB) return costA - costB;
  } else {
    const volumeDiff = templateVolume(a) - templateVolume(b);
    if (volumeDiff !== 0) return volumeDiff;
  }

  const truckRankA = a.standardType === 'CUSTOM_TRUCK' ? 0 : 1;
  const truckRankB = b.standardType === 'CUSTOM_TRUCK' ? 0 : 1;
  if (truckRankA !== truckRankB) return truckRankA - truckRankB;
  return templateVolume(a) - templateVolume(b);
}

export interface SuggestBetterContainerParams {
  lastContainer: ContainerInstance;
  currentTemplate: ContainerTemplate;
  cargoTemplatesById: Map<string, CargoTemplate>;
  containerLibrary: ContainerTemplate[];
  // Quãng đường (km) người dùng đã nhập ở TransportCostPanel (store `transportDistanceKm`) — dùng
  // để so chi phí costPerTrip + costPerKm*km "cho công bằng" giữa các loại. 0 nếu chưa nhập.
  distanceKm?: number;
  minFillRatio?: number;
}

/**
 * Trả về gợi ý đổi loại container/xe cho `lastContainer`, hoặc null nếu:
 * - container không có hàng gì để xếp lại, HOẶC
 * - tỷ lệ lấp đầy hiện tại đã >= ngưỡng (không lãng phí đáng kể), HOẶC
 * - không loại nào khác trong containerLibrary xếp vừa HẾT toàn bộ số hàng đó, HOẶC
 * - loại tốt nhất tìm được lại có thể tích lòng >= currentTemplate (không phải "đổi nhỏ hơn").
 */
export function suggestBetterContainer(params: SuggestBetterContainerParams): ContainerSuggestion | null {
  const {
    lastContainer,
    currentTemplate,
    cargoTemplatesById,
    containerLibrary,
    distanceKm = 0,
    minFillRatio = LAST_CONTAINER_MIN_FILL_RATIO,
  } = params;

  if (lastContainer.placements.length === 0) return null;

  const fillRatioBefore = computeContainerFillRatio(lastContainer, currentTemplate);
  if (fillRatioBefore >= minFillRatio) return null;

  const sortedItems = expandContainerPlacements(lastContainer, cargoTemplatesById);
  if (sortedItems.length === 0) return null;

  const currentVolume = templateVolume(currentTemplate);

  const candidates = containerLibrary.filter((template) => {
    if (template.id === currentTemplate.id) return false;
    // Loại bỏ TRƯỚC mọi ứng viên có thể tích lòng HOẶC maxPayload LỚN HƠN loại đang dùng — không
    // có ý nghĩa gợi ý nếu không thực sự nhỏ hơn/rẻ hơn (vd ứng viên thể tích nhỏ hơn nhưng
    // maxPayload lại cao hơn hẳn vẫn bị loại, vì không phải một lựa chọn "downsize" thật sự).
    if (templateVolume(template) > currentVolume) return false;
    if (template.maxPayload > currentTemplate.maxPayload) return false;

    const { unfit } = packContainer({
      containerTemplate: template,
      containerInstanceId: 'suggestion-preview',
      containerIndex: 0,
      sortedItems,
      weights: PLACEMENT_SCORE_WEIGHTS,
    });
    return unfit.length === 0;
  });

  if (candidates.length === 0) return null;

  const [chosen] = [...candidates].sort((a, b) => compareCandidates(a, b, distanceKm));

  const currentCost = estimatedTripCost(currentTemplate, distanceKm);
  const chosenCost = estimatedTripCost(chosen, distanceKm);
  const estimatedSavings = currentCost != null && chosenCost != null ? currentCost - chosenCost : null;

  return {
    suggestedTemplateId: chosen.id,
    fillRatioBefore,
    estimatedSavings,
  };
}
