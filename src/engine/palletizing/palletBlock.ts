import type { CargoTemplate, PalletLoad, Placement, ToleranceSettings, UnfitCargo } from '../../domain/types';
import { applyToleranceClearance, palletGapOf } from '../tolerance';
import type { ExpandedCargoItem } from '../preprocessing/normalizeCargo';
import { getPalletType } from '../preprocessing/palletTypes';
import { palletTemplateKey } from '../constraints/templateKey';
import { palletizeTemplate } from './palletizeCargo';

// Pallet đã xếp thùng được đưa vào container như 1 KHỐI CỨNG: packContainer/revalidate coi nó như
// 1 kiện hộp L x W x H (H gồm đế + các lớp thùng), không bao giờ tách thùng khỏi pallet. Thùng bên
// trong vẫn được lưu vị trí (Placement.palletLoad) để hiển thị/thống kê theo thùng.

/**
 * CargoTemplate "đại diện" cho 1 pallet cụ thể của `template`: kích thước/khối lượng của cả khối,
 * chỉ xoay ngang tại chỗ (không lật pallet), số tầng chồng pallet lấy từ palletize.maxTiers.
 * `fragile`/`stackable` kế thừa từ thùng; `maxLoadOnTop` bỏ (giới hạn đó là của từng thùng, không
 * phải của cả pallet).
 */
export function makePalletBlockTemplate(template: CargoTemplate, load: PalletLoad, palletGap = 0): CargoTemplate {
  const pallet = getPalletType(load.palletType);
  const orientations: Array<[number, number, number]> = [[pallet.length, pallet.width, load.totalHeight]];
  if (pallet.length !== pallet.width) orientations.push([pallet.width, pallet.length, load.totalHeight]);
  const maxTiers = Math.max(1, Math.floor(template.palletize?.maxTiers ?? 1));

  return {
    ...template,
    length: pallet.length,
    width: pallet.width,
    height: load.totalHeight,
    // Khối lượng CẢ pallet vào container = hàng + bản thân pallet gỗ.
    weight: load.totalWeight + load.palletWeight,
    quantity: 1,
    rotation: 'YAW',
    mustKeepUpright: true,
    allowedOrientations: orientations,
    // stackLevel 0 = nằm sàn; chỉ cho đặt pallet lên pallet khi stackLevel mới <= maxTiers - 1.
    maxStackLevel: maxTiers - 1,
    maxLoadOnTop: undefined,
    palletize: undefined,
    // Khe giữa các pallet / pallet với vách = trường clearance sẵn có: mỗi phía palletGap/2 (hai pallet liền kề
    // cách nhau đúng palletGap; khe với vách được bổ sung bằng lề container, xem packContainer wallMargin).
    clearance: { left: palletGap / 2, right: palletGap / 2, front: palletGap / 2, back: palletGap / 2, top: 0, bottom: 0 },
  };
}

export function makePalletItem(template: CargoTemplate, load: PalletLoad, cargoInstanceId: string, palletGap = 0): ExpandedCargoItem {
  return {
    cargoInstanceId,
    cargoTemplateId: template.id,
    template: makePalletBlockTemplate(template, load, palletGap),
    palletLoad: load,
  };
}

const UNPALLETIZED_REASON_DEFAULT = 'NO_SPACE' as const;

export interface ExpandedCargo {
  items: ExpandedCargoItem[];
  /** Thùng của template bật palletize nhưng không xếp lên pallet nào được — coi là không xếp vừa. */
  unpalletized: UnfitCargo[];
}

/**
 * Nở CargoTemplate thành các mục cần xếp vào container: template thường -> từng kiện rời (như
 * expandCargoQuantity gốc); template bật `palletize` -> mỗi PALLET là 1 mục (khối cứng), thùng thừa
 * không lên pallet được trả riêng ở `unpalletized`.
 */
export function expandCargoWithPallets(templates: CargoTemplate[], settings?: ToleranceSettings): ExpandedCargo {
  const items: ExpandedCargoItem[] = [];
  const palletGap = palletGapOf(settings);
  const unpalletized: UnfitCargo[] = [];

  for (const template of templates) {
    // Dung sai của loại hàng được cộng vào clearance (xem tolerance.ts): kiểm tra va chạm dùng kích thước đã cộng
    // dung sai, 3D vẫn vẽ kích thước thật.
    const packTemplate = applyToleranceClearance(template, settings);
    const result = template.palletize ? palletizeTemplate(template, settings) : null;
    if (!result) {
      for (let i = 0; i < template.quantity; i++) {
        items.push({ cargoInstanceId: `${template.id}__${i}`, cargoTemplateId: template.id, template: packTemplate });
      }
      continue;
    }

    result.pallets.forEach((load, k) => {
      items.push(makePalletItem(template, load, `${template.id}__pallet__${k + 1}`, palletGap));
    });
    // Thùng thừa không đủ 1 lớp pallet: xếp RỜI vào khoảng trống container (cùng template thùng gốc).
    for (let i = 0; i < result.looseBoxCount; i++) {
      items.push({
        cargoInstanceId: `${template.id}__loose__${i}`,
        cargoTemplateId: template.id,
        template: packTemplate,
        palletLeftover: true,
      });
    }
    for (let i = 0; i < result.unpalletizedBoxCount; i++) {
      unpalletized.push({
        cargoInstanceId: `${template.id}__box__${i}`,
        cargoTemplateId: template.id,
        reason: result.reasonCode ?? UNPALLETIZED_REASON_DEFAULT,
        boxCount: 1,
      });
    }
  }
  return { items, unpalletized };
}

/**
 * Template dùng để kiểm tra constraint/xoay cho 1 placement cụ thể: placement là pallet -> template
 * khối cứng của pallet đó, ngược lại giữ nguyên template.
 */
export function resolveBlockTemplate(template: CargoTemplate, placement: Pick<Placement, 'palletLoad'>): CargoTemplate {
  return placement.palletLoad ? makePalletBlockTemplate(template, placement.palletLoad) : template;
}

/**
 * Bản đồ template theo cargoTemplateId, thay template của mọi SKU đang có pallet trong `placements`
 * bằng template khối cứng — dùng cho constraint của kiện BÊN DƯỚI (stacking: số tầng pallet, dễ vỡ).
 */
export function withPalletBlockTemplates(
  templatesById: Map<string, CargoTemplate>,
  placements: Placement[],
): Map<string, CargoTemplate> {
  let result: Map<string, CargoTemplate> | null = null;
  for (const p of placements) {
    if (!p.palletLoad) continue;
    const template = templatesById.get(p.cargoTemplateId);
    if (!template) continue;
    if (!result) result = new Map(templatesById);
    result.set(palletTemplateKey(p.cargoTemplateId), makePalletBlockTemplate(template, p.palletLoad));
  }
  return result ?? templatesById;
}
