# Study English — IELTS cá nhân

Ứng dụng web local theo kiến trúc modular monolith. Đã có khung P0 (trang trạng thái, health endpoint, schema, fake adapter, spike Windows/SQLite), nền P1 ([nghiệm thu P1](engineering/P1_ACCEPTANCE.md): migrations SQLite, kho JSON/media bất biến, Rule Engine thuần, queue lease/fencing/retry, backup/restore phối hợp), P2 DONE ([nghiệm thu P2](engineering/P2_ACCEPTANCE.md): 6 đầu ra tri thức Phần 5, pipeline Builder/QC1–4, Console 3 tab có session/CSRF, gateway AI thuê bao với Codex READY và `npm run qc:real`, worker, CLI backup), và P3 DONE phần lát cắt học ([nghiệm thu P3](engineering/P3_ACCEPTANCE.md): khung học web 5 màn, vòng học Writing khép kín với `FakeAdapter`, gợi mở theo nấc chỉ lưu server, Reading giải mù/đáp án cạnh tranh/Not Given và audio mẫu cục bộ). **Chưa bật báo điểm Band hay ASR/chấm phát âm (chờ D-02, D-05, D-06).**

**Hướng dẫn sử dụng đầy đủ (cài, chạy, học, AI thật, sao lưu, sự cố): [HUONG_DAN_SU_DUNG.md](HUONG_DAN_SU_DUNG.md).**

AI lập trình phải đọc [AGENTS.md](../AGENTS.md), [PROGRESS.md](../PROGRESS.md) và [kế hoạch](engineering/IMPLEMENTATION_PLAN.md) trước khi sửa.

## Môi trường và cài đặt
- Đã kiểm chứng trên Windows, Node **22.18.0**, npm **10.9.3**; `.node-version` ghi bản baseline, engines giới hạn Node 22 từ 22.18.0.
- Dependency khóa exact trong `package.json` và `package-lock.json`; cài lại bằng `npm ci` (PowerShell có thể dùng `npm.cmd ci`).
- `better-sqlite3` có native binding; cần tải binary phù hợp khi cài. Không cần API key hoặc đăng nhập AI để chạy P0.

