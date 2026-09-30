# Algorithm Design — 3D Packing Engine

Phạm vi hiện tại: V1 (core) + V1.5 (support ratio, center of gravity, clearance). Không dùng
MILP/Genetic Algorithm/Simulated Annealing. Core: **3D Extreme Point Bin Packing (kiểu "shelf") +
Greedy + Constraint Validation**. Local Search (V2) CHƯA triển khai — xem "Chưa triển khai" ở cuối
file và mục Roadmap trong `CLAUDE.md`.

## 1. Pipeline tổng (thực tế hiện có)

```
generateSolution(cargoTemplates, containerTemplate):
    expanded = expandCargoQuantity(cargoTemplates)   # theo quantity từng CargoTemplate
    sortedItems = sortCargo(expanded)                # 1 LẦN DUY NHẤT cho toàn bộ hàng hóa

    containers = []
    remaining = sortedItems
    loop:
        container, unfit = packContainer(containerTemplate, remaining)  # ĐÚNG 1 container
        containers.add(container)
        if unfit.isEmpty(): break                     # xếp hết -> dừng
        if container không xếp được món nào cả: break  # container mới tinh cũng bó tay -> dừng hẳn
        remaining = unfit
    return PackingSolution(containers, remaining nếu còn = unfitCargo, stats)
```

Không có bước sinh nhiều "vehicle plan" theo tổ hợp NHIỀU LOẠI xe khác nhau rồi chọn theo cost —
người dùng tự chọn 1 `containerTemplate`, `generateSolution` chỉ tự tính SỐ LƯỢNG container CẦN
DÙNG (lặp lại cùng 1 loại). Không có bước `localSearch`/`evaluate` sau khi có solution — solution
đầu tiên xếp được (feasible) chính là kết quả cuối cùng.

**Gợi ý đổi xe** (không phải một phần thuật toán packing): sau khi có solution nhiều container,
`suggestBetterContainer.ts` kiểm tra riêng CONTAINER CUỐI CÙNG — nếu tỷ lệ lấp đầy (thể tích hoặc
tải trọng, lấy mức CAO hơn) dưới `LAST_CONTAINER_MIN_FILL_RATIO` (35%), gợi ý đổi loại xe/container
khác rẻ hơn/nhỏ hơn nhưng vẫn xếp vừa đúng số hàng còn lại của container đó. Đây là PHÂN TÍCH SAU
khi đã có solution, người dùng tự bấm "Áp dụng" mới đổi, không tự động.

## 2. Sort / priority

```
sortCargo(items):
    sort items theo, THEO THỨ TỰ ƯU TIÊN:
      1. volume GIẢM DẦN (hàng to xếp trước, đúng nguyên tắc bin packing cổ điển)
      2. cùng volume: cargoTemplateId (nhóm các kiện CÙNG LOẠI xử lý liên tục, để đặt cạnh nhau
         thành khối đồng nhất thay vì xen kẽ loại khác cùng thể tích ngẫu nhiên)
      3. cùng volume + cùng template: priorityScore GIẢM DẦN (tie-break cuối, đảm bảo thứ tự
         luôn xác định — deterministic)

priorityScore(item) =
    volume  * normalize(volume)
  + weight  * normalize(weight)
  + fragile * (fragile ? 1 : 0)
  + upright * (mustKeepUpright ? 1 : 0)
```
Trọng số (`PRIORITY_WEIGHTS` trong `engine/config.ts`): `volume: 5, weight: 4, fragile: 5, upright: 6`.

**Không còn khái niệm điểm giao/thứ tự giao trong bước sort này** — toàn bộ hàng hóa xếp chung
1 lô duy nhất (đã bỏ hẳn `deliveryPriority`/nhóm theo điểm giao trước đây có trong thiết kế gốc).
Điểm giao chỉ xuất hiện lại ở tính năng RIÊNG "Giai đoạn C" (mục 9 bên dưới), không ảnh hưởng bước
sort/xếp hàng chính này.

**Không còn "3 phương án" (cost/space/balanced)** — trước đây có 3 bộ trọng số/heuristic khác
nhau cho 3 phương án hiển thị song song, nay chỉ còn ĐÚNG 1 bộ `PRIORITY_WEIGHTS` duy nhất.

