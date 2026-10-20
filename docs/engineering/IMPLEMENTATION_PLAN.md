# Kế hoạch code theo cổng nghiệm thu

Ngày lập: 19/10/2026. Đây là kế hoạch, không phải báo cáo đã triển khai. Không đặt thời hạn giả khi chưa chạy P0. Phạm vi sản phẩm đầy đủ vẫn theo 01–06A; lát cắt đầu tiên không thay thế toàn bộ bốn kỹ năng.

## P0 — Hợp đồng và bootstrap
**Đầu vào:** bộ đặc tả đã rà soát. **Phụ thuộc:** không có code hiện hữu.
1. Kiểm tra runtime Windows, chọn và khóa dependency/SQLite driver; tạo README, gitignore, cấu trúc tối thiểu, lệnh lint/typecheck/test/build. Chuẩn bị quản lý phiên bản Git; chưa tự push remote.
2. Lập ERD, JSON Schemas và bảng chuyển trạng thái: attempt/submission/revision; assistance/exposure; observations/provenance; package/release/QC; job/run/lease/generation; profile; proposal.
3. Phân biệt `job execution attempt`, `learner attempt`, `repair attempt`, `hint level`; xác định khóa duy nhất đúng phạm vi và transaction boundaries.
4. Mô tả quyền dữ liệu theo vai trò/pha và hợp đồng 6 phương thức adapter. Làm fake adapter với các lỗi xác định, không gọi model thật.
5. Spike Windows runner và backup API; lập inventory ba CLI và capability quan sát được. Thiếu provider giữ điểm mở, không chặn các phần độc lập.
**Đạt khi:** skeleton build được, contract fixtures hợp lệ/sai bị phân biệt, có sơ đồ trạng thái/recovery và kết quả spike; tham số sư phạm chưa chốt vẫn đánh dấu chưa xác minh.

## P1 — Dữ liệu, quy tắc và hàng đợi bền vững
**Phụ thuộc:** hợp đồng P0.
1. Migrations, kho JSON versioned/checksum, media references, snapshots và evidence provenance; tách learner khỏi dry-run.
2. Rule Engine thuần: eligibility, chất lượng tín hiệu, hỗ trợ/tiếp xúc/tính mới, giới hạn suy luận, pinning và revocation. Chưa có policy đủ căn cứ thì trả chưa đủ kết luận.
3. Queue SQLite một worker/AI job tại một thời điểm: lease, recovery, retry budgets, fencing, cancel; không giữ transaction khi chờ AI. Job tối đa 3 lần thực thi; sửa format tối đa 1 trong trần đó; sửa/sinh lại nhiệm vụ tối đa 2 vòng ở cấp workflow, không reset budget để lách trần.
4. Backup online + inventory JSON/media nhất quán; restore ở vị trí riêng rồi kiểm tra trước thay dữ liệu đang dùng.
**Đạt khi:** integration tests với SQLite thật chứng minh retry không cộng trùng, kết quả muộn/cancel không commit, restart phục hồi, dữ liệu lịch sử và backup restore đúng.

## P2 — Builder/QC tối thiểu và gateway
**Phụ thuộc:** P1; D-01/D-04 phải đóng cho adapter được bật.
1. Hoàn thiện 6 đầu ra Phần 5: Source Registry, Knowledge Schemas, Ingestion Playbook, QC Specification, Test & Coverage Manifest, Release Manifest.
2. Pipeline staging 6 bước + QC1–4; tách blind solve/verification; publish đúng hash, suspend/retire và propagation/cache invalidation.
3. Console 3 tab: Gói tri thức, Cần xử lý, Lần chạy; metadata mặc định, mở nội dung ghi exposure chung; dry-run không chạm hồ sơ thật.
4. Gateway subscriptionGuard, profile isolation, allowlist môi trường, quyền hãng nhận dữ liệu, redaction, envelope parser. Chọn một provider đã xác minh để chạy trước; còn lại disabled/needs verification.
**Đạt khi:** một gói nhỏ được QC/phát hành/thu hồi có truy vết; sửa sau QC bị chặn publish; các chốt billing/isolation thực sự chặn thực thi khi thiếu căn cứ. Fake-only demo chưa hoàn tất P2.

## P3 — Lát cắt học hoàn chỉnh
**Phụ thuộc:** P2 và gói nội dung đúng quyền sử dụng.
1. Mục tiêu ban đầu, Học hôm nay, Workspace, Tiến độ, Cài đặt; ba chế độ làm bài và autosave có báo lỗi thật.
2. Một vòng Writing: bài nộp gốc → chẩn đoán → tự sửa → bổ sung kiến thức → 7A mới → cập nhật có điều kiện; xếp 7B/9 và kiểm tra bằng đồng hồ giả, không giả đã tích lũy bằng chứng thật.
3. Sinh sẵn gợi mở ở đánh giá chỉ lưu server; cấp từng nấc theo quyền. Bản sửa mới mới kích hoạt chấm sửa. Gói sinh sẵn không được vượt kiểm duyệt tiết lộ.
4. Gói Reading có giải mù độc lập, đáp án cạnh tranh và Not Given; ca audio thu/phát, ASR và bản sửa tách biệt, giới hạn nhận định khi thiếu audio trực tiếp.
**Đạt khi:** E2E lưu/tiếp tục đúng trạng thái, chuyển 7A không lộ lời giải kể cả HTTP payload; kết luận không mạnh hơn bằng chứng. Chưa có bộ đối chứng đủ điều kiện thì chưa bật Band.

