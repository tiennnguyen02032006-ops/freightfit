import { describe, expect, it } from 'vitest';
import {
  CG_OFFSET_X_WARNING_RATIO,
  CG_OFFSET_Z_WARNING_RATIO,
  computeCenterOfGravity,
  computeCgOffsets,
  computeCgWarnings,
} from '../../../src/engine/optimization/centerOfGravity';
import { makePlacement } from '../../fixtures/placement';
import { smallTestContainer } from '../../fixtures/containers';

// smallTestContainer: 2000 x 1000 x 1000 mm.

describe('computeCenterOfGravity', () => {
  it('2 kiện cùng khối lượng ở 2 đầu container -> trọng tâm nằm đúng giữa', () => {
    // 2 kiện 10kg, tâm đặt đối xứng qua giữa chiều dài (500 và 1500, giữa là 1000) và cùng
    // y/z -> trọng tâm phải rơi đúng vào (1000, y, z) theo trục dài (x), không lệch bên nào.
    const a = makePlacement({ id: 'a', weight: 10, centerX: 500, centerY: 200, centerZ: 100 });
    const b = makePlacement({ id: 'b', weight: 10, centerX: 1500, centerY: 200, centerZ: 100 });

    const cg = computeCenterOfGravity([a, b]);

    expect(cg.x).toBe(1000);
    expect(cg.y).toBe(200);
    expect(cg.z).toBe(100);
  });

  it('khối lượng khác nhau -> trọng tâm lệch về phía kiện nặng hơn (không phải trung điểm hình học)', () => {
    const heavy = makePlacement({ id: 'heavy', weight: 30, centerX: 500, centerY: 0, centerZ: 0 });
    const light = makePlacement({ id: 'light', weight: 10, centerX: 1500, centerY: 0, centerZ: 0 });

    const cg = computeCenterOfGravity([heavy, light]);

    // x = (30*500 + 10*1500) / 40 = 750 -> lệch về phía kiện 30kg (500), không phải trung điểm 1000.
    expect(cg.x).toBe(750);
  });

  it('không có kiện nào (tổng khối lượng = 0) -> trả về gốc (0,0,0), không NaN/lỗi', () => {
    const cg = computeCenterOfGravity([]);
    expect(cg).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe('computeCgOffsets', () => {
  it('trọng tâm đúng giữa container -> lệch ngang/dọc = 0', () => {
    const centerOfGravity = { x: smallTestContainer.innerLength / 2, y: smallTestContainer.innerWidth / 2, z: 500 };
    const offsets = computeCgOffsets(centerOfGravity, smallTestContainer);
    expect(offsets.offsetXRatio).toBe(0);
    expect(offsets.offsetZRatio).toBe(0);
  });

  it('trọng tâm lệch hẳn về 1 bên chiều rộng -> offsetXRatio phản ánh đúng tỉ lệ lệch', () => {
    // innerWidth = 1000, trọng tâm ở y=1000 (sát vách) -> lệch = |1000 - 500| / 1000 = 0.5 (50%).
    const centerOfGravity = { x: smallTestContainer.innerLength / 2, y: smallTestContainer.innerWidth, z: 0 };
    const offsets = computeCgOffsets(centerOfGravity, smallTestContainer);
    expect(offsets.offsetXRatio).toBeCloseTo(0.5);
  });

  it('trọng tâm lệch về phía cửa (x nhỏ) -> offsetZRatio phản ánh đúng tỉ lệ lệch dọc', () => {
    // innerLength = 2000, trọng tâm ở x=0 (sát cửa) -> lệch = |0 - 1000| / 2000 = 0.5 (50%).
    const centerOfGravity = { x: 0, y: smallTestContainer.innerWidth / 2, z: 0 };
    const offsets = computeCgOffsets(centerOfGravity, smallTestContainer);
    expect(offsets.offsetZRatio).toBeCloseTo(0.5);
  });
});

describe('computeCgWarnings', () => {
  it('lệch dưới cả 2 ngưỡng -> không có warning nào', () => {
    const warnings = computeCgWarnings('container-1', { offsetXRatio: 0.05, offsetZRatio: 0.05 });
    expect(warnings).toEqual([]);
  });

  it('lệch ngang vượt ngưỡng (>10%) -> có đúng 1 warning trục X', () => {
    const offsetXRatio = CG_OFFSET_X_WARNING_RATIO + 0.02;
    const warnings = computeCgWarnings('container-1', { offsetXRatio, offsetZRatio: 0 });
    expect(warnings).toEqual([
      { containerInstanceId: 'container-1', axis: 'X', offsetRatio: offsetXRatio, severity: 'MEDIUM' },
    ]);
  });

  it('lệch dọc vượt ngưỡng (>15%) -> có đúng 1 warning trục Z', () => {
    const offsetZRatio = CG_OFFSET_Z_WARNING_RATIO + 0.02;
    const warnings = computeCgWarnings('container-1', { offsetXRatio: 0, offsetZRatio });
    expect(warnings).toEqual([
      { containerInstanceId: 'container-1', axis: 'Z', offsetRatio: offsetZRatio, severity: 'MEDIUM' },
    ]);
  });

  it('vượt ngưỡng rất nhiều (>1.5x ngưỡng) -> severity HIGH thay vì MEDIUM', () => {
    const offsetXRatio = CG_OFFSET_X_WARNING_RATIO * 2;
    const warnings = computeCgWarnings('container-1', { offsetXRatio, offsetZRatio: 0 });
    expect(warnings[0].severity).toBe('HIGH');
  });

  it('vượt cả 2 ngưỡng cùng lúc -> có cả 2 warning (X và Z)', () => {
    const warnings = computeCgWarnings('container-1', {
      offsetXRatio: CG_OFFSET_X_WARNING_RATIO + 0.01,
      offsetZRatio: CG_OFFSET_Z_WARNING_RATIO + 0.01,
    });
    expect(warnings).toHaveLength(2);
    expect(warnings.map((w) => w.axis).sort()).toEqual(['X', 'Z']);
  });
});
