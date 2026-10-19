# Kiểm thử, bảo vệ dữ liệu và định nghĩa hoàn thành

## Kiểm tra theo loại thay đổi
- Tài liệu: kiểm tra link local, thuật ngữ, trạng thái và mâu thuẫn; không cần bịa test ứng dụng.
- Rule/state: unit tests cho hành vi có căn cứ, gồm đạt/chưa đạt/chưa kết luận và biên hỗ trợ/tiếp xúc.
- SQLite/queue: integration tests bằng DB thật, transaction, constraints, cạnh tranh claim, crash recovery và kết quả muộn.
- Adapter: contract fixtures cho envelope/JSON lỗi/refusal/quota/auth; test tiến trình con cho EOF/timeout/cancel; smoke thật tách riêng sau subscriptionGuard.
- UI/workflow: E2E cho hành vi quan trọng; kiểm tra cả HTTP payload và backend authorization, không chỉ nhìn giao diện.
- AI/ngữ nghĩa: đối chứng có căn cứ, dev/holdout riêng. PASS schema không đồng nghĩa chấm đúng; báo phạm vi đo và điểm chưa đủ chứng cứ.

## Các bộ ca bắt buộc trước sử dụng thật
Giữ nguyên 6 ca ở 04 §6.C, 6 tình huống ở 06 §6.A.4 và 12 ca ở 06A §10.B; có thể gộp test trùng hành vi nhưng phải mapping đầy đủ nguồn. Bổ sung các ca cụ thể sau theo rủi ro triển khai:
1. Một attempt tạo nhiều observations hợp lệ nhưng chỉ một nguồn độc lập; retry/cache/tái đánh giá không cộng thêm nguồn.
2. Mở đáp án Builder rồi giao 7A cùng họ bài; nội dung được chặn hoặc giới hạn đúng mục tiêu đo.
3. CLI thử đọc file ngoài scope qua đường dẫn tuyệt đối, `..`, symlink/junction và cấu hình/plugin kế thừa; không chỉ thử cwd sạch.
4. stdin đóng nhưng tiến trình còn sống, sinh tiến trình con hoặc xuất output quá lớn; supervisor kết thúc đúng run và fencing chặn commit.
5. Publish sau sửa JSON/media/QC-policy; hash/version khác phải QC lại. Thu hồi giữa lookup và commit vẫn không cấp phát/công nhận sai.
6. Backup khi có ghi DB/media; manifest đầy đủ, checksum đúng, foreign keys hợp lệ khi restore.
7. Prompt injection trong bài nộp/nguồn/AI result không thay quyền, lệnh shell, trạng thái hay chính sách.
8. Request từ origin lạ, path traversal, upload quá lớn, HTML/script trong bài làm; chặn ở server và render an toàn.

## Bảo vệ local và dữ liệu
- Mặc định bind loopback; kiểm tra Host/Origin, session local và CSRF cho thao tác thay đổi. Single-user không có nghĩa mọi website khác được gọi backend.
- Validate đầu vào, giới hạn payload/output/media, không nối nội dung người học thành shell command; executable và argv do adapter xác định.
- Log kỹ thuật ưu tiên ID, hash, trạng thái, thời gian và phiên bản; không log secret, bài làm hoặc audio nguyên bản mặc định. Context đầy đủ nếu cần audit phải lưu riêng với quyền và chính sách retention minh bạch.
- Không để credential trong SQLite, web payload, repository, sandbox nội dung hay backup học tập. Không in biến môi trường/credential để chứng minh đã lọc.
- Đầu ra model không được trực tiếp ghi SQL, chạy code, đổi lịch, phát hành gói hoặc gửi thông báo ra ngoài.
- Không xóa bài gốc hoặc lịch sử để sửa kết quả. Migrations áp dụng rồi không sửa tại chỗ; backup trước migration có nguy cơ mất dữ liệu và có kế hoạch phục hồi.
- Backup dùng SQLite Online Backup API; lấy inventory các JSON/media được DB snapshot tham chiếu, giữ tài nguyên không bị xóa trong quá trình chụp và kiểm checksum. Backup không hoàn chỉnh không được báo thành công.
- Restore vào nơi riêng, kiểm schema/checksum/liên kết rồi mới chuyển sử dụng. Không thay database đang chạy bằng bản chưa kiểm tra.

## Định nghĩa DONE
Hành vi đúng nguồn và phạm vi; code có vị trí đúng module; tests liên quan đã chạy với bằng chứng; không còn lỗi nghiêm trọng trong phạm vi; docs/decisions/progress cập nhật; giới hạn và điểm phụ thuộc chưa hoàn thành được công bố. Nếu môi trường chặn kiểm thử, ghi BLOCKED/PARTIAL thay vì PASS. Không đòi chạy lại mọi test cho sửa tài liệu đơn giản, nhưng thay rule/queue/security phải chạy hồi quy liên quan.
