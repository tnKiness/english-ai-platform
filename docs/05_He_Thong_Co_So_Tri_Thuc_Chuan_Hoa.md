# PHẦN 5: HỆ THỐNG CƠ SỞ TRI THỨC CHUẨN HÓA, PIPELINE THU THẬP & CỔNG QC TRI THỨC

> **Trạng thái:** ĐÃ CHỐT (v1.0)
> **Định hướng cốt lõi:** Hệ thống được thiết kế để một người có thể triển khai và vận hành với sự hỗ trợ của AI trong biên soạn và kiểm tra, lấy nguồn công khai làm căn cứ. Các lớp kiểm tra và cổng QC giúp giảm lỗi, giới hạn kết luận theo bằng chứng thực tế và hỗ trợ sửa sai có truy vết. Không bắt buộc có chuyên gia duyệt tay mới vận hành được, nhưng cũng không đánh đồng việc tự động hóa với độ chính xác tuyệt đối của chuyên gia.

---

## 1. Mục tiêu, Phạm vi và Bốn Giới hạn Nghiệp vụ Bắt buộc

### A. Ba Tầng Kết Luận Tách Biệt Xuyên Suốt Hệ Thống
Mọi đơn vị tri thức, nhiệm vụ và bộ chấm phải phân biệt rõ 3 tầng kết luận, không tự động suy diễn bắc cầu:
1. **Kết quả bài làm / câu hỏi (Task/Item Outcome):** Đáp án đúng/sai hoặc biểu hiện đạt/chưa đạt trong phạm vi nhiệm vụ vừa thực hiện (ví dụ: viết đúng một câu so sánh hoặc viết đạt một đoạn Overview trong bài đó).
2. **Năng lực vi kỹ năng (Micro-skill Competency):** Nhận định về khả năng thực hiện kỹ năng nhỏ trong các điều kiện đã chứng minh (cần tích lũy qua các nguồn bằng chứng độc lập).
3. **Điểm IELTS ước lượng (Estimated IELTS Band):** Chỉ đưa ra khi nhiệm vụ đủ độ rộng, đúng cấu trúc và đủ điều kiện ước lượng; bài tập câu lẻ hoặc đoạn ngắn chỉ trả về phản hồi kỹ năng, không quy đổi trực tiếp sang Band điểm IELTS. Với Reading/Listening, không lấy tỷ lệ đúng trên vài câu tự sinh để quy đổi thẳng sang Band (do thang điểm chính thức tính trên bài 40 câu và ngưỡng điểm thô có thể thay đổi theo đề).

### B. Bốn Giới hạn Nghiệp vụ Bắt buộc
1. **Điểm Writing/Speaking là ước lượng phục vụ học tập:** Không giới thiệu là điểm thi chính thức hay kết quả được giám khảo IELTS xác nhận.
2. **Chẩn đoán nguyên nhân là giả thuyết có bằng chứng:** Không biến một khả năng (ví dụ: *"có thể thiếu kiểm soát thì"*) thành khẳng định chắc chắn chỉ từ một lỗi đơn lẻ.
3. **Độ khó của bài tự sinh ban đầu là ước tính:** Không cần chờ hiệu chuẩn thống kê quy mô lớn mới được dùng để luyện tập, nhưng phải ghi rõ trạng thái độ khó là ước tính.
4. **Đề hoặc cách chấm còn mơ hồ thì không hạ năng lực:** Khi phát hiện đề bài hoặc bộ chấm chưa phân giải được cách hiểu hợp lệ, hệ thống giữ nguyên trạng thái năng lực hoặc chuyển sang chờ kiểm chứng, không trừ điểm/hạ cấp người học.

---

## 2. Nguồn Dữ Liệu, Phân loại Phát biểu, Thẩm quyền và Quyền Sử Dụng

### A. Ba Loại Đầu Vào Của Hệ Thống (Không gom chung thành "thu thập trên mạng")
| Loại đầu vào | Ví dụ cụ thể | Cách đưa vào hệ thống |
| :--- | :--- | :--- |
| **1. Thông tin từ nguồn ngoài** | Tiêu chí IELTS chính thức, định dạng đề, quy tắc ngôn ngữ, bảng ký hiệu ngữ âm. | Trích xuất có căn cứ, lưu vị trí nguồn, đúng phạm vi và quyền sử dụng. |
| **2. Quyết định nghiệp vụ của sản phẩm** | Điều kiện công nhận độc lập, xử lý hỗ trợ, chuyển trạng thái, giới hạn suy luận. | Lấy trực tiếp từ **Phần 1–4 đã chốt**; AI chỉ chuyển sang cấu trúc máy đọc được, **không được lấy tài liệu trên mạng để thay thế hoặc làm đổi nghĩa chính sách sản phẩm**. |
| **3. Nội dung do AI biên soạn** | Đặc tả kỹ năng, giả thuyết chẩn đoán, bài học ngắn, gợi mở, bài tập. | Sinh từ các căn cứ đã quản lý ở trên và bắt buộc đi qua Cổng QC trước khi phát hành. |

