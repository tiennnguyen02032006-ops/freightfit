# CLAUDE.md

Hệ thống tối ưu xếp hàng 3D vào container/xe tải. **Frontend-only, không backend.** State chỉ tồn tại in-memory lúc runtime (mất khi refresh) — KHÔNG thêm localStorage/IndexedDB/API trừ khi được yêu cầu rõ.

**Ngoại lệ persistence (đã được yêu cầu rõ):** state nghiệp vụ (solution, cargoTemplates, containerLibrary...) vẫn in-memory, KHÔNG lưu. localStorage CHỈ được dùng ở đúng 3 nơi sau, không tự thêm nơi nào khác:
- `src/storage/tripStorage.ts` (khóa `freightfit:trips:v1`) — "kế hoạch chuyến" (từ lúc xếp hàng 3D, gồm cả phương án đề xuất giao hàng "Giai đoạn C") và dữ liệu THỰC TẾ của chuyến (đối chiếu với Black Box). Xem `src/domain/types.ts` mục 13-14 (`TripPlanRecord`/`TripActualRecord`/`StoredTrips`/`TripRouteResult`). Đây là module DUY NHẤT được phép đọc/ghi cho phạm vi dữ liệu chuyến này.
- `src/utils/skuColorStorage.ts` (khóa `freightfit:sku-colors`) — màu tùy chỉnh người dùng gán theo SKU, áp dụng cho mọi template cùng SKU.
- `src/App.tsx` (khóa `freightfit.leftPanelWidth`) — nhớ chiều rộng panel trái đã kéo giữa các lần mở app.

2 nơi sau (skuColorStorage, leftPanelWidth) là tuỳ chọn giao diện thuần túy (UI preference), tách biệt hẳn với dữ liệu chuyến ở tripStorage.ts. Cả 3 nơi đều bọc try/catch, không crash app nếu trình duyệt chặn localStorage.

## Tech stack
- React + TypeScript
- React Three Fiber (Three.js) cho scene 3D
- Zustand cho state (in-memory)
- Vite + Vitest + ESLint

Commands (cập nhật lại sau khi scaffold xong):
```
npm run dev
npm run build
npm run test
npm run lint
npm run typecheck
```

## Nguồn chân lý (đọc trước khi code)
- `docs/algorithm-design.md` — thiết kế thuật toán packing (bắt buộc đọc trước khi đụng vào `src/engine/`)
- `src/domain/types.ts` — toàn bộ type của hệ thống. Mọi thay đổi model phải sửa ở đây trước, không tự thêm field rời rạc ở nơi khác.

## Cấu trúc thư mục

```
src/
├── domain/
│   └── types.ts            # single source of truth cho toàn bộ interface
│
├── engine/                 # THUẦN TypeScript. TUYỆT ĐỐI không import React/Three ở đây.
│   ├── preprocessing/       normalizeCargo, sortCargo, orientation, containerSeed
│   ├── packing/             extremePoints, placementScoring, packContainer, unfitReason
│   ├── constraints/         collision, stacking, payload, rotation, support (ratio+CG), clearance,
│   │                        deliveryOrder (RIÊNG cho route proposal "Giai đoạn C" — xem dưới,
│   │                        KHÔNG dùng trong packContainer.ts)
│   ├── optimization/        generateSolutions (multi-container cùng 1 loại xe), stats,
│   │                        centerOfGravity, suggestBetterContainer, applyEdit,
│   │                        routeProposal (Giai đoạn C: chọn 1 thứ tự giao + xe không kiện nào bị chắn)
│   ├── palletizing/         palletizeCargo (xếp thùng lên pallet theo lớp), palletBlock (pallet = khối cứng
│   │                        đưa vào packContainer, số tầng pallet qua palletize.maxTiers), palletBoxes
│   │                        (quy vị trí từng thùng ra toạ độ container để hiển thị/thống kê theo thùng)
│   ├── blackbox/            mô hình + dữ liệu mô phỏng cho tab "Black Box" (điều tra sự cố giao
│   │                        hàng) — độc lập hoàn toàn với engine xếp hàng 3D ở trên
│   ├── revalidate.ts        dùng khi user kéo tay chỉnh sửa (P3, đã có)
│   ├── snapping.ts          hút khớp vị trí khi kéo tay trong scene 3D
│   ├── rotationAvailability.ts
│   └── config.ts            toàn bộ hằng số/trọng số (MIN_SUPPORT_RATIO, PLACEMENT_SCORE_WEIGHTS...)
│
├── store/                   Zustand, map trực tiếp theo AppState trong types.ts
│   └── slices/               cargoSlice, containerSlice, solutionSlice, editSlice
│
├── import/                  parseExcel.ts — map CargoImportRow -> CargoTemplate
├── export/                  exportPdf.ts — xuất PDF (jspdf + html2canvas)
├── storage/                 tripStorage.ts — xem "Ngoại lệ persistence" ở trên
│
├── components/
│   ├── scene/                ContainerScene, ContainerShell, CargoBox3D, DraggablePlacement,
│   │                          camera/step-simulation controls...
│   ├── panels/                AddCargoPanel, ImportPanel, SavedTripsPanel
│   │                          ("Chuyến hàng của bạn" — kế hoạch chuyến + Giai đoạn C), BlackBoxPanel
│   └── shared/
│
└── utils/                   skuColorStorage.ts, formatUnits...

tests/
├── engine/                   1 file test tương ứng 1 file trong src/engine
├── storage/                  tripStorage.ts
└── fixtures/                 container mẫu, cargo mẫu dùng chung cho test
```