## Chạy khung ứng dụng
Dùng hằng ngày, một terminal tại root repository:
```powershell
npm.cmd run app
```
Mở [ứng dụng local](http://127.0.0.1:4317) (giao diện + API cùng địa chỉ). Khi phát triển có tự tải lại: hai terminal `npm.cmd run dev:server` và `npm.cmd run dev`, mở http://127.0.0.1:5173. Backend chỉ bind `127.0.0.1:4317`, mở store ở `var/` (chạy từ root). Không public server qua LAN/tunnel. UI có mục Builder & QC (Gói tri thức · Cần xử lý · Lần chạy); Học hôm nay/Tiến độ chưa mở. Mọi `/api` trừ health/session cần cookie phiên; thao tác ghi cần thêm Origin + header CSRF.

Lệnh vận hành P2:
```powershell
npm.cmd run worker                 # thoát mã 3 nếu gateway chặn mọi provider
npm.cmd run worker -- --fake       # chỉ job dry-run bằng FakeAdapter (synthetic)
npm.cmd run worker -- --learning   # chấm Writing của bạn bằng AI thật (app chạy với STUDY_ENGLISH_LEARNING_AI=real)
npm.cmd run ai -- status           # lý do từng provider bị chặn; không gọi model
npm.cmd run backup -- create       # restore <backup> <thư mục mới> ; promote <thư mục> --confirm
npm.cmd run sources -- crawl       # quét trang nguồn IELTS (miền cho phép) vào var/sources; duyệt ở Builder & QC → Nguồn
npm.cmd run tts -- status          # TTS cục bộ (Piper, offline) cho audio Listening; `say "văn bản"` ghi WAV vào kho media
npm.cmd run author -- framework    # AI soạn khung năng lực Writing Task 2 từ nguồn đã duyệt; duyệt ở Builder & QC → Khung năng lực
npm.cmd run author -- items        # AI soạn đề Writing Task 2 theo khung đã duyệt; đề đạt QC1–QC4 tự phát hành (C3)
```

## Kiểm tra
E-11 chọn Codex để xác minh D-01 đầu tiên. Hướng dẫn từng lệnh đăng nhập profile CODEX_HOME riêng, xác nhận extra usage (30 ngày), `npm.cmd run ai -- verify codex --profile <dir>`, duyệt evidence và cấp đúng 5 loại dữ liệu ở [P2_ACCEPTANCE](engineering/P2_ACCEPTANCE.md). `verify` gọi prompt synthetic bằng quota thuê bao và chỉ dành cho người dùng tự chạy; test tự động dùng CLI giả. Ranh giới đọc file của Codex chứng minh bằng `npm.cmd run ai -- probe-boundary codex --profile <dir>` (chạy `codex sandbox`, không gọi model; hướng dẫn và kết quả ở [D01_CODEX_READ_BOUNDARY](engineering/D01_CODEX_READ_BOUNDARY.md)). Theo E-21, công cụ thu bằng chứng D-01 cho `claude-code` (`cli_tools_disabled`) và `agy` (`cli_permission_deny`) đã có qua `npm.cmd run ai -- probe-boundary claude|agy --profile <dir>` và `npm.cmd run ai -- verify claude|agy --profile <dir>` (hướng dẫn từng bước tại [D01_CLAUDE_AGY](engineering/D01_CLAUDE_AGY.md)); cả hai vẫn NEEDS_VERIFICATION cho tới khi người dùng chạy thật và duyệt evidence; `learner_audio` luôn bị chặn.

```powershell
npm.cmd run check
npm.cmd run spike
npm.cmd run inventory
```
- `check`: ESLint → TypeScript → Vitest → build backend và web.
- `spike`: SQLite transaction/online backup/restore và stdin/EOF/timeout/output/cancel/cây tiến trình Windows, toàn bộ bằng dữ liệu synthetic tạm.
- `inventory`: chỉ tra executable CLI trên PATH, không đọc auth hoặc gọi inference; không thấy trên PATH không chứng minh chưa cài.
- Sau build: `npm.cmd start` chạy bản đã biên dịch, phục vụ cả giao diện ở http://127.0.0.1:4317 (E-29). `npm.cmd run backup -- drill` diễn tập khôi phục.

## Relay AI lập trình (chuyển nền tảng khi hết quota)
Chạy một nhiệm vụ code qua Claude Code → Codex → Antigravity (Gemini); khi một nền tảng hết quota, bị rate limit hoặc mất đăng nhập, lượt được giao tiếp cho nền tảng kế tiếp kèm `git status`, danh sách file đã sửa và báo cáo cuối của lượt trước. Các AI nối mạch qua working tree và PROGRESS.md. Đây là công cụ phát triển, không phải AI của ứng dụng học.

Phần máy (chạy CLI, nhận diện quota, cooldown, chuyển nền tảng, nhật ký) nằm ở dự án `ai-router` đặt cạnh thư mục này (`..\ai-router`; đổi bằng `AI_ROUTER_BIN` trỏ tới `bin\ai-router.mjs`). `scripts/relay` chỉ thêm quy tắc của dự án vào nhiệm vụ (đọc AGENTS.md/PROGRESS.md, không commit/push, dòng kết `RELAY_STATUS`) và nhớ cuộc trò chuyện cho `--continue`.
```powershell
npm.cmd run relay -- --status
npm.cmd run relay -- "Mô tả nhiệm vụ"
npm.cmd run relay -- --task-file task.md --wait
npm.cmd run relay -- --continue
```
- Chuẩn bị một lần: trong ai-router, tin cậy thư mục này ở mức `edit` kèm danh sách lệnh được phép (`node bin\ai-router.mjs workspace add C:\Code\study-english --trust edit --cmd "npm.cmd run" ...`). Thư mục chưa tin cậy bị từ chối.
- `--status`: trạng thái từng nền tảng trong ai-router và nhiệm vụ gần nhất. `--wait`: khi mọi nền tảng hết quota thì chờ tới giờ mở lại sớm nhất rồi chạy tiếp thay vì thoát. `--provider <id>`: ưu tiên một nền tảng. `--continue`: tiếp nhiệm vụ dở trong cùng cuộc trò chuyện.
- Mã thoát: 0 xong, 2 AI cần người dùng quyết định, 75 hết nền tảng khả dụng, 130 bị dừng, 1 lỗi khác (lỗi lạ không tự chuyển tiếp để tránh đốt quota cả ba). Ctrl+C dừng cả cây tiến trình; chạy `--continue` để tiếp.
- Thứ tự nền tảng, model/effort, timeout mỗi lượt, kiểm tra đăng nhập, đặt lại cooldown: làm trong ai-router (trang `/admin`, hoặc `node bin\ai-router.mjs provider ...`). Các biến `RELAY_*_BIN`, `RELAY_*_MODEL`, `RELAY_ORDER` và các cờ `--preflight`, `--smoke`, `--order`, `--timeout-min`, `--max-runs`, `--reset`, `--quiet` không còn dùng.
- Relay chỉ dùng CLI thuê bao cấu hình trong ai-router; biến API key bị gỡ khỏi tiến trình CLI. Đừng thêm provider API vào ai-router nếu không muốn relay rơi sang đường tính phí. Relay không commit/push; xem diff trước khi commit.
- Xem trực tiếp: relay in từng bước (tool, lệnh, file đã sửa, lần chuyển nền tảng). Giao diện chat chung, nhật ký và lịch sử từng lượt xem ở ai-router (`npm run serve` trong thư mục ai-router, mở `/chat` hoặc `/admin`); trang Relay Console cũ (`relay:console`) đã được thay bằng các trang này.
- Trạng thái nhiệm vụ gần nhất ở `var/relay/router-task.json` (không commit); log thô từng lượt ở `var/runs/` của ai-router.
- Giới hạn: relay chỉ điều khiển CLI headless, không làm phiên Claude/Codex desktop đang mở tự chuyển. Nhận diện quota dựa vào sự kiện và chữ CLI in ra; khi CLI đổi định dạng thì cập nhật ở ai-router.

## Lõi định tuyến AI dùng chung với ai-router (E-24)
Gateway AI của ứng dụng dùng chung lõi nhận diện lỗi và cooldown với ai-router: bản sao các file thuần `ai-router/src/core/{types,outcome,routing}.ts` nằm ở `src/infrastructure/ai/router-core/` (không sửa tay; `SOURCE.json` ghi commit và SHA-256, có test kiểm).

```powershell
npm.cmd run router:sync -- --check   # so với ..\ai-router (hoặc AI_ROUTER_DIR); thoát 1 nếu lệch
npm.cmd run router:sync              # chép lại, rồi npm.cmd run check
```

- Lõi phân loại lỗi do CLI tự báo (hạn mức, giới hạn tốc độ, mất đăng nhập, phía hãng lỗi) và đọc giờ mở lại; không bao giờ đọc câu trả lời của model hay bài làm. Mẫu lỗi đã ghi trong bằng chứng D-01 vẫn được xét trước; lỗi không nhận ra vẫn dừng như `BILLING_UNVERIFIED`.
- Profile hết hạn mức bị khóa tới giờ hãng báo (nếu hợp lý), nếu không thì 60 phút (giới hạn tốc độ: 5 phút) — mặc định của lõi.
- Worker kiểm lại job `WAITING_QUOTA` mỗi 5 phút (`--quota-recheck-ms` để đổi); khi một provider trong `eligible_providers` dùng được thì job quay lại hàng đợi, giữ nguyên ngân sách 3 lần chạy. Lần kiểm không gọi model.
- Không đưa vào ứng dụng: provider API trả phí, xoay tài khoản cùng hãng, chat/handoff, MCP và Admin của ai-router (06A §1.5–1.6). Chọn hãng vẫn do `subscriptionGuard` + cổng D-05 quyết định.

## Theo dõi học hằng ngày (P5-1, E-25)
- **Học hôm nay** có khung "Ngày học hôm nay": nhắc học trong ứng dụng (tối đa 1 lần/ngày), nút *Hôm nay nghỉ có kế hoạch*, đặt *quỹ thời gian hôm nay*, ghi *đã học ngoài ứng dụng* (số phút tự khai, không bắt buộc).
- Thời gian được ghi tự động mỗi phút khi màn Workspace/Reading/Audio đang hiển thị hoặc audio đang phát; mất kết nối thì lưu tạm trong trình duyệt và gửi lại sau (ngày đó hiện "offline").
- **Tiến độ** có bảng 7 ngày: trạng thái ngày, phút ghi nhận/quỹ, vòng học, nhận định, độ lệch lộ trình, kèm thời điểm tính (giờ Việt Nam).
- Ngày không có dữ liệu ghi "thiếu dữ liệu quan sát", không phải bỏ học; thiếu giờ không cộng dồn sang ngày sau và không làm giảm hồ sơ năng lực.

## Hợp đồng và giới hạn
- [Schema v1](../contracts/core.v1.schema.json), [ERD/trạng thái/quyền/recovery](engineering/P0_DATA_AND_STATE.md), [nghiệm thu P0](engineering/P0_ACCEPTANCE.md).
- JSON Schema không kiểm chứng nội dung IELTS hay quyền thuê bao. FakeAdapter chỉ trả dữ liệu synthetic, không ghi bằng chứng học thật.
- Process supervisor chưa phải sandbox. Gateway (`src/infrastructure/ai/gateway`) chặn mọi CLI thật cho tới khi có bằng chứng D-01 — xem các bước trong P2_ACCEPTANCE. Không có adapter nào READY.
- Backup phối hợp DB + JSON + media có CLI `npm run backup`; chưa có lịch tự động.
- Dữ liệu chạy thật mặc định nằm dưới `var/` (`db/`, `knowledge/`, `media/`, `staging/`, `backups/`); test dùng thư mục tạm. `var/`, database, log, credential và media cá nhân không được commit. Migrations ở `migrations/`, áp dụng khi mở store từ root repository.

Mã nguồn: [tnKiness/english-ai-platform](https://github.com/tnKiness/english-ai-platform), nhánh `main`. `.gitignore` loại trừ `node_modules`, `dist`, `var/`, database, log và `.env`.

### Worker khiếu nại P4 (phần độc lập)

`npm run worker -- --complaints --once` xử lý một job khiếu nại learner qua gateway đã xác minh. Chỉ claim job khiếu nại; giữ bài nộp/nguồn bằng chứng gốc và thêm nhận định supersedes. Thiếu provider READY thì dừng; `--fake` vẫn chỉ chạy dry-run. Nút yêu cầu xem xét lại nằm ở Tiến độ; review giữ trong Builder & QC để phân loại sự cố.

Provider dự phòng vẫn chờ người dùng chạy D-01 riêng ([D01_CLAUDE_AGY](engineering/D01_CLAUDE_AGY.md)) và đối chứng có nguồn/quyền D-05. Fixture synthetic không bật hãng thật hay chứng minh chất lượng chấm. Chi tiết [P4_ACCEPTANCE](engineering/P4_ACCEPTANCE.md).


### Chọn và verify nhiều model (E-22)
- `npm.cmd run ai -- models <provider>`: ứng viên có nguồn và model đã verify, không gọi inference. Provider: codex, claude-code (hoặc claude), agy.
- `npm.cmd run ai -- verify <provider> --profile <dir> --models <model-a>,<model-b> [--effort <e>] --out <file-moi.json>`: dùng ID từ danh mục; một synthetic/model, timeout/cancel chung. Bỏ effort cho agy. Hết quota dừng và ghi từng model chưa chạy. Chỉ chạy khi xác nhận extra usage OFF còn hạn.
- Duyệt/nạp evidence mới kèm probe PASS theo D-01, rồi `npm.cmd run ai -- model <provider> <model> [effort]` để lưu mặc định cho app. Cặp chưa verify bị chặn MODEL_NOT_VERIFIED. Evidence cũ chỉ giữ effort đã ghi; effort mới cần verify riêng.
- Theo **E-23**: khai báo danh sách model cho phép mà không cần chạy lại `verify` bằng `npm.cmd run ai -- allow-models <provider> <model-a>,<model-b>` (hoặc `npm.cmd run ai -- models <provider> --allow <model-a>,<model-b>`), sau đó chọn mặc định bằng `npm.cmd run ai -- model <provider> <model> [effort]`. Lần đầu dùng một `(provider, model[, effort])` trên phiên bản CLI chưa có canary đạt, gateway tự chạy 1 prompt synthetic ngắn kiểm tra envelope + hợp đồng đầu ra (lỗi bị chặn `MODEL_CANARY_FAILED`). CLI tự cập nhật phiên bản/hash được ghi nhận dạng thông tin trong `npm.cmd run ai -- status` mà không chặn chạy; ranh giới đọc (`RUNTIME_TOOLS_PRESENT`, `RUNTIME_DENY_RULES_CHANGED`, `RUNTIME_TOOL_EXECUTED`, `RUNTIME_CODEX_FEATURES_CHANGED`) và chốt thanh toán được kiểm trong mỗi lượt chạy. Xem [E-22/E-23](engineering/DECISIONS.md), [Codex](engineering/D01_CODEX_READ_BOUNDARY.md), [Claude/agy](engineering/D01_CLAUDE_AGY.md).
