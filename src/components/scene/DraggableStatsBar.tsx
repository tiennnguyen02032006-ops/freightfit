import { useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { CenterOfGravityWarning, ContainerInstance, ContainerTemplate } from '../../domain/types';
import { SceneStatsBar } from './SceneStatsBar';

const STORAGE_KEY = 'freightfit.sceneStatsBarPosition';

interface Position {
  x: number;
  y: number;
}

// localStorage có thể bị chặn (chế độ ẩn danh, cài đặt trình duyệt...) — chỉ dùng để NHỚ LẠI vị
// trí đã kéo giữa các lần mở app (được yêu cầu rõ ở đây), không phải state chính của app.
function loadStoredPosition(): Position | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as Position).x === 'number' &&
      typeof (parsed as Position).y === 'number'
    ) {
      return parsed as Position;
    }
    return null;
  } catch {
    return null;
  }
}

function saveStoredPosition(position: Position) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(position));
  } catch {
    // Không lưu được thì thôi, không phải lỗi nghiêm trọng — vị trí chỉ là tiện ích ghi nhớ.
  }
}

interface DraggableStatsBarProps {
  containerTemplate: ContainerTemplate;
  container: ContainerInstance | undefined;
  cgWarnings: CenterOfGravityWarning[];
  // Div .scene-container thật (từ ContainerScene.tsx) — dùng làm (a) khung tọa độ tham chiếu để
  // kẹp vị trí kéo trong vùng nhìn thấy, và (b) nơi portal dải thông tin ra khi đã có vị trí tùy
  // chỉnh (thoát khỏi hàng flex .scene-top-row mặc định).
  sceneContainerRef: RefObject<HTMLDivElement | null>;
}

/**
 * Bọc SceneStatsBar để thêm khả năng KÉO TỰ DO đến vị trí bất kỳ trong khung 3D, qua tay cầm nhỏ
 * (icon "⠿") hiện sẵn ở góc trái dải header (xem SceneStatsBar.tsx `dragHandle`).
 *
 * 2 CHẾ ĐỘ HIỂN THỊ:
 * - MẶC ĐỊNH (`position === null`, kể cả trước khi người dùng từng kéo lần nào): render
 *   SceneStatsBar THẲNG tại đúng vị trí gọi component này trong cây JSX (bên trong hàng flex
 *   `.scene-top-row` của ContainerScene.tsx) — HOÀN TOÀN không đổi gì so với trước khi có tính
 *   năng kéo-thả này, để giữ đúng bố cục mặc định "góc trên khung 3D" (yêu cầu 4) và không đụng gì
 *   tới cách bố cục flex đã tự tránh chồng lên dải tab container ở hàng trên (đã sửa ở nhiệm vụ
 *   trước) — nếu tự gán top/left cố định cho vị trí mặc định thay vì để flexbox tự lo, sẽ lại có
 *   nguy cơ chồng lên dải tab khi dải tab đổi chiều cao.
 * - TÙY CHỈNH (`position !== null`, đã kéo ít nhất 1 lần, kể cả từ phiên trước nhờ localStorage):
 *   portal (`createPortal`) THẲNG vào `sceneContainerRef.current` — tức đưa hẳn ra khỏi hàng flex
 *   `.scene-top-row`, định vị `position:absolute` với toạ độ đã lưu — vị trí này khi đó hoàn toàn
 *   độc lập với dải tab container, không bao giờ bị đẩy/chồng bởi nó (yêu cầu 5).
 *
 * KẸP TRONG VÙNG NHÌN THẤY (yêu cầu 2): mọi tọa độ (lúc kéo VÀ lúc co cửa sổ sau này) đều được
 * `clampToContainer` giới hạn trong [0, sceneContainer.width/height - kích thước dải] — không bao
 * giờ để dải trôi ra ngoài khung 3D, kể cả khi cửa sổ co lại sau khi đã có vị trí tùy chỉnh.
 */
