# PHẦN 2: HỒ SƠ NĂNG LỰC, CÂY KỸ NĂNG, SỔ LỖI & LOGIC ĐIỀU PHỐI LỘ TRÌNH

> **Trạng thái:** ĐÃ CHỐT (v1.0)
> **Nguyên tắc cốt lõi:** *"Một quan sát có thể hỗ trợ nhiều nhận định, nhưng mỗi nhận định phải có phạm vi rõ ràng và không được mạnh hơn bằng chứng thực tế."*

---

## 1. Danh mục Kỹ năng và Quan hệ Liên kết (Many-to-Many Skill Graph)

Hệ thống không ép các kỹ năng vào một cây phân cấp cha–con cứng nhắc (nơi mỗi kỹ năng con chỉ thuộc về một nhánh duy nhất), mà tổ chức thành **hai nhóm năng lực có quan hệ liên kết nhiều–nhiều** (trên giao diện vẫn có thể hiển thị dạng cây/nhóm trực quan cho người học):

### A. Hai Nhóm Năng lực Cốt lõi
1. **Nhóm Kỹ năng Thực hiện Nhiệm vụ (Task Execution Skills):**
   - Gắn với yêu cầu xử lý bài thi cụ thể của từng phân hệ IELTS.
   - *Ví dụ Writing:* Trả lời đầy đủ các vế của đề bài; Duy trì lập trường xuyên suốt; Viết Overview khái quát xu hướng chính; Chọn lọc và đối chiếu số liệu nổi bật; Phát triển đoạn văn theo chuỗi luận điểm – giải thích – ví dụ; Liên kết mạch lạc giữa các đoạn.
   - *Ví dụ Speaking:* Mở rộng câu trả lời trực tiếp; Tổ chức bài nói dài 2 phút (Part 2); Lập luận trừu tượng đa chiều (Part 3); Duy trì độ trôi chảy & tự sửa lỗi tự nhiên; Kiểm soát phát âm (theo dõi nhóm cha và tách các thành phần như âm cuối, trọng âm từ, ngữ điệu, nối âm khi có bằng chứng âm thanh phù hợp).
   - *Ví dụ Reading & Listening:* Định vị thông tin qua Paraphrase; Phân biệt thông tin trái ngược (False/No) và thông tin không được nêu (Not Given); Xác định ý chính của đoạn (Matching Headings); Bắt tín hiệu đổi ý/tự sửa thông tin trong hội thoại (Distractor Tracking).
2. **Nhóm Năng lực Ngôn ngữ Dùng chung (Shared Linguistic Competencies):**
   - Các đơn vị kiến thức ngôn ngữ phục vụ cho nhiều nhiệm vụ ở cả 4 kỹ năng.
   - *Ví dụ:* Chia thì theo ngữ cảnh thời gian; Sự hòa hợp chủ ngữ – động từ; Cấu trúc so sánh & xu hướng; Câu điều kiện & giả định; Mệnh đề quan hệ; Hệ thống mạo từ & danh từ đếm được/không đếm được; Từ vựng học thuật & Collocations theo chủ đề; Ngôn ngữ thận trọng (Hedging); Xử lý nhận diện âm thanh/nối âm.
3. **Quan hệ Liên kết (Skill Relationships — 5 Loại Cạnh Đồ Thị):**
   - Xác định rõ mối quan hệ giữa các kỹ năng thông qua 5 loại cạnh: (1) `Thành phần của`, (2) `Hỗ trợ cho`, (3) `Tiên quyết (chỉ khi có căn cứ thực chất)`, (4) `Có thể chuyển giao giữa các ngữ cảnh`, và (5) `Thường dễ nhầm với`.
   - Không biến mọi liên kết thành điều kiện tiên quyết cứng (người học chưa được xác nhận một kỹ năng nhỏ không mặc nhiên bị chặn mọi nhiệm vụ lớn liên quan).
   - Tách biệt rõ mã định danh năng lực người học (`competency_id`) khỏi mã định danh quy trình của AI (`agent_skill_id`).

