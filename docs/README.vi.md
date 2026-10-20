# Study English — IELTS cá nhân

Ứng dụng web local theo kiến trúc modular monolith. Đã có khung P0 (trang trạng thái, health endpoint, schema, fake adapter, spike Windows/SQLite), nền P1 ([nghiệm thu P1](engineering/P1_ACCEPTANCE.md): migrations SQLite, kho JSON/media bất biến, Rule Engine thuần, queue lease/fencing/retry, backup/restore phối hợp), P2 DONE ([nghiệm thu P2](engineering/P2_ACCEPTANCE.md): 6 đầu ra tri thức Phần 5, pipeline Builder/QC1–4, Console 3 tab có session/CSRF, gateway AI thuê bao với Codex READY và `npm run qc:real`, worker, CLI backup), và P3 DONE phần lát cắt học ([nghiệm thu P3](engineering/P3_ACCEPTANCE.md): khung học web 5 màn, vòng học Writing khép kín với `FakeAdapter`, gợi mở theo nấc chỉ lưu server, Reading giải mù/đáp án cạnh tranh/Not Given và audio mẫu cục bộ). **Chưa bật báo điểm Band hay ASR/chấm phát âm (chờ D-02, D-05, D-06).**

AI lập trình phải đọc [AGENTS.md](../AGENTS.md), [PROGRESS.md](../PROGRESS.md) và [kế hoạch](engineering/IMPLEMENTATION_PLAN.md) trước khi sửa.

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
Mở [ứng dụng local](http://127.0.0.1:5173). Backend chỉ bind `127.0.0.1:4317`, mở store ở `var/` (chạy từ root). Không public server qua LAN/tunnel. UI có mục Builder & QC (Gói tri thức · Cần xử lý · Lần chạy); Học hôm nay/Tiến độ chưa mở. Mọi `/api` trừ health/session cần cookie phiên; thao tác ghi cần thêm Origin + header CSRF.

Lệnh vận hành P2:
```powershell
npm.cmd run worker                 # thoát mã 3 nếu gateway chặn mọi provider
npm.cmd run worker -- --fake       # chỉ job dry-run bằng FakeAdapter (synthetic)
npm.cmd run ai -- status           # lý do từng provider bị chặn; không gọi model
npm.cmd run backup -- create       # restore <backup> <thư mục mới> ; promote <thư mục> --confirm
```

## Kiểm tra
E-11 chọn Codex để xác minh D-01 đầu tiên. Hướng dẫn từng lệnh đăng nhập profile CODEX_HOME riêng, xác nhận extra usage (30 ngày), `npm.cmd run ai -- verify codex --profile <dir>`, duyệt evidence và cấp đúng 5 loại dữ liệu ở [P2_ACCEPTANCE](engineering/P2_ACCEPTANCE.md). `verify` gọi prompt synthetic bằng quota thuê bao và chỉ dành cho người dùng tự chạy; test tự động dùng CLI giả. Ranh giới đọc file chứng minh bằng `npm.cmd run ai -- probe-boundary codex --profile <dir>` (chạy `codex sandbox`, không gọi model; hướng dẫn và kết quả ở [D01_CODEX_READ_BOUNDARY](engineering/D01_CODEX_READ_BOUNDARY.md)). agy thay gemini-cli, vẫn NEEDS_VERIFICATION; learner_audio luôn bị chặn. P2 vẫn BLOCKED cho tới khi có bằng chứng thật và QC thật.

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
- Đường dẫn CLI tự dò; ghi đè bằng `RELAY_CLAUDE_BIN`, `RELAY_CODEX_BIN`, `RELAY_AGY_BIN`; model mặc định Opus 5.5 Medium → GPT-6 Astra Medium → Gemini 4 Argon Medium; đổi bằng `RELAY_CLAUDE_MODEL`/`RELAY_CLAUDE_EFFORT`, `RELAY_CODEX_MODEL`/`RELAY_CODEX_EFFORT`, `RELAY_AGY_MODEL` (agy ghi mức effort trong tên model); thứ tự mặc định bằng `RELAY_ORDER`.
- Trạng thái, khóa và log từng lượt nằm ở `var/relay/` (không commit). Relay không commit/push; xem diff trước khi commit.
- Xem trực tiếp: relay in từng bước (đọc/sửa file, lệnh đang chạy, câu trả lời) với tiền tố nền tảng. Ở terminal khác: `Get-Content -Wait -Encoding UTF8 var\relay\live.log`. `--quiet` chỉ tắt in ra màn hình, live.log vẫn ghi.
- Mở lại phiên: mỗi lượt là một phiên thật của CLI đó. `--status` liệt kê phiên gần đây kèm lệnh mở lại (`claude --resume <id>`, `codex resume <id>`, `agy --conversation <id>`), chạy tại thư mục dự án để chat tiếp với đúng ngữ cảnh.
- Chuyển nền tảng khi: CLI báo lỗi hết quota/rate limit/mất đăng nhập, Claude gửi `rate_limit_event` bị từ chối, AI kết thúc bằng `RELAY_STATUS: QUOTA`, hoặc AI ghi BLOCKED vì hạn mức sau cảnh báo sắp hết hạn mức. Lượt sau nhận cả báo cáo cuối của lượt trước.
- Giới hạn: relay chỉ điều khiển CLI headless chạy từ terminal, không làm phiên Claude/Codex desktop đang mở tự chuyển. Nhận diện quota dựa vào sự kiện và chữ CLI in ra; khi CLI đổi định dạng phải cập nhật `scripts/relay/core.ts`/`stream.ts`.

## Relay Console (giao diện chat chung)
```powershell
npm.cmd run relay:console
```
Mở `http://127.0.0.1:4319/` (đổi cổng bằng `RELAY_CONSOLE_PORT`). Một trang để:
- Chat với Claude Code, Codex hoặc Antigravity trong thư mục dự án; xem từng bước (đọc/sửa file, lệnh) ngay khi chạy. Tắt "Cho phép sửa file" để chỉ đọc.
- Một **cuộc trò chuyện** gom phiên thật của nhiều nền tảng. Hết hạn mức thì tự chuyển sang nền tảng kế tiếp (có thể tắt). Khi quay lại nền tảng cũ, console tiếp đúng phiên cũ của nó và gửi kèm tóm tắt những lượt nó đã bỏ lỡ. Mỗi phiên vẫn mở được trong CLI gốc (`claude --resume`, `codex resume`, `agy --conversation`).
- Mở phiên do relay/CLI tạo trước đó ("Phiên chưa gom") và chat tiếp; chạy relay nhiệm vụ dài và xem cột Trực tiếp (đọc `var/relay/live.log`, kể cả relay chạy ở terminal khác).
- Chỉ một tiến trình sửa workspace tại một thời điểm (dùng chung khóa với relay). Server chỉ nghe 127.0.0.1, API cần token nhúng trong trang và kiểm Host/Origin. Lịch sử ở `var/relay/threads.json`, `var/relay/transcripts/`.
- Giới hạn: lịch sử chat không chuyển giữa các hãng (chỉ có tóm tắt bàn giao); phiên tạo trước khi có console chưa có transcript trong console; app desktop của từng hãng có hiện các phiên này hay không chưa được kiểm chứng.

## Hợp đồng và giới hạn
- [Schema v1](../contracts/core.v1.schema.json), [ERD/trạng thái/quyền/recovery](engineering/P0_DATA_AND_STATE.md), [nghiệm thu P0](engineering/P0_ACCEPTANCE.md).
- JSON Schema không kiểm chứng nội dung IELTS hay quyền thuê bao. FakeAdapter chỉ trả dữ liệu synthetic, không ghi bằng chứng học thật.
- Process supervisor chưa phải sandbox. Gateway (`src/infrastructure/ai/gateway`) chặn mọi CLI thật cho tới khi có bằng chứng D-01 — xem các bước trong P2_ACCEPTANCE. Không có adapter nào READY.
- Backup phối hợp DB + JSON + media có CLI `npm run backup`; chưa có lịch tự động.
- Dữ liệu chạy thật mặc định nằm dưới `var/` (`db/`, `knowledge/`, `media/`, `staging/`, `backups/`); test dùng thư mục tạm. `var/`, database, log, credential và media cá nhân không được commit. Migrations ở `migrations/`, áp dụng khi mở store từ root repository.

Mã nguồn: [tnKiness/english-ai-platform](https://github.com/tnKiness/english-ai-platform), nhánh `main`. `.gitignore` loại trừ `node_modules`, `dist`, `var/`, database, log và `.env`.