## 3. Pack một container (`packContainer.ts`)

```
packContainer(containerTemplate, sortedItems):
    placements = []
    extremePoints = [điểm gốc duy nhất]
    retryQueue = []

    for item in sortedItems:                     # lượt đầu, đúng thứ tự đã sort
        if !tryPlaceItem(item): retryQueue.push(item)

    repeat cho tới khi 1 lượt không đặt thêm được món nào (fixed-point):
        for item in retryQueue:
            if tryPlaceItem(item): đánh dấu có tiến triển
            else: giữ lại trong retryQueue

    unfit = retryQueue còn lại (kèm lý do, xem unfitReason.ts)
    return { container, unfit }
```

**Vòng lặp "thử lại"**: item bị rớt ở lượt đầu (không tìm được vị trí lúc đó) có thể xếp vừa vào
extreme point MỚI sinh ra bởi các item xếp SAU nó trong cùng lượt (ví dụ lấp khoảng trống "lối đi"
ở giữa) — nên được thử lại thay vì kết luận `unfit` ngay. Dừng khi 1 lượt không còn tiến triển.

## 4. Extreme Point placement (`tryPlaceItem`)

```
tryPlaceItem(item):
    for orientation in item.allowedOrientations:
        (l,w,h) = applyClearance(orientation, item.clearance)
        for point in extremePoints:
            if !fitsInsideContainer(...) : continue
            if hasCollision(...) : continue
            if !respectsStacking(...) : continue
            if !respectsContainerPayload(...) : continue
            if !respectsLoadOnTop(...) : continue
            supportRatio = computeSupportRatio(...)
            if supportRatio < MIN_SUPPORT_RATIO : continue
            if !centerOfGravityOK(...) : continue
            score = placementScore(...)
            giữ candidate ưu tiên NHẤT theo compareCandidatePriority (xem bên dưới)
    if !best: ghi lý do unfit, return false
    commit placement, sinh extreme point mới từ (x,y,z,l,w,h): (x+l,y,z), (x,y+w,z), (x,y,z+h)
    return true

placementScore = a*distanceFromOrigin + b*(1-supportRatio) + c*height + e*(1-contactRatio)
```
`contactRatio` (0..1) = tỉ lệ số mặt (trong 3 mặt x/y/z của candidate) đang ÁP SÁT vách/sàn
container hoặc áp sát mặt của 1 placement khác — proxy cho "vị trí khít nhất, ít không gian trống
thừa xung quanh nhất". Trọng số (`PLACEMENT_SCORE_WEIGHTS`): `a: 1, b: 5, c: 2, e: 6` — `e` lớn
nhất vì "khít nhất" là tiêu chí chính.

**Thứ tự chọn candidate (shelf algorithm — ưu tiên bề mặt phẳng)**: `placementScore` KHÔNG phải
tiêu chí chọn chính. Candidate so sánh theo `compareCandidatePriority` — lexicographic, không phải
weighted sum:
1. `z` (chiều cao) tăng dần — lấp ĐẦY một lớp cùng độ cao trước khi bắt đầu lớp cao hơn.
2. Cùng `z`: `x` (chiều dài) tăng dần — tiến sâu theo chiều dài từng chút một, không nhảy cóc.
3. Cùng `z` và `x`: `y` (chiều rộng) tăng dần — lấp đầy hết bề rộng trước khi tiến sâu thêm.
4. Chỉ khi (z, x, y) trùng nhau tuyệt đối mới dùng `placementScore` làm tie-break cuối.

Đánh đổi chấp nhận: tỷ lệ lấp đầy có thể giảm nhẹ so với chọn theo `placementScore` thuần túy, đổi
lại kết quả xếp thành lớp/hàng phẳng, thực tế và dễ hình dung hơn.

**Trục x nội bộ vs x thật**: bên trong `packContainer.ts`, thuật toán xếp theo "x nội bộ" tính từ
VÁCH TRƯỚC (đầu xe) đi vào phía cửa, để item đầu tiên luôn ép sát vách trước và khoảng trống (nếu
thiếu hàng) dồn về phía cửa — đúng thực tế xếp hàng. `Placement.x` trả ra ngoài (dùng cho render,
revalidate, mọi nơi khác trong app) LUÔN là x THẬT tính từ CỬA container (x nhỏ = gần cửa, x lớn =
sâu bên trong) — quy đổi 1 lần ở cuối `packContainer.ts`.