## UI Reference
Tham khảo ảnh thiết kế tổng quan: `docs/design/overview.png` 
Khi tạo/sửa bất kỳ component trong `src/components/panels/` hoặc layout tổng thể, PHẢI xem file này trước (dùng lệnh view/read ảnh) để bám theo: bố cục panel, khoảng cách, panel điều khiển. 
Nếu có xung đột giữa ảnh và mô tả text ở nơi khác, text là ưu tiên.


## Ranh giới bắt buộc
- `engine/**` là pure functions: input → output, không side effect, không đọc store, không đụng DOM/Three.js. Đây là điều kiện để test được mà không cần render 3D.
- `components/**` chỉ đọc dữ liệu qua store hooks, không tự tính toán constraint. Nếu component cần biết một placement có hợp lệ không → gọi hàm trong `engine/`, không viết logic riêng.
- Đơn vị thống nhất toàn hệ thống: **mm** cho kích thước, **kg** cho khối lượng. Khi import Excel, nếu dữ liệu ở cm/m phải convert ngay tại `import/parseExcel.ts`, không convert rải rác ở nơi khác.
- Naming: phân biệt rõ `*TemplateId` (định nghĩa gốc) và `*InstanceId`/`cargoInstanceId` (sau khi expand theo quantity, đã có tọa độ cụ thể). Không dùng lẫn hai loại id.

## Hard constraint — KHÔNG được vi phạm để đổi lấy score đẹp hơn
Tham chiếu `docs/algorithm-design.md` mục constraints. Danh sách bắt buộc pass trước khi tính bất kỳ điểm tối ưu nào trong `packContainer.ts` (pipeline xếp hàng chính):
collision-free, container payload, local load-on-top, stacking level, rotation cho phép, support ratio ≥ ngưỡng cấu hình, clearance.

`delivery order` (hàng giao trước phải gần cửa hơn/không bị kiện giao sau chắn) KHÔNG còn là hard constraint của `packContainer.ts` — app không còn khái niệm nhóm hàng theo điểm giao trong lúc xếp (xem `sortCargo.ts`). Constraint này chỉ tồn tại RIÊNG trong `engine/constraints/deliveryOrder.ts`, dùng cho tính năng "Giai đoạn C" (`engine/optimization/routeProposal.ts`, chọn 1 phương án giao hàng đề xuất trong `SavedTripsPanel.tsx`) — đọc kết quả xếp có sẵn rồi thử các thứ tự giao khác nhau, không sửa gì ở `packContainer.ts`.

Nguyên tắc: **feasible trước, optimize sau**. Không viết code kiểu "chọn phương án score cao nhất" mà bỏ qua bước validate hard constraint.

