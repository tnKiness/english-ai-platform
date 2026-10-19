# PHẦN 1: MÔ HÌNH & LUỒNG HỌC TẬP KHÉP KÍN CÓ KIỂM CHỨNG (CLOSED-LOOP LEARNING)

> **Trạng thái:** ĐÃ CHỐT (v1.3 — theo Nhật ký Tối ưu Chéo bên dưới)
> **Nguyên tắc đồng bộ:** Mọi phân hệ tính năng, cấu trúc dữ liệu, bộ Skill AI và Cơ sở tri thức ở các phần sau bắt buộc phải tuân thủ nghiêm ngặt luồng vận hành và các nguyên tắc đo lường trong tài liệu này. Nếu quá trình thiết kế các phần sau phát hiện điểm cần tinh chỉnh ngược lại Phần 1, phải ghi rõ vào mục *Nhật ký Tối ưu Chéo (Changelog)*.

---

## 1. Triết lý Cốt lõi & Nguyên tắc Đánh giá Xuyên suốt

Để giải quyết tình trạng đứt gãy giữa **Học kiến thức – Luyện tập – Chấm chữa – Khắc phục điểm yếu – Theo dõi tiến độ**, nền tảng được thiết kế theo mô hình **Closed-Loop Learning (Vòng lặp học tập khép kín có kiểm chứng)**.

Trong mô hình này, AI đóng vai trò gia sư: xác định nhu cầu học, hướng dẫn người học nhận ra và tự sửa lỗi, cung cấp kiến thức và bài tập phù hợp, sau đó kiểm tra khả năng vận dụng độc lập. Kết quả kiểm tra được dùng để cập nhật hồ sơ năng lực và điều chỉnh bước học tiếp theo.

### Nguyên tắc Đo lường Cốt lõi (3 Mức Kết Quả Khác Nhau)
Hệ thống tách bạch và ghi nhận riêng biệt 3 mức kết quả, tuyệt đối không đánh đồng:
1. **Đã xem lời giải (Passive Exposure):** Người học mới chỉ đọc đáp án/giải thích của AI.
2. **Đã sửa đúng khi có gợi ý (Scaffolded Repair):** Người học tự sửa được lỗi khi có sự dẫn dắt, khoanh vùng hoặc nhắc kiến thức từ AI.
3. **Đã tự làm được độc lập (Independent Transfer):** Người học tự thực hiện đúng trong một nhiệm vụ mới, khác ngữ cảnh và hoàn toàn không có trợ giúp.

---

## 2. Sơ đồ Tổng thể Luồng Học Tập 9 Bước

