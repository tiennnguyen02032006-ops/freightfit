import { BoxGeometry, BufferGeometry } from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { DunnageAxis, DunnageBag, DunnageGap } from '../../domain/types';

// Hình học/mô tả thuần cho lớp "Chèn lót" trong khung 3D (DunnageLayer3D): túi khí là MỘT geometry chung
// vẽ bằng InstancedMesh, mỗi túi chỉ khác ma trận (vị trí + xoay + tỷ lệ) -> số draw call không đổi dù có
// hàng trăm khe.

export interface InstanceTransform {
  /** Tâm theo trục three (x, y lên trên, z) = engine (x, z, y). */
  position: [number, number, number];
  /** Góc xoay Euler (rad). */
  rotation: [number, number, number];
  /** Tỷ lệ theo trục cục bộ của geometry (xem createPillowGeometry: trục mỏng là Y). */
  scale: [number, number, number];
}

/**
 * Túi khí dạng "gối": hộp đơn vị bo góc, dày nhất ở GIỮA (chạm khít 2 mặt khe), mỏng dần về mép (phình nhẹ
 * ở giữa). Trục mỏng (bề dày khe) là Y cục bộ, X/Z là 2 chiều mặt túi — kích thước thật do tỷ lệ instance.
 * Bán kính bo nhỏ (theo đơn vị) vì tỷ lệ instance không đồng đều.
 */
export function createPillowGeometry(segments = 8, radius = 0.08, rimThickness = 0.72): BufferGeometry {
  const box = new BoxGeometry(1, 1, 1, segments, segments, segments);
  box.deleteAttribute('normal');
  box.deleteAttribute('uv');
  const geometry = mergeVertices(box); // hàn đỉnh trùng để pháp tuyến mượt qua cạnh
  box.dispose();

  const position = geometry.getAttribute('position');
  const inner = 0.5 - radius;
  for (let i = 0; i < position.count; i++) {
    let x = position.getX(i);
    let y = position.getY(i);
    let z = position.getZ(i);

    // bo góc: kéo đỉnh về mặt cầu bán kính `radius` quanh hộp lõi
    const cx = Math.max(-inner, Math.min(inner, x));
    const cy = Math.max(-inner, Math.min(inner, y));
    const cz = Math.max(-inner, Math.min(inner, z));
    const dx = x - cx;
    const dy = y - cy;
    const dz = z - cz;
    const len = Math.hypot(dx, dy, dz);
    if (len > 1e-9) {
      x = cx + (dx / len) * radius;
      y = cy + (dy / len) * radius;
      z = cz + (dz / len) * radius;
    }

    // phình ở giữa: bề dày giảm dần về mép (e = 0 ở tâm, 1 ở mép)
    const e = Math.min(1, Math.max(Math.abs(2 * x), Math.abs(2 * z)));
    y *= 1 - (1 - rimThickness) * e * e;

    position.setXYZ(i, x, y, z);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

const center = (b: DunnageBag): [number, number, number] => [b.x + b.length / 2, b.z + b.height / 2, b.y + b.width / 2];

/**
 * Ma trận cho 1 túi khí trong khe theo trục `axis`, sao cho trục mỏng của geometry trùng trục khe và túi
 * lấp VỪA KHÍT ô: trục khe theo chiều dài (x) -> xoay Z 90°; theo chiều rộng (y) -> xoay X 90°.
 */
export function bagTransform(bag: DunnageBag, axis: DunnageAxis): InstanceTransform {
  if (axis === 'LENGTH') {
    // local X -> three Y (cao), local Y -> three X (bề dày khe), local Z -> three Z (rộng)
    return { position: center(bag), rotation: [0, 0, Math.PI / 2], scale: [bag.height, bag.length, bag.width] };
  }
  // local X -> three X (dài), local Y -> three Z (bề dày khe), local Z -> three Y (cao)
  return { position: center(bag), rotation: [Math.PI / 2, 0, 0], scale: [bag.length, bag.width, bag.height] };
}


/** Các dòng mô tả hiện khi rê chuột/bấm vào 1 khe. */
export function describeDunnageGap(gap: DunnageGap): string[] {
  const round = (n: number) => Math.round(n);
  const cell = gap.bags[0];

  if (gap.source === 'CENTER') {
    const stack = cell?.stackCount ?? 1;
    const rows = new Set(gap.bags.map((b) => round(b.x))).size;
    const bagHeightCm = cell ? round(cell.height / 10) : 0;
    const size = cell?.sizeLabel ?? '';
    const height =
      stack > 1
        ? `${stack} túi chồng, mỗi túi cao ${bagHeightCm} cm (tổng ${round((cell?.height ?? 0) * stack / 10)} cm)`
        : `cao ${bagHeightCm} cm`;
    return [
      `Khe giữa hai cột pallet: ${round(gap.gapSize / 10)} cm`,
      `Cỡ túi ${size} — ${height}`,
      `Cần ${gap.bagCount} túi khí cho ${rows} hàng pallet`,
    ];
  }

  const horizontal = gap.axis === 'LENGTH' ? gap.width : gap.length;
  const face = `${round(horizontal)} × ${round(gap.height)} mm`;
  const where = gap.wall ? ' · sát vách/cửa container' : '';
  const cellH = cell ? (gap.axis === 'LENGTH' ? cell.width : cell.length) : horizontal;
  const cellV = cell ? cell.height : gap.height;
  const nV = Math.max(1, round(gap.height / cellV));
  const nH = Math.max(1, round(horizontal / cellH));
  return [
    `Khe ${round(gap.gapSize)} mm${where}`,
    `Mặt khe: ${face}`,
    `Cần ${gap.bagCount} túi khí${cell?.sizeLabel ? ` cỡ ${cell.sizeLabel}` : ''} (${nH} × ${nV}, mỗi túi ≈ ${round(cellH)} × ${round(cellV)} mm)`,
  ];
}
