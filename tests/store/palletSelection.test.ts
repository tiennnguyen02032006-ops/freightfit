import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../../src/store';

describe('chọn thùng trong pallet (store)', () => {
  beforeEach(() => {
    useAppStore.setState((state) => ({ ui: { ...state.ui, selectedPlacementId: null, selectedBoxId: null } }));
  });

  it('selectPalletBox đặt thùng chọn, selectPlacement luôn xóa thùng chọn cũ', () => {
    const { selectPlacement, selectPalletBox } = useAppStore.getState();
    selectPlacement('pallet-1');
    selectPalletBox('pallet-1__box-3');
    expect(useAppStore.getState().ui.selectedPlacementId).toBe('pallet-1');
    expect(useAppStore.getState().ui.selectedBoxId).toBe('pallet-1__box-3');

    selectPlacement('pallet-1'); // bấm đế pallet -> chỉ còn chọn pallet
    expect(useAppStore.getState().ui.selectedBoxId).toBeNull();

    selectPalletBox('pallet-1__box-2');
    selectPlacement(null);
    expect(useAppStore.getState().ui.selectedBoxId).toBeNull();
  });

  it('đổi container đang xem xóa luôn thùng chọn', () => {
    useAppStore.getState().selectPlacement('pallet-1');
    useAppStore.getState().selectPalletBox('pallet-1__box-1');
    useAppStore.getState().setActiveContainer('container-2');
    expect(useAppStore.getState().ui.selectedBoxId).toBeNull();
  });
});
