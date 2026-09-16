import { describe, expect, it } from 'vitest';
import {
  buildCargoLineItems,
  buildContainerSummary,
  buildContainerReportHtml,
  buildPdfFileName,
} from '../../src/export/exportPdf';
import type { ContainerInstance } from '../../src/domain/types';
import { makeCargoTemplate } from '../fixtures/cargo';
import { makePlacement } from '../fixtures/placement';
import { smallTestContainer } from '../fixtures/containers';

function makeContainerInstance(overrides: Partial<ContainerInstance> = {}): ContainerInstance {
  return {
    id: 'container-1',
    templateId: smallTestContainer.id,
    index: 0,
    placements: [],
    extremePoints: [],
    totalWeight: 0,
    usedVolume: 0,
    centerOfGravity: { x: 0, y: 0, z: 0 },
    cgOffsetXRatio: 0,
    cgOffsetZRatio: 0,
    ...overrides,
  };
}

describe('buildCargoLineItems', () => {
  it('gom placements theo cargoTemplateId thành 1 dòng/SKU với đúng số lượng đã xếp', () => {
    const cargoA = makeCargoTemplate({ id: 'cargo-a', sku: 'SKU-A', name: 'Hàng A' });
    const cargoB = makeCargoTemplate({ id: 'cargo-b', sku: 'SKU-B', name: 'Hàng B' });
    const cargoTemplatesById = new Map([
      [cargoA.id, cargoA],
      [cargoB.id, cargoB],
    ]);

    const container = makeContainerInstance({
      placements: [
        makePlacement({ id: 'p1', cargoTemplateId: 'cargo-a' }),
        makePlacement({ id: 'p2', cargoTemplateId: 'cargo-a' }),
        makePlacement({ id: 'p3', cargoTemplateId: 'cargo-b' }),
      ],
    });

    const items = buildCargoLineItems(container, cargoTemplatesById);

    expect(items).toEqual([
      {
        sku: 'SKU-A',
        name: 'Hàng A',
        length: cargoA.length,
        width: cargoA.width,
        height: cargoA.height,
        weight: cargoA.weight,
        quantity: 2,
      },
      {
        sku: 'SKU-B',
        name: 'Hàng B',
        length: cargoB.length,
        width: cargoB.width,
        height: cargoB.height,
        weight: cargoB.weight,
        quantity: 1,
      },
    ]);
  });

  it('bỏ qua placement không tìm thấy cargoTemplate tương ứng (không lỗi)', () => {
    const container = makeContainerInstance({
      placements: [makePlacement({ id: 'p1', cargoTemplateId: 'unknown-cargo' })],
    });
    expect(buildCargoLineItems(container, new Map())).toEqual([]);
  });

  it('container không có placement nào trả về mảng rỗng', () => {
    expect(buildCargoLineItems(makeContainerInstance(), new Map())).toEqual([]);
  });
});

describe('buildContainerSummary', () => {
  it('tính đúng % lấp đầy thể tích và % tải trọng đã dùng', () => {
    const container = makeContainerInstance({
      totalWeight: 250, // = 50% của maxPayload 500 (smallTestContainer)
      usedVolume: 1_000_000_000, // 1 m³ trong container 2 m³ (2000x1000x1000mm)
    });

    const summary = buildContainerSummary(smallTestContainer, container);

    expect(summary.name).toBe(smallTestContainer.name);
    expect(summary.volumeM3).toBeCloseTo(2);
    expect(summary.usedVolumeM3).toBeCloseTo(1);
    expect(summary.volumeFillPercent).toBeCloseTo(50);
    expect(summary.payloadUsagePercent).toBeCloseTo(50);
  });

  it('maxPayload = 0 không chia cho 0 (trả về 0%, không NaN/Infinity)', () => {
    const summary = buildContainerSummary({ ...smallTestContainer, maxPayload: 0 }, makeContainerInstance());
    expect(summary.payloadUsagePercent).toBe(0);
  });
});

describe('buildPdfFileName', () => {
  it('dạng FreightFit-phuong-an-xep-hang-YYYY-MM-DD.pdf, không dấu/khoảng trắng', () => {
    const name = buildPdfFileName(new Date(2026, 8, 15)); // tháng 9 (0-based)
    expect(name).toBe('FreightFit-phuong-an-xep-hang-2026-09-15.pdf');
    expect(name).toMatch(/^[A-Za-z0-9-]+\.pdf$/);
  });
});

describe('buildContainerReportHtml', () => {
  it('chứa thông tin container, số trang "Container i/n" và bảng hàng hóa với đúng SKU/tên/số lượng', () => {
    const cargoA = makeCargoTemplate({ id: 'cargo-a', sku: 'SKU-A', name: 'Hàng đặc biệt <A>' });
    const summary = buildContainerSummary(smallTestContainer, makeContainerInstance({ totalWeight: 100 }));
    const html = buildContainerReportHtml({
      summary,
      lineItems: buildCargoLineItems(
        makeContainerInstance({ placements: [makePlacement({ cargoTemplateId: 'cargo-a' })] }),
        new Map([[cargoA.id, cargoA]]),
      ),
      containerIndex: 1,
      containerTotal: 3,
    });

    expect(html).toContain('Container 2/3');
    expect(html).toContain(smallTestContainer.name);
    expect(html).toContain('SKU-A');
    // Nội dung SKU/tên phải được escape HTML (tránh injection nếu SKU/tên chứa ký tự đặc biệt).
    expect(html).toContain('Hàng đặc biệt &lt;A&gt;');
    expect(html).not.toContain('Hàng đặc biệt <A>');
  });

  it('không có ảnh (imageDataUrl undefined) thì không chèn thẻ <img>', () => {
    const summary = buildContainerSummary(smallTestContainer, makeContainerInstance());
    const html = buildContainerReportHtml({ summary, lineItems: [], containerIndex: 0, containerTotal: 1 });
    expect(html).not.toContain('<img');
  });

  it('có imageDataUrl thì chèn đúng data URL vào thẻ <img>', () => {
    const summary = buildContainerSummary(smallTestContainer, makeContainerInstance());
    const html = buildContainerReportHtml({
      summary,
      lineItems: [],
      imageDataUrl: 'data:image/png;base64,AAAA',
      containerIndex: 0,
      containerTotal: 1,
    });
    expect(html).toContain('<img src="data:image/png;base64,AAAA"');
  });

  it('container rỗng (không có hàng) vẫn render bảng với thông báo, không lỗi', () => {
    const summary = buildContainerSummary(smallTestContainer, makeContainerInstance());
    const html = buildContainerReportHtml({ summary, lineItems: [], containerIndex: 0, containerTotal: 1 });
    expect(html).toContain('Không có hàng hóa nào được xếp trong container này.');
  });
});
