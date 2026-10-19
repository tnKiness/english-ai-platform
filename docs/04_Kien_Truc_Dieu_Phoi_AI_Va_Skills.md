# PHẦN 4: KIẾN TRÚC ĐIỀU PHỐI AI THEO VAI TRÒ, SKILLS VÀ NGUỒN TRI THỨC CÓ THỂ MỞ RỘNG

> **Trạng thái:** ĐÃ CHỐT (v1.0)
> **Nguyên tắc kiến trúc:** Linh hoạt ở cấu hình và mở rộng, nhưng chặt chẽ tuyệt đối ở hợp đồng thực thi, phân quyền ngữ cảnh và quy tắc bảo toàn bằng chứng của Phần 1–3. Hệ thống không bị đóng cứng vào "đúng 6 AI cố định" mà sử dụng 6 nhóm chức năng làm cấu hình khởi đầu trên một nền tảng lắp ghép có kiểm soát.

---

## 1. Phân tách Khái niệm Cốt lõi, Bốn Loại Dữ liệu & Năm Dịch vụ Nền

### A. Sáu Khái niệm Cốt lõi trong Kiến trúc
| Thành phần | Ý nghĩa & Trách nhiệm | Ví dụ trong hệ thống |
| :--- | :--- | :--- |
| **1. Skill** | Quy định cách thực hiện một công việc cụ thể: quy trình, đầu vào, đầu ra, điều kiện áp dụng và giới hạn. | Đánh giá câu T/F/NG; Chẩn đoán lỗi âm cuối; Chọn nấc gợi mở tự sửa. |
| **2. Data / Knowledge** | Kiến thức, tài liệu và dữ liệu có phân quyền mà hệ thống/AI được phép sử dụng ở từng bước. | Đặc tả kỹ năng, Rubric chấm, Quy tắc ngôn ngữ, Bài tập đã kiểm định. |
| **3. Agent** | Một vai trò AI được cấu hình bằng nhiệm vụ, các Skills, nguồn dữ liệu và công cụ được phép dùng. | Agent đánh giá Writing; Agent sinh nhiệm vụ Listening; Agent giải mù kiểm duyệt. |
| **4. Workflow** | Quy trình phối hợp các bước, các Agents và công cụ, bao gồm điều kiện rẽ nhánh, vòng lặp, tạm dừng và tiếp tục. | Sinh đề $\rightarrow$ Tạo audio $\rightarrow$ Giải mù $\rightarrow$ Kiểm duyệt $\rightarrow$ Giao bài. |
| **5. Rule & State Engine** | Thực thi các điều kiện nghiệp vụ xác định (deterministic) và quyết định chuyển trạng thái năng lực/lịch kiểm chứng. | Xác định bằng chứng đủ điều kiện 7A; Cập nhật Hồ sơ năng lực; Kiểm tra điều kiện tín hiệu. |
| **6. Tool** | Công cụ kỹ thuật thực hiện thao tác cụ thể theo lệnh của hệ thống hoặc Agent. | Tạo audio (TTS), Đọc bản ghi âm (ASR), Dựng biểu đồ, Lưu snapshot. |

* **Quan hệ vận hành:** *Agent* thực hiện một vai trò, sử dụng những *Skills* và *nguồn dữ liệu* được cấp, tại một bước cụ thể của *Workflow*. Một Agent có thể có nhiều Skills; một Skill có thể được nhiều Agents tái sử dụng. Nhiều Agents không bắt buộc phải là nhiều mô hình LLM khác nhau (cùng một mô hình có thể đảm nhiệm các Agents qua các phiên thực thi được cô lập ngữ cảnh; hoặc đổi mô hình cho một Agent mà vẫn giữ nguyên hợp đồng đầu vào/đầu ra).

### B. Phân biệt Bốn Nhóm Dữ liệu & Tri thức
Hệ thống tách bạch 4 nhóm để quản lý quyền truy cập, vòng đời cập nhật và giá trị sử dụng (tránh việc lấy một *Bài mẫu tham khảo* biến thành tiêu chuẩn duy nhất để chấm bài):
1. **Tri thức chuẩn (Canonical Knowledge):** Đặc tả kỹ năng (`Skill Specifications`), Rubric chấm điểm, Quy tắc ngôn ngữ, Quy tắc nghiệp vụ.
2. **Nội dung học (Learning Content):** Ngân hàng bài tập đã kiểm định, bài đọc/nghe, ví dụ minh họa, audio, biểu đồ, bài mẫu tham khảo.
3. **Dữ liệu người học (Learner Data):** Hồ sơ năng lực, Kho bằng chứng thực hiện, Sổ lỗi, lịch sử bài làm, các bản chụp trước/sau hỗ trợ, lịch sử nhận gợi ý.
4. **Dữ liệu tạm của phiên (Persistent Session State):** Trạng thái phục vụ phiên học đang diễn ra (bản nháp giữa các bước, nấc gợi mở hiện tại, số lượt thử sửa...). *Lưu ý: Dữ liệu phiên phải được lưu bền vững để không bị mất khi người học tải lại trang hoặc tạm dừng sang buổi học sau.*

### C. Năm Thành phần Dịch vụ Nền (Non-AI Platform Services)
Ngoài các vai trò AI, hệ thống vận hành dựa trên 5 dịch vụ nền không phải AI:
1. **Workflow & Rule Engine:** Định tuyến nhánh học, kiểm tra điều kiện chạy, tính toán trạng thái năng lực và lịch kiểm chứng.
2. **Dịch vụ Dữ liệu & Bằng chứng:** Quản lý snapshot trước/sau hỗ trợ, ghi nhận lịch sử nội dung hỗ trợ thực tế đã hiển thị, liên kết nguồn bằng chứng và khóa phiên bản.
3. **Công cụ Đa phương thức (Multimodal Tools):** Xử lý chất lượng audio, ASR, cắt đoạn âm thanh, dựng biểu đồ/bản đồ/quy trình.
4. **Danh mục Cấu hình (Configuration Registry):** Quản lý mã định danh, phiên bản và quyền truy cập của Agents, Skills, Nguồn tri thức.
5. **Hệ thống Kiểm thử & Giám sát:** Kiểm thử hồi quy (Regression testing), đo chất lượng chẩn đoán, theo dõi độ trễ, chi phí và tỷ lệ lỗi/retry.

---

## 2. Cơ chế Lắp ghép, Cấp Ngữ cảnh Cô lập & Hợp đồng Thực thi

### A. Luồng Thực thi Tổng quát
```
[Mục tiêu học + Hồ sơ năng lực + Kho bằng chứng hiện có]
                          ↓
        [Rule Engine xác định nhu cầu hợp lệ]
                          ↓
         [Workflow chọn nhánh xử lý phù hợp]
                          ↓
     [Kiểm tra điều kiện tín hiệu (Tầng trước khi gọi)]
                          ↓
   [Agent được cấp ngữ cảnh cô lập cho riêng bước đó]
      ├── Skills cần dùng
      ├── Knowledge được phép đọc (đúng phiên bản)
      └── Tools được phép gọi
                          ↓
      [Kết quả chuẩn hóa + Căn cứ trích dẫn + Giới hạn]
                          ↓
 [Kiểm tra hợp đồng, chính sách tiết lộ & tín hiệu (Tầng sau phân tích)]
                          ↓
 [Rule Engine lưu bằng chứng / Chuyển bước tiếp / Cập nhật trạng thái]
```

### B. Cấp Ngữ cảnh Cô lập theo Từng Lần Thực thi & Cắt Góc Nhìn Dữ Liệu (View Slicing)
- Việc một Agent được gắn quyền truy cập một nguồn dữ liệu không có nghĩa toàn bộ dữ liệu đó được đưa vào mọi lần gọi. Phân quyền được thực thi **trước khi dữ liệu đi vào ngữ cảnh AI** theo cả vai trò, bước workflow, pha thực thi và trường dữ liệu (View slicing):
  - *Pha giải mù (Blind Solve):* Hệ thống chỉ truyền đúng góc nhìn đề bài/tài nguyên mà người học nhìn hoặc nghe thấy (loại bỏ hoàn toàn trường đáp án, giải thích và mục tiêu ẩn).
  - *Pha đối chiếu (Verification Audit):* Hệ thống mới truyền đáp án dự kiến, Rubric và mục tiêu đo.
  - *Khi gợi mở ở Bước 5:* Chỉ truyền phần dữ liệu được phép tiết lộ ở nấc hiện tại.
  - *Khi giải mù lại bài vừa sửa:* Phiên gọi mới hoàn toàn không mang theo lịch sử hay đáp án của lần sửa trước.
- **Thu hồi xuyên phụ thuộc (kể cả bộ nhớ đệm / Cache):** Khi một đơn vị tri thức, đề bài hoặc đáp án bị tạm ngừng (`Suspended`) hoặc thu hồi (`Retired`), hệ thống ngừng cấp phát ngay lập tức trên cả kho dữ liệu chính lẫn mọi tầng Cache, đồng thời truy vết ngược các nhận định bị ảnh hưởng để tái đánh giá hoặc giới hạn kết luận.

### C. Kiểm tra Điều kiện Tín hiệu 2 Tầng & Tách Trạng thái Xử lý khỏi Kết quả Đánh giá
Điều kiện kết nối giữa các bước không chỉ là khớp định dạng JSON, mà phải đảm bảo tính hợp lệ của nguồn bằng chứng theo từng nhận định/đoạn (không chặn toàn bộ bài làm chỉ vì một phần thiếu tín hiệu):

| Tầng kiểm tra | Nội dung thực hiện |
| :--- | :--- |
| **1. Trước khi gọi mô hình (Pre-invocation)** | Kiểm tra sự tồn tại của nguồn tín hiệu bắt buộc và các điều kiện chất lượng xác định trước được (định dạng, thời lượng, khả năng truy cập). Phân biệt rõ *điều kiện bắt buộc* (VD: chấm phát âm bắt buộc có audio) với *dữ liệu bổ trợ* (VD: thiếu snapshot trước hỗ trợ vẫn có thể xác định một phần ảnh hưởng nếu hệ thống có nhật ký hiển thị gợi ý trước khi làm bài; phần không đủ dữ liệu mới để `Chưa rõ`). |
| **2. Sau khi phân tích (Post-analysis)** | Kiểm tra tín hiệu thực tế ở từng đoạn có đủ rõ để hỗ trợ cho từng nhận định cụ thể hay không (VD: một đoạn audio nhiễu chỉ giới hạn nhận định về âm cuối ở đoạn đó, vẫn giữ giá trị đánh giá nội dung ở các đoạn rõ). |

- **Lưu tách biệt 2 trường trạng thái:**
  1. `Trạng thái xử lý kỹ thuật`: `Đã xử lý` | `Bỏ qua do thiếu dữ liệu` | `Lỗi kỹ thuật`.
  2. `Kết quả đánh giá sư phạm`: `Đạt` | `Chưa đạt` | `Chưa đủ khả năng kết luận`.
  *(Giúp hệ thống phân biệt rõ "chưa chấm được do lỗi/thiếu dữ liệu" với "đã xem xét nhưng bằng chứng bài làm chưa đủ rõ").*

### D. Quản lý Trạng thái Tương tác Bước 5 (Tách Lượt thử sửa khỏi Nấc hỗ trợ)
Workflow quản lý trạng thái hội thoại Bước 5 nhưng **không đánh đồng `1 lượt tương tác = 1 lượt thử sửa = tăng 1 nấc hỗ trợ`** (ví dụ: người học hỏi làm rõ đề hoặc AI diễn đạt lại gợi ý không bị tính là một lần sửa sai).
- **Các biến trạng thái quản lý riêng:** (1) `Nấc hỗ trợ hiện tại`, (2) `Số lượt thực sự thử sửa`, (3) `Lựa chọn của người học`, (4) `Nội dung đã tiết lộ`, (5) `Vấn đề đang xử lý & liên kết bài làm gốc`.
- **Quy tắc chuyển nhánh tại Bước 5:**

