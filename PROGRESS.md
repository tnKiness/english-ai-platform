# Tiến độ và trạng thái code

Cập nhật: 20/10/2026 — Asia/Bangkok.

## Trạng thái thực tế
- Hoàn tất lượt rà soát 8 tài liệu 00–06A và tạo bộ hướng dẫn triển khai.
- P0 hoàn tất: skeleton Node/TypeScript/React/Vite/Fastify, schema v1 (15 definition), state guard, fake adapter, spike Windows runner và SQLite backup. Chi tiết: [P0_ACCEPTANCE](docs/engineering/P0_ACCEPTANCE.md), [P0_DATA_AND_STATE](docs/engineering/P0_DATA_AND_STATE.md), [README](README.md).
- P1 hoàn tất ở mức thư viện có integration test SQLite thật: migrations, JSON/media bất biến, repositories, Rule Engine thuần, queue lease/fencing/retry/cancel, backup/restore phối hợp. Chi tiết: [P1_ACCEPTANCE](docs/engineering/P1_ACCEPTANCE.md), quyết định E-07.
- P2 BLOCKED chờ D-01: đã có 6 đầu ra Phần 5, pipeline staging + QC1–4, phát hành đúng hash, thu hồi lan truyền + cache, gateway chặn thực thi khi thiếu căn cứ, session/CSRF, Console 3 tab, worker/backup CLI. Chi tiết: [P2_ACCEPTANCE](docs/engineering/P2_ACCEPTANCE.md).
- P3 hoàn tất phần lát cắt học trên gói synthetic: P3-1 (khung học 5 màn, 3 chế độ guided/self_practice/exam, autosave server qua session/CSRF), P3-2 (vòng Writing khép kín với FakeAdapter + nội dung synthetic, xếp lịch 7B/Bước 9 và Opportunity-to-Use, giữ giới hạn D-02), P3-3 (gợi mở theo nấc chỉ lưu server, cắt quyền trước truy xuất, assistance_events idempotent, chỉ bản sửa mới mới kích hoạt chấm lại), P3-4 (Reading trong luồng học: chỉ cấp item đã qua QC4 + phát hành, đáp án cạnh tranh hợp lệ, Not Given đúng nghĩa, cắt quyền HTTP payload trước Nấc 3, thu hồi ngừng cấp phát ngay; Audio mẫu cục bộ theo D-06/E-11: thu/phát vào kho media có SHA-256, ASR unavailable, transcript người học tách biệt với audio gốc, không bao giờ gửi `learner_audio` vào job AI). Chi tiết: [P3_ACCEPTANCE](docs/engineering/P3_ACCEPTANCE.md), quyết định E-18, E-19. Chưa bật báo điểm Band hay hồ sơ năng lực chính thức (chờ D-02, D-05) và chưa chọn ASR/chấm phát âm (chờ D-06).
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
| P2 | Builder/QC + một adapter thật đủ điều kiện | DONE | P2_ACCEPTANCE (mục "QC thật bằng Codex"); D-01 đóng cho Codex (READY); QC1–QC4 thật trên gói synthetic → release → revoke có truy vết (`npm.cmd run qc:real`); check 217/217. Còn mở: D-01 cho claude-code/agy; QC2/QC3 ngữ nghĩa vẫn là xác nhận của người/AI lập trình trên nội dung synthetic |
| P3 | Vòng Writing + Reading giải mù + audio mẫu | DONE | [P3_ACCEPTANCE](docs/engineering/P3_ACCEPTANCE.md) (E-18, E-19); P3-1…P3-4 đầy đủ trên gói synthetic (`tests/integration/p3-learning.test.ts` 5/5, `tests/integration/p3-reading.test.ts` 4/4; bộ test P0–P3 187/187 trong sandbox agy; lint/typecheck/build đạt). Phụ thuộc người dùng vẫn mở đúng quy định: D-02 (chính sách ngưỡng năng lực/Band), D-05 (gói nội dung thật & bộ đối chứng), D-06 (công cụ ASR/chấm phát âm) |
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
