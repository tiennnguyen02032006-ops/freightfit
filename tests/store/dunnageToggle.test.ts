import { describe, expect, it } from 'vitest';
import { useAppStore } from '../../src/store';

describe('lớp "Chèn lót" (store)', () => {
  it('mặc định bật và bật/tắt được', () => {
    expect(useAppStore.getState().ui.showDunnage).toBe(true);
    useAppStore.getState().toggleDunnage();
    expect(useAppStore.getState().ui.showDunnage).toBe(false);
    useAppStore.getState().toggleDunnage();
    expect(useAppStore.getState().ui.showDunnage).toBe(true);
  });
});
