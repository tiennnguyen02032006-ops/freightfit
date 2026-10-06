import { describe, expect, it } from 'vitest';
import { expandCargoWithPallets, makePalletBlockTemplate, resolveBlockTemplate } from '../../../src/engine/palletizing/palletBlock';
import { palletizeTemplate } from '../../../src/engine/palletizing/palletizeCargo';
import { makeCargoTemplate } from '../../fixtures/cargo';
import { palletCarton } from '../../fixtures/pallet';

describe('makePalletBlockTemplate', () => {
  it('khối cứng: kích thước/khối lượng của cả pallet, chỉ xoay ngang, số tầng theo maxTiers', () => {
    const template = palletCarton({}, 3);
    const load = palletizeTemplate(template)!.pallets[0];
    const block = makePalletBlockTemplate(template, load);

    expect([block.length, block.width, block.height]).toEqual([1200, 800, load.totalHeight]);
    // Khối lượng cả pallet = hàng + bản thân pallet gỗ (120x80: 25kg).
    expect(load.palletWeight).toBe(25);
    expect(block.weight).toBe(load.totalWeight + load.palletWeight);
    expect(block.allowedOrientations).toEqual([
      [1200, 800, load.totalHeight],
      [800, 1200, load.totalHeight],
    ]);
    expect(block.maxStackLevel).toBe(2); // 3 tầng pallet = stackLevel 0..2
    expect(block.mustKeepUpright).toBe(true);
  });

  it('pallet vuông chỉ có 1 hướng; resolveBlockTemplate giữ nguyên template khi không phải pallet', () => {
    const template = palletCarton({ palletize: { palletType: '110x110', maxHeight: 1150, maxWeight: 1000 } });
    const load = palletizeTemplate(template)!.pallets[0];
    expect(makePalletBlockTemplate(template, load).allowedOrientations).toHaveLength(1);
    expect(makePalletBlockTemplate(template, load).maxStackLevel).toBe(0); // mặc định 1 tầng
    expect(resolveBlockTemplate(template, {})).toBe(template);
  });
});

describe('expandCargoWithPallets', () => {
  it('template bật palletize nở thành từng pallet, template thường vẫn nở thành từng kiện', () => {
    const palletized = palletCarton({ quantity: 70 }); // 2 pallet đầy 32 + 6 thùng rời (không đủ 1 lớp)
    const loose = makeCargoTemplate({ id: 'loose', quantity: 3 });
    const { items, unpalletized } = expandCargoWithPallets([palletized, loose]);

    const palletItems = items.filter((i) => i.palletLoad);
    expect(palletItems).toHaveLength(2);
    expect(palletItems.map((i) => i.palletLoad!.boxCount)).toEqual([32, 32]);
    expect(palletItems.every((i) => i.cargoTemplateId === 'carton')).toBe(true);
    const leftovers = items.filter((i) => i.palletLeftover);
    expect(leftovers).toHaveLength(6);
    expect(leftovers.every((i) => i.cargoTemplateId === 'carton' && !i.palletLoad && i.template === palletized)).toBe(true);
    expect(items.filter((i) => i.cargoTemplateId === 'loose')).toHaveLength(3);
    expect(unpalletized).toEqual([]);
  });

  it('thùng không lên pallet được -> trả về danh sách không xếp vừa kèm lý do', () => {
    const tooHeavy = palletCarton({ weight: 50, palletize: { palletType: '120x80', maxHeight: 1150, maxWeight: 40 } });
    const { items, unpalletized } = expandCargoWithPallets([tooHeavy]);
    expect(items).toEqual([]);
    expect(unpalletized).toHaveLength(70);
    expect(unpalletized[0]).toMatchObject({ cargoTemplateId: 'carton', reason: 'OVERWEIGHT', boxCount: 1 });
  });
});
