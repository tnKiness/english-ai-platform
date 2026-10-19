# Tiến độ và trạng thái code

Cập nhật: 19/10/2026 — Asia/Bangkok.

## Trạng thái thực tế
- Hoàn tất lượt rà soát 8 tài liệu 00–06A và tạo bộ hướng dẫn triển khai.
- P0 hoàn tất: skeleton Node/TypeScript/React/Vite/Fastify, schema v1 (15 definition), state guard, fake adapter, spike Windows runner và SQLite backup. Chi tiết: [P0_ACCEPTANCE](docs/engineering/P0_ACCEPTANCE.md), [P0_DATA_AND_STATE](docs/engineering/P0_DATA_AND_STATE.md), [README](README.md).
- Chưa có database vận hành, migrations, queue bền vững, luồng học hay AI thật. Không có API mutation.
- Git: nhánh `main` theo dõi [tnKiness/english-ai-platform](https://github.com/tnKiness/english-ai-platform); commit đầu `68a8557` (P0) đã push. `.gitattributes` chuẩn hóa LF.
- Có thể bắt đầu P1. Chưa đủ điều kiện bật adapter thật (D-01/D-04) hay công bố sẵn sàng sử dụng.
- Phương án triển khai và ranh giới module: [PROJECT_STRUCTURE](docs/engineering/PROJECT_STRUCTURE.md). Kế hoạch chi tiết: [IMPLEMENTATION_PLAN](docs/engineering/IMPLEMENTATION_PLAN.md).

## Bảng công việc
| Mã | Công việc | Trạng thái | Bằng chứng / còn thiếu |
|---|---|---|---|
| DOC-01 | Rà soát và quy định cho AI | DONE | AGENTS.md và docs/engineering; kiểm tra tài liệu, không phải kiểm thử ứng dụng |
| P0 | Chốt hợp đồng, bootstrap, thử tính khả thi | DONE | P0_ACCEPTANCE; `npm.cmd run check` 41/41 tests; D-01, D-02, D-04–D-07 vẫn mở, D-03 còn phần P1/P2 |
| P1 | Nền dữ liệu, Rule Engine, queue | TODO | Chưa triển khai |
| P2 | Builder/QC + một adapter thật đủ điều kiện | TODO | Chưa xác minh entitlement, billing, isolation |
| P3 | Vòng Writing + Reading giải mù + audio mẫu | TODO | Chưa triển khai |
| P4 | Chịu lỗi, adapter bổ sung, đối chứng | TODO | Chưa triển khai |
| P5 | Mở rộng, daily tracking, tối ưu | TODO | Chưa triển khai |

Trạng thái hợp lệ: TODO / IN_PROGRESS / BLOCKED / DONE. DONE cần đường dẫn code/tài liệu và bằng chứng nghiệm thu; không dùng phần trăm ước đoán để thay thế.

## Kiểm tra đã thực hiện
- Liệt kê file, đọc 00–06A, kiểm tra liên kết nội bộ và đối chiếu nghiệp vụ giữa các phần.
- `git status --short`: báo không phải Git repository; đây là trạng thái môi trường, không phải lỗi ứng dụng.
- `Get-Command`: tìm thấy Codex, Claude, Node, npm, Python; không tìm thấy Gemini trên PATH hiện tại (không khẳng định máy chưa cài).
- `codex --version`: 0.163.0-alpha.10.2; `codex exec --help` đọc được. Có cảnh báo quyền ở thư mục temp của Codex; chưa kiểm tra khả năng thực thi inference.
- `claude --version`: 2.1.288; `node --version`: v22.18.0. Đây là bản quan sát được, chưa phải phiên bản runtime đã khóa cho sản phẩm.
- Đối chiếu tài liệu headless chính thức; nguồn và giới hạn ở READINESS_REVIEW.
- Chưa đăng nhập hộ người dùng, chưa đọc secret, chưa gọi model thật, chưa cài dependency, chưa chạy test/build ứng dụng.
- Kiểm tra cuối bằng Python: đọc UTF-8 16 file Markdown, kiểm tra 28 liên kết local, 0 lỗi. Lượt kiểm tra đầu bắt nhầm chuỗi `file:///` trong đoạn mô tả phát hiện; đã sửa bộ kiểm tra chỉ xét đích liên kết, chạy lại đạt. Không có test ứng dụng để chạy.

Các mục trên thuộc DOC-01. Kiểm tra của P0 ghi trong nhật ký bàn giao P0 bên dưới.

## Việc tiếp theo
P1: migrations/ports/repositories từ ERD P0; kiểm transaction, idempotency, fencing bằng SQLite thật; queue lease/recovery/retry budget; backup phối hợp DB + JSON + media và restore ở vị trí riêng. Thêm session/CSRF trước API ghi đầu tiên. Giữ AI thật tắt; D-01/D-04 phải đóng trước P2 adapter.

## Nhật ký bàn giao
### 19/10/2026 — DOC-01
- Thêm AGENTS.md, file này và 6 tài liệu engineering: review, cấu trúc, bám đặc tả, kế hoạch, quyết định, chất lượng/dữ liệu.
- Sửa liên kết local cũ và làm rõ giới hạn EOF/sandbox, phạm vi khóa chống trùng trong tài liệu nguồn; ghi rõ bổ sung kỹ thuật, không thay chính sách sư phạm.
- Rủi ro còn mở: các điểm D-01–D-07, chưa có bằng chứng vận hành thật.

### 19/10/2026 — P0 / DONE
- Nguồn: IMPLEMENTATION_PLAN P0; quyết định E-05 trong DECISIONS.
- File: package.json/lockfile (exact), tsconfig*, eslint/vite/vitest config, `src/server` (health + chặn host/origin), `src/web` (trang trạng thái, không giả lập tiến độ), `src/domain/jobs/state.ts`, `src/application` (adapter 6 phương thức, blind-context whitelist), `src/infrastructure` (fake adapter, bounded process, Ajv validate), `contracts/core.v1.schema.json`, tests/fixtures, scripts/cli-inventory.mjs, README, P0_DATA_AND_STATE, P0_ACCEPTANCE.
- Lệnh và kết quả (Windows 11, Node 22.18.0, npm 10.9.3):
  - `npm.cmd run check`: lint, typecheck, 41 tests/6 file, build backend + web đều đạt (chạy lại ở phiên tiếp nối sau khi phiên trước bị ngắt do hết hạn mức).
  - `npm.cmd run inventory`: chỉ metadata executable; codex có, claude có shim .cmd, gemini không thấy trên PATH.
  - `dev:server` + `dev` chạy cùng lúc: `GET http://127.0.0.1:5173/` 200 có `id="root"`; `/api/health` qua proxy Vite 200 `{"status":"ok","stage":"P0","real_ai_enabled":false}`; gọi thẳng 4317 200; Host lạ 403 `HOST_NOT_ALLOWED`; Origin lạ 403 `ORIGIN_NOT_ALLOWED`. Trình duyệt hiển thị trang "Đã kết nối ứng dụng cục bộ", không lỗi console. Đã dừng cả hai server sau kiểm tra.
- Giới hạn: fake adapter không chứng minh adapter thật; runner chưa phải sandbox; backup mới chứng minh SQLite riêng; state guard chưa nằm trong DB transaction; chưa có Playwright.
- Còn mở: D-01 (entitlement/billing/isolation CLI), D-02 (ngưỡng sư phạm), D-03 phần migrations/6 đầu ra tri thức, D-04 phần entrypoint Claude/Gemini và backup phối hợp, D-05–D-07.
- Bước tiếp theo: P1 như mục "Việc tiếp theo".

### Mẫu cho lượt code tiếp theo
- Ngày / mã công việc / trạng thái:
- Nguồn yêu cầu và quyết định áp dụng:
- File đã sửa và hành vi đã có thật:
- Lệnh kiểm tra / kết quả / môi trường / giới hạn:
- Điểm còn thiếu, quyết định mới, bước tiếp theo:
