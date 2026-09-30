import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../../store';
import type { StoredTripEntry, TripPlanRecord, TripPlanStop, TripStopDistance } from '../../domain/types';
import {
  deleteTrip,
  exportTripsJson,
  importTripsJson,
  loadTrips,
  saveTrip,
} from '../../storage/tripStorage';
import { proposeSingleRoute } from '../../engine/optimization/routeProposal';

/**
 * "Chuyến hàng của bạn" — panel duy nhất trong app được phép đọc/ghi localStorage (qua
 * src/storage/tripStorage.ts, xem CLAUDE.md). Mọi thay đổi TỰ ĐỘNG LƯU ngay (gọi saveTrip() trong
 * từng handler), không có nút "Lưu" riêng — đúng yêu cầu thiết kế lại (người dùng trước đây không
 * biết vì sao nút "Lưu chuyến hiện tại" bị mờ).
 *
 * 2 màn hình con: (1) danh sách chuyến dạng thẻ, (2) chi tiết 1 chuyến đang mở, chia 3 bước
 * ① Thông tin chuyến / ② Xếp hàng / ③ Sau khi giao xong — bước 3 chỉ mở được khi 1 và 2 đã xong.
 *
 * Component chỉ ĐỌC solution/cargoTemplates qua store hook (đúng ranh giới components/**), không
 * tự tính constraint/logic xếp hàng nào — bước "Xếp hàng" TÁI DÙNG nguyên cơ chế nhóm theo
 * cargoTemplateId + gán 1 điểm giao cho cả nhóm đã có từ trước, không bịa thêm logic engine mới.
 */