| Tình huống | Hành vi của hệ thống |
| :--- | :--- |
| **Sửa đạt trước giới hạn lượt** | Kết thúc nhánh tự sửa cho điểm đó; không bắt đi hết các nấc còn lại. |
| **Chọn “Giải thích trực tiếp”** | Chuyển sang giải thích, lưu sự kiện *Đã xem lời giải* và kiểm tra hiểu khi cần. |
| **Chọn “Để mình thử thêm”** | Cho phép tiếp tục thử sửa trong phạm vi hỗ trợ phù hợp. |
| **Chưa đạt sau giới hạn mặc định** | Đưa giải thích ngắn + câu hỏi kiểm tra hiểu để quyết định nhánh Bước 6. |
| **Bộ chấm chưa chắc bản sửa đúng/sai** | Kích hoạt hỏi làm rõ hoặc thẩm định lại; **không tính thành một lượt sửa sai**. |
| **Người học tạm dừng buổi học** | Lưu bền vững trạng thái phiên để buổi sau tiếp tục; **không tự kết luận chưa hiểu**. |

- **Kiểm soát chống rò rỉ đầu ra (Output Disclosure Policy Check):** Vì bản thân Skill gợi mở vẫn có nguy cơ vô tình suy ra và viết lộ đáp án, hệ thống kiểm tra nội dung phản hồi trước khi hiển thị theo chính sách tiết lộ của nấc hiện tại.
- **Kiểm duyệt câu hỏi kiểm tra hiểu:** Câu hỏi kiểm tra hiểu mới sinh để phân luồng sang Bước 6 cũng phải đi qua bước kiểm duyệt hợp lệ, không trở thành đường vòng bỏ qua Quality Gate.

---

## 3. Sáu Nhóm Chức năng AI Khởi đầu & Tiêu chí Tách Agent

Thay vì gộp cứng vào 6 prompt lớn, cấu hình ban đầu gồm **6 nhóm chức năng**, mỗi nhóm chứa các Skills nhỏ độc lập:

| Nhóm chức năng | Các Skills thành phần bên trong | Trách nhiệm cốt lõi cần đảm bảo |
| :--- | :--- | :--- |
| **1. Hỗ trợ đầu vào (Input Scaffolding)** | Gợi mở ý tưởng; Hỗ trợ từ vựng; Hỗ trợ chiến thuật; Đề xuất phạm vi ảnh hưởng. | Chỉ mở đúng chế độ; xuất đề xuất phạm vi ảnh hưởng; **nội dung thực tế hiển thị cho người học do hệ thống trực tiếp ghi nhận**. |
| **2. Đánh giá & Chẩn đoán (Evaluation & Diagnosis)** | Đánh giá biểu hiện; Phân tích ảnh hưởng hỗ trợ; Xác định cơ hội quan sát; Lập giả thuyết nguyên nhân; Tiếp nhận câu trả lời làm rõ; Thẩm định lại (Second-opinion). | Đánh giá bài đầu vào & bài luyện/kiểm tra; tách kết quả bài làm với nhận định kỹ năng; xét cơ hội quan sát thực tế; có thể tách *Agent Thẩm định lại* độc lập trong cùng nhóm khi cần. |
| **3. Dẫn dắt tự sửa (Guided Repair)** | Chọn/diễn đạt nấc gợi ý; Đánh giá bản sửa; Sinh & chấm câu hỏi kiểm tra hiểu; Giải thích ngắn. | Xử lý các lượt sửa theo đúng trạng thái do Workflow cấp; đề xuất nhóm nhu cầu Bước 6 dựa trên kết quả tự sửa và kiểm tra hiểu. |
| **4. Sinh nhiệm vụ (Task Generation)** | Sinh nhiệm vụ theo đặc tả; Tạo phương án nhiễu (Distractors); Tạo dữ liệu nguồn (biểu đồ/kịch bản nghe); Đề xuất Rubric/Đáp án. | Phủ đầy đủ bài đánh giá đầu vào, bài học/luyện Bước 6, nhiệm vụ phân biệt nguyên nhân, và bài kiểm tra 7A/7B/Bước 9; phối hợp công cụ tạo tài nguyên đa phương thức. |
| **5. Kiểm duyệt (Quality Gate Auditing)** | Giải mù độc lập; Kiểm tra đáp án & phương án cạnh tranh; Kiểm tra phạm vi đo; Kiểm tra rò rỉ gợi ý; Kiểm tra khớp nối audio/hình ảnh; Rà soát bài bị khiếu nại. | Duyệt đúng phiên bản tài nguyên thực tế người học sẽ nhận; kiểm tra toàn bộ nội dung hiển thị có làm lộ quyết định cần tự làm hay không; hỗ trợ rà soát khi nhiệm vụ bị khiếu nại. |
| **6. Cố vấn lộ trình (Planner Advisory)** | Đề xuất ngữ cảnh/chủ đề tạo cơ hội sử dụng; Giải thích lý do ưu tiên; Diễn đạt mục tiêu nhiệm vụ & tiến độ. | Tư vấn trong phạm vi các nhiệm vụ hợp lệ đã được Rule Engine lọc; giải thích minh bạch từ dữ liệu đã xác nhận. |

