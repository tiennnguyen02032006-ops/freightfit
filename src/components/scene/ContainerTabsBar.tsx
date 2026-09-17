import type { ContainerInstance } from '../../domain/types';

interface ContainerTabsBarProps {
  containers: ContainerInstance[];
  activeContainerId: string | undefined;
  onSelectContainer: (containerInstanceId: string) => void;
}

/**
 * Dải tab "Container 1/3", "Container 2/3"... nổi phía trên khung 3D — chỉ hiện khi phương án cần
 * dùng NHIỀU HƠN 1 container (hàng hóa vượt quá 1 container, xem generateSolutions.ts; component
 * cha ContainerScene.tsx đã tự kiểm tra `solutionContainers.length > 1` trước khi render, nên ở
 * đây không cần tự ẩn khi chỉ có 1 phần tử).
 *
 * Bấm 1 tab -> gọi `setActiveContainer` (store) để đổi container đang xem trong khung 3D — đồng
 * thời TỰ RESET kèm theo (kiện đang chọn, chế độ xoay, bước mô phỏng) vì các trạng thái đó thuộc
 * về container CŨ, không còn ý nghĩa với container mới (xem store/index.ts `setActiveContainer`).
 */
export function ContainerTabsBar({ containers, activeContainerId, onSelectContainer }: ContainerTabsBarProps) {
  return (
    <div className="container-tabs-bar">
      {containers.map((container, i) => (
        <button
          key={container.id}
          type="button"
          className={container.id === activeContainerId ? 'is-active' : undefined}
          onClick={() => onSelectContainer(container.id)}
          aria-pressed={container.id === activeContainerId}
        >
          Container {i + 1}
        </button>
      ))}
    </div>
  );
}
