# Quyết định và điểm còn mở

Ngày lập: 19/10/2026. Các quy định engineering là bổ sung triển khai theo ủy quyền của người dùng; không được diễn đạt thành quyết định nghiệp vụ đã chốt trước đó.

## Quyết định triển khai khởi đầu
- E-13 (20/10/2026, sửa kiểm chứng D-01 theo 06A §5.C.3/§10.B ca 11): probe qua model chỉ là quan sát hành vi. `CANNOT_READ`, `OK` hoặc công cụ báo `blocked by policy` không chứng minh ranh giới đọc đã được thực thi; verifier ghi `passed: false`, `method: model_reply` và lý do chưa kết luận. Gateway yêu cầu `file_scope_test.method: enforced_boundary` cùng `enforcement_evidence_ref` không rỗng ngoài các ca đã đạt; báo cáo cũ thiếu phương pháp bị chặn `READ_BOUNDARY_UNVERIFIED`. Đây là yêu cầu bằng chứng được rà soát độc lập, không phải một cơ chế sandbox mới hay chữ ký xác thực báo cáo. Chưa có collector kiểm chứng ranh giới thực thi trên máy thật; không sửa các trường bằng tay để vượt cổng. Fixture dùng bằng chứng synthetic chỉ kiểm tra guard, không đóng D-01.
- E-14 (20/10/2026, áp dụng kỹ thuật E-13, đảo ngược được; không đóng D-01): bộ thu `npm run ai -- probe-boundary codex` dùng `codex sandbox` (không gọi model) với đúng entrypoint, layout `<workspace>/<runId>/work`, env allowlist, `CODEX_HOME`, `sandbox_mode` và các `-c` của argv gateway; argv có cờ khác không tái tạo được → INCONCLUSIVE. Chỉ xuất `file_scope_test` (`enforced_boundary`, tham chiếu báo cáo) khi mọi ca cấm bị chặn và ca đối chứng đọc được; chỉ ánh xạ `absolute_path`, `dotdot`, `symlink_junction` — `inherited_config`, `plugins_hooks` chạy trong tiến trình Codex ngoài sandbox nên không có bằng chứng OS. Gateway đọc lại báo cáo trước mỗi lần chạy, đòi khớp SHA-256/version, profile, workspace (`C:\se-runner\work` khi người dùng đã tạo, ngược lại `%TEMP%` cũ không khớp báo cáo nào) và cấu hình sandbox; lệch → `READ_BOUNDARY_UNVERIFIED` + `BOUNDARY_*`. Probe thật 20/10/2026: sandbox mặc định chạy dưới chính token người dùng nên ACL không tách được → argv ứng viên Codex thêm `-c windows.sandbox="elevated"` (chạy dưới `CodexSandboxOffline`). Kết quả chi tiết: [D01_CODEX_READ_BOUNDARY](D01_CODEX_READ_BOUNDARY.md).
- E-01: Giữ modular monolith và thứ tự dữ liệu → Builder/QC → vòng học → chịu lỗi → mở rộng theo 06 §6. Không thêm dịch vụ cloud, vector DB hoặc API trả phí.
- E-02: Cấu trúc và stack dự kiến ở PROJECT_STRUCTURE; phiên bản và SQLite driver chờ P0 kiểm chứng. Có thể điều chỉnh kỹ thuật có căn cứ mà không đổi nghiệp vụ.
- E-03: Adapter giả lập dùng để phát triển đường lỗi; adapter thật mặc định chưa sẵn sàng. Chưa đủ ba provider không chặn code lõi; không tuyên bố đã hoàn thành nghiệm thu đa provider.
- E-04: Các thay đổi làm rõ EOF, sandbox, idempotency trong 06/06A là sửa mô tả kỹ thuật để giữ đúng mục tiêu bảo vệ đã chốt; không giảm yêu cầu.
- E-05 (19/10/2026, áp dụng kỹ thuật P0): triển khai stack E-02 với Node 22.18.0/npm 10.9.3, TypeScript/React/Vite/Fastify/Ajv/Vitest và better-sqlite3 13.0.3; phiên bản exact trong package.json và lockfile. Chọn driver sau khi spike native Windows, transaction và online backup/restore đạt. Playwright hoãn tới luồng UI thực tế; chưa có worker/database vận hành. ERD, schema và state v1 ở P0_DATA_AND_STATE; bằng chứng ở P0_ACCEPTANCE. Không thay đổi các ngưỡng sư phạm.
- E-06 (19/10/2026, theo yêu cầu người dùng, công cụ lập trình): thêm relay `scripts/relay` để một nhiệm vụ code chạy lần lượt qua Claude Code → Codex → Antigravity (Gemini) và tự chuyển nền tảng khi hết quota/rate limit/mất đăng nhập/quá thời gian. Đây là tooling cho AI lập trình, **không** phải AI Gateway của ứng dụng (P2) và không đóng D-01. Chỉ dùng đăng nhập thuê bao: gỡ biến API key/base URL khỏi tiến trình con, preflight chặn Claude nếu không phải `claude.ai`, chặn Codex nếu không phải ChatGPT; agy chưa có lệnh báo loại gói nên ghi CHƯA XÁC MINH. Không dùng cờ bỏ qua sandbox/quyền; Codex `workspace-write`, Claude `acceptEdits` + allowlist lệnh, agy `--sandbox --mode accept-edits`. Lỗi không phải quota thì dừng, không chuyển tiếp. Mỗi lúc một relay (lock). Có thể đảo ngược.
- E-07 (20/10/2026, áp dụng kỹ thuật P1; có thể đảo ngược bằng migration/code mới): cụ thể hóa persistence, queue và backup P1. Không thêm dependency.
  - Migrations SQL đánh số `migrations/NNNN_name.sql`, checksum lưu ở `schema_migrations`; sửa file đã áp dụng thì từ chối mở DB; có hook `beforeMigrate` để backup trước khi áp migration mới lên DB đã có dữ liệu. Bảng lịch sử (submissions, snapshots, observations, exposure/assistance, json/media index, revocations, release_events, job_results…) có trigger chặn UPDATE/DELETE.
  - JSON store: canonical JSON (khóa sắp xếp) + SHA-256, ghi một lần cho mỗi (kind,id,version), đường dẫn `kind/id/version.json`. Media content-addressed `ab/<sha>.<ext>`. Nội dung bài nộp (text) lưu trong SQLite vì là dữ liệu người học (06 §5.B.1); audio đi qua media store.
  - Một `evidence_source` cho mỗi attempt (UNIQUE attempt_id chỉ ở bảng này); bản sửa và tái đánh giá dùng chung nguồn. Exposure tính cho người dùng duy nhất bất kể surface/scope (dry-run vẫn là người đó đã xem). Trigger bắt scope của evidence/observation/job khớp attempt.
  - Queue: một job RUNNING/VALIDATING toàn DB; generation tăng cả khi thu hồi quyền cũ và khi cấp quyền mới; lease hết hạn ở RUNNING hoặc VALIDATING đều tính như một lần thực thi đã dùng và retry trong trần 3 (không tái dùng output chưa commit — đơn giản hơn, tốn thêm một lượt khi crash đúng lúc validate). Backoff kỹ thuật: theo retry-after nếu có, ngược lại 30 s × số lần đã chạy. Lease/heartbeat do nơi lắp ráp cấu hình.
  - P1 chỉ có một đường provider (fake): AUTH_EXPIRED/BILLING_UNVERIFIED/CAPABILITY_MISSING → FAILED, QUOTA_EXHAUSTED → WAITING_QUOTA, REFUSAL và dependency bị thu hồi lúc commit → NEEDS_REVIEW. Failover giữa hãng thuộc gateway P2/P4. WAITING_QUOTA đã hết budget khi resume → CANCELLED (không có cạnh sang FAILED).
  - Release: bỏ cạnh draft → retired không có trong P0_DATA_AND_STATE; kích hoạt phải nêu đúng hash nội dung (QC ngữ nghĩa là P2); thu hồi package tự chuyển active → suspended.
  - Rule Engine: không có ngưỡng; `concludeCompetency` cần `ApprovedCompetencyPolicy` do người dùng duyệt (D-02), thiếu thì `POLICY_NOT_APPROVED`. Chế độ guided → `needs_verification`; tiếp xúc prompt/hint với bài liên quan → `needs_review` (không đoán theo mục tiêu đo). Xếp hạng giai đoạn 2 và ngưỡng chống trì hoãn chưa triển khai.
  - Backup: thư mục `.partial` đổi tên khi mọi file đã khớp checksum; restore vào thư mục mới/rỗng, kiểm integrity, foreign keys, migration checksum, inventory DB ↔ file; `promoteRestored` chỉ chạy khi app dừng và giữ dữ liệu cũ ở `<live>.replaced-<time>`.
  - ESLint: bật `ignoreRestSiblings` để bóc trường lưu trữ khỏi DTO.

- E-08 (20/10/2026, áp dụng kỹ thuật P2; có thể đảo ngược bằng schema/migration mới): cụ thể hóa 6 đầu ra Phần 5 và pipeline QC. Không thêm dependency.
  - knowledge.v1 là schema riêng cạnh core.v1; QC Spec `qc-spec-1` và Playbook `playbook-1` là JSON có version trong `contracts/knowledge/`, tự kiểm bằng schema khi nạp. Chi tiết: [KNOWLEDGE_OUTPUTS](KNOWLEDGE_OUTPUTS.md).
  - Đáp án/giải thích/mục tiêu đo nằm ở khối `answer_key` riêng (kind `knowledge`), không nằm trong `item`, để "cắt quyền trước truy xuất" là bỏ qua cả đối tượng thay vì đọc rồi lọc trường.
  - Quyền nguồn Chưa rõ hoặc nguồn chưa approved là luật QC1 mức blocking; code chỉ áp dụng quyền đã ghi nhận (D-05 vẫn mở cho nội dung thật).
  - Staging là vùng nháp sửa được trong SQLite; bước 4 đóng băng vào JSON store (bất biến) và tính `bundle_hash` trên đơn vị + nguồn + media + coverage + phiên bản qc-spec/playbook. QC và phát hành chỉ dùng bản đóng băng; sửa nội dung phải tạo version mới, nên QC cũ không áp dụng. Phát hành đọc lại đĩa và tính lại hash ngay trong transaction.
  - Mỗi tầng QC có phần `deterministic` (code) và, nếu QC Spec có luật `semantic`, phần `semantic` (xác nhận thủ công `manual_attestation` hoặc sau này `ai_semantic` qua provider đã xác minh). Kết quả từ FakeAdapter ghi `synthetic_fake` và chỉ hợp lệ cho gói `synthetic_fixture`.
  - QC4 dùng attempt `dry_run` + queue sẵn có (task `reading.blind_solve`, `reading.verify`, `writing.assess` của core.v1); worker QC không tạo observation. Trigger chặn `qc_jobs` trên attempt learner.
  - Phát hành bản mới không động vào bản đang active; `rollback_point` trỏ bản active trước đó, quay lui = suspend bản mới (vòng đời P1 không cho kích hoạt lại).
  - Cache kết quả: khóa = input_hash + vai trò + pha + phiên bản policy/rubric/tri thức + model + mức tiết lộ; vô hiệu một chiều khi suspend/retire/revoke, đồng thời lookup kiểm lại revocation; cache hit trả `counts_as_evidence: false`.

- E-09 (20/10/2026, áp dụng kỹ thuật P2-3; có thể đảo ngược): AI Gateway của ứng dụng (khác relay E-06). Không thêm dependency.
  - Căn cứ D-01 là bản ghi `ProviderEvidence` không chứa secret (version, đường dẫn + sha256 entrypoint native, argv đã quan sát, lệnh probe trạng thái đăng nhập + mẫu kỳ vọng, entitlement, xác nhận tắt extra usage + hạn xác nhận lại, model được phép, cơ chế cô lập + 5 ca file-scope, timeout/cancel, output contract) cộng layout envelope đã quan sát. Lưu append-only ở `provider_verifications`; từ chối lưu nếu trông như có credential.
  - Gateway quan sát lại trước mỗi lần chạy (sha entrypoint, `--version`, probe đăng nhập) và chỉ khi đã có evidence; chưa có evidence thì không spawn gì. Bất kỳ nghi ngờ thanh toán nào thắng mọi lý do khác → BILLING_UNVERIFIED. Lỗi CLI không khớp mẫu đã ghi → BILLING_UNVERIFIED (dừng, không retry, không đổi hãng).
  - Env con dựng theo allowlist (SystemRoot, OS…) + TEMP/HOME/APPDATA trỏ vào sandbox, `CI=true`; biến tính phí/credential/proxy bị loại kể cả khi lọt vào allowlist. Biến cô lập (vd `CLAUDE_CONFIG_DIR`) chỉ do gateway đặt từ evidence.
  - Thư mục profile (credential) phải nằm ngoài repo, `var/` (gồm backup/log) và sandbox; mỗi lượt chạy có sandbox rỗng riêng, xóa sau khi chạy. Đây không phải ranh giới đọc file — vẫn bắt buộc file-scope test.
  - Đồng ý nhận dữ liệu theo hãng × loại dữ liệu (`ai_data_consents`), mặc định không ai được nhận. Một tài khoản mỗi hãng; không xoay vòng tài khoản cùng hãng.
  - gemini-cli DISABLED vì không có trên máy; Antigravity `agy` không phải adapter được 06A nêu nên không tự thêm.

- E-10 (20/10/2026, áp dụng kỹ thuật P2-4; có thể đảo ngược): session/CSRF, Console và entrypoint.
  - Session một người dùng trong bộ nhớ: cookie `sid` HttpOnly, SameSite=Strict, Path=/api (12 giờ); token CSRF lấy từ `GET /api/session`. Mọi `/api` trừ health/session cần cookie; mọi thao tác ghi cần thêm Origin hợp lệ (bắt buộc có) và header `x-csrf-token`; `Sec-Fetch-Site: cross-site` bị từ chối; body có trường lạ bị từ chối (tắt `removeAdditional` của Fastify).
  - Mở nội dung trong Console ghi exposure (surface builder, scope dry_run) trước khi đọc nội dung: task_item → prompt; answer_key → answer + explanation trên item liên quan. Đơn vị không gắn item (rubric, policy) không có exposure item.
  - `npm run worker`: gateway chặn mọi provider → không chạy, trừ `--fake` (FakeAdapter, chỉ job dry-run). P2 worker chỉ xử lý job dry-run kể cả khi có provider thật. `npm run backup -- create|restore|promote`; promote cần `--confirm` và app đã dừng.
- E-11 (20/10/2026, **người dùng chốt**, trả lời BLOCKED của P2): (1) Provider xác minh D-01 đầu tiên là **Codex** (ChatGPT); ứng viên cô lập profile là `CODEX_HOME` riêng ngoài repo/var, chưa xác minh. (2) Đồng ý cho provider đã xác minh D-01 nhận `synthetic_fixture`, `knowledge_content`, `answer_key`, `learner_submission`, `learner_profile`; **không** gửi `learner_audio`. Đồng ý vẫn ghi theo từng provider qua `ai_data_consents`, không suy rộng sang provider chưa xác minh. (3) Speaking giai đoạn đầu triển khai như Writing: hỗ trợ lên ý tưởng/dàn ý/từ vựng dạng văn bản; chưa chấm phát âm hay âm thanh, nên không báo Band Speaking từ audio (D-06 giữ mở). Cần đồng bộ 03 §Speaking khi tới P3. (4) Phía Google dùng **Antigravity CLI `agy`** thay `gemini-cli` (máy không có `gemini`); đồng bộ 06A bảng provider; agy chưa báo loại gói nên D-01 của agy phải xác minh riêng. (5) Chu kỳ xác nhận lại extra usage/auto-recharge đang tắt: **30 ngày**; quá hạn thì gateway chặn chạy tới khi người dùng xác nhận lại.

- E-12 (20/10/2026, áp dụng kỹ thuật E-11; không đóng D-01): `contracts/provider.v2.schema.json` thêm profile/job/run v2 cho agy, giữ nguyên core.v1 và migrations 0001–0002. Migration 0003 giữ nguyên hàng gemini-cli và trigger bất biến; runner tắt foreign_keys chỉ ngoài transaction dựng lại bảng 0003, kiểm foreign_key_check trước commit và luôn bật lại. Job cũ gemini-cli trả PROVIDER_NOT_ENABLED; không đổi provider hay nguồn bằng chứng cũ.
  - Ghi CODEX_HOME là ứng viên; evidence phải khớp cơ chế và profile riêng ngoài repo/var. `consent <provider> approved grant` chỉ cấp 5 loại khi profile READY; guard chặn learner_audio độc lập với consent. Extra usage xác nhận append-only, dùng lần hợp lệ gần nhất, chặn khi tuổi > 30 × 24 giờ; không chấp nhận ngày tương lai.
  - `npm run ai -- verify codex`: chỉ thu bằng chứng synthetic với native executable đã hash và env allowlist. Lệnh CLI đòi xác nhận extra usage còn hạn trước inference; phân loại login từ stdout/stderr rồi bỏ raw output. Xuất wrapper evidence/envelope/observations; không tự xác nhận gói, plugins, extra usage hay VERIFIED. Không xem câu trả lời từ chối là chứng minh quyền OS: người dùng phải đối chiếu cơ chế giới hạn đọc thực tế, mọi ca fail giữ BLOCKED.
  - Process-control cần quan sát root và child, kiểm không còn PID sống sau timeout/cancel; CIM không khả dụng hoặc không thấy child thì không đạt. Test dùng CLI giả và PID synthetic để kiểm taskkill thật trong môi trường bị từ chối CIM. Không dùng cờ bypass; không có bằng chứng CLI thật ở lượt này. Mapping tại P2_ACCEPTANCE; không triển khai P3.
- E-15 (20/10/2026, trả lời BLOCKED của probe-boundary): (1) **Người dùng chốt**: repo (mã nguồn, tài liệu, AGENTS.md) được phép đọc từ sandbox Codex của gateway; ca `repo_agents` không còn là ca bắt buộc bị chặn. Dữ liệu (DB, kho JSON có đáp án, bài làm, evidence) nằm trong `var/` và vẫn phải bị chặn. (2) **Người dùng chốt**: khi gateway chạy Codex cho tác vụ của app (chấm bài, giải mù, đối chiếu), tắt mọi công cụ cho model (shell/exec, browser, computer use, in-app browser, plugins/apps/MCP…) bằng `--disable`; dữ liệu đi qua stdin. Phần còn lại của `%LOCALAPPDATA%` đọc được từ sandbox là rủi ro được chấp nhận **chỉ khi** công cụ đã tắt; ACL Deny trên `var/` và `%LOCALAPPDATA%\study-english` vẫn giữ làm lớp phòng thủ thứ hai. (3) **Áp dụng kỹ thuật (người dùng không ưu tiên phương án nào; có thể đảo ngược)**: căn cứ cho `inherited_config` và `plugins_hooks` là kiểm tra cấu hình (CODEX_HOME và các thư mục cha của workspace không có AGENTS.md/config/MCP/plugin/hook) kèm argv đã tắt công cụ, ghi trong báo cáo và được gateway so khớp; không gọi đây là bằng chứng hệ điều hành.
- E-16 (20/10/2026, áp dụng kỹ thuật E-15; đảo ngược được; không đóng D-01): (1) `repo_agents` thành ca ghi nhận (`expected: info`), vẫn chạy; `var/` bắt buộc bị chặn; junction nay trỏ vào thư mục mồi trong `var/` (link vào dữ liệu luôn phải bị chặn). (2) Argv Codex thêm 28 `--disable` (`CODEX_DISABLED_FEATURES`) lấy từ `codex features list` thật của 0.163.0-alpha.10.2; kiểm từng tên bằng `codex --disable <tên> features list` vì `exec --help` nhận cả tên bịa. Gateway chặn argv Codex thiếu cờ (`ISOLATION_TOOLS_NOT_DISABLED`) hoặc có `--enable`/`-c features.*`. Probe/verify ghi `tools` (trạng thái hiệu lực từng cờ); ca `%LOCALAPPDATA%` chỉ là rủi ro chấp nhận khi `tools.ok` (đủ cờ **và** CLI báo đã tắt), ngược lại vẫn bắt buộc bị chặn. Đo thật: `unified_exec` vẫn bật dù có cờ → `tools.ok = false` (chờ người dùng, D01). (3) `inspectCodexConfig` kiểm CODEX_HOME và tổ tiên cwd; `file_scope_test` thêm `config_cases` + `config_method: config_inspection`; guard đòi 3 ca OS trong `cases` (enforced_boundary) và 2 ca cấu hình trong `config_cases`; gateway chạy lại kiểm tra cấu hình trước mỗi lượt. Báo cáo probe lên `schema_version: "2"`, báo cáo v1 bị từ chối.
- E-17 (20/10/2026, **người dùng chốt**, trả lời BLOCKED của E-15/E-16): `unified_exec` không tắt được trên codex-cli 0.163.0-alpha.10.2, nên thay vì chấp nhận rủi ro, người dùng tự thêm Deny đọc cho `CodexSandboxUsers` trên toàn `%LOCALAPPDATA%` và cấp lại Allow tường minh (RX) cho `%LOCALAPPDATA%\OpenAI\Codex` để sandbox vẫn chạy được công cụ của Codex. Ca `%LOCALAPPDATA%` tiếp tục bắt buộc bị chặn. Probe phải xác nhận cả hai: các ca cấm bị chặn và đối chứng/sandbox vẫn chạy; nếu sandbox hỏng thì hoàn tác và báo lại. Chỉ ảnh hưởng nhóm sandbox elevated; Codex chạy dưới tài khoản người dùng (relay, Relay Console, Codex thường ngày) không bị đổi quyền.
- E-18 (20/10/2026, áp dụng kỹ thuật P3-1…P3-3 phần độc lập; đảo ngược được bằng migration/code mới; không đóng D-01/D-02/D-05):
  - Thêm `migrations/0004_learning_p3.sql` với 5 bảng (`learner_goals`, `writing_diagnoses`, `writing_loop_states`, `error_hypotheses`, `scheduled_tasks`) cùng các trigger bất biến.
  - Gợi mở theo nấc sinh sẵn ở Bước 4 lưu toàn bộ 3 nấc trong `writing_diagnoses.hints_json` ở server sau khi qua `verifyHintDisclosurePolicy` (chặn Nấc 1–2 chứa đáp án mẫu hoặc câu viết lại hoàn chỉnh của Nấc 3). API chỉ trả kết quả qua `sliceUnlockedHints(bundle, unlocked_hint_level)`; không gửi nấc tương lai xuống trình duyệt. Mở gợi mở ghi `assistance_event` idempotent kèm snapshot `pre_assistance`; mở gợi mở hoặc hỏi làm rõ (`clarify`) không tăng `repair_attempt_index` và không tạo AI job mới; chỉ nộp bản sửa mới mới kích hoạt job `repair.assess`.
  - Chuyển sang Bước 7A tạo một `attempt` mới (`mode: 'self_practice'`, `purpose: '7A'`) trên đề mới đã kiểm tra điều kiện đủ qua `filterEligible` / `assessNovelty`. HTTP payload của 7A/7B/9 cắt bỏ hoàn toàn `diagnosis`, `input_support` và `step6_lesson` của lượt học trước.
  - Mọi nhận định sinh qua `FakeAdapter` được gắn cờ `synthetic: true` và chỉ dùng để kiểm thử luồng khép kín (bao gồm lập lịch 7B +1 ngày, Bước 9 +3 ngày và xử lý `opportunity: 'absent'` → `AWAITING_OPPORTUNITY`); màn Tiến độ gọi `concludeCompetency(summary, null)` trả về `POLICY_NOT_APPROVED` ("chưa đủ kết luận") và tắt báo điểm Band cho tới khi đóng D-02 và D-05. Chi tiết: [P3_ACCEPTANCE](P3_ACCEPTANCE.md).

- D-01 / Codex (20/10/2026): đủ bằng chứng theo E-13…E-17 — probe ranh giới PASS (3 ca OS + 2 ca cấu hình), verify thật (envelope, timeout/cancel), gói ChatGPT Plus + model gpt-6-astra do người dùng xác nhận, extra usage tắt (hạn 19/11/2026). Gateway: codex READY. D-01 vẫn mở cho claude-code và agy.
- E-19 (20/10/2026, áp dụng kỹ thuật P3-4 Reading trong luồng học + audio mẫu cục bộ; đảo ngược được bằng migration/code mới; không đóng D-02/D-05/D-06):
  - Reading (`migrations/0005_reading.sql`, `src/domain/learning/reading.ts`, `src/application/learning/reading-workflow.ts`, `src/web/reading.tsx`): chỉ cấp phát gói synthetic `active` có `release_manifest` đạt `QC4 PASS` và quyền `practice`. Chấm câu hỏi bằng hàm thuần `scoreReading` theo key đã ghim (`key_hash`) và chuẩn hóa khoảng trắng/chữ hoa, chấp nhận đáp án cạnh tranh hợp lệ đã ghi nhận trước QC (`accepted[]`), xử lý `NOT GIVEN` đúng nghĩa; `diagnostic_value` giữ `'inconclusive'` (không dùng khớp chuỗi đơn giản để công nhận lý giải tự sửa hay năng lực). Phục vụ đề qua `scopedReader('blind_solver')` + `blindTaskView`; không đọc khối `answer_key` cho tới khi người học mở Nấc 3 (ngoài chế độ `exam`), ghi `assistance_events` và `exposure` (`hint` cho Nấc 1–2, `answer` + `explanation` cho Nấc 3). Thu hồi (`revoke`) chặn ngay việc mở lại, nộp bài hay tạo lượt mới.
  - Audio mẫu cục bộ (`migrations/0006_audio_samples.sql`, `src/application/learning/audio-workflow.ts`, `src/web/audio.tsx`): kiểm tra magic bytes container (`RIFF/WAVE`, `WebM`, `OggS`, giới hạn 8 MiB), lưu bản gốc (`original`) và bản thu lại (`retake`) vào kho media cục bộ (P1) có SHA-256, phát lại kèm `X-Content-Type-Options: nosniff`. Cổng `ASR` giữ hằng trạng thái `{ status: 'unavailable', transcript: null }` vì D-06 vẫn mở. Các phiên bản transcript do người học nhập (`source = 'learner_entered'`) lưu bất biến theo `revision` tách biệt với audio gốc. Luồng nhận định Speaking dạng văn bản (E-11) chỉ nạp nội dung chữ vào `submitForAssessment` (`media_id = null`, `allowed_resource_ids = []`, `required_capabilities = ['text', 'structured_result']`), trả `SPEAKING_LIMITATION` ("Không có audio trực tiếp trong đánh giá… Không báo Band Speaking") và `band_reporting_enabled: false`. Chi tiết: [P3_ACCEPTANCE](P3_ACCEPTANCE.md).
- E-21 (21/10/2026, **người dùng chốt**, D-01 cho claude-code và agy): Claude Code và agy chạy dưới tài khoản Windows của người dùng (không có tài khoản sandbox như Codex), nên ranh giới đọc **do chính CLI ép** được chấp nhận thay cho bằng chứng hệ điều hành, ghi bằng method riêng (không gọi là `enforced_boundary`):
  - **claude-code** — method `cli_tools_disabled`: argv có `--restricted --tools "" --strict-mcp-config --no-session-persistence`; bằng chứng là sự kiện `system/init` của chính CLI báo `tools: []` và `mcp_servers: []` (khảo sát 21/10/2026: đúng như vậy; còn 3 plugin dựng sẵn, trong đó `cc-plugin-agents-md` → bắt buộc kiểm cấu hình tổ tiên cwd/AGENTS.md). Profile riêng qua `CLAUDE_CONFIG_DIR` ngoài repo/var; đăng nhập claude.ai (gói Pro theo `auth status`). Sự kiện `rate_limit_event` báo `overageStatus: rejected` / `org_level_disabled` là quan sát hỗ trợ cho extra usage tắt (vẫn cần người dùng xác nhận 30 ngày, E-11).
  - **agy** — method `cli_permission_deny`: profile riêng bằng `USERPROFILE`/`HOME` của tiến trình con (khảo sát 21/10/2026: agy tạo `.gemini` mới, cấu hình tách được; đăng nhập Google dùng chung toàn máy) với `settings.json` deny `command(*)`, `read_file(*)`, `write_file(*)`, `read_url(*)`, `mcp(*)`; bằng chứng là probe thật cho thấy CLI trả "permission check failed" cho `read_file` trong và ngoài cwd, không lộ mồi. `init` vẫn liệt kê công cụ (bằng chứng yếu hơn Claude, người dùng chấp nhận). Dữ liệu qua stdin bằng `--input-format stream-json`. Gói: **Google AI Ultra** (người dùng xác nhận).
  - Dữ liệu: cả hai nhận đúng 5 loại như Codex (E-11 mục 2), không bao giờ gửi `learner_audio`. Provider dự phòng vẫn phải qua cổng đối chứng D-05 (E-20) trước khi được chọn thay Codex.
- E-23 (21/10/2026, **người dùng chốt** "mức A"): đổi phiên bản CLI **không còn là lý do chặn**. Thay vào đó, ranh giới được **kiểm trong mỗi lần chạy thật**, gần như không tốn thêm:
  - claude-code: sự kiện `system/init` của chính lượt chạy phải có `tools: []` và `mcp_servers: []`; khác → bỏ kết quả, chặn provider, ghi lý do.
  - agy: trước mỗi lượt, `settings.json` của profile phải còn đúng 5 quy tắc deny (so nội dung); trong luồng sự kiện, bước công cụ nào hoàn tất mà không bị CLI từ chối → bỏ kết quả và chặn.
  - codex: lớp chính là ACL hệ điều hành (E-17) không phụ thuộc phiên bản; trước lượt chạy kiểm `codex features list` (không gọi model) đúng như E-15/E-17, khác → chặn.
  - **Tiền là chốt cứng, giữ nguyên**: env allowlist/gỡ API key, phương thức đăng nhập thuê bao, xác nhận extra usage 30 ngày, lỗi không phân loại → BILLING_UNVERIFIED.
  - Xác nhận của người dùng (gói, model được phép, extra usage, consent) **giữ qua các phiên bản**; báo cáo probe/evidence gốc vẫn bắt buộc một lần, phiên bản/SHA-256 chỉ còn để truy vết.
  - Model: không verify từng model. Danh sách model được phép là xác nhận của người dùng; lần đầu dùng một model chạy trước 1 prompt synthetic ngắn qua đúng đường gateway để kiểm envelope, không đạt thì chặn model đó.
  - Rủi ro được chấp nhận: thay đổi của bản CLI mới chỉ được phát hiện lúc chạy thật.
## Điểm mở và điều kiện đóng

- E-20 (21/10/2026, áp dụng kỹ thuật P4 phần độc lập; đảo ngược qua migration/code mới): migration 0007 thêm quota events, benchmark suite/report, complaint và cổng CAS proposal. Failover là lượt thực thi mới trong cùng job/budget 3, ghim context, ghi provider/CLI/model thực tế; không chuyển hãng vì REFUSAL. Router dự phòng đòi guard D-01 và báo cáo D-05 khớp suite hash/CLI/model, production chỉ chấp nhận sourced. Fixture CLI Node không đóng D-01/D-05; không đặt ngưỡng D-02. Không có reset time thì giữ unavailable tới khi xác minh lại; RATE_LIMIT ghi COOLDOWN.
  - Khiếu nại tạo job mới cùng submission/source, context nhắm competency và không chứa outcome cũ. Queue chỉ chấp nhận supersedes cùng source/submission/competency và chưa bị thay thế; giữ lịch sử. Review vẫn mở cho phân loại 05 §7.A, không tự kết luận đề sai. Worker `--complaints` chỉ xử lý nhóm job này qua gateway; `--fake` giữ dry-run. Profile loại cả met/not_met của nội dung ngừng cấp phát, trả needs_recheck, không hạ Band/năng lực.
  - `selectFallback` kiểm thêm mode/loại ràng buộc ngoài eligibility P1; hết ứng viên trả WAITING_VERIFICATION. ReplanRepository chỉ là CAS acceptance scaffold; planner/áp lịch đầy đủ thuộc P5. Benchmark schema yêu cầu nguồn/quyền và dev/holdout, kiểm tra cấu trúc không chứng minh chất lượng (`scoring_quality_claimed: false`). Mapping và giới hạn: [P4_ACCEPTANCE](P4_ACCEPTANCE.md); kiểm thử: p4-resilience/failover/complaints/benchmark, hồi quy P1–P3.