```
[1. Xác định mục tiêu & Đánh giá năng lực ban đầu]
    (Thực hiện khi bắt đầu hoặc khi đổi mục tiêu -> Tạo Hồ sơ năng lực sơ bộ)
                         ↓
[2. Giao nhiệm vụ học / luyện tập phù hợp (Đã qua Cổng Kiểm Duyệt AI)]
    (Gắn với 1 trong 3 Chế độ: Học có hướng dẫn | Tự luyện | Thi thử)
                         ↓
[3. Người học thực hiện & Hệ thống thu thập bằng chứng quá trình]
    (Lưu bài làm, thời gian, bản ghi/lịch sử sửa, chi tiết phần AI đã hỗ trợ)
                         ↓
[4. Đánh giá kết quả & Chẩn đoán điểm cần cải thiện]
    (Phân biệt: Biểu hiện -> Nguyên nhân giả định -> Bằng chứng xác nhận)
    (Chọn 2–3 trọng tâm ưu tiên hoặc 1 nếu phức tạp; các lỗi khác vẫn lưu để xem)
                         ↓
       ┌─────────────────┼─────────────────┐
       ↓ (Lỗi sơ suất)   ↓ (Cần khắc phục) ↓ (Đã làm tốt)
[Nhắc nhẹ & Tự sửa]  [5. Phản hồi có hướng dẫn → Người học tự sửa]
       │                 (Mặc định tối đa 2 lượt gợi mở; có nút chọn "Giải thích trực tiếp"
       │                  hoặc "Để mình thử thêm" + Câu kiểm tra hiểu khi cần)
       │                 ↓
       │             [6. Bổ sung kiến thức & Luyện tập có mục tiêu (Qua Cổng Kiểm Duyệt)]
       │                 (Tùy chỉnh theo 4 nhóm nhu cầu chẩn đoán)
       │                 ↓
       │             [7A. Kiểm tra khả năng vận dụng độc lập - Nhiệm vụ ngắn]
       │                 (Bài mới, khác ngữ cảnh, không gợi ý, chế độ Tự luyện)
       └─────────────────┼─────────────────┘
                         ↓
[8. Cập nhật Hồ sơ năng lực, Sổ lỗi & Điều chỉnh Lộ trình]
    (Chuỗi trạng thái: Cần hỗ trợ -> Tự sửa khi có gợi ý -> Vận dụng bước đầu (7A)
     -> Vận dụng trong bài tổng hợp (7B) -> Duy trì ổn định (Bước 9))
                         ↓
[7B & 9. Kiểm tra vận dụng trong bài tổng hợp (7B) & Kiểm tra duy trì theo thời gian (9)]
    (Qua bài ôn riêng HOẶC Kiểm tra duy trì tích hợp trong bài làm mới dựa trên "Cơ hội sử dụng")
                         ↺
             Quay lại nhiệm vụ phù hợp tiếp theo (Bước 2)
```

---

## 3. Chi tiết Quy tắc Vận hành Từng Bước

### Bước 1: Xác định mục tiêu và đánh giá năng lực ban đầu
* **Dữ liệu thu thập:** Band mục tiêu tổng, yêu cầu từng kỹ năng (Listening, Reading, Writing, Speaking), thời hạn (ngày thi dự kiến) và quỹ thời gian học thực tế mỗi ngày/tuần.
* **Đánh giá ban đầu:** Kết hợp thông tin mục tiêu với bài đánh giá ngắn đầu vào để hình thành **Hồ sơ năng lực sơ bộ**.
* **Phạm vi áp dụng:** Bài đánh giá ngắn chỉ dùng để định hướng ban đầu; hệ thống liên tục cập nhật nhận định khi có thêm bài làm thực tế. Bước này chỉ thực hiện khi mới bắt đầu hoặc khi người học thay đổi mục tiêu, không lặp lại đầy đủ trong mỗi buổi học.

### Bước 2: Giao nhiệm vụ phù hợp & Thiết lập chế độ làm bài
Dựa trên hồ sơ năng lực hiện tại, hệ thống lựa chọn nhiệm vụ: *học kiến thức nền, luyện một kỹ năng nhỏ, làm bài tổng hợp, hoặc kiểm tra định kỳ*.
* **Tính minh bạch của nhiệm vụ:** Mỗi nhiệm vụ khi giao phải nêu rõ 3 thông tin cho người học:
  1. Người học đang luyện điều gì.
  2. Vì sao nội dung đó được ưu tiên ở thời điểm này.
  3. Kết quả/tiêu chí nào cho thấy đã đạt mục tiêu.
* **Ba chế độ thực hiện (Execution Modes):**

| Chế độ | Mức hỗ trợ | Mục đích |
| :--- | :--- | :--- |
| **1. Học có hướng dẫn (Guided)** | Gợi mở, ví dụ, hỗ trợ từng mức trước và trong khi làm | Tiếp cận kiến thức hoặc kỹ năng chưa vững |
| **2. Tự luyện (Self-Practice)** | Không trợ giúp trong lúc làm; thời gian linh hoạt | Kiểm tra khả năng tự vận dụng (phù hợp cho Bước 7A) |
| **3. Thi thử (Exam Mode)** | Không trợ giúp; điều kiện thời gian chuẩn theo bài thi | Kiểm tra năng lực thực chiến trong điều kiện phòng thi |

