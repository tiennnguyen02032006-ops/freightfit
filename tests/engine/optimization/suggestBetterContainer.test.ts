import { describe, expect, it } from 'vitest';
import {
  computeContainerFillRatio,
  suggestBetterContainer,
} from '../../../src/engine/optimization/suggestBetterContainer';
import type { CargoTemplate, ContainerInstance, ContainerTemplate } from '../../../src/domain/types';
import { STANDARD_CONTAINER_TEMPLATES } from '../../../src/engine/preprocessing/containerSeed';
import { makeCargoTemplate } from '../../fixtures/cargo';
import { makePlacement } from '../../fixtures/placement';

// Container hiện đang dùng (loại to, kiểu container tiêu chuẩn) — thể tích/tải trọng lớn hơn hẳn
// nhu cầu thực của bộ hàng hóa dùng trong các test bên dưới.
const bigCurrentTemplate: ContainerTemplate = {
  id: 'current-big',
  name: '40ft HC (test)',
  standardType: '40FT_HC',
  innerLength: 6000,
  innerWidth: 2400,
  innerHeight: 2400,
  maxPayload: 20000,
  costPerTrip: 1_000_000,
  isCustom: false,
};

// 2 xe tải nhỏ, cả 2 đều thừa sức chở hết bộ hàng nhỏ dùng trong test — khác nhau ở chi phí/thể
// tích để xác nhận suggestBetterContainer() chọn đúng loại RẺ HƠN (không chỉ nhỏ hơn).
const cheapSmallTruck: ContainerTemplate = {
  id: 'cheap-small-truck',
  name: 'Xe tải nhỏ (test, rẻ)',
  standardType: 'CUSTOM_TRUCK',
  innerLength: 1500,
  innerWidth: 1000,
  innerHeight: 1000,
  maxPayload: 800,
  costPerTrip: 200_000,
  isCustom: false,
};

const pricierMediumTruck: ContainerTemplate = {
  id: 'pricier-medium-truck',
  name: 'Xe tải vừa (test, đắt hơn)',
  standardType: 'CUSTOM_TRUCK',
  innerLength: 4000,
  innerWidth: 2000,
  innerHeight: 2000,
  maxPayload: 8000,
  costPerTrip: 500_000,
  isCustom: false,
};

const tinyBoxTemplate: CargoTemplate = makeCargoTemplate({
  id: 'tiny-box',
  sku: 'TINY-BOX',
  name: 'Kiện nhỏ',
  length: 300,
  width: 300,
  height: 300,
  weight: 5,
  allowedOrientations: [[300, 300, 300]],
});

const cargoTemplatesById = new Map<string, CargoTemplate>([[tinyBoxTemplate.id, tinyBoxTemplate]]);

function makeLastContainer(overrides: Partial<ContainerInstance> = {}): ContainerInstance {
  return {
    id: 'container-3',
    templateId: bigCurrentTemplate.id,
    index: 2,
    placements: [
      makePlacement({ id: 'p1', cargoInstanceId: 'tiny-box__0', cargoTemplateId: 'tiny-box' }),
      makePlacement({ id: 'p2', cargoInstanceId: 'tiny-box__1', cargoTemplateId: 'tiny-box' }),
    ],
    extremePoints: [],
    totalWeight: 10,
    usedVolume: 2 * 300 * 300 * 300,
    centerOfGravity: { x: 0, y: 0, z: 0 },
    cgOffsetXRatio: 0,
    cgOffsetZRatio: 0,
    ...overrides,
  };
}

describe('computeContainerFillRatio', () => {
  it('lấy tỷ lệ CAO HƠN giữa thể tích và tải trọng đã dùng', () => {
    // volumeRatio = 54.000.000 / 34.560.000.000 ≈ 0.156%, payloadRatio = 10/20000 = 0.05% ->
    // volume cao hơn payload ở bộ dữ liệu test này, phải lấy volumeRatio làm đại diện.
    const ratio = computeContainerFillRatio(makeLastContainer(), bigCurrentTemplate);
    const expectedVolumeRatio = (2 * 300 * 300 * 300) / (6000 * 2400 * 2400);
    expect(ratio).toBeCloseTo(expectedVolumeRatio, 8);
    expect(ratio).toBeGreaterThan(10 / 20000);
  });
});

