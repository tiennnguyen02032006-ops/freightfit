import type { Placement } from '../../domain/types';
import { PALLET_BASE_HEIGHT_MM } from '../../engine/preprocessing/palletTypes';

// Hình học thuần (không Three.js) cho việc vẽ pallet bằng InstancedMesh/LineSegments gộp — giữ ở
// dạng hàm thuần để test được và để PalletBlock3D chỉ còn nhiệm vụ đẩy dữ liệu lên GPU.

const DECK_THICKNESS = 22;
const RUNNER_THICKNESS = 18;
const BLOCK_SIZE = 100;
const RUNNER_WIDTH = 90;

export interface PalletBasePart {
  /** Tâm của bộ phận, toạ độ three (x, y lên trên, z) so với tâm đế pallet. */
  position: [number, number, number];
  /** Kích thước theo trục three (x, y, z). */
  size: [number, number, number];
  kind: 'deck' | 'runner' | 'block';
}

/**
 * Đế pallet gỗ: 1 mặt trên + 3 thanh đáy + 9 chân kê (3x3) = 13 bộ phận, chạy dọc theo cạnh DÀI.
 * lengthX/widthZ là kích thước mặt bằng theo trục three x/z (đã tính cả khi pallet xoay 90°).
 */
export function palletBaseParts(lengthX: number, widthZ: number, height = PALLET_BASE_HEIGHT_MM): PalletBasePart[] {
  const alongX = lengthX >= widthZ;
  const long = alongX ? lengthX : widthZ;
  const short = alongX ? widthZ : lengthX;
  const blockHeight = Math.max(height - DECK_THICKNESS - RUNNER_THICKNESS, 1);

  const toXZ = (a: number, b: number): [number, number] => (alongX ? [a, b] : [b, a]);
  const sizeXZ = (sa: number, sb: number): [number, number] => (alongX ? [sa, sb] : [sb, sa]);

  const aSlots = [-long / 2 + BLOCK_SIZE / 2, 0, long / 2 - BLOCK_SIZE / 2];
  const bSlots = [-short / 2 + RUNNER_WIDTH / 2, 0, short / 2 - RUNNER_WIDTH / 2];

  const parts: PalletBasePart[] = [];
  const [deckX, deckZ] = sizeXZ(long, short);
  parts.push({ position: [0, height / 2 - DECK_THICKNESS / 2, 0], size: [deckX, DECK_THICKNESS, deckZ], kind: 'deck' });

  const [runnerX, runnerZ] = sizeXZ(long, RUNNER_WIDTH);
  for (const b of bSlots) {
    const [x, z] = toXZ(0, b);
    parts.push({
      position: [x, -height / 2 + RUNNER_THICKNESS / 2, z],
      size: [runnerX, RUNNER_THICKNESS, runnerZ],
      kind: 'runner',
    });
  }

  const [blockX, blockZ] = sizeXZ(BLOCK_SIZE, RUNNER_WIDTH);
  for (const a of aSlots) {
    for (const b of bSlots) {
      const [x, z] = toXZ(a, b);
      parts.push({
        position: [x, -height / 2 + RUNNER_THICKNESS + blockHeight / 2, z],
        size: [blockX, blockHeight, blockZ],
        kind: 'block',
      });
    }
  }
  return parts;
}

export interface BoxInstance {
  /** Tâm thùng so với tâm pallet, toạ độ three (x, y lên trên, z). */
  position: [number, number, number];
  /** Kích thước thùng theo trục three (x, y, z). */
  size: [number, number, number];
}

/** Đổi placement từng thùng (toạ độ container) sang vị trí/kích thước so với TÂM pallet, trục three. */
export function boxInstancesRelativeToPallet(pallet: Placement, boxes: Placement[]): BoxInstance[] {
  const cx = pallet.x + pallet.length / 2;
  const cy = pallet.y + pallet.width / 2;
  const cz = pallet.z + pallet.height / 2;
  return boxes.map((b) => ({
    position: [b.x + b.length / 2 - cx, b.z + b.height / 2 - cz, b.y + b.width / 2 - cy],
    size: [b.length, b.height, b.width],
  }));
}

// 12 cạnh của hình hộp đơn vị (cặp đỉnh), đỉnh = (±1/2, ±1/2, ±1/2) theo thứ tự bit z-y-x.
const BOX_EDGES: Array<[number, number]> = [
  [0, 1], [2, 3], [4, 5], [6, 7], // dọc theo x
  [0, 2], [1, 3], [4, 6], [5, 7], // dọc theo y
  [0, 4], [1, 5], [2, 6], [3, 7], // dọc theo z
];

/**
 * Gộp viền (12 cạnh) của TẤT CẢ thùng vào 1 mảng toạ độ cho 1 LineSegments duy nhất — thay vì mỗi
 * thùng 1 đối tượng viền riêng (hàng nghìn thùng sẽ thành hàng nghìn draw call). Mỗi thùng = 24 đỉnh
 * x 3 số.
 */
export function buildBoxEdgePositions(instances: BoxInstance[]): Float32Array {
  const out = new Float32Array(instances.length * BOX_EDGES.length * 2 * 3);
  let o = 0;
  for (const { position, size } of instances) {
    const corner = (i: number): [number, number, number] => [
      position[0] + ((i & 1 ? 1 : -1) * size[0]) / 2,
      position[1] + ((i & 2 ? 1 : -1) * size[1]) / 2,
      position[2] + ((i & 4 ? 1 : -1) * size[2]) / 2,
    ];
    for (const [a, b] of BOX_EDGES) {
      for (const v of [corner(a), corner(b)]) {
        out[o++] = v[0];
        out[o++] = v[1];
        out[o++] = v[2];
      }
    }
  }
  return out;
}