* **Quy tắc bảo toàn bằng chứng:** Gợi ý phải phù hợp với kỹ năng đang đánh giá. Nếu mục tiêu là đánh giá khả năng *tự phát triển ý* mà AI đã đưa sẵn cả dàn ý, bài làm đó không còn cung cấp đủ bằng chứng về khả năng tự phát triển ý. Hệ thống bắt buộc phải ghi nhận **chi tiết AI đã hỗ trợ ở phần nào/kỹ năng con nào**, không chỉ ghi chung chung là "có hỗ trợ".

### Bước 3: Thu thập bài làm và bằng chứng về quá trình thực hiện
* **Dữ liệu quá trình (Process Evidence):** Ngoài đáp án hoặc bài viết cuối cùng, hệ thống ghi nhận:
  * Thời gian làm bài thực tế.
  * Số lần và loại gợi ý đã sử dụng (chi tiết theo từng vi kỹ năng).
  * Bản ghi âm (với Speaking) và lịch sử các lần chỉnh sửa (Draft history).
* **Truy vấn làm rõ tư duy (Targeted Probing):** Khi cần làm rõ nguyên nhân sai (ví dụ: không rõ người học chọn sai đáp án Reading vì hiểu sai từ vựng hay bị mắc bẫy suy diễn), AI hỏi ngắn gọn cách người học suy nghĩ hoặc lý do chọn đáp án. **Tuyệt đối không bắt người học giải thích mọi câu**, tránh làm gián đoạn mạch luyện tập.

### Bước 4: Đánh giá kết quả và chẩn đoán điểm cần cải thiện
AI xác định điểm làm tốt, các lỗi quan sát được và những hạn chế ảnh hưởng đến chất lượng bài làm.
* **Cấu trúc chẩn đoán 3 tầng:**
  1. **Biểu hiện (Symptom):** Người học đã sai hoặc còn hạn chế cụ thể ở đâu trong bài.
  2. **Nguyên nhân giả định (Hypothesis):** Điều gì có thể dẫn đến hạn chế đó (VD: thiếu ví dụ trong đoạn Writing có thể do *chưa hiểu cách phát triển ý*, *thiếu từ vựng để diễn đạt*, hoặc *hết thời gian*).
  3. **Bằng chứng xác nhận (Verification Evidence):** Câu hỏi ngắn, dữ liệu quá trình (như thời gian làm bài), hoặc bài kiểm tra ngắn giúp xác nhận đúng nguyên nhân.
* **Quy tắc ưu tiên phục vụ luyện IELTS (Dynamic Prioritization Rule):**
  * Không xếp cứng loại lỗi nào luôn ưu tiên cao hay thấp chỉ dựa vào tên lỗi (ví dụ: sai mạo từ 1 lần chỉ cần nhắc, nhưng sai mạo từ liên tục toàn bài cần luyện riêng ngay; sai thì làm người đọc hiểu sai trình tự sự kiện là vấn đề lớn; từ vựng đơn giản nhưng chính xác không mặc nhiên là điểm yếu cần ép nâng cấp).
  * Công thức chọn vấn đề ưu tiên:
    $$\text{Mức ưu tiên} = \text{Ảnh hưởng đến chất lượng bài} + \text{Tần suất/Phạm vi xuất hiện} + \text{Mức liên quan mục tiêu hiện tại} + \text{Độ chắc chắn của chẩn đoán}$$
  * **Giới hạn trọng tâm:** Mặc định chọn **2–3 trọng tâm** mỗi lượt học (hoặc **chỉ chọn 1** nếu đó là vấn đề phức tạp). Các lỗi khác vẫn được lưu lại và cho phép người học mở xem đầy đủ, không bị bỏ qua.

### Bước 5: Phản hồi có hướng dẫn và cho người học tự sửa
* **Chuỗi hỗ trợ bậc thang (Scaffolded Feedback):**
  `Chỉ ra vấn đề` $\rightarrow$ `Đặt câu hỏi gợi mở` $\rightarrow$ `Nhắc kiến thức liên quan` $\rightarrow$ `Đưa mẫu sửa và giải thích khi cần`.
