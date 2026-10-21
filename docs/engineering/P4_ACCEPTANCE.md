# P4 — nghiệm thu phần độc lập

Phạm vi: synthetic tự viết, SQLite thật, CLI giả; không gọi AI thật. P4 toàn phần **IN_PROGRESS**, chưa DONE: D-01 claude-code/agy và D-05 đối chứng có nguồn/quyền vẫn mở. Codex READY theo bàn giao D-01 ngày 20/10/2026; không xác minh lại trong lượt này. D-02/D-06 không thay đổi.

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
| 06A-B11 | CLI đọc ngoài scope | integration/p2-gateway.test.ts; integration/probe-boundary.test.ts | Fixture guard; thật chờ D-01 claude-code/agy; Codex theo báo cáo D-01 trước |
| 06A-B12 | Đổi hãng giữa gợi mở, thiếu audio | integration/p3-learning.test.ts; integration/p3-reading.test.ts; integration/p4-failover.test.ts (hint history) | Không gửi audio; D-06 mở |

## Code và nghiệm thu

| Phần | Code | Test |
|---|---|---|
| 1 | domain/scheduling/fallback.ts; sqlite/replan-repository.ts | p4-resilience.test.ts; các ca hiện có trong ma trận |
| 2 | gateway/gateway.ts, gateway/compose.ts; worker/worker.ts; sqlite/job-queue.ts; domain/jobs/budget.ts | p4-failover.test.ts: CLI Node giả, quota/rate/auth, 3 hãng, D-01/D-05 thiếu, refusal, context và lịch sử gợi mở; p1-queue.test.ts: restart/timeout/fencing |
| 3 | application/learning/complaints.ts; server/app.ts; web/learning.tsx; worker/main.ts; sqlite/job-queue.ts; writing-workflow.ts | p4-complaints.test.ts: HTTP + SQLite, cùng nguồn, supersedes, sửa rubric, thu hồi cả hai chiều/hồ sơ; p2-pipeline.test.ts: cache/impactOf/review_items |
| 4 | contracts/benchmark.v1.schema.json; domain/knowledge/benchmark-suite.ts; sqlite/ai-accounts-repository.ts; migrations/0007_p4_resilience.sql | p4-benchmark.test.ts: nguồn/quyền, dev/holdout, hash/version/model, bất biến, thiếu báo cáo, synthetic không mở dự phòng thật |

Code thuộc src/, trừ contracts/migrations; test thuộc tests/integration/.

## Giới hạn và cổng hoàn thành

- Đã triển khai 1–4 phần độc lập, không tự ghi P4 DONE. Lệnh và kết quả cuối ở PROGRESS; full check trong sandbox còn lỗi môi trường, không gọi đó là PASS.
- **Chờ D-01:** claude-code/agy chưa đủ chứng cứ thật và vẫn tắt. Ca ba hãng dùng seam quyết định synthetic với CLI Node, không chứng minh agy có cơ chế cô lập thật. Guard thật vẫn giữ agy isolation null và NO_COLLECTOR_FOR_PROVIDER cho hãng chưa có collector.
- **Chờ D-05:** chưa có bộ đối chứng thật có nguồn/quyền và kết quả so sánh chất lượng chấm/gợi mở. Router thật luôn yêu cầu require_sourced true; synthetic chỉ dùng cổng fixture trong test. scoring_quality_claimed luôn false: kiểm cấu trúc không chứng minh chất lượng.
- Báo cáo benchmark ghim suite hash, provider, CLI và model; nguồn/quyền do người vận hành cung cấp, không tự suy từ URL. Chưa có CLI nhập đối chứng hay mô hình hiệu chuẩn Band.
- Không có reset time quan sát được thì không bịa giờ reset hay polling; hồi phục đòi xác minh lại. RATE_LIMIT là COOLDOWN, khác QUOTA_EXHAUSTED. Có hãng khác đủ điều kiện thì chuyển ngay, không gọi lại hãng đang cooldown.
- Khiếu nại có job lỗi/thu hồi vẫn giữ review và bản cũ, không tự công nhận người học đúng. Job hoàn tất ghi supersedes; review còn mở để phân loại 5 nhánh 05 §7.A. Không tự sửa kho đáp án từ một khiếu nại.
- Proposal chỉ kiểm version/expiry/idempotency; tạo và áp lịch đầy đủ thuộc P5. Giao diện khiếu nại chưa kiểm bằng browser; test là HTTP integration.
- D-02/D-06 giữ nguyên; không Band, không gửi learner_audio, không tuyên bố đã chấm phát âm thật.