| ID | Nội dung | Chặn ở đâu | Bằng chứng cần để đóng |
|---|---|---|---|
| D-01 | ĐÃ ĐÓNG cho Codex (READY, xem mục D-01 / Codex bên trên và [D01_CODEX_READ_BOUNDARY](D01_CODEX_READ_BOUNDARY.md)). Với `claude-code` và `agy`: đã có adapter + guard + bộ thu `probe-boundary claude\|agy` và `verify claude\|agy` theo E-21 ([D01_CLAUDE_AGY](D01_CLAUDE_AGY.md), `tests/integration/e21-claude-agy.test.ts`); chờ người dùng đăng nhập profile riêng và chạy probe/verify thật | Bật adapter dự phòng thật (`claude-code`, `agy`) ở P4 | Phiên bản + argv/launch path + auth mode không chứa secret + quyền lợi + tình trạng extra usage + báo cáo probe ranh giới PASS (`cli_tools_disabled` cho claude-code, `cli_permission_deny` cho agy) + timeout/cancel + output contract |
| D-02 | Ngưỡng tin cậy, nâng/hạ trạng thái, lịch ôn và trọng số chưa định lượng. **Đã chốt v1 18/11/2026**: [D02_PROPOSAL](D02_PROPOSAL.md) (A–F người dùng đồng ý + góp ý được đánh giá, đưa vào theo yêu cầu). **Đã triển khai (E-34)**: `policies/competency-policy.v1.json` + Rule Engine A–F, test từng dòng. Chiều điểm AI (D1) có khi chấm thật (E-35). Còn mở: kiểm định thực nghiệm tham số (xem lại sau 4–6 tuần dùng thật); dữ liệu "điều kiện ủng hộ riêng giả thuyết" (E1) | Bật chính sách tự động tương ứng | Bảng policy có nguồn, phiên bản, ca đạt/chưa đạt/chưa kết luận; tham số đề xuất cần đánh giá trước khi gọi là chuẩn |
| D-03 | ĐÃ ĐÓNG phần kỹ thuật: schema/state P0, persistence P1, 6 đầu ra tri thức v1 (P2-1, KNOWLEDGE_OUTPUTS). Nội dung gói thật vẫn thuộc D-05 | — | — |
| D-04 | ĐÃ ĐẠT spike Windows runner/SQLite, backup phối hợp (P1-4), kiểm entrypoint native + sha256 và từ chối shim (P2-3); chưa xác minh với CLI thật và quyền file thực | Tích hợp thật P2 | Xử lý shim .cmd/.ps1 bằng entrypoint đã xác minh, quyền file thực |
| D-05 | Chưa có gói nội dung, quyền sử dụng và đối chứng. Nguồn đề **đã chốt** (E-36): [D05_CONTENT_PROPOSAL](D05_CONTENT_PROPOSAL.md). Còn mở: provider AI thật (Codex hết hạn); D-06 cho Listening/phát âm; đo độ khớp chấm trên mẫu công khai trước khi báo Band | Phát hành gói học / báo Band | Nguồn được phép dùng, QC1–4 đúng hash, coverage manifest, bộ đối chứng riêng; thiếu phần nào chặn phần đó |
| D-06 | Chưa chọn nguồn audio Listening (thu sẵn từ nguồn và/hoặc TTS cục bộ) và cách kiểm chứng audio. Phần ASR/chấm phát âm **đã bỏ** (E-43: nói và phát âm kiểm tra ngoài ứng dụng) | Listening thật | Audio gắn đúng transcript/đáp án, công cụ/phiên bản/tài nguyên ghi rõ; thiếu audio thì không phát hành đề Listening |
| D-07 | Chính sách giữ log/context/media, hạn mức ổ đĩa. Đã có: xuất dữ liệu + báo cáo dung lượng (E-28); người dùng chốt chỉ tự dọn backup cũ (E-30) và sao lưu ngày + diễn tập tuần khi app chạy (E-32). **Đã chốt (E-53):** cảnh báo < 5 GB, chặn tải mới/TTS < 2 GB, dọn bản sao nguồn không dùng bằng lệnh người dùng tự chạy | Dùng dữ liệu cá nhân dài hạn | Cấu hình retention minh bạch, xử lý đầy ổ, export/backup/restore; không xóa lịch sử tự động khi chưa có chính sách |

Người thực hiện hạng mục chịu trách nhiệm thu bằng chứng; AI không tự đóng điểm mở bằng lời khẳng định. Điểm cần quyết định nghiệp vụ đưa cho chủ dự án, phần kỹ thuật xử lý trong quyền đã được giao.

## Mẫu quyết định mới
ID / ngày / trạng thái (đề xuất, áp dụng kỹ thuật, người dùng chốt, thay thế); vấn đề; nguồn; lựa chọn; lý do; tác động; cách kiểm chứng; file đồng bộ; quyết định bị thay thế. Giữ lịch sử, không xóa quyết định cũ.


## E-22 — Model và effort đã verify (21/10/2026)
- Trạng thái: người dùng yêu cầu đổi model/verify từng model cho codex, claude-code, agy. Nguồn: 06A §5/§8/§10; E-11…E-21. Triển khai qua CLI quản trị, gateway của app dùng mặc định được lưu.
- Evidence giữ models_allowed chỉ gồm model có synthetic thành công (final envelope + JSON nonce/schema); model_configurations ghi từng cặp model/effort đã thử. Evidence cũ chỉ cho effort trong argv cũ. Không sửa evidence/DB đã nạp; báo cáo mới vẫn cần duyệt các xác nhận D-01.
- Mẫu argv chỉ tách --model/-m, Claude --effort, Codex -c/--config model_reasoning_effort=. Mọi token khác và thứ tự phải khớp; giữ sandbox, windows.sandbox, --disable, --restricted, --tools "", --strict-mcp-config, --no-session-persistence, mode plan và deny agy. Từ chối duplicate và giá trị chèn cấu hình. Cặp chưa verify bị chặn MODEL_NOT_VERIFIED.
- Tái sử dụng probe khi chỉ đổi model/effort: Codex ACL/sandbox identity do OS cưỡng chế; Claude CLI bỏ tools/MCP trước inference; agy permissions.deny do CLI kiểm trước thực thi tool. Không dựa vào lời model từ chối. SHA/version, profile, workspace, cấu hình sống và cờ khác vẫn phải khớp. Nếu model đổi đường thực thi/tool hoặc init Claude không còn tools/MCP rỗng: chặn và yêu cầu probe lại. Đổi binary/config/permissions cần bằng chứng mới. D-05 chất lượng vẫn gắn model.
- ai -- model <provider> <model> [effort] lưu mặc định từng provider trong migration 0008. ai -- models <provider> liệt kê ứng viên có nguồn, phân biệt model đã verify: agy dùng agy models; Claude/Codex dùng bí danh đã ghi từ help và model đã quan sát D-01, không tự suy danh sách quyền lợi đầy đủ.
- verify --models a,b,c [--effort e]: một synthetic/model; timeout/cancel một lần/provider. Quota/rate limit dừng ngay, giữ observations thành công/thất bại/chưa chạy; báo cáo abort không cấp evidence dùng được. Không gộp evidence khác binary/profile; verify danh sách mới rồi duyệt/nạp bản mới. Model có envelope khác bị loại.
- Mapping: cli-adapters, gateway, probe-boundary, verify-codex, src/cli/ai.ts, ai-accounts-repository, migration 0008 → tests/integration/e22-models.test.ts; hồi quy E-21/P2/P1. Chưa verify thêm model thật; vận hành thực hiện sau.

## E-23 — Kiểm ranh giới trong mỗi lần chạy, bỏ chặn theo phiên bản CLI, canary model (21/10/2026)
- Trạng thái: người dùng chốt (mức A, 21/10/2026) sau khi `agy` tự cập nhật 3 lần trong ngày (`1.4.2` → `1.4.4`) làm gateway chặn `ENTRYPOINT_CHANGED_SINCE_VERIFICATION` / `CLI_VERSION_CHANGED_SINCE_VERIFICATION`. Thay thế phần chặn cứng theo phiên bản/SHA-256 và phần bắt buộc chạy lại `verify` cho từng model trong E-11/E-21/E-22; giữ nguyên các chốt thanh toán, consent và cờ an toàn.
- Bỏ chặn theo phiên bản/hash: `subscriptionGuard`, `AiExecutionGateway` và `boundaryReportIssues` không còn chặn chỉ vì `cli_version` hoặc SHA-256 entrypoint khác bản đã verify. Phiên bản và SHA-256 thực tế vẫn được ghi nhận để truy vết và hiển thị dạng thông tin (`INFO:`) trong `npm.cmd run ai -- status`. Entrypoint vẫn phải là file thực thi native đã phân giải ngoài repo/data (từ chối shim `.cmd`/`.ps1`) và đúng tên binary của provider (`PROVIDER_MISMATCH`).
- Kiểm trong mỗi lần chạy (runtime self-check):
  - `claude-code`: parse sự kiện `system/init` (và các block nội dung) trong chính luồng `stream-json` của lượt chạy; nếu `tools` hoặc `mcp_servers` khác rỗng (hoặc có `tool_use`) → loại bỏ kết quả (`BILLING_UNVERIFIED`), không commit observation, chuyển tài khoản sang trạng thái chặn (`NEEDS_VERIFICATION`) với lý do `RUNTIME_TOOLS_PRESENT`.
  - `agy`: ngay trước khi spawn, đọc `<profile>\.gemini\antigravity-cli\settings.json` và đối chiếu đúng 5 quy tắc `permissions.deny` (`command(*)`, `read_file(*)`, `write_file(*)`, `read_url(*)`, `mcp(*)`); nếu thiếu/thừa/khác → không chạy (`RUNTIME_DENY_RULES_CHANGED`). Sau khi chạy, nếu có bước `step_update` kiểu tool nào hoàn tất (`state: 'DONE'`) mà không phải lỗi permission → loại kết quả và chặn provider (`RUNTIME_TOOL_EXECUTED`).
  - `codex`: trước lượt chạy, chạy `codex [--disable …] features list` (không gọi model, cache 5 phút theo phiên bản/hash/profile) để xác nhận các cờ `--disable` vẫn có tác dụng theo E-15/E-17 (`unified_exec` được bù bởi ACL Deny trên `%LOCALAPPDATA%` đã chứng minh trong báo cáo probe); nếu khác → chặn (`RUNTIME_CODEX_FEATURES_CHANGED`).
  - Chốt thanh toán cứng giữ nguyên: env allowlist, kiểm phương thức đăng nhập thuê bao (không gọi model, cache theo phiên bản/thời gian), xác nhận extra usage OFF tối đa 30 ngày.
- Canary model thay cho verify từng model & giữ xác nhận qua phiên bản:
  - `models_allowed` là danh sách người dùng cho phép (khai báo qua `npm.cmd run ai -- allow-models <provider> <m1,m2,...>` hoặc `npm.cmd run ai -- models <provider> --allow <m1,m2,...>`, lưu bất biến trong `provider_allowed_models`); giữ lệnh `npm.cmd run ai -- model <provider> <model> [effort]` để lưu mặc định.
  - Lần đầu sử dụng một tổ hợp `(provider, cli_version, model[, effort])` chưa có canary đạt trong phiên bản CLI hiện hành, gateway chạy 1 prompt synthetic ngắn qua đúng đường adapter để kiểm tra envelope + hợp đồng đầu ra: đạt thì ghi `passed = 1` vào `provider_model_canaries` và chạy job thật; không đạt thì ghi `passed = 0` kèm lý do và chặn tổ hợp model đó với `MODEL_CANARY_FAILED`.
  - Xác nhận của người dùng (gói thuê bao, `models_allowed`, `confirm-extra-usage`, `consent`) tự động giữ hiệu lực qua các phiên bản CLI.
- Mapping: `src/application/ai/subscription-guard.ts`, `src/infrastructure/ai/gateway/{entrypoint,probe-boundary,cli-adapters,gateway,compose}.ts`, `src/infrastructure/sqlite/ai-accounts-repository.ts`, `src/cli/ai.ts`, `migrations/0008_provider_model_preferences.sql` → `tests/integration/e23-runtime-canary.test.ts`, `tests/integration/p2-gateway.test.ts`, `tests/integration/probe-boundary.test.ts`.

## E-24 — Dùng lõi định tuyến của ai-router làm nền xử lý AI của ứng dụng (17/11/2026)
- Trạng thái: áp dụng kỹ thuật theo yêu cầu người dùng ("dùng ai-router làm base, đồng bộ vào dự án làm nền xử lý AI"); có thể đảo ngược (xóa `router-core/` và `failover.ts`, trả `classify` về chỉ dùng mẫu D-01). Không thay thế E-09…E-23.
- Vấn đề: gateway (E-09) chỉ nhận diện lỗi theo `error_patterns` ghi trong bằng chứng D-01; lỗi hạn mức chưa có mẫu → `BILLING_UNVERIFIED` (dừng hẳn, không chuyển hãng), không đọc giờ mở lại, job `WAITING_QUOTA` chỉ mở lại bằng tay. ai-router (relay E-06 đã tách thành dự án riêng) đã có lõi thuần cho đúng phần này, kiểm bằng CLI thật ở relay.
- Lựa chọn: **đồng bộ mã nguồn, không phụ thuộc runtime**. `scripts/sync-ai-router.mjs` (`npm run router:sync [-- --check]`) chép nguyên văn `ai-router/src/core/{types,outcome,routing}.ts` vào `src/infrastructure/ai/router-core/` kèm `SOURCE.json` (commit + SHA-256; test chặn sửa tay). Lý do: ứng dụng không được gọi HTTP/MCP của ai-router (ai-router có provider API trả phí, xoay tài khoản cùng hãng, workspace `full` — trái 06A §1.5–1.6 và chốt thanh toán); lõi thuần không I/O nên chép được, gateway/guard/D-01/D-05 giữ nguyên quyền quyết định.
- Cầu nối `src/infrastructure/ai/gateway/failover.ts`: tách luồng CLI thành lỗi CLI tự báo / stderr / `rate_limit_event` theo dạng sự kiện parser của ai-router; **không đọc câu trả lời của model hay bài làm**. `envelope.ts`: mẫu D-01 xét trước; không khớp thì hỏi lõi (QUOTA→`QUOTA_EXHAUSTED`, RATE_LIMIT, AUTH→`AUTH_EXPIRED`, phía hãng lỗi→`NETWORK`); vẫn không nhận ra → `BILLING_UNVERIFIED` như cũ. Thoát mã 0 thì không đọc stderr. `reset_at` (bỏ nếu đã qua hoặc > 8 ngày) đi theo `AdapterResult` → `markFailure` → `quota_events.reset_at`; cooldown mặc định lấy từ lõi (60 phút / 5 phút, như E-20).
- WAITING_QUOTA: worker gọi `resumeWaitingJobs` mỗi 5 phút (`--quota-recheck-ms`); job quay lại `QUEUED` chỉ khi `canFailover` (guard D-01 + tài khoản READY + cổng D-05 cho provider dự phòng) đạt. Không gọi model, không reset ngân sách 3 lần chạy, chỉ trong scope worker sở hữu. Đúng 06A §6.B ("kiểm tra lại sau khoảng chờ đã cấu hình, không polling liên tục").
- Không đưa vào: provider API, xoay tài khoản, thứ tự "near limit", chat/handoff/MCP/Admin của ai-router; REFUSAL vẫn không chuyển hãng.
- Kiểm chứng: `tests/unit/router-core-failover.test.ts`, `tests/integration/e24-router-core.test.ts`; hồi quy toàn bộ `npm.cmd run check`.
- Giới hạn: lõi nhận diện theo chữ/sự kiện CLI; khi CLI đổi định dạng, sửa ở ai-router rồi đồng bộ. Worker vẫn từ chối khởi động khi lúc khởi động không provider nào READY (hành vi P2 cũ), nên vòng kiểm lại chỉ có tác dụng khi worker đang chạy.