### B. Sáu Loại Phát Biểu & Giá Trị Sử Dụng
Thẩm quyền được gắn với **từng phát biểu cụ thể và mục đích sử dụng**, không chỉ gắn theo tên tài liệu hay tên miền (ví dụ: câu *"đoạn PEEL giúp phát triển ý"* dù nằm trên trang web chính thức vẫn chỉ là *Hướng dẫn sư phạm*, không phải *Quy định chấm thi*):
1. **Quy định khảo thí chính thức:** Căn cứ về định dạng, tiêu chí và cách tính điểm trong phạm vi được công bố chính thức.
2. **Diễn giải vận hành nội bộ:** Hướng dẫn giúp AI nhận diện biểu hiện trong bài làm; phải truy ngược được về chuẩn gốc và được kiểm chứng.
3. **Tri thức ngôn ngữ:** Căn cứ đánh giá cấu trúc ngữ pháp, nghĩa từ, collocation, ngữ âm theo ngữ cảnh.
4. **Giả thuyết chẩn đoán:** Đề xuất các nguyên nhân tiềm năng cần kiểm tra thêm.
5. **Hướng dẫn sư phạm:** Gợi ý cách học, khung triển khai tham khảo (PEEL, AREA...), cách sửa bài.
6. **Chính sách sản phẩm:** Quy định phân quyền ngữ cảnh, bảo toàn bằng chứng, điều kiện chuyển trạng thái của nền tảng.

### C. Danh mục Nguồn Khởi Tạo Cụ Thể & Ánh Xạ Khối
Thứ tự ưu tiên nguồn: *(1) Tài liệu IELTS chính thức $\rightarrow$ (2) Nguồn ngôn ngữ & nghiên cứu có xuất xứ $\rightarrow$ (3) Tài liệu giảng dạy đáng tin (bổ sung cách giải thích) $\rightarrow$ (4) Nội dung cộng đồng (chỉ dùng để phát hiện vấn đề/giả thuyết rồi đối chiếu lại)*.

