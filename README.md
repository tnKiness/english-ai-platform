# Study English — IELTS cá nhân

Ứng dụng web local theo kiến trúc modular monolith. Hiện hoàn thành khung P0: trang trạng thái, health endpoint, schema, fake adapter và spike Windows/SQLite. **Chưa có luồng học, database vận hành, queue hay AI thật.**

AI lập trình phải đọc [AGENTS.md](AGENTS.md), [PROGRESS.md](PROGRESS.md) và [kế hoạch](docs/engineering/IMPLEMENTATION_PLAN.md) trước khi sửa.

## Môi trường và cài đặt
- Đã kiểm chứng trên Windows, Node **22.18.0**, npm **10.9.3**; `.node-version` ghi bản baseline, engines giới hạn Node 22 từ 22.18.0.
- Dependency khóa exact trong `package.json` và `package-lock.json`; cài lại bằng `npm ci` (PowerShell có thể dùng `npm.cmd ci`).
- `better-sqlite3` có native binding; cần tải binary phù hợp khi cài. Không cần API key hoặc đăng nhập AI để chạy P0.

## Chạy khung ứng dụng
Mở hai terminal tại root repository:
```powershell
npm.cmd run dev:server
```
```powershell
npm.cmd run dev
```
Mở [ứng dụng local](http://127.0.0.1:5173). Backend chỉ bind `127.0.0.1:4317`, endpoint `GET /api/health`. Không public server qua LAN/tunnel. UI chỉ hiển thị trạng thái kết nối, không giả lập tiến độ học.

## Kiểm tra
```powershell
npm.cmd run check
npm.cmd run spike
npm.cmd run inventory
```
- `check`: ESLint → TypeScript → Vitest → build backend và web.
- `spike`: SQLite transaction/online backup/restore và stdin/EOF/timeout/output/cancel/cây tiến trình Windows, toàn bộ bằng dữ liệu synthetic tạm.
- `inventory`: chỉ tra executable CLI trên PATH, không đọc auth hoặc gọi inference; không thấy trên PATH không chứng minh chưa cài.
- Sau build: `npm.cmd start` chạy backend đã biên dịch; chưa có server phục vụ static bundle production. Dùng `dev` để xem UI P0.

## Relay AI lập trình (chuyển nền tảng khi hết quota)
Chạy một nhiệm vụ code qua Claude Code → Codex → Antigravity (Gemini); khi một nền tảng hết quota hoặc rate limit, relay ghi giờ mở lại và giao tiếp cho nền tảng kế tiếp kèm `git status`/`git diff --stat`. Các AI nối mạch qua working tree và PROGRESS.md. Đây là công cụ phát triển, không phải AI của ứng dụng học.
```powershell
npm.cmd run relay -- --preflight
npm.cmd run relay -- "Mô tả nhiệm vụ"
npm.cmd run relay -- --task-file task.md --wait
npm.cmd run relay -- --continue
npm.cmd run relay -- --status
```
- `--preflight`: kiểm tra đăng nhập thuê bao, không gọi model. `--smoke`: mỗi CLI trả một dòng ở chế độ chỉ đọc (tốn rất ít quota) và ghi trạng thái quota.
- `--order claude,codex,agy` đổi thứ tự; `--timeout-min` (mặc định 60) cho mỗi lượt; `--max-runs` (mặc định 6); `--wait` chờ tới giờ mở lại sớm nhất khi mọi nền tảng hết quota thay vì thoát; `--reset codex|all` xóa cooldown/NEEDS_LOGIN; `--quiet` không in output CLI.
- Mã thoát: 0 xong, 2 AI cần người dùng quyết định, 75 hết nền tảng khả dụng, 1 lỗi khác (không tự chuyển tiếp để tránh đốt quota cả ba). Ctrl+C dừng cả cây tiến trình; chạy `--continue` để tiếp.
- Đường dẫn CLI tự dò; ghi đè bằng `RELAY_CLAUDE_BIN`, `RELAY_CODEX_BIN`, `RELAY_AGY_BIN`; chọn model bằng `RELAY_CLAUDE_MODEL`, `RELAY_CODEX_MODEL`, `RELAY_AGY_MODEL`; thứ tự mặc định bằng `RELAY_ORDER`.
- Trạng thái, khóa và log từng lượt nằm ở `var/relay/` (không commit). Relay không commit/push; xem diff trước khi commit.
- Giới hạn: relay chỉ điều khiển CLI headless chạy từ terminal, không làm phiên Claude/Codex desktop đang mở tự chuyển. Nhận diện quota dựa vào chữ CLI in ra; khi CLI đổi thông báo phải cập nhật `scripts/relay/core.ts`.

## Hợp đồng và giới hạn
- [Schema v1](contracts/core.v1.schema.json), [ERD/trạng thái/quyền/recovery](docs/engineering/P0_DATA_AND_STATE.md), [nghiệm thu P0](docs/engineering/P0_ACCEPTANCE.md).
- JSON Schema không kiểm chứng nội dung IELTS hay quyền thuê bao. FakeAdapter chỉ trả dữ liệu synthetic, không ghi bằng chứng học thật.
- Process supervisor thử nghiệm chưa phải sandbox. Cơ chế kill-tree được kiểm chứng Windows; không cam kết tương đương trên hệ điều hành khác. Tích hợp CLI và kiểm tra billing/isolation nằm ở P2.
- Backup spike mới chứng minh SQLite; phối hợp DB + JSON + media và recovery sau crash thuộc P1.
- `var/`, database, log, credential và media cá nhân không được commit. Chưa có migrations; không khởi tạo kho học thật ở P0.

Mã nguồn: [tnKiness/english-ai-platform](https://github.com/tnKiness/english-ai-platform), nhánh `main`. `.gitignore` loại trừ `node_modules`, `dist`, `var/`, database, log và `.env`.