## E-25 — P5-1 Theo dõi học hằng ngày (Daily Tracker) và nhắc học theo luật (17/11/2026)
- Trạng thái: áp dụng kỹ thuật (người dùng yêu cầu "tiếp tục triển khai dự án"); có thể đảo ngược bằng migration/code mới. Nguồn: 06A §9.1–9.3, §10.A; 02 §5.C.2; 06 §2.A.3–4; IMPLEMENTATION_PLAN P5. Không đặt ngưỡng sư phạm (D-02 vẫn mở).
- Lựa chọn:
  - Migration `0010_daily_tracking.sql`: `study_activity_events` (heartbeat, idempotent theo `client_event_id`, append-only), `daily_study_logs` (khai báo nghỉ có kế hoạch / học ngoài ứng dụng kèm phút tự khai / quỹ thời gian ngày; bản mới nhất mỗi loại thắng, giữ lịch sử), `notification_outbox` (dedupe_key duy nhất, chỉ kênh `in_app`), `scheduler_runs` (`last_run_day`). Không lưu nội dung bài làm, đáp án hay audio.
  - Ngày học theo Asia/Bangkok; thời điểm lưu UTC. Thời gian = hợp các khoảng [thời điểm − span, thời điểm] của heartbeat (span ≤ 120 s, client gửi 60 s/lần khi màn học hiển thị hoặc audio đang phát), nên hai tab/gửi lại không đếm trùng; đọc/nghe/suy nghĩ được tính theo màn đang mở, không theo phím gõ.
  - Trạng thái ngày: nghỉ có kế hoạch > học ngoài ứng dụng/offline (khai báo hoặc heartbeat đồng bộ muộn) > có ghi nhận > không có dữ liệu: ngày đã qua là **thiếu dữ liệu quan sát**, hôm nay là "chưa có dữ liệu", trước khi bắt đầu theo dõi thì không tính. Không có trạng thái "bỏ học".
  - Quỹ ngày = quỹ khai báo của chính ngày đó, nếu không thì `daily_minutes` của mục tiêu; ngày nghỉ = 0. Hàm không nhận phần thiếu của ngày trước (không nợ phút). Không đọc/ghi hồ sơ năng lực.
  - Bốn nhóm 06A §9.1 (chỉ mô tả): thời gian & cam kết; vòng học (bắt đầu, nộp gốc, nộp sửa, nhiệm vụ lịch xong); bằng chứng & sổ lỗi (nhận định learner theo outcome, giả thuyết lỗi cập nhật theo trạng thái); độ lệch lộ trình (nhiệm vụ quá hạn hiện tại, phiên bản lịch). Mọi báo cáo kèm `as_of`.
  - Nhắc học theo luật, không dùng AI: tối đa một lần/ngày học (`scheduler_runs` + dedupe key), không nhắc ngày nghỉ, không bù các ngày máy tắt; chạy khi đọc `/api/learning/notifications`.
  - Giới hạn kỹ thuật: heartbeat đồng bộ muộn tối đa 14 ngày, lệch đồng hồ 5 phút; khai báo trong 14 ngày trước tới 30 ngày sau (học ngoài ứng dụng chỉ tới hôm nay).
- Chưa làm (P5 tiếp): tạo đề xuất lịch bù (`replan_proposals`) — phần xếp hạng phụ thuộc D-02; kênh Telegram/email.
- Kiểm chứng: `tests/unit/study-day.test.ts`, `tests/integration/p5-tracking.test.ts`; hồi quy `npm.cmd run check`.

## E-26 — Hướng dẫn sử dụng tự cập nhật (17/11/2026)
- Trạng thái: áp dụng kỹ thuật theo yêu cầu người dùng ("file hướng dẫn kĩ trong docs, tự động cập nhật khi có thay đổi"); đảo ngược được.
- Lựa chọn: `docs/HUONG_DAN_SU_DUNG.md` gồm phần viết tay (mục 1–13: tổng quan, cài, chạy, học, Builder & QC, AI thật, worker, sao lưu, relay, kiểm tra, sự cố, giới hạn) và các khối `AUTO` (mục 14) do `scripts/user-guide.mjs` sinh từ `package.json`, USAGE của `src/cli/{ai,backup}.ts`, cờ `src/worker/main.ts`, route `src/server/app.ts`, `migrations/`, DECISIONS và bảng PROGRESS.
- Cưỡng chế: `npm run check` chạy `docs:guide -- --check` sau lint; thất bại khi khối AUTO cũ, khi có lệnh npm/route/cờ worker mới chưa có mô tả, hoặc còn mô tả cho thứ đã xóa. AGENTS.md mục 5a bắt AI lập trình sửa phần viết tay trong cùng lượt. Git hook tùy chọn `.githooks/pre-commit` (bật bằng `npm run hooks:install` = `git config core.hooksPath .githooks`) tự sinh lại khối AUTO trước commit.
- Giới hạn: phần viết tay không kiểm được bằng máy; độ đúng của nó dựa vào quy định AGENTS.md và người duyệt. Phần mô tả lệnh `ai`/`backup` lấy nguyên văn USAGE tiếng Anh trong mã.

## E-27 — P5-2 Tra cứu kho tri thức FTS5/BM25 lọc quyền trong cùng truy vấn (17/11/2026)
- Trạng thái: áp dụng kỹ thuật (người dùng yêu cầu tiếp tục triển khai); đảo ngược được (chỉ mục là projection). Nguồn: 06A §7.A.2, §10.B bước 5; 05 §C.5; 06 §5.B.1; 04 §2 (cắt quyền trước truy xuất).
- Lựa chọn:
  - Migration `0011_knowledge_search.sql`: bảng FTS5 `knowledge_search(title, body)` tokenizer `unicode61 remove_diacritics 2` + `knowledge_search_units` (rowid ↔ unit, `content_hash`). Không chép quyền, trạng thái phát hành hay thu hồi vào chỉ mục.
  - `KnowledgeSearch` (`src/infrastructure/sqlite/knowledge-search.ts`): `sync()` đánh chỉ mục unit mới/đổi hash, đọc file JSON qua hash đã ghi; `rebuild()` xóa và dựng lại; `search()` lọc trong cùng câu SQL theo vai trò (`roles_json`), trạng thái phát hành (`released`: chỉ `active`; `builder`: thêm `draft`/`suspended`) và thu hồi (unit hoặc gói), rồi xếp BM25 (trọng số tiêu đề 5). Chỉ trả tham chiếu, tiêu đề, loại unit, gói, trạng thái, điểm; nội dung vẫn phải đọc qua `scopedReader`.
  - Chỉ đánh chỉ mục chuỗi nội dung ngoài khối `governance`; gộp đ→d để gõ không dấu tìm được. Từ khóa người dùng được tách thành từ và đặt trong ngoặc kép (tối đa 12 từ, từ ≥ 2 ký tự): không cú pháp FTS nào của người gọi tới được `MATCH`.
  - Console: `GET /api/console/search?q=&role=`, `POST /api/console/search/rebuild`; khung tìm ở tab Gói tri thức.
- Giới hạn: thống kê BM25 tính trên toàn chỉ mục, nên unit bị ẩn có thể làm lệch thứ hạng (không bao giờ được trả về). Chưa nối vào bước đóng gói ngữ cảnh của job AI (context hiện là manifest cố định theo item/rubric đã ghim); dùng khi có tác vụ cần tra cứu tham khảo.
- Kiểm chứng: `tests/integration/p5-search.test.ts`; hồi quy `npm.cmd run check`.

## E-28 — P5-3 Xuất dữ liệu học tập và báo cáo dung lượng (17/11/2026)
- Trạng thái: áp dụng kỹ thuật (người dùng yêu cầu triển khai phần tiếp theo); phần độc lập của D-07. Không xóa hay sửa dữ liệu; chính sách lưu giữ vẫn chờ người dùng.
- Lựa chọn:
  - `exportLearnerData` (`src/infrastructure/export/learner-export.ts`): một transaction đọc; ghi `data/<bảng>.json` cho 25 bảng dữ liệu người học (lọc `scope = 'learner'` hoặc theo attempt learner), sao nguyên byte bản thu âm sau khi kiểm SHA-256, `manifest.json` (định dạng `study-english-learner-export` v1, phiên bản schema, số dòng + SHA-256 từng file, danh sách loại trừ), `DOC_TRUOC.txt`. Thư mục `.partial` chỉ đổi tên khi xong; lỗi thì xóa.
  - Không xuất: nội dung tri thức/đáp án/rubric (chỉ tham chiếu), `writing_diagnoses.hints_json` (gợi ý chưa chắc đã mở; không lộ gợi ý tương lai), dry-run, tài khoản/bằng chứng/hạn mức AI, job/run và đầu ra thô.
  - Mặc định ghi vào `var/exports/` (gitignored); `--out` từ chối thư mục trong repo ngoài `var/`.
  - `storageUsage`: dung lượng từng khu dưới `var/`, chỗ trống ổ (`statfs`), 10 bảng nhiều dòng nhất; `retention.policy = 'none'`.
  - Giao diện: CLI `npm run export -- create|usage`; `POST /api/learning/export`, `GET /api/learning/storage`; khung "Dữ liệu của bạn" ở Cài đặt.
- Chưa làm (chờ D-07): thời hạn lưu giữ, tự dọn backup/export/log, ngưỡng và hành vi khi đầy ổ, nhập lại (import) bản xuất.
- Kiểm chứng: `tests/integration/p5-export.test.ts`; hồi quy `npm.cmd run check`.

## E-29 — P5-4 Chạy một lệnh, dữ liệu/cổng tùy chọn, diễn tập khôi phục (18/11/2026)
- Trạng thái: áp dụng kỹ thuật (người dùng yêu cầu triển khai phần tiếp theo); đảo ngược được. Nguồn: IMPLEMENTATION_PLAN P5 ("tài liệu cài/chạy/phục hồi và trải nghiệm sử dụng thật"; "restore thực nghiệm thành công"); 06 §5.B.6.
- Lựa chọn:
  - Backend phục vụ giao diện đã build (`dist/web`) cùng origin (`src/server/static-web.ts`, không thêm dependency): chỉ GET/HEAD ngoài `/api`, đường dẫn giải trong thư mục web (chặn `..`, mã hóa, symlink), đường không có đuôi trả `index.html`, file thiếu trả 404; `nosniff`, `X-Frame-Options: DENY`, `no-referrer`; `index.html` no-store, asset có hash cache dài. Giao diện tĩnh không cần phiên; mọi `/api` và mọi thao tác ghi vẫn cần phiên + CSRF, Host/Origin vẫn kiểm.
  - `npm run app` = build + chạy; `npm start` chạy bản đã build. `STUDY_ENGLISH_DATA_DIR` (thư mục dữ liệu khác), `STUDY_ENGLISH_PORT` (mặc định 4317; allowlist Host/Origin suy ra từ cổng), `STUDY_ENGLISH_SERVE_WEB=0`.
  - `npm run backup -- drill [backup_dir]` (`src/infrastructure/backup/drill.ts`): backup mới hoặc chỉ định → `restoreBackup` vào thư mục tạm → `openStore` → so số dòng 25 bảng dữ liệu học với file DB của backup → đọc lại qua đường xuất dữ liệu (kiểm SHA-256 audio) → xóa bản tạm; nối kết quả vào `var/backups/restore-drills.jsonl`. Không đụng `var/` đang dùng.
- Kiểm tra giao diện thật (18/11/2026) trên dữ liệu thử (`STUDY_ENGLISH_DATA_DIR` trong scratchpad, cổng 4327, không đụng dữ liệu thật hay `dev:server` đang chạy) phát hiện và sửa 3 lỗi P5-1: nhắc học tạo trước khi có mục tiêu thì sai quỹ cả ngày (nay chỉ tạo khi đã có mục tiêu); hôm nay hiện "Trước khi bắt đầu theo dõi" (nay luôn "chưa có dữ liệu"); khung ngày không tải lại sau khi lưu mục tiêu. Kèm: ngày trước khi theo dõi hiện "—" thay vì "0 / quỹ"; bỏ hai câu cố định sai với dữ liệu thật ("AI thật chưa được kích hoạt", "đang bị khóa… chờ D-01").
- Kiểm chứng: `tests/integration/p5-app.test.ts`; `p5-tracking`, `study-day` bổ sung ca; hồi quy `npm.cmd run check`.

## E-30 — Tự dọn backup cũ (18/11/2026, **người dùng chốt**)
- Người dùng chọn "Chỉ dọn backup cũ" (phần chính sách lưu giữ của D-07): giữ **10 bản mới nhất** (đổi được bằng `backup -- prune --keep n`) và bản đã diễn tập ĐẠT gần nhất; không bao giờ tự xóa bài làm, audio, lịch sử hay bản xuất.
- Triển khai: `src/infrastructure/backup/prune.ts` (chỉ xét thư mục có `manifest.json` định dạng `study-english-backup`; bỏ qua `.partial`, bản sao tay như `pre-m8-repair-*`, symlink); chạy sau `backup -- create` và sau `backup -- drill` đạt; lệnh `backup -- prune`; mỗi lần xóa ghi `var/backups/prune-log.jsonl`. Test: `tests/integration/e30-e31.test.ts`.

## E-31 — Worker chờ khi mọi provider hết hạn mức (18/11/2026, **người dùng chốt**)
- Người dùng chọn "Chờ tới khi mở lại" thay hành vi P2 (thoát mã 3). Chỉ áp dụng khi **mọi lý do chặn** của ít nhất một provider là hạn mức (`PROFILE_QUOTA_EXHAUSTED`, `PROFILE_COOLDOWN`) và không provider nào READY; lý do khác (D-01, extra usage, đăng nhập, consent) vẫn thoát mã 3. `--fake`/`--once` giữ hành vi cũ.
- Triển khai: `quotaWaitable`, `waitForProvider` (`src/worker/worker.ts`), dùng ở `src/worker/main.ts`; kiểm lại theo `--quota-recheck-ms` (mặc định 5 phút), chỉ đọc trạng thái gateway, không gọi model; profile tự về READY ở giờ mở lại (E-24). Test: `tests/integration/e30-e31.test.ts`, ca guard thật trong `p2-gateway.test.ts`.

## E-32 — Sao lưu tự động mỗi ngày + diễn tập khôi phục mỗi tuần (18/11/2026, **người dùng chốt** "Bật cả hai")
- Trong tiến trình server (`app`/`start`/`dev:server`): kiểm lần đầu sau 15 giây, sau đó mỗi giờ; không chạy chồng. Mỗi **ngày học** (Asia/Bangkok) một backup (`createBackup` + dọn theo E-30); diễn tập (`restoreDrill` trên backup mới nhất) khi chưa có diễn tập ĐẠT trong **7 ngày**, tối đa một lần thử mỗi ngày. Việc chỉ được ghi đã làm (`scheduler_runs`: `auto_backup`, `auto_restore_drill`) sau khi chạy, nên backup lỗi được thử lại ở lần kiểm sau.
- Chỉ chép file cục bộ, không gọi AI/mạng. Không chạy khi ứng dụng tắt (không tạo dịch vụ Windows). Tắt bằng `STUDY_ENGLISH_AUTO_BACKUP=0`.
- Trạng thái hiện ở Cài đặt (`GET /api/learning/storage` → `backups`: bật/tắt, số bản đang giữ, backup gần nhất, diễn tập gần nhất ĐẠT/THẤT BẠI + lý do, hạn diễn tập kế tiếp).
- Triển khai: `src/infrastructure/backup/auto.ts` (`runAutoBackup`, `autoBackupStatus`, `scheduleAutoBackup`), `src/server/main.ts`, `tracking-repository.ts` (`lastRunDay`), `src/web/learning.tsx`. Test: `tests/integration/e32-auto-backup.test.ts`.

## E-33 — Chốt chính sách D-02 v1 (18/11/2026, **người dùng chốt**)
- Người dùng đồng ý toàn bộ đề xuất A–F và yêu cầu đánh giá bản góp ý 8 điểm, đưa phần phù hợp vào. Đã nhận: G0 (loại synthetic), A3 (bản sửa sau nấc 3 không tính), A4/A5 theo độ rộng nhiệm vụ, điều kiện làm bài = phương thức × chế độ × giảm tải × loại ràng buộc (bỏ 7A/7B/9), B0 + họ bài ở B2 + B3 theo 3 nguồn gần nhất, chuỗi 7A→7B→9 + tích hợp Bước 9 + chống kẹt `absent`, D1 tách AI/Rule Engine + D2 +3/+5, E đủ 4 trạng thái + điều kiện ủng hộ riêng giả thuyết, F1/F2/F3 sửa công thức. Bỏ: ngưỡng "≤ 20 phút" ở D5 (không có căn cứ đặc tả). Sửa: 7B `not_met` chốt +2 ngày.
- Chưa triển khai code; `concludeCompetency` vẫn trả `POLICY_NOT_APPROVED` cho tới khi có file chính sách có phiên bản và test từng dòng.

## E-34 — Triển khai chính sách D-02 v1 (18/11/2026, người dùng yêu cầu "Triển khai D-02")
- **Tham số.** Nằm trong `policies/competency-policy.v1.json`, được kiểm schema bằng Ajv khi nạp và băm SHA-256 trên JSON chuẩn hóa.
  - Thiếu file → `POLICY_NOT_APPROVED`, không tự xếp lịch.
  - File sai → ném lỗi, không âm thầm dùng mặc định.
- **Luật thuần.** Nằm trong `src/domain/policy/`:
  - `competency.ts`: G0–G2, A1–A8, B0–B4.
  - `verification.ts`: C1–C5.
  - `priority.ts`: D1–D5.
  - `hypothesis.ts`: E0–E4.
  - `replan.ts`: F1–F3.