| Phạm vi | Nguồn tham chiếu khởi tạo | Mục đích sử dụng hợp lệ |
| :--- | :--- | :--- |
| **Rubric Writing** | • [IELTS Writing Band Descriptors](https://ielts.org/cdn/ielts-guides/ielts-writing-band-descriptors.pdf)<br>• [Writing preparation resources](https://ielts.org/take-a-test/preparation-resources/writing-test-resources) | Trích xuất tiêu chí gốc (Band nguyên) và giải thích chính thức. |
| **Rubric Speaking** | • [IELTS Speaking Band Descriptors](https://ielts.org/cdn/ielts-guides/ielts-speaking-band-descriptors.pdf) | Trích xuất tiêu chí gốc về FC, LR, GRA, P. |
| **Định dạng & Cách chấm** | • [Academic test](https://ielts.org/take-a-test/test-types/ielts-academic-test) & [General Training test](https://ielts.org/take-a-test/test-types/ielts-general-training-test)<br>• [Scoring in detail](https://ielts.org/take-a-test/your-results/ielts-scoring-in-detail) | Xác định dạng nhiệm vụ, yêu cầu, phạm vi và cách tính điểm công bố. |
| **Hướng dẫn giảng dạy** | • [IELTS Teacher’s Guide](https://ielts.org/cdn/ielts-guides/ielts-guide-for-teachers.pdf) | Bổ sung bối cảnh thiết kế & đánh giá; tách rõ phần hướng dẫn với quy định. |
| **Ngữ pháp tham chiếu** | • [British Council — English grammar reference](https://learnenglish.britishcouncil.org/free-resources/grammar/english-grammar-reference) | Cấu trúc, ngữ cảnh dùng, giải thích và ngoại lệ hợp lệ. |
| **Tham chiếu năng lực & Từ vựng** | • [CEFR Companion Volume](https://www.coe.int/en/web/common-european-framework-reference-languages/cefr-companion-volume-and-its-language-versions)<br>• [English Vocabulary Profile](https://englishprofile.org/?menu=evp-online) | Tham chiếu năng lực và cách dùng từ (không dùng làm công thức quy đổi 1:1 sang Band IELTS). |
| **Ký hiệu ngữ âm** | • [IPA Chart](https://www.internationalphoneticassociation.org/content/ipa-chart) | Chuẩn hóa ký hiệu âm (không dùng riêng bảng này làm toàn bộ tiêu chí chấm phát âm). |
| **Mẫu đối chiếu điểm** | • [IELTS resources for understanding scores](https://ielts.org/organisations/ielts-for-organisations/understanding-ielts-scoring/resources-for-setting-your-ielts-scores) | Mẫu biểu hiện và nhận xét giám khảo được công bố, tuân thủ phạm vi quyền sử dụng. |
| **Chính sách nội bộ** | • Tài liệu kiến trúc Phần 1–4 của dự án | Làm căn cứ cho Nền 2 (Chính sách nghiệp vụ) và Rule Engine. |

### D. Quản lý Quyền Sử Dụng Nguồn (Copyright & Usage Rights)
- Không mặc định tài liệu đọc được công khai hay "chỉ dùng nội bộ" là được phép sao chép toàn văn, lưu trữ hàng loạt hoặc gửi nguyên bản vào dịch vụ AI.
- Mỗi bản ghi nguồn lưu rõ: (1) Nguồn & thông báo bản quyền, (2) Mục đích dự kiến (*dùng nội bộ* và *hiển thị cho người học* được xét quyền riêng), (3) Có được lưu bản sao, đưa vào xử lý AI hoặc hiển thị lại không, (4) Trạng thái quyền: `Đã xác định` hoặc `Chưa rõ` (nếu `Chưa rõ`, chỉ giữ liên kết/thông tin nguồn, chưa nạp nguyên tài sản vào ngân hàng tự động).
- Nội dung do AI sinh mới phải đảm bảo tính độc lập, tránh sao chép gần nguyên bản (không lấy đề có bản quyền rồi chỉ đổi tên riêng, đổi vài con số và coi là bài mới).

---

## 3. Kiến trúc Tổng thể Cơ sở Tri thức (Lớp Quản trị Chung + 2 Nhóm Nền + 6 Khối)

```
                      [LỚP QUẢN TRỊ XUYÊN SUỐT]
   Nguồn gốc • Thẩm quyền phát biểu • Phiên bản • Quyền truy cập & Sử dụng
   Kiểm định (5 trục) • Phát hành theo gói • Thu hồi • Truy vết tác động ngược
                                   │
             ┌─────────────────────┴─────────────────────┐
             ↓                                           ↓
A. TRI THỨC CHUẨN (CANONICAL KNOWLEDGE)      B. NỘI DUNG ĐÃ QUA KIỂM TRA (CONTENT BANK)
├── Nền 1: Tri thức ngôn ngữ dùng chung      ├── Khối 5: Bài học ngắn (Micro-lessons),
├── Nền 2: Chính sách nghiệp vụ & bằng chứng │           khung tham khảo & gợi mở bậc thang
├── Khối 1: Đặc tả năng lực & đồ thị liên kết└── Khối 6: Ngân hàng nhiệm vụ & tài nguyên
├── Khối 2: Rubric 3 lớp & liên kết mẫu neo              đa phương thức
├── Khối 3: Giả thuyết chẩn đoán & phép thử  
└── Khối 4: Quy chuẩn sinh đề & kiểm duyệt   *(Quản lý riêng: Bài mẫu neo, Bộ phát triển
                                               và Bộ kiểm thử giữ kín liên kết với Khối 2)*
```

### Chi tiết Nội dung Từng Thành phần
1. **Nền 1 — Tri thức Ngôn ngữ Dùng chung:** Ngữ pháp theo ngữ cảnh, nghĩa và collocation, văn phong (Register), biến thể hợp lệ (Anh–Anh / Anh–Mỹ), ngữ âm, các cách diễn đạt tương đương — phục vụ chung cho cả Agent chấm, Agent sinh đề và Agent dạy học.
2. **Nền 2 — Chính sách Nghiệp vụ & Bảo toàn Bằng chứng:** Bản chính sách chuẩn được quản lý phiên bản và ánh xạ trực tiếp tới quy tắc của `Rule Engine` (điều kiện công nhận độc lập, mức ảnh hưởng hỗ trợ, điều kiện chuyển trạng thái, giới hạn suy luận), tránh việc luật trong prompt, trong tài liệu và trong code bị lệch nhau.
3. **Khối 1 — Đặc tả Năng lực & Đồ thị Liên kết:**
   - Tách bạch mã năng lực người học (`competency_id`) khỏi mã quy trình của AI (`agent_skill_id`).
   - Mỗi năng lực được định nghĩa theo **Hợp đồng bằng chứng 5 thành phần (Evidence-Centered Design)**: (1) *Nhận định mục tiêu*, (2) *Bằng chứng cần có*, (3) *Điều kiện tạo bằng chứng*, (4) *Yếu tố gây nhiễu*, (5) *Giới hạn suy luận*.
   - Phân loại 5 kiểu cạnh liên kết trong đồ thị: `Thành phần của`, `Hỗ trợ cho`, `Tiên quyết (chỉ khi có căn cứ)`, `Có thể chuyển giao giữa các ngữ cảnh`, `Thường dễ nhầm với` (không biến mọi liên kết thành điều kiện tiên quyết chặn người học).
4. **Khối 2 — Rubric 3 Lớp & Quản lý Tập Mẫu:**
   - **Cấu trúc Rubric 3 lớp (Không tự tạo luật đếm cơ học):**
     1. *Chuẩn gốc:* Tiêu chí chính thức theo đúng các mức **Band nguyên** (không tự biên soạn descriptor cho nửa band như 6.5, 8.5 rồi gọi là chuẩn chính thức; hỗ trợ xử lý cả đầu vào ngoài dải 4.0–8.5).
     2. *Hướng dẫn quan sát:* Cách tìm bằng chứng, phản chứng, ngoại lệ hợp lệ và trường hợp chưa đủ kết luận; phân biệt rõ **dấu hiệu cần xem xét** với **đặc điểm giới hạn mức điểm được nguồn chính thức nêu rõ**.
     3. *Cách tổng hợp nhận định:* Đánh giá biểu hiện trong toàn bộ phạm vi bài làm theo đúng tiêu chí, không cộng trừ điểm máy móc theo số lượng lỗi hay số lượng từ nối/câu phức.
   - **Tách 3 tập mẫu độc lập:** (1) *Mẫu neo (Anchors)* đưa vào ngữ cảnh hướng dẫn chấm, (2) *Bộ phát triển (Dev set)* để tinh chỉnh prompt/quy trình, (3) *Bộ kiểm thử giữ kín (Holdout test set)* không cấp cho lượt chấm và gồm cả các bài viết tốt nhưng khác khuôn mẫu, bài sát ranh giới, bài tín hiệu kém. Mỗi mẫu ghi rõ nguồn chấm, điểm từng tiêu chí hay điểm tổng (không tự suy điểm thành phần từ điểm tổng), bản gốc hay đã biên tập và quyền sử dụng.
5. **Khối 3 — Thư viện Đa Giả thuyết Chẩn đoán & Sức Phân biệt của Phép thử:**
   - Tách riêng các biểu hiện dễ gộp nhầm (như *thiếu động từ chính*, *run-on sentence* và *comma splice*); coi *"giao thoa tiếng Việt"* chỉ là một giả thuyết tham khảo chứ không phải nguyên nhân mặc định.
   - Mỗi **Thẻ chẩn đoán gồm 7 thành phần:** (1) Biểu hiện & điều kiện quan sát, (2) Các giả thuyết có thể cùng tồn tại, (3) Bằng chứng ủng hộ & phản chứng, (4) Nhiệm vụ/câu hỏi phân biệt nguyên nhân, (5) **Kết quả dự kiến dưới từng giả thuyết**, (6) **Các hỗ trợ mà phép thử đã cung cấp** (ví dụ: nghe đoạn cắt là đã được nghe thêm lượt + định vị hộ + giảm tải thông tin), (7) Giới hạn kết luận & nhánh tiếp theo nếu vẫn chưa phân biệt được.
6. **Khối 4 — Quy chuẩn Sinh Nội dung & Kiểm duyệt:** Quy tắc thiết kế nhiệm vụ, phương án nhiễu hợp lệ và tiêu chuẩn loại đề cho từng kỹ năng.
7. **Khối 5 — Bài học ngắn (Micro-lessons), Khung tham khảo & Gợi mở Kiểm soát Tiết lộ:**
   - Mỗi gợi mở (Scaffold) không chỉ gắn số nấc (1, 2, 3) mà phải mô tả rõ: *Thông tin được phép cung cấp*, *Quyết định nào người học còn phải tự thực hiện*, *Kỹ năng bị ảnh hưởng*, *Điều kiện giảm tải tạo ra*, và *Dấu hiệu vượt mức tiết lộ*.
   - Mỗi Micro-lesson gồm: giải thích, điều kiện áp dụng, ít nhất một phản ví dụ, câu kiểm tra hiểu và nhiệm vụ chuyển giao (mốc 1–2 phút chỉ là mục tiêu thiết kế tham khảo).
8. **Khối 6 — Ngân hàng Nội dung Đã Qua Kiểm Tra & Tài nguyên Đa phương thức:**
   - Không dùng nhãn "Verified" chung chung mà ghi rõ **Nguồn gốc + Phương pháp kiểm tra đã qua + Phạm vi được phép sử dụng**.
   - **Tách 4 thuộc tính của Độ khó:** (1) Mức người học dự kiến phù hợp để luyện, (2) Độ khó ước tính ban đầu, (3) Độ khó quan sát từ dữ liệu thực tế (kèm nhóm người học & điều kiện làm), (4) Trạng thái hiệu chuẩn.
   - **Quản lý Họ bài & Quan hệ biến thể:** Lưu `item_family_id` (họ nhiệm vụ), `derived_from` (nguồn biến thể), `shared_stimulus_id` (dùng chung bài đọc/biểu đồ/audio) và đặc điểm quyết định lời giải.

---

## 4. Hợp đồng Quản trị Dữ liệu, Năm Trục Kiểm Định & Truy Vết Ngược

### A. Bộ Trường Quản Trị Chung Cho Mọi Đơn Vị Tri Thức
Mỗi đơn vị tri thức lưu tối thiểu 8 nhóm trường: `Định danh (ID, loại, phiên bản)`, `Phạm vi (Academic/GT, kỹ năng, task, ngữ cảnh)`, `Căn cứ (nguồn, vị trí, checksum/phiên bản nguồn, quan hệ suy diễn)`, `Thẩm quyền (1 trong 6 loại phát biểu)`, `Hiệu lực (trạng thái, ngày hiệu lực, lịch rà soát)`, `Kiểm định (theo 5 trục)`, `Phụ thuộc (các đơn vị & tài nguyên đi kèm)`, và `Quyền (vai trò, pha, mức tiết lộ, quyền bản quyền)`.

### B. Năm Trục Kiểm Định Độc Lập
1. **Trục Nội dung:** Đáp án, ngôn ngữ, dữ kiện và căn cứ đã qua kiểm tra.
2. **Trục Tài nguyên:** Đúng phiên bản audio/hình ảnh, hiển thị và phát hoạt động tốt.
3. **Trục Vai trò sử dụng:** Được duyệt dùng để *Dạy*, *Luyện tập*, *Chẩn đoán* hay *Kiểm chứng độc lập*.
4. **Trục Thực nghiệm:** `Chưa thử nghiệm` | `Đã thử nghiệm` | `Đã có dữ liệu hiệu chuẩn`.
5. **Trục Vòng đời:** `Nháp (Draft)` | `Đang dùng (Active)` | `Tạm ngừng (Suspended)` | `Thu hồi / Loại bỏ (Retired)`.

### C. Truy Vết Tác Động Hai Chiều (Forward & Reverse Provenance)
Khi phát hiện một đơn vị tri thức, rubric hoặc đáp án chuẩn bị sai, hệ thống truy ngược được chuỗi phụ thuộc:
`Đơn vị tri thức / Đáp án lỗi` $\rightarrow$ `Các lượt làm bài đã sử dụng phiên bản đó` $\rightarrow$ `Các nhận định năng lực & chẩn đoán sinh ra từ đó` $\rightarrow$ `Các quyết định lộ trình cần xem xét lại`.

---

## 5. Pipeline Thu Thập – Chuẩn Hóa 6 Bước & Cổng QC Tri Thức 4 Tầng

### A. Phiếu Yêu Cầu Xây Gói Tri Thức (Package Request Spec — Trước Bước 1)
Mọi đợt thu thập/biên soạn đều bắt đầu bằng một **Phiếu yêu cầu xây gói** xác định rõ: Năng lực/nhiệm vụ cần phục vụ, những khối cần tạo, mục đích sử dụng, phạm vi (Academic/GT, kỹ năng), những phần chưa làm, điều kiện nghiệm thu và giới hạn số nguồn/lượt sửa/chi phí.

### B. Pipeline 6 Bước Có Kiểm Soát
1. **Bước 1 — Chọn nguồn & Xác định quyền sử dụng:** Nguồn mới đi vào danh sách *Candidate*; chỉ nguồn đạt chính sách về xuất xứ, phạm vi (ở cấp tài liệu/nhóm tài liệu cụ thể, không duyệt tràn lan cả tên miền) và quyền sử dụng mới được đưa vào trích xuất.
2. **Bước 2 — Thu thập, trích xuất & lưu căn cứ:** Lưu URL/tài liệu, ngày truy cập, trang/mục, đoạn căn cứ được phép lưu, ngữ cảnh/ngoại lệ và mã băm (checksum) để phát hiện khi nguồn thay đổi. Với tài liệu PDF dạng bảng, kiểm tra chống ghép lệch hàng/cột giữa Band và Tiêu chí.
3. **Bước 3 — Phân loại phát biểu, đối chiếu & biên soạn:** Tách thành các phát biểu đủ nhỏ để gán đúng 1 trong 6 loại phát biểu. Nếu nguồn chưa đủ căn cứ thì ghi nhận **Khoảng trống tri thức (Knowledge Gap)**, không để AI tự bịa từ trí nhớ rồi gắn dẫn chứng gần giống.
4. **Bước 4 — Chuẩn hóa Schema, mã & liên kết:** **JSON theo Schema là nguồn dữ liệu chuẩn duy nhất** (Markdown chỉ được sinh tự động từ JSON để người xây dựng đọc duyệt). Sử dụng mã `competency_id` từ danh mục chuẩn.
5. **Bước 5 — Đi qua Cổng QC Tri Thức 4 Tầng & Kiểm tra Độ bao phủ:** (Chi tiết tại Mục 5.C bên dưới).
6. **Bước 6 — Đóng gói, phát hành theo gói & lập chỉ mục:** Không bật `active` từng mảnh rời rạc. Chỉ phát hành khi cả gói đủ phụ thuộc, đúng phân quyền, đạt bộ kiểm thử, rõ phạm vi sử dụng và có bản lưu để quay lui (Rollback). Chỉ mục tìm kiếm (Search Index) chỉ phục vụ truy xuất, không phải nguồn dữ liệu chuẩn.

### C. Cổng QC Tri Thức 4 Tầng Hợp Nhất & Bảng Yêu Cầu Bao Phủ

| Tầng QC | Nội dung kiểm định (Hợp nhất khung A–B–C–D1) | Giới hạn & Lưu ý thực thi |
| :--- | :--- | :--- |
| **QC1 — Cấu trúc, Toàn vẹn, Định lượng & Bao phủ** *(Lớp B)* | • Kiểm tra JSON Schema, mã ID, liên kết phụ thuộc, trường cấp phát theo chính sách quyền đã khai báo.<br>• **Kiểm tra 3 tầng cho dữ liệu nguồn thống nhất:** (1) *Dữ liệu nguồn JSON*, (2) *Nhận định định lượng suy ra* (tăng/giảm, thứ hạng, tỷ lệ, làm tròn), (3) *Tài nguyên cuối* (biểu đồ hiển thị đủ nhãn/trục, audio phát đúng số/tên riêng/phủ định/tín hiệu đổi ý).<br>• **Kiểm tra Bảng yêu cầu bao phủ (Coverage Manifest):** Đảm bảo gói có đủ *trường hợp đạt, chưa đạt, ngoại lệ hợp lệ, điều kiện chưa đủ kết luận, nội dung hỗ trợ/kiểm chứng và ca kiểm thử* (ví dụ: không bị thiếu nhánh `Not Given` khi làm gói T/F/NG). Phần thiếu chỉ chặn chức năng phụ thuộc vào nó. | • Code kiểm tra theo chính sách quyền đã ghi nhận, không tự suy diễn quyền pháp lý.<br>• Quét chuỗi/regex (cho giới hạn từ Completion hoặc rò rỉ gợi ý) chỉ là **bộ lọc xác định sơ bộ**, phải đi kèm kiểm tra ngữ nghĩa ở QC3/QC4. |
| **QC2 — Trung thực với Nguồn gốc** *(Lớp A)* | • Kiểm tra nguồn có thực sự hỗ trợ phát biểu không, đúng phạm vi, không bỏ sót ngoại lệ, đúng hàng/cột bảng gốc, không gán nhãn `Quy định chính thức` cho phần hệ thống tự diễn giải. | • Có trích dẫn (citation) chưa đủ; phải kiểm tra quan hệ thực chất giữa nội dung và căn cứ. |
| **QC3 — Tuân thủ Chính sách Nghiệp vụ Phần 1–4** *(Lớp C - P1)* | • Bao phủ cả 2 nhóm nền và 6 khối: khớp với Rule Engine, không chấm theo mẹo, không kết luận vượt bằng chứng, giữ đúng ranh giới hỗ trợ.<br>• Phân biệt **quy tắc có con số hợp lệ** (từ yêu cầu đề bài hoặc chính sách sản phẩm) với **luật đếm cơ học tự chế** (như bắt buộc đoạn văn có 4 câu hay 3 câu phức). | • Tìm từ khóa nghi vấn chỉ là bước gợi ý, cần đánh giá ngữ nghĩa của quy tắc. |
| **QC4 — Kiểm thử Tác động & Giải mù Độc lập** *(Lớp C - P2 & Lớp D1)* | • Với nhiệm vụ/bài tập: Giải mù độc lập và phản biện đáp án cạnh tranh hợp lý.<br>• Với gói tri thức/rubric/gợi mở: Chạy thử trong luồng chấm, chẩn đoán, gợi mở trên **3 loại ca kiểm thử**: (1) *Mẫu đối chứng có căn cứ bên ngoài*, (2) *Ca kiểm thử chính sách (Policy test cases)*, (3) *Ca tổng hợp tìm lỗi (Synthetic probe cases)*. | • Quy mô số lượng ca kiểm thử phải tương xứng với phạm vi ảnh hưởng của thay đổi.<br>• Ca mẫu do AI tự tạo chỉ dùng để dò lỗi/kiểm tra chính sách, không tự phong là mẫu chuẩn định chuẩn Band điểm. |

### D. Phân Quyền Tự Động Hóa & Sáu Đầu Ra Thực Thi Của Phần 5
- **Quyền vận hành an toàn:** AI biên soạn chỉ làm việc trên bản nháp (`staging`); AI QC chạy trong ngữ cảnh tách biệt; **Agent dạy/chấm trong phiên học của người học chỉ có quyền đọc (`Read-only`) bản đã phát hành** (có thể gửi cờ báo lỗi nhưng không tự sửa kho chuẩn). Mọi thay đổi làm đổi ý nghĩa chính sách Phần 1–4 phải qua đề xuất thay đổi thiết kế.
- **Sáu đầu ra thực thi chuẩn để giao AI xây Base:**
  1. `Source Registry` (Danh mục nguồn, phạm vi, phiên bản, checksum & quyền sử dụng).
  2. `Knowledge Schemas` (JSON Schema chung và riêng cho 2 nhóm nền + 6 khối).
  3. `Ingestion Playbook` (Hợp đồng đầu vào–đầu ra của Phiếu yêu cầu & 6 bước pipeline).
  4. `QC Specification` (Tiêu chí QC1–QC4, mã lỗi, mức chặn và cách kiểm tra).
  5. `Test & Coverage Manifest` (Bảng yêu cầu bao phủ, 3 loại ca kiểm thử và căn cứ kỳ vọng).
  6. `Release Manifest` (Phiên bản gói, đồ thị phụ thuộc, quyền cấp phát, kết quả QC và điểm quay lui).

---

## 6. Cấp Phát Tri Thức Trước Ngữ Cảnh & Xác Định Tính Mới Của Nhiệm Vụ

### A. Phân Quyền Trước Khi Đưa Vào Ngữ Cảnh AI (Pre-Context View Slicing & RAG Security)
1. **Cắt góc nhìn dữ liệu theo người nhận và pha thực thi:**
   - *Người học:* Chỉ nhận đề và tài nguyên được phép xem.
   - *Agent giải mù:* Chỉ nhận gói đề/tài nguyên của pha giải mù (không có đáp án, giải thích hay mục tiêu ẩn).
   - *Agent kiểm duyệt đối chiếu:* Nhận thêm đáp án, bằng chứng và đặc tả đo.
   - *Agent chấm:* Nhận bài làm, rubric, nguồn bằng chứng và nhật ký hỗ trợ liên quan.
   - *Agent gợi mở:* Chỉ nhận phần tri thức được phép cho nấc hiện tại theo chính sách tiết lộ (kiểm tra cả bản gợi ý sau khi đã điền dữ liệu bài cụ thể).
2. **Quy trình truy xuất an toàn:**
   - Lọc quyền, phạm vi, trạng thái `active` và đúng phiên bản đã khóa $\rightarrow$ **Nạp trực tiếp (Deterministic Lookup) các Rubric và Chính sách bắt buộc theo mã ID** (không để việc có mặt của quy tắc bắt buộc phụ thuộc vào may rủi của tìm kiếm ngữ nghĩa Vector/RAG) $\rightarrow$ Tìm kiếm bổ sung tài liệu tham khảo trong vùng được phép $\rightarrow$ Kiểm tra đủ gói phụ thuộc trước khi gọi AI.
   - Mọi tài liệu nạp vào ngữ cảnh đều được đóng khung là dữ liệu tham khảo, không cho phép ghi đè chỉ dẫn vận hành của Agent (chống Prompt Injection theo chuẩn bảo mật OWASP RAG).

### B. Xác Định Tính Mới (Novelty) & Báo Cáo Độ Phủ Ngân Hàng
- **Tính mới là quan hệ kết hợp giữa Nhiệm vụ – Lịch sử tiếp xúc của người học – Mục tiêu đo** (không phải thuộc tính tĩnh của câu hỏi):
  - Kết hợp thông tin từ Khối 6 (`item_family_id`, `derived_from`, `shared_stimulus_id`, đặc điểm quyết định lời giải) với **Nhật ký tiếp xúc trong Dữ liệu người học** (ghi rõ người học đã thấy: *Đề / Một phần gợi ý / Đáp án / Lời giải đầy đủ / Bài mẫu hoặc biến thể gần*).
  - Nếu nhiều câu hỏi dùng chung một bài đọc/biểu đồ/audio (`shared_stimulus_id`), hệ thống kiểm tra xem lời giải của câu trước có làm lộ thông tin cần tự tìm của câu sau hay không.
- **Báo cáo thiếu phủ (Coverage Gap Report):** Ngân hàng nhiệm vụ theo dõi độ phủ theo ma trận `Kỹ năng × Vai trò bài × Phạm vi × Loại ràng buộc × Thời lượng × Họ bài` để biết chính xác chỗ nào còn hay hết bài Fallback hợp lệ.

---

## 7. Giám Sát Sau Phát Hành (Lớp D2), Xử Lý Khiếu Nại & Ba Lối Ra Cho Bài Cách Ly

### A. Phân Loại 5 Kết Quả Thẩm Định Lại Khi Có Khiếu Nại / Sự Cố
Không gộp mọi khiếu nại thành "đóng băng bài tập":

| Kết quả thẩm định lại | Cách xử lý của hệ thống |
| :--- | :--- |
| **1. Đề hoặc đáp án chuẩn sai / mơ hồ** | Tạm ngừng cấp phát đúng `item_id + version` (hoặc tài nguyên chung) bị ảnh hưởng trên cả kho và cache; rà soát các kết quả phụ thuộc. |
| **2. Bộ chấm bỏ sót một cách trả lời hợp lệ** | Sửa kết quả cho người học; bổ sung phương án trả lời hợp lệ (Accepted Alternative) hoặc cập nhật hướng dẫn chấm. |
| **3. Audio / bài làm của một lượt thiếu tín hiệu** | Giới hạn kết luận về `Chưa đủ khả năng kết luận` ở lượt hoặc đoạn đó; không đánh dấu đề bài bị lỗi. |
| **4. Khiếu nại chưa đủ căn cứ phân giải** | Giữ trạng thái đang xem xét / chờ kiểm chứng; không tự động coi người học đúng hoặc sai. |
| **5. Lỗi công cụ hoặc quá thời gian chờ (Timeout)** | Ghi nhận `Lỗi kỹ thuật` ở trạng thái xử lý và áp dụng luồng Fallback của Phần 4. |

- **Bảo vệ người học hai chiều (Two-Way Protection):** Nếu một câu hỏi/đề bài được xác nhận có lỗi, hệ thống không chỉ hủy kết luận `Chưa đạt` mà **cả kết luận `Đã đạt` nếu chỉ dựa riêng vào câu hỏi lỗi đó cũng phải được chuyển về trạng thái cần kiểm chứng lại** (các bằng chứng hợp lệ khác vẫn giữ nguyên).
- **Tín hiệu điều tra thông minh:** Không dùng một con số đếm khiếu nại thô cố định mà xét theo tỷ lệ trên số lượt tiếp xúc độc lập, mức độ nghiêm trọng, kết quả tái kiểm tra và chống đếm trùng sự kiện.

### B. Ba Lối Ra Cho Bài Bị Cách Ly (Giảm Tải Cho Người Vận Hành Một Mình)
Để người xây dựng không bị ngập trong hàng đợi duyệt tay, mọi đơn vị nội dung bị cách ly đi theo 1 trong 3 lối ra:
1. **Tự sửa & kiểm tra lại tự động** trong giới hạn số vòng và chi phí đã định (nếu đạt thì phát hành phiên bản mới, không ghi đè lịch sử cũ).
2. **Loại bỏ luôn (`Retire / Discard`)** nếu bài đó không quan trọng hoặc chi phí sửa không đáng công, và dùng bài thay thế hợp lệ.
3. **Đưa vào danh sách cần người xây dựng xem** kèm bản tóm tắt bằng chứng lỗi và mức độ ưu tiên (chỉ áp dụng cho các đơn vị tri thức lõi hoặc bài có giá trị cao).

---

## 8. Lộ Trình Triển Khai, Điều Kiện Nghiệm Thu & Đồng Bộ Phần 1–4

### A. Thứ Tự Triển Khai Thực Tế
1. Chốt cấu trúc Schema, 6 đầu ra thực thi và các điều kiện bất biến (loại phát biểu, hợp đồng bằng chứng, phân quyền trước ngữ cảnh, truy vết).
2. Xây dựng hoàn chỉnh **1 gói lát cắt Writing** và **1 gói lát cắt Reading** (đúng Giai đoạn 2 của Phần 4) + các tình huống mẫu có **Audio** để kiểm tra hợp đồng đa phương thức.
3. Thiết lập **Bộ đối chứng giữ kín** (gồm cả các bài làm tốt nhưng khác khuôn mẫu dễ bị chấm oan) trước khi tinh chỉnh sâu prompt AI.
4. Vận hành thử nghiệm có giám sát toàn vòng (bao gồm cả Fallback, khiếu nại, cách ly và thu hồi) trước khi nhân rộng sang các gói kỹ năng tiếp theo.

### B. Tám Câu Hỏi Nghiệm Thu Một Gói Tri Thức Sẵn Sàng Sử Dụng
Một gói tri thức chỉ được coi là sẵn sàng khi trả lời rõ ràng 8 câu hỏi:
1. Dùng cho năng lực (`competency_id`) và vai trò nhiệm vụ nào?
2. Dựa vào nguồn nào, và phần nào là diễn giải nội bộ?
3. Đã qua những kiểm tra nào, kiểm tra nào chưa áp dụng hoặc chưa có?
4. Được phép đưa ra kết luận ở tầng nào (Kết quả câu / Kỹ năng nhỏ / Band ước lượng)?
5. Đã có trường hợp biên (ngoại lệ hợp lệ) và tình huống phải từ chối kết luận (`Chưa đủ khả năng kết luận`) chưa?
6. Có thể cắt góc nhìn cấp phát đúng quyền và khóa đúng phiên bản không?
7. Có phương án xử lý khi lỗi, khiếu nại hoặc khi kho hết bài mới đối với người học không?
8. Có truy ngược được những kết quả bị ảnh hưởng khi cần sửa sai hoặc thu hồi không?

### C. Cập Nhật Đồng Bộ Hai Chiều Với Phần 1–4 & Phần 6 / 06A
1. **Đồng bộ vào Phần 1:** Chỉ đưa ra loại kết luận phù hợp với mức kiểm định và phạm vi của nhiệm vụ (tách biệt kết quả bài làm, năng lực vi kỹ năng và điểm IELTS ước lượng).
2. **Đồng bộ vào Phần 2:** Phân loại 5 kiểu quan hệ cạnh trong đồ thị kỹ năng; lưu quan hệ tài nguyên dùng chung (`shared_stimulus_id`), họ bài (`item_family_id`) và nhật ký 5 mức tiếp xúc của người học (dùng chung cho cả chế độ Builder và Học tập) để xác định tính mới.
3. **Đồng bộ vào Phần 3:** Quy định rõ điều kiện khi nào được báo điểm Band ước lượng vs. chỉ phản hồi kỹ năng; bổ sung yêu cầu kiểm thử trên tập bài làm đúng nhưng khác khuôn mẫu để chống chấm oan.
4. **Đồng bộ vào Phần 4:** Thực thi phân quyền trước ngữ cảnh (View slicing) theo cả pha và trường dữ liệu; hỗ trợ thu hồi xuyên phụ thuộc trên cả kho chính lẫn bộ nhớ đệm (Cache).
5. **Đồng bộ với Phần 6 & Phụ lục 06A:**
   - **Phân định Nguồn dữ liệu chuẩn (`Source of Truth`):** Nội dung gói tri thức, rubric, đặc tả lấy **File JSON theo phiên bản bất biến** làm nguồn chuẩn (bản nhập trong SQLite/FTS chỉ dùng để tra cứu và có thể dựng lại); trong khi trạng thái vòng đời (`active / suspended / retired`), lịch sử phát hành, bài nộp, bằng chứng, hồ sơ và tác vụ nền lấy **SQLite Database** làm nguồn chuẩn.
   - **Quản lý Gói ngữ cảnh (`context_manifests`) & Bộ nhớ đệm (`result_cache`):** Lưu manifest kèm hash dữ liệu gửi AI; khóa cache bắt buộc khớp đồng thời `input_hash`, vai trò, pha, phiên bản chính sách/rubric/tri thức, model và mức tiết lộ; sử dụng bộ đối chứng chung để đánh giá chất lượng giữa các nhà cung cấp CLI trước khi đưa vào luồng dự phòng.
