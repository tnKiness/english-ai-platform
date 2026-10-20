# LỘ TRÌNH BRAINSTORM & CHỐT KIẾN TRÚC TOÀN DIỆN (MASTER BLUEPRINT CHECKLIST)

> **Mục tiêu của tài liệu:** Quản lý toàn bộ các hạng mục cần thảo luận, tối ưu và chốt từng phần trước khi viết code cho nền tảng học IELTS với AI Gia sư.
>
> **NGUYÊN TẮC ĐỒNG BỘ HAI CHIỀU (TWO-WAY RETROACTIVE OPTIMIZATION RULE):**
> 1. **Chiều xuôi (Forward Alignment):** Mọi phần chốt sau bắt buộc phải bám sát, phục vụ và cụ thể hóa những nguyên tắc đã chốt ở các phần trước (không được mâu thuẫn với luồng 9 bước, 3 mức ghi nhận kết quả, hay cổng kiểm duyệt ở Phần 1).
> 2. **Chiều ngược (Backward Optimization):** Trong quá trình brainstorm phần sau, nếu phát hiện bất kỳ kẽ hở, điểm thiếu sót hoặc cơ hội tối ưu nào cho phần đã chốt trước đó, chúng ta sẽ:
>    - Nêu rõ trong mục **[Đề xuất Tối ưu Ngược cho Phần trước]**.
>    - Thảo luận chốt phương án và cập nhật đồng thời cả file phần trước lẫn phần hiện tại.

---

## DANH SÁCH CÁC PHẦN CẦN BRAINSTORM & CHỐT LẦN LƯỢT

### ✅ PHẦN 1: Mô hình Sư phạm & Luồng Học Tập Khép Kín (Closed-Loop Flow)
- **Trạng thái:** **ĐÃ CHỐT (v1.0)** — Lưu tại [01_Mo_Hinh_Va_Luong_Hoc_Tap.md](01_Mo_Hinh_Va_Luong_Hoc_Tap.md)
- **Nội dung cốt lõi:**
  - Vòng lặp 9 bước có kiểm chứng.
  - 3 mức ghi nhận kết quả (*Đã xem lời giải* $\neq$ *Tự sửa có gợi ý* $\neq$ *Tự vận dụng độc lập*).
  - 3 chế độ làm bài (*Học có hướng dẫn*, *Tự luyện*, *Thi thử*) + Ghi nhận hỗ trợ theo từng vi kỹ năng.
  - Công thức ưu tiên lỗi động 4 chiều & Cơ chế tự sửa linh hoạt + Câu kiểm tra hiểu.
  - Phân tách 7A (Nhiệm vụ ngắn) và 7B (Bài tổng hợp) + Điều kiện "Cơ hội sử dụng" ở Bước 9.
  - Cổng kiểm duyệt nhiệm vụ do AI sinh (Quality Gate) phân biệt rõ vai trò *Bài dạy / Bài luyện / Bài kiểm tra*.

---

### ✅ PHẦN 2: Kiến trúc Hồ sơ Năng lực, Hệ thống Phân loại Kỹ năng & Sổ Lỗi (Learner Profile, Skill Taxonomy & Error Bank)
- **Trạng thái:** **ĐÃ CHỐT (v1.0)** — Lưu tại [02_Ho_So_Nang_Luc_Va_Dieu_Phoi.md](02_Ho_So_Nang_Luc_Va_Dieu_Phoi.md)
- **Nội dung cốt lõi:**
  1. **Danh mục kỹ năng & Quan hệ nhiều–nhiều:** Tách *Nhóm kỹ năng thực hiện nhiệm vụ* và *Nhóm năng lực ngôn ngữ dùng chung*; độ mịn dựa trên khả năng chẩn đoán và kiểm chứng.
  2. **Đặc tả kỹ năng & Kho bằng chứng thực hiện:** Lưu cả Đạt / Chưa đạt / Chưa đủ kết luận; 1 nguồn bằng chứng có thể sinh nhiều nhận định nhưng không đếm lặp độ tin cậy; xét 3 mức ảnh hưởng của gợi ý thực tế và điều kiện giảm tải nhiệm vụ.
  3. **Hồ sơ năng lực 4 thành phần:** Tách biệt *Trạng thái năng lực (6 mức)*, *Độ tin cậy*, *Trạng thái kiểm chứng*, và *Phạm vi đã chứng minh* (các điều kiện đã đạt vs cần kiểm chứng thêm).
  4. **Sổ lỗi & Đa giả thuyết chẩn đoán:** Theo dõi nhiều giả thuyết song song; tách nhánh xử lý nhanh (có thể là sơ suất) khỏi 4 nhóm nhu cầu Bước 6.
  5. **Bộ điều phối 2 bước & Phân loại ràng buộc:** Lọc nhiệm vụ hợp lệ $\rightarrow$ Chọn theo trọng số động + Chống trì hoãn; phân biệt *Ràng buộc tình huống/ý nghĩa* với *Chỉ định cấu trúc*.