- **Nối vào ứng dụng.**
  - **Kết luận năng lực:** `LearningWorkflowService` lập `EvidenceRecord` cho từng nhận định, chỉ từ metadata (không đọc nội dung bài). Kết luận ghi vào bảng bất biến `competency_conclusions` (migration 0012), mỗi dòng gắn phiên bản và hash chính sách.
  - **Chuỗi kiểm chứng (C):** thay lịch E-18. Đạt 7A → xếp 7B; đạt 7B → mở Bước 9 với khoảng 3 → 7 → 14 → 30 → 60 ngày. Chưa đạt thì làm lại theo C3. Bài tổng hợp làm khi Bước 9 đến hạn được tính cho Bước 9 (C2). Thiếu cơ hội quan sát nhiều lần thì giao kiểm tra trực tiếp có ràng buộc tình huống (C4).
  - **Xếp hạng (D):** áp dụng ở "Học hôm nay" và hiển thị điểm thành phần.
  - **Sổ lỗi (E):** trạng thái giả thuyết được tính lại từ bằng chứng, thay cho cách đặt `confirmed` thủ công sau bản sửa.
  - **Giới hạn trọng tâm (D5):** áp dụng cho chẩn đoán.
  - **Đề xuất lịch (F):** do `ReplanPlanner` tạo, qua `GET /api/learning/replan` và `POST /api/learning/replan/:id/{accept,reject}`.
    - Mỗi đề xuất là compare-and-set trên `plan_versions` và hết hạn sau 48 giờ.
    - Tối đa một đề xuất mỗi ngày học.
    - Khi chấp nhận, đề xuất chỉ dời các nhiệm vụ còn mở.
- **Dữ liệu synthetic.** Lịch kiểm chứng vẫn chạy trên dữ liệu synthetic để kiểm thử luồng. Nhận định synthetic không vào kết luận thật (G0). Giả thuyết synthetic chỉ dùng bằng chứng synthetic của chính nó.
- **Giới hạn đã biết.**
  - Chưa adapter nào trả hai chiều điểm AI của D1, nên dùng mặc định 1.
  - Chưa có cờ "ủng hộ riêng giả thuyết" và chưa có nhiệm vụ phân biệt nguyên nhân, nên E1 trên thực tế chưa xác nhận được giả thuyết nào.
  - Bài 7B/9 tự xếp đang dùng bài synthetic (chờ D-05).
  - Kết luận được tính lại mỗi lần đọc. Lịch sử chỉ thêm dòng khi bằng chứng hoặc chính sách thay đổi.
- **Đảo ngược được** bằng cách bỏ file chính sách (ứng dụng quay về "chưa đủ kết luận"), hoặc ra phiên bản v2 với file mới.

## E-35 — P5-5: chấm Writing bằng AI thật qua worker (18/11/2026, áp dụng kỹ thuật, đảo ngược được)
- **Phạm vi.** Đây là tùy chọn bật tay. Không đặt `STUDY_ENGLISH_LEARNING_AI=real` thì vòng Writing vẫn chấm synthetic ngay trong app (FakeAdapter, không tốn hạn mức). Khi đặt `real`:
  - Bài nộp được xếp hàng đợi với phạm vi `learner`.
  - `npm run worker -- --learning` xử lý bài qua gateway và provider đã đạt D-01. Worker bỏ qua job khiếu nại; `--fake` không dùng được cho chế độ này.
- **Hợp đồng `contracts/learning.v1.schema.json`** (`writing_assessment_result`) gồm:
  - Kết quả theo từng kỹ năng: outcome, chất lượng đo, cơ hội, căn cứ.
  - Chẩn đoán tối đa 3 lỗi trọng tâm, mỗi lỗi có điểm ảnh hưởng và độ chắc chắn 0–3.
  - Lỗi khác và gợi ý theo nấc: nấc 1, nấc 2, giải thích nấc 3, câu mẫu, câu hỏi kiểm tra hiểu.
  - Không có điểm Band.

  Lệnh gửi cho CLI kèm schema đã gộp `$ref`. Validator vẫn chấp nhận kết quả P0 cũ, dùng cho FakeAdapter và dữ liệu cũ.
- **Ngữ cảnh người chấm.** Gồm đề, tiêu chí của các kỹ năng mà bài đo, chế độ/vai trò/có phải bản sửa, và bài làm. Không gồm lịch sử, gợi ý hay kho đáp án.
- **Ứng dụng tự quyết:**
  - Chỉ ghi kỹ năng mà bài được hỏi, mỗi kỹ năng một lần; kỹ năng AI không trả về thì không tự tạo.
  - Mức hỗ trợ lấy từ gợi ý đã hiển thị, chế độ hướng dẫn và bản sửa.
  - Áp giới hạn trọng tâm D5 và kẹp điểm về 0–3.
  - Trạng thái giả thuyết theo mục E. Mỗi kỹ năng có lỗi trọng tâm chưa đạt thì thêm một giả thuyết `initial`, synthetic = 0.
  - Kiểm tra tiết lộ: nếu nấc 1 hoặc 2 chứa câu mẫu thì **bỏ toàn bộ gói gợi ý**. Lý do chỉ ghi mã lỗi, không chép câu bị cấm (lỗi rò rỉ này phát hiện khi viết test và đã sửa, kể cả trong hai thông báo lỗi cũ).
- **Ghi chẩn đoán.** `finalizeAssessment` là bước chung cho cả hai chế độ. Nó chạy khi Workspace đọc lại, bỏ qua nếu job chưa COMPLETED và không ghi trùng.
- **Điểm ưu tiên.** D1 lấy điểm ảnh hưởng và độ chắc chắn từ chẩn đoán thật gần nhất của kỹ năng.
- **Khiếu nại.** Kết quả khiếu nại dạng learning.v1 chỉ thay nhận định của đúng kỹ năng bị khiếu nại.
- **G0 giữ nguyên.** Đề hiện là gói synthetic, nên kết quả thật vẫn bị loại khỏi mức năng lực cho tới khi có nội dung thật (D-05).
- **Test.** `tests/integration/p55-real-ai.test.ts` (7 ca) dùng adapter giả trả `synthetic: false`, nên không chứng minh CLI thật chạy được. Chưa gọi Codex thật trong lượt này.

## E-36 — Chốt nguồn đề D-05 (18/11/2026, **người dùng chốt**)
- **N1 — Phạm vi:** làm đều cả 4 kỹ năng. Writing và Speaking phải học lại từ đầu, nên cần lộ trình nền tảng, hướng dẫn khi sai, giải thích khi điểm thấp và đề xuất cải tiến. Listening và chấm phát âm vẫn phụ thuộc D-06.
- **N2 — Quét nguồn:** quét toàn bộ các trang thuộc những miền nguồn đã liệt kê, kèm trang để người dùng duyệt. Người dùng chấp nhận rủi ro bản quyền vì chỉ dùng cá nhân.
- **N3:** lưu bản sao cục bộ trong `var/`.
- **N4:** khung năng lực bám sát mục tiêu IELTS tối đa.
- **N5–N8, N10:** đồng ý theo khuyến nghị.
- **N9 — Căn cứ chấm:** người dùng không có bài có điểm. Dùng band descriptors và bài mẫu công khai có nhận xét giám khảo làm căn cứ. Người dùng chấp nhận rủi ro lệch với giám khảo thật.
- **Đang chặn:** Codex Plus đã hết hạn, hiện không có provider AI thật. Các bước cần AI chờ tới khi có provider đạt D-01.
- **Làm ngay được, không cần AI:** bộ quét nguồn và trang duyệt (E-37).

## E-37 — Bộ quét nguồn và trang duyệt (18/11/2026, áp dụng kỹ thuật cho D-05 N2; đảo ngược được)
- **Danh sách miền và URL khởi đầu** nằm trong `policies/source-seeds.v1.json`. Các miền lấy theo danh mục nguồn ở 05 §2.C, cộng thêm British Council, IDP, Cambridge vì đây là các bên đồng sở hữu IELTS. Mỗi miền gắn một loại nguồn: `official`, `teaching` hoặc `linguistic_research`.
- **Bộ quét** (`src/infrastructure/sources/{page,crawler}.ts`, lệnh `npm run sources -- crawl|status`):
  - Chỉ đi trong các miền cho phép, chỉ dùng http(s).
  - Tôn trọng robots.txt (luật cho `*`, khớp dài nhất). Nếu robots.txt lỗi mà không phải mã 404/410 thì bỏ qua máy chủ đó.
  - Mỗi máy chủ cách nhau 1,5 giây giữa hai lần gọi; timeout 20 giây; mỗi trang tối đa 15 MB; chỉ tải HTML và PDF; độ sâu tối đa 4.
  - Tự xử lý redirect và kiểm từng bước nhảy **trước khi gọi**. Test đã bắt được lỗi khi dùng `redirect: 'follow'`: địa chỉ ngoài danh sách đã bị gọi tới trước rồi mới kiểm tra.
  - Bản sao lưu theo SHA-256 trong `var/sources`. Bản sao này không nằm trong backup, vì có thể tải lại.
  - Hàng đợi là các dòng QUEUED, nên lần chạy sau quét tiếp từ chỗ dừng.
- **Bảng `source_candidates`** (migration 0013) lưu một dòng cho mỗi URL đã chuẩn hóa. Loại trang được đoán sơ bộ từ URL và tiêu đề, chỉ để lọc cho tiện.
- **Duyệt** (`src/infrastructure/sources/review.ts`, 3 route `/api/console/sources*`, tab Builder & QC → Nguồn):
  - Duyệt một trang sẽ đăng ký bản ghi `source_record` với `registry_state = approved` và quyền `determined`: lưu bản sao, cho phép AI xử lý, hiển thị cho người học. Căn cứ: E-36.
  - Chỉ trang đã tải mới duyệt được. Trang bị loại được giữ dòng để không quét lại.
  - Trích đoạn chỉ là văn bản thuần, không trả HTML gốc.
- **Test:** `tests/integration/e37-sources.test.ts`, chạy với máy chủ HTTP cục bộ, không ra Internet.
- **Chưa có:** quét chạy từ giao diện; tự phát hiện khi nguồn thay đổi. Trích văn bản PDF đã có ở E-39.

## E-38 — Thứ tự provider: Claude Code → agy → Codex (18/11/2026, **người dùng chốt**)
- **Lý do:** Codex Plus đã hết hạn. Người dùng yêu cầu "chuyển hết hệ thống thành claude làm provider chính hết rồi đến agy rồi đến codex".
- **Thay đổi:** `CLI_PROVIDERS` trong `src/application/ai/subscription-guard.ts` đổi thành `['claude-code', 'agy', 'codex']`. Hệ quả:
  - Mọi job mới (Writing, Speaking dạng văn bản, QC, khiếu nại sao chép từ job gốc) nhận danh sách provider theo thứ tự này.
  - `gateway.status()` và lệnh `ai -- status` liệt kê theo thứ tự này (dùng `byPreference`).
  - Worker chọn provider đầu tiên đang sẵn sàng.
- **Giữ nguyên hợp đồng gateway:** gateway vẫn chọn theo thứ tự mà job đã lưu. Provider không đứng đầu danh sách vẫn cần báo cáo D-05 mới được tự chuyển sang (E-20). Vì vậy agy và Codex chỉ là dự phòng có điều kiện.
- **Kiểm tra dữ liệu thật:** lúc đổi, DB thật không có job nào đang QUEUED/WAITING_QUOTA/RUNNING, nên không cần chuyển đổi.
- **Test:** `p2-gateway` và `p2-e11` đổi sang tìm trạng thái theo tên provider và theo thứ tự mới.
- **Đảo ngược được** bằng cách đổi lại hằng số.

## E-39 — Trích văn bản PDF nguồn (18/11/2026; người dùng cho phép thêm thư viện)
- **Thư viện:** dependency mới `pdfjs-dist` **6.4.299**, ghim đúng phiên bản (phát hành 03/10/2026). Người dùng cho phép cài sau khi chế độ tự duyệt quyền chặn lần đầu.
  - Bản 6 không còn đường `eval`: đã kiểm, không có `new Function` trong build.
  - Chạy với `enableXfa: false`, `useSystemFonts: false`, `disableFontFace: true`, không render.
- **Trích văn bản** (`src/infrastructure/sources/pdf-text.ts`):
  - Văn bản được gom theo dòng (cùng tọa độ y). Hai mục cách nhau > 14 đơn vị thì nối bằng tab. Mục đích: giữ hàng/cột của bảng band descriptors, theo 05 §5.B bước 2.
  - pdfjs tự chèn các mục chỉ có khoảng trắng để lấp khoảng cách giữa cột; các mục này bị bỏ, nếu không thì mất dấu tách cột.
- **Nối vào bộ quét:**
  - PDF được trích ngay khi tải. Kết quả ghi `<sha>.txt` và `<sha>.layout.json` cạnh bản PDF trong `var/sources`.
  - Lệnh `npm run sources -- extract` chạy bù cho PDF tải trước đó.
  - PDF đọc lỗi vẫn ở trạng thái FETCHED và ghi `PDF_TEXT_FAILED`.
  - Tab Nguồn hiện trích đoạn cho cả PDF.
- **Sự cố khi cài, đã khôi phục:** lần cài đầu dùng `--omit=optional`, làm gỡ luôn binding native tùy chọn của rolldown (Vite/Vitest), nên test không khởi động được. Đã chạy lại `npm install` thường; `@napi-rs/canvas` (phụ thuộc tùy chọn của pdfjs) được cài nhưng không dùng.
- **`npm audit`:** 1 lỗ hổng mức trung bình ở `fast-uri`, là phụ thuộc có sẵn của fastify/ajv, không do pdfjs. Chưa sửa vì ngoài phạm vi.
- **Test:** `tests/unit/e39-pdf-text.test.ts` (3 ca, PDF tự tạo bằng `tests/fixtures/make-pdf.ts`); thêm ca PDF vào `e37-sources`.

## E-40 — Lọc hàng đợi quét nguồn (19/11/2026; người dùng "Lọc rồi quét tiếp")
- **Lý do:** sau lượt quét thứ hai, hàng đợi tăng từ 1.669 lên 10.469 trang.
  - Phần lớn là bản sao theo quốc gia của `ielts.idp.com` (`/vietnam/`, `/canada/`…), trang tìm kiếm `bxsearch`, trang đăng nhập/đăng ký của LearnEnglish và danh bạ `receiving-organisations` của ielts.org.
  - Với nhịp 1,5 giây/trang, quét hết sẽ mất nhiều giờ, lấy về toàn bản trùng, và gây tải không cần thiết lên máy chủ nguồn.
- **Cách làm:**
  - Thêm mục tùy chọn `exclude` vào `policies/source-seeds.v1.json`, dạng `{host, path (regex trên pathname+search), note}`. `host` khớp đúng tên, bỏ qua `www.`.
  - Luật được áp ở ba chỗ:
    - khi xếp hàng: không thêm liên kết khớp luật;
    - ở từng bước chuyển hướng: dừng với `EXCLUDED_BY_POLICY`;
    - đầu mỗi lượt `crawl`: các dòng QUEUED khớp luật chuyển sang SKIPPED/`EXCLUDED_BY_POLICY`.
  - Mẫu regex sai làm hỏng việc nạp cấu hình (không bỏ qua im lặng).
- **Luật v1:**
  - IDP: chỉ giữ các mục đầu `prepare`, `ielts-prep-hub`, `results`, `article`, `about` và trang một cấp.
  - Loại cả host `bxsearch.`, `book.`, `account.ielts.idp.com`.
  - Loại LearnEnglish `/user/`, ielts.org `/receiving-organisations/`.
  - IPA: loại tài khoản, danh sách hội đồng, biên bản.
- **Bổ sung cùng ngày** (người dùng "oke tiến hành thêm lọc và chạy lại"): loại phân trang `?page=` của LearnEnglish (cùng bài, khác trang bình luận; khoảng 3.000 trang) và `?filter` của IDP (khoảng 650 trang danh sách). Lượt quét đang chạy được dừng rồi chạy lại để áp luật.
- **Không hồi tố:** trang đã tải hoặc đã duyệt (gồm một phần bản sao quốc gia của IDP được duyệt ngày 19/11) giữ nguyên. Muốn bỏ thì dùng nút Loại ở tab Nguồn.
- **Kèm theo:** đọc phần nội dung trang giờ nằm trong khối bắt lỗi. Nội dung bị treo quá `timeout_ms` thì chỉ trang đó bị ghi `FAILED`/`TIMEOUT`; trước đây lỗi này làm hỏng cả lượt chạy.
- **Kết quả áp luật:** 8.176 dòng QUEUED chuyển sang SKIPPED, còn 2.292 trang trong hàng đợi.
- **Test:** thêm 3 ca vào `tests/integration/e37-sources.test.ts`: thân trả lời bị treo, khớp luật, và áp luật lúc xếp hàng / với hàng đợi cũ / ở bước chuyển hướng.
- **Bổ sung 19–20/11/2026** (người dùng "đồng ý, tiến hành"): loại trang bình luận LearnEnglish `^/comment/` (mỗi bình luận là một URL riêng, không có nội dung học). Trang bình luận đã tải trước đó bị loại hồi tố (4.272 dòng REJECTED) theo đồng ý riêng của người dùng.