### B. Quy tắc Quyết định Độ mịn (Granularity Rule)
- Mốc 25–30 kỹ năng chỉ là phạm vi khởi đầu, không phải giới hạn cứng.
- **Điều kiện tách kỹ năng:** Nếu hai biểu hiện cần **bài luyện khắc phục khác nhau** hoặc có thể **đạt/chưa đạt độc lập với nhau** (ví dụ: *“Trả lời đủ các vế của đề”* và *“Giữ lập trường xuyên suốt”*; hoặc *“Hòa hợp chủ ngữ – động từ”* và *“Lựa chọn thì”*; hoặc *“Thiếu động từ chính”*, *“Run-on”* và *“Comma splice”*), hệ thống tách thành các đơn vị chẩn đoán riêng.
- **Điều kiện gộp/giữ nhóm cha:** Nếu chưa thể thiết kế nhiệm vụ đánh giá riêng đáng tin cậy hoặc chưa đủ bằng chứng phân tách, giữ ở cấp nhóm cha để tránh tạo ra các trạng thái năng lực ảo.
- **Lưu ý về gắn nhãn nhiệm vụ:** Một nhiệm vụ được gắn nhãn kỹ năng không đồng nghĩa nhiệm vụ đó đã đo được mọi nhãn gắn kèm (ví dụ: bài viết có xuất hiện một câu điều kiện chưa chắc đã cung cấp đủ bằng chứng để kết luận về năng lực sử dụng câu điều kiện).

---

## 2. Đặc tả Kỹ năng, Kho Bằng chứng Thực hiện và Điều kiện Đánh giá

### A. Đặc tả Kỹ năng & Hợp đồng Bằng chứng (Skill Specification & ECD Contract)
Mỗi kỹ năng (`competency_id`) được định nghĩa theo **Hợp đồng bằng chứng 5 thành phần** dùng làm đầu vào thống nhất cho AI sinh bài, AI kiểm duyệt và AI đánh giá:
1. **Nhận định mục tiêu:** Muốn kết luận người học làm được điều gì.
2. **Bằng chứng cần có:** Biểu hiện quan sát được nào hỗ trợ hoặc chống lại kết luận (kèm các ngoại lệ hợp lệ).
3. **Điều kiện tạo bằng chứng (Minimum Valid Task Scope):** Nhiệm vụ phải có đặc điểm và độ rộng tối thiểu nào để biểu hiện xuất hiện.
4. **Yếu tố gây nhiễu:** Đoán đúng, học thuộc, hỗ trợ trực tiếp/gián tiếp, chủ đề quá quen hoặc tín hiệu kém ảnh hưởng thế nào.
5. **Giới hạn suy luận:** Dù làm đúng nhiệm vụ này, vẫn chưa được kết luận điều gì (tách rõ *Kết quả bài làm $\neq$ Năng lực vi kỹ năng $\neq$ Điểm IELTS ước lượng*).

### B. Kho Bằng chứng Thực hiện & Nhật ký Tiếp xúc Họ Bài (Performance Evidence & Exposure Store)
Thay vì chỉ lưu các lỗi sai, hệ thống xây dựng một **Kho Bằng chứng Thực hiện** lưu trữ cả kết quả làm tốt và chưa tốt làm nền tảng chung cho **Hồ sơ năng lực** và **Sổ lỗi**. Mỗi bản ghi bằng chứng tách bạch 3 lớp thông tin (*Kết quả câu hỏi/bài làm*, *Giá trị chẩn đoán*, và *Chất lượng phép đo*) gồm:
- **Kết quả bài làm / câu hỏi (Item/Task Result):** Đáp án đúng/sai hoặc mức độ đáp ứng trong bài làm hiện tại.
- **Nhận định & Giá trị chẩn đoán (Diagnostic Value):** `Đạt ở lần quan sát này` | `Chưa đạt` | `Chưa đủ khả năng kết luận` đối với từng kỹ năng.
- **Chất lượng phép đo (Measurement Quality):** Độ tin cậy của dữ liệu thu thập theo từng nhận định (chất lượng audio, độ chính xác ASR, tính rõ ràng của đề/đáp án chuẩn). Nếu chất lượng phép đo ở một đoạn không đảm bảo, tự động giới hạn nhận định phụ thuộc đoạn đó về `Chưa đủ khả năng kết luận`.
- **Bài làm gốc, Bản chụp Trước/Sau hỗ trợ & Liên kết các lượt sửa:**
  - Lưu trạng thái bài làm trước và sau thời điểm mở hỗ trợ (*Pre/Post-Assistance Snapshots*).
  - Các lượt tự sửa ở Bước 5 được **liên kết trực tiếp vào cùng nguồn bài làm gốc**, ghi nhận là bằng chứng tự sửa chứ không tách thành lần kiểm chứng độc lập mới.