### Năm Tiêu chí Quyết định Khi nào Cần Tách Riêng Agent
Không tạo một Agent riêng cho mỗi Skill nhỏ. Chỉ tách thành các Agents riêng khi có ít nhất một trong 5 nhu cầu sau:
1. Cần **ranh giới dữ liệu khác nhau** (VD: Agent Sinh đề vs. Agent Giải mù).
2. Cần **quyền sử dụng công cụ khác nhau**.
3. Cần **đánh giá / thẩm định độc lập** (VD: Agent Chấm chính vs. Agent Thẩm định lại).
4. Cần **năng lực mô hình hoặc phương thức xử lý khác nhau** (VD: xử lý âm thanh trực tiếp vs. suy luận văn bản sâu).
5. Cần **tối ưu hóa chi phí/độ trễ hoặc kiểm thử độc lập**.

---

## 4. Quản lý Phiên bản theo Tác động, Khóa Phiên bản & Chống Ghi nhận Trùng

### A. Theo dõi Phiên bản Tách biệt & Phân loại theo Tác động
Hệ thống theo dõi riêng phiên bản của: `Đặc tả kỹ năng`, `Rubric`, `Skill xử lý`, và `Cấu hình Agent/Model`. Khi có cập nhật, không chỉ nhìn số phiên bản hay độ lớn của đoạn mã sửa đổi, mà phân loại theo **tác động thực tế đến ý nghĩa đo lường**:

| Loại thay đổi phiên bản | Cách xử lý đối với Bằng chứng & Nhận định cũ |
| :--- | :--- |
| **1. Không đổi ý nghĩa đo lường (Đã kiểm tra tương thích)** | Giữ nguyên hiệu lực của các bằng chứng cũ theo phạm vi đã chứng minh. |
| **2. Thay đổi phạm vi đo hoặc điều kiện công nhận** | Giữ nguyên lịch sử bằng chứng cũ kèm phiên bản cũ; **chưa tự động chuyển kết luận sang phạm vi mới** (đánh dấu cần bổ sung kiểm chứng cho phần phạm vi mới). |
| **3. Sửa sai (Bug fix) có ảnh hưởng tới kết quả cũ** | Xác định các nhận định bị ảnh hưởng và tổ chức **Tái đánh giá (Re-evaluation)** trên dữ liệu bài làm gốc khi có thể. |

- **Quy tắc Tái đánh giá (Re-evaluation Rules):**
  1. Giữ nguyên bài làm gốc và dữ liệu nguồn của người học.
  2. Kết quả tái đánh giá tạo ra **bản nhận định mới liên kết với bản cũ**, tuyệt đối không âm thầm ghi đè xóa dấu vết lịch sử.
  3. Nếu dữ liệu bài làm cũ đủ để đánh giá theo tiêu chí đã sửa, hệ thống tự tái đánh giá ở tầng nền mà **không bắt người học phải làm lại bài**.
  4. Tái đánh giá cùng một bài làm cũ **không tạo thêm một lần kiểm chứng độc lập mới**.
  5. Bản thân việc đổi phiên bản tiêu chí không phải là bằng chứng cho thấy năng lực người học suy giảm.

### B. Hai Quy tắc Bất biến Cấp Hệ thống
1. **Khóa phiên bản trong suốt một lần thực hiện (In-Flight Version Pinning):**
   - Ngay khi một nhiệm vụ được giao cho người học, nhiệm vụ đó được khóa (pin) với phiên bản đề, tài nguyên đa phương thức và Rubric/Đặc tả tại thời điểm giao.
   - Nếu hệ thống cập nhật Rubric mới trong lúc người học đang làm bài dở, hệ thống không âm thầm đổi tiêu chí giữa chừng; nếu cần cập nhật do sửa lỗi thì áp dụng quy trình *Tái đánh giá có truy vết*.
2. **Chống ghi nhận trùng (Idempotency):**
   - Mỗi lần thực hiện bài làm, mỗi lượt thử sửa và mỗi sự kiện mở hỗ trợ đều có **Mã định danh duy nhất (Idempotency Key)**.
   - Khi mạng lỗi phải gửi lại yêu cầu (retry), người học bấm đúp, hoặc kết quả từ mô hình trả về muộn, hệ thống đảm bảo không cộng trùng bằng chứng và không chuyển trạng thái hai lần.

---

## 5. Cơ chế Thoát An toàn (Safe Fallback) & Kiểm soát Giới hạn Retry

### A. Ngân sách Thử lại Hai Tầng (Dual-Level Retry Budget)
- Có giới hạn số lần thử lại cho **từng bước đơn lẻ** VÀ giới hạn tổng cho **toàn bộ luồng Workflow** (đồng thời tuân thủ trần tối đa 2 vòng sửa/sinh lại nhiệm vụ của Phần 1), tránh việc mỗi mắt xích thử lại nhiều lần làm tổng độ trễ tăng vọt.

### B. Điều kiện Bắt buộc khi Fallback về Ngân hàng Nội dung Đã Kiểm Định
Khi luồng sinh/kiểm duyệt nhiệm vụ mới thất bại hoặc quá thời gian chờ, bài lấy từ Ngân hàng dự phòng phải thỏa mãn đủ **5 điều kiện**:
1. Đúng mục tiêu kỹ năng và đủ phạm vi đo.
2. Đúng chế độ làm bài và đúng loại ràng buộc (*Ràng buộc tình huống* vs *Chỉ định cấu trúc*).
3. Phù hợp với quỹ thời gian thực tế.
4. **Đảm bảo tính mới với người học:** Người học chưa từng làm hoặc xem đề/đáp án của bài đó trước đây.
5. Có đầy đủ tài nguyên audio/hình ảnh đang hoạt động tốt.
- *Nếu trong ngân hàng dự phòng không có bài nào thỏa mãn đủ 5 điều kiện trên:* Hệ thống giữ trạng thái `Chờ kiểm chứng` cho kỹ năng đó và chọn một nhiệm vụ hợp lệ khác cho buổi học, **tuyệt đối không lấy đại một bài không khớp điều kiện chỉ vì nó có sẵn trong ngân hàng**.

### C. Bảo toàn Nhận định theo Quan hệ Phụ thuộc trong Luồng Đánh giá
- Khi một nhánh đánh giá gặp lỗi kỹ thuật hoặc độ tin cậy thấp, hệ thống **chỉ bảo toàn những nhận định không phụ thuộc vào phần bị lỗi**:
  - *Ví dụ 1:* Lỗi công cụ phân tích phổ âm thanh không ảnh hưởng đến việc đánh giá từ vựng/ngữ pháp từ những đoạn văn bản đã xác thực rõ.
  - *Ví dụ 2:* Nếu phát hiện **đáp án chuẩn (Answer Key)** của một câu hỏi có lỗi, thì cả *Kết quả câu hỏi* lẫn mọi *Giả thuyết chẩn đoán* bắt nguồn từ câu hỏi đó đều phải bị thu hồi/xem xét lại.