## E-41 — Nguồn gốc nội dung `ai_authored` / `learner_owned` (D-05 N10, 19/11/2026)
- **Nguồn:** N10 đã chốt (E-36); bước còn lại của C1 trong D05_CONTENT_PROPOSAL; người dùng "tiếp tục triển khai bước tiếp theo".
- **Migration `0014_content_origin.sql`:**
  - Dựng lại `package_requests` và `package_bundles` để CHECK nhận thêm `ai_authored` và `learner_owned`. Dùng cùng kỹ thuật với 0003: `legacy_alter_table` và tắt khóa ngoại ngoài giao dịch; trình chạy migration coi 14 là migration dựng lại bảng.
  - Chép đủ dòng cũ; tạo lại trigger chỉ-thêm.
  - Bảng đối chứng (`benchmark_*`) **giữ nguyên** CHECK chỉ `synthetic_fixture`/`sourced`, vì bộ đối chứng phải có nguồn (N9, 05 §5.C).
- **Contract:** `knowledge.v1` mở rộng enum `content_origin` của `package_request`, `package_manifest`, `release_manifest`. Đây là thay đổi cộng thêm, dữ liệu cũ vẫn hợp lệ.
- **G0 mới** (`src/domain/knowledge/content-origin.ts`, `isSyntheticEvidence`): bằng chứng là synthetic khi
  - nguồn gốc là `synthetic_fixture`;
  - hoặc nguồn gốc **không xác định** (nội dung không phát hành qua pipeline, ví dụ gói Writing seed);
  - hoặc được FakeAdapter chấm, hoặc không rõ provider.
  - `writing-workflow` lấy nguồn gốc của item qua `servableItem` (LEFT JOIN `package_bundles`). Các dấu hiệu cũ (item thuộc gói synthetic, năng lực `syn.*`) vẫn giữ làm lớp an toàn.
- **Dữ liệu gửi AI:** nội dung `learner_owned` cần thêm đồng ý `learner_submission`, không chỉ `knowledge_content`. Đây là tạm thời cho tới khi C4 thêm loại dữ liệu riêng `learner_owned_content`.
- **Chưa có:** đường tạo gói `ai_authored` (C2–C3) và màn nhập `learner_owned` (C4). Hiện chưa có dòng nào dùng hai nguồn gốc mới.
- **Áp vào DB thật:** migration tự chạy (kèm sao lưu trước khi migrate) ở lần mở DB kế tiếp.
- **Test:** `tests/integration/e41-content-origin.test.ts` (3 ca: G0, lớp dữ liệu, nâng cấp 13→14 giữ dòng/khóa ngoại/trigger); cập nhật số migration ở `p1-persistence`, `p1-backup`.

## E-42 — AI soạn khung năng lực + rubric Writing Task 2 (D-05 C2, 19/11/2026)
- **Nguồn:** người dùng "Làm C2"; N4 đã chốt (bám mục tiêu IELTS tối đa, AI tự chọn độ mịn, người dùng duyệt v1).
- **Đường chạy AI** (quyết định triển khai, đảo ngược được):
  - Tác vụ soạn nội dung **không đi qua hàng đợi job học tập**. Hàng đợi gắn với bài làm, bản nộp và rubric của người học; thêm vai trò mới cho nó sẽ phải dựng lại `ai_jobs`/`context_manifests`.
  - Thay vào đó, lệnh `npm run author` do người dùng tự chạy gọi `GatewayAdapter` trực tiếp, nên vẫn qua subscriptionGuard, bằng chứng D-01, thứ tự E-38 và cổng D-05 cho provider dự phòng.
  - Chỉ gửi lớp dữ liệu `knowledge_content` (nguồn đã duyệt, không có dữ liệu người học). Thời gian tối đa 15 phút, đầu ra tối đa 2 MB.
  - Mỗi lần gọi ghi một dòng `authoring_runs` chỉ-thêm: provider/phiên bản/model thật, hash đầu vào/đầu ra, lỗi.
- **Task type mới:** `content.author`, `content.review`. Hợp đồng `knowledge.v1`:
  - `competency_framework_result`: năng lực theo đúng trường `competency_spec`, thêm `criterion`, `title_vi`, `assessor_criterion`, `source_quotes`; kèm `observation_guide`, `aggregation_notes`.
  - `framework_review_result`.
  - Chỉ dẫn cố định nằm trong `task-instructions.ts`; nguồn đi sau dấu DATA và chỉ là dữ liệu.
- **Nguồn cho AI** (`policies/authoring/wt2-framework.v1.json`):
  - Danh sách URL tường minh, mỗi URL phải đã được duyệt: band descriptors, key assessment criteria, 2 PDF bài mẫu có nhận xét giám khảo, 2 trang định dạng đề, 1 bài IDP.
  - Thiếu nguồn thì dừng trước khi gọi AI.
- **Dựng lại bảng band descriptors theo cột** (`band-table.ts`):
  - Cột lấy theo vị trí x của tiêu đề tiêu chí; hàng lấy theo nhãn Band ở lề. Ranh giới giữa hai hàng là dải trống lớn nhất trong tất cả các cột giữa hai nhãn.
  - Kiểm trên PDF thật: ô Band 5–9 của Task 2 đúng văn bản chính thức. Ô Band 0 gộp ngang nhiều cột nên bị cắt chữ; band này không dùng.
  - Lớp "chuẩn gốc" của rubric (05 Khối 2) được **ứng dụng chép từ bảng này**, AI không viết lại.
- **Kiểm tra tất định** (`framework-checks.ts`); lỗi thì chặn duyệt:
  - trích dẫn phải có nguyên văn trong nguồn đã cấp (bỏ qua hoa/thường, dấu ngoặc, khoảng trắng, gạch nối);
  - nguồn phải có trong dữ liệu đã cấp;
  - mã năng lực khớp tiêu chí, không trùng;
  - không nhắc mức Band trong tiêu chí chấm hoặc nhận định mục tiêu;
  - cạnh trỏ trong khung; cạnh tiên quyết phải có căn cứ;
  - số năng lực mỗi tiêu chí trong giới hạn 3–8. Khuyến nghị 4–6 (N4), ngoài khoảng khuyến nghị chỉ là cảnh báo.
- **Duyệt:**
  - Bản nháp lưu bất biến ở kho JSON (`knowledge/ielts-writing-task2/vN.json`); bảng `competency_frameworks` (migration 0015) chỉ giữ trạng thái.
  - Trigger chỉ cho phép các chuyển trạng thái: DRAFT → APPROVED/REJECTED (một lần), APPROVED → SUPERSEDED.
  - Điều kiện duyệt: 0 lỗi kiểm tra, có lượt AI rà soát, tác giả không phải fake/synthetic. Nếu AI rà soát báo lỗi thì cần ghi chú.
  - Mỗi lúc chỉ có một bản APPROVED.
- **Chưa có:**
  - dùng khung đã duyệt để chấm (P5-5 vẫn dùng năng lực synthetic) và để sinh đề: C3;
  - chạy AI từ giao diện;
  - khung cho Speaking và Task 1.
- **Test:** `tests/integration/e42-framework-authoring.test.ts` (8 ca, executor giả: bảng, kiểm tra, duyệt, lịch sử, API).

## E-43 — Speaking chỉ ở dạng văn bản; phát âm và nói thật nằm ngoài ứng dụng (19/11/2026, người dùng chốt)
- **Người dùng:** "Phần speaking không cần triển khai thật mà sẽ triển khai speaking dưới dạng writing để hỗ trợ lên ý tưởng thôi, tôi sẽ kiểm tra nói thực tế và phát âm ở ngoài."
- **Phạm vi Speaking trong ứng dụng:** hỗ trợ lên ý tưởng, dàn ý, từ vựng và câu trả lời dạng văn bản cho Part 1–3 (tiếp nối E-11 (3)).
  - Không chấm phát âm, độ trôi chảy hay audio.
  - Không báo Band Speaking.
  - Phần audio mẫu (E-19) giữ nguyên, chỉ để tự nghe lại.
- **Hệ quả cho D-06:** bỏ phần ASR/chấm phát âm. D-06 chỉ còn nguồn audio cho **Listening**.
- **Ảnh hưởng tới D-05:** N1 bước 2 (Speaking Part 1–3 dạng văn bản) giữ nguyên. Khung năng lực Speaking (nếu làm) chỉ gồm các năng lực đo được trên văn bản: ý tưởng, phát triển ý, từ vựng, ngữ pháp; Fluency và Pronunciation không đo trong ứng dụng.

## E-44 — Audio Listening: thu sẵn từ nguồn + TTS cục bộ (19/11/2026, người dùng chọn "Cả hai nguồn")
- **Nguồn:** câu hỏi "Listening thì chạy record chứ?". Người dùng chọn dùng cả audio thu sẵn lẫn TTS.
- **Audio thu sẵn** (bộ quét, `crawler.ts`/`page.ts`):
  - Link audio (`.mp3/.m4a/.wav/.ogg` trong `<a>`, `<audio>`, `<source>`) trên trang đã tải được xếp hàng như **lá**: không tính giới hạn độ sâu và không theo link tiếp.
  - Chỉ nhận khi magic bytes là MP3/WAV/Ogg/MP4; giới hạn riêng `max_audio_bytes` 60 MB. Lưu `<sha>.<ext>` trong `var/sources`.
  - Gắn `practice_material`/`listening`; `content_type` lấy từ kết quả nhận diện bằng magic bytes, không theo máy chủ.
  - `media_hosts`: CDN ngoài danh sách được phép **chỉ cho audio**, chỉ trong `path_prefix`, kể cả khi chuyển hướng. Hiện có `assets|downloads.ctfassets.net/unrdeg6se4ke/`, là không gian Contentful của IDP.
  - Không cần migration: không thêm `kind` mới; lọc theo `content_type`.
  - Lệnh `sources -- discover-audio` quét bù các trang đã lưu.
  - Tab Nguồn có bộ lọc dạng và trình phát. Route `GET /api/console/sources/:id/audio` cần session và trả `nosniff`.
- **Quan sát trên dữ liệu thật (trước khi tải):**
  - 77 link audio trên 622 trang Listening đã tải: 61 của LearnEnglish (bài nghe tổng quát, không theo dạng đề IELTS), 14 trên CDN IDP (đề IELTS **Life Skills**), 2 khác.
  - Audio đúng dạng đề IELTS Academic/GT từ nguồn chính thức rất ít, nên cần TTS để có số lượng.
- **TTS cục bộ** (`src/infrastructure/audio/tts.ts`, lệnh `npm run tts`):
  - Dùng Piper, chạy offline.
  - Engine và giọng nằm ngoài repo và `var/`: `%LOCALAPPDATA%\study-english\tts\{piper\piper.exe, voices\<id>.onnx(.json)}`, đổi được bằng `STUDY_ENGLISH_TTS_DIR`.
  - Mỗi lần đọc là một tiến trình con có giới hạn (`runBoundedProcess`: timeout, trần đầu ra, kết thúc cây tiến trình), môi trường tối thiểu, văn bản qua stdin, tối đa 20.000 ký tự.
  - Đầu ra chỉ được nhận nếu là WAV thật, rồi lưu vào kho media có SHA-256.
  - Transcript vẫn là căn cứ cho đáp án và QC4; audio chỉ là cách trình bày.
- **Chưa có:**
  - Gói đề Listening (kịch bản 4 Part + câu hỏi + đáp án, AI soạn qua pipeline + QC4); màn làm bài Listening.
  - Đối chiếu audio thu sẵn với transcript/câu hỏi đi kèm.
- **Test:** `tests/integration/e44-audio-sources.test.ts` (2 ca), `tests/unit/e44-tts.test.ts` (3 ca, engine giả).
- **Đã cài** (19/11/2026, người dùng "Tải Piper + 3 giọng"), trong `%LOCALAPPDATA%\study-english\tts`:
  - `piper_windows_amd64.zip` từ GitHub rhasspy/piper, release 2023.11.14-2: 22.477.236 byte, sha256 `f3c58906402b24f3a96d92145f58acba6d86c9b5db896d207f78dc80811efcea`.
    - Mọi mục trong zip nằm dưới `piper/`, không có đường dẫn tuyệt đối hay `..`.
    - `piper.exe` sha256 `96f3da3811151580073e40bb4dd20eb0fb8115f5f5f76e2fb54282b3edfa5c1f`.
  - Giọng từ Hugging Face rhasspy/piper-voices v1.0.0, mỗi giọng 63.201.294 byte; sha256 khớp hash LFS do Hugging Face công bố:
    - `en_GB-alan-medium` `0a309668…3d3330`;
    - `en_GB-jenny_dioco-medium` `469c630d…526b01`;
    - `en_GB-northern_english_male-medium` `57a219ae…0d0689`.

## E-45 — Profile Claude được chứa cache danh mục plugin (19/11/2026, người dùng "Cho phép cache")
- **Sự cố:** sau lượt soạn E-42, Claude Code tự tạo `plugins/plugin-directory-cache-v2.json` (2,8 MB) trong profile runner riêng của app. Kiểm tra ranh giới (`inspectClaudeConfig`) thấy mục `plugins` nên chặn `claude-code` (`BOUNDARY_CONFIG_PROFILE_plugins`). Không có plugin nào được cài.
- **Quyết định:** `plugins/` được chấp nhận **chỉ khi** là thư mục thật và mọi mục bên trong là file thường tên `plugin-directory-cache[-vN].json`.
  - Vẫn chặn: plugin đã cài, marketplace, file hoặc thư mục con khác, tên giả dạng, liên kết.
  - Các kiểm tra khác (hooks, commands, agents, MCP, `enabledPlugins`…) giữ nguyên.
  - Kết quả kiểm tra có ghi chú khi gặp trường hợp này.
- **Kết quả:** `npm run ai -- status` trở lại `claude-code: READY`.
- **Đính chính:** hạn xác nhận lại extra usage của `claude-code`/`agy` là **18/12/2026**, theo `ai -- status`: đã xác nhận ngày 18/11, chu kỳ 30 ngày. Lời nhắc "20/11" trước đó là sai.
- **Test:** `tests/unit/e45-claude-plugin-cache.test.ts` (3 ca); `e21-claude-agy` vẫn đạt.

## E-46 — Khung năng lực v2: bảng theo đường kẻ, định nghĩa cạnh, soạn lại theo góp ý (19/11/2026, người dùng "Làm v2")
- **Lý do:** lượt rà soát v1 (E-42) trả "revise": 4 lỗi, 8 cảnh báo. Trong đó có hai nguyên nhân phía ứng dụng:
  - bảng band thấp dựng sai: ranh giới hàng theo khoảng trắng bị lệch khi một cột dài hơn;
  - chỉ dẫn không định nghĩa các loại cạnh, nên người rà soát coi `supports`/`component_of` là quan hệ tiên quyết.
- **Đường kẻ bảng:**
  - `extractPdfText` trả thêm `rules`: các đường ngang, lấy từ hộp bao của path trong operator list của pdfjs, không render.
  - Lưu thành `<sha>.rules.json`. `sources -- extract` tạo bù cho PDF cũ (thật: 239 PDF, 0 lỗi).
  - `reconstructBandTables` dùng đúng một đường kẻ dài ≥ 80% bề rộng bảng giữa hai nhãn Band làm ranh giới. Nếu không đủ thì quay về cách theo khoảng trắng và báo `row_bounds: 'whitespace'`.
  - Hàng không có dòng nào bắt đầu ở mép trái cột 2..n là ô gộp (Band 0), được giữ thành một ô `All criteria`.
  - Bỏ khoảng trắng trước dấu câu.
  - Kiểm trên PDF thật: 6/6 trang bảng dùng đường kẻ. Ô Band 0–4 Task 2 khớp văn bản chính thức; bảng có 37 ô.
- **Chỉ dẫn AI:**
  - Định nghĩa 5 loại cạnh; chỉ `prerequisite` cần căn cứ, và không dùng cạnh để ngụ ý thứ tự học.
  - met/not met là "đặc điểm có mặt hay không", không phải mức Band; không trộn câu chữ của nhiều mức Band trong một tiêu chí.
  - Người rà soát được dặn không coi các cạnh khác là quan hệ tiên quyết.
- **Soạn lại theo góp ý:**
  - `author(executor, reviseFrom)` / `author -- framework --revise vN`. Gửi kèm `revision`: bản trước, `review_findings`, `check_findings`.
  - Bản trước phải đã được rà soát.
  - Bản mới ghi `revised_from {version, review_run_id}`; bản cũ giữ trạng thái DRAFT để người dùng quyết định.
  - Cùng contract `competency_framework_result`, không thêm task type.