- **Nhật ký tiếp xúc nhiệm vụ & Tài nguyên chung (Exposure Log):** Ghi nhận riêng việc người học đã nhìn thấy *Đề*, *Một phần gợi ý*, *Đáp án*, *Lời giải* hay *Bài mẫu/Biến thể gần* đối với từng `item_id`, họ bài (`item_family_id`) và tài nguyên dùng chung (`shared_stimulus_id`) để xác định tính mới khi chọn bài kiểm chứng.
- **Kỹ năng liên quan, Cơ hội sử dụng & Hỗ trợ đã dùng:** Ghi nhận các kỹ năng được quan sát, thực tế bài làm có tạo cơ hội sử dụng hay không, thời điểm dùng và chi tiết nội dung hỗ trợ của AI.
- **Vai trò của bài:** `Bài học` | `Bài luyện` | `Kiểm tra ngắn (7A)` | `Kiểm tra trong bài tổng hợp (7B)` | `Kiểm tra duy trì (Bước 9)`.
- **Ngữ cảnh & Điều kiện làm bài:** Thời điểm, phương thức (Viết/Nói/Đọc/Nghe), chế độ làm bài, áp lực thời gian, độ khó/độ quen thuộc của chủ đề, và phiên bản tiêu chí đánh giá.

### C. Quy tắc Quy kết Bằng chứng & Phạm vi Ảnh hưởng của Gợi ý
1. **Một nguồn bằng chứng – Nhiều nhận định (Single Source, Multiple Observations):**
   - Một đoạn bài làm có thể tạo ra nhiều nhận định cho các kỹ năng khác nhau (ví dụ: chọn cặp số liệu đúng $\rightarrow$ nhận định *Đạt* ở lần quan sát này cho kỹ năng *Chọn số liệu*; nhưng viết `"more higher than"` $\rightarrow$ nhận định *Chưa đạt* cho *Cấu trúc so sánh*).
   - Tuy nhiên, các nhận định này **cùng dựa trên một nguồn bằng chứng** (một lần thực hiện), tuyệt đối không đếm thành nhiều lần kiểm chứng độc lập để tăng độ tin cậy quá nhanh.
   - **Điều kiện đánh giá kỹ năng nhiệm vụ:** Chỉ kết luận về kỹ năng nhiệm vụ khi phần thể hiện quan sát được đủ rõ để đánh giá. Nếu lỗi diễn đạt ngôn ngữ nặng khiến không xác định được người học thực hiện nhiệm vụ đúng hay sai $\rightarrow$ ghi nhận **`Chưa đủ bằng chứng`**.
   - **Phân biệt cấp độ:** *“Đạt ở lần quan sát này”* (ví dụ: chọn đúng 1 cặp số liệu) chưa đồng nghĩa với việc *“Kỹ năng đã đạt một trạng thái năng lực vững chắc”*.
2. **Đánh giá Phạm vi Ảnh hưởng của Gợi ý theo Nội dung Thực tế:**
   - Không đánh giá cứng theo tên công cụ mà dựa trên **nội dung hỗ trợ thực tế** (ví dụ: AI gợi ý vài ý bằng tiếng Việt khác hẳn với việc AI đưa dàn ý tiếng Anh kèm câu mẫu khiến người học chép lại từ vựng/cấu trúc).
   - Ba mức ảnh hưởng đối với từng kỹ năng đang xét:

| Mức ảnh hưởng của hỗ trợ | Cách sử dụng bằng chứng cho kỹ năng đang xét |
| :--- | :--- |
| **1. Có ảnh hưởng (Trực tiếp hoặc gián tiếp)** | Không dùng để xác nhận vận dụng độc lập đối với kỹ năng bị ảnh hưởng |
| **2. Không phát hiện ảnh hưởng liên quan** | Có thể dùng làm bằng chứng nếu đáp ứng đầy đủ các điều kiện đánh giá khác |
| **3. Chưa rõ mức ảnh hưởng** | Lưu lại bằng chứng trong kho nhưng gắn cờ cần kiểm chứng thêm |

   - **Ghi nhận điều kiện giảm tải nhiệm vụ (Reduced Cognitive Load):** Khi người học làm đúng ngữ pháp trong bài đã được AI cung cấp sẵn ý tưởng/dàn ý, hệ thống ghi nhận họ *tự tạo câu đúng trong điều kiện giảm tải*, chưa suy ra họ kiểm soát ngữ pháp tương đương khi phải tự gánh toàn bộ bài làm từ đầu.

---

## 3. Hồ sơ Năng lực 4 Thành phần và Quy tắc Chuyển Trạng thái

Mỗi kỹ năng trong Hồ sơ năng lực không bị gộp vào một chuỗi đơn tuyến duy nhất, mà được biểu diễn bởi **4 thành phần tách biệt**:

| Thành phần | Nội dung lưu trữ |
| :--- | :--- |
| **1. Trạng thái năng lực** | 1. `Chưa đủ dữ liệu`<br>2. `Cần hỗ trợ`<br>3. `Tự sửa được khi có gợi ý`<br>4. `Đã vận dụng bước đầu trong nhiệm vụ ngắn`<br>5. `Vận dụng được trong bài tổng hợp`<br>6. `Duy trì ổn định` |
| **2. Độ tin cậy (Confidence)** | Mức độ mạnh và đa dạng của các nguồn bằng chứng hiện có (không tăng ảo chỉ nhờ số lượng câu lặp lại giống nhau). |
| **3. Trạng thái kiểm chứng** | `Chưa đến hạn` \| `Đến hạn kiểm tra` \| `Chờ cơ hội quan sát` \| `Cần kiểm tra lại` |
| **4. Phạm vi đã chứng minh** | Ghi nhận đa chiều: **Các điều kiện đã có bằng chứng đạt** và **Các điều kiện cần thêm kiểm chứng / lần gần nhất chưa đạt** (theo Phương thức Viết/Nói, Loại nhiệm vụ, Độ khó/Độ quen thuộc chủ đề, Điều kiện thời gian, Mức giảm tải). |

*Ví dụ hiển thị minh bạch:*
> **Tổ chức đoạn văn:** *Vận dụng được trong bài tổng hợp (Độ tin cậy: Trung bình).*
> - **Các điều kiện đã có bằng chứng đạt:** Bài tổng hợp khi không giới hạn thời gian (Tự luyện).
> - **Trong điều kiện thi thử (Áp lực thời gian):** Cần thêm kiểm chứng; lần gần nhất chưa đạt.
> - **Trạng thái kiểm chứng:** Đến hạn kiểm tra duy trì.

### Các Quy tắc Chuyển Trạng thái Bắt buộc
1. **Không bắt đi tuần tự qua mọi trạng thái:** Nếu người học làm tốt ngay từ đầu với bằng chứng độc lập đủ điều kiện, hệ thống ghi nhận ngay ở mức tương ứng.
2. **Không hạ năng lực chỉ vì lâu chưa kiểm tra:** Khi quá hạn chưa kiểm tra, chỉ chuyển `Trạng thái kiểm chứng` sang `Đến hạn / Cần kiểm tra lại`; chưa có bằng chứng rằng năng lực của người học đã suy giảm.
3. **Không lấy lịch sử dùng gợi ý lúc học để chặn trần năng lực:** Dùng gợi ý trong chế độ *Học có hướng dẫn* là hành vi học tập bình thường. Chỉ những lần thực hiện không nhận hỗ trợ làm lộ cách giải/nội dung cần tự tạo mới dùng để xác nhận vận dụng độc lập; lịch sử dùng gợi ý chỉ giúp chọn cách hỗ trợ và nhiệm vụ kiểm chứng phù hợp.
4. **Không suy diễn đơn tuyến giữa các điều kiện làm bài:** Đạt trong *Tự luyện* không tự động suy ra đạt trong *Thi thử*; ngược lại, một lần làm sai trong *Thi thử* chưa đủ để kết luận ngay là lỗi chỉ do áp lực thời gian (cần xét cả độ khó của đề, chủ đề lạ hoặc yếu tố khác).
5. **“Đã xem lời giải” là sự kiện học tập:** Được lưu trong lịch sử tương tác, không tính là một cấp trạng thái năng lực.