---

### ✅ PHẦN 3: Chi tiết Thiết kế Từng Phân hệ Luyện tập theo Đặc thù 4 Kỹ năng IELTS (Feature Modules per IELTS Skill)
- **Trạng thái:** **ĐÃ CHỐT (v1.0)** — Lưu tại [03_Thiet_Ke_Chi_Tiet_4_Ky_Nang.md](03_Thiet_Ke_Chi_Tiet_4_Ky_Nang.md)
- **Nội dung cốt lõi:**
  1. **Phân hệ Writing (Academic & GT Task 1, Task 2):** 4 gói hỗ trợ giao diện nhưng xét ảnh hưởng theo nội dung thực tế & lưu bản chụp trước/sau khi mở hỗ trợ; sửa cấp câu & cấp đoạn linh hoạt (không ép PEEL hay độ dài cứng); xử lý thận trọng dấu hiệu khuôn mẫu học thuộc; dàn ý ở 7A chỉ chứng minh dự kiến tổ chức.
  2. **Phân hệ Speaking (Part 1, 2, 3):** Audio gốc là nguồn đối chiếu chuẩn, giữ riêng bản ASR và bản người học sửa; không phạt kép âm cuối vào cả phát âm và ngữ pháp (dùng bằng chứng đối chiếu và 2 quan sát ngắn để phân giải); cho phép ghi chú từ khóa ở Part 2; nói lại cùng câu hỏi chỉ tính là bằng chứng tự sửa.
  3. **Phân hệ Reading & Listening:** Tách *Kết quả câu hỏi*, *Giá trị chẩn đoán* và *Chất lượng phép đo*; 4 chặng xử lý là 4 nhóm giả thuyết đa chiều; bằng chứng Bước 5 phù hợp từng dạng Reading (đặc biệt với `Not Given` và `Matching Headings`, cho phép giải thích tiếng Việt); 4 nấc hỗ trợ Listening ghi nhận đúng phạm vi năng lực; Cổng kiểm duyệt giải mù trước khi đối chiếu.

---

### ✅ PHẦN 4: Kiến trúc Điều phối AI theo Vai trò, Skills và Nguồn Tri thức Có thể Mở rộng
- **Trạng thái:** **ĐÃ CHỐT (v1.0)** — Lưu tại [04_Kien_Truc_Dieu_Phoi_AI_Va_Skills.md](04_Kien_Truc_Dieu_Phoi_AI_Va_Skills.md)
- **Nội dung cốt lõi:**
  1. **Phân tách khái niệm & dịch vụ nền:** Tách rõ `Skill`, `Data/Knowledge` (4 loại: *Tri thức chuẩn, Nội dung học, Dữ liệu người học, Dữ liệu tạm của phiên*), `Agent`, `Workflow`, `Rule & State Engine`, `Tool` và 5 dịch vụ nền không phải AI.
  2. **Hợp đồng thực thi & Cô lập ngữ cảnh:** Cấp ngữ cảnh cô lập ở tầng hệ thống; kiểm tra điều kiện tín hiệu 2 tầng (trước khi gọi & sau phân tích) theo từng nhận định; tách *Trạng thái xử lý* khỏi *Kết quả đánh giá*; quản lý trạng thái Bước 5 tách rời *Lượt thử sửa* và *Nấc hỗ trợ* kèm kiểm soát chống rò rỉ đáp án.
  3. **6 nhóm chức năng AI khởi đầu & Quản lý phiên bản:** Cho phép tách nhiều skills nhỏ bên trong 6 nhóm; phân loại cập nhật phiên bản theo tác động thực tế (hỗ trợ *Tái đánh giá* không ghi đè lịch sử và không đếm trùng bằng chứng); khóa phiên bản khi đang làm bài (*Version Pinning*) và chống ghi nhận trùng (*Idempotency*).
  4. **Thoát an toàn & Đo lường:** Fallback về Ngân hàng chuẩn phải thỏa mãn 5 điều kiện tương thích (gồm cả tính mới); bảo toàn nhận định theo quan hệ phụ thuộc; kiểm thử 6 tình huống chịu lỗi theo lộ trình 4 giai đoạn.

---