- **Test:** `e39-pdf-text` thêm ca đường kẻ; `e42-framework-authoring` thêm ca bảng theo đường kẻ/ô gộp và ca soạn lại (10 ca).

## E-47 — C3a: AI soạn đề Writing Task 2, QC1–QC4, tự phát hành (20/11/2026, người dùng "tiến hành triển khai phần tiếp theo"; quyết định triển khai, đảo ngược được)
- **Căn cứ:** D-05 N5 (quy chuẩn sinh đề), N6 phương án A (đạt đủ QC1–QC4 thì tự phát hành), N8 (trần 10 lượt gọi AI/ngày cho sinh và QC đề). Các điểm này người dùng đã chốt ở E-36.
- **Điều kiện chạy:** cần khung năng lực **đã duyệt**, không synthetic. Chưa có khung đã duyệt thì từ chối trước khi gọi AI (`FRAMEWORK_NOT_APPROVED`).
- **Task type mới** `content.item_author`, `content.item_review`, với hợp đồng `wt2_item_set_result`, `item_review_result` trong knowledge.v1.
  - Đi qua cùng gateway, chỉ gửi dữ liệu loại `knowledge_content`: năng lực của khung (mã, tiêu chí) và các đề đã có để tránh trùng chủ đề.
  - Không gửi nguồn hay dữ liệu người học.
  - Migration `0016_item_authoring_runs` dựng lại `authoring_runs` (giữ mọi dòng) để mở rộng CHECK task_type.
- **Kiểm tra xác định trước khi đóng gói** (`src/domain/knowledge/item-checks.ts`). Đề có lỗi bị ghi là loại và không đóng gói:
  - năng lực phải có trong khung;
  - đề đủ dài;
  - không ép cấu trúc (số đoạn, số câu, số từ nối);
  - không đưa ý hay bài mẫu;
  - không trùng gần với đề đã có hoặc đề cùng lô. Trùng gần đo bằng Jaccard trên từ nội dung, bỏ câu lệnh chung của dạng đề; ngưỡng 0,6 ở `policies/authoring/wt2-items.v1.json`. Đây chỉ là bộ lọc sơ bộ; QC4 vẫn xét ngữ nghĩa "originality".
- **Đóng gói:** mỗi đề là một gói `ai_authored` riêng (`pkg-wt2-ai-<lô>-<key>@v1`), để một đề lỗi không chặn cả lô và thu hồi theo từng đề. Gói gồm:
  - `task_item`: đề, một câu hỏi `essay` "Write at least 250 words.";
  - `answer_key`: chỉ verifier/assessor thấy. Bài luận không có đáp án cố định, nên khóa ghi `essay_assessed_by_rubric`; `measurement_targets` là các năng lực đo (mục tiêu ẩn);
  - `rubric`: tiêu chí chính thức (vị trí ô trong bảng band descriptors), hướng dẫn quan sát của các năng lực đo, ghi chú tổng hợp của khung.
  - Căn cứ nguồn là các nguồn của khung đã duyệt.
- **Bao phủ:** cả hai vai trò `practice`, `independent_verification` yêu cầu `support_content` (rubric).
  - Gói đề không khai ca kiểm thử chấm có kết quả kỳ vọng. Các ca đó thuộc bộ đối chứng (C6, N9): bài mẫu AI viết không được làm chuẩn (05 §5.C).
- **QC:**
  - QC1–3 phần xác định chạy như mọi gói.
  - Một lượt AI rà soát độc lập (`content.item_review`) đọc lại **đúng nội dung đã đóng băng** từ kho bất biến. `BuilderPipeline.recordAiReview` ghi kết quả gắn với bundle hash đó:
    - QC2 ngữ nghĩa ← `competency_mapping`;
    - QC3 ngữ nghĩa ← `no_forced_structure`, `no_model_answer_or_ideas`;
    - QC4 ← `clear_unambiguous`, `genre_match`, `originality`, và verdict.
  - Phương thức `ai_semantic` chỉ cho provider CLI thật; FakeAdapter hoặc kết quả synthetic ghi `synthetic_fake`, và cổng phát hành từ chối với nội dung không synthetic.
  - Đây là cách tự động hóa phần ngữ nghĩa theo N6; trước đây phần này là xác nhận tay (`manual_attestation`).
- **Phát hành:** gọi `release` với đúng bundle hash đã rà soát; cổng kiểm lại mọi điều kiện như cũ. Đề không đạt ở lại dạng nháp, có mục *Cần xử lý*.
  - Lượt rà soát lỗi thì gói đã đóng băng chờ `author -- items-review <lô>`; lệnh này không gọi AI soạn lại.
- **N8:** mỗi lô dùng 2 lượt gọi AI (soạn + rà soát). Trần 10 lượt mỗi ngày học (`Asia/Bangkok`), kiểm trước khi gọi, tính cả lượt lỗi.
- **Tiếp xúc:** API và màn lô đề không gửi nguyên văn đề xuống trình duyệt. Đọc đề phải qua *Xem nội dung* của Gói tri thức, nơi ghi tiếp xúc trước, để đề đã xem không bị dùng làm bài kiểm chứng độc lập.
- **Chưa làm (C3b):**
  - màn học Writing chưa cấp các đề này (vẫn dùng gói synthetic);
  - chấm chưa dùng năng lực của khung;
  - màn duyệt mẫu ngẫu nhiên của N6 chưa có (hiện chỉ có danh sách lô và *Xem nội dung*/thu hồi ở Gói tri thức);
  - nhiệm vụ đoạn ngắn 7A (`meets_min_scope`) chưa sinh.
- **Test:** `tests/integration/e47-item-authoring.test.ts` (9 ca), executor giả, không gọi AI thật:
  - kiểm tra xác định; hợp đồng và chỉ dẫn;
  - chặn khi chưa có khung;
  - phát hành ai_authored với QC `ai_semantic`;
  - lỗi rà soát giữ nháp; FakeAdapter bị chặn;
  - rà soát lại sau lỗi; tránh trùng giữa các lô và trần N8;
  - API cần phiên.


## E-48 — Claude Code 2.1.329: plugin dựng sẵn `cc-plugin-privacy` và thư mục `plugins/store/` (20/11/2026, **người dùng chốt**)
- **Bối cảnh:** khi đăng nhập lại profile `claude-main`, Claude Code tự cập nhật 2.1.304 → 2.1.329. Bản mới có ba thay đổi:
  - nạp thêm plugin dựng sẵn `cc-plugin-privacy`;
  - tự ghi `plugins/store/<plugin>_builtin-<hex>.json` (dấu trạng thái của plugin dựng sẵn, ví dụ một dòng `usage-rows-queued` của `cc-plugin-agents-md`);
  - khi mở giao diện tương tác thì tự tải catalog `plugins/marketplaces/…` và `known_marketplaces.json`.
- **Quyết định:**
  - **Người dùng chọn cho phép `cc-plugin-privacy`.** `CLAUDE_ALLOWED_BUILTIN_PLUGINS` nay có 4 plugin; plugin khác vẫn làm probe FAIL. `tools: []` và `mcp_servers: []` vẫn bắt buộc.
  - `isClaudePluginCacheOnly` chấp nhận thêm `plugins/store/` nếu thư mục chỉ chứa file thường tên `<plugin dựng sẵn được phép>_builtin-<hex>.json`. Đây là áp dụng kỹ thuật trong phạm vi quyết định trên.
  - Catalog marketplace **không** được cho phép. Người dùng chọn xóa (đã xóa); nếu đăng nhập lại bằng giao diện tương tác thì cần xóa lại.
- **Bằng chứng:**
  - probe-boundary 20/11/2026: PASS (`tools=[]`, `mcp_servers=[]`, cấu hình sạch);
  - verify 2.1.329: `claude.ai (pro)`, prompt synthetic thoát 0, claude-opus-5-5 đạt, timeout/cancel đạt.
  - Các trường xác nhận (Claude Pro, `applies_to_cli`, envelope VERIFIED, error_patterns như bản 21/10/2026) được điền theo đồng ý của người dùng qua chat ("Nạp và chạy"). Nạp `var/ai/evidence-claude-3.json` → claude-code READY.
- **Test:** `tests/unit/e45-claude-plugin-cache.test.ts` thêm 2 ca: danh sách đúng 4 plugin; `store/` chỉ nhận file trạng thái của plugin được phép, từ chối plugin lạ, thư mục con và `marketplaces/`.

## E-49 — C3b phần 1: kho đề Writing Task 2 do AI soạn trong màn học (20/11/2026, người dùng "Làm C3b"/"tiếp tục triển khai"; quyết định triển khai, đảo ngược được)
- **Đọc đề:** `src/application/learning/writing-catalog.ts` đọc metadata của đề `ai_authored` từ các đơn vị đã đóng băng:
  - đề, dạng, chủ đề, họ đề, số từ tối thiểu, rubric, phiên bản khung;
  - năng lực đo, lấy từ answer key qua reader `assessor`. Năng lực đo **không** gửi cho trình duyệt.
  - Metadata không phụ thuộc trạng thái phát hành, nên lịch sử của đề đã thu hồi vẫn có nhãn. Đề có được cấp hay không do `servableItem` quyết định.
- **LearningWorkflowService:**
  - `itemMeta()` gộp đề synthetic và đề AI, có cờ `synthetic`. G0 dùng `meta.synthetic` (trước là "có trong danh sách synthetic"), cùng `isSyntheticEvidence` như cũ.
  - `competencyDefs()` gồm năng lực synthetic và năng lực của khung đã duyệt; màn Tiến độ hiện cả năng lực của khung.
  - Bối cảnh chấm của đề AI dùng tiêu chí người chấm (`assessor_criterion`) của đúng phiên bản khung mà đề được soạn theo; nếu không đọc được thì dùng khung đã duyệt.
- **Phạm vi:** đề AI chỉ dùng cho `practice` ở chế độ `self_practice`/`exam`, và chỉ khi `aiMode = real`.
  - FakeAdapter không được chấm nội dung thật: chẩn đoán synthetic gắn với năng lực synthetic, sẽ sai nghĩa.
  - Rubric được ghim là rubric của gói đề.
  - Tiếp xúc mức `prompt` ghi khi bắt đầu làm, như mọi đề.
- **Năng lực trọng tâm của vòng lặp:**
  - `writing_loop_states.competency_id` thay hằng `SYNTHETIC_COMPETENCY_ID` ở: kết quả hiển thị, tác động hỗ trợ của gợi ý, `integratedStep9`, kết quả dùng cho bước kế.
  - Với đề AI, sau chẩn đoán thật đầu tiên, trọng tâm chuyển sang vấn đề ưu tiên đầu tiên có observation `not_met`. AI đề xuất vấn đề; observation quyết định.
  - Với đề synthetic, hành vi không đổi.
- **Chưa hỗ trợ với đề AI** (409 `AI_ITEM_LOOP_NOT_SUPPORTED`):
  - Bước 6: concept check hiện so khớp từ khóa của bài synthetic;
  - 7A: dùng đề 7A synthetic.
  - `scheduleVerification` chỉ lập lịch cho năng lực `syn.`.
  - Phần còn lại: 7A/7B/9 bằng đề AI chưa lộ (dùng `assessNovelty`), Bước 6 theo khung, màn duyệt mẫu N6, đề đoạn 7A.
- **API/UI:**
  - `GET /api/learning/writing-bank`: chỉ metadata, cờ `seen` theo tiếp xúc, đề chưa xem xếp trước.
  - Thẻ *Kho đề Writing Task 2* ở Học hôm nay.
- **Test:** `tests/integration/e49-writing-bank.test.ts` dùng adapter giả lập thay provider thật, qua learning worker, nên không chứng minh CLI thật. Các ca:
  - kho không lộ đề; chặn ở chế độ synthetic và ngoài phạm vi luyện tập;
  - đề hiện khi bắt đầu, không lộ năng lực đo;
  - bối cảnh chấm dùng tiêu chí khung; chẩn đoán thật; trọng tâm chuyển sang năng lực chưa đạt;
  - gợi ý không lộ câu mẫu; tác động hỗ trợ đúng năng lực;
  - bằng chứng không synthetic, `composite`; Bước 6/7A bị chặn;
  - thu hồi thì ngừng cấp, lịch sử giữ nhãn.

## E-50 — Hoàn tất C3 với đề AI (đề đoạn 7A, Bước 6, 7A/7B/9, duyệt mẫu N6) và C5 (20/11/2026, người dùng "làm xong hết toàn bộ"; quyết định triển khai, đảo ngược được)
- **Đề đoạn 7A (N5):**
  - `wt2_item_set_result` thêm `task_scope` (`essay` | `paragraph`, không bắt buộc, mặc định essay); lệnh `author -- items --paragraph [--focus id,…]`.
  - Kiểm tra xác định: đề đoạn nhắm **đúng một** năng lực (`PARAGRAPH_TARGET`); loại đề phải đúng loại đã yêu cầu (`TASK_SCOPE_MISMATCH`).
  - Gói đề đoạn có `task_types` chứa `paragraph`, câu hỏi "Write one paragraph of at least 100 words." Catalog đọc thành breadth `short`, 15 phút.
  - Chỉ dẫn rà soát nói rõ: yêu cầu viết một đoạn là vai trò của đề, không phải ép cấu trúc.
- **Kho đề** chỉ hiện bài luận. Đề đoạn giữ chưa xem cho 7A, và không làm luyện tập được.
- **Chọn đề kiểm chứng** (`pickVerificationItem`): đề AI đang cấp, đúng breadth (đoạn cho 7A, bài luận cho 7B/9), có đo năng lực đó, **mới** theo `assessNovelty` với mọi tiếp xúc (kể cả tiếp xúc ở builder), chưa gắn vào nhiệm vụ đang mở; thứ tự xác định.
  - Không có đề: 7A báo `NO_ELIGIBLE_7A_TASK`; 7B/9 không xếp lịch. Cả hai mở review `coverage_gap` (target `competency`, mỗi ngày học một mục) kèm lệnh soạn bù.
  - Không bao giờ thay bằng đề synthetic hay đề đã xem.
  - Nhiệm vụ 7B/9 của năng lực khung có `synthetic = 0`; `startAttempt` cho đề AI nhận purpose 7B/9 khi có `task_id` (không ở chế độ guided).
- **Bước 6 với đề AI:**
  - Bài học là giải thích nấc 3 đã qua kiểm tra tiết lộ của chẩn đoán thật; hiện bài học thì ghi tiếp xúc `explanation`.
  - Câu trả lời tự do **không** chấm bằng so khớp chữ (04: so khớp không công nhận hiểu). Người học trả lời, nhận ý chính một lần trong phản hồi đó (không lưu, không gửi trước), rồi tự đánh giá (`self_check`).
  - Bước 6 không tạo bằng chứng, chỉ mở 7A; 7A (đề mới, không gợi ý) mới là kiểm chứng.
- **Duyệt mẫu ngẫu nhiên N6:**
  - Migration `0017_item_sample_reviews`: mỗi đề rút một lần; quyết định một lần; trigger chặn sửa/xóa.
  - `drawSamples` ghi tiếp xúc `prompt` (surface builder) trong cùng transaction trước khi trả nguyên văn.
  - `decideSample('revoke')` cần ghi chú và gọi `BuilderPipeline.revoke`.
  - Có tab UI và 3 route `/api/console/item-samples*`.
- **C5 (N8):**
  - `coverage()` báo hai ô, đề đoạn và bài luận: số đề chưa xem, số họ đề, năng lực có `coverage_gap` mở. Ngưỡng ở `coverage` của chính sách: 3 đề / 2 họ / bổ sung 5.
  - `replenish()` soạn một lô cho mỗi ô thiếu (ô có năng lực thiếu đề kiểm chứng trước, `focus` theo các năng lực đó). Lệnh kiểm trần N8 trước mỗi lô và trả lý do bỏ qua thay vì ném lỗi.
  - CLI `author -- coverage | replenish`.
  - Worker `--learning --replenish [--replenish-every-min 30]`: `runWorkerLoop` thêm `onIdle`, chỉ chạy khi hàng đợi rảnh, lỗi của hook không dừng worker.
  - Phần "Ô đang có nhiệm vụ đến hạn được ưu tiên" được hiểu là: năng lực có review thiếu đề kiểm chứng đang mở.
- **Test:**
  - `tests/integration/e50-ai-verification-chain.test.ts` (5 ca): kiểm tra đề đoạn; chuỗi luyện tập → Bước 6 → 7A đề đoạn → 7B trên bài luận chưa xem; thiếu đề → gap → replenish có focus → 7A chạy được; trần N8 và không có khung; duyệt mẫu.
  - `e49` cập nhật cho Bước 6 mới.
  - Adapter giả lập, không gọi AI thật.