* **Quy tắc lượt thử & Quyền chủ động của người học:**
  * Người học được thử tự sửa trước khi xem lời giải đầy đủ.
  * **Mặc định tối đa 2 lượt thử có gợi ý** để tránh kéo dài gây mệt mỏi, nhưng luôn hiển thị tùy chọn để người học chủ động bấm **“Giải thích trực tiếp”** (nếu muốn xem ngay) hoặc **“Để mình thử thêm”** (nếu vẫn muốn tự suy nghĩ).
  * **Không kết luận vội vàng:** Sửa sai 2 lần không đồng nghĩa chắc chắn là người học "chưa hiểu kiến thức" (vì có thể do gợi ý chưa rõ, đề mơ hồ, AI đánh giá lệch hoặc người học đang mệt).
  * Nếu sau hỗ trợ vẫn chưa đạt: AI đưa lời giải và giải thích ngắn; hệ thống ghi nhận trạng thái trung gian là **“Chưa tự sửa được với hỗ trợ hiện tại”**, sau đó dùng **1 câu kiểm tra hiểu (Concept-Check Question)** để quyết định chính xác nhánh hỗ trợ ở Bước 6.
* **Giá trị của kết quả Bước 5:** Chỉ thể hiện *khả năng sửa khi có hướng dẫn*, chưa đủ để kết luận đã thành thạo.

### Bước 6: Bổ sung kiến thức và luyện tập có mục tiêu
Dựa trên chẩn đoán (Bước 4) và kết quả tự sửa + câu kiểm tra hiểu (Bước 5), hệ thống phân luồng hỗ trợ:

| Nhu cầu được xác định | Cách hỗ trợ tương ứng |
| :--- | :--- |
| **1. Chưa hiểu kiến thức** | Bài học ngắn (Micro-lesson), ví dụ minh họa và câu hỏi kiểm tra hiểu |
| **2. Hiểu nhưng áp dụng chưa ổn định** | Bài luyện tập trung vào điểm yếu, giảm dần mức độ gợi ý (Fading Scaffolding) |
| **3. Làm được riêng lẻ nhưng sai trong bài đầy đủ** | Bài vận dụng đặt trong ngữ cảnh đoạn/bài hoặc có giới hạn thời gian |
| **4. Đã làm tốt** | Chuyển sang nội dung khó hơn hoặc lên lịch ôn tập duy trì |

* *Lưu ý về số lượng bài tập:* Bài tập được chọn từ ngân hàng đã kiểm định hoặc do AI sinh mới (qua Cổng kiểm duyệt). Không mặc định mọi lỗi đều ép làm 5–10 câu máy móc.

### Bước 7: Kiểm tra khả năng vận dụng độc lập (Tách 7A và 7B)
Để đảm bảo vòng học vừa sức mà vẫn đo lường chuẩn xác:
* **Bước 7A — Kiểm tra vận dụng trong nhiệm vụ ngắn (Immediate Micro-Transfer):**
  * Thực hiện ở chế độ **Tự luyện** (không gợi ý, không áp lực thời gian thi), với ngữ cảnh/nội dung mới đủ khác biệt để tránh việc người học chỉ nhớ đáp án hoặc chép lại mẫu vừa xem.
  * **Độ rộng nhiệm vụ:** Phải đủ để bộc lộ kỹ năng đang đo (mốc 2–3 phút chỉ là gợi ý cho các lỗi cục bộ; với kỹ năng tổ chức đoạn văn thì nhiệm vụ phải đủ độ dài tương ứng, không dùng 2 câu rời rạc để đo khả năng liên kết toàn bài).
  * **Mức kết luận sau 7A:** Vì làm ngay sau khi chữa vẫn chịu ảnh hưởng của trí nhớ ngắn hạn, nếu đạt ở 7A thì hệ thống ghi nhận: **“Đã vận dụng bước đầu trong nhiệm vụ ngắn, không có gợi ý”** (chưa khẳng định kỹ năng đã ổn định).
  * Nếu chưa đạt ở 7A: Xem lại chẩn đoán, đổi cách giải thích hoặc giảm độ khó.