## P4 — Chịu lỗi và đa nhà cung cấp
**Phụ thuộc:** P3.
- Hoàn tất các bộ ca 04 §6.C, 06 §6.A.4 và toàn bộ 12 ca 06A §10.B.
- Nối hai adapter còn lại chỉ sau kiểm chứng riêng; test failover bằng fixture quota, không đốt hạn mức thật.
- Dùng bộ đối chứng chung có nguồn và quyền để đánh giá chất lượng chấm/gợi mở trước khi bật provider dự phòng.
- Kiểm tra khiếu nại, tái đánh giá, thu hồi cả nhận định đạt/chưa đạt và hồ sơ liên quan; giữ nguyên nguồn bằng chứng độc lập.
**Đạt khi:** các ca bắt buộc pass có log và phiên bản; provider chưa đủ chứng cứ vẫn bị tắt và được báo là phần chưa hoàn thành.

## P5 — Mở rộng và vận hành
**Phụ thuộc:** nền đã qua P4; từng gói mới có QC riêng.
- Mở rộng Writing Task 1/GT, Speaking/Listening và các dạng Reading còn lại theo 03, không sửa lõi tùy tiện.
- FTS/BM25 theo quyền, cache đầy đủ khóa và revocation; tối ưu sau khi đo.
- Daily tracking UTC/Asia/Bangkok, nghỉ/thiếu telemetry/offline; replan có xác nhận đúng version, outbox chống gửi trùng; kênh Telegram/email là tùy chọn ngoài MVP đầu.
- Hoàn thiện export/retention, giới hạn tài nguyên, tài liệu cài/chạy/phục hồi và trải nghiệm sử dụng thật.
**Đạt khi:** gói mở rộng đáp ứng 8 câu nghiệm thu Phần 5; lịch không gây nợ phút hoặc tự hạ năng lực; restore thực nghiệm thành công.

## Mapping yêu cầu → phần triển khai → nghiệm thu
Các đường dẫn module dưới đây là đích dự kiến; bổ sung file/test thật khi code. Chi tiết P1: [P1_ACCEPTANCE](P1_ACCEPTANCE.md).
| ID | Nguồn | Module dự kiến | Điều kiện quan sát | Code/test thật (đến P1) |
|---|---|---|---|---|
| R-01 | 01 §1–5; 02 §2–3 | domain/evidence, competencies | Xem lời giải/tự sửa không thành độc lập; một nguồn không tăng tin cậy lặp | P1: `src/domain/evidence/*`; tests/unit/rule-engine, p1-queue (re-evaluation). Hồ sơ năng lực chờ D-02 |
| R-02 | 02 §5; 06A §9 | domain/scheduling | Lọc trước xếp hạng; nghỉ học không hạ năng lực; proposal cũ không commit | P1 phần lọc: `src/domain/scheduling/eligibility.ts`, `markOverdue`; xếp hạng/proposal chưa làm |
| R-03 | 03 §1–3 | domain/learning; application/workflows | Phạm vi Writing, audio/ASR, NG, nấc hỗ trợ đúng giới hạn | P1 nền: `src/domain/learning/*`, `signal.ts`; luồng kỹ năng là P3 |
| R-04 | 04 §2; 05 §6 | application/context | Blind context, payload UI, cache không lộ đáp án/mục tiêu ẩn | P0 `blind-context.ts`; P1 manifest assessor không chứa đáp án (p1-queue) |
| R-05 | 04 §4–5; 06 §5 | infrastructure/sqlite; application/jobs | Idempotency, fencing, retry budgets, pinning và tái đánh giá | P1: `src/infrastructure/sqlite/job-queue.ts`, `src/worker/worker.ts`, `src/domain/jobs/budget.ts`; tests/integration/p1-queue |
| R-06 | 05 §5,7–8; 06 §3–4 | application/qc; infrastructure/files | QC đúng hash, revocation, exposure dùng chung, dry-run riêng | P1: `src/infrastructure/files/*`, `knowledge-repository.ts`, revocation/novelty; p1-persistence. QC là P2 |
| R-07 | 06A §3–8 | infrastructure/ai; worker | Subscription-only, isolation, timeout, 12 ca lỗi bắt buộc | P1: worker timeout/cancel/fencing với FakeAdapter (ca 2, 6, 7, 8 ở mức fake); adapter thật P2 |
| R-08 | 06 §2,5 | web; infrastructure/backup | Autosave/reload, backup DB+JSON+media và restore | P1: `src/infrastructure/backup/backup.ts`; tests/integration/p1-backup. Autosave UI là P3 |

## Quy tắc nhận việc
Mỗi lượt chọn một hạng mục đủ nhỏ để nghiệm thu, ghi mã P/R trong PROGRESS. Không coi làm xong giao diện là xong nghiệp vụ. Không bỏ cổng lỗi để chạy demo; không cần chờ toàn sản phẩm hoàn chỉnh mới kiểm thử lát cắt.