---

## 4. Sổ Lỗi, Đa Giả thuyết Chẩn đoán và Vòng đời Khắc phục

Sổ lỗi đứng trên **Kho Bằng chứng Thực hiện**, tập trung liên kết tới các bằng chứng `Chưa đạt` và tổ chức theo các mẫu điểm yếu (Diagnostic Patterns):

### A. Quản lý Đa Giả thuyết Nguyên nhân (Multi-Hypothesis Tracking)
Một biểu hiện lỗi trong bài làm có thể xuất phát từ nhiều nguyên nhân cùng tồn tại (ví dụ: vừa nắm quy tắc chưa đầy đủ, vừa bị cuống khi thiếu thời gian). Hệ thống không ép chọn một nguyên nhân duy nhất quá sớm mà theo dõi các giả thuyết với 4 trạng thái:
- `Giả định ban đầu`
- `Chưa đủ bằng chứng`
- `Đã xác nhận` (khi có bằng chứng thực nghiệm đủ mạnh ủng hộ)
- `Bị bác bỏ`

*(Lưu ý: Câu trả lời tự giải thích của người học ở Bước 3 hoặc dữ liệu thời gian chỉ là bằng chứng hỗ trợ chẩn đoán, không mặc nhiên đẩy giả thuyết lên thẳng “Đã xác nhận” nếu chưa đủ chắc chắn).*

### B. Phân tách Nhánh Xử lý Nhanh và 4 Nhóm Nhu cầu của Bước 6
1. **Nhánh xử lý nhanh (Fast-track):** Dành cho trường hợp ghi nhận *“Có thể là sơ suất”* $\rightarrow$ Nhắc nhẹ để người học tự sửa và tiếp tục theo dõi.
2. **Bốn nhóm nhu cầu chuẩn của Bước 6:**
   - **Nhóm 1:** Chưa hiểu kiến thức nền $\rightarrow$ Bài học ngắn, ví dụ và câu hỏi kiểm tra hiểu.
   - **Nhóm 2:** Hiểu nhưng áp dụng chưa ổn định $\rightarrow$ Bài luyện tập trung, giảm dần gợi ý.
   - **Nhóm 3:** Làm được riêng lẻ nhưng chưa vận dụng tốt trong bài tổng hợp $\rightarrow$ Bài vận dụng trong ngữ cảnh hoặc điều kiện thời gian phù hợp.
   - **Nhóm 4:** Đã làm tốt $\rightarrow$ Chuyển sang nội dung khó hơn hoặc lên lịch ôn duy trì.

### C. Quy tắc Phân biệt "Sơ suất" và "Kiểm soát chưa ổn định"
- Tự sửa đúng ngay sau khi được chỉ ra ở Bước 5 **chưa đủ để kết luận chắc chắn là lỗi sơ suất** (vì người học có thể biết quy tắc nhưng chưa tự kiểm soát ổn định, hoặc gợi ý khoanh vùng đã gần như lộ đáp án). Hệ thống ghi nhận thận trọng là **`Có thể là sơ suất / Cần kiểm tra thêm`**.
- Khi lỗi **tái diễn qua các cơ hội phù hợp**, hệ thống giảm khả năng đây chỉ là sơ suất đơn lẻ và tăng mức ưu tiên kiểm tra các giả thuyết *“Kiểm soát chưa ổn định”* hoặc *“Hiểu quy tắc chưa đầy đủ”*.
- Trước khi chốt hướng khắc phục dài hạn, hệ thống sử dụng bằng chứng sẵn có (so sánh kết quả bài ngắn không gợi ý với bài tổng hợp) hoặc giao một **nhiệm vụ ngắn có khả năng phân biệt nguyên nhân**.
- Tương tự, **một lần không tự sửa được đơn lẻ** ở bài sau chưa đủ để kết luận ngay là kỹ năng đã `Tái phát (Relapsed)`.

