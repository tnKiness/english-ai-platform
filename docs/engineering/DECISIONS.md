# Quyết định và điểm còn mở

Ngày lập: 19/10/2026. Các quy định engineering là bổ sung triển khai theo ủy quyền của người dùng; không được diễn đạt thành quyết định nghiệp vụ đã chốt trước đó.

## Quyết định triển khai khởi đầu
- E-01: Giữ modular monolith và thứ tự dữ liệu → Builder/QC → vòng học → chịu lỗi → mở rộng theo 06 §6. Không thêm dịch vụ cloud, vector DB hoặc API trả phí.
- E-02: Cấu trúc và stack dự kiến ở PROJECT_STRUCTURE; phiên bản và SQLite driver chờ P0 kiểm chứng. Có thể điều chỉnh kỹ thuật có căn cứ mà không đổi nghiệp vụ.
- E-03: Adapter giả lập dùng để phát triển đường lỗi; adapter thật mặc định chưa sẵn sàng. Chưa đủ ba provider không chặn code lõi; không tuyên bố đã hoàn thành nghiệm thu đa provider.
- E-04: Các thay đổi làm rõ EOF, sandbox, idempotency trong 06/06A là sửa mô tả kỹ thuật để giữ đúng mục tiêu bảo vệ đã chốt; không giảm yêu cầu.
- E-05 (19/10/2026, áp dụng kỹ thuật P0): triển khai stack E-02 với Node 22.18.0/npm 10.9.3, TypeScript/React/Vite/Fastify/Ajv/Vitest và better-sqlite3 13.0.3; phiên bản exact trong package.json và lockfile. Chọn driver sau khi spike native Windows, transaction và online backup/restore đạt. Playwright hoãn tới luồng UI thực tế; chưa có worker/database vận hành. ERD, schema và state v1 ở P0_DATA_AND_STATE; bằng chứng ở P0_ACCEPTANCE. Không thay đổi các ngưỡng sư phạm.
- E-06 (19/10/2026, theo yêu cầu người dùng, công cụ lập trình): thêm relay `scripts/relay` để một nhiệm vụ code chạy lần lượt qua Claude Code → Codex → Antigravity (Gemini) và tự chuyển nền tảng khi hết quota/rate limit/mất đăng nhập/quá thời gian. Đây là tooling cho AI lập trình, **không** phải AI Gateway của ứng dụng (P2) và không đóng D-01. Chỉ dùng đăng nhập thuê bao: gỡ biến API key/base URL khỏi tiến trình con, preflight chặn Claude nếu không phải `claude.ai`, chặn Codex nếu không phải ChatGPT; agy chưa có lệnh báo loại gói nên ghi CHƯA XÁC MINH. Không dùng cờ bỏ qua sandbox/quyền; Codex `workspace-write`, Claude `acceptEdits` + allowlist lệnh, agy `--sandbox --mode accept-edits`. Lỗi không phải quota thì dừng, không chuyển tiếp. Mỗi lúc một relay (lock). Có thể đảo ngược.

## Điểm mở và điều kiện đóng
| ID | Nội dung | Chặn ở đâu | Bằng chứng cần để đóng |
|---|---|---|---|
| D-01 | CLI thật, entitlement, billing và isolation chưa thử | Bật từng adapter thật ở P2/P4 | Phiên bản + argv/launch path + auth mode không chứa secret + quyền lợi + tình trạng extra usage + test chặn file ngoài scope + timeout/cancel + output contract |
| D-02 | Ngưỡng tin cậy, nâng/hạ trạng thái, lịch ôn và trọng số chưa định lượng | Bật chính sách tự động tương ứng | Bảng policy có nguồn, phiên bản, ca đạt/chưa đạt/chưa kết luận; tham số đề xuất cần đánh giá trước khi gọi là chuẩn |
| D-03 | ĐÃ CÓ schema/state logic P0; còn migrations và 6 đầu ra tri thức đầy đủ | Hoàn tất P1/P2 | Persistence/constraints/recovery thật; source registry, playbook, QC/coverage/release manifests |
| D-04 | ĐÃ ĐẠT spike Windows runner/SQLite; chưa có adapter entrypoint/isolation và backup phối hợp | Tích hợp thật / nghiệm thu P1 | Xử lý shim .cmd/.ps1 bằng entrypoint đã xác minh, quyền file thực và backup DB + JSON + media |
| D-05 | Chưa có gói nội dung, quyền sử dụng và đối chứng | Phát hành gói học / báo Band | Nguồn được phép dùng, QC1–4 đúng hash, coverage manifest, bộ đối chứng riêng; thiếu phần nào chặn phần đó |
| D-06 | Chưa chọn ASR/TTS và kiểm chứng audio | Phát âm sâu / sinh Listening thật | Năng lực đo được trên audio gốc, công cụ/phiên bản/tài nguyên; thiếu audio path giữ chưa đủ kết luận |
| D-07 | Chính sách giữ log/context/media, hạn mức ổ đĩa | Dùng dữ liệu cá nhân dài hạn | Cấu hình retention minh bạch, xử lý đầy ổ, export/backup/restore; không xóa lịch sử tự động khi chưa có chính sách |

Người thực hiện hạng mục chịu trách nhiệm thu bằng chứng; AI không tự đóng điểm mở bằng lời khẳng định. Điểm cần quyết định nghiệp vụ đưa cho chủ dự án, phần kỹ thuật xử lý trong quyền đã được giao.

## Mẫu quyết định mới
ID / ngày / trạng thái (đề xuất, áp dụng kỹ thuật, người dùng chốt, thay thế); vấn đề; nguồn; lựa chọn; lý do; tác động; cách kiểm chứng; file đồng bộ; quyết định bị thay thế. Giữ lịch sử, không xóa quyết định cũ.
