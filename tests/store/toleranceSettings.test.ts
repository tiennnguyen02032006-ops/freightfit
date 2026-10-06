import { describe, expect, it } from 'vitest';
import { useAppStore } from '../../src/store';

describe('cấu hình dung sai (store)', () => {
  it('mặc định bật: thùng 1,5 cm, khe pallet 3 cm; chỉnh được từng phần', () => {
    expect(useAppStore.getState().tolerance).toEqual({ enabled: true, defaultDimensionTolerance: 15, palletGap: 30 });
    useAppStore.getState().setTolerance({ palletGap: 50 });
    expect(useAppStore.getState().tolerance).toMatchObject({ enabled: true, defaultDimensionTolerance: 15, palletGap: 50 });
    useAppStore.getState().setTolerance({ enabled: false, palletGap: 30 });
    expect(useAppStore.getState().tolerance.enabled).toBe(false);
    useAppStore.getState().setTolerance({ enabled: true });
  });
});