---

## 5. Điều phối Nhiệm vụ 2 Bước, Loại Ràng buộc và Lịch Duy trì

### A. Quy trình Điều phối 2 Bước (Two-Stage Adaptive Dispatcher)
Thay vì dùng một hàng đợi cố định (luôn bắt khép vòng cũ rồi mới làm việc khác khiến kiểm tra duy trì bị trì hoãn vô thời hạn), hệ thống điều phối qua 2 bước:
1. **Bước 1 — Lọc các nhiệm vụ đủ điều kiện (Eligibility Filtering):**
   - Phù hợp với kỹ năng của buổi học và quỹ thời gian thực tế.
   - Đúng **mức sẵn sàng** của người học:
     - Dừng ở Bước 5/6 của buổi trước chưa chắc đã sẵn sàng làm ngay 7A.
     - Nếu trước đó chưa đạt 7A, cần xem lại chẩn đoán hoặc đổi cách hỗ trợ chứ không mặc định ép kiểm tra lại 7A ngay đầu buổi.
   - Độ rộng nhiệm vụ phải khớp với kỹ năng cần đo (không gò ép mọi bài 7A vào khung 5–10 phút nếu kỹ năng đòi hỏi viết/xử lý phạm vi lớn hơn; một đoạn thân bài chỉ đo được phát triển đoạn, không đo được liên kết toàn bài).
   - Nhiệm vụ đã vượt qua **Cổng kiểm duyệt chất lượng (Quality Gate)**.
2. **Bước 2 — Lựa chọn theo Trọng số Động & Cơ chế Chống Trì Hoãn:**
   - Chấm điểm ưu tiên dựa trên công thức 4 chiều của Phần 1 (*Ảnh hưởng chất lượng bài + Tần suất/Phạm vi + Liên quan mục tiêu + Độ chắc chắn chẩn đoán*) kết hợp với **Thời hạn kiểm chứng** và **Thời gian đã chờ**.
   - **Cơ chế chống trì hoãn (Anti-Starvation):** Khi một nhiệm vụ kiểm chứng (7A, 7B hoặc Bước 9) đã bị lùi quá ngưỡng thời gian/số buổi quy định, hệ thống chủ động dành chỗ ưu tiên cho nó trong buổi học phù hợp tiếp theo; hoặc giao sớm bài ôn riêng nếu đã đến hạn mà chưa có bài tổng hợp phù hợp.

### B. Phân biệt Cơ hội Dự kiến vs. Quan sát Thực tế & Hai Loại Ràng buộc Nhiệm vụ
1. **Cơ hội thiết kế vs. Quan sát thực tế:**
   - Nhiều bài liên tiếp không xuất hiện một cấu trúc **chưa chứng minh người học né tránh** (có thể đề không thực sự cần cấu trúc đó hoặc người học chọn cách diễn đạt khác vẫn hoàn toàn hợp lệ).
   - Phải phân biệt giữa *bài làm có vẻ tạo cơ hội (Intended Opportunity)* với *bài làm thực tế thu được quan sát có giá trị (Valuable Observed Opportunity)*.
2. **Hai loại ràng buộc khi giao nhiệm vụ kiểm chứng mục tiêu:**
   Khi cần tăng khả năng thu được quan sát có giá trị (ví dụ: ở 7A hoặc bài ôn Bước 9), hệ thống phân biệt rõ 2 mức ràng buộc vì chúng chứng minh hai năng lực khác nhau:

| Loại ràng buộc trong đề bài | Ví dụ minh họa | Giá trị bằng chứng thu được |
| :--- | :--- | :--- |
| **1. Ràng buộc tình huống hoặc ý nghĩa (Situational / Semantic Constraint)** | Đưa ra tình huống giả định trái với hiện tại hoặc yêu cầu đối chiếu 2 xu hướng ngược chiều (không nhắc tên cấu trúc ngữ pháp). | Kiểm tra được cả **khả năng tự nhận biết khi nào cần chọn cấu trúc/kỹ năng** lẫn **khả năng thực hiện đúng**. |
| **2. Chỉ định cấu trúc (Explicit Form Specification)** | Yêu cầu rõ: *"Hãy viết lại câu / trả lời sử dụng Câu điều kiện loại 2"*. | Chỉ xác nhận **khả năng tạo câu đúng khi đã được chỉ định sẵn** (vì đề bài đã làm thay phần quyết định chọn cấu trúc). |

   - Ngay cả khi đã dùng nhiệm vụ có ràng buộc, mục tiêu là **“tăng khả năng thu được quan sát có giá trị”**; nếu bài làm thực tế vẫn không cung cấp đủ bằng chứng rõ ràng, hệ thống vẫn cho phép ghi nhận kết quả là **`Chưa kết luận được`**.

### C. Theo dõi Ngày học, Đề xuất Điều chỉnh Lịch & Dùng Chung Nhật Ký Tiếp Xúc (Đồng bộ từ Phần 6 & 06A)
1. **Dùng chung Nhật ký tiếp xúc (`Shared Exposure Log`) giữa chế độ Builder và Học tập:** Khi người học đồng thời là người xây dựng/QC mở xem đề, gợi ý, đáp án, lời giải hoặc bài mẫu trong `Builder & QC Console`, hệ thống ghi nhận ngay vào cùng `Exposure Log` để không chọn nhầm bài đã lộ đáp án làm bài kiểm chứng độc lập (7A/7B/Bước 9).
2. **Trạng thái theo dõi hằng ngày & Đề xuất lịch bù có phiên bản (`Versioned Replanning Proposal`):**
   - Ghi nhận trung thực trạng thái ngày học (bao gồm cả `Nghỉ có kế hoạch`, `Thiếu dữ liệu quan sát`, `Offline`); không lấy thời gian học ít hay nghỉ học để tự động hạ trạng thái năng lực và không cộng dồn "nợ số phút".
   - Khi chia nhỏ nhiệm vụ cho buổi học ngắn, chỉ gắn vai trò kiểm chứng `7A` nếu nhiệm vụ vẫn giữ đủ phạm vi đo tối thiểu; nếu không đủ thời gian cho phạm vi đo thì giao làm bài luyện và giữ lịch kiểm chứng cho buổi đủ thời gian.
   - Mọi đề xuất điều chỉnh lịch (`replan_proposal`) phải gắn với phiên bản lịch gốc (`base_plan_version`) và chỉ áp dụng sau khi người học xác nhận.

---

## 6. Quy tắc Đồng bộ Hai Chiều với Phần 1

Để giữ cho Phần 1 gọn gàng ở tầm nguyên tắc luồng sư phạm và Phần 2 đóng vai trò đặc tả mô hình dữ liệu & điều phối:
- **Bổ sung ngắn vào Phần 1 (`01_Mo_Hinh_Va_Luong_Hoc_Tap.md`):**
  1. Nguyên tắc bảo toàn phạm vi bằng chứng: Một quan sát có thể hỗ trợ nhiều nhận định nhưng không nhận định nào được mạnh hơn bằng chứng thực tế; cho phép kết quả `Chưa đủ bằng chứng`.
  2. Nguyên tắc đánh giá phạm vi hỗ trợ theo nội dung gợi ý thực tế & điều kiện giảm tải nhiệm vụ.
  3. Làm mềm nhận định ở nhánh lỗi sơ suất (*"Có thể là sơ suất / Cần kiểm tra thêm"*) và kết luận tái phát.
  4. Phân biệt *Ràng buộc tình huống/ý nghĩa* và *Chỉ định cấu trúc* tại Cổng kiểm duyệt nhiệm vụ kiểm tra (7A/7B/Bước 9).
- **Lưu trữ tại Phần 2 (`02_Ho_So_Nang_Luc_Va_Dieu_Phoi.md`):** Toàn bộ mô hình đồ thị kỹ năng nhiều–nhiều, Kho bằng chứng thực hiện, 4 thành phần Hồ sơ năng lực, cơ chế đa giả thuyết Sổ lỗi, Bộ điều phối 2 bước, Nhật ký tiếp xúc dùng chung và Đề xuất điều chỉnh lịch có phiên bản.
