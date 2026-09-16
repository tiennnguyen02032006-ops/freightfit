import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import type { CargoTemplate, ContainerInstance, ContainerTemplate } from '../domain/types';
import { formatMmAsCm, formatNumber } from '../components/shared/formatUnits';

/**
 * Xuất báo cáo PDF cho phương án xếp hàng. Phần PHÂN TÍCH DỮ LIỆU (gom nhóm hàng hóa, tính %
 * lấp đầy, tên file...) là các hàm thuần túy (test được không cần DOM/canvas — xem
 * tests/export/exportPdf.test.ts). Phần DỰNG PDF THẬT (buildContainerReportHtml -> html2canvas
 * -> jsPDF) cần `document`/canvas nên chỉ chạy được trong trình duyệt, KHÔNG test tự động —
 * chấp nhận được vì đây là lớp "vẽ ảnh", không chứa logic nghiệp vụ.
 *
 * Ảnh chụp sơ đồ xếp hàng 3D của từng container (renderer.domElement.toDataURL) được CHỤP Ở NƠI
 * KHÁC (ContainerScene.tsx — nơi duy nhất có tham chiếu tới WebGLRenderer đang sống và có thể đổi
 * container đang xem qua store) rồi truyền vào đây dưới dạng `imageDataUrl` thuần túy — module
 * này không tự biết gì về Three.js/store, giữ đúng ranh giới "export/ tách khỏi UI component".
 */

export interface CargoLineItem {
  sku: string;
  name: string;
  length: number; // mm
  width: number; // mm
  height: number; // mm
  weight: number; // kg / 1 kiện
  quantity: number; // số kiện của SKU này đã xếp trong container đang xét
}

export interface ContainerReportSummary {
  name: string;
  standardType: string;
  sizeLabelCm: string;
  maxPayloadKg: number;
  volumeM3: number;
  usedWeightKg: number;
  usedVolumeM3: number;
  itemCount: number;
  volumeFillPercent: number;
  payloadUsagePercent: number;
}

export interface ContainerReportInput {
  containerTemplate: ContainerTemplate;
  container: ContainerInstance;
  cargoTemplatesById: Map<string, CargoTemplate>;
  // Ảnh chụp scene 3D (PNG data URL) của ĐÚNG container này — optional, bỏ qua khối ảnh trong
  // report nếu không chụp được (vd trình duyệt chặn WebGL) thay vì làm hỏng cả report.
  imageDataUrl?: string;
}

/**
 * Gom placements (từng kiện vật lý riêng lẻ, đã "nở" theo quantity lúc pack — xem
 * domain/types.ts Placement) trong 1 container theo cargoTemplateId -> 1 dòng/SKU với số lượng đã
 * xếp thực tế trong container đó. Sắp theo SKU để thứ tự ổn định giữa các lần xuất.
 */
export function buildCargoLineItems(
  container: ContainerInstance,
  cargoTemplatesById: Map<string, CargoTemplate>,
): CargoLineItem[] {
  const quantityByTemplateId = new Map<string, number>();
  for (const placement of container.placements) {
    quantityByTemplateId.set(
      placement.cargoTemplateId,
      (quantityByTemplateId.get(placement.cargoTemplateId) ?? 0) + 1,
    );
  }

  const items: CargoLineItem[] = [];
  for (const [templateId, quantity] of quantityByTemplateId) {
    const template = cargoTemplatesById.get(templateId);
    if (!template) continue;
    items.push({
      sku: template.sku,
      name: template.name,
      length: template.length,
      width: template.width,
      height: template.height,
      weight: template.weight,
      quantity,
    });
  }
  return items.sort((a, b) => a.sku.localeCompare(b.sku));
}

/** Số liệu tổng hợp (thông tin container + thống kê đã dùng) cho 1 container — thuần túy. */
export function buildContainerSummary(
  containerTemplate: ContainerTemplate,
  container: ContainerInstance,
): ContainerReportSummary {
  const volumeM3 =
    (containerTemplate.innerLength * containerTemplate.innerWidth * containerTemplate.innerHeight) /
    1_000_000_000;
  const usedVolumeM3 = container.usedVolume / 1_000_000_000;

  return {
    name: containerTemplate.name,
    standardType: containerTemplate.standardType,
    sizeLabelCm: `${formatMmAsCm(containerTemplate.innerLength)} × ${formatMmAsCm(
      containerTemplate.innerWidth,
    )} × ${formatMmAsCm(containerTemplate.innerHeight)} cm`,
    maxPayloadKg: containerTemplate.maxPayload,
    volumeM3,
    usedWeightKg: container.totalWeight,
    usedVolumeM3,
    itemCount: container.placements.length,
    volumeFillPercent: volumeM3 > 0 ? (usedVolumeM3 / volumeM3) * 100 : 0,
    payloadUsagePercent:
      containerTemplate.maxPayload > 0 ? (container.totalWeight / containerTemplate.maxPayload) * 100 : 0,
  };
}

