import type {
  CargoTemplate,
  PalletBoxRect,
  PalletizationResult,
  PalletLayer,
  PalletLoad,
  UnfitReason,
} from '../../domain/types';
import type { ToleranceSettings } from '../../domain/types';
import { PALLET_BASE_HEIGHT_MM, getPalletType } from '../preprocessing/palletTypes';
import { effectiveTolerance } from '../tolerance';

// Xếp thùng carton lên pallet (CHƯA đưa vào container) — xem docs/algorithm-design.md mục pallet.
// Quy tắc: mỗi pallet chỉ 1 SKU; xếp theo từng LỚP (mọi thùng trong 1 lớp cùng hướng đặt, mỗi lớp
// thử lại tất cả hướng đặt cho phép của thùng); dừng khi chạm chiều cao tối đa, khối lượng tối đa
// hoặc hết thùng; chỉ pallet cuối mới có thể thiếu thùng. Thùng dư không đủ 1 lớp xếp rời vào container.

const EPS = 1e-6;

function grid(
  x0: number,
  y0: number,
  regionL: number,
  regionW: number,
  boxL: number,
  boxW: number,
): PalletBoxRect[] {
  const cols = Math.floor((regionL + EPS) / boxL);
  const rows = Math.floor((regionW + EPS) / boxW);
  const rects: PalletBoxRect[] = [];
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      rects.push({ x: x0 + c * boxL, y: y0 + r * boxW, length: boxL, width: boxW });
    }
  }
  return rects;
}

/**
 * Cách đặt nhiều thùng a x b nhất trên mặt pallet L x W (cho phép xoay thùng 90° trong mặt phẳng):
 * thử mọi cách chia pallet thành 2 khối theo chiều dài hoặc chiều rộng, mỗi khối lưới 1 hướng (kể
 * cả 1 khối duy nhất = lưới thuần). Heuristic 2 khối, không đảm bảo tối ưu tuyệt đối.
 */
export function arrangeLayer(palletL: number, palletW: number, a: number, b: number): PalletBoxRect[] {
  const orients: Array<[number, number]> = [
    [a, b],
    [b, a],
  ];
  let best: PalletBoxRect[] = [];

  for (const [first, second] of [orients, [orients[1], orients[0]]] as Array<[[number, number], [number, number]]>) {
    // Chia theo chiều dài (x): i cột đầu hướng `first`, phần còn lại hướng `second`.
    for (let i = 0; i <= Math.floor((palletL + EPS) / first[0]); i++) {
      const splitX = i * first[0];
      const rects = [
        ...grid(0, 0, splitX, palletW, first[0], first[1]),
        ...grid(splitX, 0, palletL - splitX, palletW, second[0], second[1]),
      ];
      if (rects.length > best.length) best = rects;
    }
    // Chia theo chiều rộng (y).
    for (let i = 0; i <= Math.floor((palletW + EPS) / first[1]); i++) {
      const splitY = i * first[1];
      const rects = [
        ...grid(0, 0, palletL, splitY, first[0], first[1]),
        ...grid(0, splitY, palletL, palletW - splitY, second[0], second[1]),
      ];
      if (rects.length > best.length) best = rects;
    }
  }
  return best;
}

/**
 * Lớp THIẾU thùng (chỉ xảy ra ở lớp trên cùng): các thùng được lấy từ góc lưới nên dồn về 1 góc
 * pallet, nhìn như bị lệch/hụt và tải lệch tâm — dịch cả cụm vào GIỮA mặt pallet. Lớp đầy giữ nguyên.
 */
function centerBoxes(boxes: PalletBoxRect[], palletL: number, palletW: number): PalletBoxRect[] {
  const maxX = Math.max(...boxes.map((b) => b.x + b.length));
  const maxY = Math.max(...boxes.map((b) => b.y + b.width));
  const dx = (palletL - maxX) / 2;
  const dy = (palletW - maxY) / 2;
  if (dx <= EPS && dy <= EPS) return boxes;
  return boxes.map((b) => ({ ...b, x: b.x + Math.max(dx, 0), y: b.y + Math.max(dy, 0) }));
}

