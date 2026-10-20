# Tiến độ và trạng thái code

Cập nhật: 20/10/2026 — Asia/Bangkok.

## Trạng thái thực tế
- Hoàn tất lượt rà soát 8 tài liệu 00–06A và tạo bộ hướng dẫn triển khai.
- P0 hoàn tất: skeleton Node/TypeScript/React/Vite/Fastify, schema v1 (15 definition), state guard, fake adapter, spike Windows runner và SQLite backup. Chi tiết: [P0_ACCEPTANCE](docs/engineering/P0_ACCEPTANCE.md), [P0_DATA_AND_STATE](docs/engineering/P0_DATA_AND_STATE.md), [README](README.md).
- P1 hoàn tất ở mức thư viện có integration test SQLite thật: migrations, JSON/media bất biến, repositories, Rule Engine thuần, queue lease/fencing/retry/cancel, backup/restore phối hợp. Chi tiết: [P1_ACCEPTANCE](docs/engineering/P1_ACCEPTANCE.md), quyết định E-07.
- P2 BLOCKED chờ D-01: đã có 6 đầu ra Phần 5, pipeline staging + QC1–4, phát hành đúng hash, thu hồi lan truyền + cache, gateway chặn thực thi khi thiếu căn cứ, session/CSRF, Console 3 tab, worker/backup CLI. Chi tiết: [P2_ACCEPTANCE](docs/engineering/P2_ACCEPTANCE.md).
- Chưa có luồng học, hồ sơ năng lực (chờ D-02) hay AI thật.
- Git: nhánh `main` theo dõi [tnKiness/english-ai-platform](https://github.com/tnKiness/english-ai-platform); commit đầu `68a8557` (P0) đã push. `.gitattributes` chuẩn hóa LF.
- Chưa đủ điều kiện bật adapter thật (D-01/D-04) hay công bố sẵn sàng sử dụng.
- Phương án triển khai và ranh giới module: [PROJECT_STRUCTURE](docs/engineering/PROJECT_STRUCTURE.md). Kế hoạch chi tiết: [IMPLEMENTATION_PLAN](docs/engineering/IMPLEMENTATION_PLAN.md).

## Bảng công việc
| Mã | Công việc | Trạng thái | Bằng chứng / còn thiếu |
|---|---|---|---|
| DOC-01 | Rà soát và quy định cho AI | DONE | AGENTS.md và docs/engineering; kiểm tra tài liệu, không phải kiểm thử ứng dụng |
| P0 | Chốt hợp đồng, bootstrap, thử tính khả thi | DONE | P0_ACCEPTANCE; `npm.cmd run check` 41/41 tests; D-01, D-02, D-04–D-07 vẫn mở, D-03 còn phần P1/P2 |
| TOOL-01 | Relay AI lập trình chuyển nền tảng khi hết quota | DONE | scripts/relay, tests/unit/relay.test.ts; chuyển codex → agy thật đạt; Claude CLI cần đăng nhập lại |
| P1 | Nền dữ liệu, Rule Engine, queue | DONE | P1_ACCEPTANCE; `npm.cmd run check` 107/107 tests, spike 6/6; giới hạn: chưa API ghi/worker entrypoint/hồ sơ năng lực (D-02) |
| P2 | Builder/QC + một adapter thật đủ điều kiện | BLOCKED | P2-1…P2-4 và E-11 mục 1–7 có code/tài liệu + test (P2_ACCEPTANCE; 163/163); chưa có provider thật được xác minh (D-01) — Fake-only chưa hoàn tất P2 |
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
Người dùng đã đăng nhập Codex trong profile riêng, ghi xác nhận extra usage và thu báo cáo thật; xác nhận gói Plus trong chat. E-13 phát hiện probe chỉ chứng minh phản hồi/từ chối lệnh, chưa chứng minh ranh giới đọc. Bước tiếp theo là kiểm chứng cơ chế quyền đọc độc lập trên đúng runner (có ca đọc được trong phạm vi làm đối chứng), không chạy lặp lại probe model rồi sửa cờ thành VERIFIED. Hoàn tất hồi quy E-13 trong môi trường cho phép rename/junction trước nghiệm thu. Sau D-01 mới chạy QC4/QC2–3 bằng provider đó trên gói synthetic và xét P2 DONE. Speaking giai đoạn đầu chỉ hỗ trợ văn bản; chưa code P3. Hồ sơ năng lực/chuyển mức chờ policy D-02; nội dung gói thật chờ D-05.

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

### 20/10/2026 — P2-1 Sáu đầu ra Phần 5 / DONE (mốc giữa P2)
- Nguồn: 05 §2.D, §3, §4, §5.A–D; D-05; quyết định E-08.
- File: `contracts/knowledge.v1.schema.json` (governance 8 nhóm, 10 loại khối, source_record, package_request, ingestion_playbook, qc_spec, coverage_manifest, package_manifest, release_manifest, kết quả giải mù/đối chiếu), `contracts/knowledge/{qc-spec,ingestion-playbook}.v1.json`, `src/infrastructure/contracts/{validate,knowledge-specs}.ts`, `src/domain/knowledge/{source-rights,coverage}.ts`, `tests/fixtures/knowledge/synthetic.ts` (nội dung tự viết), `tests/contract/knowledge-schemas.test.ts` (12 ca), `docs/engineering/KNOWLEDGE_OUTPUTS.md`.
- Hành vi: đáp án tách khỏi task_item ở mức schema; nguồn quyền Chưa rõ không thể approved/lưu/xử lý AI/hiển thị và `sourceUseDecision` chặn; thiếu nhóm bao phủ chỉ chặn vai trò phụ thuộc; rubric chính thức chỉ Band nguyên; release manifest bắt buộc QC1–4 PASS gắn bundle_hash.
- `npm.cmd run check`: lint, typecheck, 119 tests/12 file, build đạt. Lần đầu Ajv strict báo thiếu `type: object` trong if/then và typecheck fixture; đã sửa schema/fixture, không nới strict.

### 20/10/2026 — P2-2 Pipeline staging + QC1–4 + phát hành/thu hồi / DONE (mốc giữa P2, chỉ FakeAdapter)
- Nguồn: 05 §4.C, §5.B–C, §6.A, §7.A; 04 §2.B; 06 §3, §5.B.5; 06A §7.C.4, §10.B ca 9; E-08.
- File: `migrations/0002_builder_qc.sql` (source_records, package_requests, staging_*, pipeline_events, package_bundles, knowledge_units/package_units, qc_results, qc_jobs, release_manifests, result_cache(+deps), review_items, ai_accounts, provider_verifications, ai_data_consents; trigger append-only); `src/application/qc/{pipeline,qc-checks,ports}.ts`, `src/application/context/scoped-reader.ts`, `src/domain/knowledge/{release-gate,qc4}.ts`, `src/infrastructure/sqlite/{builder-repository,result-cache}.ts`, `src/infrastructure/ai/result-contracts.ts`; sửa `store.ts` (builder, cache, `builderPipeline`), `job-queue.ts` (claim lọc scope + provider/cli_version, `result()`), `worker.ts` (task_type → hợp đồng kết quả), `fake-adapter.ts` (kịch bản giải mù/đối chiếu, ghi context đã nhận), `media-store.ts` (`exists`), `provider-adapter.ts` (kết quả giải mù/đối chiếu). Test: `tests/integration/p2-pipeline.test.ts` (13 ca), `p2-helpers.ts`; P1 tests cập nhật số migration 1 → 2.
- Hành vi: đóng băng staging thành JSON bất biến + `bundle_hash`; QC1–3 phần xác định do code, phần ngữ nghĩa QC2/QC3 cần xác nhận nêu đúng hash; QC4 chạy dry-run qua queue — giải mù đọc qua reader `blind_solver` (đáp án là đối tượng riêng nên không bị mở), đối chiếu là job + manifest riêng có key; ứng dụng so khớp và quyết định. Phát hành đọc lại đĩa, tính lại hash, đòi mọi phần QC PASS trên đúng hash + qc-spec hiện hành, quyền nguồn mới nhất, không bị thu hồi, có ít nhất một vai trò được cấp. Thu hồi/ngừng: suspend release, vô hiệu cache phụ thuộc (một chiều), truy vết attempt/observation (cả đạt lẫn chưa đạt) vào "Cần xử lý", lịch sử giữ nguyên.
- `npm.cmd run check`: lint, typecheck, 132 tests/13 file, build đạt. Lỗi gặp và cách sửa: 2 kỳ vọng test thiếu lý do chặn bổ sung (hành vi đúng, chặt hơn) → sửa kỳ vọng; ESLint `preserve-caught-error` → thêm `cause`; P1 test cố định 1 migration → cập nhật 2.
- Giới hạn: QC4 chỉ chạy bằng FakeAdapter (`synthetic_fake`, chỉ hợp lệ cho gói `synthetic_fixture`; gói `sourced` bị chặn); QC2/QC3 ngữ nghĩa là xác nhận thủ công của người dùng; cache chưa nối vào luồng chấm học thật (P3/P5).

### 20/10/2026 — P2-3 Gateway (AI thật chưa bật) / DONE phần code; D-01 còn BLOCKED chờ người dùng
- Nguồn: 06A §1, §3–6, §8, §10.B ca 3–6/11; QUALITY_AND_DATA ca 3–4; D-01, D-04; quyết định E-09.
- File: `src/application/ai/subscription-guard.ts` (6 chốt + căn cứ D-01, `dataClassesFor`), `src/infrastructure/ai/gateway/{env-allowlist,redaction,envelope,entrypoint,isolation,cli-adapters,gateway,compose}.ts`, `src/infrastructure/sqlite/ai-accounts-repository.ts` (tài khoản không secret, evidence append-only, consent mặc định từ chối), `src/cli/ai.ts` + script `npm run ai`, `tests/integration/p2-gateway.test.ts` (12 ca), `tests/fixtures/fake-cli.mjs` (node.exe giả lập CLI, không inference/mạng).
- Hành vi: thiếu bất kỳ căn cứ nào (evidence, adapter chưa VERIFIED, env tính phí, entrypoint đổi/shim, version đổi, cờ bypass/`--bare`, model ngoài entitlement, extra usage chưa xác nhận/quá hạn, plugin, file-scope test thiếu ca, timeout/cancel, output contract, profile, cơ chế cô lập) → `BILLING_UNVERIFIED`, không spawn; đăng nhập → `AUTH_EXPIRED`; năng lực → `CAPABILITY_MISSING`; hãng chưa được nhận loại dữ liệu → `DATA_RECIPIENT_NOT_ALLOWED`. Adapter không có permit của gateway trả BILLING_UNVERIFIED mà không gọi process. Envelope 2 lớp, layout chưa VERIFIED thì từ chối; lỗi không phân loại được → dừng như BILLING_UNVERIFIED. Ba adapter: claude-code, codex = NEEDS_VERIFICATION; gemini-cli = DISABLED (không có trên máy).
- Lệnh: `npm.cmd run check`: lint, typecheck, 144 tests/14 file, build đạt. Lần đầu 1 ca fail vì lý do thiếu cơ chế cô lập chỉ được báo khi đã có evidence → chuyển ra ngoài nhánh evidence để báo đủ. `npm.cmd run ai -- status`: cả 3 provider BLOCKED (BILLING_UNVERIFIED) kèm lý do; không spawn CLI (lệnh tạo `var/db/study.db` trống, đã gitignore).
- Giới hạn: đường thực thi chỉ được chứng minh bằng CLI giả (node.exe) với evidence synthetic; argv/envelope/cơ chế cô lập của CLI thật là ứng viên chưa xác minh; file-scope test với CLI thật chưa chạy.

### 20/10/2026 — P2-4 Session/CSRF, Console 3 tab, worker + backup CLI / DONE phần code (mốc giữa P2)
- Nguồn: 06 §3–4, §5.B.3/6; QUALITY_AND_DATA "Bảo vệ local", ca 8; E-10.
- File: `src/server/{session,app,main}.ts` (session + CSRF, API Console, server mở store), `src/application/qc/console.ts` (mở nội dung ghi exposure trước; dry-run), `src/infrastructure/sqlite/console-queries.ts`, `src/web/{api.ts,console.tsx,main.tsx,style.css}` (3 mục điều hướng; Console 3 tab, xác nhận trước khi mở nội dung), `src/worker/main.ts`, `src/cli/backup.ts`, `package.json` (scripts `ai`, `worker`, `backup`); test `tests/integration/p2-console.test.ts` (5 ca), `server.test.ts` (stage P2).
- Lệnh và kết quả: `npm.cmd run check`: lint, typecheck, 149 tests/15 file, build đạt. Lỗi gặp: Fastify mặc định gỡ trường lạ thay vì từ chối → tắt `removeAdditional`; exposure gửi `kind` thừa trong versionRef → chỉ gửi id/version/hash. Chạy tay: `npm.cmd run worker -- --once` exit 3 kèm lý do chặn; `--fake --once` → IDLE; `npm.cmd run backup -- create` OK (0 file, 2 migrations), `restore` vào thư mục scratchpad verify OK (không promote); server `tsx src/server/main.ts` + script fetch: health 200, cookie HttpOnly/SameSite=Strict, packages 401 không cookie/200 có cookie, ghi thiếu CSRF 403, gateway 3 provider BILLING_UNVERIFIED; đã dừng server. Các lệnh trên tạo `var/` (db, backups) — đã gitignore.
- Giới hạn: chưa mở UI trong trình duyệt ở lượt này (chỉ build + API test); chưa có Playwright.

### 20/10/2026 — P2 / BLOCKED (chờ D-01)
- Nguồn yêu cầu và quyết định áp dụng: IMPLEMENTATION_PLAN P2; 04 §2.B, 05 §2–8, 06 §3–5, 06A §1–8, §10.B; E-08, E-09, E-10; D-01, D-04, D-05 (đóng phần kỹ thuật D-03).
- File đã sửa và hành vi đã có thật: xem 4 mục P2-1…P2-4 bên trên và [P2_ACCEPTANCE](docs/engineering/P2_ACCEPTANCE.md) (mapping yêu cầu → code → test). Tài liệu: KNOWLEDGE_OUTPUTS, P2_ACCEPTANCE, DECISIONS (E-08…E-10, D-01/D-03/D-04), README, IMPLEMENTATION_PLAN, PROJECT_STRUCTURE.
- Lệnh kiểm tra / kết quả / môi trường / giới hạn: Windows 11, Node 22.18.0, npm 10.9.3. `npm.cmd run check` trước P2: 107/107; sau P2: 149 tests/15 file + lint/typecheck/build đạt. Không gọi inference thật; mọi kết quả AI là FakeAdapter hoặc CLI giả node.exe. Không đọc credential/file auth; không sửa `scripts/relay/` hay `tests/unit/relay.test.ts`; không thêm dependency.
- Điểm còn thiếu: provider thật được xác minh (D-01) → QC4 và QC2–3 bằng AI thật; gemini-cli không có trên máy (agy cần quyết định); nội dung thật (D-05); Playwright E2E.
- Câu hỏi cho người dùng: (1) Xác minh provider nào trước (đề xuất Claude Code)? (2) Đồng ý cho provider đó nhận những loại dữ liệu nào: synthetic_fixture, knowledge_content, answer_key, learner_submission, learner_audio, learner_profile? (3) Có muốn thêm adapter cho Antigravity `agy` thay cho gemini-cli (cần đổi 06A) hay giữ gemini-cli DISABLED? (4) Chu kỳ nhắc xác nhận lại "extra usage tắt" là bao lâu?

### 20/10/2026 — P2 tiếp (E-11) / IN_PROGRESS — lượt bị ngắt do hết hạn mức, CHƯA chạy test
- Nguồn: E-11 (DECISIONS), P2_ACCEPTANCE.
- Đã viết code (chưa kiểm chứng bằng test):
  - Mục 1 agy: `migrations/0003_provider_agy.sql` (dựng lại ai_runs/ai_accounts/provider_verifications/ai_data_consents với 'agy', giữ 'gemini-cli' cho dữ liệu cũ, bảng `extra_usage_confirmations`); `contracts/provider.v2.schema.json` (profile/job/run schema_version "2"; core.v1 giữ nguyên); `validate.ts` chọn schema theo schema_version; job-queue ghi '2'; `CliProvider` = codex | claude-code | agy; adapter agy NEEDS_VERIFICATION trong `cli-adapters.ts`.
  - Mục 2: `ISOLATION_MECHANISMS.codex = CODEX_HOME` (ứng viên); gateway báo `ISOLATION_EVIDENCE_MECHANISM_MISMATCH` nếu evidence dùng cơ chế khác.
  - Mục 3: `USER_APPROVED_DATA_CLASSES`, `NEVER_SENT_DATA_CLASSES` (learner_audio) trong guard; `grantUserApprovedDataClasses` (chỉ khi profile READY); `npm run ai -- consent <p> approved grant`.
  - Mục 4: guard chặn khi xác nhận gần nhất > 30 ngày (`EXTRA_USAGE_RECONFIRM_MS`); `npm run ai -- confirm-extra-usage <p> off`.
  - Mục 6: `src/infrastructure/ai/gateway/verify-codex.ts` + `npm run ai -- verify codex --profile <dir> [--model] [--entrypoint] [--argv] [--out]`; `runBoundedProcess` thêm stderr/onSpawn; envelope thêm `line_select`; CLI giả `tests/fixtures/fake-codex.mjs`.
  - Test: `tests/integration/p2-e11.test.ts` (mới), cập nhật p2-gateway, p1-persistence, p1-backup (3 migrations).
- Lệnh đã chạy: `npm.cmd run typecheck` đạt; `npm.cmd run lint` báo 1 lỗi `setTimeout` no-undef ở fake-codex.mjs → đã thêm import, CHƯA chạy lại. Chưa chạy `npm.cmd run check`/vitest (lệnh chạy test cần quyền duyệt và lượt hết hạn mức). Không gọi CLI thật.
- Còn thiếu: chạy `npm.cmd run check` và sửa lỗi; mục 5 (ghi chú Speaking vào 03 và IMPLEMENTATION_PLAN P3); đồng bộ 06A bảng provider (agy theo E-11); P2_ACCEPTANCE mục "Việc người dùng cần làm" viết lại cho Codex; cập nhật DECISIONS (E-12 kỹ thuật: provider.v2, migration 0003, verify script), README, PROJECT_STRUCTURE.

### 20/10/2026 — P2 tiếp E-11, mục 1–7 / DONE phần được giao; P2 vẫn BLOCKED D-01
- Nguồn yêu cầu và quyết định áp dụng: nhiệm vụ relay P2 tiếp; E-08…E-11, bổ sung quyết định triển khai E-12; 06A §1/3/5/8/10, 03 §2, QUALITY_AND_DATA ca 3–4; không code P3.
- Đã kiểm tra code dở từ lượt trước, giữ thay đổi hiện hữu và hoàn thiện:
  1. **agy / DONE:** adapter NEEDS_VERIFICATION với native entrypoint và cờ ứng viên; `agy models` không chứng minh gói. Hợp đồng provider v2 và migration 0003 giữ dữ liệu/schema v1, không sửa migrations 0001–0002. Sửa `database.ts` để foreign_keys tắt ngoài transaction dựng lại 0003, kiểm FK trước commit rồi bật lại; `gateway.ts` chặn job cũ gemini-cli bằng PROVIDER_NOT_ENABLED. Đồng bộ 06A, chỉ mục 00 và danh sách provider ở 04 theo E-11.
  2. **CODEX_HOME / DONE:** cơ chế ứng viên ngoài repo/var trong `isolation.ts`; evidence khác cơ chế bị chặn, chưa bật provider. D-01 vẫn cần bằng chứng thực tế.
  3. **Đồng ý dữ liệu / DONE:** `consent <provider> approved grant` cấp đúng 5 loại E-11 sau READY, không lan provider; `learner_audio` bị guard chặn dù VERIFIED và có consent. Code ở guard/repository/CLI; test ở p2-e11.
  4. **30 ngày / DONE:** xác nhận extra usage append-only; đúng 30 ngày cho phép, +1 ms chặn, xác nhận mới bắt đầu lại chu kỳ, tương lai không hợp lệ. Lệnh `confirm-extra-usage <provider> off`; `verify` CLI cũng đòi xác nhận còn hạn trước inference.
  5. **Speaking / DONE tài liệu:** 03 §2, IMPLEMENTATION_PLAN P3 và 06A nêu hỗ trợ ý tưởng/dàn ý/từ vựng dạng văn bản; chưa chấm audio/phát âm/Band Speaking. Không triển khai P3.
  6. **Script D-01 Codex / DONE phần công cụ:** `verify-codex.ts`, `src/cli/ai.ts`, `bounded-process.ts`, `envelope.ts`, fixture fake-codex và p2-e11. Thu version/hash, chỉ lưu phương thức login, quan sát envelope, 5 probe file-scope, timeout/cancel; xuất evidence/envelope/observations, không tự đặt extra usage hoặc VERIFIED. Lỗi/empty output không được PASS; cây phải có root + child, không thấy cây hoặc còn PID sống thì chưa đạt. Bằng chứng CLI giả không chứng minh giới hạn đọc của CLI thật; người dùng phải đối chiếu quyền thực tế, không chỉ tin lời model từ chối.
  7. **Hướng dẫn Codex / DONE:** P2_ACCEPTANCE thay hướng dẫn Claude bằng lệnh Codex cụ thể: đăng nhập profile → xác nhận extra usage/gói → verify → duyệt evidence → nạp → cấp 5 loại. README, PROJECT_STRUCTURE, DECISIONS, mapping yêu cầu → code → test và bước tiếp theo trong file này đã đồng bộ.
- Lệnh kiểm tra / kết quả thật (Windows, Node 22.18.0/npm 10.9.3; giờ dưới đây là `Start at` do Vitest in):
  - `npm.cmd run check` đầu lượt: 25 fail / 135 pass. Nguyên nhân: migration làm FK trỏ `ai_runs_pre_0003`, spike chưa cập nhật trường stderr, kiểm cây tiến trình không thấy child. Đã sửa; không ghi PASS cho lượt này.
  - `npm.cmd test -- tests/spikes/runner.test.ts tests/integration/p2-gateway.test.ts tests/integration/p2-e11.test.ts`: 3 fail / 25 pass trước sửa hoàn tất. Các lượt `npm.cmd test -- tests/integration/p2-e11.test.ts` và `-t "collects evidence"` xác định CIM không trả cây, không hạ kỳ vọng test để cho qua.
  - Một lượt `npm.cmd run check` dừng typecheck TS2571 (`pragma` trả unknown); đã sửa kiểu cho kết quả foreign_key_check.
  - **7 lượt `npm.cmd run check` đạt trong quá trình hoàn tất 7 mục:** 12:03:29 — 160/160; 12:05:00 — 162/162; 12:06:46 — 162/162; 12:08:10 — 162/162; 12:08:58 — 163/163; 12:09:36 — 163/163; 12:10:02 — 163/163. Mỗi lượt đều lint + typecheck + tests (16 file) + build backend/web đạt. Kiểm tra cuối bao phủ toàn bộ mục 1–7.
  - Test mới giữ nguyên lịch sử run/result/observation/submission/evidence_source qua migration từ DB v2, kiểm hook trước migrate, FK và trigger không trỏ tên bảng tạm. `tests/integration/p1-helpers.ts` thêm tùy chọn migrationsDir chỉ để tạo DB cũ synthetic.
  - `Get-CimInstance Win32_Process -ErrorAction Stop`: **Access denied** trong môi trường này. Không nâng quyền/bypass. Test thành công dùng PID do CLI giả ghi ra và `process.kill(pid, 0)` để xác nhận taskkill thực sự kết thúc root + child; đường CIM thật chưa được xác minh. Thiếu bảng tiến trình khiến verifier giữ chưa đạt.
  - Python kiểm UTF-8 và link local của 21 Markdown: 53 liên kết, 0 lỗi. `git diff --check`: exit 0, chỉ cảnh báo chuẩn hóa CRLF→LF. `git diff -- scripts/relay tests/unit/relay.test.ts`: rỗng.
- Giới hạn và bước tiếp theo: không chạy Codex/agy/Claude thật, không đọc credential/file auth, không gọi inference thật, không commit/push, không thêm dependency. P2 **BLOCKED**: người dùng cần đăng nhập ChatGPT trong CODEX_HOME riêng, xác nhận extra usage/auto-recharge tắt và gói/model, chạy verify rồi duyệt bằng chứng D-01; nếu file-scope/CIM/cây tiến trình chưa đạt thì giữ BLOCKED. Sau D-01 mới chạy QC4/QC2–3 thật trên gói synthetic và xét P2 DONE. Hướng dẫn đầy đủ: [P2_ACCEPTANCE](docs/engineering/P2_ACCEPTANCE.md).

### 20/10/2026 — R-07 / E-13 sửa false-positive kiểm chứng giới hạn đọc (PARTIAL nghiệm thu)
- Nguồn: 06A §5.C.3, §10.B ca 11; QUALITY_AND_DATA ca 3; người dùng yêu cầu tiếp tục sau rà soát evidence. Giữ nguyên evidence gốc và mọi thay đổi đang có, không commit/push.
- Code: `verify-codex.ts` chỉ ghi quan sát phản hồi, `passed: false`, `method: model_reply`; `subscription-guard.ts` chặn báo cáo cũ/thiếu phương pháp/thiếu tham chiếu bằng `READ_BOUNDARY_UNVERIFIED`. CLI giải thích thu quan sát chưa phải VERIFIED. `enforced_boundary` và tham chiếu là điều kiện bằng chứng được duyệt, không tự tạo sandbox hay tự xác thực tài liệu.
- Mapping: R-07 → 06A §5.C.3/§10.B.11 → E-13 → hai module trên → `tests/unit/file-scope-evidence.test.ts`, `tests/integration/p2-gateway.test.ts`, `tests/integration/p2-e11.test.ts`; fixture thêm lệnh bị policy chặn. Đồng bộ P2_ACCEPTANCE, IMPLEMENTATION_PLAN, DECISIONS.
- Rà soát thật chỉ đọc ở lượt trước: executable hash khớp; profile không có config.toml, AGENTS.md, .mcp.json, hooks.json trong các vị trí đã kiểm tra, skills chỉ `.system`; không đọc auth.json. Log synthetic có lệnh đọc bị từ chối trước CreateProcess (`blocked by policy`); không phải bằng chứng quyền OS giới hạn đọc. Báo cáo thật của người dùng có JSON hợp lệ, timeout/cancel tree 2; chưa đóng D-01.
- Kiểm tra:
  - `npm.cmd run check`: lint/typecheck đạt; **110 pass / 58 fail** (168 tests), không tới build do test lỗi. Nhiều test dữ liệu lỗi EPERM rename trong thư mục tạm sandbox Windows; các probe junction không dựng được nên chưa kết luận. Không sửa kỳ vọng để cho qua.
  - `npm.cmd test -- tests/integration/p2-gateway.test.ts tests/integration/p2-e11.test.ts`: **20 pass / 11 fail**, cùng lỗi rename/junction; log riêng tư `var/ai/e13-tests.log`. Exit của npm được ghi trong log kết quả test; shell đọc log sau đó exit 0 không có nghĩa test đạt.
  - `npm.cmd test -- tests/unit/file-scope-evidence.test.ts tests/integration/p2-gateway.test.ts -t "D-01 behavioral|subscriptionGuard"`: **15 pass / 9 skipped**, kiểm tra các nhánh mới, không inference.
  - `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd run build`: đều đạt sau khi tách hàm đánh giá probe; build backend/web hoàn tất.
  - Xin chạy check ngoài sandbox bị auto-review từ chối vì quy định không vượt sandbox/quyền; không thực thi lại qua đường vòng.
- Giới hạn: chưa có collector thực thi quyền đọc độc lập; adapter thật vẫn NEEDS_VERIFICATION. Không gọi model thật trong lượt sửa này, không cấp thêm consent, không sửa evidence gốc. Cần chạy check trong terminal người dùng cho phép rename/junction và tiếp tục thiết kế/kiểm chứng runner trước khi bật D-01.

### 20/10/2026 — TOOL-01 sửa lỗi relay / DONE
- Nguồn: người dùng yêu cầu ưu tiên sửa relay sau lượt P2 ngày 20/10 (Claude hết hạn mức giữa lượt nhưng ghi BLOCKED nên relay dừng thay vì chuyển; Claude không chạy được test; không thấy tiến trình chạy ngầm).
- File: `scripts/relay/stream.ts` (mới: parser sự kiện claude stream-json / codex exec --json / agy stream-json → dòng tiến trình, session id, câu trả lời cuối, tín hiệu quota), `core.ts` (`RELAY_STATUS: QUOTA`, quyết định dựa trên câu trả lời cuối + lỗi CLI + `rate_limit_event`, không đọc output công cụ; BLOCKED về hạn mức sau cảnh báo → chuyển; bàn giao kèm báo cáo cuối lượt trước), `providers.ts` (output stream, allowlist thêm `PowerShell(...)` và `npx vitest`), `run-process.ts` (tách dòng), `main.ts` (in tiến trình, `var/relay/live.log`, `var/relay/sessions.json`, lệnh resume trong `--status`), `tests/unit/relay.test.ts`.
- Định dạng sự kiện lấy từ một lượt chạy thật nhỏ của cả 3 CLI (prompt đọc package.json). Claude stream có `rate_limit_event` với `status`, `resetsAt`, `overageStatus`.
- Kiểm tra: `npm.cmd run check` lint/typecheck/184 tests/build đạt; `relay --smoke` claude/codex/agy OK ở chế độ stream, cả 3 session id có trong kho phiên của CLI tương ứng (`~/.claude/projects`, `~/.codex/sessions`, `~/.gemini/antigravity-cli/conversations`).
- Giới hạn: chưa quan sát thật `rate_limit_event` trạng thái `rejected`/`allowed_warning` (test dùng dữ liệu tổng hợp theo định dạng đã thấy); chưa chạy một nhiệm vụ sửa file đầy đủ qua relay mới; mở lại phiên agy chưa thử.

### 20/10/2026 — TOOL-02 Relay Console / DONE
- Nguồn: người dùng yêu cầu một giao diện chat chung quản lý Claude Code/Codex/Antigravity, xem được các bước chạy ngầm, tự chuyển khi hết hạn mức và tiếp tục được trên nền tảng cũ; thử thực tế bằng phiên agy.
- File: `scripts/relay/engine.ts` (tách từ main: chạy CLI, live.log, sessions.json, transcript theo phiên, khóa dùng chung; `RELAY_STATE_DIR` cho test), `scripts/relay/console/{server,threads,main}.ts`, `scripts/relay/console/public/{index.html,app.js,app.css}`, `providers.ts` (tham số resume cho từng CLI, chế độ `read`), `main.ts` (dùng engine; tạo live.log ngay khi chạy), `package.json` (`relay:console`), `eslint.config.mjs` (biến trình duyệt cho app.js), `tests/integration/relay-console.test.ts`, `tests/fixtures/fake-relay-cli.mjs`.
- Lỗi người dùng gặp: `live.log` không tồn tại vì chưa có lượt relay nào chạy sau khi thêm tính năng; nay relay/console tạo file ngay khi khởi động.
- Kiểm tra: `npm.cmd run check` lint/typecheck/189 tests/build đạt (console: token/Host/Origin/415, chat agy + resume, fallback claude→codex khi quota rồi quay lại claude nhận phần bỏ lỡ, chặn người ghi thứ hai). Thử thật trên trình duyệt: mở phiên agy `17af1dac…` (tạo bởi relay --smoke) trong console, chế độ chỉ đọc, hỏi lại câu trả lời trước và số script npm → agy tiếp đúng phiên cũ, nhớ câu trả lời trước, đọc package.json, trả lời 15 script (đúng); tiến trình hiện ở khung chat và cột Trực tiếp.
- Giới hạn: chưa thử chat thật với Claude/Codex qua console (chỉ CLI giả); `codex exec resume` dùng `-c sandbox_mode` thay `--sandbox` theo `--help`, chưa chạy thật; chưa thử fallback với quota thật; token đổi mỗi lần khởi động console nên phải tải lại trang sau khi khởi động lại.

### Mẫu cho lượt code tiếp theo
- Ngày / mã công việc / trạng thái:
- Nguồn yêu cầu và quyết định áp dụng:
- File đã sửa và hành vi đã có thật:
- Lệnh kiểm tra / kết quả / môi trường / giới hạn:
- Điểm còn thiếu, quyết định mới, bước tiếp theo:
