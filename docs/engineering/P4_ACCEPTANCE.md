# P4 — nghiệm thu phần độc lập

Phạm vi: synthetic tự viết, SQLite thật, CLI giả; không gọi AI thật. P4 toàn phần **IN_PROGRESS**, chưa DONE: D-01 claude-code/agy (đã xong code/công cụ E-21, chờ người dùng chạy bước đăng nhập/xác nhận trên máy) và D-05 đối chứng có nguồn/quyền vẫn mở. Codex READY theo bàn giao D-01 ngày 20/10/2026; không xác minh lại trong lượt này. D-02/D-06 không thay đổi.

## Ma trận bắt buộc

Đường dẫn test dưới đây tương đối từ `tests/`. Có test không đồng nghĩa đã đạt; lệnh/kết quả thực tế ghi ở PROGRESS. Các ca phụ thuộc provider thật được tách khỏi fixture.

| ID | Ca nguồn | Test hiện có / bổ sung | Giới hạn |
|---|---|---|---|
| 04-C1 | Audio thiếu/nhiễu một phần | integration/p4-resilience.test.ts; unit/rule-engine.test.ts (signal) | Rule synthetic; audio thật chờ D-06 |
| 04-C2 | Mất snapshot trước hỗ trợ | integration/p4-resilience.test.ts (snapshot null và nhật ký hỗ trợ) | Nhật ký hỗ trợ không phụ thuộc snapshot |
| 04-C3 | Hỏi lại/xin thêm lượt, tải lại | integration/p3-learning.test.ts (HTTP hints, autosave) | HTTP integration, chưa browser E2E |
| 04-C4 | Rubric pinning và tái đánh giá | integration/p1-persistence.test.ts; integration/p1-queue.test.ts (re-evaluation) | integration/p4-complaints.test.ts (sửa rubric, supersedes) |
| 04-C5 | QC lỗi/timeout, fallback đủ 5 điều kiện | integration/p2-pipeline.test.ts (failed QC); integration/p4-resilience.test.ts | Không đặt trọng số chọn bài D-02 |
| 04-C6 | Gửi trùng/kết quả muộn | integration/p1-queue.test.ts | SQLite fencing/idempotency |
| 06-A4-1 | Tải lại giữa chừng | integration/p3-learning.test.ts; integration/p3-reading.test.ts | HTTP + mở lại DB |
| 06-A4-2 | Gửi trùng | integration/p1-queue.test.ts; integration/p3-learning.test.ts | Submission/assistance |
| 06-A4-3 | Kết quả muộn | integration/p1-queue.test.ts | Lease/timeout/cancel |
| 06-A4-4 | Đổi rubric | integration/p1-persistence.test.ts | Pin bất biến |
| 06-A4-5 | Thu hồi đề sai | integration/p2-pipeline.test.ts; integration/p3-reading.test.ts | Cache + met/not_met |
| 06-A4-6 | Xem đáp án Console rồi học | integration/p2-console.test.ts; unit/rule-engine.test.ts (novelty) | Exposure dùng chung |
| 06A-B1 | Quota A → B đúng context | integration/p4-failover.test.ts | Provider thật chờ D-01/D-05 |
| 06A-B2 | Cả ba hết quota → WAITING_QUOTA | integration/p4-failover.test.ts | Fixture, trần 3 |
| 06A-B3 | AUTH_EXPIRED | integration/p2-gateway.test.ts; integration/p4-failover.test.ts | Chờ D-01 cho hãng bổ sung |
| 06A-B4 | Loại API key môi trường | integration/p2-gateway.test.ts (allowlist) | Chỉ giá trị synthetic |
| 06A-B5 | Billing không rõ chặn chạy | integration/p2-gateway.test.ts | Không spawn thiếu evidence |
| 06A-B6 | JSON lỗi | integration/p1-queue.test.ts; integration/p2-gateway.test.ts | Một format repair trong trần 3 |
| 06A-B7 | Timeout + kết quả cũ | integration/p1-queue.test.ts; spikes/runner.test.ts | Fencing + supervisor |
| 06A-B8 | Restart worker | integration/p1-queue.test.ts | DB đóng/mở lại |
| 06A-B9 | Thu hồi vô hiệu cache | integration/p2-pipeline.test.ts | Lookup kiểm lại revocation |
| 06A-B10 | Proposal lịch cũ | integration/p4-resilience.test.ts | CAS acceptance; planner đầy đủ thuộc P5 |
| 06A-B11 | CLI đọc ngoài scope | integration/p2-gateway.test.ts; integration/probe-boundary.test.ts; integration/e21-claude-agy.test.ts | Fixture guard + probe/verify E-21; chạy thật chờ người dùng đăng nhập profile Claude riêng ([D01_CLAUDE_AGY](D01_CLAUDE_AGY.md)) |
| 06A-B12 | Đổi hãng giữa gợi mở, thiếu audio | integration/p3-learning.test.ts; integration/p3-reading.test.ts; integration/p4-failover.test.ts (hint history) | Không gửi audio; D-06 mở |

## Code và nghiệm thu

| Phần | Code | Test |
|---|---|---|
| 1 | domain/scheduling/fallback.ts; sqlite/replan-repository.ts | p4-resilience.test.ts; các ca hiện có trong ma trận |
| 2 | gateway/gateway.ts, gateway/compose.ts; worker/worker.ts; sqlite/job-queue.ts; domain/jobs/budget.ts | p4-failover.test.ts: CLI Node giả, quota/rate/auth, 3 hãng, D-01/D-05 thiếu, refusal, context và lịch sử gợi mở; p1-queue.test.ts: restart/timeout/fencing |
| 3 | application/learning/complaints.ts; server/app.ts; web/learning.tsx; worker/main.ts; sqlite/job-queue.ts; writing-workflow.ts | p4-complaints.test.ts: HTTP + SQLite, cùng nguồn, supersedes, sửa rubric, thu hồi cả hai chiều/hồ sơ; p2-pipeline.test.ts: cache/impactOf/review_items |
| 4 | contracts/benchmark.v1.schema.json; domain/knowledge/benchmark-suite.ts; sqlite/ai-accounts-repository.ts; migrations/0007_p4_resilience.sql | p4-benchmark.test.ts: nguồn/quyền, dev/holdout, hash/version/model, bất biến, thiếu báo cáo, synthetic không mở dự phòng thật |
| D-01 / E-21 | application/ai/subscription-guard.ts; gateway/{cli-adapters,gateway,probe-boundary,verify-codex,isolation,envelope}.ts; cli/ai.ts; [D01_CLAUDE_AGY](D01_CLAUDE_AGY.md) | e21-claude-agy.test.ts (6 ca): guard phương thức theo provider (`enforced_boundary` / `cli_tools_disabled` / `cli_permission_deny`), `probe-boundary claude|agy` (tools/mcp không rỗng → FAIL, thiếu deny → FAIL, đọc được mồi → FAIL, không tự tạo/ghi đè settings.json), `verify claude|agy`, stream-json envelope & adapter stdin |

Code thuộc src/, trừ contracts/migrations; test thuộc tests/integration/.

## Giới hạn và cổng hoàn thành

- Đã triển khai 1–4 phần độc lập và toàn bộ code/công cụ thu bằng chứng D-01 cho `claude-code` và `agy` theo **E-21** ([D01_CLAUDE_AGY](D01_CLAUDE_AGY.md)), không tự ghi P4 DONE khi chưa chạy bước xác nhận của người dùng. Lệnh và kết quả cuối ở PROGRESS; full check trong sandbox còn lỗi môi trường ở một số test socket/junction, không gọi đó là PASS toàn bộ.
- **Chờ người dùng hoàn tất bước chạy thật D-01 cho `claude-code` và `agy` ([D01_CLAUDE_AGY](D01_CLAUDE_AGY.md)):**
  1. Tạo profile `%LOCALAPPDATA%\study-english\runners\claude-main` và `agy-main` (cùng thư mục `C:\se-runner\work`).
  2. Đăng nhập Claude trong profile riêng (`$env:CLAUDE_CONFIG_DIR="$env:LOCALAPPDATA\study-english\runners\claude-main"; claude` rồi `/login`); tạo `<agy-main>\.gemini\antigravity-cli\settings.json` với 5 quy tắc `permissions.deny`.
  3. Chạy `npm.cmd run ai -- account …` và `npm.cmd run ai -- confirm-extra-usage claude-code|agy off`.
  4. Chạy `npm.cmd run ai -- probe-boundary claude|agy --profile <dir>`.
  5. Chạy `npm.cmd run ai -- verify claude|agy --profile <dir> …`, rà soát và duyệt file evidence.
  6. Chạy `npm.cmd run ai -- evidence <file> --boundary <probe>`, `npm.cmd run ai -- consent claude-code|agy approved grant`, và `npm.cmd run ai -- status`.
- **Chờ D-05:** chưa có bộ đối chứng thật có nguồn/quyền và kết quả so sánh chất lượng chấm/gợi mở. Router thật luôn yêu cầu require_sourced true; synthetic chỉ dùng cổng fixture trong test. scoring_quality_claimed luôn false: kiểm cấu trúc không chứng minh chất lượng.
- Báo cáo benchmark ghim suite hash, provider, CLI và model; nguồn/quyền do người vận hành cung cấp, không tự suy từ URL. Chưa có CLI nhập đối chứng hay mô hình hiệu chuẩn Band.
- Không có reset time quan sát được thì không bịa giờ reset hay polling; hồi phục đòi xác minh lại. RATE_LIMIT là COOLDOWN, khác QUOTA_EXHAUSTED. Có hãng khác đủ điều kiện thì chuyển ngay, không gọi lại hãng đang cooldown.
- Khiếu nại có job lỗi/thu hồi vẫn giữ review và bản cũ, không tự công nhận người học đúng. Job hoàn tất ghi supersedes; review còn mở để phân loại 5 nhánh 05 §7.A. Không tự sửa kho đáp án từ một khiếu nại.
- Proposal chỉ kiểm version/expiry/idempotency; tạo và áp lịch đầy đủ thuộc P5. Giao diện khiếu nại chưa kiểm bằng browser; test là HTTP integration.
- D-02/D-06 giữ nguyên; không Band, không gửi learner_audio, không tuyên bố đã chấm phát âm thật.


## R-07 / E-22 — lựa chọn và xác minh model
| Yêu cầu | Code | Test / giới hạn |
|---|---|---|
| Model/effort đã verify, giữ cờ an toàn | cli-adapters, gateway, subscription-guard, probe-boundary | e22-models: whitelist, duplicate, cờ an toàn, probe Codex khác effort, permit mặc định |
| Lưu mặc định qua CLI quản trị | src/cli/ai.ts, compose, ai-accounts-repository, migration 0008 | e22-models; P1 persistence/backup với 8 migrations |
| Synthetic từng model; dừng quota; timeout/cancel chung | verify-codex, fake-codex, fake-e21-cli | e22-models 11/11; E-21/P2-E11 21/21; xem PROGRESS |
| Danh mục không inference, có nguồn | listProviderModels, KNOWN_CLI_MODELS | Fake agy models không tạo prompt; ứng viên không đồng nghĩa quyền thuê bao |

Chưa verify thật trong E-22; không thay evidence đã nạp. D-05 vẫn phải khớp model. Full check chưa PASS do giới hạn TEMP/EPERM và profile trong repo; lệnh/kết quả tại PROGRESS.

## E-23 — kiểm ranh giới mỗi lần chạy, bỏ chặn theo phiên bản CLI, canary model
| Yêu cầu | Code | Test / giới hạn |
|---|---|---|
| Bỏ chặn theo `cli_version` / SHA-256 entrypoint; giữ kiểm native executable đúng hãng và hiển thị thông tin trong `status` | subscription-guard, entrypoint, probe-boundary, gateway, cli/ai.ts | e23-runtime-canary.test.ts; p2-gateway.test.ts; probe-boundary.test.ts |
| Kiểm ranh giới trong mỗi lượt chạy (`RUNTIME_TOOLS_PRESENT`, `RUNTIME_DENY_RULES_CHANGED`, `RUNTIME_TOOL_EXECUTED`, `RUNTIME_CODEX_FEATURES_CHANGED`) + giữ chốt thanh toán cứng | cli-adapters, probe-boundary, gateway, ai-accounts-repository | e23-runtime-canary.test.ts (loại kết quả, 0 observation, chuyển trạng thái chặn) |
| Khai báo `models_allowed` độc lập phiên bản (`allow-models` / `models --allow`) + canary 1 prompt theo `(provider, cli_version, model, effort)` | ai-accounts-repository, gateway, cli-adapters, compose, cli/ai.ts, migration 0008 | e23-runtime-canary.test.ts (canary đạt/cache, canary lỗi → `MODEL_CANARY_FAILED`, xác nhận người dùng giữ qua phiên bản) |