* **Bước 7B — Kiểm tra vận dụng trong bài tổng hợp (Integrated Transfer):**
  * Diễn ra ở **bài tổng hợp phù hợp tiếp theo** (không bắt buộc phải làm ngay trong buổi học đó hay ngay buổi kế tiếp nếu buổi kế tiếp học kỹ năng khác).
  * Một lần đạt 7B là thêm bằng chứng về khả năng vận dụng trong bài tổng hợp; mức độ ổn định cần được củng cố qua nhiều lần.

### Bước 8: Cập nhật hồ sơ năng lực, sổ lỗi và lộ trình
Hệ thống lưu tiến trình theo từng kỹ năng nhỏ (Micro-skills), bao gồm: điểm mạnh, điểm cần cải thiện, mức hỗ trợ đã dùng và bằng chứng từ bài làm.
* **Chuỗi trạng thái năng lực chuẩn:**
  `Cần hỗ trợ` $\rightarrow$ `Tự sửa được khi có gợi ý (Bước 5)` $\rightarrow$ `Đã vận dụng bước đầu trong nhiệm vụ ngắn (Bước 7A)` $\rightarrow$ `Vận dụng được trong bài tổng hợp (Bước 7B)` $\rightarrow$ `Duy trì ổn định (Bước 9)`.
* **Nguyên tắc điều chỉnh lộ trình:** Dựa trên nhiều bằng chứng tích lũy, mức độ ưu tiên và quỹ thời gian thực tế. Không đảo lộn toàn bộ kế hoạch học chỉ vì một bài làm bất thường.

### Bước 9: Ôn tập và kiểm tra duy trì theo thời gian
* **Phân biệt mục đích Bước 7B và Bước 9:**
  * **7B trả lời câu hỏi:** *Người học có vận dụng được kỹ năng đó khi đặt vào một bài tổng hợp phức tạp không?*
  * **Bước 9 trả lời câu hỏi:** *Sau một khoảng thời gian (Spaced Interval), người học có còn nhớ và vận dụng đúng kỹ năng đó không?*
  * *(Một bài làm tổng hợp ở thời điểm phù hợp có thể đồng thời cung cấp bằng chứng cho cả 7B và Bước 9 nếu đáp ứng đủ điều kiện).*
* **Quy tắc "Cơ hội sử dụng" (Opportunity-to-Use) khi Kiểm tra duy trì tích hợp trong bài làm:**
  Tránh suy luận sai lầm rằng *"Không thấy lỗi cũ xuất hiện nghĩa là đã khắc phục xong"* (vì người học có thể vô tình hoặc cố tình không dùng cấu trúc đó trong bài mới). Hệ thống phân tách 3 kết quả quan sát:

| Kết quả quan sát trong bài làm mới | Cách xử lý của hệ thống |
| :--- | :--- |
| **1. Có cơ hội sử dụng và dùng đúng, không được gợi ý** | Bổ sung bằng chứng duy trì; giãn lịch ôn tập và chuyển thời gian sang nội dung cần thiết hơn |
| **2. Có cơ hội sử dụng nhưng tiếp tục sai** | Cập nhật lại điểm yếu và mở lại vòng khắc phục phù hợp |
| **3. Không có đủ cơ hội quan sát** | Giữ nguyên trạng thái "Chờ kiểm tra"; chưa kết luận. *(Nếu qua nhiều bài liên tiếp vẫn chưa có cơ hội quan sát hoặc người học có xu hướng né tránh cấu trúc đó $\rightarrow$ Hệ thống chủ động giao một câu hỏi ôn hoặc nhiệm vụ có ràng buộc để kiểm tra trực tiếp)* |