describe('suggestBetterContainer', () => {
  it('bộ hàng nhỏ hơn hẳn thể tích container hiện dùng -> gợi ý đúng loại xe nhỏ hơn, rẻ hơn', () => {
    const suggestion = suggestBetterContainer({
      lastContainer: makeLastContainer(),
      currentTemplate: bigCurrentTemplate,
      cargoTemplatesById,
      containerLibrary: [bigCurrentTemplate, pricierMediumTruck, cheapSmallTruck],
    });

    expect(suggestion).not.toBeNull();
    // cheapSmallTruck rẻ hơn pricierMediumTruck (cả 2 đều xếp vừa hết) -> phải chọn cheapSmallTruck,
    // không chỉ đơn thuần chọn cái nhỏ nhất hay cái đầu tiên trong danh sách.
    expect(suggestion?.suggestedTemplateId).toBe(cheapSmallTruck.id);
    expect(suggestion?.fillRatioBefore).toBeLessThan(0.35);
    expect(suggestion?.estimatedSavings).toBe(bigCurrentTemplate.costPerTrip! - cheapSmallTruck.costPerTrip!);
  });

  it('container cuối đã lấp đầy đủ (>= ngưỡng) -> không gợi ý gì', () => {
    const wellFilledContainer = makeLastContainer({
      totalWeight: 15000, // 15000/20000 = 75% >= LAST_CONTAINER_MIN_FILL_RATIO mặc định (35%)
    });
    const suggestion = suggestBetterContainer({
      lastContainer: wellFilledContainer,
      currentTemplate: bigCurrentTemplate,
      cargoTemplatesById,
      containerLibrary: [bigCurrentTemplate, pricierMediumTruck, cheapSmallTruck],
    });
    expect(suggestion).toBeNull();
  });

  it('không loại nào khác xếp vừa hết (hàng quá khổ với mọi ứng viên nhỏ hơn) -> không gợi ý gì', () => {
    const oversizedTemplate: CargoTemplate = makeCargoTemplate({
      id: 'oversized-box',
      length: 3000, // vượt quá innerLength của cả 2 xe tải nhỏ (1500/4000... vẫn lớn hơn 1500)
      width: 300,
      height: 300,
      weight: 5,
      allowedOrientations: [[3000, 300, 300]],
    });
    const oversizedCargoTemplatesById = new Map<string, CargoTemplate>([[oversizedTemplate.id, oversizedTemplate]]);
    const container = makeLastContainer({
      placements: [makePlacement({ id: 'p1', cargoInstanceId: 'oversized-box__0', cargoTemplateId: 'oversized-box' })],
      totalWeight: 5,
      usedVolume: 3000 * 300 * 300,
    });

    const suggestion = suggestBetterContainer({
      lastContainer: container,
      currentTemplate: bigCurrentTemplate,
      cargoTemplatesById: oversizedCargoTemplatesById,
      containerLibrary: [bigCurrentTemplate, cheapSmallTruck], // cheapSmallTruck.innerLength=1500 < 3000
    });
    expect(suggestion).toBeNull();
  });

  it('container không có hàng gì (placements rỗng) -> không gợi ý gì', () => {
    const suggestion = suggestBetterContainer({
      lastContainer: makeLastContainer({ placements: [], totalWeight: 0, usedVolume: 0 }),
      currentTemplate: bigCurrentTemplate,
      cargoTemplatesById,
      containerLibrary: [bigCurrentTemplate, cheapSmallTruck],
    });
    expect(suggestion).toBeNull();
  });

  it('ứng viên THIẾU costPerTrip vẫn được chọn nếu nhỏ hơn hẳn ứng viên có costPerTrip (bug đã sửa: thiếu giá không còn bị coi là "chi phí vô cực")', () => {
    // Mô phỏng chính xác bug đã báo cáo: 1 container tiêu chuẩn khác (nhỏ hơn currentTemplate,
    // có costPerTrip) so với 1 xe tải nhỏ hơn NHIỀU (chưa có costPerTrip, vd vừa thêm vào thư viện
    // nhưng chưa có số liệu giá thị trường) — trước đây xe tải luôn thua vì bị coi là "vô cực",
    // giờ phải thắng vì thể tích nhỏ hơn hẳn.
    const otherStandardContainer: ContainerTemplate = {
      id: 'other-standard-with-cost',
      name: 'Container tiêu chuẩn khác (test, có giá)',
      standardType: '20FT_REEFER',
      innerLength: 3000,
      innerWidth: 2000,
      innerHeight: 2000,
      maxPayload: 15000,
      costPerTrip: 1_300_000, // có giá, nhưng ĐẮT hơn hẳn currentTemplate (1.000.000)
      isCustom: false,
    };
    const truckWithoutCost: ContainerTemplate = {
      id: 'truck-without-cost',
      name: 'Xe tải nhỏ (test, chưa có giá)',
      standardType: 'CUSTOM_TRUCK',
      innerLength: 1500,
      innerWidth: 1000,
      innerHeight: 1000,
      maxPayload: 800,
      // Không set costPerTrip — cố tình để undefined, đúng tình huống báo cáo bug.
      isCustom: false,
    };

    const suggestion = suggestBetterContainer({
      lastContainer: makeLastContainer(),
      currentTemplate: bigCurrentTemplate,
      cargoTemplatesById,
      containerLibrary: [bigCurrentTemplate, otherStandardContainer, truckWithoutCost],
    });

    expect(suggestion?.suggestedTemplateId).toBe(truckWithoutCost.id);
    // Không đủ dữ liệu costPerTrip của loại được chọn -> không tính được savings, phải là null chứ
    // không phải 0 hay 1 con số bịa ra.
    expect(suggestion?.estimatedSavings).toBeNull();
  });

  it('lô hàng rất nhỏ (vài trăm kg) trong solution thật dùng 20ft Standard -> gợi ý đúng xe tải nhỏ NHẤT (Porter H150), không còn gợi ý sang container tiêu chuẩn khác cùng cỡ (vd 20ft Reefer)', () => {
    const std20ft = STANDARD_CONTAINER_TEMPLATES.find((t) => t.standardType === '20FT')!;
    const porterH150 = STANDARD_CONTAINER_TEMPLATES.find((t) => t.id === 'std-truck-hyundai-porter-h150')!;
    expect(std20ft).toBeDefined();
    expect(porterH150).toBeDefined();

    const smallCargoTemplate: CargoTemplate = makeCargoTemplate({
      id: 'small-cargo',
      sku: 'SMALL-CARGO',
      name: 'Hàng dư thừa (~vài trăm kg)',
      length: 500,
      width: 500,
      height: 500,
      weight: 80,
      allowedOrientations: [[500, 500, 500]],
    });
    const realCargoTemplatesById = new Map<string, CargoTemplate>([[smallCargoTemplate.id, smallCargoTemplate]]);

    const lastContainer = makeLastContainer({
      templateId: std20ft.id,
      placements: [
        makePlacement({ id: 'p1', cargoInstanceId: 'small-cargo__0', cargoTemplateId: 'small-cargo' }),
        makePlacement({ id: 'p2', cargoInstanceId: 'small-cargo__1', cargoTemplateId: 'small-cargo' }),
        makePlacement({ id: 'p3', cargoInstanceId: 'small-cargo__2', cargoTemplateId: 'small-cargo' }),
        makePlacement({ id: 'p4', cargoInstanceId: 'small-cargo__3', cargoTemplateId: 'small-cargo' }),
      ],
      totalWeight: 4 * 80, // 320kg — "vài trăm kg" đúng như báo cáo
      usedVolume: 4 * 500 * 500 * 500, // 0.5 m³ — dưới 5% thể tích 20ft Standard (~33.2 m³)
    });

    const suggestion = suggestBetterContainer({
      lastContainer,
      currentTemplate: std20ft,
      cargoTemplatesById: realCargoTemplatesById,
      containerLibrary: STANDARD_CONTAINER_TEMPLATES,
    });

    expect(suggestion).not.toBeNull();
    expect(suggestion?.suggestedTemplateId).toBe(porterH150.id);
    expect(suggestion?.suggestedTemplateId).not.toBe(
      STANDARD_CONTAINER_TEMPLATES.find((t) => t.standardType === '20FT_REEFER')!.id,
    );
    expect(suggestion?.fillRatioBefore).toBeLessThan(0.05);
  });
});
