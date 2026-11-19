# Tiến độ và trạng thái code

Cập nhật: 17/11/2026 — Asia/Bangkok.

## Trạng thái thực tế
- Hoàn tất lượt rà soát 8 tài liệu 00–06A và tạo bộ hướng dẫn triển khai.
- P0 hoàn tất: skeleton Node/TypeScript/React/Vite/Fastify, schema v1 (15 definition), state guard, fake adapter, spike Windows runner và SQLite backup. Chi tiết: [P0_ACCEPTANCE](docs/engineering/P0_ACCEPTANCE.md), [P0_DATA_AND_STATE](docs/engineering/P0_DATA_AND_STATE.md), [README](docs/README.vi.md).
- P1 hoàn tất ở mức thư viện có integration test SQLite thật: migrations, JSON/media bất biến, repositories, Rule Engine thuần, queue lease/fencing/retry/cancel, backup/restore phối hợp. Chi tiết: [P1_ACCEPTANCE](docs/engineering/P1_ACCEPTANCE.md), quyết định E-07.
- P2 DONE: đã có 6 đầu ra Phần 5, pipeline staging + QC1–4, phát hành đúng hash, thu hồi lan truyền + cache, gateway chặn thực thi khi thiếu căn cứ, session/CSRF, Console 3 tab, worker/backup CLI; D-01 đã đóng cho Codex (READY) và chạy `npm.cmd run qc:real`. Chi tiết: [P2_ACCEPTANCE](docs/engineering/P2_ACCEPTANCE.md).
- P3 hoàn tất phần lát cắt học trên gói synthetic: P3-1 (khung học 5 màn, 3 chế độ guided/self_practice/exam, autosave server qua session/CSRF), P3-2 (vòng Writing khép kín với FakeAdapter + nội dung synthetic, xếp lịch 7B/Bước 9 và Opportunity-to-Use, giữ giới hạn D-02), P3-3 (gợi mở theo nấc chỉ lưu server, cắt quyền trước truy xuất, assistance_events idempotent, chỉ bản sửa mới mới kích hoạt chấm lại), P3-4 (Reading trong luồng học: chỉ cấp item đã qua QC4 + phát hành, đáp án cạnh tranh hợp lệ, Not Given đúng nghĩa, cắt quyền HTTP payload trước Nấc 3, thu hồi ngừng cấp phát ngay; Audio mẫu cục bộ theo D-06/E-11: thu/phát vào kho media có SHA-256, ASR unavailable, transcript người học tách biệt với audio gốc, không bao giờ gửi `learner_audio` vào job AI). Chi tiết: [P3_ACCEPTANCE](docs/engineering/P3_ACCEPTANCE.md), quyết định E-18, E-19. Chưa bật báo điểm Band hay hồ sơ năng lực chính thức (chờ D-02, D-05) và chưa chọn ASR/chấm phát âm (chờ D-06).
- P4 hoàn tất phần độc lập (mục 1–4) và công cụ D-01 cho `claude-code`/`agy` theo E-21: ma trận ca chịu lỗi bắt buộc 04 §6.C / 06 §6.A.4 / 06A §10.B, failover đa nhà cung cấp bằng fixture (không đốt quota thật, giữ nguyên nguồn bằng chứng và trần 3 lần thực thi, chặn kết quả muộn), khiếu nại/tái đánh giá có truy vết `supersedes` và thu hồi hai chiều tới cả nhận định đạt/chưa đạt và hồ sơ, khung cấu trúc đối chứng D-05 (schema/manifest tách dev/holdout + cổng chặn bật provider dự phòng khi thiếu báo cáo đối chứng có nguồn/quyền), cùng adapter + guard + bộ thu `probe-boundary claude|agy` và `verify claude|agy` theo E-21 ([D01_CLAUDE_AGY](docs/engineering/D01_CLAUDE_AGY.md)). P4 toàn phần giữ `IN_PROGRESS` (BLOCKED phần xác minh thật) vì chờ người dùng đăng nhập profile riêng và chạy `probe-boundary`/`verify` thật cho `claude-code`/`agy`, cũng như bộ đối chứng thật D-05. Chi tiết: [P4_ACCEPTANCE](docs/engineering/P4_ACCEPTANCE.md), [D01_CLAUDE_AGY](docs/engineering/D01_CLAUDE_AGY.md), quyết định E-20, E-21.
- Git: nhánh `main` theo dõi [tnKiness/english-ai-platform](https://github.com/tnKiness/english-ai-platform); commit đầu `68a8557` (P0) đã push. `.gitattributes` chuẩn hóa LF.
- Chưa đủ điều kiện bật adapter dự phòng thật (`claude-code`, `agy` chờ D-01/D-05) hay công bố sẵn sàng sử dụng.
- Phương án triển khai và ranh giới module: [PROJECT_STRUCTURE](docs/engineering/PROJECT_STRUCTURE.md). Kế hoạch chi tiết: [IMPLEMENTATION_PLAN](docs/engineering/IMPLEMENTATION_PLAN.md).

## Bảng công việc
| Mã | Công việc | Trạng thái | Bằng chứng / còn thiếu |
|---|---|---|---|
| DOC-01 | Rà soát và quy định cho AI | DONE | AGENTS.md và docs/engineering; kiểm tra tài liệu, không phải kiểm thử ứng dụng |
| P0 | Chốt hợp đồng, bootstrap, thử tính khả thi | DONE | P0_ACCEPTANCE; `npm.cmd run check` 41/41 tests; D-01, D-02, D-04–D-07 vẫn mở, D-03 còn phần P1/P2 |
| TOOL-01 | Relay AI lập trình chuyển nền tảng khi hết quota | DONE | scripts/relay, tests/unit/relay.test.ts; chuyển codex → agy thật đạt; Claude CLI cần đăng nhập lại |
| P1 | Nền dữ liệu, Rule Engine, queue | DONE | P1_ACCEPTANCE; `npm.cmd run check` 107/107 tests, spike 6/6; giới hạn: chưa API ghi/worker entrypoint/hồ sơ năng lực (D-02) |
| P2 | Builder/QC + một adapter thật đủ điều kiện | DONE | P2_ACCEPTANCE (mục "QC thật bằng Codex"); D-01 đóng cho Codex (READY); QC1–QC4 thật trên gói synthetic → release → revoke có truy vết (`npm.cmd run qc:real`); check 217/217. Còn mở: D-01 cho claude-code/agy; QC2/QC3 ngữ nghĩa vẫn là xác nhận của người/AI lập trình trên nội dung synthetic |
| P3 | Vòng Writing + Reading giải mù + audio mẫu | DONE | [P3_ACCEPTANCE](docs/engineering/P3_ACCEPTANCE.md) (E-18, E-19); P3-1…P3-4 đầy đủ trên gói synthetic (`tests/integration/p3-learning.test.ts` 5/5, `tests/integration/p3-reading.test.ts` 4/4; bộ test P0–P3 187/187 trong sandbox agy; lint/typecheck/build đạt). Phụ thuộc người dùng vẫn mở đúng quy định: D-02 (chính sách ngưỡng năng lực/Band), D-05 (gói nội dung thật & bộ đối chứng), D-06 (công cụ ASR/chấm phát âm) |
| P4 | Chịu lỗi, adapter bổ sung, đối chứng | IN_PROGRESS | [P4_ACCEPTANCE](docs/engineering/P4_ACCEPTANCE.md) (E-20, E-21) và [D01_CLAUDE_AGY](docs/engineering/D01_CLAUDE_AGY.md): phần độc lập 1–4 + code/công cụ D-01 cho `claude-code` (`cli_tools_disabled`) và `agy` (`cli_permission_deny`) DONE (`p4-*` 19/19, `e21-claude-agy` 6/6 đạt; bộ P0–P4 214/214 trong sandbox agy; lint/typecheck/build đạt). Còn mở: người dùng đăng nhập và chạy `probe-boundary`/`verify` thật cho `claude-code`/`agy` (D-01) và bộ đối chứng có nguồn/quyền D-05 |
| AI-01 | Lõi định tuyến ai-router làm nền gateway AI (E-24) | DONE | `src/infrastructure/ai/router-core/` (đồng bộ `npm run router:sync`), `gateway/failover.ts`, worker tự mở lại WAITING_QUOTA; `npm.cmd run check` 247/247. Chưa chạy với CLI thật |
| DOC-02 | Hướng dẫn sử dụng tự cập nhật (E-26) | DONE | `docs/HUONG_DAN_SU_DUNG.md`, `scripts/user-guide.mjs`, cổng `docs:guide -- --check` trong `check`, AGENTS.md 5a; hook pre-commit tùy chọn |
| P5 | Mở rộng, daily tracking, tối ưu | IN_PROGRESS | P5-1 Daily Tracker DONE (E-25); P5-2 tra cứu FTS5/BM25 lọc quyền DONE (E-27); P5-3 xuất dữ liệu + báo cáo dung lượng DONE (E-28); P5-4 chạy một lệnh + diễn tập khôi phục DONE (E-29: `npm run app`, `backup -- drill`; `p5-app` 3/3; UI đã kiểm trên trình duyệt với dữ liệu thử). Còn: đề xuất lịch bù (xếp hạng chờ D-02), mở rộng dạng bài (chờ D-05), chính sách lưu giữ/tự dọn (D-07) |

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
P0–P3 đã hoàn tất phần code và nghiệm thu trên gói synthetic (D-01 đã đóng cho Codex READY; `npm.cmd run qc:real` đã chạy QC1–4 thật). Bước tiếp theo theo kế hoạch là **P4 (Chịu lỗi, adapter bổ sung, đối chứng)**: hoàn tất bộ ca lỗi bắt buộc 04 §6.C / 06 §6.A.4 / 06A §10.B, xác minh D-01 riêng cho `claude-code`/`agy` nếu muốn bật failover đa hãng, kiểm tra khiếu nại/tái đánh giá/thu hồi hai chiều. Các điểm phụ thuộc quyết định nghiệp vụ của người dùng vẫn giữ mở: D-02 (bảng policy ngưỡng năng lực/Band), D-05 (nội dung thật & bộ đối chứng trước khi bật báo Band), D-06 (chọn công cụ ASR/TTS local).

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

### 20/10/2026 — TOOL-02 test thật Claude/Codex qua Relay Console + khảo sát D-01 / DONE (console), D-01 vẫn mở
- Test thật qua API của console đang chạy (cùng đường với giao diện), cuộc trò chuyện `9005e9e9…`:
  1. Claude phiên mới, chỉ đọc: đọc package.json, trả lời tiếng Việt, 25s, DONE.
  2. Claude tiếp phiên `147ed7df…`: nhắc đúng câu trả lời trước, 8s.
  3. Codex trong cùng cuộc trò chuyện: nhận phần bỏ lỡ, trả lời đúng điều Claude đã nói mà không đọc file, 11s; phiên `01a15863…`.
  4. Codex `exec resume` cùng phiên: nhắc đúng câu trả lời trước, 10s.
  5. Claude quay lại: biết Codex đã trả lời gì; ở chế độ sửa file tạo đúng `var/relay/console-write-claude.txt`; Codex chế độ sửa tạo đúng `console-write-codex.txt`. Đã xóa hai file thử. `git status` không có thay đổi ngoài code console.
- Sửa sau test: chat thường không có `RELAY_STATUS` bị ghi STOP → `expectMarker: false` cho console (thoát 0 + có câu trả lời = DONE); phiên mới yêu cầu trả lời bằng ngôn ngữ người dùng (Claude từng trả lời tiếng Anh); console báo rõ khi trùng cổng 4319. Phát hiện: dừng `npm run relay:console` bằng cách tắt vỏ npm có thể để sót tiến trình node; dùng Ctrl+C trong terminal.
- `npm.cmd run check`: 190/190 tests đạt.
- D-01: khảo sát chỉ đọc + file mồi synthetic, ghi tại docs/engineering/D01_CODEX_READ_BOUNDARY.md: máy là Windows 11 Home (không có Windows Sandbox); lệnh của model trong sandbox Codex chạy dưới tài khoản `CodexSandboxOffline`; `codex sandbox -- <lệnh>` thu được bằng chứng không qua model; `var/` đang kế thừa quyền đọc cho nhóm sandbox. Đã giao relay viết `ai -- probe-boundary codex`.

### 20/10/2026 — P2 / D-01 / E-14 bộ thu `enforced_boundary` cho Codex / DONE phần code; D-01 BLOCKED chờ người dùng
- Nguồn yêu cầu và quyết định áp dụng: nhiệm vụ relay "probe-boundary"; E-11, E-13, quyết định triển khai mới E-14 (DECISIONS); 06A §5.C.3, §10.B ca 11; D01_CODEX_READ_BOUNDARY.
- File đã sửa và hành vi đã có thật:
  - Mới `src/infrastructure/ai/gateway/probe-boundary.ts`: `probeBoundary` chạy `codex sandbox -c sandbox_mode=… [-c …] -- powershell -Command <đọc>` với cùng entrypoint, layout `<workspace>/<runId>/work`, env allowlist, CODEX_HOME, cấu hình sandbox lấy từ argv gateway (cờ không tái tạo được → INCONCLUSIVE). 8 ca: đối chứng, USERPROFILE, LOCALAPPDATA, CODEX_HOME (thư mục mồi riêng), `var/` (thư mục con tạm), AGENTS.md (chỉ đọc được/không), junction, `..`. Mồi nội dung ngẫu nhiên, chỉ nhận token trạng thái, dọn sau khi chạy. Báo cáo không ghi đè: version + SHA-256, whoami + nhóm, icacls, lệnh/kết quả/loại lỗi từng ca, gợi ý sửa theo danh tính sandbox. PASS mới xuất `file_scope_test` (`enforced_boundary`, ref = báo cáo; ánh xạ absolute_path/dotdot/symlink_junction, không nhận inherited_config/plugins_hooks). `boundaryReportIssues` kiểm báo cáo với evidence/profile/workspace.
  - `subscription-guard.ts`: observed thêm `enforcement_issues`; có ref nhưng chưa kiểm/lệch → `READ_BOUNDARY_UNVERIFIED` + `BOUNDARY_*`. `gateway.ts`: default observe đọc lại báo cáo (provider khác codex → `NO_COLLECTOR_FOR_PROVIDER`); permit mang `sandboxRoot`, `cli-adapters.ts` dùng nó. `isolation.ts` + `compose.ts`: gateway dùng `C:\se-runner\work` khi người dùng đã tạo. `cli-adapters.ts`: argv ứng viên Codex thêm `-c windows.sandbox="elevated"` (E-14, theo kết quả probe). `src/cli/ai.ts`: lệnh `probe-boundary codex`, `evidence <file> --boundary <báo cáo>` (từ chối báo cáo không PASS).
  - Test: `tests/integration/probe-boundary.test.ts` (11 ca), `tests/fixtures/fake-codex.mjs` thêm nhánh `sandbox` (không chạy lệnh, không đọc ngoài cwd ở chế độ contained); `p2-gateway`/`p2-e11` thêm `enforcement_issues: []`, cập nhật argv.
  - Tài liệu: D01_CODEX_READ_BOUNDARY (kết quả thật, bước người dùng, điểm cần quyết định), P2_ACCEPTANCE (bước 3b thay file-scope, mapping E-14), DECISIONS (E-14, D-01), IMPLEMENTATION_PLAN, README.
- Lệnh kiểm tra / kết quả / môi trường / giới hạn (Windows 11 Home, Node 22.18.0, npm 10.9.3, codex-cli 0.163.0-alpha.10.2):
  - Khảo sát nhỏ qua `npx.cmd tsx <script scratchpad>`: `codex sandbox --help` (có `-c`, `-C`, `-P`, không có cờ writable root riêng); với env/CODEX_HOME của gateway, `whoami` = `desktop-fvg9ibn\pc` (token người dùng), PowerShell trong sandbox ở ConstrainedLanguage (nên probe chỉ dùng cmdlet); `-c windows.sandbox="elevated"` → `CodexSandboxUsers`.
  - `npx.cmd vitest run tests/integration/probe-boundary.test.ts`: lần đầu 2 fail do kỳ vọng test sai (fixture không nhận đường dẫn script trong argv) → sửa kỳ vọng. `npm.cmd run check`: lint, typecheck, **200/200** (19 file), build đạt; sau E-14 chạy lại: **201/201**, build đạt.
  - Thật: `npm.cmd run ai -- probe-boundary codex --profile …\codex-main --workspace <scratchpad>\se-runner\work` khi workspace chưa có → dừng và in lệnh New-Item (không tạo). Sau khi tạo: argv cũ → **FAIL** (sandbox dưới tài khoản `pc`, cả 7 ca cấm đọc được), báo cáo `var/ai/probe-boundary-codex-2026-10-20T08-35-54-094Z.json`; argv E-14 → **FAIL** (`codexsandboxoffline`; chỉ USERPROFILE bị chặn UnauthorizedAccess; LOCALAPPDATA, CODEX_HOME, var, AGENTS.md, junction, `..` đọc được), báo cáo `…08-37-38-173Z.json`; thêm 1 lượt elevated qua script cùng kết quả (`probe-boundary-codex-elevated-1792485405165.json`). Không gọi model, không tốn quota; không còn thư mục `se-boundary-probe-*`. ACL: `%LOCALAPPDATA%` kế thừa `CodexSandboxUsers:(RX)`, `var/` kế thừa `CodexSandboxUsers:(M)` + `Authenticated Users:(M)`.
  - `npm.cmd run ai -- evidence var/ai/evidence.json --boundary <báo cáo FAIL>` → từ chối, exit 1, không ghi gì.
  - Giới hạn: giả định `codex exec` áp cùng sandbox Windows như `codex sandbox` với cùng CODEX_HOME/config (mục đích của lệnh này), chưa đối chiếu bằng một lượt `codex exec` thật; workspace thật `C:\se-runner\work` chưa có nên báo cáo thật không khớp gateway (BOUNDARY_WORKSPACE_MISMATCH); không đổi ACL; báo cáo có tên tài khoản/SID máy (nằm trong `var/`, đã gitignore). Không sửa `scripts/relay/` hay test relay. File `INSIDE-OK`, `SYNTHETIC-SECRET-1` ở root có từ trước lượt này, không đụng.
- Điểm còn thiếu, quyết định mới, bước tiếp theo: E-14 (đảo ngược được). Người dùng: tạo `C:\se-runner\work`; khóa ACL `var/`, `%LOCALAPPDATA%\study-english`, `C:\se-runner` theo D01; chốt repo/`%LOCALAPPDATA%`/inherited_config+plugins_hooks; probe lại tới PASS; chạy lại `verify` (argv đổi) rồi `evidence … --boundary …`. Sau đó mới QC4/QC2–3 thật.

### 20/10/2026 — P2 / D-01 / E-15 áp dụng cho gateway Codex và probe-boundary (E-16) / DONE phần code; D-01 BLOCKED chờ người dùng
- Nguồn yêu cầu và quyết định áp dụng: nhiệm vụ relay "áp dụng E-15"; E-13, E-14, E-15 (người dùng chốt), quyết định triển khai mới E-16; D01_CODEX_READ_BOUNDARY; 06A §5.C.3, §10.B ca 11.
- File đã sửa và hành vi đã có thật:
  1. **Repo được đọc (E-15.1):** `probe-boundary.ts` — `repo_agents` là ca `expected: info` (vẫn chạy và ghi kết quả, không làm FAIL); `var/` vẫn bắt buộc bị chặn; junction nay trỏ vào mồi trong `var/`. Báo cáo `schema_version: "2"` (v1 bị gateway từ chối).
  2. **Tắt công cụ (E-15.2):** `cli-adapters.ts` — `CODEX_DISABLED_FEATURES` (28 tên từ `codex features list` thật), `CODEX_CANDIDATE_ARGV` thêm `--disable` từng tên, `codexToolDisableIssues` (thiếu cờ / `--enable` / `-c features.*`). `gateway.ts` chặn argv Codex có vấn đề → `ISOLATION_TOOLS_NOT_DISABLED:…`. `probe-boundary.ts`: `sandboxConfigFromArgv` nhận/replay `--disable`, `inspectCodexTools` chạy `codex <--disable…> features list` và ghi trạng thái hiệu lực; `%LOCALAPPDATA%` chỉ là ca info khi `tools.ok`, ngược lại bắt buộc bị chặn. `verify-codex.ts` ghi `observations.tools` và nhắc trong pending khi chưa đủ. `boundaryReportIssues` so khớp danh sách `--disable`.
  3. **Căn cứ cấu hình (E-15.3):** `inspectCodexConfig` (CODEX_HOME: AGENTS*, .mcp.json, hooks.json, plugins/hooks, skills ngoài `.system`, khóa mục config.toml; tổ tiên cwd: AGENTS*, `.codex`, `.agents`; chỉ tên/khóa). `file_scope_test` thêm `config_cases` + `config_method: 'config_inspection'` (chỉ khi `tools.ok` và cấu hình sạch). `subscription-guard.ts`: `OS_BOUNDARY_CASES` trong `cases` + `CONFIG_INSPECTION_CASES` trong `config_cases`; ca cấu hình đặt trong `cases` không được tính. Gateway kiểm lại cấu hình trước mỗi lượt khi evidence có `config_cases` (`BOUNDARY_CONFIG_*`).
  - `src/cli/ai.ts`: in ca INFO/ghi chú, dòng Công cụ, dòng Cấu hình, kết luận ranh giới OS, config_cases khi nạp `--boundary`; verify in trạng thái công cụ.
  - Test: `probe-boundary.test.ts` 13 ca (thêm ma trận E-15 và kiểm cấu hình), `fake-codex.mjs` (`features list`, chế độ `*-pinned`, `open-repo-local`), `p2-gateway`/`p2-e11` cập nhật fixture evidence theo `config_cases`, thêm 2 ca guard và kiểm argv/tools của verify.
  - Tài liệu: D01_CODEX_READ_BOUNDARY (ma trận E-15, danh sách cờ, kết quả đo, bước người dùng theo thứ tự cuối, bỏ "Cần quyết định" đã chốt, thêm điểm chờ `unified_exec`), P2_ACCEPTANCE (3b, mapping E-15/E-16), DECISIONS (E-16, D-01).
- Lệnh kiểm tra / kết quả / môi trường / giới hạn (Windows 11 Home, Node 22.18.0, npm 10.9.3, codex-cli 0.163.0-alpha.10.2):
  - `npx.cmd tsx <scratchpad>/features.mjs check` (CODEX_HOME runner, không gọi model): `features list` exit 0; `codex exec --disable <tên> --help` exit 0 cho **mọi** tên, kể cả `no_such_feature_xyz` → không dùng để kiểm. `features2.mjs`: `codex --disable no_such_feature_xyz features list` → exit 1 `Unknown feature flag`; `exec --help`, `exec resume --help`, `sandbox --help` đều có `--disable`. `features3.mjs`: 27/28 tên thành `false`; `unified_exec` vẫn `true` với `--disable` và với `-c features.unified_exec=false`.
  - **Một lượt `codex exec` thật** (`exec-once.ts`, model gpt-6-astra, argv E-14 + 28 cờ, layout/env/CODEX_HOME như gateway, workspace tạm %TEMP%, prompt synthetic đọc `bait.txt`): exit 0, argv được chấp nhận, item `error` thông tin về Code Mode, trả `NO_TOOL`, không có `command_execution`, marker không lộ. Quan sát hành vi, không phải bằng chứng ranh giới.
  - `npx.cmd vitest run` 4 file liên quan: lần đầu 1 fail (fixture nhận diện mồi theo đường dẫn nên junction/`..` lọt) → sửa fixture nhận diện theo nội dung; chạy lại 13/13. `npm.cmd run typecheck` đạt.
  - `npm.cmd run check`: lint, typecheck, **203/203** (19 file), build đạt — chạy 2 lần (15:56:49 và 16:00:25 sau sửa gợi ý/tài liệu).
  - Thật: `npm.cmd run ai -- probe-boundary codex --profile …\codex-main --workspace <scratchpad>\se-runner\work` → exit 2, báo cáo `var/ai/probe-boundary-codex-2026-10-20T08-57-32-759Z.json`: sandbox `codexsandboxoffline`; đối chứng đọc được; USERPROFILE bị chặn; `%LOCALAPPDATA%` (bắt buộc vì unified_exec), CODEX_HOME, `var/`, junction→var, `..` đọc được; AGENTS.md INFO đọc được; Công cụ CHƯA ĐỦ (`unified_exec`); Cấu hình: `ANCESTOR_.codex:C:\Users\PC\.codex` (do workspace tạm dưới hồ sơ người dùng). **FAIL — đúng kỳ vọng khi chưa chạy icacls.** Không có `CLEANUP_INCOMPLETE`.
  - Không đổi ACL, không đọc/in credential (chỉ liệt kê tên mục CODEX_HOME; báo cáo trong `var/` đã gitignore), không dùng cờ bypass, không `codex sandbox uninstall`, không sửa `scripts/relay/` hay test relay/console, không commit/push.
- Điểm còn thiếu, quyết định mới, bước tiếp theo: E-16 (đảo ngược được). Chờ người dùng: (1) quyết định về `unified_exec` (đổi bản Codex / chấp nhận vì shell_tool đã tắt / Deny phần còn lại của `%LOCALAPPDATA%`); (2) tạo `C:\se-runner\work`; (3) icacls cho `var/`, `%LOCALAPPDATA%\study-english`, `C:\se-runner` (lệnh + hoàn tác trong D01); (4) probe tới PASS + công cụ đủ + cấu hình sạch; (5) verify lại; (6) `evidence … --boundary …`; (7) `consent codex approved grant`; (8) `status`. Envelope cần bỏ qua item `error` thông tin của Code Mode khi người dùng duyệt layout. Sau D-01 mới QC4/QC2–3 thật.

### 20/10/2026 — D-01 Codex: ranh giới đọc PASS (E-17) / P2 vẫn IN_PROGRESS
- Người dùng chốt E-17 (Deny cả `%LOCALAPPDATA%` cho `CodexSandboxUsers`, Allow lại `OpenAI\Codex`) và tự chạy icacls. Sandbox không khởi động được (CreateProcessWithLogonW 267) vì cwd dưới `C:\se-runner` bị Deny kế thừa.
- Code: `isolation.ts` (`grantSandboxGroupRead`, tùy chọn `grant` của `createRunSandbox`, xóa thư mục khi cấp quyền lỗi), nối vào `cli-adapters.ts`, `gateway.ts`, `verify-codex.ts`, `probe-boundary.ts` (chỉ Codex); `probe-boundary.ts` thêm `toolsAcceptable` (E-17) dùng cho cả báo cáo và gateway; test `tests/unit/run-sandbox-grant.test.ts`, `tests/unit/tools-acceptable.test.ts`, cập nhật 2 kỳ vọng E-15 cũ trong `tests/integration/probe-boundary.test.ts`.
- Kiểm tra: `npm.cmd run check` 210/210; probe thật `var/ai/probe-boundary-codex-2026-10-20T09-20-11-520Z.json` PASS đủ 5 ca, thư mục probe đã dọn. Không gọi model.
- Còn lại (người dùng): verify lại (tốn ~8 prompt), xác nhận gói/model trong evidence, nạp evidence với báo cáo trên, consent, status; sau đó QC thật để xét P2 DONE.

### 20/10/2026 — D-01 Codex: verify thật bị chặn bởi hạn mức ChatGPT
- Chạy `npm.cmd run ai -- verify codex --profile …codex-main --profile-id codex-main --model gpt-6-astra --out var/ai/evidence-2.json` (theo yêu cầu người dùng). Đăng nhập `chatgpt`; mọi lượt `codex exec` (synthetic, 5 probe, timeout, cancel) thất bại. Tái hiện 1 lượt với đúng argv/profile: `turn.failed` — "You’ve hit your usage limit … try again at 6:49 PM". Profile `codex-main` dùng chung tài khoản ChatGPT với Codex của relay/console nên chung hạn mức.
- Báo cáo đó sai lệch (INCONCLUSIVE/EXITED_BEFORE_STOP do quota) nên đã xóa `var/ai/evidence-2.json`.
- Code: `verify-codex.ts` thêm `codexLimitMessage`; verify dừng sớm `QUOTA_OR_RATE_LIMIT: …` thay vì ghi kết quả sai. Test `tests/unit/verify-codex-limit.test.ts` dùng đúng dòng sự kiện quan sát được. `npm.cmd run check` 212/212.
- Bước tiếp: chạy lại verify sau 18:49 ngày 20/10/2026 (giờ máy), rồi người dùng xác nhận gói/model trong evidence, nạp evidence với `var/ai/probe-boundary-codex-2026-10-20T09-20-11-520Z.json`, consent, status.

### 20/10/2026 — TOOL-01: quyền lệnh cho Antigravity (agy) chạy headless
- Lượt P3 đầu tiên bằng agy dừng sau 50s: ở chế độ `-p`, agy tự từ chối mọi `run_command` không có quy tắc cho phép ("a tool required the "command" permission that headless mode cannot prompt for"). Không dùng `--dangerously-skip-permissions`.
- Người dùng đồng ý thêm danh sách hẹp vào `~/.gemini/antigravity-cli/settings.json` (cấu hình máy, không nằm trong repo; bản cũ lưu ở `settings.json.bak-relay-20261020`).
- Quan sát trên agy 1.4.2 (Windows): `command(git status)` chỉ khớp đúng chuỗi `git status`; `command(git status *)` không có tác dụng; `command(regex:...)` có tác dụng. Quy tắc đang dùng: `npm(.cmd) run (check|lint|typecheck|test|build|spike)`, `npx(.cmd) (vitest|tsc)`, `git (status|diff|log|show)`, `node --version`; tham số chỉ gồm `[-\w./:=\\~^@]`. Đã thử thật: git status/log và `npm.cmd run typecheck` chạy được; `git push --dry-run` bị chặn.

### 20/10/2026 — P3-1…P3-3 Khung học trên web, Vòng Writing với FakeAdapter, Gợi mở theo nấc / IN_PROGRESS (hoàn tất mục 1–3 của P3)
- Ngày / mã công việc / trạng thái: 20/10/2026 — P3 (P3-1, P3-2, P3-3) — `IN_PROGRESS` (mục 1–3 DONE; còn P3-4 Reading/audio).
- Nguồn yêu cầu và quyết định áp dụng: IMPLEMENTATION_PLAN mục P3; đặc tả 01 (§1, §3, §4, Bước 1–9), 02 (§2–3, §5), 03 (§II Writing), 06 (§1, §2, §4.C, §5.B–C, §6); DECISIONS E-07, E-10, E-11 (Speaking chỉ dạng văn bản ở giai đoạn đầu), D-02 (chưa có policy ngưỡng năng lực/Band), D-05 (chỉ nội dung synthetic); quyết định triển khai mới E-18.
- File đã sửa và hành vi đã có thật:
  1. **P3-1 Khung học trên web:**
     - `migrations/0004_learning_p3.sql`: bảng `learner_goals`, `writing_diagnoses`, `writing_loop_states`, `error_hypotheses`, `scheduled_tasks` kèm trigger bất biến/append-only. Cập nhật kỳ vọng số migration (3 → 4) ở `tests/integration/p1-persistence.test.ts` và `p1-backup.test.ts`.
     - `src/server/app.ts`: bổ sung nhóm route `/api/learning/*` bảo vệ bằng session/CSRF (`GET/POST /goals`, `GET /today`, `POST /attempts`, `GET /attempts/:id`, `POST /attempts/:id/autosave`, `POST /attempts/:id/input-support`, `POST /attempts/:id/submit`, `POST /attempts/:id/hints/unlock`, `POST /attempts/:id/step5/action`, `POST /attempts/:id/step6/complete`, `POST /attempts/:id/start-7a`, `GET /progress`, `GET /settings`).
     - `src/web/learning.tsx`, `src/web/main.tsx`, `src/web/style.css`: 5 màn học tập theo 06 §2 (`Mục tiêu ban đầu`, `Học hôm nay`, `Workspace`, `Tiến độ`, `Cài đặt`) + giữ nguyên tab `Console kỹ thuật (P2)`. Workspace hỗ trợ 3 chế độ (`guided`, `self_practice`, `exam`), lưu nháp về server và hiển thị lỗi thật khi lưu thất bại (`500`/`403`), khôi phục đúng bản nháp và trạng thái sau khi tải lại. Màn Tiến độ chỉ hiển thị dữ liệu thật từ DB theo 4 thành phần năng lực, trạng thái `POLICY_NOT_APPROVED` và `band_reporting_enabled: false`.
  2. **P3-2 Một vòng Writing với FakeAdapter:**
     - `src/infrastructure/ai/fake-adapter.ts`: mở rộng `FakeQcScript` (`writingOutcome`, `repairOutcome`) và nhận diện marker `[SYNTHETIC_MET]` / `[SYNTHETIC_NOT_MET]` để kiểm thử deterministically các nhánh Bước 4–8 mà vẫn giữ mặc định `'inconclusive'` cho mọi test P0–P2.
     - `src/application/learning/writing-workflow.ts`: hiện thực `LearningWorkflowService` khép kín từ tạo attempt → autosave → hỗ trợ đầu vào (có kiểm tra `canAccessExplanation` chặn lộ ở `exam`) → nộp bài gốc (`submitForAssessment` + `FakeAdapter`) → chẩn đoán ưu tiên tối đa 1–2 lỗi trọng tâm → Bước 5 tự sửa → Bước 6 micro-lesson + concept check (nhánh cần củng cố sau 2 lượt chưa đạt, hỏi lại điểm chưa rõ, hoặc mở bài giải thích trực tiếp có gắn cờ giảm trọng số) → Bước 7A tạo attempt chuyển giao mới hoàn toàn sạch (`mode: 'self_practice'`, `purpose: '7A'`) → Bước 8 cập nhật có điều kiện giả thuyết lỗi (`HOLD` → `TENTATIVE` → `CONSOLIDATED` hoặc `RELAPSED`) và xếp lịch 7B (+1 ngày) / Bước 9 (+3 ngày) qua hàm `clock` có thể giả lập thời gian trong test → Bước 9 kiểm tra `Opportunity-to-Use` (`observed` / `absent` → `AWAITING_OPPORTUNITY`). Mọi nhận định từ `FakeAdapter` đều gắn `synthetic: true`, không nâng hồ sơ năng lực thật và trả `POLICY_NOT_APPROVED` ("chưa đủ kết luận") theo D-02.
  3. **P3-3 Gợi mở theo nấc:**
     - `src/domain/learning/scaffold-hints.ts`: hàm thuần `verifyHintDisclosurePolicy` (bắt buộc mở tuần tự nấc 1 → 2 → 3, chặn chế độ `exam` và trạng thái ngoài vòng tự sửa), `sliceUnlockedHints` (cắt phần tử ở server trước khi trả DTO) và `decideStep6Branch`.
     - Khi mở từng nấc qua `/hints/unlock`: tạo bản chụp `pre_assistance` trước nấc 1, ghi `assistance_events` idempotent theo khóa `(attempt_id, 'scaffold_hint_level_' + level)` (gọi lặp cùng nấc trả `idempotent: true`, không nhân bản dòng), và **không** tạo job chấm lại; chỉ khi nộp bản sửa mới qua `/submit` (`stage: 'repair'`) mới tạo revision + chạy `repair.assess`.
  4. **Test và tài liệu:**
     - `tests/integration/p3-learning.test.ts` (8 ca tích hợp kiểm tra đầu-cuối HTTP + SQLite + đồng hồ giả + kiểm tra rò rỉ HTTP payload ở mọi bước).
     - `docs/engineering/P3_ACCEPTANCE.md` (mapping yêu cầu → code → test), cập nhật `IMPLEMENTATION_PLAN.md`, `DECISIONS.md` (thêm E-18), `PROJECT_STRUCTURE.md`, `README.md`.
- Lệnh kiểm tra / kết quả / môi trường / giới hạn (Windows 11, Node 22.18.0, npm 10.9.3, chạy trong sandbox headless của agy):
  - `npm.cmd run lint`: exit 0 (0 lỗi).
  - `npm.cmd run typecheck`: exit 0 (0 lỗi).
  - `npx.cmd vitest run tests/integration/p3-learning.test.ts`: **8/8 tests đạt** (1 file).
  - `npx.cmd vitest run tests/contract tests/unit tests/spikes tests/integration/server.test.ts tests/integration/p1-persistence.test.ts tests/integration/p1-queue.test.ts tests/integration/p1-backup.test.ts tests/integration/p2-pipeline.test.ts tests/integration/p2-gateway.test.ts tests/integration/p2-console.test.ts tests/integration/p3-learning.test.ts`: **183/183 tests đạt** (20 file).
  - `npm.cmd run build`: exit 0 (`tsc -p tsconfig.build.json && vite build` đạt, bundle web `dist/web/`).
  - `npm.cmd run spike`: **6/6 tests đạt** (2 file).
  - Giới hạn môi trường sandbox agy khi chạy `npm.cmd run check` toàn bộ không lọc file: 3 file test của P2/TOOL-02 (`tests/integration/relay-console.test.ts`, `tests/integration/probe-boundary.test.ts`, và 1 ca junction trong `tests/integration/p2-e11.test.ts` — 12/13 ca còn lại của `p2-e11.test.ts` đạt) bị môi trường sandbox Windows của agy chặn tạo kết nối TCP loopback `127.0.0.1` hoặc chặn `mklink /J` / `powershell` lồng nhau (đúng giới hạn sandbox Windows đã ghi nhận ở E-13). Không có bất kỳ file nào thuộc P2/relay bị sửa trong lượt này.
- Điểm còn thiếu, quyết định mới, bước tiếp theo:
  - Quyết định mới: **E-18** trong `docs/engineering/DECISIONS.md` (bảng trạng thái vòng học `0004_learning_p3.sql`, cắt gợi mở ở server và marker script hóa `FakeAdapter`).
  - Còn thiếu để hoàn tất toàn bộ P3: P3-4 (Reading giải mù + kiểm tra dẫn chứng + audio mẫu nội bộ theo D-06), chạy với adapter thật sau khi đóng D-01, và chính sách ngưỡng năng lực/Band (D-02).

### 20/10/2026 — D-01 đóng cho Codex (gateway READY)
- Verify thật lúc 22:2x (sau khi hạn mức ChatGPT mở lại): đăng nhập `chatgpt`; lượt synthetic thoát 0, JSON đúng tại `item.text` của `agent_message` cuối; 5 probe phản hồi không lộ bí mật synthetic (vẫn chỉ là quan sát, không tính là ranh giới); timeout và cancel kết thúc cả cây 2 tiến trình. Báo cáo gốc giữ ở `var/ai/evidence-2.json`.
- Người dùng xác nhận trong chat: gói **ChatGPT Plus** có Codex CLI; model `gpt-6-astra`; đồng ý đánh dấu envelope VERIFIED và `plugins_disabled: true` (căn cứ: config_inspection sạch trong probe PASS). Bản đã duyệt: `var/ai/evidence-3.json` (thêm mẫu lỗi đã thấy thật `hit your usage limit` → QUOTA_EXHAUSTED).
- `npm.cmd run ai -- evidence var/ai/evidence-3.json --boundary var/ai/probe-boundary-codex-2026-10-20T09-20-11-520Z.json` → `codex: READY`; `consent codex approved grant` → 5 loại dữ liệu E-11, `learner_audio` luôn bị chặn; `status`: codex READY, extra usage xác nhận hạn tới 19/11/2026; claude-code và agy vẫn BLOCKED (chưa làm D-01).
- Còn lại của P2: chạy QC4/QC2–3 thật bằng Codex trên gói synthetic theo pipeline P2 rồi xét P2 DONE.

### 20/10/2026 — P3-1…P3-3 (relay, Antigravity) — kiểm lại độc lập
- agy làm xong P3-1 khung học, P3-2 vòng Writing với FakeAdapter, P3-3 gợi mở theo nấc (P3_ACCEPTANCE, E-18, migration 0004). Sandbox agy không chạy được test cần socket loopback/junction nên agy chỉ chạy 183 test; chạy lại đầy đủ ngoài sandbox: `npm.cmd run check` 217/217 đạt. 2 test P1 chỉ đổi số migration 3→4.

### 20/10/2026 — P2 DONE: QC thật bằng Codex trên gói synthetic
- Phát hiện trước khi chạy: adapter CLI chỉ gửi JSON dữ liệu, không có chỉ dẫn vai trò/định dạng kết quả — model thật sẽ không biết hợp đồng. Thêm `src/infrastructure/ai/task-instructions.ts`: chỉ dẫn cố định theo task_type + JSON Schema kết quả (cùng schema parser dùng) + khối DATA, gửi qua stdin; argv đã xác minh không đổi (không dùng `--output-schema` vì sẽ lệch bằng chứng D-01). `tests/fixtures/fake-cli.mjs` đọc dòng dữ liệu sau `DATA (`.
- Script `scripts/qc-real-synthetic.ts` (`npm.cmd run qc:real`): kho tạm `var/qc-real/<thời điểm>`, đọc evidence/consent/extra usage từ kho app; stage → freeze → QC1–3 deterministic → attest QC2/QC3 (AI lập trình, nội dung synthetic tự viết) → QC4 thật qua gateway → release → revoke.
- Kết quả thật (`var/qc-real/2026-10-20T15-48-56-154Z`): gateway codex READY; 3 job, mỗi job 1 lần chạy, `ai_runs.provider = codex`: giải mù q1 FALSE, q2 NOT GIVEN (khớp đáp án), đánh giá policy-1 `inconclusive` đúng kỳ vọng, đối chiếu `consistent`, không có đáp án cạnh tranh. QC1–QC4 PASS trên bundle `69b0b431…`; release cho phép (manifest ghi QC4 bằng AI); revoke → `suspended`, item không còn cấp phát (`REVOKED`).
- Phát hiện của Codex khi đối chiếu: phần giải thích q1 trong fixture synthetic ghi "paragraph two" trong khi dẫn chứng nằm ở câu thứ hai — lỗi nhỏ của nội dung synthetic, chưa sửa.
- `npm.cmd run check` 217/217.

### 20/10/2026 — P3-4 Reading trong luồng học + Audio mẫu cục bộ + Nghiệm thu P3 / DONE
- Ngày / mã công việc / trạng thái: 20/10/2026 — P3 (hoàn tất P3-4 và nghiệm thu P3-1…P3-4) — `DONE`.
- Nguồn yêu cầu và quyết định áp dụng: IMPLEMENTATION_PLAN P3 bước 4; đặc tả 03 (§2 Speaking/Listening, §3 Reading), 04 (§2 giải mù/đối chiếu, cắt quyền trước truy xuất), 05 (§5–7 QC1–4, phát hành, thu hồi), 06 (§2.3, §5.B kho media cục bộ, §6); DECISIONS E-07, E-08, E-10, E-11 (Speaking dạng văn bản + không gửi `learner_audio`), E-18, quyết định triển khai mới E-19; giữ mở D-02, D-05, D-06.
- File đã sửa và hành vi đã có thật (tiếp nối lượt Codex bị dừng vì QUOTA và hoàn tất kiểm thử + nghiệm thu):
  1. **Mục 1 — Reading trong luồng học:**
     - `migrations/0005_reading.sql`, `src/domain/learning/reading.ts`, `src/application/learning/reading-workflow.ts`, `src/server/app.ts` (`/api/learning/reading*`), `src/web/reading.tsx`, `scripts/seed-reading.ts`, `tests/fixtures/knowledge/reading-p3.ts`.
     - Chỉ cấp phát gói synthetic `active` có `release_manifest` đạt `QC4 PASS` và quyền `practice`; đáp án cạnh tranh chưa phân giải làm `QC4 FAIL` và bị chặn phát hành.
     - Đọc đề qua `scopedReader('blind_solver')` + `blindTaskView`; chấm câu hỏi bằng `scoreReading` theo key đã ghim (`key_hash`), chấp nhận đáp án cạnh tranh hợp lệ đã ghi nhận trước QC (`spring` / `in spring`), xử lý `NOT GIVEN` đúng nghĩa; `diagnostic_value` giữ `'inconclusive'`, `band_reporting_enabled: false`.
     - Trước khi nộp và ở Nấc 1–2, server không mở khối `answer_key` (`knowledge`) và HTTP payload (`Cache-Control: no-store`) không chứa đáp án/giải thích/mục tiêu đo; mở Nấc 3 ghi `assistance_events` và `exposure` (`answer` + `explanation`), chặn ở chế độ `exam`; thu hồi (`revoke`) chặn ngay việc mở lại, nộp hoặc tạo lượt mới.
  2. **Mục 2 — Audio mẫu cục bộ (D-06 vẫn mở, E-11):**
     - `migrations/0006_audio_samples.sql`, `src/application/learning/audio-workflow.ts`, `src/server/app.ts` (`/api/learning/audio*`), `src/web/audio.tsx`.
     - Kiểm tra magic bytes container (`audio/wav` RIFF/WAVE, `audio/webm`, `audio/ogg`, tối đa 8 MiB), lưu bản gốc (`original`) và bản thu lại (`retake`) vào kho media cục bộ (P1) có SHA-256, phát lại kèm `X-Content-Type-Options: nosniff` và `Cache-Control: no-store`.
     - Cổng `ASR` để trạng thái `{ status: 'unavailable', transcript: null }` (chưa chọn công cụ theo D-06). Các phiên bản transcript do người học tự nhập/chỉnh (`source = 'learner_entered'`) lưu bất biến theo `revision`, tách biệt với bản thu gốc.
     - Luồng nhận định Speaking dạng văn bản (`/review-text`) chỉ nạp văn bản vào `submitForAssessment` (`media_id = null`, `allowed_resource_ids = []`, `required_capabilities = ['text', 'structured_result']`), trả `SPEAKING_LIMITATION` ("Không có audio trực tiếp trong đánh giá… Không báo Band Speaking") và `band_reporting_enabled: false`; kết hợp `subscriptionGuard` chặn cứng `DATA_CLASS_NEVER_SENT_learner_audio`.
  3. **Mục 3 — Kiểm thử E2E/integration & Nghiệm thu P3:**
     - `tests/integration/p3-reading.test.ts` (4 ca: Reading blind HTTP + đáp án cạnh tranh + Not Given + gợi mở theo nấc + đóng/mở lại DB; exam + CSRF + revoke; đáp án cạnh tranh chưa phân giải chặn ở QC4; Audio mẫu cục bộ: từ chối file giả, lưu original/retake có SHA-256, phát lại nosniff, ASR unavailable, transcript tách biệt, không gửi `learner_audio` vào context/job AI + guard E-11 + đóng/mở lại DB).
     - Cập nhật `tests/integration/p1-persistence.test.ts` và `p1-backup.test.ts` (số migration 4 → 6).
     - Đồng bộ tài liệu nghiệm thu và kiến trúc: `docs/engineering/P3_ACCEPTANCE.md` (mapping đầy đủ P3-1…P3-4), `docs/engineering/DECISIONS.md` (thêm E-19), `docs/engineering/IMPLEMENTATION_PLAN.md`, `docs/engineering/PROJECT_STRUCTURE.md`, `README.md`.
- Lệnh kiểm tra / kết quả / môi trường / giới hạn (Windows 11, Node 22.18.0, npm 10.9.3, chạy trong sandbox headless của Antigravity):
  - `npm.cmd run lint`: exit 0 (0 lỗi).
  - `npm.cmd run typecheck`: exit 0 (0 lỗi).
  - `npx.cmd vitest run tests/integration/p3-reading.test.ts tests/integration/p3-learning.test.ts`: **9/9 tests đạt** (2 file: Reading + Audio 4/4, Writing + Khung học 5/5).
  - `npx.cmd vitest run tests/contract tests/unit tests/spikes tests/integration/server.test.ts tests/integration/p1-persistence.test.ts tests/integration/p1-queue.test.ts tests/integration/p1-backup.test.ts tests/integration/p2-pipeline.test.ts tests/integration/p2-gateway.test.ts tests/integration/p2-console.test.ts tests/integration/p3-learning.test.ts tests/integration/p3-reading.test.ts`: **187/187 tests đạt** (21 file).
  - `npm.cmd run build`: exit 0 (`tsc -p tsconfig.build.json && vite build` đạt).
  - Giới hạn môi trường sandbox: như đã ghi ở các lượt trước, 3 file test công cụ P2/TOOL-02 (`relay-console.test.ts`, `probe-boundary.test.ts` và 1 ca junction trong `p2-e11.test.ts` — 12/13 ca còn lại của `p2-e11.test.ts` đạt) cần socket TCP loopback hoặc `mklink /J` / `powershell` ngoài repo bị sandbox Windows của CLI chặn; không có bất kỳ file nào thuộc relay hay gateway D-01 bị sửa trong lượt này.
- Điểm còn thiếu, quyết định mới, bước tiếp theo:
  - Quyết định mới: **E-19** trong `docs/engineering/DECISIONS.md`.
  - Phụ thuộc người dùng vẫn giữ mở (đúng quy định không tự bịa ngưỡng/công cụ): D-02 (chính sách ngưỡng năng lực/Band), D-05 (gói nội dung thật & bộ đối chứng), D-06 (chọn công cụ ASR/TTS).
  - Bước tiếp theo: P4 (Chịu lỗi, adapter bổ sung, đối chứng).

### 20/10/2026 — P3-4 qua relay (Codex → Antigravity) — kiểm lại độc lập
- Relay `--order codex,agy` (không dùng Claude theo yêu cầu người dùng): Codex làm ~15 phút rồi hết hạn mức ("try again at Oct 21st, 2026 3:26 AM"), relay chuyển sang agy, agy báo DONE (Reading trong luồng học, audio mẫu cục bộ, nghiệm thu P3; migration 0005/0006, E-19).
- Kiểm lại ngoài sandbox: `npm.cmd run check` 222/222 (gồm test relay mới). Thay đổi nhạy cảm đã xem: `job-queue.ts` thêm lọc `jobId` tùy chọn khi claim; fixture synthetic chỉ thêm kiểu; `.gitignore` thêm `.tmp-p3/`.
- Sửa relay: `parseResetTime` đọc dạng ngày "at Oct 21st, 2026 3:26 AM" (trước đó rơi về cooldown mặc định 1 giờ → 00:14). Đã chỉnh `var/relay/state.json` của codex về 03:26 21/10/2026.
- Giới hạn: "E2E" của P3 là test HTTP tích hợp; chưa kiểm giao diện thật trên trình duyệt. P3 DONE trên nội dung synthetic; vận hành thật chờ D-02/D-05/D-06.

### 21/10/2026 — P4 phần độc lập qua relay (agy → Codex → agy) — kiểm lại độc lập
- Lượt agy đầu tiên bị ngắt lúc 00:11 21/10 khi phiên điều phối kết thúc; đã ghi một handoff thủ công (git status/diff) rồi `relay --continue --order codex,agy`. Codex làm từ 09:18, hết hạn mức 09:38 (mở lại 14:19); agy hoàn tất và báo DONE (ma trận 24 ca, failover bằng fixture, khiếu nại/tái đánh giá, cấu trúc bộ đối chứng D-05; migration 0007, E-20). P4 giữ IN_PROGRESS: D-01 claude-code/agy và D-05 còn mở.
- Rà gateway: provider dự phòng vẫn phải qua đủ guard D-01 và thêm cổng đối chứng D-05; REFUSAL không chuyển hãng.
- Sửa thêm (Claude): `recordRuntimeFailure` đặt tài khoản QUOTA_EXHAUSTED/COOLDOWN nhưng không có đường tự trở lại, và `recoverAccount` (đưa về NEEDS_VERIFICATION) không được nối vào đâu → sau một lần hết quota trong app, Codex bị chặn vĩnh viễn. Nay `account()` tự trở về READY khi qua `reset_at` (hoặc mặc định 60 phút quota / 5 phút rate limit), ghi sự kiện `RECOVERED` "auto: …"; NEEDS_LOGIN không tự mở. Thêm `npm run ai -- recover <provider>` cho trường hợp đăng nhập lại (về NEEDS_VERIFICATION, nạp lại evidence). Test mới trong `tests/integration/p4-failover.test.ts`.
- Kiểm tra: `npm.cmd run check` 242/242; `npm.cmd run ai -- status` trên kho thật (đã áp migration 0007): codex READY, claude-code/agy BLOCKED.

### 21/10/2026 — D-01 claude-code/agy (E-21): code qua relay + bước chuẩn bị + probe agy PASS
- Người dùng chốt E-21 sau khảo sát thật (Claude `--restricted --tools ""` → CLI báo tools/mcp rỗng; agy USERPROFILE riêng + deny → CLI từ chối read_file). Relay (agy) viết adapter/guard/probe/verify cho 2 provider, test CLI giả, tài liệu `docs/engineering/D01_CLAUDE_AGY.md`; dừng BLOCKED chờ người dùng. Guard đã rà: Codex vẫn chỉ nhận `enforced_boundary`; method sai provider → `BOUNDARY_METHOD_NOT_ALLOWED_FOR_…`.
- Claude làm thay các bước không cần người dùng: tạo `%LOCALAPPDATA%\study-english\runners\claude-main` và `agy-main`, tạo `agy-main\.gemini\antigravity-cli\settings.json` (5 quy tắc deny; profile riêng của app, không đụng cấu hình agy của relay), `ai -- account` cho claude-main/agy-main (NEEDS_VERIFICATION).
- Probe agy thật lần 1 INCONCLUSIVE: `-p` của agy nhận giá trị nên nuốt `--input-format` làm prompt; và định dạng stdin `{type:"user",…}` bị từ chối ("missing the \"event\" field"). Thử thật trên agy 1.4.3: đúng là `-p=` + `{"event":"user","message":{"content":…}}`. Đã sửa argv/formatter (cli-adapters, verify-codex), fake CLI và test.
- Probe agy thật lần 2 (`var/ai/probe-boundary-agy-2.json`): **PASS** — read_file trong/ngoài cwd đều bị CLI từ chối, không lộ mồi, cấu hình sạch. agy tự cập nhật 1.4.2 → 1.4.3 trong ngày (hash/version gắn vào báo cáo; cập nhật sau này sẽ làm báo cáo hết khớp).
- `npm.cmd run check` 248/248; `ai -- status`: codex READY, claude-code/agy BLOCKED (chưa có evidence).
- Còn lại (người dùng): đăng nhập Claude trong profile `claude-main`; xác nhận extra usage tắt cho claude-code và agy; sau đó probe claude, verify claude/agy, duyệt evidence, nạp, consent.

### 21/10/2026 — D-01 đóng cho claude-code và agy (cả 3 provider READY)
- Người dùng đăng nhập Claude trong profile `claude-main` (auth status: claude.ai, pro) và ghi `confirm-extra-usage` cho claude-code, agy (lần đầu chưa có tác dụng — kiểm lại thấy `loggedIn=False` và DB chưa có bản ghi; chạy lại thì đúng).
- `probe-boundary claude` thật (`var/ai/probe-boundary-claude-1.json`): PASS — init `tools=[]`, `mcp_servers=[]`, cấu hình sạch; Claude Code 2.1.304.
- Verify thật: agy (`var/ai/evidence-agy-1.json`) synthetic OK, timeout/cancel cây 2 tiến trình. Claude lần 1: timeout/cancel `EXITED_BEFORE_STOP` vì không có công cụ, prompt "wait/think" trả lời trong < 8s → sửa prompt tác vụ dài thành xuất 1..3000 (vẫn không cần công cụ) và chấp nhận cây 1 tiến trình khi CLI không sinh con (chỉ nhánh E-21, Codex giữ nguyên). Lần 2 (`evidence-claude-2.json`): timeout/cancel cây 2 tiến trình kết thúc.
- Người dùng cho phép đánh dấu VERIFIED; bản duyệt `evidence-claude-approved.json` (Claude Pro, claude-opus-5-5, mẫu lỗi AUTH đã thấy thật) và `evidence-agy-approved.json` (Google AI Ultra, gemini-4-argon-medium). Nạp kèm `--boundary` → `claude-code: READY`, `agy: READY`; consent 5 loại E-11 cho cả hai.
- `ai -- status`: codex, claude-code, agy đều READY; extra usage hạn 19/11 (codex), 20/11 (claude-code, agy). Provider dự phòng vẫn cần cổng đối chứng D-05 trước khi được chọn thay provider chính.
- Người dùng yêu cầu thêm: cho phép đổi model và verify mọi model của cả 3 nền tảng → giao relay (cần đổi code: bằng chứng hiện gắn cứng một model trong argv).
- `npm.cmd run check` 248/248.

### 21/10/2026 — E-22/E-23 qua relay + sửa migration 0008 bị chỉnh sau khi đã áp
- E-22 (Codex, sau khi lượt agy treo ~2 giờ ở phía máy chủ Gemini: một bước `agent_response` 7.138 giây): `ai -- models|model`, `verify --models`. E-23 (người dùng chốt mức A; Codex hết hạn mức sau 1 phút → agy làm): bỏ chặn theo phiên bản/SHA (chỉ còn thông tin), kiểm trong mỗi lần chạy (claude `init` tools/mcp rỗng; agy deny settings + không có tool chạy; codex `features list`), canary 1 prompt khi dùng model lần đầu theo phiên bản CLI, `ai -- allow-models`; chốt tiền giữ nguyên (đã rà diff guard: chỉ hai dòng chặn theo phiên bản bị bỏ, các kiểm tra khác được viết lại không mất).
- Sự cố: `0008_provider_model_preferences.sql` (tạo ở E-22) đã được áp vào DB thật lúc 14:41 khi chạy `ai -- status`; lượt E-23 sửa thẳng file này (thêm 3 bảng, đổi chú thích) → mọi lệnh `ai`/`backup` báo "Applied migration 8 was modified". Test không bắt được vì mỗi test dùng DB mới. Không khôi phục được đúng byte gốc từ log.
- Sửa: sao lưu online DB thật (`var/backups/pre-m8-repair-2026-10-21T08-41-57-357Z/study.db`, integrity ok); đối chiếu `sqlite_master` thấy bảng + trigger đã áp trùng khớp phần đầu của 0008; tách 0008 về đúng phần đó và chuyển 3 bảng mới sang `0009_runtime_canary.sql`; cập nhật checksum version 8 trong DB thật (13d524c3… → 77e2d7b0…, chỉ khi giá trị cũ khớp). Migration 9 tự áp khi mở DB. Test đổi số migration 8 → 9.
- Bài học: commit sớm sau khi migration mới được áp; tác vụ relay cấm sửa migration đã có.
- Kiểm tra: `npm.cmd run check` 265/265 (ngoài sandbox); `ai -- status`: codex, claude-code, agy đều READY (agy 1.4.4 khác bản verify 1.4.3 — chỉ thông tin).

### Mẫu cho lượt code tiếp theo
- 20/10/2026 — P3-4 mục 1 Reading: triển khai xong; kiểm tra toàn bộ PARTIAL do môi trường sandbox.
- Nguồn: 03 §3–4, 04 §2, 05 §5–7, IMPLEMENTATION_PLAN P3-4; D-02/D-05 vẫn mở.
- Code: migration 0005, `domain/learning/reading.ts`, `application/learning/reading-workflow.ts`, routes `/api/learning/reading`, `web/reading.tsx`, `scripts/seed-reading.ts`, fixture `reading-p3.ts`. Chỉ cấp bản synthetic active có manifest QC4 PASS/practice; dùng scoped-reader/blindTaskView; accepted alternatives được đưa vào key trước QC, cạnh tranh chưa phân giải bị P2 chặn. Gốc/sửa cùng evidence source; đúng câu không xác nhận năng lực hay lý giải tự sửa. Nấc 1–2 không có key, nấc 3 ghi assistance/exposure; exam chặn; revoke chặn cả đọc lại/nộp/retry; HTTP no-store.
- Lệnh thực tế: `npm.cmd run check` lần 1 dừng typecheck (kiểu fixture `never[]`, đã sửa); lần 2 lint/typecheck đạt, 180/220 tests đạt, 40 lỗi chủ yếu EPERM lstat AppData của TEMP. Đổi TEMP/TMP chỉ cho tiến trình test sang `C:\Code\study-english\.tmp-p3` (gitignored, không thay quyền/sandbox): check đạt lint/typecheck, 199/220 tests; 21 lỗi ở p2-gateway/p2-e11/probe-boundary do fixture profile nằm trong repo nên guard `RUNNER_DIR_INSIDE_REPO` chặn đúng. Không sửa các guard hoặc test được bảo vệ.
- `npx.cmd vitest run tests/integration/p3-reading.test.ts tests/integration/p3-learning.test.ts` với TEMP trên: 8/8 đạt (Reading 3, Writing 5); `npm.cmd run build` đạt. Chưa tuyên bố full check PASS. Tiếp tục phần audio độc lập; cổng full check cần môi trường TEMP được phép đọc ngoài repo.

- Ngày / mã công việc / trạng thái:
- Nguồn yêu cầu và quyết định áp dụng:
- File đã sửa và hành vi đã có thật:
- Lệnh kiểm tra / kết quả / môi trường / giới hạn:
- Điểm còn thiếu, quyết định mới, bước tiếp theo:

### 21/10/2026 — P4-1 ma trận ca bắt buộc / PARTIAL kiểm thử môi trường
- Nguồn: 04 §6.C, 06 §6.A.4, 06A §10.B; đọc thay đổi dở từ lượt agy, giữ nguyên phần nền.
- Thêm P4_ACCEPTANCE (24 dòng mapping), selectFallback kiểm 5 điều kiện, ReplanRepository kiểm CAS proposal, p4-resilience.test.ts (signal riêng từng đoạn, fallback, stale/expired/idempotent proposal). Planner đầy đủ vẫn thuộc P5; không đặt policy D-02.
- `npm.cmd run check`: lint/typecheck đạt; 184/225 tests đạt, 41 lỗi (EPERM lstat AppData và probe fixture bị sandbox chặn); build chưa chạy vì test dừng chuỗi. Không đổi quyền hay cờ sandbox.
- `npx.cmd vitest run tests/integration/p4-resilience.test.ts` với TEMP/TMP trỏ `.tmp-p3` trong workspace: 3/3 đạt. Full check lần 2 với TEMP này ghi `.tmp-p3/p4-step1-check.log`; guard chặn fixture profile nằm trong repo đúng thiết kế, chưa thể ghi full PASS.
- Tiếp tục phần độc lập mục 2; các ô chưa có failover test được ghi rõ, chưa nghiệm thu P4 toàn phần.

### 21/10/2026 — P4-2 failover fixture / triển khai, kiểm thử toàn bộ PARTIAL
- GatewayAdapter ghi provider/CLI/model thực tế, theo dõi quota/rate/auth, router chỉ chọn dự phòng khi qua D-01 và cổng benchmark mặc định đóng. Compose ghi quota_events bền vững; worker/queue giữ chung budget 3 và fencing.
- `npm.cmd run check` với TEMP/TMP `.tmp-p3`: lint/typecheck đạt; 209/231 tests đạt. 6/6 ca p4-failover đạt (CLI Node giả, seam evidence D-01 synthetic, không xác minh agy thật). 21 lỗi profile-in-repo của bộ P2 như mục 1; thêm 1 lỗi backup đang kiểm lại. Log `.tmp-p3/p4-step2-check.log`; chưa full PASS.
- Không gọi provider thật, không đổi quyền nhận dữ liệu, không sửa relay/console. D-01/D-05 vẫn chặn provider dự phòng thật. Tiếp theo: khiếu nại/tái đánh giá và truy vết hồ sơ.

### 21/10/2026 — P4-3 khiếu nại/tái đánh giá/thu hồi hai chiều
- Thêm ComplaintService, POST /api/learning/complaints (session/CSRF), nút yêu cầu xem xét lại ở Tiến độ; worker --complaints chỉ claim job khiếu nại learner. Reason giữ riêng, context tái đánh giá nhắm competency gốc, không đưa outcome cũ vào model.
- Queue kiểm supersedes cùng submission/source/competency, cấm thay thế lại bản đã superseded; commit mới giữ bản cũ, cập nhật complaint trong cùng transaction. Review để mở cho phân loại sự cố, không giả xác nhận thủ công.
- Hồ sơ P3 loại nhận định từ item/package không còn cấp phát, cả đạt/chưa đạt; hiển thị needs_recheck. Nền revoke/cache/impactOf P2 dùng lại.
- `npx.cmd vitest run tests/integration/p4-complaints.test.ts` TEMP workspace: 3/3 đạt. Kiểm lại `p4-failover.test.ts p1-backup.test.ts`: 12/12 đạt; lỗi rename backup trong full check mục 2 không tái hiện.
- `npm.cmd run check` mục 3 đang ghi `.tmp-p3/p4-step3-check.log`; kết quả tổng hợp bổ sung cuối lượt, không ghi PASS trước khi xong. Chưa kiểm UI bằng browser.

### 21/10/2026 — P4 phần độc lập (mục 1–4) hoàn tất nghiệm thu (tiếp nối Codex → Antigravity)
- Ngày / mã công việc / trạng thái: 21/10/2026 — P4 phần độc lập (mục 1–4) — `DONE` phần độc lập; P4 toàn phần giữ `IN_PROGRESS` (còn chờ D-01 cho `claude-code`/`agy` và bộ đối chứng có nguồn/quyền D-05).
- Nguồn yêu cầu và quyết định áp dụng: IMPLEMENTATION_PLAN P4; đặc tả 04 (§6.B–C), 05 (§7.A, §8.D), 06 (§5.B.5, §6.A.4), 06A (§3.B.7, §6.B, §9.B.3, §10.B — 12 ca); DECISIONS E-07…E-20, D-01 (Codex READY; claude-code/agy mở), D-02, D-05, D-06.
- File đã sửa và hành vi đã có thật (kiểm chứng và hoàn tất bàn giao cho cả 4 mục):
  1. **Mục 1 — Ma trận ca bắt buộc (`docs/engineering/P4_ACCEPTANCE.md`):**
     - Lập bảng 24 dòng ánh xạ toàn bộ 6 ca 04 §6.C, 6 tình huống 06 §6.A.4 và 12 ca 06A §10.B sang đường dẫn test thực tế và ghi rõ các giới hạn chờ D-01 / D-02 / D-05 / D-06.
     - Thêm `src/domain/scheduling/fallback.ts` (`selectFallback` kiểm đủ 5 điều kiện tương thích khi QC lỗi/timeout), `src/infrastructure/sqlite/replan-repository.ts` (cổng compare-and-set cho proposal lịch), và `tests/integration/p4-resilience.test.ts` (4 ca: 06A-10 stale/expired/idempotent proposal, 04-C5 fallback 5 điều kiện, 04-C1 giới hạn riêng đoạn nhiễu, 04-C2 mất snapshot trước hỗ trợ).
  2. **Mục 2 — Failover đa nhà cung cấp bằng fixture (`tests/integration/p4-failover.test.ts`):**
     - `src/infrastructure/ai/gateway/gateway.ts`, `compose.ts`, `src/infrastructure/sqlite/ai-accounts-repository.ts`, `src/domain/jobs/budget.ts`, `src/worker/worker.ts`, `tests/fixtures/p4-cli.mjs`.
     - Chọn provider dự phòng khi provider chính trả `QUOTA_EXHAUSTED` / `RATE_LIMIT` / `AUTH_EXPIRED` (bằng CLI giả Node, không đốt hạn mức thật); chặn tuyệt đối provider chưa đủ D-01 hoặc thiếu báo cáo đối chứng D-05; không chuyển hãng khi `REFUSAL` (`NEEDS_REVIEW`); giữ nguyên 1 `evidence_source`, không vượt ngân sách 3 lần thực thi (`WAITING_QUOTA`), chặn kết quả muộn của lượt cũ bằng fencing token; giữ nguyên lịch sử gợi mở đã hiển thị và không gửi gợi ý tương lai.
  3. **Mục 3 — Khiếu nại, tái đánh giá, thu hồi hai chiều (`tests/integration/p4-complaints.test.ts`):**
     - `src/application/learning/complaints.ts`, `src/infrastructure/sqlite/job-queue.ts`, `src/application/learning/writing-workflow.ts`, `src/server/app.ts` (`POST /api/learning/complaints`), `src/web/learning.tsx`, `src/worker/main.ts` (`--complaints`).
     - Khiếu nại tạo job tái đánh giá mới gắn cùng `submission_id` và `evidence_source_id` (không tạo nguồn độc lập mới, không đưa outcome cũ hay lời khiếu nại vào context model); kết quả mới ghi `supersedes_id` thay thế có truy vết và giữ nguyên bản cũ; hỗ trợ tái đánh giá khi sửa rubric (`04-C4`) với pin mới mà không sửa attempt gốc. Thu hồi nội dung (`revoke`) lan truyền hai chiều tới cả nhận định `met` và `not_met` trên hồ sơ năng lực (`needs_recheck`), giữ nguyên lịch sử và mở `review_items`, ngừng cấp phát qua cache.
  4. **Mục 4 — Bộ đối chứng D-05 (`tests/integration/p4-benchmark.test.ts`):**
     - `contracts/benchmark.v1.schema.json`, `src/domain/knowledge/benchmark-suite.ts`, `src/infrastructure/contracts/validate.ts`, `src/infrastructure/sqlite/ai-accounts-repository.ts`, `migrations/0007_p4_resilience.sql`.
     - Kiểm tra schema và bất biến của `benchmark_suites` / `benchmark_run_reports`: bắt buộc `usage_rights: 'verified'`, tách `dev` và `holdout` (chặn rò rỉ item holdout sang dev), đủ 3 nhóm holdout bắt buộc; cổng `canEnableBackupProvider` chặn mặc định khi thiếu đối chứng `sourced` khớp `(provider, cli_version, model, suite_hash)` và luôn đặt `scoring_quality_claimed: false` trên dữ liệu synthetic.
  5. **Đồng bộ tài liệu & kiểm thử hồi quy:** cập nhật `tests/integration/p1-persistence.test.ts`, `p1-backup.test.ts` (7 migrations), `README.md`, `docs/README.vi.md`, `docs/engineering/{P4_ACCEPTANCE,DECISIONS,IMPLEMENTATION_PLAN,PROJECT_STRUCTURE}.md`.
- Lệnh kiểm tra / kết quả / môi trường / giới hạn (Windows 11, Node 22.18.0, npm 10.9.3, chạy trong sandbox headless của Antigravity):
  - `npm.cmd run lint`: exit 0 (0 lỗi).
  - `npm.cmd run typecheck`: exit 0 (0 lỗi).
  - `npx.cmd vitest run tests/integration/p4-resilience.test.ts tests/integration/p4-failover.test.ts tests/integration/p4-complaints.test.ts tests/integration/p4-benchmark.test.ts`: **19/19 tests đạt** (4 file P4: resilience 4, failover 9, complaints 4, benchmark 2).
  - `npx.cmd vitest run tests/contract tests/unit tests/spikes tests/integration/server.test.ts tests/integration/p1-persistence.test.ts tests/integration/p1-queue.test.ts tests/integration/p1-backup.test.ts tests/integration/p2-pipeline.test.ts tests/integration/p2-gateway.test.ts tests/integration/p2-console.test.ts tests/integration/p3-learning.test.ts tests/integration/p3-reading.test.ts tests/integration/p4-resilience.test.ts tests/integration/p4-failover.test.ts tests/integration/p4-complaints.test.ts tests/integration/p4-benchmark.test.ts`: **207/207 tests đạt** (25 file).
  - `npm.cmd run build`: exit 0 (`tsc -p tsconfig.build.json && vite build` đạt).
  - Giới hạn môi trường sandbox: như các lượt trước, 3 file test công cụ P2/TOOL-02 (`relay-console.test.ts`, `probe-boundary.test.ts`, và 1 ca junction trong `p2-e11.test.ts`) cần socket TCP loopback hoặc `mklink /J` / `powershell` ngoài repo bị sandbox Windows của CLI chặn; không có bất kỳ file nào thuộc `scripts/relay/` hay test relay/console bị sửa. Không gọi AI thật, không đọc credential.
- Điểm còn thiếu, quyết định mới, bước tiếp theo:
  - Quyết định mới: **E-20** trong `docs/engineering/DECISIONS.md`.
  - Phần phụ thuộc người dùng / vận hành thật vẫn mở đúng quy định: **D-01** cho `claude-code` và `agy` (vẫn tắt và được báo trong `P4_ACCEPTANCE.md`), **D-05** (bộ đối chứng có nguồn/quyền thật trước khi bật provider dự phòng thật và báo điểm Band), **D-02** (bảng policy ngưỡng năng lực/Band), **D-06** (công cụ ASR/TTS local).
  - Bước tiếp theo: P5 (Mở rộng kỹ năng/dạng bài, FTS/BM25 theo quyền, daily tracking/replan đầy đủ, retention/export) hoặc đóng D-01/D-05 khi người dùng cung cấp bằng chứng và gói nội dung thật.

### 21/10/2026 — D-01 cho claude-code và agy theo E-21 (code + công cụ thu bằng chứng) / DONE phần code; BLOCKED chờ người dùng chạy xác minh thật
- Ngày / mã công việc / trạng thái: 21/10/2026 — P4 / R-07 / D-01 (`claude-code`, `agy` theo E-21) — `DONE` phần code, test CLI giả và tài liệu; `BLOCKED` phần đóng D-01 thật (chờ người dùng đăng nhập profile riêng và chạy `probe-boundary`/`verify` thật).
- Nguồn yêu cầu và quyết định áp dụng: DECISIONS E-09, E-11…E-17, E-20, **E-21** (người dùng chốt ngày 21/10/2026); `docs/engineering/D01_CODEX_READ_BOUNDARY.md`, `docs/engineering/P2_ACCEPTANCE.md`, `docs/engineering/P4_ACCEPTANCE.md`; giữ nguyên tuyệt đối argv, cơ chế `enforced_boundary` và bằng chứng của `codex` (READY).
- File đã sửa và hành vi đã có thật:
  1. **Adapter + guard theo E-21 (`src/application/ai/subscription-guard.ts`, `src/infrastructure/ai/gateway/{cli-adapters,isolation,envelope,gateway}.ts`):**
     - `CLAUDE_CANDIDATE_ARGV`: `['-p', '--output-format', 'stream-json', '--verbose', '--restricted', '--tools', '', '--strict-mcp-config', '--no-session-persistence', '--model', 'claude-opus-5-5', '--effort', 'medium']` (model đề xuất, người dùng xác nhận khi verify); kiểm tra argv qua `claudeArgvIssues`; dữ liệu qua stdin; cô lập profile qua `CLAUDE_CONFIG_DIR`; envelope `ndjson` lấy `event_type_field: 'type'`, `final_event_type: 'result'`, `text_path: ['result']`, `error_flag_path: ['is_error']`.
     - `AGY_CANDIDATE_ARGV`: `['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--sandbox', '--mode', 'plan', '--model', 'gemini-4-argon-medium']` (model đề xuất, người dùng xác nhận khi verify); kiểm tra argv qua `agyArgvIssues`; dữ liệu qua stdin định dạng một dòng NDJSON `formatAgyStreamInput(text)`; cô lập profile qua `USERPROFILE` + `HOME` trỏ vào thư mục profile (`profileEnvFor`); envelope `ndjson` lấy `event_type_field: 'event'`, `final_event_type: 'result'`, `text_path: ['result', 'response']`, `error_flag_path: ['result', 'status']`, `error_flag_not_equals: 'SUCCESS'`.
     - `subscriptionGuard` ánh xạ cứng `PROVIDER_BOUNDARY_METHODS`: `codex` chỉ chấp nhận `enforced_boundary`, `claude-code` chỉ chấp nhận `cli_tools_disabled`, `agy` chỉ chấp nhận `cli_permission_deny` (sai method bị chặn `READ_BOUNDARY_UNVERIFIED` + `BOUNDARY_METHOD_NOT_ALLOWED_FOR_<provider>:<method>`), bắt buộc `enforcement_evidence_ref` không rỗng, đủ 3 ca `OS_BOUNDARY_CASES` + 2 ca `CONFIG_INSPECTION_CASES`, và gateway đối chiếu lại báo cáo probe + kiểm tra cấu hình sống trước mỗi lượt chạy (gồm khớp đúng argv thực thi với argv trong báo cáo probe/evidence).
  2. **Công cụ `npm run ai -- probe-boundary claude|agy --profile <dir>` (`src/infrastructure/ai/gateway/probe-boundary.ts`, `src/cli/ai.ts`):**
     - `probeClaudeBoundary`: chạy 1 prompt ngắn qua stdin với `CLAUDE_CANDIDATE_ARGV` để đọc sự kiện `system/init`; ghi báo cáo JSON không ghi đè (`kind: 'claude_boundary_probe'`, `schema_version: '2'`) gồm version + SHA-256 entrypoint, argv, `init_observation` (`tools`, `mcp_servers`, `plugins`), `rate_limit_observation`, `config_inspection` (`inspectClaudeConfig` kiểm `CLAUDE_CONFIG_DIR` và tổ tiên workspace không có `CLAUDE.md`/`AGENTS.md`/`.claude`/`.mcp.json`); chỉ `PASS` và xuất `file_scope_test` (`method: 'cli_tools_disabled'`) khi `tools: []`, `mcp_servers: []` và `config_inspection.clean`.
     - `probeAgyBoundary`: kiểm tra `<profile>\.gemini\antigravity-cli\settings.json` có đủ 5 quy tắc `permissions.deny` (`command(*)`, `read_file(*)`, `write_file(*)`, `read_url(*)`, `mcp(*)`) — **không tự tạo hoặc ghi đè** settings của profile người dùng; nếu thiếu/sai thì báo hướng dẫn và kết luận `FAIL` ngay mà không gọi model; khi settings hợp lệ, tạo mồi ngẫu nhiên trong cwd và ngoài cwd (`var/`), chạy 2 lượt đọc mồi qua `--input-format stream-json`, kiểm tra CLI trả `permission check failed` và không lộ mồi, dọn mồi ở `finally`, xuất `file_scope_test` (`method: 'cli_permission_deny'`) khi đạt.
  3. **Công cụ `npm run ai -- verify claude|agy --profile <dir>` (`src/infrastructure/ai/gateway/verify-codex.ts`, `src/cli/ai.ts`):**
     - `verifyClaudeOrAgy`: kiểm tra xác nhận extra usage còn hạn, version + SHA-256 entrypoint native, trạng thái đăng nhập (`claude auth status` kiểm `loggedIn && authMethod === 'claude.ai'`; `agy models` kiểm danh sách model), 1 lượt synthetic quan sát envelope (`is_verified: false` chờ người dùng duyệt), kiểm tra timeout + cancel kết thúc cả cây tiến trình (`root + child`), phát hiện sớm hạn mức/rate limit (`claudeLimitMessage` gồm `rate_limit_event` bị từ chối, `agyLimitMessage`) và dừng ngay. Không tự đặt `VERIFIED`, `extra_usage_disabled: true` hay `subscription_tier`.
     - `npm run ai -- evidence <file> --boundary <báo cáo>` chấp nhận báo cáo `PASS` đúng `kind` và `method` của từng hãng (`codex` / `claude-code` / `agy`).
  4. **Kiểm thử bằng CLI giả (`tests/fixtures/fake-e21-cli.mjs`, `tests/integration/e21-claude-agy.test.ts`):**
     - 6 bộ test tích hợp bao phủ toàn bộ các nhánh yêu cầu: (1) `claude-code` `tools` không rỗng → `FAIL`; (2) `claude-code` `mcp_servers` không rỗng → `FAIL`; (3) `claude-code` `PASS` (`cli_tools_disabled`) + `verifyClaudeOrAgy` + gateway chạy qua `--restricted --tools ""` khi gắn kèm báo cáo đối chứng D-05; (4) `agy` thiếu quy tắc `permissions.deny` → `FAIL` (không tự ghi đè file); (5) `agy` đọc được mồi → `FAIL`; (6) `agy` `PASS` (`cli_permission_deny`) + `verifyClaudeOrAgy` + `subscriptionGuard` từ chối chéo method giữa `codex` / `claude-code` / `agy`. Không chạy probe/verify thật trong lượt này.
  5. **Tài liệu:**
     - Thêm `docs/engineering/D01_CLAUDE_AGY.md` với đầy đủ các bước người dùng theo đúng thứ tự (`claude-main`, `agy-main`, đăng nhập Claude trong profile riêng, tạo `settings.json` cho agy, `account`, `confirm-extra-usage`, `probe-boundary`, `verify`, duyệt JSON, `evidence --boundary`, `consent`, `status`).
     - Đồng bộ `docs/engineering/P4_ACCEPTANCE.md`, `docs/engineering/DECISIONS.md`, `docs/engineering/IMPLEMENTATION_PLAN.md`, `docs/engineering/PROJECT_STRUCTURE.md`, `README.md`, `docs/README.vi.md`.
- Lệnh kiểm tra / kết quả / môi trường / giới hạn (Windows 11, Node 22.18.0, npm 10.9.3, chạy trong sandbox headless của Antigravity):
  - `npm.cmd run lint`: exit 0 (0 lỗi).
  - `npm.cmd run typecheck`: exit 0 (0 lỗi).
  - `npx.cmd vitest run tests/integration/e21-claude-agy.test.ts tests/integration/p4-failover.test.ts tests/integration/p2-gateway.test.ts tests/unit/file-scope-evidence.test.ts`: **40/40 tests đạt** (4 file, trong đó `e21-claude-agy.test.ts` 6/6 đạt).
  - `npx.cmd vitest run tests/contract tests/unit tests/spikes tests/integration/server.test.ts tests/integration/p1-persistence.test.ts tests/integration/p1-queue.test.ts tests/integration/p1-backup.test.ts tests/integration/p2-pipeline.test.ts tests/integration/p2-gateway.test.ts tests/integration/p2-console.test.ts tests/integration/p3-learning.test.ts tests/integration/p3-reading.test.ts tests/integration/p4-resilience.test.ts tests/integration/p4-failover.test.ts tests/integration/p4-complaints.test.ts tests/integration/p4-benchmark.test.ts tests/integration/e21-claude-agy.test.ts`: **214/214 tests đạt** (26 file).
  - `npm.cmd run build`: exit 0 (`tsc -p tsconfig.build.json && vite build` đạt).
  - `git diff -- scripts/relay tests/unit/relay.test.ts`: rỗng (không chạm vào relay hay `~/.gemini/antigravity-cli/settings.json`).
  - Giới hạn: theo đúng yêu cầu nhiệm vụ, chưa chạy `probe-boundary` hay `verify` thật trên CLI `claude`/`agy` (chờ người dùng tạo profile riêng và đăng nhập); trong sandbox Windows của agy, 3 file test cũ cần TCP loopback/junction (`relay-console.test.ts`, `probe-boundary.test.ts` của Codex, và 1 ca junction trong `p2-e11.test.ts`) vẫn chịu giới hạn EPERM/loopback của OS sandbox như các lượt trước.
- Điểm còn thiếu, quyết định mới, bước tiếp theo:
  - Người dùng thực hiện các bước đóng D-01 thật cho `claude-code` và `agy` theo hướng dẫn tại [D01_CLAUDE_AGY.md](docs/engineering/D01_CLAUDE_AGY.md) (tạo profile `claude-main` & `agy-main`, đăng nhập Claude trong profile riêng, tạo `settings.json` deny cho `agy-main`, chạy `account`, `confirm-extra-usage`, `probe-boundary`, `verify`, duyệt `evidence.json`, nạp `evidence --boundary`, cấp `consent` và kiểm tra `status`). Sau D-01, để router tự động chuyển sang provider dự phòng trong vận hành thật vẫn cần báo cáo đối chứng `sourced` theo D-05.


### 21/10/2026 — R-07 / E-22: chọn model và verify nhiều model / DONE code + fixture
- Nguồn: yêu cầu relay 21/10/2026 cho cả codex/claude-code/agy; 06A §5/§8/§10, E-11…E-21 và quyết định E-22 mới. Tiếp nối phần dở, giữ thay đổi E-21. Không sửa scripts/relay/, không commit/push, không gọi inference thật, không đọc credential, không nạp/sửa evidence/probe hay DB thật.
- File và hành vi:
  - src/cli/ai.ts nối models, model, verify --models cho cả ba provider; kiểm cú pháp, xác nhận extra usage, in trạng thái từng model. Dùng CLI quản trị theo phương án người dùng cho phép, chưa thêm UI Settings.
  - cli-adapters/gateway/subscription-guard/compose, ai-accounts-repository và migration 0008: lưu mặc định từng provider; permit chỉ cấp cho model trong models_allowed và cặp model/effort trong model_configurations. Evidence cũ giữ effort trong argv cũ. Sai trả MODEL_NOT_VERIFIED. Mẫu argv giữ mọi token khác; từ chối duplicate/giá trị chèn cấu hình.
  - probe-boundary: so mẫu cho cả ba; Codex bỏ riêng reasoning effort khi so config_overrides cũ. Giữ kiểm SHA/version/profile/workspace/config sống/deny. E-22 giải thích boundary độc lập model và ngoại lệ cần probe lại.
  - verify-codex: synthetic tuần tự; chỉ thành công vào models_allowed/model_configurations. Kiểm final event thành công, JSON nonce/schema và envelope thống nhất. Claude tools/MCP khác rỗng → BOUNDARY_REPROBE_REQUIRED. Timeout/cancel chung; quota dừng ngay, ghi cả thất bại trước đó và model chưa chạy; abort không cấp evidence dùng được.
  - tests/integration/e22-models.test.ts + fake-codex/fake-e21-cli: whitelist model/effort, cờ an toàn, permit mặc định, probe Codex khác effort, từng model thành công/thất bại, quota giữa chừng, liệt kê không prompt, lưu preference, Claude đổi tools. P1 persistence/backup cập nhật 8 migrations. Cache .tmp-e22/ được gitignore.
  - Đồng bộ DECISIONS, hai hướng dẫn D-01, README Anh/Việt, PROJECT_STRUCTURE, IMPLEMENTATION_PLAN, P4_ACCEPTANCE.
- Lệnh/kết quả thật (Windows):
  - npm.cmd run check, TEMP mặc định: lint/typecheck đạt; 206/248 test đạt, 42 lỗi chủ yếu EPERM lstat AppData, probe/junction và kỳ vọng migration cũ. Không full PASS.
  - npm.cmd run check, TEMP/TMP .tmp-p3: lint/typecheck đạt; 231/258 đạt, 27 lỗi fixtures profile-in-repo và danh sách migration cũ (đã sửa sau đó). Log .tmp-p3/e22-check.log.
  - `npx.cmd vitest run --exclude tests/integration/p2-e11.test.ts --exclude tests/integration/e21-claude-agy.test.ts --exclude tests/integration/probe-boundary.test.ts --exclude tests/integration/p2-gateway.test.ts`, TEMP/TMP .tmp-p3: **208/208 đạt, 26 file**, log .tmp-p3/e22-regression.log. Gồm P1 persistence/backup sau sửa; lỗi rename EPERM thoáng qua ở lượt targeted không tái hiện.
  - `npx.cmd vitest run tests/integration/p2-e11.test.ts tests/integration/e21-claude-agy.test.ts`, TEMP mặc định: **21/21 đạt**, log .tmp-p3/e22-legacy.log.
  - Sau bổ sung ca Claude đổi tools: `npx.cmd vitest run tests/integration/e22-models.test.ts`, TEMP/TMP .tmp-p3: **11/11 đạt**, log .tmp-p3/e22-final.log; thay kết quả 10/10 trước.
  - `npx.cmd vitest run tests/integration/p2-gateway.test.ts tests/integration/e21-claude-agy.test.ts`, TEMP mặc định: **21/22 đạt**, một lỗi EPERM lstat AppData ở verifyEntrypoint; log .tmp-p3/e22-gateway-final.log. Không đổi sandbox/ACL.
  - npm.cmd run lint, npm.cmd run typecheck, npm.cmd run build: exit 0. git diff --check đạt, chỉ cảnh báo CRLF/LF. Không tuyên bố fixture chứng minh provider thật/D-05.
- Còn thiếu / tiếp theo: Claude điều phối chạy models, chọn ID có nguồn, verify --models thật khi có quota và xác nhận extra usage còn hạn; duyệt/nạp bản evidence mới cùng probe PASS, rồi dùng model chọn mặc định. Code không cần quyết định thêm. Full suite còn giới hạn quyền như trên; lượt này không đọc kho evidence để chứng nhận lại trạng thái READY.

### 21/10/2026 — E-23: kiểm ranh giới mỗi lần chạy, bỏ chặn theo phiên bản CLI, canary model / DONE code + fixture
- Đã làm:
  - Bỏ chặn theo phiên bản/SHA-256 CLI sau khi verify: `evaluateProviderRunState`, `boundaryReportIssues`, `claudeBoundaryReportIssues`, `agyBoundaryReportIssues` không còn chặn `CLI_VERSION_CHANGED_SINCE_VERIFICATION` / `ENTRYPOINT_CHANGED_SINCE_VERIFICATION` / `CLI_VERSION_MISMATCH` / `ENTRYPOINT_MISMATCH`; `gateway.status()` vẫn trả `cli_version_changed_since_verification`, `entrypoint_changed_since_verification` và ghi chú trong `notes` để truy vết. `resolveNativeCliEntrypoint` bắt buộc tên file native khớp provider (`PROVIDER_MISMATCH`, cho phép `process.execPath` cho fixture test).
  - Kiểm ranh giới trong mỗi lần chạy (runtime self-check):
    - `claude-code`: `checkClaudeRuntimeStream` kiểm dòng `system/init` của chính lượt chạy; nếu `tools` hoặc `mcp_servers` không rỗng thì chặn `RUNTIME_TOOLS_PRESENT`, ghi bảng `provider_runtime_blocks`, không commit observation.
    - `agy`: `verifyAgyDenySettings` đọc `<profile>\.gemini\antigravity-cli\settings.json` trước khi spawn và trong `defaultObserve`, bắt buộc đúng 5 quy tắc `permissions.deny` (`read_file`, `write_file`, `edit_file`, `run_command`, `grep_search` với `**` / `*`); sai/thiếu thì chặn `RUNTIME_DENY_RULES_CHANGED` trước khi spawn. Sau khi chạy, `checkAgyRuntimeStream` kiểm mọi step `CORTEX_STEP_TYPE_MCP_TOOL` / `TOOL` / `RUN_COMMAND` / `READ_FILE` / `WRITE_FILE` / `EDIT_FILE` / `GREP_SEARCH`; nếu `DONE` mà không phải lỗi permission thì loại kết quả và chặn `RUNTIME_TOOL_EXECUTED`.
    - `codex`: `defaultObserve` chạy `codex features list` (không gọi model, cache tối đa 5 phút theo `provider + cliVersion + entrypointSha256`) và kiểm qua `runtimeCodexToolsAcceptable` (chỉ còn `unified_exec` bù bằng ACL như E-15/E-17); nếu feature nguy hiểm bật lại thì chặn `RUNTIME_CODEX_FEATURES_CHANGED`.
    - Giữ nguyên toàn bộ chốt thanh toán và quyền dữ liệu: env allowlist (cắt `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`), kiểm phương thức đăng nhập thuê bao trong probe cache 5 phút, extra usage 30 ngày, consent, gói và `models_allowed` giữ hiệu lực qua các lần CLI tự cập nhật.
  - Model canary thay cho verify từng model:
    - Mở rộng `migrations/0008_provider_model_preferences.sql` và `SqliteAiAccountsRepository` với các bảng append-only `provider_allowed_models`, `provider_model_canaries`, `provider_runtime_blocks`.
    - Thêm lệnh `npm.cmd run ai -- allow-models <provider> <m1,m2,...>` (và `models <provider> --allow <m1,m2,...>`) để khai báo `models_allowed` không cần chạy lại `verify --models`. `models_allowed` hợp nhất giữa khai báo người dùng và `models_verified` trong evidence.
    - Lần đầu gọi một bộ `(provider, cli_version, model, effort)` chưa có canary `PASS`, `CliProviderAdapter.execute` tự chạy 1 prompt synthetic ngắn qua đúng đường cô lập + runtime self-check + kiểm envelope hợp đồng (`schema_version`, `run_id`, `role`, `payload`); đạt thì ghi `provider_model_canaries` (`PASS`) rồi chạy job thật, thất bại thì ghi `FAIL` và chặn `MODEL_CANARY_FAILED`.
  - Cập nhật tài liệu `DECISIONS.md` (mục E-23), `D01_CODEX_READ_BOUNDARY.md`, `D01_CLAUDE_AGY.md`, `P4_ACCEPTANCE.md`, `README.md`, `docs/README.vi.md`.
- Đã chạy và kết quả thật:
  - `npm.cmd run lint`: exit 0.
  - `npm.cmd run typecheck`: exit 0.
  - `npm.cmd run build`: exit 0.
  - `npx.cmd vitest run tests/integration/e23-runtime-canary.test.ts tests/integration/e22-models.test.ts tests/integration/e21-claude-agy.test.ts tests/integration/p2-gateway.test.ts`: PASS 4/4 file, 36/36 test.
  - `npx.cmd vitest run --maxWorkers=2 tests/contract tests/unit tests/spikes tests/integration/server.test.ts tests/integration/p1-persistence.test.ts tests/integration/p1-queue.test.ts tests/integration/p1-backup.test.ts tests/integration/p2-pipeline.test.ts tests/integration/p2-gateway.test.ts tests/integration/p2-console.test.ts tests/integration/p3-learning.test.ts tests/integration/p3-reading.test.ts tests/integration/p4-resilience.test.ts tests/integration/p4-failover.test.ts tests/integration/p4-complaints.test.ts tests/integration/p4-benchmark.test.ts tests/integration/e21-claude-agy.test.ts tests/integration/e22-models.test.ts tests/integration/e23-runtime-canary.test.ts`: PASS 28/28 file, 231/231 test.
  - `npm.cmd run check`: lint + typecheck PASS; vitest 28/31 file PASS (246/265 test PASS); 3 file chạm giới hạn môi trường sandbox Windows của runner (`tests/integration/relay-console.test.ts` lỗi `listen EACCES 127.0.0.1`, `tests/integration/probe-boundary.test.ts` và 3 case `symlink_junction` trong `tests/integration/p2-e11.test.ts` lỗi `EPERM` khi tạo junction).
- Ánh xạ yêu cầu → code → test:
  - E-23 (bỏ chặn version/hash, giữ kiểm tra native entrypoint đúng provider, hiển thị thông tin drift) → [`src/application/ai/subscription-guard.ts`](src/application/ai/subscription-guard.ts), [`src/infrastructure/ai/gateway/entrypoint.ts`](src/infrastructure/ai/gateway/entrypoint.ts), [`src/infrastructure/ai/gateway/probe-boundary.ts`](src/infrastructure/ai/gateway/probe-boundary.ts), [`src/infrastructure/ai/gateway/gateway.ts`](src/infrastructure/ai/gateway/gateway.ts), [`src/cli/ai.ts`](src/cli/ai.ts) → [`tests/integration/e23-runtime-canary.test.ts`](tests/integration/e23-runtime-canary.test.ts), [`tests/integration/p2-gateway.test.ts`](tests/integration/p2-gateway.test.ts).
  - E-23 (runtime self-check cho `claude-code`, `agy`, `codex` + chốt cứng billing/extra usage/consent) → [`src/infrastructure/ai/gateway/cli-adapters.ts`](src/infrastructure/ai/gateway/cli-adapters.ts), [`src/infrastructure/ai/gateway/probe-boundary.ts`](src/infrastructure/ai/gateway/probe-boundary.ts), [`src/infrastructure/ai/gateway/gateway.ts`](src/infrastructure/ai/gateway/gateway.ts), [`src/infrastructure/sqlite/ai-accounts-repository.ts`](src/infrastructure/sqlite/ai-accounts-repository.ts) → [`tests/integration/e23-runtime-canary.test.ts`](tests/integration/e23-runtime-canary.test.ts).
  - E-23 (`models_allowed`, lệnh `allow-models`, model canary 1-prompt theo `(provider, cli_version, model, effort)`) → [`migrations/0008_provider_model_preferences.sql`](migrations/0008_provider_model_preferences.sql), [`src/infrastructure/sqlite/ai-accounts-repository.ts`](src/infrastructure/sqlite/ai-accounts-repository.ts), [`src/infrastructure/ai/gateway/gateway.ts`](src/infrastructure/ai/gateway/gateway.ts), [`src/infrastructure/ai/gateway/compose.ts`](src/infrastructure/ai/gateway/compose.ts), [`src/cli/ai.ts`](src/cli/ai.ts) → [`tests/integration/e23-runtime-canary.test.ts`](tests/integration/e23-runtime-canary.test.ts), [`tests/integration/e22-models.test.ts`](tests/integration/e22-models.test.ts).
- Còn thiếu / tiếp theo: Khi vận hành ngoài sandbox cần xác nhận 3 test hạ tầng Windows (`relay-console.test.ts`, `probe-boundary.test.ts`, `p2-e11.test.ts` phần junction) trên shell có quyền loopback/junction. Khi dùng CLI thật chỉ cần khai báo `allow-models` (hoặc giữ evidence cũ) — gateway sẽ tự chạy canary ở lần gọi đầu tiên của mỗi phiên bản CLI mới.

### 17/11/2026 — Chạy thử relay mới qua ai-router / DONE (không đổi mã nguồn)
- Đã làm: đọc `scripts/relay/core.ts` (phần thuần của relay: dựng prompt nhiệm vụ/`--continue` kèm quy tắc dự án và ánh xạ kết quả ai-router + dòng `RELAY_STATUS` sang trạng thái/exit code); chỉ thêm mục này vào PROGRESS.md.
- Đã chạy: `git status --short | wc -l` → 49 dòng (trước khi sửa PROGRESS.md, vốn đã ở trạng thái M). Không chạy test, không sửa mã.
- Tiếp theo: không có việc phát sinh từ lần chạy thử; tiếp tục mục "Còn thiếu / tiếp theo" của E-23.

### 17/11/2026 — AI-01 / E-24: dùng lõi định tuyến của ai-router làm nền xử lý AI / DONE (code + test, chưa chạy CLI thật)
- Nguồn: người dùng yêu cầu nghiên cứu ai-router (`..\ai-router`, commit `f0f4c55`) và đồng bộ làm nền xử lý AI của dự án; 06A §1.5–1.6, §6.B, §8; E-09, E-20, E-23; quyết định mới E-24.
- Nghiên cứu: ai-router gồm lõi thuần (`src/core`: phân loại QUOTA/RATE_LIMIT/AUTH/UNAVAILABLE/TIMEOUT, đọc giờ mở lại, cooldown, thứ tự failover), adapter CLI/API, router hội thoại, hàng đợi job, HTTP/MCP/Admin. Chỉ lõi thuần được đưa vào app; provider API trả phí, xoay tài khoản cùng hãng, workspace `full`, chat/handoff không phù hợp đặc tả gateway nên không dùng. Relay (`scripts/relay`) đã gọi ai-router từ trước, không đổi.
- File: `scripts/sync-ai-router.mjs` + script `router:sync` (package.json); `src/infrastructure/ai/router-core/{types,outcome,routing}.ts` + `SOURCE.json` (bản chép nguyên văn); `src/infrastructure/ai/gateway/failover.ts` (mới); sửa `envelope.ts` (mẫu D-01 trước, lõi sau, vẫn đóng khi không nhận ra), `cli-adapters.ts` (giữ stderr, trả `reset_at`), `gateway.ts` + `compose.ts` (`reset_at` → `quota_events`), `ai-accounts-repository.ts` (cooldown theo lõi, bỏ giờ mở lại đã qua), `application/ai/provider-adapter.ts` (`reset_at`), `application/ports.ts` + `sqlite/job-queue.ts` (`waitingQuota`), `worker/worker.ts` (`resumeWaitingJobs`, kiểm mỗi 5 phút) + `worker/main.ts` (`--quota-recheck-ms`). Không thêm migration, không thêm dependency, không sửa ai-router.
- Test mới: `tests/unit/router-core-failover.test.ts` (12 ca: sự kiện Claude/Codex/agy, không đọc câu trả lời model, stderr của lượt thành công bị bỏ qua, giờ mở lại vô lý bị bỏ, mẫu D-01 thắng, lỗi lạ vẫn BILLING_UNVERIFIED, bản sao router-core khớp SHA-256), `tests/integration/e24-router-core.test.ts` (3 ca: job WAITING_QUOTA chỉ mở lại sau cooldown 60 phút, giữ ngân sách, một evidence source; provider dự phòng có D-05 được dùng ngay; chỉ xét scope worker sở hữu).
- Lệnh / kết quả (Windows 11, Node 22.18.0, ngoài sandbox CLI):
  - Trước khi sửa `npx.cmd vitest run`: 232/232 (30 file).
  - `npm.cmd run router:sync`: chép 3 file từ `f0f4c55`; `npm.cmd run router:sync -- --check`: khớp.
  - Typecheck lần đầu lỗi TS2339 (thu hẹp kiểu `quota` trong vòng lặp) → sửa. `npx.cmd vitest run` 2 file mới: 15/15.
  - `npm.cmd run check`: lint, typecheck, **247/247 (32 file)**, build đạt.
- Giới hạn: chưa chạy CLI thật (không tốn hạn mức); giờ mở lại của Codex dạng "at 6:49 PM" theo giờ máy; `CliProviderAdapter` dùng giờ thật khi đọc giờ mở lại (không theo đồng hồ giả của test). Worker vẫn từ chối khởi động khi không provider nào READY lúc khởi động (hành vi P2 cũ). Khi CLI đổi định dạng lỗi: sửa ở ai-router, `router:sync`, `check`.
- Tiếp theo: khi một provider thật chạm hạn mức trong app, đối chiếu `quota_events.reset_at` với thông báo thật; cân nhắc cho worker chờ (thay vì thoát) khi mọi provider đang cooldown — cần người dùng đồng ý vì đổi hành vi khởi động P2.

### 17/11/2026 — P5-1 Daily Tracker và nhắc học theo luật (E-25) / DONE phần code + test; P5 IN_PROGRESS
- Nguồn: người dùng yêu cầu tiếp tục triển khai; 06A §9.1–9.3, §10.A; 02 §5.C.2; 06 §2.A.3–4; IMPLEMENTATION_PLAN P5. Quyết định mới E-25. Không đặt ngưỡng D-02, không đổi hồ sơ năng lực.
- File: `migrations/0010_daily_tracking.sql`; `src/domain/scheduling/study-day.ts` (ngày Asia/Bangkok, hợp khoảng heartbeat, trạng thái ngày, quỹ ngày không nợ phút); `src/infrastructure/sqlite/tracking-repository.ts` (+ `tracking` trong `store.ts`); `src/application/learning/daily-tracker.ts`; `src/server/app.ts` (`POST /api/learning/tracking/activity`, `POST /api/learning/tracking/day`, `GET /api/learning/tracking?days=`, `GET /api/learning/notifications`, `POST /api/learning/notifications/:id/dismiss`; session/CSRF như các route học khác); `src/web/tracking.tsx` (heartbeat 60 s khi màn học hiển thị hoặc audio phát, hàng đợi localStorage khi mất kết nối → gửi lại kèm `offline`; khung "Ngày học hôm nay" ở Học hôm nay; bảng 7 ngày ở Tiến độ), gắn vào `learning.tsx`, `reading.tsx`, `audio.tsx`. Test cập nhật số migration 9 → 10 (`p1-persistence`, `p1-backup`).
- Test mới: `tests/unit/study-day.test.ts` (6), `tests/integration/p5-tracking.test.ts` (5: heartbeat idempotent + gộp chồng + đọc/nghe; ngày thiếu dữ liệu không tăng quỹ hôm sau, nghỉ/offline/tự khai/rút khai báo, request_key trùng; từ chối dữ liệu xấu/tương lai/quá cũ/trường nội dung/thiếu CSRF; một nhắc/ngày, khởi động lại không gửi trùng, không nhắc ngày nghỉ, không bù ngày máy tắt; append-only).
- Lệnh / kết quả (Windows 11, Node 22.18.0): `npx.cmd vitest run` 2 file mới 11/11; `npm.cmd run check`: lint, typecheck, **258/258 (34 file)**, build đạt. Lần typecheck đầu lỗi thiếu đuôi `.js` khi import trong web → sửa.
- Giới hạn: **chưa mở UI trên trình duyệt** — `dev:server` chỉ dùng dữ liệu thật ở `var/` và sẽ áp migration 0010 vào DB thật; tránh lặp sự cố migration 0008, để người dùng chạy khi migration đã chốt. Hiển thị phần trăm/so sánh với mục tiêu cố ý không có (không có ngưỡng). Ngày bắt đầu theo dõi lấy từ hoạt động/khai báo sớm nhất hoặc `updated_at` của mục tiêu.
- Tiếp theo: kiểm UI thật (`npm.cmd run dev:server` + `npm.cmd run dev`, mở Học hôm nay/Tiến độ); P5-2 đề xuất lịch bù — tạo proposal khi có nhiệm vụ quá hạn, chỉ dời/thu hẹp, không nhồi bài; phần xếp hạng ưu tiên cần chính sách D-02.

### 17/11/2026 — DOC-02 / E-26: hướng dẫn sử dụng tự cập nhật / DONE
- Nguồn: người dùng yêu cầu một file hướng dẫn kĩ trong `docs/`, tự động cập nhật khi có thay đổi/nội dung mới. Quyết định E-26.
- File: `docs/HUONG_DAN_SU_DUNG.md` (mới: 13 mục viết tay + mục 14 tự động gồm lệnh npm, lệnh `ai`/`backup`, cờ worker, 51 route API, migration, quyết định E-01…E-26, trạng thái công việc); `scripts/user-guide.mjs` (sinh/kiểm, bảng mô tả bắt buộc cho script/route/cờ); `.githooks/pre-commit`; `package.json` (`docs:guide`, `hooks:install`, `check` thêm bước kiểm hướng dẫn); `AGENTS.md` (mục 5a, mô tả `check`); liên kết trong `README.md`, `docs/README.vi.md`.
- Kiểm tra: `npm.cmd run docs:guide` sinh khối AUTO; `-- --check` đạt. Thử âm trên bản sao trong scratchpad: thêm script npm không mô tả → exit 1 kèm lý do; thêm migration mới → exit 1 (khối cũ). `npm.cmd run check`: lint, kiểm hướng dẫn (khớp), typecheck, **258/258 (34 file)**, build đạt.
- Giới hạn: phần viết tay không tự kiểm được; chưa bật git hook (cần người dùng chạy `npm.cmd run hooks:install`, đổi cấu hình git cục bộ của repo).

### 17/11/2026 — P5-2 Tra cứu kho tri thức FTS5/BM25 (E-27) / DONE phần code + test; P5 IN_PROGRESS
- Nguồn: người dùng yêu cầu tiếp tục; 06A §7.A.2 (lọc quyền trước tra cứu bằng FTS/BM25), §10.B bước 5; 05 §C.5; 06 §5.B.1. Quyết định E-27.
- File: `migrations/0011_knowledge_search.sql`; `src/infrastructure/sqlite/knowledge-search.ts` (+ `search` trong `store.ts`); `src/server/app.ts` (`GET /api/console/search`, `POST /api/console/search/rebuild`); `src/web/console.tsx` (khung "Tìm trong kho tri thức"); `scripts/user-guide.mjs` (mô tả 2 route); `docs/HUONG_DAN_SU_DUNG.md` (mục 5, 11, 12); test số migration 10 → 11.
- Test mới `tests/integration/p5-search.test.ts` (7): blind_solver không tìm thấy đáp án, verifier thấy; khối governance không được đánh chỉ mục; chỉ bản phát hành cho vai trò AI, builder thấy draft; thu hồi unit/gói có hiệu lực ngay; sync idempotent + rebuild; tiếng Việt gõ không dấu tìm được; cú pháp FTS của người gọi bị vô hiệu; route cần phiên, không trả nội dung.
- Lệnh / kết quả: `npx.cmd vitest run tests/integration/p5-search.test.ts` lần đầu 3 fail (giả định sai rằng nội dung không chứa id; `'delete-all'` chỉ dành cho bảng FTS contentless; kỳ vọng sai của test về gộp đ) → sửa code `rebuild` và kỳ vọng test, chạy lại 7/7. `npm.cmd run check` lần 1: 264/265 — 1 lỗi `EBUSY rmdir` khi dọn thư mục tạm ở ca timeout của `e22-models` (không liên quan thay đổi; chạy riêng file đó 11/11); lần 2: lint, kiểm hướng dẫn, typecheck, **265/265 (35 file)**, build đạt. Ca e22 có thể chập chờn trên Windows khi cây tiến trình chưa nhả thư mục.
- Giới hạn: BM25 tính thống kê trên toàn chỉ mục (unit ẩn có thể lệch thứ hạng, không bao giờ bị trả về); chưa dùng trong đóng gói ngữ cảnh job AI; chưa kiểm UI trên trình duyệt.

### 17/11/2026 — P5-3 Xuất dữ liệu học tập và báo cáo dung lượng (E-28) / DONE phần code + test; P5 IN_PROGRESS
- Nguồn: người dùng yêu cầu triển khai phần tiếp theo; IMPLEMENTATION_PLAN P5 (export/retention); D-07 (chỉ làm phần độc lập: không xóa dữ liệu khi chưa có chính sách); AGENTS (giữ bài nộp/audio gốc, không gửi gợi ý tương lai). Quyết định E-28.
- File: `src/infrastructure/export/learner-export.ts` (mới), `src/cli/export.ts` (mới) + script `export`; `src/server/app.ts` (`POST /api/learning/export`, `GET /api/learning/storage`); `src/web/learning.tsx` (khung "Dữ liệu của bạn" ở Cài đặt); `scripts/user-guide.mjs` (mô tả + khối `export-cli`); `docs/HUONG_DAN_SU_DUNG.md` (mục 4.1, 8, 11, 12, 13); DECISIONS (E-28, D-07). Không thêm migration, không thêm dependency.
- Test mới `tests/integration/p5-export.test.ts` (4): xuất đủ 25 bảng, SHA-256 khớp từng file và bản thu âm, chỉ scope learner, không có gợi ý cấp 3/đáp án synthetic dù chúng có trong DB, không có attempt dry-run; file audio bị sửa → dừng, không để lại thư mục dở, DB không đổi; báo cáo dung lượng + route cần phiên/CSRF; từ chối thư mục xuất trong repo ngoài `var/`.
- Lệnh / kết quả: `npx.cmd vitest run tests/integration/p5-export.test.ts` 4/4 ngay lần đầu. Lint lần đầu báo trùng khóa `export` trong `scripts/user-guide.mjs` (một lần ghi bằng Python báo lỗi OS nhưng thực tế đã ghi) → xóa dòng trùng. `npm.cmd run check`: lint, kiểm hướng dẫn (khớp), typecheck, **269/269 (36 file)**, build đạt.
- Giới hạn: chưa có nhập lại (import) bản xuất; chưa kiểm UI trên trình duyệt; thời hạn lưu giữ/tự dọn/ngưỡng đầy ổ chờ người dùng chốt D-07.

### 18/11/2026 — P5-4 Chạy một lệnh, diễn tập khôi phục, kiểm UI thật (E-29) / DONE; P5 IN_PROGRESS
- Nguồn: người dùng yêu cầu triển khai phần tiếp theo (các mục P5 còn lại khác đều chờ D-02/D-05/D-07); IMPLEMENTATION_PLAN P5 (trải nghiệm sử dụng thật, "restore thực nghiệm thành công"); 06 §5.B.6. Quyết định E-29.
- File: `src/server/static-web.ts` (mới), `src/server/app.ts` (`webRoot`, `port`, bỏ qua phiên cho giao diện tĩnh, câu ghi chú AI trung tính), `src/server/main.ts` (`STUDY_ENGLISH_DATA_DIR`, `STUDY_ENGLISH_PORT`, `STUDY_ENGLISH_SERVE_WEB`), `src/infrastructure/backup/drill.ts` (mới), `src/cli/backup.ts` (`drill`), `package.json` (`app`), `src/web/main.tsx` (banner trung tính), `src/web/tracking.tsx` ("—" trước khi theo dõi), `src/web/learning.tsx` (khung ngày tải lại khi có mục tiêu), `src/domain/scheduling/study-day.ts` (hôm nay luôn "chưa có dữ liệu"), `src/application/learning/daily-tracker.ts` (không nhắc khi chưa có mục tiêu); tài liệu: hướng dẫn sử dụng (mục 1, 3, 8, 11), README Anh/Việt, DECISIONS E-29.
- Test: `tests/integration/p5-app.test.ts` (3: phục vụ giao diện không cần phiên + SPA fallback + chặn thoát thư mục bằng `..`/mã hóa + `/api` và POST vẫn cần phiên + Host vẫn kiểm; từ chối khi chưa build; diễn tập ĐẠT rồi backup hỏng → THẤT BẠI đúng lý do, cả hai được ghi log, dữ liệu sống không đổi). Bổ sung ca vào `study-day` và `p5-tracking` cho 3 lỗi tìm thấy trên UI.
- Kiểm UI thật (trình duyệt trong app, bản build chạy `node --env-file` với dữ liệu ở scratchpad, cổng 4327; `dev:server` của người dùng đang giữ 4317 trên dữ liệu thật, không đụng): giao diện + API cùng origin; lưu mục tiêu; khung "Ngày học hôm nay" (nhắc học, nghỉ có kế hoạch và bỏ đánh dấu); bảng 7 ngày ở Tiến độ; Cài đặt → Dữ liệu của bạn (dung lượng, xuất dữ liệu thành công); Builder & QC → tìm kiếm (không có gói → "Không có kết quả…"). Không có lỗi console. Lượt đầu phát hiện 3 lỗi P5-1 (xem E-29) → sửa, xóa dữ liệu thử, build lại, kiểm lại đạt.
- Lệnh / kết quả: `npx.cmd vitest run tests/integration/p5-app.test.ts` 3/3; `tests/unit/study-day.test.ts tests/integration/p5-tracking.test.ts` 11/11 sau sửa; `npm.cmd run check`: lint, kiểm hướng dẫn (khớp), typecheck, **272/272 (37 file)**, build đạt. Chưa chạy `backup -- drill` trên `var/` thật (để người dùng chạy).
- Giới hạn: tìm kiếm trên UI chỉ kiểm trường hợp rỗng (dữ liệu thử chưa có gói phát hành; trường hợp có kết quả đã có test). `npm run app` build lại mỗi lần chạy (vài giây); `npm start` để khởi động nhanh.

### 18/11/2026 — E-30 tự dọn backup, E-31 worker chờ hạn mức (người dùng chốt) + bản đề xuất D-02 / DONE
- Nguồn: người dùng trả lời câu hỏi 18/11/2026: D-07 "Chỉ dọn backup cũ"; worker "Chờ tới khi mở lại"; D-02 "Soạn bản đề xuất để duyệt". Câu hỏi sao lưu tự động: người dùng hỏi lại tác động (token, diễn tập tuần) — đã giải thích, chưa triển khai, chờ trả lời.
- File: `src/infrastructure/backup/prune.ts` (mới), `src/cli/backup.ts` (`prune`, dọn sau `create` và sau `drill` đạt), `src/worker/worker.ts` (`quotaWaitable`, `waitForProvider`), `src/worker/main.ts` (chờ thay vì thoát khi chỉ hết hạn mức), `docs/engineering/D02_PROPOSAL.md` (mới, CHƯA CHỐT: A trạng thái 6 mức + hạ mức, B độ tin cậy, C lịch kiểm chứng/giãn cách, D điểm ưu tiên + chống trì hoãn, E sổ lỗi, F đề xuất lịch bù), hướng dẫn sử dụng (mục 7, 8, 11, 12), DECISIONS (E-30, E-31, dòng D-02/D-07).
- Test: `tests/integration/e30-e31.test.ts` (3: giữ N bản + bản diễn tập đạt, không đụng bản sao tay/`.partial`, ghi log, idempotent; điều kiện chờ chỉ khi chặn thuần hạn mức; chờ rồi trả về khi mở lại, dừng khi lý do đổi hoặc Ctrl+C); thêm ca vào `p2-gateway.test.ts` xác nhận guard thật trả đúng `PROFILE_QUOTA_EXHAUSTED`/`PROFILE_COOLDOWN`.
- Đo dữ liệu thật (chỉ đọc): `var/db` 1.1 MB, `var/media` 0, `var/backups` 1.3 MB (2 thư mục; `pre-m8-repair-…` không có manifest nên không bao giờ bị dọn).
- Lệnh / kết quả: `npx.cmd vitest run tests/integration/e30-e31.test.ts` 3/3; ca guard 1/1; `npm.cmd run check`: lint, kiểm hướng dẫn (khớp), typecheck, **275/275 (38 file)**, build đạt. Chưa chạy `backup -- create/prune` trên `var/` thật.
- Còn chờ người dùng: ~~duyệt D02_PROPOSAL (A–F)~~ đã chốt (E-33); xác nhận lại extra usage (Codex hết hạn 19/11, Claude/agy 20/11). Sao lưu tự động: người dùng chọn "Bật cả hai" → E-32 bên dưới.

### 18/11/2026 — E-32 Sao lưu tự động mỗi ngày + diễn tập khôi phục mỗi tuần (người dùng chốt) / DONE
- Nguồn: người dùng chọn "Bật cả hai" sau khi được giải thích (không tốn token/hạn mức, chỉ chép file cục bộ; diễn tập = khôi phục thử để chắc backup dùng được).
- File: `src/infrastructure/backup/auto.ts` (mới), `src/server/main.ts` (lịch nền, `STUDY_ENGLISH_AUTO_BACKUP=0` để tắt), `src/server/app.ts` (`backups` trong `/api/learning/storage`), `src/infrastructure/sqlite/tracking-repository.ts` (`lastRunDay`), `src/infrastructure/backup/prune.ts` (xuất `standardBackups`), `src/web/learning.tsx` (trạng thái trong "Dữ liệu của bạn"); hướng dẫn sử dụng (mục 4.1, 8, 11, 12); DECISIONS (E-32, D-07).
- Test `tests/integration/e32-auto-backup.test.ts` (2): một backup/ngày học, không làm gì khi đã đủ, diễn tập mỗi 7 ngày, trạng thái + hạn diễn tập kế tiếp; dọn còn 10 bản; diễn tập lỗi (backup mới nhất bị sửa) báo đúng lý do, không thử lại trong cùng ngày.
- Lệnh / kết quả: `npx.cmd vitest run tests/integration/e32-auto-backup.test.ts` 2/2; `npm.cmd run check`: lint, kiểm hướng dẫn (khớp), typecheck, **277/277 (39 file)**, build đạt. Chưa chạy trên `var/` thật: lần chạy `app`/`dev:server` kế tiếp sẽ tự tạo backup đầu tiên và diễn tập (khoảng 15 giây sau khi mở).
- Giới hạn: chỉ chạy khi ứng dụng mở; `dev:server` đang chạy của người dùng dùng code cũ cho tới khi tự nạp lại (tsx watch) hoặc khởi động lại.

### 18/11/2026 — E-33 Chốt chính sách D-02 v1 (người dùng chốt) / DONE (tài liệu)
- Nguồn: người dùng "đồng ý các đề xuất trong D02_PROPOSAL" và yêu cầu đánh giá bản góp ý 8 điểm. Đã đối chiếu với schema (`synthetic`, `item_family_id`, `unlocked_hint_level`, `reduced_load`, `meets_min_scope`, 4 trạng thái `error_hypotheses`) và đặc tả (01 Bước 4/9, 02 §3/§4/§5.A.1, 06A §9.2).
- File: `docs/engineering/D02_PROPOSAL.md` (viết lại thành chính sách v1 đã chốt, có bảng lịch sử sửa đổi: nhận/sửa/bỏ từng góp ý), DECISIONS (E-33, dòng D-02).
- Chưa làm: code chính sách (`policies/competency-policy.v1.json`, Rule Engine A–F, test từng dòng). Code vẫn trả `POLICY_NOT_APPROVED`.
- Lệnh: `npm.cmd run docs:guide` rồi `npm.cmd run check` → lint, guide check, typecheck, 277/277 test (39 file), build đều đạt.

### 18/11/2026 — E-34 Triển khai chính sách D-02 v1 / DONE
- **Nguồn:** người dùng yêu cầu "Triển khai D-02". Chính sách theo [D02_PROPOSAL](docs/engineering/D02_PROPOSAL.md) (E-33).
- **File mới:**
  - `policies/competency-policy.v1.json`
  - `src/domain/policy/{params,competency,verification,priority,hypothesis,replan}.ts`
  - `src/infrastructure/policy/competency-policy.ts`
  - `src/application/learning/replan-planner.ts`
  - `migrations/0012_competency_policy.sql`: cột chuỗi kiểm chứng trên `scheduled_tasks` và bảng bất biến `competency_conclusions`
  - `tests/unit/d02-policy.test.ts` (34 ca)
  - `tests/integration/d02-app.test.ts` (5 ca)
- **File sửa:**
  - `src/application/learning/writing-workflow.ts`: kết luận A/B và lịch sử; chuỗi C thay E-18; xếp hạng D; sổ lỗi E; trọng tâm D5
  - `src/infrastructure/sqlite/replan-repository.ts`: `apply` trong transaction CAS, `reject`
  - `src/server/app.ts`: 3 route replan
  - `src/web/learning.tsx`: thẻ đề xuất lịch, điểm ưu tiên, mức/độ tin cậy/mức theo điều kiện/lý do
  - `src/infrastructure/export/learner-export.ts`: xuất `competency_conclusions`
  - `scripts/user-guide.mjs`: mô tả route
  - `tests/integration/p3-learning.test.ts`: luồng mới 7A → 7B → 9, chính sách APPROVED, G0 cho A1
  - `p1-backup`, `p1-persistence`: thêm migration 12
  - Tài liệu: hướng dẫn sử dụng (mục 1, 4.2, 4.3, 4.6, 12), D02_PROPOSAL (triển khai + làm rõ), DECISIONS (E-34, dòng D-02), PROJECT_STRUCTURE
- **Lệnh và kết quả:**
  - `npx.cmd vitest run tests/unit/d02-policy.test.ts`: 34/34
  - `npx.cmd vitest run tests/integration/d02-app.test.ts`: 5/5
  - `npm.cmd run docs:guide`, rồi `npm.cmd run check`: lint, guide check, typecheck, 316/316 test (41 file), build đều đạt
- **Kiểm UI thật:** `node dist/server/main.js` với dữ liệu tạm (`STUDY_ENGLISH_DATA_DIR` trong scratchpad, cổng 4327, `STUDY_ENGLISH_AUTO_BACKUP=0`).
  - Màn Tiến độ hiện chính sách APPROVED v1 và mức A1 / "Chưa xác lập".
  - Màn Học hôm nay hiện điểm ưu tiên D-02.
  - Console không có lỗi.
  - Chưa chạy trên `var/` thật. Migration 0012 sẽ áp dụng ở lần mở app kế tiếp; nên sao lưu trước.
- **Giới hạn:**
  - D1: chưa adapter nào trả điểm AI, nên lấy mặc định 1.
  - E1: chưa có dữ liệu "ủng hộ riêng giả thuyết" hay nhiệm vụ phân biệt nguyên nhân.
  - Bài 7B/9 tự xếp là synthetic (D-05).
  - Tham số chưa kiểm định thực nghiệm.

### 18/11/2026 — P5-5 / E-35 Chấm Writing bằng AI thật qua worker (tùy chọn) / DONE phần code + test; chưa chạy Codex thật
- **Nguồn:** người dùng yêu cầu "tiếp tục triển khai". Lỗ hổng tìm thấy: vòng Writing luôn chấm bằng FakeAdapter, và job chấm của người học không worker nào xử lý (`interpret: () => []`, worker chỉ nhận dry-run hoặc khiếu nại).
- **File mới:**
  - `contracts/learning.v1.schema.json`
  - `src/application/learning/writing-assessment.ts`: ngữ cảnh người chấm; diễn giải nhận định; chẩn đoán + kiểm tra tiết lộ
  - `tests/integration/p55-real-ai.test.ts` (7 ca)
- **File sửa:**
  - `provider-adapter.ts`: `WritingAssessment`, `isWritingAssessment`
  - `validate.ts`, `result-contracts.ts`, `task-instructions.ts`: lệnh chấm Writing mới, schema đã gộp `$ref`
  - `submit-for-assessment.ts`: tham số `context`
  - `ports.ts`, `job-queue.ts`: `excludeComplaints`
  - `writing-workflow.ts`:
    - `aiMode`, `interpretWriting`/`interpretJob`, `finalizeAssessment`/`finalizeReal`/`advanceLoop`, `WRITING_COMPETENCIES`
    - Workspace tự ghi chẩn đoán khi đọc lại và trả `assessment`
    - D1 lấy điểm AI; nhãn synthetic theo provider thật
    - Không chép câu bị cấm vào thông báo
  - `complaints.ts`: nhận kết quả learning.v1
  - `src/worker/main.ts`: `--learning`
  - `src/server/main.ts`, `app.ts`: `learning_ai_mode`
  - `src/web/learning.tsx`: trạng thái chấm, tự tải lại 3 giây, điểm AI, nhãn AI thật
  - `scripts/user-guide.mjs`: cờ `--learning`
  - Hướng dẫn sử dụng mục 7, 12; `README.md`, `docs/README.vi.md`; DECISIONS E-35
- **Lệnh và kết quả:**
  - `npx.cmd vitest run tests/integration/p55-real-ai.test.ts`: 7/7. Lần chạy đầu bắt được rò rỉ câu mẫu qua thông báo lỗi kiểm tra tiết lộ; đã sửa.
  - `npm.cmd run docs:guide`, rồi `npm.cmd run check`: lint, guide check, typecheck, 323/323 test (42 file), build đều đạt.
- **Chưa làm / giới hạn:**
  - Chưa gọi Codex thật. Adapter trong test chỉ là bản giả `synthetic: false`, không chứng minh CLI trả đúng schema mới.
  - Lần chạy thật đầu tiên nên dùng `npm.cmd run worker -- --learning --once` và xem kết quả.
  - Chất lượng chấm chưa được đối chứng (D-05).
  - Đề vẫn là synthetic, nên G0 loại kết quả khỏi mức năng lực.
- **Tiếp theo:** người dùng thử chấm thật một bài (tốn 1 lượt Codex), rồi rà lại chất lượng chẩn đoán và gợi ý.

### 18/11/2026 — Đề xuất D-05 nguồn đề (AI biên soạn + đề người dùng sở hữu) / CHỜ DUYỆT
- Nguồn: người dùng trả lời "Đề AI sẽ tự search, build theo đúng tiêu chí của IELTS và cũng có thể tự thêm đề mà tôi sở hữu… nêu rõ cho tôi".
- File: `docs/engineering/D05_CONTENT_PROPOSAL.md` (mới, ĐỀ XUẤT — CHƯA CHỐT): kiến trúc 3 đường vào (nguồn chính thức → khung tiêu chí; AI sinh đề; đề người dùng) qua một cổng QC1–4, bộ theo dõi độ phủ tự bổ sung đề; 10 điểm cần chốt N1–N10 có khuyến nghị; kế hoạch C1–C6. DECISIONS dòng D-05 trỏ tới bản đề xuất.
- Không đổi code. Không chạy lệnh kiểm tra (chỉ tài liệu).

### 18/11/2026 — E-36 chốt nguồn đề D-05 + E-37 bộ quét nguồn và trang duyệt / DONE phần code + test; chưa quét thật
- **Nguồn:** người dùng trả lời N1–N10 và báo Codex Plus đã hết hạn.
  - Ghi lại ở D05_CONTENT_PROPOSAL (bảng quyết định), DECISIONS (E-36, dòng D-05).
  - N1 đổi sang làm đều 4 kỹ năng và học lại từ nền tảng. N2: quét hết, có trang duyệt. N9: research tiêu chí, chấp nhận rủi ro.
- **File mới:**
  - `policies/source-seeds.v1.json`
  - `migrations/0013_source_candidates.sql`
  - `src/infrastructure/sources/{page,crawler,review}.ts`
  - `src/cli/sources.ts` (npm script `sources`)
  - `src/web/sources.tsx` (tab Builder & QC → Nguồn)
  - `tests/integration/e37-sources.test.ts` (3 ca)
- **File sửa:**
  - `src/server/app.ts`: 3 route `/api/console/sources*`
  - `src/web/console.tsx`
  - `package.json`
  - `scripts/user-guide.mjs`
  - Hướng dẫn sử dụng mục 5; `README.md`, `docs/README.vi.md`
  - Test `p1-backup`, `p1-persistence` (migration 13)
  - DECISIONS E-37
- **Lệnh và kết quả:**
  - `npx.cmd vitest run tests/integration/e37-sources.test.ts`: 3/3. Lần chạy đầu bắt được redirect ra ngoài danh sách đã bị gọi trước khi kiểm; đã sửa bằng tự xử lý redirect.
  - `npm.cmd run docs:guide`, rồi `npm.cmd run check`: lint, guide check, typecheck, 326/326 test (43 file), build đều đạt.
- **Chưa làm:**
  - Chưa quét Internet thật; người dùng chạy `npm.cmd run sources -- crawl`.
  - Chưa trích văn bản PDF.
  - Các bước cần AI (soạn khung năng lực, rubric, sinh đề, chấm thật) bị chặn vì không còn provider AI sẵn sàng: Codex hết hạn; `claude-code`/`agy` chưa xác minh D-01.
  - D-06 (TTS/ASR) chặn Listening và phát âm.

### 18/11/2026 — E-38 Claude Code làm provider chính (người dùng chốt) / DONE
- **Nguồn:** Codex Plus hết hạn. Người dùng yêu cầu thứ tự Claude Code → agy → Codex.
- **`npm.cmd run ai -- status` trước khi đổi** (không gọi model):
  - codex: BLOCKED (BILLING_UNVERIFIED).
  - claude-code: READY.
  - agy: READY (CLI 1.5.11, đã khác bản lúc xác minh 1.4.3; chỉ là thông tin).
  - Extra usage của claude-code và agy cần xác nhận lại trước 20/11.
- **File:**
  - `src/application/ai/subscription-guard.ts`: `CLI_PROVIDERS` theo thứ tự mới, thêm `byPreference`.
  - `src/infrastructure/ai/gateway/gateway.ts`: `status()` sắp theo thứ tự ưu tiên.
  - Test `p2-gateway`, `p2-e11`.
  - Hướng dẫn sử dụng mục 6, 7, 12; DECISIONS E-38.
- **Thử bỏ:** lượt đầu tôi cho gateway tự sắp lại cả thứ tự đã lưu trong job. Cách này làm 15 test failover hỏng, vì phá hợp đồng "chọn theo thứ tự của job". Đã bỏ cách đó; DB thật cũng không có job cũ nào đang chờ.
- **Lệnh:** `npm.cmd run docs:guide`, rồi `npm.cmd run check` → 326/326 test (43 file), build đạt. Sau khi đổi, `ai -- status` liệt kê claude-code READY → agy READY → codex BLOCKED.
- **Giới hạn:** agy và Codex chỉ được tự chuyển sang khi có báo cáo đối chứng D-05.

### 18/11/2026 — E-39 Trích văn bản PDF nguồn / DONE phần code + test
- **Nguồn:** bước kế tiếp đã đề xuất; người dùng "Cho phép bạn cài" dependency.
- **File:**
  - Mới: `src/infrastructure/sources/pdf-text.ts`, `tests/fixtures/make-pdf.ts`, `tests/unit/e39-pdf-text.test.ts`.
  - Sửa: `crawler.ts` (`extractStoredPdf`, `extractPendingPdfs`), `review.ts` (trích đoạn PDF), `src/cli/sources.ts` (`extract`), `src/web/sources.tsx`, `tests/integration/e37-sources.test.ts`.
  - Thư viện và tài liệu: `package.json`/`package-lock.json` (`pdfjs-dist` 6.4.299 exact), hướng dẫn sử dụng mục 5, DECISIONS (E-39), D05.
- **Lệnh và kết quả:**
  - `npm.cmd install pdfjs-dist@6.4.299 --save-exact --omit=optional` làm hỏng Vitest vì thiếu binding rolldown; đã khôi phục bằng `npm.cmd install`.
  - `npx.cmd vitest run tests/unit/e39-pdf-text.test.ts tests/integration/e37-sources.test.ts`: 6/6.
  - `npm.cmd run docs:guide`, rồi `npm.cmd run check`: lint, guide check, typecheck, 329/329 test (44 file), build đều đạt.
- **Giới hạn:**
  - PDF chỉ có ảnh quét thì không trích được chữ (chưa có OCR).
  - Bố cục cột dùng ngưỡng khoảng cách cố định, cần đối chiếu với band descriptors thật sau khi quét.

### 19/11/2026 — Quét tiếp hàng đợi nguồn + duyệt hết / DONE một phần (hàng đợi phình to)
- **Nguồn:** người dùng "cứ chạy hết 1.669 trang vẫn trong hàng đợi rồi duyệt hết đi".
- **Lệnh:** `npm.cmd run sources -- crawl --max-pages 5000`, chạy dữ liệu thật.
  - Lần chạy tải được 2.284 trang, rồi dừng vì một lỗi.
  - Lỗi: hết thời gian chờ khi đọc phần thân trả lời. Đoạn đọc thân nằm ngoài khối bắt lỗi nên làm hỏng cả lượt chạy.
  - Đã sửa trong `crawler.ts`: thân trả lời bị treo thì chỉ trang đó ghi `FAILED`/`TIMEOUT`, lượt chạy vẫn tiếp tục.
  - Đã thêm ca kiểm thử vào `e37-sources`.
- **Duyệt:** dùng script tạm `SourceReview.review` theo lô 100 (đã xóa script). Kết quả `{"requested":2284,"approved":2284,"skipped":[]}`.
- **Trạng thái sau đó:**
  - Tải: QUEUED 10469 · FETCHED 2459 · SKIPPED 290 · FAILED 139.
  - Duyệt: APPROVED 2459.
- **Hàng đợi phình từ 1.669 lên 10.469**, do liên kết mới ở độ sâu 2–3:
  - `ielts.idp.com` 6.458, phần lớn là bản sao theo quốc gia (`/canada/`, `/vietnam/`…).
  - `bxsearch.ielts.idp.com` 1.759 (trang tìm kiếm).
  - `learnenglish.britishcouncil.org` 1.898.
- **Kiểm tra:** `npm.cmd run check` PASS, 330/330 test (44 file), build OK.

### 19/11/2026 — E-40 Lọc hàng đợi quét nguồn / DONE (lượt quét vẫn đang chạy)
- **Nguồn:** người dùng "Lọc rồi quét tiếp", sau đó "oke tiến hành thêm lọc và chạy lại".
- **Code:**
  - Mục `exclude` mới trong `policies/source-seeds.v1.json`.
  - `page.ts`: `compileExcludes`, `isExcluded`.
  - `crawler.ts`: luật được áp khi xếp hàng, ở từng bước chuyển hướng, và qua `applyExclusions` ở đầu mỗi lượt; báo cáo thêm `excluded_from_queue`.
  - CLI in thêm số trang bị loại.
- **Luật lọc:**
  - Bản sao theo quốc gia của IDP, trang tìm kiếm/đặt lịch/tài khoản IDP.
  - LearnEnglish `/user/` và `?page=`.
  - ielts.org `/receiving-organisations/`; tài khoản và danh sách hội đồng của IPA.
  - IDP `?filter`.
- **Kết quả trên dữ liệu thật:**
  - Lần áp luật đầu chuyển 8.176 dòng QUEUED sang SKIPPED.
  - Lượt quét thứ hai bị dừng giữa chừng (TaskStop) để thêm luật `?page=` và `?filter`.
  - Lượt quét thứ ba chạy nền với `--max-pages 5000`. Lúc khởi chạy: FETCHED 4973, QUEUED 11885.
- **Kiểm tra:** thêm 2 ca vào `e37-sources`.

### 19/11/2026 — E-41 Nguồn gốc nội dung `ai_authored`/`learner_owned` (D-05 N10, phần còn lại của C1) / DONE
- **Nguồn:** người dùng "tiếp tục triển khai bước tiếp theo"; N10 đã chốt ở E-36.
- **File:**
  - Mới: `migrations/0014_content_origin.sql`, `src/domain/knowledge/content-origin.ts`, `tests/integration/e41-content-origin.test.ts`.
  - Sửa:
    - `database.ts` (14 là migration dựng lại bảng);
    - kiểu `ContentOrigin` ở `builder-repository`, `qc/ports`, `qc/pipeline`, `release-gate`, `qc4`, `console-queries`, `subscription-guard`;
    - `knowledge-repository.servableItem` (trả `content_origin`);
    - `writing-workflow` (G0 theo nguồn gốc);
    - `contracts/knowledge.v1.schema.json` (enum).
  - Tài liệu: DECISIONS E-41, D05 (C1 xong), hướng dẫn sử dụng (mục Writing và bảng migration tự động).
- **Lệnh:** `npx.cmd vitest run` các file e41, p1-persistence, p1-backup: 19/19. `npm.cmd run check` PASS: 335/335 test (45 file), build OK.
- **Giới hạn:**
  - Chưa có đường tạo nội dung dùng hai nguồn gốc mới (C2–C4).
  - Migration 0014 sẽ áp vào DB thật ở lần mở kế tiếp (có sao lưu trước khi migrate).
- **Bước kế tiếp:** C2, cho AI soạn khung năng lực và rubric Writing Task 2 từ các nguồn đã duyệt. Cần provider thật; hiện `claude-code` READY.

### 19/11/2026 — E-42 AI soạn khung năng lực + rubric Writing Task 2 (D-05 C2) / IN_PROGRESS (v1 chưa có lượt rà soát)
- **Nguồn:** người dùng "Làm C2".
- **Code:**
  - Migration `0015_competency_frameworks.sql`.
  - `src/infrastructure/sources/band-table.ts`; `src/domain/knowledge/framework-checks.ts`.
  - `src/infrastructure/authoring/{framework-sources,gateway-executor}.ts`; `src/application/authoring/framework-authoring.ts`; `src/cli/author.ts` (`npm run author`).
  - API `/api/console/frameworks*`; `src/web/frameworks.tsx` (tab "Khung năng lực").
  - Contract `knowledge.v1`: `competency_framework_result`, `framework_review_result`.
  - Task type `content.author`/`content.review` (`provider-adapter`, `result-contracts`, `task-instructions`).
  - `gatewayFor` nhận `limits`; policy `policies/authoring/wt2-framework.v1.json`.
- **Kiểm tra:** `npm.cmd run check` PASS, 343/343 test (46 file), build OK. Test mới: `e42-framework-authoring` 8/8 (executor giả).
- **Chạy thật** (`npm.cmd run author -- framework`, DB thật đã migrate tới 15, có sao lưu trước):
  - `author -- sources`: đủ 7 nguồn đã duyệt; bảng band descriptors Task 2 có 38 ô.
  - **Soạn: thành công.**
    - Bản nháp `v1`, provider `claude-code` 2.1.304, model `claude-opus-5-5`.
    - 20 năng lực: TR 6, CC 5, LR 5, GRA 4. Kiểm tra tự động 0 lỗi, 0 cảnh báo; mọi trích dẫn có nguyên văn trong nguồn.
    - AI tự nêu giới hạn: một số ô band thấp (LR band 4, GRA band 3, band 0) bị cắt sai ranh giới hàng khi dựng bảng.
  - **Rà soát: bị chặn** `BILLING_UNVERIFIED` trên cả 3 provider (lần chạy `fc33587d…` đã ghi).
    - `claude-code`: kiểm tra ranh giới thấy mục `plugins` mới trong profile runner (`BOUNDARY_CONFIG_PROFILE_plugins`). Trong đó chỉ có `plugin-directory-cache-v2.json` (2,8 MB), do Claude CLI tạo lúc 14:13 trong lượt soạn; không có plugin nào được cài.
    - `agy`: là provider dự phòng nên cần benchmark D-05; `codex`: hết hạn.
  - Không vượt qua kiểm tra ranh giới; chờ người dùng quyết định.
- **Còn thiếu:**
  - Lượt rà soát v1 và quyết định duyệt của người dùng.
  - Sửa ranh giới hàng band thấp ở trang 9 của bảng band descriptors.

### 19/11/2026 — E-43 Phạm vi Speaking / DONE (quyết định)
- Người dùng chốt: Speaking chỉ ở dạng văn bản (lên ý tưởng). Nói thật và phát âm người dùng tự kiểm tra ngoài ứng dụng.
- Đã ghi DECISIONS E-43; D-06 thu hẹp còn nguồn audio Listening.

### 19/11/2026 — E-44 Audio Listening: thu sẵn + TTS cục bộ / DONE phần code, chờ tải engine
- **Nguồn:** người dùng chọn "Cả hai nguồn".
- **Code:**
  - `page.ts` (`htmlAudioLinks`, `audioFormat`, `normalizeUrl(..., {audio})`).
  - `crawler.ts` (audio là lá, `media_hosts`, `max_audio_bytes`, `discoverAudio`).
  - `review.ts` (lọc `media`, `audio()`); route `GET /api/console/sources/:id/audio`; `sources.tsx` (lọc dạng, nút Nghe).
  - `sources -- discover-audio`; `policies/source-seeds.v1.json` (`media_hosts`, `max_audio_bytes`).
  - `src/infrastructure/audio/tts.ts` + `src/cli/tts.ts` (`npm run tts`).
- **Kiểm tra:**
  - Test mới: `e44-audio-sources` 2/2, `e44-tts` 3/3 (engine giả).
  - `npm.cmd run check` PASS: 348/348 test (48 file), build OK.
- **Chưa chạy trên dữ liệu thật:** `discover-audio` phải đợi lượt quét nền (code cũ) xong, nếu không audio sẽ bị đánh `UNSUPPORTED_TYPE`.
- **Chờ người dùng cho phép tải** (dung lượng đã đọc bằng HEAD):
  - `piper_windows_amd64.zip` 22,5 MB (GitHub rhasspy/piper, release 2023.11.14-2);
  - giọng `.onnx` 63,2 MB mỗi giọng (Hugging Face rhasspy/piper-voices v1.0.0).
- **Cài TTS (cùng ngày, người dùng cho phép):**
  - Đã tải Piper 2023.11.14-2 và 3 giọng Anh-Anh. SHA-256 các giọng khớp hash Hugging Face; hash zip/exe ghi ở DECISIONS E-44.
  - Lần đầu tải giọng `alan` bị ngắt ở 676 KB; đã xóa và tải lại đủ.
  - `npm.cmd run tts -- status`: "Sẵn sàng", 3 giọng.
  - `tts -- say` thật với cả 3 giọng đều thành công: alan 401 KB (khoảng 3,3 giây cho cả lệnh), jenny_dioco 261 KB, northern_english_male 224 KB. WAV lưu vào kho media.

### 19/11/2026 — E-45 Cho phép cache danh mục plugin trong profile Claude / DONE
- **Nguồn:** người dùng "Cho phép cache".
- **Code:** `probe-boundary.ts` (`isClaudePluginCacheOnly`); test `e45-claude-plugin-cache` 3/3, `e21-claude-agy` vẫn đạt.
- **Kết quả thật:** `npm.cmd run ai -- status` báo `claude-code: READY`.
- **Đính chính:** hạn xác nhận lại extra usage là 18/12/2026, không phải 20/11.
- Đã chạy lại lượt AI rà soát khung v1 (`npm.cmd run author -- review v1`); kết quả ghi ở mục kế tiếp.
- **Rà soát v1 bằng AI thật** (`author -- review v1`, `claude-code`/`claude-opus-5-5`, lần chạy `6eaee90a…`): verdict **revise**, 4 lỗi, 8 cảnh báo.
  - **Lỗi:**
    - Mọi cạnh có `basis` null; người rà soát coi `supports`/`component_of` như quan hệ tiên quyết, vì dữ liệu chưa định nghĩa các loại cạnh.
    - `address_all_prompt_parts` thêm yêu cầu "cân bằng" mà nguồn không có.
    - `address_all_prompt_parts` trùng một phần với `maintain_relevance_focus`.
    - Một trích dẫn (luật trừ bài chép đề, Band 1) không hỗ trợ năng lực mà nó gắn vào.
  - **Cảnh báo:**
    - Ngưỡng đạt/chưa đạt dùng từ ngữ ở các mức Band khác nhau mà không nêu quy tắc.
    - Ghi chú "bài ngắn thì chưa đủ kết luận" mâu thuẫn với nguồn: thiếu độ dài cũng là bằng chứng.
    - Các năng lực chồng lấn hoặc gộp hai hành vi (mở bài/kết luận, văn phong/ngôn ngữ thuộc lòng, câu phức/độ chính xác).
  - Người rà soát nêu lại: văn bản band 0–4 của bảng dựng lại bị cắt.
- **Trạng thái v1:** DRAFT, đã có rà soát, chưa quyết định.

### 19/11/2026 — E-46 Khung năng lực v2 / DONE phần code + chạy thật; chờ người dùng duyệt
- **Nguồn:** người dùng "Làm v2".
- **Code:**
  - `pdf-text.ts` (đường kẻ ngang); `crawler.ts` (`.rules.json` và tạo bù); `band-table.ts` (ranh giới theo đường kẻ, ô gộp, dấu câu).
  - `framework-sources.ts` đọc file đường kẻ; `task-instructions.ts` (định nghĩa cạnh, quy tắc met/not met, khối revision).
  - `framework-authoring.ts` (`author(…, reviseFrom)`, `revised_from`); `author.ts` (`--revise`); `frameworks.tsx`.
- **Kiểm tra:** `npm.cmd run check` PASS, 354/354 test (49 file), build OK.
- **Chạy thật:**
  - `npm.cmd run sources -- extract`: "Đã trích chữ 239 PDF, lỗi 0" (tạo bù `.rules.json`).
  - `author -- sources`: bảng Task 2 có 37 ô.
  - `author -- framework --revise v1`: bản **v2**, 20 năng lực (TR 6, CC 5, LR 5, GRA 4), `claude-code`/`claude-opus-5-5`. Kiểm tra tự động 0 lỗi, 0 cảnh báo.
    - Theo góp ý, AI đã bỏ mọi cạnh `supports`, chỉ giữ `confusable_with` và một `component_of`; tổng 21 cạnh, không có cạnh tiên quyết.
  - **Rà soát v2: đạt (pass), 0 lỗi, 7 cảnh báo:**
    - một cạnh `component_of` mâu thuẫn với giới hạn suy luận;
    - hai trích dẫn chưa thật sát;
    - `sentence_accuracy` vẫn trộn từ ngữ của hai mức Band;
    - lặp ý "repetition" ở nhiều năng lực;
    - chồng lấn giữa `precise_word_choice` và `style_appropriacy`;
    - quy tắc "chưa đủ kết luận" chưa nhất quán.
  - AI tự nêu giới hạn: không trích được nguyên câu bị ngắt dòng. Thực tế phép đối chiếu đã bỏ qua khác biệt xuống dòng, nhưng chỉ dẫn chưa nói điều này.
- **Trạng thái:** v1 DRAFT (đã rà soát, revise); v2 DRAFT (đã rà soát, pass). Chờ người dùng duyệt ở tab Khung năng lực.

### 19/11/2026 — Khung năng lực v3 (soạn lại từ v2) / chờ người dùng duyệt
- **Nguồn:** người dùng "Soạn v3".
- **Thay đổi chỉ dẫn trước khi chạy:** báo cho AI biết phép đối chiếu trích dẫn bỏ qua xuống dòng, khoảng trắng, hoa/thường và kiểu dấu ngoặc. `e42` vẫn 10/10.
- **Chạy thật** `npm.cmd run author -- framework --revise v2`:
  - Bản **v3**: 20 năng lực (TR 6, CC 5, LR 5, GRA 4), 21 cạnh, `claude-code`/`claude-opus-5-5`. Kiểm tra tự động 0 lỗi, 0 cảnh báo.
  - **Rà soát v3: đạt, 0 lỗi, 6 cảnh báo**. Cả 6 đều mới, không lặp lại cảnh báo của v2:
    - hợp đồng bằng chứng của `sentence_accuracy` chưa nhất quán;
    - cách "mở bài" chưa được thao tác hóa;
    - thiếu năng lực cho "lạm dụng cụm từ thuộc lòng" (Band 4/3);
    - một trích dẫn về độ dài chưa sát với "range";
    - ghi chú tổng hợp chưa nêu các điều kiện chặn của Band 0/1;
    - tiêu chí đạt/chưa đạt cho "phát triển ý" đặt ngưỡng thấp. Đây là giới hạn của cách ghi nhị phân met/not met, soạn lại không giải quyết được.
- **Trạng thái:** v1, v2, v3 đều DRAFT và đã rà soát; v3 là bản tốt nhất. Chờ người dùng duyệt.