### ✅ PHẦN 5: Hệ thống Cơ sở Tri thức Chuẩn hóa, Pipeline Thu thập & Cổng QC Tri thức
- **Trạng thái:** **ĐÃ CHỐT (v1.0)** — Lưu tại [05_He_Thong_Co_So_Tri_Thuc_Chuan_Hoa.md](05_He_Thong_Co_So_Tri_Thuc_Chuan_Hoa.md)
- **Nội dung cốt lõi:**
  1. **Mô hình 1 người xây dựng & 4 giới hạn nghiệp vụ:** Tách *Kết quả bài làm $\neq$ Năng lực vi kỹ năng $\neq$ Điểm IELTS ước lượng*; không bắt buộc chuyên gia duyệt tay; quản lý chặt quyền sử dụng nguồn cho cả nội bộ và hiển thị.
  2. **Kiến trúc Lớp quản trị chung + 2 Nhóm nền + 6 Khối:** Tách `competency_id` khỏi `agent_skill_id`; hợp đồng bằng chứng ECD 5 thành phần; Rubric 3 lớp không tự chế luật đếm cơ học; tách Mẫu neo / Bộ phát triển / Bộ kiểm thử giữ kín; Thẻ chẩn đoán 7 thành phần có sức phân biệt; quản lý họ bài (`item_family_id`) & 5 mức tiếp xúc.
  3. **Pipeline thu thập 6 bước & Cổng QC 4 tầng (QC1–QC4):** Bắt đầu từ *Phiếu yêu cầu xây gói*; JSON là nguồn chuẩn duy nhất; kiểm tra 3 tầng định lượng, Bảng yêu cầu bao phủ, trung thực nguồn, tuân thủ Phần 1–4 và chạy thử nghiệm trên 3 loại ca mẫu; cung cấp 6 đầu ra thực thi chuẩn.
  4. **Giám sát sau phát hành (D2) & Giảm tải vận hành:** 5 kết quả xử lý khiếu nại; bảo vệ 2 chiều (cả tăng và giảm năng lực); thu hồi xuyên phụ thuộc kể cả cache; 3 lối ra cho bài cách ly (tự sửa, loại bỏ luôn, hoặc đưa vào danh sách ưu tiên).

---

### ✅ PHẦN 6 & PHỤ LỤC 06A: Trải nghiệm Người dùng (UX/UI), Kiến trúc Kỹ thuật Modular Monolith & Thực thi AI bằng Thuê bao CLI
- **Trạng thái:** **ĐÃ CHỐT (v1.0)** — Lưu tại:
  - [06_UX_UI_Va_Kien_Truc_Ky_Thuat.md](06_UX_UI_Va_Kien_Truc_Ky_Thuat.md)
  - [06A_AI_Thue_Bao_Toi_Uu_Ngu_Canh_Va_Daily_Tracking.md](06A_AI_Thue_Bao_Toi_Uu_Ngu_Canh_Va_Daily_Tracking.md)
- **Nội dung cốt lõi:**
  1. **Ứng dụng cá nhân, 2 chế độ trên 1 hồ sơ:** Thanh điều hướng 3 mục (`Học hôm nay` · `Tiến độ` · `Builder & QC`, mục tiêu & AI trong `Cài đặt`); Workspace linh hoạt ưu tiên diện tích làm bài, có ranh giới rõ cho bài kiểm chứng `7A`.
  2. **Chống nhiễu chéo Builder – Learner:** Dùng chung `Exposure Log` khi mở xem đề/đáp án trong Console; mặc định ẩn nội dung chi tiết khi xem QC; cô lập dữ liệu chạy thử (Dry-run).
  3. **Modular Monolith bền vững:** Tầng ứng dụng điều khiển `Workflow` và `Rule Engine`; phân định rõ nguồn chuẩn giữa **File JSON bất biến** (nội dung gói tri thức) và **SQLite** (trạng thái vòng đời, phiên học, bằng chứng, hàng đợi bền vững, khóa chống trùng, thu hồi xuyên phụ thuộc) + **Kho file tài nguyên**; sao lưu đồng bộ qua SQLite Online Backup API.
  4. **Thực thi AI qua CLI Thuê bao & Chặn phát sinh phí (06A):** Gọi `codex`, `claude-code`, `agy` (thay gemini-cli theo E-11) qua `aiExecutionGateway` và `subscriptionGuard` (`billing_policy: "subscription_only"`, chạy trong thư mục Sandbox sạch, đóng `stdin/EOF` chống treo ngầm, tắt tool lập trình thừa); tự động chuyển hãng khi hết hạn mức (`QUOTA_EXHAUSTED`); gộp sinh sẵn gợi mở Bước 5 từ lần gọi Bước 4 để tiết kiệm quota; theo dõi học hằng ngày và đề xuất lịch bù có phiên bản.

## BỘ TÀI LIỆU TRIỂN KHAI — 19/10/2026
- [AGENTS.md](../AGENTS.md): hướng dẫn AI đọc trước khi code.
- [PROGRESS.md](../PROGRESS.md): tiến độ và trạng thái code thực tế.
- [Rà soát mức sẵn sàng](engineering/READINESS_REVIEW.md).
- [Kế hoạch code](engineering/IMPLEMENTATION_PLAN.md).
- [Quy định cấu trúc](engineering/PROJECT_STRUCTURE.md).
- [Quy định bám đặc tả](engineering/SPEC_COMPLIANCE.md).
- [Quyết định và điểm mở](engineering/DECISIONS.md).
- [Kiểm thử và bảo vệ dữ liệu](engineering/QUALITY_AND_DATA.md).

Có thể bắt đầu nền tảng; tích hợp AI thật và phát hành gói vẫn phải vượt qua các cổng nghiệm thu trong kế hoạch.
