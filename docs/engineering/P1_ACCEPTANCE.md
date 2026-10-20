# Nghiệm thu P1 — 20/10/2026

## Phạm vi
P1 theo [IMPLEMENTATION_PLAN](IMPLEMENTATION_PLAN.md): dữ liệu bền vững, Rule Engine thuần, queue SQLite và backup phối hợp. Quyết định triển khai: E-07 trong [DECISIONS](DECISIONS.md). Windows 11, Node 22.18.0, npm 10.9.3, better-sqlite3 13.0.3; không thêm dependency. Chỉ FakeAdapter, dữ liệu synthetic trong thư mục tạm; không gọi AI thật, không tạo `var/` khi test.

## Mapping yêu cầu → code → test
| Yêu cầu / nguồn | Code | Kiểm chứng (SQLite thật, không mock DB) |
|---|---|---|
| P1-1 migrations có version, không sửa bản đã áp dụng (QUALITY_AND_DATA) | `migrations/0001_core.sql`, `src/infrastructure/sqlite/database.ts` | p1-persistence: áp một lần/reopen; checksum sai bị từ chối; `beforeMigrate` gọi trước migration mới |
| JSON bất biến có version/checksum; media checksum + containment (06 §5.B.1) | `src/infrastructure/files/{json-store,media-store,paths}.ts` | p1-persistence: ghi lại khác nội dung bị chặn; sửa file → IntegrityError; `../`, đường dẫn thoát store bị chặn; trigger chặn UPDATE index |
| Pinning item/rubric (04 §4.B.1), R-05 | `learning-repository.ts` `createAttempt`; `src/domain/learning/pinning.ts`; `job-queue.ts` enqueue/complete | p1-persistence: rubric v2 không đổi attempt, trigger chặn sửa pin; rule-engine: PIN_MISMATCH / PINNED_DEPENDENCY_REVOKED |
| Bài nộp gốc/bản sửa bất biến, một nguồn bằng chứng (02 §2.B–C), R-01 | `learning-repository.ts` `submit`; bảng `submissions`, `evidence_sources` | p1-persistence: revision 0/1/2 cùng source, repair index chỉ tăng khi nộp sửa, UPDATE/DELETE bị chặn, request key chống gửi đôi |
| Assistance/exposure idempotent; exposure dùng chung Builder/Học (06 §4), R-06 | `recordAssistance`, `recordExposure`, `exposures()` | p1-persistence: key lặp ghi một lần; exposure từ builder dry-run vẫn được tính |
| Tách learner khỏi dry-run (06 §4.3) | trigger scope trong migration; `servableItem`; `observations(…, scope)` | p1-persistence: learner không nhận draft, dry-run được; trigger chặn evidence source sai scope; rule-engine: dry-run → `not_learner_evidence` |
| Lifecycle + revocation, không cấp phát nội dung bị thu hồi (06 §5.B.5) | `knowledge-repository.ts`, `src/domain/knowledge/{release-state,revocation}.ts` | p1-persistence: kích hoạt cần đúng hash; revoke package → suspended, ngừng cấp ngay, không kích hoạt lại, lịch sử release giữ nguyên |
| P1-2 tín hiệu 2 tầng, bảo vệ hai chiều (04 §2.C, 01 §5.2) | `src/domain/evidence/signal.ts` | rule-engine; p1-queue: AI đề xuất not_met trên tín hiệu kém → lưu inconclusive |
| Hỗ trợ/tiếp xúc/tính mới, 3 mức kết quả (01 §1, 02 §2.C, 05 §6.B) | `src/domain/evidence/attribution.ts`, `src/domain/knowledge/novelty.ts` | rule-engine: repair = scaffolded, affected/unknown/reduced load, thời điểm hỗ trợ, guided, exposed/needs_review |
| Giới hạn suy luận, đếm theo nguồn, không tự đặt ngưỡng (02 §2.C.1, 02 §3, D-02) | `src/domain/evidence/inference.ts` | rule-engine: 5 observation/3 nguồn đếm đúng; không policy → POLICY_NOT_APPROVED; quá hạn chỉ đổi trạng thái kiểm chứng |
| Eligibility lọc trước xếp hạng, 5 điều kiện fallback (02 §5.A, 04 §5.B), R-02 | `src/domain/scheduling/eligibility.ts` | rule-engine: mọi lý do loại, bài đã lộ không làm 7A nhưng vẫn dùng luyện tập; domain không import I/O |
| P1-3 submit một transaction (P0 boundary 1) | `src/application/learning/submit-for-assessment.ts`, `src/application/ports.ts` | p1-queue: gửi đôi → 1 submission/1 job; job lỗi contract → rollback toàn bộ |
| Retry không cộng trùng bằng chứng; tái đánh giá không thêm nguồn (04 §4, 06 §5.B.4) | `job-queue.ts` `complete` + `job_results` PK + UNIQUE(ai_run_id, observation_key) | p1-queue: NETWORK → success chỉ 1 result/2 observation; commit lặp → ALREADY_COMMITTED; re-evaluation supersedes, vẫn 1 nguồn |
| Kết quả muộn/stale/cancel không commit (06A §6.B, 10.B ca 7) | `job-queue.ts` fence check; `src/worker/worker.ts` | p1-queue: lease hết + thế hệ mới → STALE_GENERATION; lease hết trước recovery → LEASE_EXPIRED; cancel giữa chừng → ABANDONED, 0 observation; timeout cắt provider và retry |
| Restart phục hồi lease (06 §5.B.3, 06A ca 8) | `recoverExpired`, `claim` | p1-queue: đóng DB giữa run, mở tiến trình mới → STALE + COMPLETED, executions 2 |
| Budget 3 lần, sửa format 1, workflow 2 vòng, không reset (01 §4, 04 §5.A, 06A §6.B) | `src/domain/jobs/budget.ts`, trigger `ai_jobs_monotonic`, `workflows_monotonic`, CHECK `execution_index` | p1-queue: dừng ở 3, DB chặn reset/quay lại; malformed×2 → NEEDS_REVIEW sau 1 format_repair; vòng 3 bị từ chối; quota chờ không reset budget |
| Một AI job tại một thời điểm, không giữ transaction khi chờ AI (06 §5.B.3) | `claim` kiểm job đang chạy; worker gọi provider ngoài mọi transaction (better-sqlite3 đồng bộ) | p1-queue: claim thứ hai trả null |
| Thu hồi giữa lookup và commit (QUALITY_AND_DATA ca 5) | `complete` gọi `checkPinned` với revocation hiện hành | p1-queue: revoke rubric khi đang chạy → DEPENDENCY_REVOKED, NEEDS_REVIEW, 0 observation |
| P1-4 backup online DB + JSON + media; restore riêng, kiểm trước khi dùng (06 §5.B.6), R-08 | `src/infrastructure/backup/backup.ts` | p1-backup: backup khi store mở, ghi đồng thời trong lúc backup, restore đủ bảng/file; media hỏng → từ chối, không để lại thư mục; file live thiếu/sửa → không có backup; target không rỗng bị từ chối; promote giữ bản cũ |

## Kết quả lệnh
- `npm.cmd run check`: lint, typecheck, 107 tests/11 file (63 cũ + 44 mới), build backend/web đạt.
- `npm.cmd run spike`: 6 tests/2 file đạt.

## Giới hạn
- Chưa có HTTP API ghi, session/CSRF; chưa có entrypoint worker chạy thường trực (chỉ `processNextJob`/`runWorkerLoop` được test). Provider trong run luôn `fake`.
- Chưa lưu hồ sơ năng lực/trạng thái 6 mức: cần policy D-02. Rule Engine chưa có bước xếp hạng, chống trì hoãn, mức sẵn sàng sau Bước 5/6 (cần chính sách).
- Fencing chứng minh trong một máy với SQLite WAL; không thử nhiều tiến trình ghi đồng thời thật (chỉ đóng/mở lại DB giữa chừng).
- Backup chưa có CLI/lịch tự động; promote phải chạy khi app dừng. Chưa có retention (D-07).
- 6 đầu ra tri thức, QC1–4, adapter thật, isolation vẫn thuộc P2 (D-01, D-03, D-04).