/**
 * Kế hoạch lớp của 1 pallet: MỌI lớp cùng 1 hướng đặt và cùng số thùng (`layerBoxes`), nên số thùng
 * trên pallet đầy luôn chia hết cho số thùng 1 lớp. Hướng được chọn là hướng cho pallet chứa NHIỀU
 * thùng nhất (số lớp vừa chiều cao x thùng/lớp, bị chặn bởi khối lượng tối đa); hòa thì ưu tiên lớp
 * nhiều thùng hơn rồi hướng thấp hơn.
 */
interface LayerPlan {
  orientation: [number, number, number];
  tolerance: number;       // dung sai mỗi chiều (mm): ô của mỗi thùng = kích thước thật + dung sai, thùng nằm giữa ô
  rects: PalletBoxRect[];  // toàn bộ ô của 1 lớp theo hướng này (có thể nhiều hơn layerBoxes nếu bị chặn khối lượng)
  layerBoxes: number;      // số thùng của 1 lớp đầy
  layersFit: number;       // số lớp tối đa theo chiều cao và khối lượng
  palletCapacity: number;  // layerBoxes * layersFit
}

function planLayers(
  palletL: number,
  palletW: number,
  maxLayerHeightTotal: number,
  maxBoxes: number,
  orientations: Array<[number, number, number]>,
  tolerance = 0,
): LayerPlan | null {
  let best: LayerPlan | null = null;
  for (const orientation of orientations) {
    const [l, w, h] = orientation;
    // Ô của thùng = kích thước thật + dung sai mỗi chiều (kể cả chiều cao: bước của mỗi lớp = h + dung sai).
    const rects = arrangeLayer(palletL, palletW, l + tolerance, w + tolerance);
    const pitch = h + tolerance;
    if (rects.length === 0 || pitch > maxLayerHeightTotal + EPS) continue;
    const layerBoxes = Math.min(rects.length, maxBoxes);
    const layersFit = Math.min(Math.floor((maxLayerHeightTotal + EPS) / pitch), Math.floor(maxBoxes / layerBoxes));
    if (layersFit < 1) continue;
    const plan: LayerPlan = { orientation, tolerance, rects, layerBoxes, layersFit, palletCapacity: layerBoxes * layersFit };
    if (
      !best ||
      plan.palletCapacity > best.palletCapacity ||
      (plan.palletCapacity === best.palletCapacity &&
        (plan.layerBoxes > best.layerBoxes || (plan.layerBoxes === best.layerBoxes && h < best.orientation[2])))
    ) {
      best = plan;
    }
  }
  return best;
}

/**
 * Lớp trên cùng CHƯA ĐẦY của pallet lẻ: dồn `count` thùng thành 1 KHỐI CHỮ NHẬT liền nhau (r hàng x k cột lưới
 * thuần, 1 hướng thùng) đặt sát 1 GÓC pallet (x = 0, y = 0) — không tạo bậc thang nhiều mức. Chọn khối có
 * nhiều thùng nhất (tối đa `count`), hòa thì khối vuông vức hơn. Khối luôn nằm trọn trên lớp đầy bên dưới.
 * Số thùng của khối có thể ít hơn `count` khi `count` không xếp được thành hình chữ nhật trong lưới; phần
 * thiếu (`count - boxes.length`) do nơi gọi chuyển thành thùng rời.
 */
export function rectangularCornerBlock(
  palletL: number,
  palletW: number,
  boxL: number,
  boxW: number,
  count: number,
): PalletBoxRect[] {
  let best: { a: number; b: number; cols: number; rows: number } | null = null;
  for (const [a, b] of [[boxL, boxW], [boxW, boxL]] as Array<[number, number]>) {
    const maxCols = Math.floor((palletL + EPS) / a);
    const maxRows = Math.floor((palletW + EPS) / b);
    for (let cols = 1; cols <= maxCols; cols++) {
      for (let rows = 1; rows <= maxRows; rows++) {
        const area = cols * rows;
        if (area > count) continue;
        const better =
          !best ||
          area > best.cols * best.rows ||
          (area === best.cols * best.rows && Math.abs(cols - rows) < Math.abs(best.cols - best.rows));
        if (better) best = { a, b, cols, rows };
      }
    }
  }
  if (!best) return [];
  const rects: PalletBoxRect[] = [];
  for (let i = 0; i < best.cols; i++) {
    for (let j = 0; j < best.rows; j++) {
      rects.push({ x: i * best.a, y: j * best.b, length: best.a, width: best.b });
    }
  }
  return rects;
}