/** "FreightFit-phuong-an-xep-hang-2026-09-15.pdf" — không dấu, không khoảng trắng, dễ mở lại. */
export function buildPdfFileName(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `FreightFit-phuong-an-xep-hang-${y}-${m}-${d}.pdf`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const TH_STYLE = 'padding:5px 6px; text-align:left; font-weight:600;';
const TD_STYLE = 'padding:5px 6px; border-bottom:1px solid #e4e6eb;';

export interface ContainerReportHtmlInput {
  summary: ContainerReportSummary;
  lineItems: CargoLineItem[];
  imageDataUrl?: string;
  containerIndex: number; // 0-based
  containerTotal: number;
}

/**
 * Dựng nội dung report của 1 container thành 1 chuỗi HTML tự chứa (inline style, không phụ thuộc
 * CSS của app) — chỉ ghép chuỗi thuần túy, KHÔNG đụng DOM nên test được trực tiếp dưới Node (xem
 * tests/export/exportPdf.test.ts). Chuỗi này sau đó được render off-screen rồi chụp bằng
 * html2canvas ở generatePackingSolutionPdf bên dưới — render qua trình duyệt thật để chữ tiếng
 * Việt có dấu hiển thị đúng (font chữ vector mặc định của jsPDF không có đủ ký tự tiếng Việt).
 */
export function buildContainerReportHtml(input: ContainerReportHtmlInput): string {
  const { summary, lineItems, imageDataUrl, containerIndex, containerTotal } = input;

  const rows = lineItems
    .map(
      (item, i) => `
        <tr style="background:${i % 2 === 0 ? '#ffffff' : '#f7f8fa'};">
          <td style="${TD_STYLE}">${escapeHtml(item.sku)}</td>
          <td style="${TD_STYLE}">${escapeHtml(item.name)}</td>
          <td style="${TD_STYLE} text-align:right;">${formatMmAsCm(item.length)} × ${formatMmAsCm(
            item.width,
          )} × ${formatMmAsCm(item.height)} cm</td>
          <td style="${TD_STYLE} text-align:right;">${formatNumber(item.weight, 1)} kg</td>
          <td style="${TD_STYLE} text-align:right;">${item.quantity}</td>
        </tr>`,
    )
    .join('');

  const imageBlock = imageDataUrl
    ? `<img src="${imageDataUrl}" style="width:100%; display:block; border:1px solid #d0d3da; border-radius:6px; margin:12px 0;" />`
    : '';

  return `
    <div style="font-family: Arial, 'Segoe UI', sans-serif; color:#1a1d24; background:#ffffff; padding:28px; box-sizing:border-box; width:100%;">
      <div style="display:flex; justify-content:space-between; align-items:baseline; border-bottom:2px solid #1a1d24; padding-bottom:10px; margin-bottom:18px;">
        <div style="font-size:19px; font-weight:700;">FreightFit — Báo cáo phương án xếp hàng</div>
        <div style="font-size:12px; color:#666;">Container ${containerIndex + 1}/${containerTotal}</div>
      </div>

      <div style="font-size:16px; font-weight:700; margin-bottom:6px;">${escapeHtml(summary.name)} (${escapeHtml(
        summary.standardType,
      )})</div>
      <table style="width:100%; font-size:12px; border-collapse:collapse; margin-bottom:10px;">
        <tbody>
          <tr>
            <td style="padding:2px 0; color:#555;">Kích thước lòng trong:</td>
            <td style="padding:2px 0; text-align:right; font-weight:600;">${summary.sizeLabelCm}</td>
            <td style="padding:2px 0 2px 28px; color:#555;">Trọng lượng tối đa:</td>
            <td style="padding:2px 0; text-align:right; font-weight:600;">${formatNumber(
              summary.maxPayloadKg,
              0,
            )} kg</td>
          </tr>
          <tr>
            <td style="padding:2px 0; color:#555;">Thể tích lòng trong:</td>
            <td style="padding:2px 0; text-align:right; font-weight:600;">${formatNumber(summary.volumeM3)} m³</td>
            <td style="padding:2px 0 2px 28px; color:#555;">Số kiện hàng đã xếp:</td>
            <td style="padding:2px 0; text-align:right; font-weight:600;">${summary.itemCount}</td>
          </tr>
        </tbody>
      </table>

      <div style="display:flex; gap:16px; margin:14px 0; font-size:12px;">
        <div style="flex:1; background:#f2f4f7; border-radius:8px; padding:10px 16px;">
          <div style="color:#666;">Trọng lượng đã xếp</div>
          <div style="font-size:17px; font-weight:700;">${formatNumber(summary.usedWeightKg, 0)} / ${formatNumber(
            summary.maxPayloadKg,
            0,
          )} kg</div>
          <div style="color:#666;">${formatNumber(summary.payloadUsagePercent, 0)}% tải trọng</div>
        </div>
        <div style="flex:1; background:#f2f4f7; border-radius:8px; padding:10px 16px;">
          <div style="color:#666;">Thể tích đã xếp</div>
          <div style="font-size:17px; font-weight:700;">${formatNumber(summary.usedVolumeM3)} / ${formatNumber(
            summary.volumeM3,
          )} m³</div>
          <div style="color:#666;">${formatNumber(summary.volumeFillPercent, 0)}% lấp đầy</div>
        </div>
      </div>

      ${imageBlock}

      <div style="font-size:14px; font-weight:700; margin:16px 0 6px;">Danh sách hàng hóa đã xếp (${
        lineItems.length
      } loại hàng)</div>
      <table style="width:100%; font-size:11.5px; border-collapse:collapse;">
        <thead>
          <tr style="background:#1a1d24; color:#ffffff;">
            <th style="${TH_STYLE}">SKU</th>
            <th style="${TH_STYLE}">Tên hàng</th>
            <th style="${TH_STYLE} text-align:right;">Kích thước (D×R×C)</th>
            <th style="${TH_STYLE} text-align:right;">Trọng lượng/kiện</th>
            <th style="${TH_STYLE} text-align:right;">Số lượng</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td style="${TD_STYLE}" colspan="5">Không có hàng hóa nào được xếp trong container này.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

// Bề rộng khung render off-screen (px, ~ khổ A4 96dpi) — cố định để layout HTML luôn nhất quán
// bất kể kích thước cửa sổ trình duyệt đang chạy app.
const REPORT_WIDTH_PX = 794;
const PAGE_MARGIN_MM = 12;

/**
 * Render 1 report HTML (đã dựng bởi buildContainerReportHtml) off-screen, chụp bằng html2canvas
 * rồi cắt thành nhiều trang PDF nếu nội dung dài hơn 1 trang A4 (bảng hàng hóa có thể rất dài) —
 * mỗi trang vật lý đều có chân trang "Container i/n" (chữ không dấu, vẽ thẳng bằng jsPDF nên
 * không cần font tiếng Việt riêng).
 */
async function addReportPagesToDoc(
  doc: jsPDF,
  html: string,
  containerIndex: number,
  containerTotal: number,
  isFirstReport: boolean,
): Promise<void> {
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-10000px';
  host.style.top = '0';
  host.style.width = `${REPORT_WIDTH_PX}px`;
  host.innerHTML = html;
  document.body.appendChild(host);

  try {
    const canvas = await html2canvas(host, { scale: 2, backgroundColor: '#ffffff', useCORS: true });

    const pageWidthMm = doc.internal.pageSize.getWidth();
    const pageHeightMm = doc.internal.pageSize.getHeight();
    const usableWidthMm = pageWidthMm - PAGE_MARGIN_MM * 2;
    const usableHeightMm = pageHeightMm - PAGE_MARGIN_MM * 2 - 6; // chừa chỗ chân trang

    const pxPerMm = canvas.width / usableWidthMm;
    const pageHeightPx = Math.max(1, Math.floor(usableHeightMm * pxPerMm));

    let renderedPx = 0;
    let isFirstPageOfContainer = true;
    while (renderedPx < canvas.height) {
      if (!(isFirstReport && isFirstPageOfContainer)) doc.addPage();
      isFirstPageOfContainer = false;

      const sliceHeightPx = Math.min(pageHeightPx, canvas.height - renderedPx);
      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = sliceHeightPx;
      const ctx = sliceCanvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(canvas, 0, renderedPx, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx);
        const sliceHeightMm = sliceHeightPx / pxPerMm;
        doc.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', PAGE_MARGIN_MM, PAGE_MARGIN_MM, usableWidthMm, sliceHeightMm);
      }

      doc.setFontSize(9);
      doc.setTextColor(130);
      doc.text(`Container ${containerIndex + 1}/${containerTotal}`, pageWidthMm - PAGE_MARGIN_MM, pageHeightMm - 7, {
        align: 'right',
      });

      renderedPx += sliceHeightPx;
    }
  } finally {
    document.body.removeChild(host);
  }
}

/** Dựng file PDF hoàn chỉnh (nhiều container = nhiều trang, cùng 1 file) — trả về jsPDF instance. */
export async function generatePackingSolutionPdf(reports: ContainerReportInput[]): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  for (let i = 0; i < reports.length; i++) {
    const report = reports[i];
    const summary = buildContainerSummary(report.containerTemplate, report.container);
    const lineItems = buildCargoLineItems(report.container, report.cargoTemplatesById);
    const html = buildContainerReportHtml({
      summary,
      lineItems,
      imageDataUrl: report.imageDataUrl,
      containerIndex: i,
      containerTotal: reports.length,
    });
    await addReportPagesToDoc(doc, html, i, reports.length, i === 0);
  }

  return doc;
}

/** Dựng PDF rồi tải xuống ngay (tên file theo buildPdfFileName) — điểm gọi chính từ UI. */
export async function downloadPackingSolutionPdf(reports: ContainerReportInput[]): Promise<void> {
  const doc = await generatePackingSolutionPdf(reports);
  doc.save(buildPdfFileName());
}
