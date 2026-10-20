# Quyết định và điểm còn mở

Ngày lập: 19/10/2026. Các quy định engineering là bổ sung triển khai theo ủy quyền của người dùng; không được diễn đạt thành quyết định nghiệp vụ đã chốt trước đó.

## Quyết định triển khai khởi đầu
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

## Điểm mở và điều kiện đóng
| ID | Nội dung | Chặn ở đâu | Bằng chứng cần để đóng |
|---|---|---|---|
| D-01 | CLI thật, entitlement, billing và isolation chưa thử | Bật từng adapter thật ở P2/P4 | Phiên bản + argv/launch path + auth mode không chứa secret + quyền lợi + tình trạng extra usage + test chặn file ngoài scope + timeout/cancel + output contract |
| D-02 | Ngưỡng tin cậy, nâng/hạ trạng thái, lịch ôn và trọng số chưa định lượng | Bật chính sách tự động tương ứng | Bảng policy có nguồn, phiên bản, ca đạt/chưa đạt/chưa kết luận; tham số đề xuất cần đánh giá trước khi gọi là chuẩn |
| D-03 | ĐÃ CÓ schema/state P0 và persistence/constraints/recovery P1 (migration 0001, P1_ACCEPTANCE); còn 6 đầu ra tri thức đầy đủ | Hoàn tất P2 | Source registry, playbook, QC/coverage/release manifests |
| D-04 | ĐÃ ĐẠT spike Windows runner/SQLite và backup phối hợp DB + JSON + media (P1-4); chưa có adapter entrypoint/isolation | Tích hợp thật P2 | Xử lý shim .cmd/.ps1 bằng entrypoint đã xác minh, quyền file thực |
| D-05 | Chưa có gói nội dung, quyền sử dụng và đối chứng | Phát hành gói học / báo Band | Nguồn được phép dùng, QC1–4 đúng hash, coverage manifest, bộ đối chứng riêng; thiếu phần nào chặn phần đó |
| D-06 | Chưa chọn ASR/TTS và kiểm chứng audio | Phát âm sâu / sinh Listening thật | Năng lực đo được trên audio gốc, công cụ/phiên bản/tài nguyên; thiếu audio path giữ chưa đủ kết luận |
| D-07 | Chính sách giữ log/context/media, hạn mức ổ đĩa | Dùng dữ liệu cá nhân dài hạn | Cấu hình retention minh bạch, xử lý đầy ổ, export/backup/restore; không xóa lịch sử tự động khi chưa có chính sách |

Người thực hiện hạng mục chịu trách nhiệm thu bằng chứng; AI không tự đóng điểm mở bằng lời khẳng định. Điểm cần quyết định nghiệp vụ đưa cho chủ dự án, phần kỹ thuật xử lý trong quyền đã được giao.

## Mẫu quyết định mới
ID / ngày / trạng thái (đề xuất, áp dụng kỹ thuật, người dùng chốt, thay thế); vấn đề; nguồn; lựa chọn; lý do; tác động; cách kiểm chứng; file đồng bộ; quyết định bị thay thế. Giữ lịch sử, không xóa quyết định cũ.