## E-51 — C4: nhập đề Writing Task 2 của người học (20/11/2026, người dùng "Làm C4 và phần còn lại"; căn cứ N7 đã đồng ý ở E-36; quyết định triển khai, đảo ngược được)
- **Loại dữ liệu mới** `learner_owned_content`:
  - Migration `0018_learner_owned_consent` dựng lại `ai_data_consents` (giữ mọi dòng) để mở rộng CHECK.
  - Thêm vào `DATA_CLASSES` và `USER_APPROVED_DATA_CLASSES`, vì N7 khuyến nghị "có gửi đề cho AI" và người dùng đã đồng ý ở E-36.
  - Mỗi provider vẫn cần cấp riêng (mặc định từ chối). Lệnh `consent … grant` là việc của người dùng; ứng dụng không tự cấp.
  - `dataClassesFor`: nội dung `learner_owned` → `learner_owned_content`, không còn mượn `learner_submission` (thay cách tạm của E-41). Bài làm của người học vẫn thêm `learner_submission`.
  - `gatewayAuthoringExecutor` nhận danh sách loại dữ liệu.
- **Nhập đề** (`LearnerItemService.importPrompt`, `POST /api/learning/own-items`): đồng bộ, **không gọi AI**.
  - Chỉ Writing Task 2. Task 1/GT Task 1/Speaking trả `TASK_NOT_SUPPORTED`, vì chưa có khung để chấm.
  - Bắt buộc xác nhận quyền; tối đa 2.000 ký tự, tối thiểu 15 từ; trùng gần với đề đã nhập thì từ chối. Cùng `request_key` trả cùng đề.
  - Ghi một bản ghi Source Registry riêng cho mỗi đề: origin `teaching`, quyền `determined`, cho lưu/xử lý AI/hiển thị; căn cứ là lời khai của người học kèm thời điểm.
  - Đóng gói `learner_owned` như đề AI (item, khóa ẩn, rubric từ khung đã duyệt). Năng lực đo là **mọi** năng lực của khung: bài luận đầy đủ cho cơ hội thể hiện từng năng lực, và người chấm trả `opportunity: absent` khi đề không cho cơ hội.
  - Vai trò sử dụng: chỉ `practice`.
  - **Tiếp xúc:** luôn ghi `prompt` (người học đã gõ đề); khai "đã xem bài mẫu/đáp án" thì ghi thêm `sample_or_variant` để quy tắc tính mới loại kết quả khỏi vận dụng độc lập (N7).
- **Rà soát** (`reviewPending`): một lượt `content.item_review` cho mọi đề đang chờ, trên đúng nội dung đã đóng băng, dùng loại dữ liệu `learner_owned_content`.
  - Payload ghi chú nguồn gốc; mọi phát hiện `originality` bị bỏ qua, vì đề của người học thường là đề đã xuất bản. Chỉ dẫn rà soát thêm dòng "làm theo DATA.context.note".
  - QC2/QC3/QC4 ghi như E-47; đạt thì phát hành (không cần người duyệt thêm: chính người học đưa đề vào).
  - Lượt rà soát không chạy trong request web. Worker `--learning` chạy nó khi rảnh (2 phút/lần), hoặc dùng CLI `author -- own-review`. Có trần riêng mỗi ngày (cùng con số N8, đếm riêng `target_id = learner-items`).
- **Phục vụ:**
  - Kho đề hiện đề `learner_owned` với nhãn "(đề của bạn)". `writing-catalog` nhận cả hai nguồn gốc.
  - Chọn đề kiểm chứng và độ phủ N8 chỉ dùng `ai_authored`.
- **UI:** mục *Thêm đề Writing Task 2 của bạn* ở Học hôm nay (form và danh sách trạng thái). CLI `author -- own-list | own-review`.
- **Chưa làm:** Task 1 Academic (ảnh biểu đồ, bảng số liệu cho QC1), GT Task 1, Speaking; AI đề xuất dạng đề thay người học chọn (hiện AI chỉ kiểm dạng người học chọn).
- **Test:** `tests/integration/e51-learner-items.test.ts` (4 ca). `e41` và `p2-e11` cập nhật cho loại dữ liệu mới.

## E-52 — Speaking dạng văn bản: khung năng lực và đề Part 1–3 dùng chung đường Writing (20/11/2026, người dùng "Làm C4 và phần còn lại"; theo E-43; quyết định triển khai, đảo ngược được)
- **Khung:**
  - `policies/authoring/speaking-framework.v1.json` (`ielts-speaking-text`). Nguồn: band descriptors Speaking, key assessment criteria Speaking, trang định dạng Speaking; cả ba đã duyệt ở tab Nguồn.
  - `requirements.criteria` = fluency_coherence, lexical_resource, grammatical_range_accuracy; `id_prefix` = `spk`; `excluded` = phát âm và đặc điểm khi nói.
  - Bảng band descriptors bỏ cột Pronunciation (`band_table.exclude_criteria`). Kiểm thật: 28 ô (3 tiêu chí × 9 Band, cộng Band 0).
- **Tổng quát hóa:**
  - `FrameworkRequirements` thêm `criteria`/`id_prefix`, mặc định giữ nguyên Writing Task 2. `checkFramework` báo `FW_ID_NAMESPACE`, `FW_CRITERION_OUT_OF_SCOPE`.
  - Hợp đồng nhận mã `spk.(fc|lr|gra).…` và tiêu chí `fluency_coherence`, ở cả `competencies` và `observation_guide`.
  - Chỉ dẫn soạn khung đọc tác vụ, tiêu chí và tiền tố từ `DATA.context`, không gắn cứng Writing Task 2.
  - CLI `--skill speaking`; API `?skill=`; tab Khung năng lực có bộ chọn kỹ năng.
- **Đề Speaking:**
  - `policies/authoring/speaking-items.v1.json`: `task_type` `speaking_text`, mã đề `spk-ai-…`, dạng `part1|part2|part3`.
  - Part 1 là phạm vi "paragraph" (ngắn, nhắm một năng lực, dùng cho 7A); Part 2/3 là bài trả lời đầy đủ (luyện tập, 7B/9).
  - Hướng dẫn trả lời: "Answer in writing as you would speak (at least N words)".
  - Chỉ dẫn soạn/rà soát có quy tắc riêng cho Speaking: kiểm `genre_match` theo dạng Part, chấp nhận văn nói.
  - Kho đề, catalog và workflow nhận `speaking_text`. Chấm dùng năng lực `spk.` của khung Speaking (đúng phiên bản), `task.skill = speaking_text`; chỉ dẫn chấm nói rõ "không chấm phát âm, tốc độ, ngập ngừng".
  - Bằng chứng có modality `speaking`. Hồ sơ hiện cả năng lực Speaking.
  - Worker `--replenish` bổ sung kho đề cho từng kỹ năng có khung đã duyệt.
- **Chẩn đoán lỗi hợp đồng:** khi kết quả AI vi phạm hợp đồng, executor soạn nội dung giờ ghi tối đa 5 lỗi kiểm tra (đường dẫn trường và thông báo, không chứa giá trị) vào `authoring_runs.error`. Nhờ đó tìm ra mẫu mã `observation_guide` còn gắn cứng `wt2`.
- **Test:** `tests/integration/e52-speaking-text.test.ts` (2 ca). Adapter giả lập, không gọi AI thật.

## E-53 — D-07: ổ đĩa sắp đầy (20/11/2026, **người dùng chốt** "Cảnh báo + dọn bản sao nguồn")
- **Ngưỡng** (`src/infrastructure/files/disk-guard.ts`, theo dung lượng trống của ổ chứa `var/`):
  - dưới **5 GB**: cảnh báo ở Học hôm nay (`GET /api/learning/disk`), ở `sources -- status` và trong báo cáo dung lượng;
  - dưới **2 GB**: chặn tải mới. Lượt quét dừng trước lần tải kế tiếp và giữ hàng đợi; `tts -- say` từ chối tạo audio mới (mã `DISK_LOW`). Viết, lưu nháp, nộp bài và chấm vẫn chạy.
- **Không bao giờ tự xóa.** Lệnh `npm.cmd run sources -- prune-copies` do người dùng tự chạy: mặc định chỉ liệt kê, có `--apply` mới xóa.
  - Chỉ xóa bản sao nguồn có thể tải lại mà không ai dùng: file của trang đã **loại** và file không còn dòng nào trỏ tới (gồm `.txt/.layout.json/.rules.json` đi kèm PDF).
  - Bản sao dùng chung nội dung với một trang đã duyệt hoặc đang chờ thì giữ.
  - Không đụng nguồn đã duyệt (khung năng lực trích dẫn chúng), bài làm, audio của người học, backup, lịch sử. Dòng `source_candidates` của trang đã loại vẫn giữ để không bị quét lại.
- **Số liệu thật lúc chốt** (chạy thử, chưa xóa): 3.902 file / 423,7 MB của trang đã loại; ổ còn 60,3 GB (mức ok).
- **Test:** `tests/integration/e53-disk-guard.test.ts` (3 ca: ngưỡng, crawler dừng khi ở mức chặn, phạm vi dọn).

## E-54 — Listening: khung, Part do AI soạn, audio Piper, QC4 giải mù trên transcript, màn làm bài (23/11/2026, người dùng "Làm tiếp"; theo N1/N5/N6/N8 và E-44; quyết định triển khai, đảo ngược được)
- **Khung** `policies/authoring/listening-framework.v1.json` (`ielts-listening`, mã `lis.`):
  - Năm tiêu chí lấy từ những gì trang định dạng đề chính thức nói bài thi đánh giá: `main_ideas`, `detail`, `opinion_attitude`, `purpose`, `development`.
  - Không có bảng band descriptors (Listening chấm theo số câu đúng): `band_table` trong chính sách khung nay không bắt buộc, rubric chính thức rỗng.
  - Nguồn: hai trang định dạng Listening (Academic, GT) đã duyệt.
- **Hợp đồng và task type:**
  - `listening_item_set_result`: Part 1–4, bối cảnh, người nói (A–C, nữ/nam), kịch bản theo dòng, 5–10 câu hỏi. Dạng câu hỏi: điền form/ghi chú/câu, trả lời ngắn có giới hạn 1–3 từ, trắc nghiệm 3–4 lựa chọn. Mỗi câu kèm các dạng đáp án chấp nhận, câu trích bằng chứng và năng lực.
  - Task `content.listening_author` và `content.listening_solve` (kết quả `blind_solve_result`). Migration `0019_listening` dựng lại `authoring_runs`, thêm `listening_sessions` và `listening_results` (bất biến).
- **Kiểm tra xác định** (`domain/knowledge/listening-checks.ts`), trước khi gọi TTS:
  - câu trích có nguyên văn trong kịch bản; đáp án điền từ được nói nguyên văn và trong giới hạn từ; câu hỏi không chứa đáp án;
  - khóa trắc nghiệm là đúng một lựa chọn; id câu hỏi q1..qn theo thứ tự; người nói khai báo đủ;
  - độ dài kịch bản (cảnh báo dưới 250 hoặc trên 900 từ, lỗi dưới 150); trùng gần (transcript).
- **Audio:**
  - Mỗi dòng kịch bản đọc bằng Piper cục bộ, giọng theo vai: nữ/nam theo danh sách trong chính sách và những giọng đã cài, khác nhau khi có thể.
  - `infrastructure/audio/wav.ts` ghép các đoạn PCM, chèn khoảng lặng, từ chối các đoạn khác định dạng. Lưu vào kho media.
  - Kiểm tra ổ đĩa (D-07) và kiểm tra có giọng TTS chạy **trước** lượt gọi AI.
- **Gói:**
  - `task_item` có `stimulus.media` là audio và `stimulus.text` là transcript (gồm dòng vai trò người nói). Transcript là căn cứ của đáp án và của QC4.
  - Khóa đáp án chỉ cho verifier/assessor, `measurement_targets` là hợp các năng lực.
  - Rubric gồm hướng dẫn quan sát của khung. Vai trò: luyện tập, kiểm chứng.
- **QC:**
  - **QC4** = lượt `content.listening_solve` chỉ nhận transcript, hướng dẫn và câu hỏi (không khóa, không câu trích). App so từng câu với khóa (`compareBlind`, không phân biệt hoa/thường, dấu câu cuối); có câu sai hoặc AI báo mơ hồ thì FAIL.
  - **QC2/QC3** = một lượt `content.item_review` có khóa, với ghi chú riêng cho Listening: bỏ qua `originality` và `no_forced_structure`, vì giới hạn số từ là định dạng IELTS.
  - Hai lượt phải cùng từ provider CLI thật, nếu không thì `synthetic_fake`. Đạt thì tự phát hành (N6). Mỗi lô 3 lượt gọi, trần 10/ngày đếm riêng (`lis-ai-items`).
- **Màn học** (`ListeningWorkflow`, `web/listening.tsx`), chỉ cho gói `ai_authored` của Listening đang phát hành:
  - Bắt đầu thì ghi tiếp xúc `prompt`; người học nhận bối cảnh, câu hỏi và audio, **không** có transcript hay khóa.
  - Nộp thì chấm xác định, mỗi lượt một lần; ghi tiếp xúc `answer`/`explanation` trước khi trả transcript, khóa và câu trích.
  - Như Reading (03 §3): chỉ ghi đúng/sai từng câu, **không** tạo observation hay kết luận năng lực Listening; không báo Band.
  - Chế độ thi: trình phát cho nghe một lần, không tua. Server chỉ đếm số lần tải audio, vì trình duyệt cần tải lại khi tua/đệm.
- **Chưa làm:** dạng câu hỏi bản đồ/sơ đồ và nối; bổ sung tự động kho Listening (C5); kết luận năng lực từ kết quả Listening (cần chính sách riêng); duyệt mẫu N6 cho Listening.
- **Test:** `tests/integration/e54-listening.test.ts` (6 ca). TTS giả và executor giả; không gọi AI hay Piper thật.

## E-55 — C6: đối chiếu định tính với bài mẫu chính thức có điểm (23/11/2026, **người dùng chốt** "Nhập mẫu, đo định tính")
- **Nguồn:** hai PDF "example responses … with band scores and examiner comments" (Academic, General Training) đã duyệt, khai trong `policies/calibration-samples.v1.json`.
- **Tách bài** (`domain/knowledge/calibration.ts`): xác định, không gọi AI, mọi trường là bản sao nguyên văn của văn bản đã lưu. Mẫu nhận dạng: tiêu đề "Sample … Writing Part N" / "… Writing Sample Task N", nhãn bài, bài làm, "Examiner comment", "Band X", nhận xét (kết thúc ở dấu trang).
  - Thật: **6 bài**. Academic T1 Band 6 và 4; Academic T2 Band 5.5 và 7.5; GT T1 Band 5.5; GT T2 Band 5. Tức **3 bài Task 2**.
- **Chạy** (`calibrate -- run`): mỗi bài Task 2 một lượt `writing.assess` qua gateway, dữ liệu `knowledge_content` (tài liệu công khai, không phải dữ liệu người học), với năng lực của khung Writing đã duyệt.
  - Người chấm **không** nhận Band hay nhận xét của giám khảo.
  - Đề bài không có trong nguồn, nên bối cảnh chấm ghi rõ điều đó và dặn trả "inconclusive" khi bài làm không tự thể hiện đủ.
  - Bài Task 1 lưu nhưng không chấm (chưa có khung Task 1).
  - Lượt gọi ghi trong tài liệu kết quả (provider, model, hash đầu vào/đầu ra), không ghi vào `authoring_runs` vì đây không phải lượt soạn nội dung.
- **Báo cáo:** JSON (`knowledge/calibration-run/<run>`) và Markdown trong `var/reports/`. Mỗi bài: Band và nhận xét của giám khảo, số năng lực đạt/chưa đạt/chưa đủ kết luận theo tiêu chí, lý do chưa đạt, lỗi trọng tâm.
  - **Không** có ngưỡng ánh xạ Band ↔ kết quả, không độ lệch số, không ước lượng Band; báo Band vẫn tắt. Không đăng ký thành bộ đối chứng P4 (cổng failover), vì không có kết quả kỳ vọng theo năng lực.
- **Còn mở (cần chính sách):** đo định lượng và báo Band. Cần ≥ 20–30 bài Task 2 có điểm (N9) và một quy tắc ánh xạ do người dùng chốt.
- **Test:** `tests/integration/e55-calibration.test.ts` (3 ca: tách, chỉ chấm Task 2 không lộ Band, chặn khi chưa có khung).

