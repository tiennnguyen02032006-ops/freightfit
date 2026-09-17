import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CenterOfGravityWarning, ContainerInstance, ContainerSuggestion, ContainerTemplate } from '../../domain/types';
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
  // Nút "Xuất PDF" — chỉ truyền tiếp xuống SceneStatsBar, không tự biết gì về cách chụp ảnh
  // 3D/dựng PDF (xem ContainerScene.tsx handleExportPdf + src/export/exportPdf.ts).
  canExportPdf: boolean;
  isExportingPdf: boolean;
  onExportPdf: () => void;
  // Gợi ý đổi loại container/xe cho container ĐANG XEM — ContainerScene.tsx chỉ truyền khác null
  // khi container đang xem CHÍNH LÀ container cuối cùng của solution (xem
  // ContainerScene.tsx isViewingLastContainer), nên component ở đây không cần tự kiểm tra lại.
  suggestion: ContainerSuggestion | null;
  suggestedTemplateName: string | undefined;
  onApplySuggestion: () => void;
}

/**
 * Bọc SceneStatsBar để thêm khả năng KÉO TỰ DO đến vị trí bất kỳ trên TOÀN MÀN HÌNH (viewport),
 * qua tay cầm nhỏ (icon "⠿") hiện sẵn ở góc trái dải header (xem SceneStatsBar.tsx `dragHandle`).
 *
 * 2 CHẾ ĐỘ HIỂN THỊ:
 * - MẶC ĐỊNH (`position === null`, kể cả trước khi người dùng từng kéo lần nào): render
 *   SceneStatsBar THẲNG tại đúng vị trí gọi component này trong cây JSX (bên trong hàng flex
 *   `.scene-top-row` của ContainerScene.tsx) — HOÀN TOÀN không đổi gì so với trước khi có tính
 *   năng kéo-thả này, để giữ đúng bố cục mặc định "góc trên khung 3D" và không đụng gì tới cách bố
 *   cục flex đã tự tránh chồng lên dải tab container ở hàng trên — nếu tự gán top/left cố định cho
 *   vị trí mặc định thay vì để flexbox tự lo, sẽ lại có nguy cơ chồng lên dải tab khi dải tab đổi
 *   chiều cao.
 * - TÙY CHỈNH (`position !== null`, đã kéo ít nhất 1 lần, kể cả từ phiên trước nhờ localStorage):
 *   portal (`createPortal`) THẲNG vào `document.body` (không còn portal vào khung 3D nữa — kéo ra
 *   được TOÀN MÀN HÌNH, kể cả ngoài khung 3D), định vị `position: fixed` (không phải `absolute`)
 *   để tọa độ tính THẲNG theo viewport, không bị ảnh hưởng bởi cuộn trang hay vị trí khung 3D.
 *
 * KẸP TRONG VIEWPORT: mọi tọa độ (lúc kéo VÀ lúc co cửa sổ sau này) đều được `clampToViewport` giới
 * hạn trong [0, window.innerWidth/innerHeight - kích thước dải] — không bao giờ để dải trôi hẳn ra
 * ngoài màn hình, kể cả khi cửa sổ co lại sau khi đã có vị trí tùy chỉnh.
 */
export function DraggableStatsBar({
  containerTemplate,
  container,
  cgWarnings,
  canExportPdf,
  isExportingPdf,
  onExportPdf,
  suggestion,
  suggestedTemplateName,
  onApplySuggestion,
}: DraggableStatsBarProps) {
  const [position, setPosition] = useState<Position | null>(() => loadStoredPosition());
  // Đợi component thật sự mount xong rồi mới portal — document.body luôn sẵn sàng ngay từ đầu
  // (khác sceneContainerRef trước đây), nhưng vẫn giữ bước này để tránh mismatch hydrate/portal ở
  // lần render đầu tiên.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const boxRef = useRef<HTMLDivElement>(null);

  const clampToViewport = (x: number, y: number): Position => {
    const boxEl = boxRef.current;
    if (!boxEl) return { x: Math.max(0, x), y: Math.max(0, y) };
    const maxX = Math.max(0, window.innerWidth - boxEl.offsetWidth);
    const maxY = Math.max(0, window.innerHeight - boxEl.offsetHeight);
    return { x: Math.min(Math.max(x, 0), maxX), y: Math.min(Math.max(y, 0), maxY) };
  };

  // Cửa sổ co lại SAU KHI đã có vị trí tùy chỉnh (kể cả vị trí nhớ từ phiên trước, lúc màn hình có
  // thể to hơn) -> kẹp lại ngay, không đợi người dùng tự kéo lại mới hết tràn ra ngoài.
  useEffect(() => {
    if (!position) return;
    const handleResize = () => setPosition((p) => (p ? clampToViewport(p.x, p.y) : p));
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

    const boxEl = boxRef.current;
    if (!boxEl) return;

    // Tọa độ VIEWPORT thật (e.clientX/clientY) — không còn container tham chiếu nào để trừ offset
    // nữa (khác bản cũ dùng containerRect), vì position:fixed + portal vào document.body nghĩa là
    // left/top của dải giờ CHÍNH LÀ tọa độ viewport.
    const boxRect = boxEl.getBoundingClientRect();
    const grabOffsetX = e.clientX - boxRect.left;
    const grabOffsetY = e.clientY - boxRect.top;

    let finalPosition: Position = clampToViewport(boxRect.left, boxRect.top);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      finalPosition = clampToViewport(moveEvent.clientX - grabOffsetX, moveEvent.clientY - grabOffsetY);
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
        canExportPdf={canExportPdf}
        isExportingPdf={isExportingPdf}
        onExportPdf={onExportPdf}
        suggestion={suggestion}
        suggestedTemplateName={suggestedTemplateName}
        onApplySuggestion={onApplySuggestion}
      />
    );
  }

  return createPortal(
    <SceneStatsBar
      ref={boxRef}
      containerTemplate={containerTemplate}
      container={container}
      cgWarnings={cgWarnings}
      dragHandle={dragHandle}
      canExportPdf={canExportPdf}
      isExportingPdf={isExportingPdf}
      onExportPdf={onExportPdf}
      suggestion={suggestion}
      suggestedTemplateName={suggestedTemplateName}
      onApplySuggestion={onApplySuggestion}
      // fixed (không phải absolute) — tọa độ tính THẲNG theo viewport, kéo tự do khắp màn hình,
      // không bị cuộn trang hay vị trí khung 3D ảnh hưởng (xem clampToViewport ở trên).
      style={{ position: 'fixed', left: position.x, top: position.y, zIndex: 1000 }}
    />,
    document.body,
  );
}
