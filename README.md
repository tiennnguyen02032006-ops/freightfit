# FreightFit

Công cụ tối ưu xếp hàng 3D vào container/xe tải. **Frontend-only, không backend** — mọi phép tính
chạy ngay trên trình duyệt.

## Tính năng chính

- **Xếp hàng 3D**: import Excel hoặc nhập tay danh sách hàng hoá, chọn 1 loại container/xe tải
  (thư viện có sẵn container chuẩn ISO 20ft/40ft GP/HC/Reefer/45ft + một số xe tải thùng kín thật,
  hoặc tự thêm loại tuỳ chỉnh), engine tự xếp theo thuật toán Extreme Point Bin Packing kiểu
  "shelf" (xem `docs/algorithm-design.md`), tự tính số container cần dùng nếu hàng vượt quá 1
  container.
- **Xem trực quan 3D**: xoay/phóng to/thu nhỏ, click từng kiện hàng xem chi tiết, tô màu theo SKU
  (màu tuỳ chỉnh được), xem theo từng bước xếp hàng (mô phỏng load order).
- **Chỉnh tay**: kéo/xoay/đổi chỗ từng kiện hàng trực tiếp trong khung 3D, tự kiểm tra lại ràng
  buộc (va chạm, tải trọng, support ratio...) ngay khi thả tay.
- **Thống kê & cảnh báo**: % lấp đầy thể tích/tải trọng, danh sách hàng không xếp vừa kèm lý do,
  cảnh báo lệch trọng tâm (stability heuristic hình học — không mô phỏng lực phanh/rung/ma sát).
- **Chi phí vận chuyển**: nhập quãng đường + đơn giá cước để ước tính chi phí, gợi ý đổi sang loại
  xe nhỏ hơn/rẻ hơn nếu container cuối cùng đang lấp đầy quá ít.
- **"Chuyến hàng của bạn"**: lưu kế hoạch chuyến (điểm giao, gán hàng theo điểm giao) và dữ liệu
  thực tế sau khi giao, tự động lưu vào trình duyệt (localStorage), xuất/nhập file JSON để sao
  lưu/chuyển máy khác.
- **Đề xuất phương án giao hàng** ("Giai đoạn C"): từ 1 chuyến đã lưu, chọn 1 phương án DUY NHẤT
  (thứ tự giao + loại xe) sao cho không kiện hàng nào bị kiện giao sau chắn đường khi dỡ hàng, dựa
  trên khoảng cách giữa các điểm giao do người dùng tự nhập.
- **Black Box**: tab điều tra nguyên nhân sự cố giao hàng trên dữ liệu mô phỏng — độc lập hoàn
  toàn với engine xếp hàng 3D.
- **Xuất PDF**: xuất báo cáo phương án xếp hàng hiện tại ra file PDF.

Xem tiến độ chi tiết theo từng giai đoạn trong `CLAUDE.md` (mục Roadmap).

## Tech stack

- React + TypeScript
- React Three Fiber (Three.js) cho scene 3D
- Zustand cho state (in-memory)
- Vite + Vitest + ESLint

## Bắt đầu

```
npm install
npm run dev         # chạy dev server
npm run build        # build production
npm run test          # chạy toàn bộ test (Vitest)
npm run lint            # ESLint
npm run typecheck        # kiểm tra kiểu TypeScript, không emit
```

## Cấu trúc thư mục

Xem chi tiết trong `CLAUDE.md` (mục "Cấu trúc thư mục"). Tóm tắt:

- `src/domain/types.ts` — single source of truth cho toàn bộ interface/type.
- `src/engine/` — thuần TypeScript, không import React/Three, để test được không cần render 3D.
  Gồm tiền xử lý hàng hoá, thuật toán xếp (`packing/`), ràng buộc (`constraints/`), và các tính
  năng tối ưu/hỗ trợ (`optimization/`, gồm cả engine đề xuất phương án giao hàng), cùng module
  Black Box (`blackbox/`) độc lập.
- `src/store/` — Zustand, state chính của app CHỈ tồn tại trong bộ nhớ lúc chạy (mất khi refresh).
- `src/storage/tripStorage.ts` — module DUY NHẤT cho dữ liệu chuyến trong localStorage.
- `src/utils/skuColorStorage.ts` — màu SKU tuỳ chỉnh, cũng lưu localStorage.
- `src/components/` — `scene/` (khung nhìn 3D), `panels/` (các bảng điều khiển bên trái).
- `src/import/`, `src/export/` — import Excel, xuất PDF.
- `tests/` — 1 file test tương ứng 1 file engine, cộng fixtures dùng chung.

## Dữ liệu & bộ nhớ

App KHÔNG có backend, không gửi dữ liệu đi đâu. State nghiệp vụ (hàng hoá, container, phương án
xếp) chỉ tồn tại trong bộ nhớ trình duyệt lúc đang mở app — refresh trang là mất, trừ khi đã lưu
qua khu "Chuyến hàng của bạn". Có đúng 4 khoá localStorage được dùng trong toàn app (dữ liệu chuyến,
màu SKU, và 2 tuỳ chỉnh giao diện nhỏ) — chi tiết xem mục "Ngoại lệ persistence" trong `CLAUDE.md`.

## Tài liệu khác

- `CLAUDE.md` — quy ước dự án, ranh giới bắt buộc, roadmap chi tiết theo từng phase.
- `docs/algorithm-design.md` — thiết kế thuật toán packing, đọc trước khi sửa `src/engine/`.
- `docs/design/overview.png` — ảnh tham khảo bố cục UI tổng quan.