/**
 * Xếp `boxes` thùng lên 1 pallet theo `plan`: đầy từng lớp (hết lớp này mới sang lớp tiếp). Chỉ lớp trên
 * cùng của pallet CUỐI (khi `boxes` không chia hết cho số thùng 1 lớp) mới thiếu thùng — lớp đó là 1 khối
 * chữ nhật liền ở góc pallet (rectangularCornerBlock). `leftover` = số thùng không vào được khối chữ nhật
 * (thành thùng rời).
 */
/** Ô (kích thước thật + dung sai) -> vị trí thùng thật: thụt vào tolerance/2 mỗi phía, thùng nằm giữa ô. */
function insetCells(cells: PalletBoxRect[], tolerance: number): PalletBoxRect[] {
  if (tolerance <= 0) return cells;
  return cells.map((c) => ({ x: c.x + tolerance / 2, y: c.y + tolerance / 2, length: c.length - tolerance, width: c.width - tolerance }));
}

function buildPalletLayers(
  plan: LayerPlan,
  boxes: number,
  palletL: number,
  palletW: number,
): { layers: PalletLayer[]; leftover: number } {
  const layers: PalletLayer[] = [];
  let left = boxes;
  let leftover = 0;
  while (left > 0) {
    const count = Math.min(plan.layerBoxes, left);
    if (count < plan.layerBoxes) {
      const cells = rectangularCornerBlock(palletL, palletW, plan.orientation[0] + plan.tolerance, plan.orientation[1] + plan.tolerance, count);
      const block = insetCells(cells, plan.tolerance);
      if (block.length > 0) layers.push({ orientation: plan.orientation, boxes: block });
      leftover = count - block.length;
    } else {
      const chosen = plan.rects.slice(0, count);
      const cells = count < plan.rects.length ? centerBoxes(chosen, palletL, palletW) : chosen;
      layers.push({ orientation: plan.orientation, boxes: insetCells(cells, plan.tolerance) });
    }
    left -= count;
  }
  return { layers, leftover };
}

/**
 * Xếp toàn bộ số thùng của 1 CargoTemplate (đã bật `palletize`) lên các pallet; trả về null nếu
 * template không bật xếp pallet. Thùng không thể xếp lên pallet nào (quá khổ mặt pallet, cao hơn
 * chiều cao tối đa, hoặc nặng hơn khối lượng tối đa) được tính vào `unpalletizedBoxCount` kèm `reason`.
 */
