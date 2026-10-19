# Rà soát mức sẵn sàng triển khai — 19/10/2026

## Kết luận
**Đủ cơ sở bắt đầu code nền tảng P0/P1 có điều kiện. Chưa đủ cơ sở bật toàn bộ AI thật hoặc tuyên bố sản phẩm sẵn sàng dùng.** Đã đọc 8 file 00–06A; chưa có source code để review hay test ứng dụng. Không phát hiện mâu thuẫn cốt lõi cần thiết kế lại vòng học. Những thiếu hụt triển khai cần được đóng theo cổng nghiệm thu, không để AI tự suy đoán.

## Những phần đã nhất quán
- Ba mức kết quả, 7A/7B/9, hỗ trợ theo kỹ năng và phạm vi đo xuyên suốt 01–03.
- Rule Engine ngoài AI, context phân quyền, version pinning, re-evaluation và không đếm trùng ở 04.
- Nguồn tri thức, QC1–4, quyền sử dụng và thu hồi hai chiều ở 05 đã được nối sang 06/06A.
- JSON bất biến lưu nội dung; SQLite lưu vận hành/vòng đời; media riêng, queue bền vững. Không có xung đột thực chất giữa “JSON nguồn chuẩn” và SQLite khi đọc đầy đủ phần đồng bộ.
- Gợi mở sinh sẵn ở Bước 4 có thể cùng tồn tại với quyền nấc Bước 5 nếu backend giữ kín các nấc chưa mở; không truyền nguyên gói xuống browser hay lượt AI chỉ được xem nấc hiện tại.

## Phát hiện và hướng xử lý
| ID | Mức ảnh hưởng | Phát hiện | Xử lý |
|---|---|---|---|
| F-01 | Chặn bật adapter thật | 06A §5/ca 11 đang mô tả thư mục sạch như ranh giới chặn đọc file; cwd không tạo quyền OS | Làm rõ tại nguồn: cần giới hạn quyền thực tế, test đường dẫn ngoài scope; chưa chứng minh thì không READY |
| F-02 | Chặn nghiệm thu runner | 06A §5 nói EOF đảm bảo thoát ngay; CLI có thể tiếp tục chờ/background | Làm rõ timeout bên ngoài, cancel cây tiến trình và fencing; EOF chỉ là một biện pháp |
| F-03 | Chặn schema hoàn chỉnh | 06 §5 liệt kê UNIQUE attempt_id/fencing dễ bị hiểu thành UNIQUE riêng ở mọi bảng | Làm rõ khóa theo thực thể; một attempt có nhiều runs/observations, còn commit kết quả cần điều kiện generation hợp lệ |
| F-04 | Chặn adapter tương ứng | Tài liệu mô tả entitlement/CLI nhưng chưa có chứng cứ tài khoản và môi trường thật | D-01; không chạy thử khi billing chưa xác minh, không suy số quota |
| F-05 | Chặn các rule tự động liên quan | Chưa định lượng chính sách chuyển trạng thái/confidence/lịch ôn | D-02; không tự chế một ngưỡng chung rồi coi đã chốt |
| F-06 | Chặn từng milestone | Chưa có schema cụ thể, state table, driver backup, bộ QC/đối chứng | D-03–D-06; đưa vào P0–P3 với đầu ra đo được |
| F-07 | Tài liệu | Link file:/// trỏ workspace cũ; nhãn v1.0 trong 01 không phản ánh changelog v1.3 | Sửa link tương đối; làm rõ nhãn tài liệu 01, không tự nâng phiên bản nghiệp vụ khác |
| F-08 | Vận hành | Chưa quy định local API protection, retention, giới hạn output/ổ đĩa | Bổ sung QUALITY_AND_DATA; D-07 còn mở cho cấu hình cụ thể |

## Phạm vi đối chiếu bên ngoài
Đã mở tài liệu chính thức ngày 19/10/2026:
- [Codex non-interactive](https://learn.chatgpt.com/docs/non-interactive-mode), [authentication](https://learn.chatgpt.com/docs/auth). `codex exec --help` trên máy xác nhận đọc stdin và có JSONL/output-schema. Chỉ xác nhận giao diện, chưa chứng minh billing hay isolation.
- [Claude headless](https://code.claude.com/docs/en/headless): mô tả `-p`, cấu hình tự nạp, `--bare` không dùng subscription login, và khả năng tiếp tục chờ background sau EOF. Do đó giữ cấm `--bare` của 06A và bổ sung supervisor timeout. Tài liệu web không chứng minh mọi hành vi có trong bản local 2.1.288.
- [Gemini headless](https://geminicli.com/docs/cli/headless/): đã mở tham chiếu headless; chưa kiểm chứng CLI trên máy hay quyền lợi tài khoản.

Không gọi AI thật, không kiểm tra secret/tài khoản, không xác minh toàn bộ nguồn IELTS và quyền sao chép trong lượt rà soát kiến trúc này. Các nguồn đó phải được kiểm tra trong pipeline xây gói trước sử dụng. Ngày “đối chiếu” trong 06A không thay thế biên bản kiểm thử cho từng phiên bản CLI.

## Bàn giao
Đọc AGENTS.md ở root, theo kế hoạch IMPLEMENTATION_PLAN và ghi PROGRESS sau từng lượt. Bốn file người dùng yêu cầu đã có; bổ sung review, kế hoạch, quyết định và chất lượng/dữ liệu để việc triển khai có căn cứ và có cổng nghiệm thu.
