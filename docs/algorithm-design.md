# Algorithm Design — 3D Packing Engine

Phạm vi: V1 (core) + V1.5 (support ratio, center of gravity, clearance). Không dùng MILP/Genetic Algorithm.
Core: **3D Extreme Point Bin Packing + Greedy + Constraint Validation + Local Search**.

## 1. Pipeline tổng

```
optimize(cargoList, vehicleTypes):
    cargo = preprocess(cargoList)           # expand quantity, normalize orientation
    sortedCargo = sortCargo(cargo)          # theo priorityScore desc
    vehiclePlans = generateVehiclePlans(vehicleTypes, cargo)

    bestSolution = null
    for plan in vehiclePlans:
        solution = tryPackPlan(plan, sortedCargo)
        if solution == null: continue        # infeasible
        solution = localSearch(solution)
        solution.score = evaluate(solution)
        if bestSolution == null or solution.score < bestSolution.score:
            bestSolution = solution
    return bestSolution
```

## 2. Sort / priority

Sắp xếp theo extreme-point heuristic kiểu EasyCargo (thay cho priorityScore đơn thuần). Chỉ MỘT
thuật toán duy nhất — không còn khái niệm nhiều strategy/phương án:

```
sortCargo(items):
    sort items theo, THEO THỨ TỰ ƯU TIÊN:
      1. deliveryOrder GIẢM DẦN (nhóm giao sau cùng trong hành trình xếp trước -> nằm sâu
         trong cùng container, xa cửa nhất — khớp hard constraint deliveryOrder)
      2. volume GIẢM DẦN trong cùng nhóm deliveryOrder (hàng to xếp trước)
      3. cargoTemplateId (nhóm các kiện CÙNG LOẠI xử lý liên tục nhau, tránh xen kẽ loại khác
         cùng thể tích ngẫu nhiên nhưng khác hình dạng)
      4. priorityScore GIẢM DẦN (tie-break cuối cùng, đảm bảo thứ tự luôn xác định)

priorityScore(item) =
    5 * normalize(volume)
  + 4 * normalize(weight)
  + 5 * (fragile ? 1 : 0)
  + 3 * normalize(deliveryPriority)
  + 6 * (mustKeepUpright ? 1 : 0)
```

## 3. Vehicle plan generation (multi-container)

```
generateVehiclePlans(vehicleTypes, cargo):
    sort vehicleTypes theo cost / usableVolume asc
    for k = 1..maxContainersHeuristic:
        candidates = combinationsWithRepetition(vehicleTypes, k)
        giữ candidate có tổng volume/payload đủ đáp ứng ước lượng thô
    sort theo totalCost asc, giữ top N (PLAN_LIMIT) để tránh nổ tổ hợp
```

## 4. Pack một vehicle plan

```
tryPackPlan(plan, cargo):
    remaining = copy(cargo)
    containers = []
    for vehicleType in plan:
        container = createContainer(vehicleType)
        container.extremePoints = [(0,0,0)]
        for item in remaining (đã sort):
            placement = findBestPlacement(container, item)
            if placement: commit(container, placement); remove item from remaining
        containers.add(container)
    return remaining.isEmpty() ? Solution(...) : null
```

## 5. Extreme Point placement

```
findBestPlacement(container, item):
    for orientation in item.allowedOrientations:
        (l,w,h) = applyClearance(orientation, item.clearance)
        for point in container.extremePoints:
            if !fitsInsideContainer(...) : continue
            if hasCollision(...) : continue
            if !respectsStacking(...) : continue
            if !respectsPayload(...) : continue
            if !respectsDeliveryOrder(...) : continue
            support = computeSupport(...)
            if support.supportRatio < MIN_SUPPORT_RATIO : continue
            if !centerOfGravityOK(support) : continue
            score = placementScore(...)
            giữ candidate ưu tiên NHẤT theo compareCandidatePriority (z asc, x asc, y asc,
            rồi mới tới score) — xem bên dưới
    return bestPlacement (hoặc null)

placementScore = a*distanceFromOrigin + b*(1-supportRatio) + c*height + d*deliveryDistanceMismatch
                + e*(1-contactRatio)
```
`contactRatio` (0..1) = tỉ lệ số mặt (trong 3 mặt x/y/z của candidate) đang ÁP SÁT vách/sàn
container hoặc áp sát mặt của 1 placement khác — proxy cho "vị trí khít nhất, ít không gian
trống thừa xung quanh nhất".

**Thứ tự chọn candidate (shelf algorithm — ưu tiên bề mặt phẳng)**: `placementScore` KHÔNG còn
là tiêu chí chọn chính. Candidate được so sánh theo `compareCandidatePriority` — lexicographic,
không phải weighted sum:
1. `z` (chiều cao) tăng dần — lấp ĐẦY một lớp cùng độ cao trước khi bắt đầu lớp cao hơn, để mặt
   trên mỗi lớp phẳng thay vì lởm chởm.
