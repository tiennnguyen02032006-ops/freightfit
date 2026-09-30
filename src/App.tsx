import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import './App.css';
import './components/panels/BlackBoxPanel.css';
import { AddCargoPanel } from './components/panels/AddCargoPanel';
import { BlackBoxPanel } from './components/panels/BlackBoxPanel';
import { TransportCostPanel } from './components/panels/TransportCostPanel';
import { ImportPanel } from './components/panels/ImportPanel';
import { SavedTripsPanel } from './components/panels/SavedTripsPanel';
import { SolutionSummaryBar } from './components/panels/SolutionSummaryBar';
import type { TripPlanRecord } from './domain/types';
import { ContainerScene } from './components/scene/ContainerScene';

const LEFT_WIDTH_STORAGE_KEY = 'freightfit.leftPanelWidth';
const DEFAULT_LEFT_WIDTH = 320;
const MIN_LEFT_WIDTH = 300;
const MAX_LEFT_WIDTH = 600;

function clampLeftWidth(value: number): number {
  return Math.min(MAX_LEFT_WIDTH, Math.max(MIN_LEFT_WIDTH, value));
}

// localStorage có thể bị chặn (chế độ ẩn danh, cài đặt trình duyệt...) — chỉ dùng để NHỚ LẠI
// chiều rộng cột đã kéo giữa các lần mở app (được yêu cầu rõ), không phải state chính của app.
function loadStoredLeftWidth(): number {
  try {
    const raw = localStorage.getItem(LEFT_WIDTH_STORAGE_KEY);
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? clampLeftWidth(parsed) : DEFAULT_LEFT_WIDTH;
  } catch {
    return DEFAULT_LEFT_WIDTH;
  }
}

function App() {
  // 'pack' = xếp hàng 3D (mặc định) | 'black-box' = tab điều tra sự cố (dữ liệu mô phỏng).
  // State cục bộ, không lưu lại giữa các lần mở app (đúng quy ước in-memory của dự án).
  const [mode, setMode] = useState<'pack' | 'black-box'>('pack');
  // Chuyến vừa bấm "Tìm nguyên nhân sự cố" ở SavedTripsPanel.tsx (Bước 3) — CHỈ để hiện 1 dòng
  // nhắc nhỏ trên tab Black Box, KHÔNG nạp dữ liệu chuyến vào bộ máy suy luận (Black Box vẫn hoạt
  // động độc lập trên dữ liệu mô phỏng như cũ, xem BlackBoxPanel.tsx) — chưa tô sáng kiện hàng nào.
  const [incidentTrip, setIncidentTrip] = useState<TripPlanRecord | null>(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [leftWidth, setLeftWidth] = useState(loadStoredLeftWidth);
  const [isResizing, setIsResizing] = useState(false);
  const dragStartRef = useRef<{ pointerX: number; startWidth: number } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(LEFT_WIDTH_STORAGE_KEY, String(leftWidth));
    } catch {
      // Không lưu được thì thôi, không phải lỗi nghiêm trọng.
    }
  }, [leftWidth]);

  const handleResizePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      dragStartRef.current = { pointerX: e.clientX, startWidth: leftWidth };
      setIsResizing(true);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const drag = dragStartRef.current;
        if (!drag) return;
        setLeftWidth(clampLeftWidth(drag.startWidth + (moveEvent.clientX - drag.pointerX)));
      };
      const handlePointerUp = () => {
        dragStartRef.current = null;
        setIsResizing(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    },
    [leftWidth],
  );

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="app-logo">📦 FreightFit</span>
        <nav className="app-mode-tabs" aria-label="Chế độ làm việc">
          <button
            type="button"
            className={mode === 'pack' ? 'app-mode-tab is-active' : 'app-mode-tab'}
            aria-pressed={mode === 'pack'}
            onClick={() => setMode('pack')}
          >
            Xếp hàng 3D
          </button>
          <button
            type="button"
            className={mode === 'black-box' ? 'app-mode-tab is-active' : 'app-mode-tab'}
            aria-pressed={mode === 'black-box'}
            onClick={() => setMode('black-box')}
          >
            Black Box
          </button>
        </nav>
      </header>

      {mode === 'black-box' ? (
        <>
          {incidentTrip && (
            <p className="incident-trip-banner">
              Đang tra cứu sự cố cho chuyến: <b>{incidentTrip.name}</b>
            </p>
          )}
          <BlackBoxPanel />
        </>
      ) : (
        <>
      <SolutionSummaryBar />

      <div
        className={`app-layout ${leftOpen ? '' : 'no-left'}`}
        style={
          leftOpen
            ? ({
                '--left-panel-width': `${leftWidth}px`,
                transition: isResizing ? 'none' : undefined,
              } as CSSProperties)
            : undefined
        }
      >
        <aside className="app-column app-column-left" id="app-column-left" hidden={!leftOpen}>
          <AddCargoPanel />
          <TransportCostPanel />
          <ImportPanel />
          <SavedTripsPanel
            onFindIncidentCause={(trip) => {
              setIncidentTrip(trip);
              setMode('black-box');
            }}
          />
        </aside>

        {/*
          Thanh kéo PHẢI là con trực tiếp của .app-layout (không phải .app-column-center) —
          .app-column-center kế thừa .app-column có overflow-y:auto, mà theo spec CSS khi 1 trục
          overflow khác 'visible' thì trình duyệt tự ép trục còn lại cũng thành 'auto' (clip),
          nên bất kỳ phần tử con nào định vị absolute ra NGOÀI rìa trái của .app-column-center
          (như left:-7px trước đây) sẽ bị cắt mất hoàn toàn — vừa không hiển thị vừa không nhận
          được sự kiện chuột, khiến kéo giãn không có tác dụng gì. Đặt ở đây (.app-layout không
          set overflow) và tự tính `left` theo đúng ranh giới cột trái (leftWidth) để tránh hẳn
          vấn đề clip đó.
        */}
        {leftOpen && (
          <div
            className="column-resize-handle"
            style={{ left: leftWidth + 16 }}
            onPointerDown={handleResizePointerDown}
            role="separator"
            aria-orientation="vertical"
            aria-label="Kéo giãn chiều rộng panel trái"
          />
        )}

        <main className="app-column app-column-center">
          <button
            type="button"
            className="sidebar-toggle sidebar-toggle-left"
            onClick={() => setLeftOpen((o) => !o)}
            aria-label={leftOpen ? 'Ẩn panel trái' : 'Hiện panel trái'}
            title={leftOpen ? 'Ẩn panel trái' : 'Hiện panel trái'}
          >
            {leftOpen ? '‹' : '›'}
          </button>

          <ContainerScene />
        </main>
      </div>
        </>
      )}
    </div>
  );
}

export default App;