export function palletizeTemplate(template: CargoTemplate, settings?: ToleranceSettings): PalletizationResult | null {
  const params = template.palletize;
  if (!params) return null;

  // Dung sai mỗi chiều của loại hàng này (0 nếu tắt) — cộng vào kích thước thùng khi tính số thùng mỗi lớp,
  // vừa mặt pallet và số lớp theo chiều cao.
  const tolerance = effectiveTolerance(template, settings);

  const base: Omit<PalletizationResult, 'pallets' | 'unpalletizedBoxCount' | 'looseBoxCount'> = {
    cargoTemplateId: template.id,
    sku: template.sku,
    params,
    tolerance,
  };
  const fail = (reason: string, reasonCode: UnfitReason): PalletizationResult => ({
    ...base,
    pallets: [],
    unpalletizedBoxCount: template.quantity,
    looseBoxCount: 0,
    reason,
    reasonCode,
  });

  const pallet = getPalletType(params.palletType);
  const maxLayerHeightTotal = params.maxHeight - PALLET_BASE_HEIGHT_MM;
  if (!(maxLayerHeightTotal > 0)) {
    return fail(`Chiều cao tối đa phải lớn hơn ${PALLET_BASE_HEIGHT_MM / 10} cm (đế pallet).`, 'ROTATION_CONFLICT');
  }
  if (!(params.maxWeight > 0)) return fail('Khối lượng tối đa mỗi pallet phải > 0.', 'OVERWEIGHT');

  const maxBoxes = Math.floor((params.maxWeight + EPS) / template.weight);
  if (maxBoxes < 1) return fail(`Mỗi thùng nặng ${template.weight} kg, vượt khối lượng tối đa của pallet.`, 'OVERWEIGHT');

  // Chỉ giữ hướng đặt vừa chiều cao cho phép VÀ có thể đặt ít nhất 1 thùng lên mặt pallet.
  const orientations = template.allowedOrientations.filter(
    ([l, w, h]) =>
      h + tolerance <= maxLayerHeightTotal + EPS && arrangeLayer(pallet.length, pallet.width, l + tolerance, w + tolerance).length > 0,
  );
  if (orientations.length === 0) {
    const fitsFootprint = template.allowedOrientations.some(
      ([l, w]) => arrangeLayer(pallet.length, pallet.width, l + tolerance, w + tolerance).length > 0,
    );
    return fail(
      fitsFootprint
        ? 'Thùng cao hơn chiều cao tối đa của pallet (sau khi trừ đế).'
        : `Thùng lớn hơn mặt pallet ${pallet.label}.`,
      'ROTATION_CONFLICT',
    );
  }

  // Kế hoạch lớp: số thùng 1 lớp đầy và sức chứa 1 pallet đầy. Thùng thừa ít hơn 1 lớp đầy thì không đặt
  // lên pallet mà xếp rời vào khoảng trống container.
  const plan = planLayers(pallet.length, pallet.width, maxLayerHeightTotal, maxBoxes, orientations, tolerance);
  if (!plan) return fail('Không xếp được lớp thùng nào lên pallet với giới hạn chiều cao/khối lượng này.', 'NO_SPACE');
  const fullCapacity = plan.palletCapacity;
  const layerCapacity = plan.layerBoxes;

  const toLoad = (layers: PalletLayer[], index: number, isPartial: boolean): PalletLoad => {
    const boxCount = layers.reduce((sum, layer) => sum + layer.boxes.length, 0);
    return {
      id: `${template.id}-pallet-${index + 1}`,
      cargoTemplateId: template.id,
      sku: template.sku,
      palletType: params.palletType,
      layers,
      boxCount,
      totalWeight: boxCount * template.weight,
      palletWeight: pallet.weight,
      totalHeight: PALLET_BASE_HEIGHT_MM + layers.reduce((sum, layer) => sum + layer.orientation[2] + tolerance, 0),
      tolerance,
      isPartial,
    };
  };

  // Xếp đầy pallet trước: mỗi pallet nhận tối đa số thùng cho phép theo chiều cao và khối lượng, gồm toàn
  // các lớp đầy (hết lớp này mới sang lớp tiếp), rồi mới sang pallet kế. Phần dư dồn vào pallet CUỐI — chỉ
  // pallet cuối mới có lớp trên cùng chưa đầy. Phần dư ít hơn 1 lớp (không đủ lập pallet) xếp rời.
  const pallets: PalletLoad[] = [];
  let remaining = template.quantity;
  let looseBoxCount = 0;
  while (remaining > 0) {
    if (remaining < layerCapacity) {
      looseBoxCount = remaining;
      break;
    }
    const boxCount = Math.min(remaining, fullCapacity);
    const { layers, leftover } = buildPalletLayers(plan, boxCount, pallet.length, pallet.width);
    pallets.push(toLoad(layers, pallets.length, boxCount < fullCapacity));
    // Thùng của lớp trên cùng không vào được khối chữ nhật liền -> xếp rời trong container.
    looseBoxCount += leftover;
    remaining -= boxCount;
  }

  const placed = pallets.reduce((sum, p) => sum + p.boxCount, 0);
  const unpalletizedBoxCount = template.quantity - placed - looseBoxCount;
  return unpalletizedBoxCount > 0
    ? { ...base, pallets, unpalletizedBoxCount, looseBoxCount, reason: 'Không xếp thêm được thùng nào lên pallet.', reasonCode: 'NO_SPACE' }
    : { ...base, pallets, unpalletizedBoxCount, looseBoxCount };
}

export function palletizeAll(templates: CargoTemplate[], settings?: ToleranceSettings): PalletizationResult[] {
  return templates.map((t) => palletizeTemplate(t, settings)).filter((r): r is PalletizationResult => r !== null);
}