2. Cùng `z`: `x` (chiều dài, khung nội bộ) tăng dần — tiến sâu theo chiều dài từng chút một,
   không nhảy cóc.
3. Cùng `z` và `x`: `y` (chiều rộng) tăng dần — lấp đầy hết bề rộng container trước khi tiến sâu
   thêm theo chiều dài, để mép hàng thẳng theo chiều rộng.
4. Chỉ khi (z, x, y) trùng nhau tuyệt đối mới dùng `placementScore` (khít nhất/support/delivery)
   làm tie-break cuối.

Đánh đổi chấp nhận: tỷ lệ lấp đầy có thể giảm nhẹ so với chọn theo `placementScore`/`contactRatio`
thuần túy, đổi lại kết quả xếp thành lớp/hàng phẳng, thực tế và dễ hình dung hơn.

Sau khi đặt, sinh extreme point mới:
```
(x+l, y, z), (x, y+w, z), (x, y, z+h)
```

## 6. Constraints (hard trừ khi ghi rõ soft)

**Collision** — 2 box overlap nếu cả 3 trục đều chồng lấn:
```
overlap(a,b) = NOT (
  a.x+a.l<=b.x OR b.x+b.l<=a.x OR
  a.y+a.w<=b.y OR b.y+b.w<=a.y OR
  a.z+a.h<=b.z OR b.z+b.h<=a.z )
```

**Stacking / payload**
```
respectsStacking: mỗi item support bên dưới phải KHÔNG fragile, stackable=true,
                  stackLevel <= maxStackLevel
respectsPayload:  container.totalWeight + item.weight <= maxPayload
                  loadOnItemBelow <= maxLoadOnTop của item đó
```
Hàng đánh dấu fragile=true không được có bất kỳ item nào đặt đè lên trên, bất kể cờ stackable
của chính nó.

**Delivery order** (soft nếu business không yêu cầu nghiêm ngặt, hard nếu có):
```
Với 2 item trong cùng container: nếu A giao trước B thì distanceToDoor(A) < distanceToDoor(B)
```

**Support ratio + Center of gravity (V1.5)**
```
supportArea = tổng diện tích overlap giữa đáy item và các item ngay dưới (z_top == z)
supportRatio = supportArea / (l * w)   -> yêu cầu >= 0.7~0.8 (config MIN_SUPPORT_RATIO)
centerOfGravityOK: hình chiếu tâm khối item phải nằm trong support polygon
```
Nếu đặt trực tiếp trên sàn container: supportRatio = 1.0, bỏ qua CG check.

**Clearance**
```
kích thước dùng để check fit/collision = kích thước thật + clearance (left/right/front/back/top/bottom)
kích thước thật vẫn lưu riêng trong Placement để hiển thị đúng
```

## 7. Local Search (sau khi có solution feasible)

```
localSearch(solution):
    while cải thiện được và còn trong time limit:
        for move in [relocate, swap, rotate, repack(nhóm 3-5 item)]:
            newSolution = apply(move)
            if !isValid(newSolution): continue   # chạy lại toàn bộ constraint check
            if evaluate(newSolution) < evaluate(solution): solution = newSolution
    return solution
```

## 8. Evaluator

```
score = w1*cost + w2*containerCount + w3*unusedVolumeRatio
      + w4*weightImbalancePenalty + w5*(1-supportRatio, tổng hợp)
      + w6*deliveryViolationCount (nếu để soft)
```
Thứ tự ưu tiên: hard constraints > feasibility > cost > số container > space utilization > weight balance > stability.

## 9. Revalidate khi user kéo tay (P3)

```
revalidatePlacement(container, updatedPlacement):
    check: out of bounds, collision, stacking, payload, support ratio
    trả về { valid, violations: [{type, liên quan}] }
```
Không chạy lại optimizer toàn bộ — chỉ validate placement bị thay đổi và các placement liên quan trực tiếp (item support nó, item nó support).

## 10. Giới hạn kỹ thuật cần ghi rõ trong UI
Support ratio + center of gravity chỉ là **stability heuristic hình học**, không mô phỏng lực phanh/rung/ma sát/dây buộc. Không dùng ngôn từ "đảm bảo không đổ hàng" ở bất kỳ đâu trong UI hoặc docs hướng tới người dùng cuối.

## Config cần đưa ra ngoài (không hard-code)
```
MIN_SUPPORT_RATIO = 0.7~0.8
PLAN_LIMIT
w1..w6 (evaluator), a..e (placementScore, e = trọng số contactRatio "khít nhất")
LOCAL_SEARCH_TIME_LIMIT / MAX_ITERATIONS
```