## Ngôn từ UI (guardrail)
Không viết copy/label kiểu "đảm bảo hàng không đổ khi vận chuyển". Chỉ dùng cách nói: "cảnh báo ổn định hình học" / "stability heuristic". Đây là giới hạn kỹ thuật thật của thuật toán (không mô phỏng lực phanh/rung/ma sát), phải phản ánh đúng trong UI.

## Testing
- Mỗi file trong `engine/constraints/` phải có test tương ứng trong `tests/engine/constraints/` với tối thiểu: 1 case hợp lệ, 1 case vi phạm.
- Có integration test: pack một bộ cargo mẫu vào 1 container mẫu, assert không có 2 placement nào overlap và tất cả nằm trong bounds container.
- `revalidate.ts`: test move một item vào vị trí đã có item khác → phải trả về violation COLLISION.
- `routeProposal.ts` (Giai đoạn C): test thứ tự ngắn nhất bị chắn nên chọn thứ tự dài hơn, test trường hợp không tồn tại phương án thoả hết, test phương án được chọn luôn không có kiện nào bị chắn.
- `tripStorage.ts`: test với mock `localStorage` — lưu/đọc đúng dữ liệu, dữ liệu hỏng/sai định dạng bị bỏ qua, lỗi ghi (hết dung lượng) không crash app.
- Không merge/coi task hoàn thành nếu `npm run test` và `npm run typecheck` chưa pass.

## Roadmap (làm đúng thứ tự, không nhảy phase)

### Phase 1 — Core single container (map P1 + V1 algorithm) — ĐÃ XONG
- [x] `domain/types.ts`
- [x] Container library: template chuẩn (20ft/40ft GP/HC/Reefer/45ft) + xe tải thật (Hyundai/Isuzu/Veam...) + custom
- [x] Import Excel → validate → `CargoTemplate` (`import/parseExcel.ts`)
- [x] Orientation từ `RotationAxis` → `allowedOrientations`
- [x] Engine: extreme point generator, placement scoring, `packContainer` (1 container, thuật toán "shelf" — xem `docs/algorithm-design.md`)
- [x] Constraints: collision, payload, stacking, rotation
- [x] Support ratio + clearance
- [x] 3D visualization: wireframe container, box màu theo SKU (tuỳ chỉnh được, xem `utils/skuColorStorage.ts`), rotate/zoom/pan, click xem info
- [x] Stats: % lấp đầy thể tích, % tải trọng, danh sách hàng không xếp vừa + lý do

Mục "3 phương án hiển thị (cost/space/balanced)" đã bị BỎ theo yêu cầu sau này — app hiện chỉ có ĐÚNG 1 thuật toán xếp hàng duy nhất, không còn khái niệm nhiều strategy (xem `engine/config.ts`, `sortCargo.ts`).

### Phase 2 — P2 — ĐÃ XONG
- [x] Center of gravity toàn container + cảnh báo lệch trục (`centerOfGravity.ts`, UI warning — không phải hard block)
- [x] Step-by-step loading simulation (Next/Previous, `StepSimulationControls.tsx`/`stepSimulation.ts`)

### Phase 3 — P3 — MỘT PHẦN
- [x] Manual edit: move/rotate/swap trong scene 3D (`DraggablePlacement.tsx`) + gọi `revalidate.ts` ngay khi thả tay

Còn thiếu (không tự làm khi chưa được yêu cầu rõ — xem "Việc KHÔNG làm" bên dưới): edit history (undo/redo, `EditHistoryState` khai báo sẵn trong `types.ts`/`store/index.ts` nhưng chưa có logic/UI nào dùng), multi-container theo TỔ HỢP nhiều loại xe khác nhau (hiện `generateSolutions.ts` chỉ tự lặp CÙNG 1 loại container đã chọn cho tới khi hết hàng hoặc không xếp thêm được), local search (move/swap/rotate/repack sau khi có solution feasible — `EVALUATOR_WEIGHTS`/`LOCAL_SEARCH_TIME_LIMIT_MS` đã khai báo sẵn trong `engine/config.ts` nhưng chưa có file `localSearch.ts`/`evaluator.ts` nào dùng tới).