## 5. Constraints (hard, trong `packContainer.ts`)

**Collision** — 2 box overlap nếu cả 3 trục đều chồng lấn:
```
overlap(a,b) = NOT (
  a.x+a.l<=b.x OR b.x+b.l<=a.x OR
  a.y+a.w<=b.y OR b.y+b.w<=a.y OR
  a.z+a.h<=b.z OR b.z+b.h<=a.z )
```

**Stacking / payload**
```
respectsStacking:       mỗi item support bên dưới phải KHÔNG fragile, stackable=true,
                         stackLevel <= maxStackLevel
respectsContainerPayload: container.totalWeight + item.weight <= maxPayload
respectsLoadOnTop:      trọng lượng item mới <= maxLoadOnTop của MỌI item nó đang đè lên
```
Hàng đánh dấu `fragile=true` không được có bất kỳ item nào đặt đè lên trên, bất kể cờ `stackable`
của chính nó.

**Support ratio + Center of gravity**
```
supportArea = tổng diện tích overlap giữa đáy item và các item ngay dưới (z_top == z)
supportRatio = supportArea / (l * w)   -> yêu cầu >= MIN_SUPPORT_RATIO (0.75, engine/config.ts)
centerOfGravityOK: hình chiếu tâm khối item phải nằm trong support polygon
```
Nếu đặt trực tiếp trên sàn container: `supportRatio = 1.0`, bỏ qua CG check.

**Clearance**
```
kích thước dùng để check fit/collision = kích thước thật + clearance (left/right/front/back/top/bottom)
kích thước thật vẫn lưu riêng trong Placement để hiển thị đúng
```

**Rotation** — chỉ orientation nào có trong `CargoTemplate.allowedOrientations` (suy ra từ
`RotationAxis`, xem `engine/preprocessing/orientation.ts`) mới được thử.

**KHÔNG có "delivery order" trong danh sách này** — xem mục 9.

## 6. Center of gravity toàn container (P2, `centerOfGravity.ts`)

Tính trọng tâm của TOÀN container (không phải per-item), so với tâm lý tưởng của container, ra
`cgOffsetXRatio`/`cgOffsetZRatio` (0..1+). Vượt ngưỡng cấu hình -> cảnh báo UI ("lệch trục"),
KHÔNG chặn xếp hàng (soft, không phải hard constraint).

## 7. Revalidate khi user kéo tay (P3, `revalidate.ts`)

```
revalidatePlacement({ placementId, candidate, template, placements, containerTemplate, templatesById }):
    check: out of bounds, collision, stacking, payload, support ratio, center of gravity
    trả về { valid, violations: [{type, ...}] }
```
Dùng cho cả 3 thao tác kéo tay trong scene 3D (`store/slices/editSlice.ts`): `movePlacement`,
`rotatePlacement`, `swapPlacements` — không chạy lại optimizer toàn bộ, chỉ validate lại placement
bị thay đổi (và các placement liên quan trực tiếp: item đỡ nó, item nó đỡ) ngay khi thả tay/bấm
xoay. Vi phạm thì TỪ CHỐI thay đổi (giữ nguyên vị trí cũ), kèm thông báo lỗi.

## 8. Chưa triển khai

Các phần sau đã được THIẾT KẾ (hằng số/kiểu dữ liệu đã khai báo sẵn trong `engine/config.ts`/
`domain/types.ts`) nhưng CHƯA có logic engine nào dùng tới — không tự triển khai khi chưa được yêu
cầu rõ (xem "Việc KHÔNG làm" trong `CLAUDE.md`):
- **Local search** (move/swap/rotate/repack sau khi có solution feasible, cải thiện dần theo
  `EvaluatorWeights`/`LOCAL_SEARCH_TIME_LIMIT_MS`/`MAX_LOCAL_SEARCH_ITERATIONS`).
