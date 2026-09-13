# CLAUDE.md

Hệ thống tối ưu xếp hàng 3D vào container/xe tải. **Frontend-only, không backend.** State chỉ tồn tại in-memory lúc runtime (mất khi refresh) — KHÔNG thêm localStorage/IndexedDB/API trừ khi được yêu cầu rõ.

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
│   ├── preprocessing/       normalizeCargo, sortCargo
│   ├── packing/             extremePoints, placement, packContainer
│   ├── constraints/         collision, stacking, payload, deliveryOrder, support (ratio+CG), clearance
│   ├── vehicle/             generatePlans, costCalculator
│   ├── optimization/        evaluator, localSearch
│   └── revalidate.ts        dùng khi user kéo tay chỉnh sửa (P3)
│
├── store/                   Zustand, map trực tiếp theo AppState trong types.ts
│   └── slices/               cargoSlice, containerSlice, solutionSlice, editHistorySlice
│
├── import/                  parseExcel.ts — map CargoImportRow -> CargoTemplate
│
├── components/
│   ├── scene/                Container3D, CargoBox3D, camera controls
│   ├── panels/                ContainerLibraryPanel, ImportPanel, StatsPanel, SolutionSwitcher
│   ├── simulation/            StepPlayer (Next/Previous — P2)
│   └── shared/
│
└── utils/

tests/
├── engine/                   1 file test tương ứng 1 file trong src/engine
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
Tham chiếu `docs/algorithm-design.md` mục constraints. Danh sách bắt buộc pass trước khi tính bất kỳ điểm tối ưu nào:
collision-free, container payload, local load-on-top, stacking level, rotation cho phép, delivery order (hàng giao trước phải gần cửa hơn hàng giao sau), support ratio ≥ ngưỡng cấu hình, clearance.

Nguyên tắc: **feasible trước, optimize sau**. Không viết code kiểu "chọn phương án score cao nhất" mà bỏ qua bước validate hard constraint.

## Ngôn từ UI (guardrail)
Không viết copy/label kiểu "đảm bảo hàng không đổ khi vận chuyển". Chỉ dùng cách nói: "cảnh báo ổn định hình học" / "stability heuristic". Đây là giới hạn kỹ thuật thật của thuật toán (không mô phỏng lực phanh/rung/ma sát), phải phản ánh đúng trong UI.

## Testing
- Mỗi file trong `engine/constraints/` phải có test tương ứng trong `tests/engine/constraints/` với tối thiểu: 1 case hợp lệ, 1 case vi phạm.
- Có integration test: pack một bộ cargo mẫu vào 1 container mẫu, assert không có 2 placement nào overlap và tất cả nằm trong bounds container.
- `localSearch`: test non-regression — score sau local search không được lớn hơn score trước đó.
- `revalidate.ts`: test move một item vào vị trí đã có item khác → phải trả về violation COLLISION.
- Không merge/coi task hoàn thành nếu `npm run test` và `npm run typecheck` chưa pass.

## Roadmap (làm đúng thứ tự, không nhảy phase)

### Phase 1 — Core single container (map P1 + V1 algorithm)
- [ ] `domain/types.ts` (copy từ thiết kế, chỉnh nếu cần)
- [ ] Container library: template chuẩn (20ft/40ft GP/40ft HC/45ft) + custom
- [ ] Import Excel → validate → `CargoTemplate`
- [ ] Orientation từ `RotationAxis` → `allowedOrientations`
- [ ] Engine: extreme point generator, placement scoring, packContainer (1 container)
- [ ] Constraints: collision, payload, stacking (weight-based đơn giản), rotation
- [ ] Support ratio + clearance (dùng ngay từ Phase 1 vì là hard constraint cho stacking, KHÔNG chờ tới Phase 2)
- [ ] 3D visualization: wireframe container, box màu theo SKU, rotate/zoom/pan, click xem info
- [ ] Stats: % lấp đầy thể tích, % tải trọng, danh sách hàng không xếp vừa + lý do
- [ ] 3 phương án hiển thị (cost/space/balanced) — ở Phase 1 chỉ khác nhau về heuristic sort/placement trong 1 container, chưa cần multi-container thật

### Phase 2 — P2
- [ ] Center of gravity toàn container + cảnh báo lệch trục (UI warning, không phải hard block)
- [ ] Step-by-step loading simulation (Next/Previous, ẩn/hiện placement theo bước load order)

### Phase 3 — P3
- [ ] Manual edit: move/rotate/swap trong scene 3D + gọi `revalidate.ts` ngay khi thả tay
- [ ] Edit history (undo/redo) theo `EditHistoryState`
- [ ] Multi-container: `vehicle/generatePlans.ts` sinh tổ hợp xe, pack thử từng plan, chọn theo `costCalculator`
- [ ] Local search (move/swap/rotate/repack) áp dụng sau khi có solution feasible

### Backlog (P4 — chưa thiết kế, không làm khi chưa yêu cầu)
Login/lưu lịch sử, responsive multi-device, export PDF.

## Việc KHÔNG làm nếu không được yêu cầu rõ
- Không thêm backend/API.
- Không thêm persistence (localStorage/IndexedDB) — state in-memory là quyết định đã chốt.
- Không nhảy thẳng vào Simulated Annealing/Genetic Algorithm — chỉ Greedy + Local Search cho tới khi Phase 1-3 chạy ổn.
- Không tự đổi đơn vị đo hoặc tự thêm field vào `types.ts` mà không cập nhật file gốc.