export function DraggableStatsBar({ containerTemplate, container, cgWarnings, sceneContainerRef }: DraggableStatsBarProps) {
  const [position, setPosition] = useState<Position | null>(() => loadStoredPosition());
  // Đợi component thật sự mount xong rồi mới portal — đảm bảo sceneContainerRef.current (do
  // ContainerScene.tsx gắn) chắc chắn đã sẵn sàng trước khi render lần đầu ở chế độ tùy chỉnh
  // (nếu có vị trí lưu từ phiên trước).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const boxRef = useRef<HTMLDivElement>(null);

  const clampToContainer = (x: number, y: number): Position => {
    const containerEl = sceneContainerRef.current;
    const boxEl = boxRef.current;
    if (!containerEl || !boxEl) return { x: Math.max(0, x), y: Math.max(0, y) };
    const maxX = Math.max(0, containerEl.clientWidth - boxEl.offsetWidth);
    const maxY = Math.max(0, containerEl.clientHeight - boxEl.offsetHeight);
    return { x: Math.min(Math.max(x, 0), maxX), y: Math.min(Math.max(y, 0), maxY) };
  };

  // Cửa sổ co lại SAU KHI đã có vị trí tùy chỉnh (kể cả vị trí nhớ từ phiên trước, lúc màn hình có
  // thể to hơn) -> kẹp lại ngay, không đợi người dùng tự kéo lại mới hết tràn ra ngoài.
  useEffect(() => {
    if (!position) return;
    const handleResize = () => setPosition((p) => (p ? clampToContainer(p.x, p.y) : p));
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, position !== null]);

  const handleDragPointerDown = (e: React.PointerEvent) => {
    // Chỉ nút chuột trái (hoặc chạm) mới bắt đầu kéo; chặn hành vi mặc định (vd bôi đen chữ khi
    // rê) và không cho sự kiện lan xuống Canvas phía dưới.
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const containerEl = sceneContainerRef.current;
    const boxEl = boxRef.current;
    if (!containerEl || !boxEl) return;

    const containerRect = containerEl.getBoundingClientRect();
    const boxRect = boxEl.getBoundingClientRect();
    const grabOffsetX = e.clientX - boxRect.left;
    const grabOffsetY = e.clientY - boxRect.top;

    let finalPosition: Position = clampToContainer(boxRect.left - containerRect.left, boxRect.top - containerRect.top);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      finalPosition = clampToContainer(
        moveEvent.clientX - containerRect.left - grabOffsetX,
        moveEvent.clientY - containerRect.top - grabOffsetY,
      );
      setPosition(finalPosition);
    };
    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      // Chỉ ghi localStorage MỘT LẦN lúc thả tay (không ghi liên tục mỗi pointermove khi đang kéo)
      // — đủ để đáp ứng yêu cầu "nhớ vị trí", tránh ghi ổ đĩa hàng chục lần/giây vô ích.
      saveStoredPosition(finalPosition);
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const dragHandle = (
    <button
      type="button"
      className="scene-stats-bar-drag-handle"
      onPointerDown={handleDragPointerDown}
      aria-label="Kéo để di chuyển dải thông tin container"
      title="Kéo để di chuyển"
    >
      ⠿
    </button>
  );

  if (!position || !mounted) {
    return (
      <SceneStatsBar
        ref={boxRef}
        containerTemplate={containerTemplate}
        container={container}
        cgWarnings={cgWarnings}
        dragHandle={dragHandle}
      />
    );
  }

  const portalTarget = sceneContainerRef.current;
  if (!portalTarget) return null;

  return createPortal(
    <SceneStatsBar
      ref={boxRef}
      containerTemplate={containerTemplate}
      container={container}
      cgWarnings={cgWarnings}
      dragHandle={dragHandle}
      style={{ position: 'absolute', left: position.x, top: position.y, zIndex: 1 }}
    />,
    portalTarget,
  );
}