- Tín hiệu độ tự tin thấp của bộ chấm (`evaluator_confidence`) được dùng để kích hoạt bước hỏi làm rõ, chuyển sang Agent Thẩm định lại, hoặc giới hạn nhận định về `Chưa đủ khả năng kết luận` (không áp đặt một con số ngưỡng cứng chung cho mọi loại nhiệm vụ khi chưa kiểm định thực nghiệm).

---

## 6. Quy trình Mở rộng, Đo lường Hiệu quả & Kịch bản Kiểm thử

### A. Quy trình Chuẩn 5 Bước khi Mở rộng Dạng bài / Kỹ năng Mới
*(Ví dụ: Bổ sung Writing General Training Task 1 - Viết thư)*
1. Thêm `Đặc tả kỹ năng` và `Rubric` mới vào nhóm *Tri thức chuẩn*.
2. Thêm hoặc cấu hình các `Skills` sinh đề thư, đánh giá thư và kiểm duyệt thư.
3. Gắn các Skills và gói tri thức mới vào các `Agents` tương ứng trong Danh mục cấu hình.
4. Thêm điều kiện định tuyến trong `Workflow / Rule Engine` theo mục tiêu General Training.
5. Chạy bộ tình huống kiểm thử hồi quy và phát hành phiên bản mới.
*(Lưu ý: Thêm dạng bài mới trên cùng loại bằng chứng thì không phải sửa lõi Hồ sơ năng lực; chỉ khi bổ sung một loại bằng chứng bản chất hoàn toàn mới thì việc mở rộng schema lõi mới cần thiết).*

### B. Bảy Nhóm Chỉ số Đánh giá Hiệu quả Kiến trúc
1. **Dễ mở rộng:** Thời gian thêm một dạng bài mới; số thành phần cũ bị ảnh hưởng; có phải sửa lõi Rule Engine hay không.
2. **Không phá chức năng cũ (Regression Safety):** Tỷ lệ tình huống kiểm thử cũ vẫn đạt sau khi nâng cấp Skill/Data/Model.
3. **Độ chính xác đánh giá:** Mức đồng thuận với bộ bài mẫu đã được chuyên gia thẩm định; tỷ lệ kết luận vượt quá bằng chứng thực tế.
4. **Bảo toàn tính độc lập:** Tỷ lệ rò rỉ gợi ý ở Bước 5/7A; tỷ lệ ghi nhận độc lập sai sau khi có hỗ trợ; tỷ lệ đếm trùng nguồn bằng chứng.
5. **Chất lượng Cổng kiểm duyệt:** Đo đồng thời **tỷ lệ đề lỗi lọt qua kiểm duyệt (False Acceptance)** và **tỷ lệ đề hợp lệ bị loại nhầm (False Rejection)** trên bộ đề đối chứng.
6. **Hiệu năng vận hành:** Độ trễ trung vị (P50) và nhóm chậm (P95); chi phí mỗi nhiệm vụ hoàn tất; số lần gọi mô hình và tỷ lệ retry.
7. **Khả năng truy vết (Auditability):** Xác định chính xác mọi nhận định được sinh ra từ phiên bản Agent, Skill, Rubric và dữ liệu đầu vào nào.

