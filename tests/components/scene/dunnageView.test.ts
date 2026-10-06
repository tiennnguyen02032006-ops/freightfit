import { describe, expect, it } from 'vitest';
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import {
  bagTransform,
  createPillowGeometry,
  describeDunnageGap,
  type InstanceTransform,
} from '../../../src/components/scene/dunnageView';
import type { DunnageGap } from '../../../src/domain/types';

/** Hộp bao (trục three) của hộp đơn vị [-0.5, 0.5]^3 sau khi áp ma trận instance. */
function worldBounds(t: InstanceTransform) {
  const matrix = new Matrix4().compose(
    new Vector3(...t.position),
    new Quaternion().setFromEuler(new Euler(...t.rotation)),
    new Vector3(...t.scale),
  );
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const x of [-0.5, 0.5]) {
    for (const y of [-0.5, 0.5]) {
      for (const z of [-0.5, 0.5]) {
        const v = new Vector3(x, y, z).applyMatrix4(matrix);
        min.min(v);
        max.max(v);
      }
    }
  }
  return { min, max, size: max.clone().sub(min) };
}

describe('createPillowGeometry', () => {
  const geometry = createPillowGeometry();
  const position = geometry.getAttribute('position');

  it('nằm trong hộp đơn vị, có pháp tuyến và đỉnh đã hàn (mượt)', () => {
    expect(position.count).toBeGreaterThan(0);
    expect(geometry.getAttribute('normal')).toBeDefined();
    for (let i = 0; i < position.count; i++) {
      for (const v of [position.getX(i), position.getY(i), position.getZ(i)]) {
        expect(Math.abs(v)).toBeLessThanOrEqual(0.5 + 1e-6);
      }
    }
    // hộp 8 đoạn/cạnh có (8+1)^3 - 7^3 = 386 đỉnh sau khi hàn (không còn đỉnh trùng theo mặt)
    expect(position.count).toBe(386);
  });

  it('phình ở giữa: bề dày (trục Y) lớn nhất ở tâm mặt (chạm khít khe) và mỏng hơn ở mép', () => {
    let centerY = 0;
    let rimY = 0;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const z = position.getZ(i);
      const y = position.getY(i);
      if (Math.abs(x) < 0.07 && Math.abs(z) < 0.07) centerY = Math.max(centerY, y);
      if (Math.max(Math.abs(x), Math.abs(z)) > 0.46) rimY = Math.max(rimY, y);
    }
    expect(centerY).toBeCloseTo(0.5, 2);
    expect(rimY).toBeLessThan(centerY * 0.85);
  });
});

describe('transform instance', () => {
  it('túi khí trong khe theo chiều dài: lấp đúng hộp khe (dài = bề dày khe), vừa khít', () => {
    const bag = { x: 1000, y: 200, z: 300, length: 150, width: 900, height: 1200 };
    const { min, size } = worldBounds(bagTransform(bag, 'LENGTH'));
    // trục three: x = length, y = height (lên trên), z = width
    expect([size.x, size.y, size.z].map(Math.round)).toEqual([150, 1200, 900]);
    expect([min.x, min.y, min.z].map(Math.round)).toEqual([1000, 300, 200]);
  });

  it('túi khí trong khe theo chiều rộng: bề dày khe theo trục z three', () => {
    const bag = { x: 500, y: 1200, z: 100, length: 800, width: 120, height: 1000 };
    const { min, size } = worldBounds(bagTransform(bag, 'WIDTH'));
    expect([size.x, size.y, size.z].map(Math.round)).toEqual([800, 1000, 120]);
    expect([min.x, min.y, min.z].map(Math.round)).toEqual([500, 100, 1200]);
  });

});

describe('describeDunnageGap', () => {
  const base = { x: 0, y: 0, z: 0, length: 100, width: 1800, height: 1200, axis: 'LENGTH' as const, gapSize: 100, wall: false };

  it('túi khí: nêu kích thước khe và số túi cần dùng', () => {
    const gap: DunnageGap = {
      ...base,
      id: 'g1',
      source: 'GENERIC',
      bagCount: 2,
      bags: [
        { x: 0, y: 0, z: 0, length: 100, width: 900, height: 1200 },
        { x: 0, y: 900, z: 0, length: 100, width: 900, height: 1200 },
      ],
    };
    const lines = describeDunnageGap(gap);
    expect(lines[0]).toContain('Khe 100 mm');
    expect(lines.join(' ')).toContain('1800 × 1200 mm');
    expect(lines.join(' ')).toContain('Cần 2 túi khí (2 × 1');
  });

  it('khe giữa hai cột pallet: nêu độ rộng khe, cỡ túi, số túi chồng/chiều cao và số túi theo hàng pallet', () => {
    const bag = { sizeLabel: 'L 1250×1200 mm', stackCount: 2, y: 1100, length: 1100, width: 200, height: 1050 };
    const gap: DunnageGap = {
      ...base,
      id: 'g2',
      source: 'CENTER',
      axis: 'WIDTH',
      gapSize: 200,
      width: 200,
      length: 2200,
      bagCount: 4,
      bags: [
        { ...bag, x: 0, z: 0 },
        { ...bag, x: 0, z: 1050 },
        { ...bag, x: 1100, z: 0 },
        { ...bag, x: 1100, z: 1050 },
      ],
    };
    const text = describeDunnageGap(gap).join(' ');
    expect(text).toContain('Khe giữa hai cột pallet: 20 cm');
    expect(text).toContain('Cỡ túi L 1250×1200 mm');
    expect(text).toContain('2 túi chồng, mỗi túi cao 105 cm (tổng 210 cm)');
    expect(text).toContain('Cần 4 túi khí cho 2 hàng pallet');
  });
});
