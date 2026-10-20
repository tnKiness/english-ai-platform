# Tiến độ và trạng thái code

Cập nhật: 20/10/2026 — Asia/Bangkok.

## Trạng thái thực tế
- Hoàn tất lượt rà soát 8 tài liệu 00–06A và tạo bộ hướng dẫn triển khai.
- P0 hoàn tất: skeleton Node/TypeScript/React/Vite/Fastify, schema v1 (15 definition), state guard, fake adapter, spike Windows runner và SQLite backup. Chi tiết: [P0_ACCEPTANCE](docs/engineering/P0_ACCEPTANCE.md), [P0_DATA_AND_STATE](docs/engineering/P0_DATA_AND_STATE.md), [README](README.md).
- P1 hoàn tất ở mức thư viện có integration test SQLite thật: migrations, JSON/media bất biến, repositories, Rule Engine thuần, queue lease/fencing/retry/cancel, backup/restore phối hợp. Chi tiết: [P1_ACCEPTANCE](docs/engineering/P1_ACCEPTANCE.md), quyết định E-07.
- Chưa có luồng học, API mutation (session/CSRF), worker chạy thường trực, hồ sơ năng lực (chờ D-02) hay AI thật.
- Git: nhánh `main` theo dõi [tnKiness/english-ai-platform](https://github.com/tnKiness/english-ai-platform); commit đầu `68a8557` (P0) đã push. `.gitattributes` chuẩn hóa LF.
- Có thể bắt đầu P1. Chưa đủ điều kiện bật adapter thật (D-01/D-04) hay công bố sẵn sàng sử dụng.
- Phương án triển khai và ranh giới module: [PROJECT_STRUCTURE](docs/engineering/PROJECT_STRUCTURE.md). Kế hoạch chi tiết: [IMPLEMENTATION_PLAN](docs/engineering/IMPLEMENTATION_PLAN.md).

## Bảng công việc
| Mã | Công việc | Trạng thái | Bằng chứng / còn thiếu |
|---|---|---|---|
| DOC-01 | Rà soát và quy định cho AI | DONE | AGENTS.md và docs/engineering; kiểm tra tài liệu, không phải kiểm thử ứng dụng |
| P0 | Chốt hợp đồng, bootstrap, thử tính khả thi | DONE | P0_ACCEPTANCE; `npm.cmd run check` 41/41 tests; D-01, D-02, D-04–D-07 vẫn mở, D-03 còn phần P1/P2 |
| TOOL-01 | Relay AI lập trình chuyển nền tảng khi hết quota | DONE | scripts/relay, tests/unit/relay.test.ts; chuyển codex → agy thật đạt; Claude CLI cần đăng nhập lại |
| P1 | Nền dữ liệu, Rule Engine, queue | DONE | P1_ACCEPTANCE; `npm.cmd run check` 107/107 tests, spike 6/6; giới hạn: chưa API ghi/worker entrypoint/hồ sơ năng lực (D-02) |
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
P2: 6 đầu ra Phần 5, pipeline staging + QC1–4 dùng `KnowledgeRepository.transition(..., approvedHash)`, Console 3 tab, gateway subscriptionGuard. Trước API ghi đầu tiên: session/CSRF. Cần entrypoint worker (lắp `runWorkerLoop` với adapter đã xác minh) và lệnh CLI backup/restore. Giữ AI thật tắt; D-01/D-04 phải đóng trước khi bật adapter. Hồ sơ năng lực/chuyển mức chờ người dùng duyệt policy D-02.

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

### 19/10/2026 — TOOL-01 / DONE
- Nguồn: người dùng yêu cầu dùng chung Claude, ChatGPT (Codex) và Gemini theo thuê bao, tự chuyển khi hết quota để công việc lập trình không bị ngắt; phạm vi xác nhận là công cụ lập trình, không phải gateway trong app. Quyết định E-06.
- File: `scripts/relay/core.ts` (phân loại lỗi, parse giờ mở lại, chọn provider, gỡ env tính phí, prompt bàn giao), `providers.ts` (dò binary, argv không bypass, kiểm tra thuê bao), `run-process.ts` (stream log, timeout, taskkill /T), `main.ts` (CLI, lock, state `var/relay`); `package.json` thêm `relay`; `tsconfig.json` typecheck cả `scripts`; README mục Relay.
- CLI quan sát được: Claude Code 2.1.288 (shim → `claude.exe`), Codex 0.163.0-alpha.10.2 (`%LOCALAPPDATA%\OpenAI\Codex\bin\<hash>\codex.exe`, không có trên PATH), Antigravity CLI `agy` 1.4.2 (`%LOCALAPPDATA%\agy\bin\agy.exe`). Không có `gemini` CLI; phía Google dùng agy.
- Lệnh và kết quả:
  - `npm.cmd run check`: lint, typecheck, 63 tests/7 file, build đạt. Lần đầu 1 test fail do `.trim()` làm mất cột đầu của `git status --short`; đã sửa thành `trimEnd()`.
  - `relay --preflight`: claude `claude.ai (pro)`, codex `Logged in using ChatGPT`, agy đăng nhập Google (gói chưa xác minh). Env con bị gỡ `ANTHROPIC_BASE_URL`.
  - `relay --smoke`: agy OK; codex hết quota thật (`You’ve hit your usage limit … try again at 8:01 PM`) → COOLDOWN tới 20:01; claude `Failed to authenticate: OAuth session expired`, sau đó `auth status` báo `authMethod=none` → preflight chặn. Đã thêm mẫu lỗi AUTH này và test bằng đúng chuỗi quan sát được.
  - Đầu-cuối: `relay --order codex,agy` với nhiệm vụ chỉ đọc: codex QUOTA → ghi cooldown → chuyển agy → `RELAY_STATUS: DONE`, exit 0; `git status` không đổi.
- Giới hạn: chưa quan sát thật thông báo hết quota của Claude và agy (dùng mẫu đã biết + test synthetic); chưa chạy relay với nhiệm vụ có sửa file; agy chưa xác minh loại gói; quyền Bash của Claude chỉ là allowlist của Claude Code, không phải sandbox hệ điều hành.
- Việc người dùng cần làm: đăng nhập lại Claude CLI trong terminal riêng (`claude` → `/login`), rồi `npm.cmd run relay -- --reset claude` và `--preflight`.
- Bước tiếp theo: P1 khi người dùng cho tiếp tục; có thể chạy qua relay.

### 20/10/2026 — P1-1 Migrations + repositories / DONE (mốc giữa P1)
- File: `migrations/0001_core.sql`; `src/infrastructure/sqlite/{database,knowledge-repository,learning-repository,store}.ts`; `src/infrastructure/files/{paths,json-store,media-store}.ts`; `src/application/ports.ts`; `src/domain/learning/attempt-state.ts`, `src/domain/knowledge/release-state.ts`; `tests/integration/p1-persistence.test.ts`, `p1-helpers.ts`.
- `npm.cmd run check`: lint, typecheck, 73 tests/8 file, build đạt.

### 20/10/2026 — P1-2 Rule Engine thuần / DONE (mốc giữa P1)
- File: `src/domain/evidence/{types,signal,attribution,inference}.ts`, `src/domain/knowledge/{novelty,revocation}.ts`, `src/domain/learning/pinning.ts`, `src/domain/scheduling/eligibility.ts`, `src/domain/jobs/budget.ts`; `tests/unit/rule-engine.test.ts` (12 ca, gồm kiểm tra domain không import I/O).
- Không có ngưỡng sư phạm: `concludeCompetency` trả `POLICY_NOT_APPROVED` khi chưa có policy được duyệt (D-02).
- `npm.cmd run check`: lint, typecheck, 85 tests/9 file, build đạt.

### 20/10/2026 — P1-3 Queue SQLite / DONE (mốc giữa P1)
- File: `src/infrastructure/sqlite/job-queue.ts`, `src/worker/worker.ts`, `src/application/learning/submit-for-assessment.ts`; FakeAdapter thêm script nhiều bước + delay bị cancel cắt ngang; `tests/integration/p1-queue.test.ts` (16 ca, chỉ FakeAdapter).
- `npm.cmd run check`: lint, typecheck, 101 tests/10 file, build đạt. Lần đầu 1 ca fail do test giả định sai generation tăng 1 (thực tế tăng khi thu hồi lease và khi cấp lại, đúng P0_DATA_AND_STATE); sửa kỳ vọng test, không sửa code.

### 20/10/2026 — P1 / DONE
- Nguồn yêu cầu và quyết định áp dụng: IMPLEMENTATION_PLAN P1; P0_DATA_AND_STATE (ERD, khóa, trạng thái, transaction boundaries); đặc tả 01 §1/§4/§5/Bước 7–9, 02 §2–3/§5, 04 §2.C/§4/§5/§6.C, 05 §6, 06 §4–5, 06A §5–6/§10; quyết định mới E-07; không đổi ngưỡng sư phạm (D-02 vẫn mở).
- File đã sửa và hành vi đã có thật:
  - P1-1/P1-2/P1-3 như các mục trên. P1-4: `src/infrastructure/backup/backup.ts` (online backup + inventory JSON/media theo snapshot, `.partial` → hoàn tất chỉ khi checksum đủ; restore vào thư mục mới, kiểm integrity/FK/migration/inventory; promote giữ bản cũ); `tests/integration/p1-backup.test.ts` (6 ca, gồm ghi đồng thời khi backup).
  - Sửa nhỏ: `src/infrastructure/ai/fake-adapter.ts` (script nhiều bước, tương thích P0), `eslint.config.mjs` (`ignoreRestSiblings`), README (chỉ đoạn trạng thái/giới hạn, không đụng mục Relay).
  - Tài liệu: DECISIONS (E-07, D-03/D-04), P1_ACCEPTANCE (mapping yêu cầu → code → test), IMPLEMENTATION_PLAN (cột code/test thật), PROJECT_STRUCTURE, P0_DATA_AND_STATE (ghi chú đã hiện thực).
- Lệnh kiểm tra / kết quả / môi trường / giới hạn (Windows 11, Node 22.18.0, npm 10.9.3):
  - `npm.cmd run check` trước khi sửa: 63/63 tests. Sau P1: lint, typecheck, 107 tests/11 file, build backend + web đạt.
  - `npm.cmd run spike`: 6/6 đạt. `git status`: không có `var/` hay DB lọt vào repo; `scripts/relay/*` không bị sửa thêm.
  - Giới hạn: chỉ FakeAdapter (không chứng minh adapter thật); một máy, không thử nhiều tiến trình ghi đồng thời thật (restart mô phỏng bằng đóng/mở DB); không có API ghi hay worker entrypoint; backup chưa có CLI/lịch.
- Điểm còn thiếu, quyết định mới, bước tiếp theo: hồ sơ năng lực 6 mức/độ tin cậy, xếp hạng điều phối, chống trì hoãn và mức sẵn sàng sau Bước 5/6 chờ policy D-02 (Rule Engine hiện trả `POLICY_NOT_APPROVED`, không chặn P2). Bước tiếp theo: P2 như mục "Việc tiếp theo".

### Mẫu cho lượt code tiếp theo
- Ngày / mã công việc / trạng thái:
- Nguồn yêu cầu và quyết định áp dụng:
- File đã sửa và hành vi đã có thật:
- Lệnh kiểm tra / kết quả / môi trường / giới hạn:
- Điểm còn thiếu, quyết định mới, bước tiếp theo:
