# Nghiệm thu P2 — 20/10/2026 (IN_PROGRESS, BLOCKED chờ D-01)

## Phạm vi và trạng thái
P2 theo [IMPLEMENTATION_PLAN](IMPLEMENTATION_PLAN.md). Quyết định: E-08 (tri thức/QC), E-09 (gateway), E-10 (session/console/worker) trong [DECISIONS](DECISIONS.md). Windows 11, Node 22.18.0, npm 10.9.3; không thêm dependency. Chỉ nội dung synthetic tự viết; không gọi inference thật trong code hay test.

**P2 chưa DONE**: kế hoạch ghi "Fake-only demo chưa hoàn tất P2". Mọi phần không phụ thuộc người dùng đã có code + test; còn thiếu một provider thật được xác minh (D-01) và chạy QC4/QC2–3 bằng provider đó.

## Mapping yêu cầu → code → test
| Yêu cầu / nguồn | Code | Kiểm chứng |
|---|---|---|
| P2-1 Sáu đầu ra Phần 5 có version + validator (05 §5.D) | `contracts/knowledge.v1.schema.json`, `contracts/knowledge/{qc-spec,ingestion-playbook}.v1.json`, `src/infrastructure/contracts/{validate,knowledge-specs}.ts`; tổng quan [KNOWLEDGE_OUTPUTS](KNOWLEDGE_OUTPUTS.md) | tests/contract/knowledge-schemas (12 ca) |
| 8 nhóm trường quản trị, 6 loại phát biểu, 5 trục kiểm định (05 §2.B, §4.A–B) | `governance` trong knowledge.v1 | như trên |
| Nguồn chưa rõ quyền chặn phát hành (05 §2.D, D-05) | `src/domain/knowledge/source-rights.ts`; QC1_SOURCE_*; release gate kiểm bản ghi nguồn mới nhất | knowledge-schemas; p2-pipeline "unclear rights", "withdrawn source rights" |
| Bao phủ: thiếu nhóm ca chỉ chặn vai trò phụ thuộc (05 §5.C QC1) | `src/domain/knowledge/coverage.ts`; grants trong release manifest | knowledge-schemas; p2-pipeline happy path (practice ✓, independent_verification ✗) |
| P2-2 Pipeline 6 bước có log (05 §5.A–B) | `src/application/qc/pipeline.ts`, bảng `package_requests`, `staging_*`, `pipeline_events`, `package_bundles` (migration 0002) | p2-pipeline (13 ca) |
| QC1–QC4; regex chỉ là bộ lọc sơ bộ; phần ngữ nghĩa cần xác nhận trên đúng hash (05 §5.C) | `src/application/qc/qc-checks.ts`, `attest`, `src/domain/knowledge/qc4.ts` | p2-pipeline: QC pass, QC4 mismatch/competing/NOT_RUN, FakeAdapter không qualify gói sourced |
| Tách giải mù / đối chiếu; cắt quyền trước truy xuất (04 §2.B, 05 §6.A) | `src/application/context/scoped-reader.ts` (index quyền trước khi mở file), đáp án là khối riêng; job + manifest riêng cho verify | p2-pipeline: payload giải mù không chứa key/mục tiêu đo/họ bài; reader blind_solver bị từ chối và không gọi đọc file |
| Publish đúng hash đã QC; sửa sau QC bị chặn (06 §3, QUALITY_AND_DATA ca 5) | `src/domain/knowledge/release-gate.ts`; release đọc lại đĩa + tính lại hash trong transaction | p2-pipeline: hash sai, sửa staging → không đóng băng lại cùng version, v2 chưa QC, file bị sửa trên đĩa, đổi qc-spec, quyền nguồn rút lại |
| Suspend/retire, thu hồi lan truyền, vô hiệu cache, truy vết ngược, bảo vệ hai chiều (05 §4.C, §7.A; 06 §5.B.5; 06A ca 9) | `pipeline.withdraw/revoke`, `src/infrastructure/sqlite/{result-cache,builder-repository}.ts` (`impactOf`), `review_items` | p2-pipeline: revoke item → suspended, không cấp phát, cache INVALIDATED, review nêu 1 lượt học/2 nhận định (đạt + chưa đạt), effective = 0, lịch sử giữ; suspend → retire không kích hoạt lại |
| P2-3 subscriptionGuard 6 chốt + D-01 (06A §8) | `src/application/ai/subscription-guard.ts` | p2-gateway: 20 trường hợp thiếu căn cứ → BILLING_UNVERIFIED; NEEDS_LOGIN → AUTH_EXPIRED; thiếu năng lực; thiếu đồng ý dữ liệu |
| Allowlist env, chặn API key (06A ca 4) | `src/infrastructure/ai/gateway/env-allowlist.ts` | p2-gateway; CLI giả báo `billing_vars=0` dù env cha có OPENAI_API_KEY |
| Profile isolation, sandbox sạch (06A §3.B, §5.C.3) | `gateway/isolation.ts` | p2-gateway: runner dir trong repo/var bị từ chối; sandbox chặn AGENTS.md/.db; CLI giả thấy `cwd_entries=0` |
| Entrypoint đã xác minh, không spawn shim (D-04) | `gateway/entrypoint.ts`, `bounded-process.ts` | p2-gateway: `.cmd` bị từ chối, đường dẫn tương đối bị từ chối, sha256 khớp |
| Redaction (QUALITY_AND_DATA) | `gateway/redaction.ts`; dùng cho lỗi run, evidence | p2-gateway |
| Envelope parser 2 lớp (06A §5.C.5, ca 6) | `gateway/envelope.ts` | p2-gateway: layout chưa verified → chặn; văn xuôi quanh JSON, sai schema_version, sai hợp đồng → INVALID_SCHEMA; lỗi không phân loại → BILLING_UNVERIFIED |
| Adapter 3 CLI ở trạng thái chưa xác minh; gateway chặn thực thi | `gateway/cli-adapters.ts` (claude-code/codex/agy NEEDS_VERIFICATION theo E-11), `gateway/gateway.ts` | p2-gateway: status cả 3 BLOCKED, không observe/spawn; adapter không permit không gọi process; worker sau gateway → job FAILED BILLING_UNVERIFIED, 0 observation |
| Quyền hãng nhận dữ liệu (06A §1.4) | `ai_data_consents`, `dataClassesFor`, `AiAccountsRepository` | p2-gateway: provider sẵn sàng cho synthetic vẫn bị chặn với learner_submission |
| P2-4 Session/CSRF trước API ghi đầu tiên | `src/server/session.ts`, `src/server/app.ts` | p2-console: cookie HttpOnly/SameSite=Strict; thiếu session 401; thiếu Origin/CSRF/khác site 403; trường lạ 400 |
| Console 3 tab, metadata mặc định, mở nội dung ghi exposure (06 §3–4) | `src/application/qc/console.ts`, `src/infrastructure/sqlite/console-queries.ts`, `src/web/{console.tsx,api.ts,main.tsx}` | p2-console: list không chứa nội dung; mở answer_key ghi answer+explanation trước, idempotent; novelty → exposed |
| Dry-run không chạm hồ sơ người học (06 §4.3) | `ConsoleService.dryRun`, worker `claimOptions.scopes` | p2-console: learner attempts/observations/evidence = 0; runs không lộ văn bản |
| Worker entrypoint chỉ FakeAdapter khi gateway chặn | `src/worker/main.ts` (`npm run worker`) | chạy tay: không `--fake` → exit 3 kèm lý do; `--fake --once` → `{"status":"IDLE"}` |
| CLI backup/restore dùng P1-4 | `src/cli/backup.ts` (`npm run backup -- create|restore|promote`) | chạy tay: create OK (2 migrations), restore vào thư mục mới và verify |

## Kết quả lệnh (20/10/2026)
Sau E-11: `npm.cmd run check` cuối đạt lint, typecheck, **163 tests/16 file**, build backend/web. Bảy lượt đạt và các lỗi đã sửa được ghi trong PROGRESS. Chỉ CLI giả; CIM trong môi trường triển khai trả Access denied, nên test taskkill dùng PID synthetic thực tế; chưa chứng minh CIM hay CLI Codex thật.

Mapping bổ sung E-11/E-12 (kết quả từng lượt trong PROGRESS):

| Mục | Yêu cầu → code | Kiểm chứng |
|---|---|---|
| 1 | E-11.4 / 06A §3: agy; `provider.v2.schema.json`, `0003_provider_agy.sql`, `database.ts`, `cli-adapters.ts`, `gateway.ts` | p2-e11: nâng DB v2 có dữ liệu gemini-cli, giữ hàng/trigger/FK và schema v1; v2 nhận agy; provider cũ bị chặn; hồi quy queue/QC/backup |
| 2 | E-11.1 / 06A §3.B: `isolation.ts`, gateway kiểm CODEX_HOME ứng viên | p2-e11: evidence khác cơ chế bị chặn; p2-gateway: profile trong repo/var bị chặn |
| 3 | E-11.2 / 06A §1.4: `subscription-guard.ts`, `ai-accounts-repository.ts`, `src/cli/ai.ts` | p2-e11: chưa READY không được cấp 5 loại, không lan provider, audio vẫn chặn khi VERIFIED và có consent |
| 4 | E-11.5 / 06A §8: guard + extra_usage_confirmations + CLI confirm-extra-usage | p2-e11: đúng 30 ngày, +1 ms, xác nhận mới, tương lai, append-only |
| 5 | E-11.3 / 03 §2 và IMPLEMENTATION_PLAN P3 | Đối chiếu tài liệu; chỉ hỗ trợ văn bản, không code P3/chấm audio |
| 6 | D-01 / QUALITY_AND_DATA ca 3–4: `verify-codex.ts`, `bounded-process.ts`, `envelope.ts`, CLI verify | p2-e11 + fake-codex: contained/leaky, empty/failed, API-key login bị chặn trước prompt, timeout/cancel kết thúc root + child, thiếu process table không PASS; runner spike |
| 7 | E-11 / hướng dẫn Codex bên dưới | Đối chiếu với argv thật của CLI ứng dụng và kiểu ProviderEvidence; chưa chạy CLI Codex thật |

- `npm.cmd run check`: lint, typecheck, 149 tests/15 file, build backend + web đạt.
- `npm.cmd run ai -- status`, `npm.cmd run worker -- --once` (exit 3), `npm.cmd run worker -- --fake --once`, `npm.cmd run backup -- create`, `npm.cmd run backup -- restore <backup> <scratch>`; HTTP smoke tới `127.0.0.1:4317`: health 200, session cookie đúng thuộc tính, packages 401/200, ghi thiếu CSRF 403, gateway 3 provider BILLING_UNVERIFIED.

## Việc người dùng cần làm để đóng D-01 cho Codex

**Cập nhật E-13:** Đã có lượt Codex thật do người dùng chạy ngày 20/10/2026: login ChatGPT, JSON hợp lệ, timeout/cancel có cây 2 tiến trình. Rà soát log cho thấy các lệnh đọc thử bị `blocked by policy` trước khi thực thi; không đủ để công nhận ranh giới đọc. Profile riêng không có config.toml/MCP/plugin/hook tùy chỉnh trong các vị trí đã kiểm tra; người dùng xác nhận gói Plus. Báo cáo gốc được giữ nguyên trong `var/ai/evidence.json`, chưa nạp thành VERIFIED.

Verifier sau E-13 ghi probe phản hồi là `EXPECTED_REPLY_READ_BOUNDARY_UNVERIFIED`, không báo ĐẠT file-scope và trả exit 2. Gateway chặn báo cáo cũ thiếu phương pháp kiểm chứng bằng `READ_BOUNDARY_UNVERIFIED`, kể cả đã ghi `passed: true`. Cần collector/kiểm tra thực thi độc lập chứng minh phạm vi đọc (gồm ca được phép đọc làm đối chứng, ca ngoài phạm vi và các đường công cụ/cấu hình kế thừa) trên đúng runner trước khi xét `enforced_boundary` và tham chiếu bằng chứng. Chưa có collector đó; không yêu cầu người dùng chạy lại cùng cấu hình hoặc sửa cờ bằng tay. Các bước 4–6 dưới đây chỉ tiếp tục khi điều kiện này được giải quyết.

E-11 chọn **Codex qua ChatGPT** trước. Chạy từ root repository trong **terminal riêng do người dùng mở**, không qua relay. Không đọc/copy file auth, không đưa token/cookie vào evidence. `CODEX_HOME` chỉ là cơ chế ứng viên; `read-only` không giới hạn phạm vi đọc. Nếu probe đọc được bí mật synthetic thì giữ BLOCKED và cần cơ chế giới hạn đọc mạnh hơn trước khi thử lại.

1. Chọn entrypoint native (chỉ liệt kê executable), tạo profile riêng ngoài repo/var và đăng nhập ChatGPT:

```powershell
$codexExe = Get-ChildItem "$env:LOCALAPPDATA\OpenAI\Codex\bin\*\codex.exe" -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
if (-not $codexExe) { throw 'Cần đường dẫn codex.exe native đã cài; không dùng shim .cmd/.ps1' }
$codexProfile = Join-Path $env:LOCALAPPDATA 'study-english\runners\codex-main'
New-Item -ItemType Directory -Force -Path $codexProfile | Out-Null
$env:CODEX_HOME = $codexProfile
& $codexExe login
```

Chọn đăng nhập ChatGPT, không API key. Giữ profile này riêng cho app; không thêm MCP/plugin/hook hoặc cấu hình kế thừa gọi dịch vụ ngoài. Không sao chép profile thường dùng. Người dùng kiểm tra gói ChatGPT bao gồm Codex CLI và chọn model thuộc gói; `login status` chỉ chứng minh phương thức đăng nhập.

2. Trước bất kỳ prompt synthetic nào, người dùng kiểm tra trong tài khoản rằng mua thêm credit/extra usage/auto-recharge đang **TẮT**. Chỉ sau khi đã xác nhận thực tế mới chạy:

```powershell
npm.cmd run ai -- account codex-main codex "Codex chính" "$codexProfile"
npm.cmd run ai -- confirm-extra-usage codex off
```

Lệnh ghi thời điểm hiện tại, hiệu lực đến đúng 30 ngày; quá 30 ngày gateway và lệnh verify chặn. Xác nhận này không tự xác minh provider. Lặp lại lệnh `confirm-extra-usage` sau mỗi lần kiểm tra thực tế, tối đa 30 ngày một lần.

3. Thu bằng chứng tự động (người dùng chạy; lượt triển khai này **không chạy CLI thật**):

```powershell
$codexModel = Read-Host 'Nhập model Codex đã xác nhận nằm trong gói'
npm.cmd run ai -- verify codex --profile "$codexProfile" --profile-id codex-main --entrypoint "$codexExe" --model "$codexModel" --out var/ai/evidence.json
```

Lệnh không ghi đè file đã có; khi chạy lại dùng tên mới như `var/ai/evidence-2.json`. Nó thực hiện các bước thu thập 1/4/5/6 của quy trình D-01: phiên bản + SHA-256 executable; `codex login status` với đúng CODEX_HOME (chỉ lưu loại đăng nhập); một prompt synthetic quan sát JSONL/envelope; 5 probe absolute path, `..`, junction, AGENTS.md kế thừa, công cụ/plugin/hook; timeout và cancel qua supervisor. Khoảng 8 prompt dùng quota thuê bao, không dùng dữ liệu học. Sandbox và bí mật synthetic được dọn sau khi chạy.

`observations.file_scope` chỉ ghi kết quả probe; tất cả probe dựa trên phản hồi giữ `passed: false`, kể cả không lộ bí mật. Phải đối chiếu cơ chế quyền thực tế: không coi lời từ chối hay không xuất bí mật là chứng minh sandbox chặn đọc. Probe lỗi/empty không được tính đạt. Process-control cần thấy ít nhất root + child và cả hai đã chết; CIM bị từ chối hoặc không thấy child thì giữ chưa đạt, không bỏ qua quyền để chạy. Nếu cần cấu hình argv khác, lưu mảng JSON vào file và truyền `--argv` theo CLI; không dùng cờ bỏ qua sandbox/quyền. Cấu hình thay đổi phải thu bằng chứng lại.

4. Xem báo cáo không bí mật:

```powershell
notepad var/ai/evidence.json
```

Định dạng gồm `evidence: ProviderEvidence`, `envelope`, `observations` và `pending_user_confirmation`. Script **không tự đặt VERIFIED**, không tự xác nhận extra usage, gói hay plugins. Chỉ khi có căn cứ thực tế và mọi ca đạt, người dùng cập nhật:

- `evidence.entitlement.plan`, `source`, `checked_at`, `applies_to_cli: true` theo gói thực tế; `models_allowed` đúng model đã thử.
- `evidence.isolation.plugins_disabled: true` chỉ sau xác nhận profile không nạp MCP/plugin/hook; giữ bằng chứng cơ chế giới hạn đọc đã kiểm tra. Không sửa ca fail thành pass bằng tay.
- Kiểm tra layout từ `observations.synthetic_run` và `envelope`; bổ sung `error_patterns` từ lỗi thực tế nếu có (không bịa hoặc cố đốt quota). Chỉ khi đúng hợp đồng mới đặt `envelope.status: "VERIFIED"`, `evidence.output_contract.envelope_verified: true`. Lỗi chưa biết vẫn chặn BILLING_UNVERIFIED.
- Giữ `extra_usage` trong báo cáo ở trạng thái chưa xác nhận; gateway dùng bản ghi người dùng đã tạo ở bước 2. `auth.observed` chỉ có phương thức đăng nhập.

5. Nạp evidence, sau khi gateway công nhận READY mới cấp đúng 5 loại dữ liệu E-11:

```powershell
npm.cmd run ai -- evidence var/ai/evidence.json
npm.cmd run ai -- consent codex approved grant
npm.cmd run ai -- status
```

`evidence` kiểm lại hash/version/login, không gọi inference; còn thiếu căn cứ thì giữ NEEDS_VERIFICATION và exit 2. Consent gồm synthetic_fixture, knowledge_content, answer_key, learner_submission, learner_profile; `learner_audio` luôn bị chặn ngay cả với provider VERIFIED. Quyền không tự lan sang Claude/agy.

6. Sau D-01 đạt, chạy QC4/QC2–3 thật trên gói synthetic theo pipeline P2 và ghi kết quả mới; chỉ lúc đó mới xét P2 DONE. Bộ test CLI giả trong repository không đóng D-01/D-04.

## Giới hạn
- Đường thực thi gateway chỉ được chứng minh với CLI giả (node.exe + script fixture) và evidence synthetic; argv/envelope/cơ chế cô lập của CLI thật là ứng viên chưa xác minh.
- QC2/QC3 ngữ nghĩa hiện là xác nhận thủ công; QC4 chỉ chạy bằng FakeAdapter (chỉ hợp lệ cho gói synthetic).
- Session lưu trong bộ nhớ (restart server → lấy session mới). Chưa có Playwright E2E cho UI; UI chỉ được kiểm qua build và API test.
- Cache chưa nối vào luồng chấm học (P3/P5); worker P2 chỉ xử lý job dry-run.