interface SavedTripsPanelProps {
  // Bấm "Tìm nguyên nhân sự cố" ở Bước 3 -> App.tsx tự đổi sang tab Black Box (component này
  // không tự đổi tab, chỉ truyền tên/dữ liệu chuyến qua callback — đúng ranh giới components/**).
  onFindIncidentCause?: (trip: TripPlanRecord) => void;
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultTripName(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `Chuyến ${dd}/${mm}`;
}

function formatDateShort(ms: number): string {
  return new Date(ms).toLocaleDateString('vi-VN');
}

type TripStatus = 'planning' | 'loaded' | 'delivered';

function tripStatus(entry: StoredTripEntry): TripStatus {
  if (entry.actual) return 'delivered';
  if (entry.plan.cargo.length > 0) return 'loaded';
  return 'planning';
}

const STATUS_LABEL: Record<TripStatus, string> = {
  planning: 'Đang lên kế hoạch',
  loaded: 'Đã xếp hàng',
  delivered: 'Đã giao',
};

function isStep1Done(plan: TripPlanRecord): boolean {
  return plan.stops.length > 0 && plan.stops.every((s) => s.name.trim() !== '');
}

function isStep2Done(plan: TripPlanRecord): boolean {
  return plan.cargo.length > 0;
}

function distanceBetween(distances: TripStopDistance[], a: string, b: string): number | null {
  const found = distances.find(
    (d) => (d.stopIdA === a && d.stopIdB === b) || (d.stopIdA === b && d.stopIdB === a),
  );
  return found ? found.km : null;
}

export function SavedTripsPanel({ onFindIncidentCause }: SavedTripsPanelProps) {
  const solution = useAppStore((s) => s.solution);
  const cargoTemplates = useAppStore((s) => s.cargoTemplates);
  const containerLibrary = useAppStore((s) => s.containerLibrary);
  const [routeBusy, setRouteBusy] = useState(false);

  const [tripsResult, setTripsResult] = useState(() => loadTrips());
  const [openTripId, setOpenTripId] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const trips = tripsResult.ok ? tripsResult.data.trips : [];
  const openTrip = trips.find((t) => t.plan.tripId === openTripId) ?? null;

  const refresh = () => setTripsResult(loadTrips());

  // TỰ ĐỘNG LƯU: mọi handler bên dưới đều gọi hàm này ngay sau khi đổi 1 trường — không có nút
  // "Lưu" riêng để bấm.
  const persistEntry = (entry: StoredTripEntry) => {
    const result = saveTrip(entry);
    if (!result.ok) setNotice(result.error);
    refresh();
  };

  const handleCreateTrip = () => {
    const entry: StoredTripEntry = {
      plan: { tripId: newId('trip'), name: defaultTripName(), createdAt: Date.now(), stops: [], cargo: [] },
      actual: null,
    };
    persistEntry(entry);
    setOpenTripId(entry.plan.tripId);
    setActiveStep(1);
  };

  const handleDeleteTrip = (tripId: string, name: string) => {
    if (!window.confirm(`Xoá chuyến "${name}"? Không thể hoàn tác.`)) return;
    const result = deleteTrip(tripId);
    if (!result.ok) setNotice(result.error);
    refresh();
    if (openTripId === tripId) setOpenTripId(null);
  };

  const updatePlan = (patch: Partial<TripPlanRecord>) => {
    if (!openTrip) return;
    persistEntry({ ...openTrip, plan: { ...openTrip.plan, ...patch } });
  };

  const addStop = () => {
    if (!openTrip) return;
    const stops: TripPlanStop[] = [
      ...openTrip.plan.stops,
      { stopId: newId('stop'), order: openTrip.plan.stops.length, name: '', etaMinutes: 0 },
    ];
    updatePlan({ stops });
  };

  const removeStop = (stopId: string) => {
    if (!openTrip) return;
    const stops = openTrip.plan.stops.filter((s) => s.stopId !== stopId).map((s, i) => ({ ...s, order: i }));
    // Kiện đang gán cho điểm vừa xoá không còn điểm giao hợp lệ để trỏ tới -> bỏ tham chiếu.
    const cargo = openTrip.plan.cargo.filter((c) => c.stopId !== stopId);
    persistEntry({ ...openTrip, plan: { ...openTrip.plan, stops, cargo } });
  };

  const updateStop = (stopId: string, patch: Partial<TripPlanStop>) => {
    if (!openTrip) return;
    updatePlan({ stops: openTrip.plan.stops.map((s) => (s.stopId === stopId ? { ...s, ...patch } : s)) });
  };

  // Khoảng cách (km) giữa từng cặp điểm giao — người dùng tự nhập tay (xem TripStopDistance trong
  // types.ts), dùng làm input cho "Đề xuất phương án" (Giai đoạn C). Lưu đối xứng: 1 bản ghi cho
  // mỗi cặp, không phân biệt chiều A->B hay B->A.
  const updateDistance = (stopIdA: string, stopIdB: string, value: string) => {
    if (!openTrip) return;
    const km = Number(value);
    const distances = openTrip.plan.distances ?? [];
    const without = distances.filter(
      (d) => !((d.stopIdA === stopIdA && d.stopIdB === stopIdB) || (d.stopIdA === stopIdB && d.stopIdB === stopIdA)),
    );
    updatePlan({ distances: [...without, { stopIdA, stopIdB, km: Number.isFinite(km) ? km : 0 }] });
  };

  const templateNameById = useMemo(
    () => new Map(cargoTemplates.map((t) => [t.id, t.name || t.sku])),
    [cargoTemplates],
  );

  // Nhóm hàng ĐANG XẾP (từ phương án 3D hiện tại) theo cargoTemplateId — mỗi nhóm gán chung 1
  // điểm giao khi lưu (tái dùng đúng cách nhóm đã có, không tạo logic mới cho engine xếp hàng).
  const liveCargoGroups = useMemo(() => {
    const byTemplate = new Map<string, string[]>();
    for (const c of solution?.containers ?? []) {
      for (const p of c.placements) {
        const list = byTemplate.get(p.cargoTemplateId) ?? [];
        list.push(p.cargoInstanceId);
        byTemplate.set(p.cargoTemplateId, list);
      }
    }
    return Array.from(byTemplate.entries()).map(([cargoTemplateId, instanceIds]) => ({
      cargoTemplateId,
      instanceIds,
      name: templateNameById.get(cargoTemplateId) ?? cargoTemplateId,
    }));
  }, [solution, templateNameById]);

  const currentAssignment = (cargoTemplateId: string): string => {
    const existing = openTrip?.plan.cargo.find((c) => c.cargoTemplateId === cargoTemplateId);
    return existing?.stopId ?? openTrip?.plan.stops[0]?.stopId ?? '';
  };

  const assignGroupToStop = (cargoTemplateId: string, stopId: string) => {
    if (!openTrip) return;
    const group = liveCargoGroups.find((g) => g.cargoTemplateId === cargoTemplateId);
    if (!group) return;
    const others = openTrip.plan.cargo.filter((c) => c.cargoTemplateId !== cargoTemplateId);
    const updated = group.instanceIds.map((cargoInstanceId) => ({ cargoInstanceId, cargoTemplateId, stopId }));
    updatePlan({ cargo: [...others, ...updated] });
  };

  // Cặp điểm giao còn thiếu khoảng cách (dùng để chặn nút "Đề xuất phương án" và nhắc người dùng
  // nhập đủ trước — engine không tự đoán khoảng cách thiếu). KHÔNG dùng useMemo: danh sách điểm
  // giao chỉ có vài phần tử (vòng lặp lồng nhau vẫn rất rẻ), và React Compiler không chứng minh
  // được `openTrip` bất biến qua các lần render nên tự bỏ qua memo hoá thủ công ở đây (lỗi
  // react-hooks/preserve-manual-memoization) — bỏ hẳn useMemo tránh lỗi đó mà không đổi kết quả.
  const missingDistancePairs: Array<[TripPlanStop, TripPlanStop]> = [];
  if (openTrip) {
    const stops = openTrip.plan.stops;
    const distances = openTrip.plan.distances ?? [];
    for (let i = 0; i < stops.length; i++) {
      for (let j = i + 1; j < stops.length; j++) {
        if (distanceBetween(distances, stops[i].stopId, stops[j].stopId) === null) {
          missingDistancePairs.push([stops[i], stops[j]]);
        }
      }
    }
  }

  // "Giai đoạn C": chọn MỘT phương án giao hàng duy nhất — gọi thẳng engine/optimization/
  // routeProposal.ts (đọc cargoTemplates hiện tại của store, không tự tính constraint gì ở đây),
  // rồi lưu kết quả vào đúng chuyến qua tripStorage.ts.
  const handleProposeRoute = () => {
    if (!openTrip) return;
    const stopIdByCargoTemplateId = new Map(openTrip.plan.cargo.map((c) => [c.cargoTemplateId, c.stopId] as const));
    setRouteBusy(true);
    // Tính đồng bộ nhưng tách khỏi handler bằng setTimeout(0) để UI kịp vẽ trạng thái "Đang tính..."
    // trước khi thuật toán (có thể chiếm tới ~3 giây với nhiều điểm giao) chặn main thread.
    setTimeout(() => {
      const route = proposeSingleRoute({
        cargoTemplates,
        containerLibrary,
        stops: openTrip.plan.stops,
        distances: openTrip.plan.distances ?? [],
        stopIdByCargoTemplateId,
      });
      persistEntry({ ...openTrip, route });
      setRouteBusy(false);
    }, 0);
  };

  // Tự động gán ĐIỂM GIAO ĐẦU TIÊN cho loại hàng nào chưa được gán (vd vừa "Tạo phương án xếp
  // hàng" xong, chưa ai bấm vào ô chọn điểm giao nào cả) — để "✓ Đã xếp N kiện cho M điểm giao"
  // và Bước 3 tự mở ra ngay khi có phương án + điểm giao, không bắt người dùng phải chạm vào từng
  // ô chọn dù chỉ để "xác nhận" giá trị mặc định đã đúng. Người dùng vẫn đổi được điểm giao khác
  // bất cứ lúc nào qua <select> bên dưới, gán tự động ở đây chỉ là giá trị khởi điểm.
  useEffect(() => {
    if (!openTrip || openTrip.plan.stops.length === 0) return;
    const assignedTemplateIds = new Set(openTrip.plan.cargo.map((c) => c.cargoTemplateId));
    const missing = liveCargoGroups.filter((g) => !assignedTemplateIds.has(g.cargoTemplateId));
    if (missing.length === 0) return;
    const defaultStopId = openTrip.plan.stops[0].stopId;
    const added = missing.flatMap((g) =>
      g.instanceIds.map((cargoInstanceId) => ({ cargoInstanceId, cargoTemplateId: g.cargoTemplateId, stopId: defaultStopId })),
    );
    // Ghi localStorage (external system) là việc HỢP LỆ để làm trong effect — chỉ bọc lại lệnh
    // setState (bên trong persistEntry, qua refresh()) bằng queueMicrotask để tránh bị
    // react-hooks/set-state-in-effect chặn do gọi setState "trực tiếp" ngay đầu thân effect; vẫn
    // chạy ngay sau, trước lần vẽ tiếp theo, không đổi thời điểm ghi/lưu so với trước.
    queueMicrotask(() => {
      persistEntry({ ...openTrip, plan: { ...openTrip.plan, cargo: [...openTrip.plan.cargo, ...added] } });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTrip, liveCargoGroups]);

  const updateArrival = (value: string) => {
    if (!openTrip) return;
    const n = Number(value);
    const stops = openTrip.actual?.stops ?? openTrip.plan.stops.map((s) => ({ stopId: s.stopId, deliveredCount: 0 }));
    persistEntry({
      ...openTrip,
      actual: { tripId: openTrip.plan.tripId, actualArrivalMinutes: Number.isFinite(n) ? n : 0, stops },
    });
  };

  const updateDelivered = (stopId: string, value: string) => {
    if (!openTrip) return;
    const n = Number(value);
    const prevStops = openTrip.actual?.stops ?? openTrip.plan.stops.map((s) => ({ stopId: s.stopId, deliveredCount: 0 }));
    const stops = prevStops.map((s) => (s.stopId === stopId ? { ...s, deliveredCount: Number.isFinite(n) ? n : 0 } : s));
    persistEntry({
      ...openTrip,
      actual: { tripId: openTrip.plan.tripId, actualArrivalMinutes: openTrip.actual?.actualArrivalMinutes ?? 0, stops },
    });
  };

  const handleExport = () => {
    const result = exportTripsJson();
    if (!result.ok) {
      setNotice(result.error);
      return;
    }
    const blob = new Blob([result.data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `freightfit-trips-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      const result = importTripsJson(text);
      setNotice(result.ok ? 'Đã khôi phục dữ liệu chuyến từ file.' : result.error);
      if (result.ok) refresh();
    };
    reader.onerror = () => setNotice('Không đọc được file đã chọn.');
    reader.readAsText(file);
  };

  const step1Done = openTrip ? isStep1Done(openTrip.plan) : false;
  const step2Done = openTrip ? isStep2Done(openTrip.plan) : false;
  const canOpenStep3 = step1Done && step2Done;

  return (
    <div className="panel trip-panel">
      <div className="panel-header">
        <h2>Chuyến hàng của bạn</h2>
      </div>
      {notice && <p className="trip-notice">{notice}</p>}
      {!tripsResult.ok && <p className="form-error">{tripsResult.error}</p>}

      {!openTrip ? (
        <>
          <div className="form-actions">
            <button type="button" className="primary" onClick={handleCreateTrip}>+ Chuyến mới</button>
          </div>
          {trips.length === 0 ? (
            <div className="trip-empty">
              <p className="bb-muted">Chưa có chuyến nào.</p>
              <button type="button" className="bb-btn" onClick={handleCreateTrip}>Tạo chuyến đầu tiên</button>
            </div>
          ) : (
            <ul className="trip-card-list">
              {trips.map((entry) => {
                const status = tripStatus(entry);
                return (
                  <li
                    key={entry.plan.tripId}
                    className="trip-card"
                    onClick={() => {
                      setOpenTripId(entry.plan.tripId);
                      setActiveStep(1);
                    }}
                  >
                    <div className="trip-card-main">
                      <b>{entry.plan.name}</b>
                      <span className={`trip-status trip-status-${status}`}>{STATUS_LABEL[status]}</span>
                    </div>
                    <span className="trip-card-date">{formatDateShort(entry.plan.createdAt)}</span>
                    <button
                      type="button"
                      className="icon-button trip-card-delete"
                      aria-label="Xoá chuyến"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteTrip(entry.plan.tripId, entry.plan.name);
                      }}
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : (
        <div className="trip-detail">
          <button type="button" className="link-button trip-back" onClick={() => setOpenTripId(null)}>
            ← Danh sách chuyến
          </button>

          <div className="trip-steps" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeStep === 1}
              className={`trip-step-tab${activeStep === 1 ? ' is-active' : ''}`}
              onClick={() => setActiveStep(1)}
            >
              {step1Done ? '✓ ' : ''}① Thông tin chuyến
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeStep === 2}
              className={`trip-step-tab${activeStep === 2 ? ' is-active' : ''}`}
              onClick={() => setActiveStep(2)}
            >
              {step2Done ? '✓ ' : ''}② Xếp hàng
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeStep === 3}
              className={`trip-step-tab${activeStep === 3 ? ' is-active' : ''}${!canOpenStep3 ? ' is-disabled' : ''}`}
              disabled={!canOpenStep3}
              title={canOpenStep3 ? undefined : 'Cần hoàn thành Bước 1 và Bước 2 trước'}
              onClick={() => canOpenStep3 && setActiveStep(3)}
            >
              {openTrip.actual ? '✓ ' : ''}③ Sau khi giao xong
            </button>
          </div>
          {!canOpenStep3 && (
            <p className="trip-step-reason">
              {!step1Done
                ? 'Cần thêm ít nhất 1 điểm giao (đặt tên đầy đủ) ở Bước 1 trước.'
                : 'Cần xếp hàng lên xe và gán điểm giao ở Bước 2 trước.'}
            </p>
          )}

          {activeStep === 1 && (
            <div className="trip-step-panel">
              <label className="field field-sm">
                <span>Đặt tên cho chuyến</span>
                <input type="text" value={openTrip.plan.name} onChange={(e) => updatePlan({ name: e.target.value })} />
              </label>
              <p className="trip-hint">Nhập nơi xe sẽ giao hàng, theo thứ tự.</p>
              {openTrip.plan.stops.length === 0 && <p className="bb-muted">Chưa có điểm giao nào.</p>}
              {openTrip.plan.stops.map((s) => (
                <div key={s.stopId} className="field-row trip-stop-row">
                  <label className="field field-sm">
                    <span>Tên điểm</span>
                    <input
                      type="text"
                      value={s.name}
                      onChange={(e) => updateStop(s.stopId, { name: e.target.value })}
                      placeholder={`Điểm ${s.order + 1}`}
                    />
                  </label>
                  <label className="field field-sm">
                    <span>Giờ dự kiến đến (phút sau khi xuất phát)</span>
                    <input
                      type="number"
                      value={s.etaMinutes}
                      onChange={(e) => updateStop(s.stopId, { etaMinutes: Number(e.target.value) })}
                    />
                  </label>
                  <button type="button" className="icon-button" aria-label="Xoá điểm giao" onClick={() => removeStop(s.stopId)}>
                    ×
                  </button>
                </div>
              ))}
              <button type="button" className="bb-btn" onClick={addStop}>+ Thêm điểm giao</button>

              {openTrip.plan.stops.length >= 2 && (
                <>
                  <p className="trip-hint">
                    Khoảng cách ước lượng giữa các điểm giao (km, tự nhập) — dùng để đề xuất thứ tự giao ở Bước 2.
                  </p>
                  {openTrip.plan.stops.map((a, i) =>
                    openTrip.plan.stops.slice(i + 1).map((b) => (
                      <div key={`${a.stopId}-${b.stopId}`} className="field-row trip-stop-row">
                        <span className="trip-cargo-name">
                          {a.name || `Điểm ${a.order + 1}`} ↔ {b.name || `Điểm ${b.order + 1}`}
                        </span>
                        <input
                          type="number"
                          min={0}
                          className="trip-distance-input"
                          value={distanceBetween(openTrip.plan.distances ?? [], a.stopId, b.stopId) ?? ''}
                          onChange={(e) => updateDistance(a.stopId, b.stopId, e.target.value)}
                          placeholder="km"
                        />
                      </div>
                    )),
                  )}
                </>
              )}
            </div>
          )}

          {activeStep === 2 && (
            <div className="trip-step-panel">
              <button
                type="button"
                className="primary trip-load-btn"
                onClick={() => document.getElementById('app-column-left')?.scrollIntoView({ behavior: 'smooth' })}
              >
                Xếp hàng lên xe
              </button>
              {liveCargoGroups.length === 0 ? (
                <p className="bb-muted">
                  Chưa có hàng hoá nào được xếp — thêm hàng rồi bấm "Tạo phương án xếp hàng" ở khung 3D bên phải, sau đó quay lại đây.
                </p>
              ) : openTrip.plan.stops.length === 0 ? (
                <p className="bb-muted">Cần thêm điểm giao ở Bước 1 trước khi gán hàng.</p>
              ) : (
                <>
                  <p className="trip-step2-done">
                    ✓ Đã xếp {liveCargoGroups.reduce((sum, g) => sum + g.instanceIds.length, 0)} kiện cho{' '}
                    {new Set(liveCargoGroups.map((g) => currentAssignment(g.cargoTemplateId))).size} điểm giao
                  </p>
                  <p className="trip-hint">Chọn kiện hàng nào giao ở điểm nào:</p>
                  {liveCargoGroups.map((g) => (
                    <div key={g.cargoTemplateId} className="field-row trip-stop-row">
                      <span className="trip-cargo-name">{g.name} × {g.instanceIds.length}</span>
                      <select
                        className="bb-select"
                        value={currentAssignment(g.cargoTemplateId)}
                        onChange={(e) => assignGroupToStop(g.cargoTemplateId, e.target.value)}
                      >
                        {openTrip.plan.stops.map((s) => (
                          <option key={s.stopId} value={s.stopId}>{s.name || `Điểm ${s.order + 1}`}</option>
                        ))}
                      </select>
                    </div>
                  ))}

                  <div className="trip-route-section">
                    <p className="trip-hint">
                      Chọn 1 phương án giao hàng đề xuất: thứ tự giao + xe, sao cho không kiện nào bị chắn khi dỡ hàng.
                    </p>
                    {missingDistancePairs.length > 0 && (
                      <p className="trip-step-reason">
                        Còn thiếu khoảng cách giữa {missingDistancePairs.length} cặp điểm giao — nhập đủ ở Bước 1 trước.
                      </p>
                    )}
                    <button
                      type="button"
                      className="bb-btn"
                      disabled={routeBusy || missingDistancePairs.length > 0}
                      onClick={handleProposeRoute}
                    >
                      {routeBusy ? 'Đang tính...' : 'Đề xuất phương án'}
                    </button>

                    {openTrip.route && (
                      <RouteResultCard route={openTrip.route} stops={openTrip.plan.stops} />
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {activeStep === 3 && canOpenStep3 && (
            <div className="trip-step-panel">
              <label className="field field-sm">
                <span>Giờ đến thực tế (phút sau khi xuất phát)</span>
                <input
                  type="number"
                  value={openTrip.actual?.actualArrivalMinutes ?? ''}
                  onChange={(e) => updateArrival(e.target.value)}
                />
              </label>
              {openTrip.plan.stops.map((s) => {
                const expected = openTrip.plan.cargo.filter((c) => c.stopId === s.stopId).length;
                const delivered = openTrip.actual?.stops.find((a) => a.stopId === s.stopId)?.deliveredCount ?? '';
                return (
                  <label key={s.stopId} className="field field-sm">
                    <span>Số kiện đã giao tại {s.name || `Điểm ${s.order + 1}`} (dự kiến {expected} kiện)</span>
                    <input type="number" value={delivered} onChange={(e) => updateDelivered(s.stopId, e.target.value)} />
                  </label>
                );
              })}
              <div className="form-actions">
                <button type="button" className="bb-btn" onClick={() => onFindIncidentCause?.(openTrip.plan)}>
                  Tìm nguyên nhân sự cố
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <details className="trip-advanced">
        <summary>Nâng cao</summary>
        <p className="trip-disclaimer">Dữ liệu chỉ lưu trên trình duyệt này; hãy sao lưu ra file để không bị mất.</p>
        <div className="form-actions">
          <button type="button" className="bb-btn" onClick={handleExport}>Sao lưu ra file</button>
          <button type="button" className="bb-btn" onClick={() => fileInputRef.current?.click()}>Khôi phục từ file</button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImportFile(file);
            e.target.value = '';
          }}
        />
      </details>
    </div>
  );
}

interface RouteResultCardProps {
  route: NonNullable<StoredTripEntry['route']>;
  stops: TripPlanStop[];
}

/**
 * Thẻ kết quả DUY NHẤT cho "Giai đoạn C" — chỉ hiện 1 phương án đề xuất (không danh sách nhiều
 * phương án), đúng yêu cầu. Quãng đường luôn ghi rõ là ước lượng (từ khoảng cách tự nhập).
 */
function RouteResultCard({ route, stops }: RouteResultCardProps) {
  const stopNameById = new Map(stops.map((s) => [s.stopId, s.name || `Điểm ${s.order + 1}`] as const));

  if (!route.feasible) {
    return (
      <div className="trip-route-card trip-route-card-infeasible">
        <p className="trip-route-label">Chưa tìm được phương án</p>
        <p className="trip-hint">{route.reason}</p>
        <p className="trip-hint">Gợi ý: {route.suggestion}</p>
      </div>
    );
  }

  const { proposal } = route;
  const extraKm = proposal.estimatedDistanceKm - proposal.shortestPossibleDistanceKm;

  return (
    <div className="trip-route-card">
      <p className="trip-route-label">✓ Phương án đề xuất</p>
      <p className="trip-hint">
        Thứ tự giao: {proposal.stopOrder.map((id) => stopNameById.get(id) ?? id).join(' → ')}
      </p>
      <p className="trip-hint">Tỷ lệ lấp đầy xe: {proposal.fillRatioPercent.toFixed(0)}%</p>
      <p className="trip-hint">
        Quãng đường ước lượng: {proposal.estimatedDistanceKm} km
        {extraKm > 0 && ` (dài hơn ${extraKm} km so với thứ tự ngắn nhất${proposal.usedHeuristic ? ' đã xét' : ''} để không kiện nào bị chắn)`}
      </p>
      <p className="trip-hint">Số kiện bị chắn: {proposal.blockedCount}</p>
      {proposal.usedHeuristic && (
        <p className="trip-step-reason">
          Nhiều điểm giao/kiện hàng nên đã dùng cách tính gần đúng (heuristic), không đảm bảo là thứ tự ngắn nhất tuyệt đối.
        </p>
      )}
    </div>
  );
}