* **Tính linh hoạt của vòng lặp (Fast-track):** Không phải bài làm nào cũng phải đi qua đủ 9 bước. Một lỗi sơ suất (Slip) chỉ cần tự sửa nhanh rồi tiếp tục; một lỗ hổng kiến thức mới cần đi trọn vòng 5–6–7; một kỹ năng đã vững chuyển thẳng sang lịch kiểm tra duy trì.

---

## 4. Cổng Kiểm Duyệt Nhiệm Vụ Do AI Sinh (AI Task Quality Gate)

Cổng kiểm duyệt này áp dụng **bắt buộc** cho mọi nhiệm vụ mới do AI sinh ra tại: **Bước 2** (Nhiệm vụ học), **Bước 6** (Bài luyện khắc phục), **Bước 7A/7B** (Bài kiểm tra vận dụng) và **Bước 9** (Bài ôn duy trì).

```
[Yêu cầu luyện tập gốc + Trạng thái năng lực hiện tại + VAI TRÒ CỦA BÀI (Bài dạy / Bài luyện / Bài kiểm tra)]
                                              ↓
                                     [AI Sinh Nhiệm Vụ]
                                              ↓
           [AI Kiểm Duyệt Độc Lập (Quality Gate):
            1. Đúng mục tiêu kỹ năng cần đo/rèn và đủ độ rộng nhiệm vụ để bộc lộ kỹ năng chưa?
            2. Đúng nội dung và đúng độ khó theo điều kiện mục tiêu chưa?
            3. Đáp án (Answer Key) và Tiêu chí đánh giá (Rubric) có hợp lệ, không mơ hồ không?
            4. Đúng VAI TRÒ CỦA BÀI chưa?
               - Với Bài kiểm tra (7A/7B/9): Đề có vô tình lộ phần quyết định mà người học cần tự thực hiện không?
               - Phân biệt rõ đề dùng "Ràng buộc tình huống/ý nghĩa" (đo được cả khả năng tự chọn lẫn thực hiện)
                 với đề "Chỉ định cấu trúc" (chỉ đo được khả năng thực hiện khi đã được chỉ định).]
                                              ↓
                    ┌─────────────────────────┴─────────────────────────┐
                    ↓ (Đạt chuẩn)                                       ↓ (Chưa đạt)
       [Giao nhiệm vụ cho người học]            [Yêu cầu AI sửa / sinh lại (Tối đa 2 vòng)
                                                 Hoặc Fallback lấy từ Ngân hàng bài tập chuẩn]
```

---

## 5. Các Nguyên tắc Bảo toàn Giá trị Bằng chứng (Đồng bộ với Phần 2 & Phần 3)

1. **Phân biệt 3 tầng kết luận (Kết quả bài làm $\neq$ Năng lực vi kỹ năng $\neq$ Điểm IELTS ước lượng):** Điểm số hoặc kết quả đúng/sai của một câu hỏi hay một bài làm đơn lẻ không tự động đồng nghĩa với việc người học đã đạt (hoặc mất) một trạng thái năng lực; và bài luyện/kiểm tra phạm vi hẹp chỉ đưa ra phản hồi kỹ năng chứ không quy đổi trực tiếp sang Band điểm IELTS. Hệ thống chỉ đưa ra loại kết luận phù hợp với mức kiểm định và phạm vi thực tế của nhiệm vụ. Mọi nhận định đều không được mạnh hơn bằng chứng thực tế; khi biểu hiện quan sát được chưa đủ rõ, hệ thống ghi nhận **`Chưa đủ bằng chứng / Chưa kết luận được`**.
2. **Chất lượng dữ liệu và phép đo có thể giới hạn nhận định:** Nếu chất lượng âm thanh thu vào, kết quả nhận diện giọng nói (ASR), đề bài hoặc công cụ chấm ở một phần bài làm chưa đủ độ tin cậy, hệ thống tự động giới hạn các nhận định phụ thuộc vào phần dữ liệu đó (kể cả bảo vệ hai chiều: không hạ năng lực và cũng không công nhận đạt ảo dựa trên câu hỏi lỗi) thay vì kết luận sai cho người học.
3. **Đánh giá hỗ trợ theo nội dung thực tế, thời điểm dùng & điều kiện giảm tải:**
   - Phạm vi ảnh hưởng của gợi ý phụ thuộc vào nội dung hỗ trợ thực tế (kể cả ảnh hưởng gián tiếp) và thời điểm người học mở hỗ trợ. Phần bài làm người học đã tự thực hiện trước khi mở hỗ trợ được bảo toàn giá trị riêng.
   - Làm đúng một kỹ năng khi đã được hỗ trợ ở phần khác (hoặc khi nghe đoạn âm thanh đã được khoanh sẵn, đọc kèm transcript) được ghi nhận đúng theo **điều kiện giảm tải tương ứng**, không đánh đồng với năng lực độc lập toàn phần.
