# Quy định bám đặc tả và chống suy diễn khi code

## Phân loại căn cứ
| Loại | Cách sử dụng |
|---|---|
| ĐÃ CHỐT | Yêu cầu trong 01–06A hoặc thay đổi được người dùng chấp thuận rõ ràng |
| QUYẾT ĐỊNH TRIỂN KHAI | Cụ thể hóa kỹ thuật trong phạm vi được ủy quyền; ghi lý do, tác động, kiểm chứng |
| ĐỀ XUẤT / CHƯA XÁC MINH | Không trình bày là yêu cầu đã chốt; không dùng để bật hành vi rủi ro |
| ĐÃ TRIỂN KHAI | Có code ở đường dẫn cụ thể; chưa đồng nghĩa đã kiểm thử |
| ĐÃ KIỂM CHỨNG | Có lệnh/ca kiểm tra, kết quả, phiên bản và phạm vi kiểm chứng |

01 quy định vòng học; 02 quy định hồ sơ và điều phối; 03 quy định từng kỹ năng; 04 quy định hợp đồng AI; 05 quy định tri thức/QC; 06 và 06A quy định vận hành local/CLI. Tài liệu mới hơn không tự động thắng tài liệu cũ. Nếu mâu thuẫn có ý nghĩa nghiệp vụ, ghi vào DECISIONS và dừng nhánh phụ thuộc; không chọn âm thầm một phía.

## Chuỗi truy vết bắt buộc
Mỗi hạng mục có: `requirement_id → file + mục nguồn → quyết định liên quan → module/file code → test/cách nghiệm thu → kết quả`.
Kế hoạch có bảng mapping khởi đầu. Khi code xuất hiện, bổ sung đường dẫn thật vào bảng; không đổi trạng thái hoàn thành chỉ vì đã tạo tên file.

## Những điều AI không được tự bịa
- API, cờ CLI, cấu trúc response, quyền lợi thuê bao, quota, reset time, khả năng audio, chất lượng chấm và quyền sử dụng nội dung.
- Mã năng lực chính thức, Band descriptor, ngưỡng nâng/hạ năng lực, hệ số ưu tiên, số ngày ôn hoặc ngưỡng chống trì hoãn chưa được định nghĩa/kiểm định.
- Kết quả kiểm thử, benchmark, độ bao phủ, số liệu hiệu năng hay trạng thái READY.
- Dữ liệu mẫu chỉ được gắn nhãn fixture/synthetic, tách khỏi dữ liệu người học. Mẫu tự sinh không trở thành chuẩn hiệu chuẩn điểm.
- Khi chưa rõ, dùng trạng thái chưa đủ bằng chứng/needs verification hoặc ghi điểm mở. Không trả thành công giả để đi tiếp.

## Quy trình thay đổi
1. Ghi vấn đề, nguồn đang áp dụng và tác động tới dữ liệu, hành vi, kiểm thử.
2. Lựa chọn kỹ thuật có thể đảo ngược: ghi quyết định triển khai và tiếp tục trong phạm vi đã được ủy quyền.
3. Thay đổi nghiệp vụ, chi phí, bên nhận dữ liệu hoặc làm mất lịch sử: cần chỉ dẫn người dùng tương ứng; chuẩn bị phương án cụ thể trước khi hỏi nếu chưa được ủy quyền.
4. Đồng bộ tài liệu nguồn, quyết định, schema/policy version, code, test và tiến độ. Không sửa test chỉ để hợp thức hóa code sai đặc tả.

## Phân biệt hai loại AI
AGENTS.md quản lý AI lập trình. Prompt/skill của gia sư trong ứng dụng là tài sản riêng, có phiên bản, hợp đồng và QC. Không nạp AGENTS.md của repository vào context học IELTS; không để bài làm hay tài liệu thu thập ra lệnh thay đổi code/chính sách.

Không có file quy định nào bảo đảm loại bỏ hoàn toàn hallucination. Cơ chế kiểm soát thực tế là truy vết, validation, cô lập quyền và test hành vi có căn cứ.