- **Multi-container theo TỔ HỢP nhiều loại xe khác nhau** kèm so sánh chi phí (`costCalculator`) —
  hiện `generateSolutions.ts` chỉ tự lặp lại CÙNG 1 loại container người dùng đã chọn.
- **Edit history (undo/redo)** — `EditHistoryState` đã khai báo trong `types.ts`/`store/index.ts`
  nhưng chưa có action nào ghi vào đó, chưa có nút Undo/Redo nào trong UI.

## 9. Delivery order — CHỈ dùng cho "Giai đoạn C" (route proposal)

Khác với thiết kế gốc (coi delivery order là hard constraint của `packContainer.ts`), constraint
này đã được TÁCH RIÊNG hẳn ra khỏi pipeline xếp hàng chính, chỉ phục vụ 1 tính năng: chọn 1 phương
án giao hàng đề xuất cho 1 chuyến đã lưu (khu "Chuyến hàng của bạn", `SavedTripsPanel.tsx`).

- `engine/constraints/deliveryOrder.ts` — `findBlockingPairs` tìm mọi cặp kiện CÙNG hành lang
  (y,z) nhưng khác độ sâu x (kiện gần cửa hơn luôn phải dỡ trước); `checkDeliveryOrder` áp 1 thứ
  tự giao cụ thể (mảng stopId) lên các cặp đó để tìm kiện nào bị CHẮN (kiện ở sâu hơn nhưng thuộc
  điểm giao đến sớm hơn kiện đang chắn đường nó).
- `engine/optimization/routeProposal.ts` — `proposeSingleRoute` thử từng loại xe trong thư viện
  (nhỏ → lớn theo thể tích lòng; bỏ qua nếu chỉ có 1 loại), với mỗi loại gọi ĐÚNG `generateSolution`
  hiện có (không viết lại thuật toán xếp), rồi `chooseBestStopOrder` duyệt các thứ tự giao theo
  quãng đường ước lượng TĂNG DẦN (từ ma trận khoảng cách người dùng tự nhập, `TripStopDistance`) —
  duyệt hết nếu ≤ 6 điểm giao (720 hoán vị), nếu nhiều hơn thì heuristic (nearest-neighbor + hoán
  vị ngẫu nhiên) trong ngân sách ~3 giây, đánh dấu `usedHeuristic` khi không đảm bảo tối ưu tuyệt
  đối. Trả về NGAY thứ tự đầu tiên không kiện nào bị chắn, hoặc lý do + gợi ý nới (xe lớn hơn/chấp
  nhận chắn ít kiện nhất) nếu không có thứ tự nào thoả — KHÔNG tự nới ngầm.
- Không sửa gì ở `packContainer.ts`/`sortCargo.ts`/`generateSolutions.ts` — packing chính hoàn
  toàn không biết gì về điểm giao, module này chỉ ĐỌC kết quả xếp có sẵn.

## 10. Giới hạn kỹ thuật cần ghi rõ trong UI

Support ratio + center of gravity chỉ là **stability heuristic hình học**, không mô phỏng lực
phanh/rung/ma sát/dây buộc. Không dùng ngôn từ "đảm bảo không đổ hàng" ở bất kỳ đâu trong UI hoặc
docs hướng tới người dùng cuối.

## Config (`engine/config.ts`)
```
MIN_SUPPORT_RATIO = 0.75
PLACEMENT_SCORE_WEIGHTS = { a: 1, b: 5, c: 2, e: 6 }       # dùng thật trong packContainer.ts
PRIORITY_WEIGHTS = { volume: 5, weight: 4, fragile: 5, upright: 6 }  # dùng thật trong sortCargo.ts
LAST_CONTAINER_MIN_FILL_RATIO = 0.35                        # dùng thật trong suggestBetterContainer.ts
SNAP_THRESHOLD_RATIO / SNAP_THRESHOLD_MIN_MM                # dùng thật trong snapping.ts (kéo tay)

# Đã khai báo sẵn nhưng CHƯA dùng ở đâu (xem mục 8 "Chưa triển khai"):
PLAN_LIMIT, EVALUATOR_WEIGHTS, LOCAL_SEARCH_TIME_LIMIT_MS, MAX_LOCAL_SEARCH_ITERATIONS
```