### C. Bộ Tình huống Kiểm thử Bắt buộc (Mandatory Edge-Case Test Suite)
Trước khi đưa vào vận hành, kiến trúc phải vượt qua 6 kịch bản kiểm thử chịu lỗi:
1. **Thiếu hoặc nhiễu một phần Audio:** Chỉ giới hạn nhận định phát âm/nghe ở đoạn nhiễu, không làm hỏng phần chấm văn bản hợp lệ.
2. **Mất Snapshot trước hỗ trợ:** Kết hợp nhật ký hiển thị gợi ý để khoanh vùng; phần không xác định được chuyển sang `Chưa rõ`.
3. **Người học hỏi lại đề hoặc xin thêm lượt ở Bước 5:** Không trừ oan lượt thử sửa, giữ nguyên trạng thái phiên khi tải lại trang.
4. **Đổi phiên bản Rubric khi đang làm bài & khi sửa lỗi chấm cũ:** Bài đang làm giữ nguyên phiên bản đã khóa; bài cũ được tái đánh giá tạo nhận định mới liên kết bản cũ mà không cộng trùng bằng chứng độc lập.
5. **Timeout / Lỗi ở Cổng kiểm duyệt:** Chuyển sang Ngân hàng dự phòng có kiểm tra đủ 5 điều kiện tương thích (hoặc giữ trạng thái chờ kiểm chứng nếu kho dự phòng hết bài mới).
6. **Gửi trùng yêu cầu / Kết quả AI về muộn:** Idempotency Key chặn đứng việc cộng hai lần bằng chứng.

---

## 7. Lộ trình Phát triển 4 Giai đoạn & Đồng bộ với Phần 1–6 / 06A

### A. Lộ trình Triển khai Thực tế (Đã đồng bộ với Phần 6 & Phụ lục 06A)
- **Giai đoạn 1 — Chốt nền tảng Dữ liệu, Hàng đợi & Hợp đồng Adapter:** Thiết lập SQLite schema, quản lý phiên bản JSON bất biến, phân quyền ngữ cảnh, khóa chống trùng, liên kết truy vết, cùng hợp đồng `providerAdapter` (gọi CLI thuê bao `codex`, `claude-code`, `gemini-cli`) và chốt chặn `subscriptionGuard`.
- **Giai đoạn 2 — `Builder & QC Console` tối thiểu + Một vòng học hoàn chỉnh (End-to-End Slice):** Đưa `Builder & QC Console` tối thiểu lên sớm để chạy gói tri thức, xem QC, phát hành/ngừng sử dụng; triển khai trọn vẹn 1 vòng lặp Writing + 1 luồng Reading có *Giải mù* + các tình huống mẫu có *Audio*.
- **Giai đoạn 3 — Kiểm chứng Đa nhà cung cấp & Khả năng mở rộng:** Bổ sung đầy đủ các Adapter CLI thuê bao, kiểm thử chuyển hãng khi hết hạn mức (`QUOTA_EXHAUSTED` khác với lỗi sư phạm, bảo toàn nguồn xử lý và không cộng trùng bằng chứng độc lập), thêm dạng nhiệm vụ mới và đo kiểm thử hồi quy.
- **Giai đoạn 4 — Tối ưu Ngữ cảnh, Theo dõi Hằng ngày & Công cụ nâng cao:** Hoàn thiện tra cứu SQLite FTS/BM25, bộ nhớ đệm (`result_cache`), `Daily Tracker`, đề xuất điều chỉnh lịch có phiên bản và các công cụ quản trị nâng cao.

### B. Quy tắc Ánh xạ & Đồng bộ với Phần 1–3, 5, 6
- `Đặc tả kỹ năng (Skill Specification)` ở Phần 2 thuộc nhóm **Tri thức chuẩn (Canonical Knowledge)** của Phần 4 & 5.
- `Kho Bằng chứng Thực hiện (Performance Evidence Store)` ở Phần 2 thuộc nhóm **Dữ liệu người học (Learner Data)** trong SQLite của Phần 4 & 6.
- Cơ chế `Giải mù trước – Đối chiếu sau` ở Phần 3 được thực thi trực tiếp bởi cơ chế **Cấp ngữ cảnh cô lập theo từng lần thực thi (kèm thư mục Sandbox sạch cho CLI)** của Phần 4 & Phụ lục 06A.
- `Workflow` được điều khiển ở tầng ứng dụng (ngoài quyền quyết định của AI); sử dụng `fencing_token / attempt_generation` để chặn kết quả trả về muộn ghi đè trạng thái.