4. **Giữ giới hạn trọng tâm ưu tiên và quyền chủ động của người học:** Luôn duy trì giới hạn 2–3 trọng tâm ưu tiên (hoặc 1 nếu phức tạp) để tránh quá tải, đồng thời tôn trọng quyền chọn cách nhận phản hồi (*Thử sửa thêm* hoặc *Xem giải thích trực tiếp*) của người học ở Bước 5.
5. **Thận trọng khi kết luận "Sơ suất", "Học thuộc lòng", "Né tránh" hoặc "Tái phát":**
   - Tự sửa đúng ngay ở Bước 5 mới chỉ ghi nhận là *“Có thể là sơ suất / Cần kiểm tra thêm”*.
   - Có dấu hiệu dùng câu khuôn mẫu đúng ngữ cảnh chỉ giới hạn kết luận về *độ linh hoạt*, không tự động tạo lỗi hay hạ năng lực.
   - Không xuất hiện cấu trúc trong bài mới chỉ ghi nhận là *“Không đủ cơ hội quan sát thực tế”*.
   - Một lần sai hoặc không tự sửa được đơn lẻ chưa đủ để hạ cấp năng lực hay kết luận *“Tái phát”*.

---

## 6. Nhật ký Tối ưu Chéo (Retroactive Optimization Log)
- **v1.0 (16/10/2026):** Chốt mô hình 9 bước, 3 chế độ làm bài, công thức ưu tiên động 4 chiều, cơ chế tự sửa linh hoạt kèm câu hỏi kiểm tra hiểu, tách 7A/7B, điều kiện cơ hội sử dụng ở Bước 9 và Cổng kiểm duyệt nhiệm vụ AI sinh.
- **v1.1 (16/10/2026 - Đồng bộ từ Phần 2):** Bổ sung nguyên tắc không kết luận vượt quá bằng chứng, cho phép trạng thái `Chưa đủ bằng chứng`, đánh giá phạm vi gợi ý theo nội dung thực tế & điều kiện giảm tải, làm mềm kết luận về sơ suất/tái phát, và phân biệt *Ràng buộc tình huống/ý nghĩa* vs *Chỉ định cấu trúc* tại Cổng kiểm duyệt.
- **v1.2 (16/10/2026 - Đồng bộ từ Phần 3):** Bổ sung nguyên tắc phân biệt điểm bài làm với kết luận năng lực, giới hạn nhận định theo chất lượng dữ liệu/phép đo (Audio/ASR/Rubric), bảo toàn phần bài làm trước thời điểm mở hỗ trợ, và áp dụng Cổng kiểm duyệt (kèm cơ chế giải mù trước khi đối chiếu) cho đầy đủ Bước 2, 6, 7A, 7B, 9.
- **v1.3 (19/10/2026 - Đồng bộ từ Phần 5):** Tách rõ 3 tầng kết luận (*Kết quả bài làm*, *Năng lực vi kỹ năng*, *Điểm IELTS ước lượng*) gắn với mức kiểm định và phạm vi nhiệm vụ; bổ sung nguyên tắc bảo vệ hai chiều (cả tăng và giảm năng lực) khi phát hiện câu hỏi/đề bài lỗi.