### Đã làm thêm ngoài roadmap gốc
- **Giai đoạn C** — chọn 1 phương án giao hàng đề xuất (thứ tự giao + xe, ràng buộc "không kiện nào bị chắn") cho 1 chuyến đã lưu. Xem `engine/constraints/deliveryOrder.ts`, `engine/optimization/routeProposal.ts`, khu "Chuyến hàng của bạn" trong `SavedTripsPanel.tsx`.
- **"Chuyến hàng của bạn"** (`SavedTripsPanel.tsx` + `storage/tripStorage.ts`) — lưu kế hoạch chuyến (điểm giao, khoảng cách, gán hàng) và dữ liệu thực tế sau khi giao, tự động lưu, xuất/nhập file JSON để sao lưu.
- **Xếp lên pallet** (`engine/palletizing/`, `components/panels/PalletPlanPanel.tsx`, `components/scene/PalletBlock3D.tsx`) — tuỳ chọn "Xếp lên pallet" trong form nhập hàng (`CargoTemplate.palletize`): mỗi pallet 1 SKU, xếp theo lớp (mỗi lớp thử các hướng đặt), thùng thừa tạo pallet lẻ. Khi tạo phương án, mỗi pallet vào container như 1 KHỐI CỨNG (`Placement.palletLoad`, không tách thùng khỏi pallet), tuân thủ tải trọng container và số tầng pallet tối đa; vị trí từng thùng vẫn lưu để vẽ 3D và thống kê theo thùng (`SolutionStats.boxCount/palletCount`). Thùng không lên pallet được vào `unfitCargo`.
- **Chèn lót bằng túi khí** (`engine/optimization/dunnage.ts`, `engine/palletizing/palletLayout.ts`, `components/scene/DunnageLayer3D.tsx`) — pallet ưu tiên bố cục hai cột sát hai vách, chừa khe giữa chạy dọc container; mỗi hàng pallet 1 túi. Cỡ túi cấu hình trong `DUNNAGE_CONFIG.bagSizes` (rộng × cao + khoảng khe chèn được mỗi cỡ; mặc định 3 cỡ, chung 5–40 cm): chọn cỡ nhỏ nhất vừa khe và cao ≥ 2/3 pallet, không có thì 2 túi chồng (`engine/optimization/airbagSizes.ts`). Khe giữa phải chèn được bằng ít nhất 1 cỡ, nếu không thì thử đổi hướng pallet, không được thì cảnh báo (`PackingSolution.layoutWarnings`). Số túi hiện ở thống kê/PDF (`SolutionStats.airbagCount`); vẽ 3D bằng InstancedMesh, bật/tắt bằng nút "Chèn lót". Không còn khối gỗ chèn.
- **Dung sai xếp hàng** (`engine/tolerance.ts`, `ToleranceSettings` trong store, `components/panels/ToleranceSettingsPanel.tsx`) — dung sai kích thước mỗi chiều của từng loại hàng (`CargoTemplate.tolerance`, mặc định thùng 1,5 cm) và khe giữa các pallet / pallet với vách container (mặc định 3 cm), mặc định BẬT trong app (engine mặc định không dung sai nếu không truyền cấu hình). Cộng vào trường `clearance` sẵn có (không có cơ chế mới): kiểm tra va chạm, số thùng mỗi lớp, vừa pallet dùng kích thước đã cộng dung sai, 3D vẫn vẽ kích thước thật; `packContainer` nhận `wallMargin` để chừa lề vách. Ghi "đã tính dung sai X cm" ở kế hoạch pallet và PDF. Chỉnh tay (revalidate) chưa tính dung sai.
- **Khu vực kết quả xếp hàng** (`components/scene/ResultTopBar.tsx`, `ResultMetricsRow.tsx`, `ResultSidePanel.tsx`, `CameraToolbar.tsx`, `ContainerScene.tsx`; số liệu/cảnh báo thuần ở `utils/resultMetrics.ts`) — thanh trên cùng chỉ có chọn container + "Tạo phương án xếp hàng" + "Xuất PDF"; hàng số liệu (Khối lượng/Thể tích dạng thanh tiến trình, Thùng và pallet, Cân bằng, Túi khí) + 1 huy hiệu Cảnh báo gộp mọi cảnh báo; bảng bên phải thu gọn được với tab Tổng quan/Pallet/Chèn lót/An toàn; khung 3D chiếm phần còn lại với thanh chọn góc nhìn + công tắc "Chèn lót". Một màu nhấn (`--accent`), chữ xuống dòng thay vì cắt; bố cục đổi theo bề rộng cột giữa (container query). Đã bỏ dải thông tin nổi kéo-thả (`DraggableStatsBar`/`SceneStatsBar`) và dải `SolutionSummaryBar` — nội dung chuyển vào hàng số liệu/bảng bên phải.
- **Nhóm hàng đặc biệt + tách nhóm** (`engine/segregation.ts`, `components/panels/SegregationRulesPanel.tsx`) — mỗi loại hàng có `cargoGroup` (thường/thực phẩm/có mùi/hóa chất/nguy hiểm kèm `dangerClass` 1–9; cột Excel "Nhóm hàng" + "Lớp"). Bảng quy tắc `segregationRules` (store, người dùng chỉnh được, mặc định chỉ là vài cặp VÍ DỤ) cấm cặp nhóm chung container; `generateSolution` chia hàng thành các bộ tương thích (`partitionCompatibleSets`) và xếp riêng từng bộ vào container riêng. Lý do tách hiện ở tab Tổng quan và bản xuất PDF (`PackingSolution.segregation`). Đây là ràng buộc cấp phương án, không nằm trong `packContainer.ts`.
- **Hàng lạnh + container lạnh** (`engine/reefer.ts`, `HeightLimitLine.tsx`) — `CargoTemplate.setTemperatureC` (nhiệt độ cài đặt °C) và `ContainerTemplate.refrigerated/maxStackHeight` (vạch giới hạn chiều cao xếp, mm từ sàn). `generateSolution` chia lô theo nhiệt độ (hàng khác nhiệt độ, kể cả hàng không đặt nhiệt độ, không chung container; hàng lạnh vào container thường -> `TEMPERATURE_MISMATCH`), hạ lòng xe xuống vạch khi xếp/chỉnh tay (`packableContainer`, cả `revalidate.ts`) và chừa khe luồng khí `REEFER_AIR_GAP_MM` quanh hàng qua dung sai/clearance sẵn có. Nhiệt độ/vạch/khe hiện trong ghi chú tách nhóm (tab Tổng quan, PDF). Không mô phỏng nhiệt hay luồng khí.
- **Khách hàng + cảng đích** (`CargoTemplate.customer/destinationPort`, `utils/customerColor.ts`) — màu hàng trong 3D/chú giải mặc định theo khách hàng (màu cố định suy từ tên, bật lại màu SKU được). `generateSolution` chia lô theo cảng đích (hàng khác cảng, kể cả hàng chưa ghi cảng, không chung container), rồi theo nhiệt độ, rồi theo nhóm hàng tương thích; lý do tách + cảng đích + khách hàng của từng container hiện ở ghi chú tách nhóm (Tổng quan, PDF). `sortCargo` xử lý hàng cùng khách hàng liên tục nên pallet cùng khách đặt liền nhau (mỗi pallet vốn chỉ 1 SKU = 1 khách).
- **Black Box** (`engine/blackbox/`, `components/panels/BlackBoxPanel.tsx`) — tab điều tra nguyên nhân sự cố giao hàng trên dữ liệu MÔ PHỎNG, độc lập hoàn toàn với engine xếp hàng 3D.
- **Export PDF** (`export/exportPdf.ts`, nút trong `DraggableStatsBar.tsx`) — đã làm, dù trước đây liệt trong Backlog P4.

### Backlog (chưa thiết kế, không làm khi chưa yêu cầu)
Login/lưu lịch sử, responsive multi-device.

## Việc KHÔNG làm nếu không được yêu cầu rõ
- Không thêm backend/API.
- Không thêm persistence (localStorage/IndexedDB) ngoài đúng 3 nơi đã liệt ở "Ngoại lệ persistence" đầu file — state nghiệp vụ còn lại (solution, cargoTemplates, containerLibrary...) vẫn in-memory, đây vẫn là quyết định đã chốt.
- Không nhảy thẳng vào Simulated Annealing/Genetic Algorithm — chỉ Greedy + Local Search cho tới khi Phase 1-3 chạy ổn.
- Không tự đổi đơn vị đo hoặc tự thêm field vào `types.ts` mà không cập nhật file gốc.
