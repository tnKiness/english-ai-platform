# PHẦN 6: TRẢI NGHIỆM NGƯỜI DÙNG (UX/UI FLOW) & KIẾN TRÚC KỸ THUẬT TRIỂN KHAI

> **Trạng thái:** ĐÃ CHỐT (v1.0)
> **Định hướng cốt lõi:** Một ứng dụng cá nhân (Single-User, Desktop-First), hai chế độ sử dụng (**Học tập** và **Builder & QC**) dùng chung một hồ sơ và một cơ sở dữ liệu cục bộ. Giảm tối đa công sức vận hành và sự phức tạp giao diện, nhưng giữ nguyên vẹn ranh giới dữ liệu giữa các vai trò AI, giữa đề và đáp án, giữa luyện tập có hỗ trợ và kiểm chứng độc lập đã chốt ở Phần 1–5.
> *(Chi tiết cơ chế gọi AI qua CLI thuê bao, tối ưu ngữ cảnh và theo dõi học hằng ngày được quy định tại phụ lục đi kèm: [06A_AI_Thue_Bao_Toi_Uu_Ngu_Canh_Va_Daily_Tracking.md](06A_AI_Thue_Bao_Toi_Uu_Ngu_Canh_Va_Daily_Tracking.md)).*

---

## 1. Định hướng Hệ thống: Ứng dụng Cá nhân, Hai Chế độ Sử dụng

1. **Phạm vi người dùng:** Bạn đồng thời là người xây dựng, người QC và người học duy nhất, ưu tiên sử dụng trên máy tính cá nhân.
2. **Những gì lược bỏ để giảm gánh nặng vận hành:** Không xây dựng hệ thống quản lý nhiều tài khoản người học (multi-tenant), phân quyền tổ chức nhiều cấp, microservices rời rạc hay bảng tổng quan (dashboard) nhiều biểu đồ trang trí.
3. **Những gì giữ bắt buộc 100%:**
   - Một Workspace học tập xuyên suốt các bước của vòng lặp.
   - Tách bạch hiển thị giữa *Kết quả bài làm*, *Năng lực vi kỹ năng* và *Band IELTS ước lượng*.
   - `Rule Engine` và điều khiển `Workflow` tách khỏi xử lý của AI.
   - Cô lập ngữ cảnh cấp phát cho AI (đặc biệt ở Pha Giải mù và các nấc gợi mở Bước 5).
   - Khả năng truy vết phụ thuộc, thu hồi bài lỗi và sao lưu/khôi phục dữ liệu bền vững.

---

## 2. Thiết kế UX Tối giản cho Chế độ Học tập

Thanh điều hướng chính của toàn bộ ứng dụng được thu gọn còn **3 mục**:
**`Học hôm nay`** · **`Tiến độ`** · **`Builder & QC`** *(Thiết lập mục tiêu học và Cài đặt AI nằm trong mục **`Cài đặt`**, nhập một lần và chỉnh sửa khi cần).*

### A. Màn hình 1: `Học hôm nay` (Điểm bắt đầu mỗi buổi học)
Không dùng trang tổng quan phức tạp; giúp người học vào thẳng nhiệm vụ nhanh nhất:
1. **Nút `Tiếp tục bài đang làm`:** Hiển thị nổi bật ngay đầu trang nếu có phiên học hoặc bước tự sửa đang dở từ trước.
2. **Thẻ Nhiệm vụ Đề xuất (Primary Task Card):** Hiển thị 1 nhiệm vụ ưu tiên kèm:
   - *Nội dung rèn luyện / kiểm chứng* (bao gồm cả bài học/luyện mới, bài kiểm tra ngắn `7A`, bài tổng hợp `7B` và bài ôn duy trì `Bước 9` đều xuất hiện tại đây với nhãn mục đích rõ ràng).
   - *Lý do được ưu tiên* (theo bộ điều phối 2 bước của Phần 2).
   - *Tiêu chí hoàn thành & Chế độ làm bài* (`Học có hướng dẫn` | `Tự luyện` | `Thi thử`).
3. **Quỹ thời gian hôm nay & Đổi nhiệm vụ:** Cho phép điều chỉnh nhanh quỹ thời gian buổi học hôm đó hoặc chọn một nhiệm vụ khác trong danh sách các nhiệm vụ hợp lệ đã được `Rule Engine` lọc.
4. **Banner Lịch đề xuất bổ sung (`Replanning Proposal`):** Khi có đề xuất điều chỉnh lịch do nghỉ học/thiếu giờ những ngày trước (chi tiết tại Phụ lục 06A), hiển thị gọn để bạn xem trước và bấm xác nhận.
5. Khi bấm bắt đầu $\rightarrow$ Mở thẳng vào **Workspace làm bài**.

### B. Màn hình 2: `Workspace làm bài` (Bố cục linh hoạt theo pha & chế độ)
Không chia cứng màn hình thành 2 cột 50/50 cố định:
1. **Phân bổ diện tích thông minh:**
   - Với Writing và Reading: Dành phần lớn diện tích màn hình cho khung soạn thảo bài viết hoặc văn bản bài đọc.
   - Khung Gia sư / Hỗ trợ có thể thu gọn hoặc mở rộng linh hoạt; khi đang ở chế độ **Thi thử**, ẩn hoàn toàn vùng hỗ trợ để tập trung tối đa diện tích cho bài làm.
2. **Một hành động chính tại mỗi thời điểm:**
   - Luồng nút hành động chính chuyển đổi tuần tự theo bước: **`Nộp bài`** $\rightarrow$ **`Gửi bản sửa`** $\rightarrow$ **`Làm bài kiểm chứng`**.
   - Các nút quyền chủ động của người học (*“Để mình thử thêm”*, *“Giải thích trực tiếp”*, *“Báo lỗi / Đề mơ hồ”*, *“Báo máy nghe nhầm”*) đặt ngay tại vị trí câu/vấn đề đang xử lý.
3. **Các cơ chế bảo vệ trải nghiệm thực dụng (Bắt buộc):**
   - **Tự động lưu (Auto-save):** Hiển thị rõ trạng thái `Đã lưu` hoặc `Chưa lưu được`; khi tải lại trang (F5) hoặc mở lại máy vẫn tiếp tục đúng bài, đúng nấc hỗ trợ và bản sửa đang gõ dở.
   - **Trạng thái xử lý AI minh bạch:** Hiển thị rõ trạng thái hàng đợi (`Đang xử lý`, `Đã chuyển nhà cung cấp`, `Chờ hạn mức thuê bao`, `Cần đăng nhập lại` hoặc `Có thể thử lại`) mà không làm mất bản nháp của người học; không đưa các thuật ngữ kỹ thuật CLI vào luồng làm bài thông thường.
   - **Bảo toàn dữ liệu gốc:** Bản nộp gốc được giữ riêng, các thao tác tự sửa ở Bước 5 không ghi đè làm mất bài nộp ban đầu. Với Speaking, lưu và hiển thị tách biệt `Audio gốc`, `Bản máy nhận diện (ASR)` và `Bản người học chỉnh sửa`.
4. **Ranh giới rõ ràng khi chuyển sang nhiệm vụ kiểm chứng `7A`:**
   - Dù vẫn nằm trong cùng Workspace để không phải chuyển trang rườm rà, nhưng khi bước vào bài `7A`, hệ thống phải mở ra một **lượt thực hiện mới có ranh giới rõ ràng**: đóng/ẩn hoàn toàn lời giải, gợi ý và bài vừa chữa trước đó (không mở bài kiểm chứng nằm cạnh lời giải vừa học).
   - Hệ thống kiểm tra tính mới thực sự và cấp ngữ cảnh mới độc lập (việc chỉ thu gọn khung lời giải trên giao diện không tự biến một bài đã lộ đáp án thành bài mới).

### C. Màn hình 3: `Tiến độ` (Gọn ở mặc định – Sâu khi mở chi tiết)
- **Mặc định:** Chỉ hiển thị gọn các kỹ năng đang ưu tiên, trạng thái hiện tại và các hạng mục sắp đến hạn kiểm chứng tiếp theo.
- **Khi bấm xem chi tiết một kỹ năng hoặc điểm yếu:** Mới mở đầy đủ 4 thành phần Hồ sơ năng lực (*Trạng thái năng lực, Độ tin cậy, Trạng thái kiểm chứng, Phạm vi đã chứng minh*), các bản ghi trong Kho bằng chứng và danh sách các giả thuyết nguyên nhân đang theo dõi trong Sổ lỗi.

---

## 3. Thiết kế `Builder & QC Console` (Xử lý Ngoại lệ, Không Duyệt Tay Toàn Bộ)

Giao diện `Builder & QC` được tổ chức thành **3 tab nhỏ**, mặc định chỉ làm nổi bật những việc thực sự cần bạn can thiệp (*gói tri thức bị chặn, lỗi ảnh hưởng đến kết quả học, hoặc ngân hàng hết bài kiểm chứng hợp lệ*):

| Tab trong Console | Nội dung hiển thị & Thao tác chính |
| :--- | :--- |
| **1. `Gói tri thức`** | • Tạo/xem *Phiếu yêu cầu xây gói*, theo dõi tiến độ chạy Pipeline 6 bước.<br>• Xem trạng thái Cổng QC 4 tầng (`Đạt` / `Chưa đạt` / `Chưa chạy`), báo cáo thiếu phủ (*Coverage gap*) và quản lý phiên bản phát hành.<br>• **Quy tắc nút `Phát hành`:** Chỉ được bật khi toàn bộ các kiểm tra bắt buộc đã đạt trên **đúng phiên bản và tài nguyên sẽ phát hành** (nếu sửa nội dung sau khi QC thì kết quả QC cũ hết hiệu lực, bắt buộc chạy kiểm tra lại). |
| **2. `Cần xử lý`** | • Danh sách các vấn đề/ngoại lệ cần chú ý, kèm mức độ ảnh hưởng (số bài nộp/nhận định liên quan), bằng chứng lỗi và hướng xử lý đề xuất.<br>• **Ba lối ra chuẩn cho đơn vị nội dung/bài tập bị cách ly:**<br>  1. **`AI sửa & QC lại`:** Tạo phiên bản mới trong giới hạn số vòng và hạn mức cho phép; bắt buộc vượt qua QC lại mới được đưa vào sử dụng (không tự động mở lại chỉ vì AI báo "đã sửa").<br>  2. **`Ngừng sử dụng` (`Suspended / Retired`):** Dừng cấp phát trên cả kho và cache, nhưng **giữ nguyên lịch sử và mọi liên kết bằng chứng cũ** để đảm bảo truy vết (tuyệt đối không xóa trắng dữ liệu).<br>  3. **`Xem xét thủ công`:** Mở hồ sơ bằng chứng lỗi để bạn quyết định sửa, hoãn hoặc ngừng sử dụng (không bắt buộc bạn phải tự sửa mọi bài lỗi). |
| **3. `Lần chạy`** | • Nhật ký kỹ thuật chi tiết của từng lần chạy tác vụ/pipeline: bước thất bại, gói ngữ cảnh đầu vào/đầu ra, phiên bản mô hình/CLI thực tế, số lần thử lại (retry), thời gian xử lý và hạn mức tiêu thụ quan sát được. |

---

## 4. Quy tắc Đặc thù: Chống Nhiễu Chéo Khi Người Xây Dựng Cũng Là Người Học Duy Nhất

Vì bạn vừa dùng `Builder & QC Console` vừa là người học trên cùng một ứng dụng, nếu bạn mở xem đáp án của một bài tập trong lúc QC rồi sau đó hệ thống lại giao bài đó cho bạn ở Bước `7A / 7B / Bước 9`, kết quả kiểm chứng độc lập sẽ bị mất giá trị.

**Quy tắc bắt buộc thực thi:**
1. **Dùng chung Nhật ký tiếp xúc (`Shared Exposure Log`) giữa chế độ Builder và chế độ Học tập:**
   - Bất cứ khi nào bạn thực sự bấm mở xem *Đề bài, Gợi ý, Đáp án, Lời giải hoặc Bài mẫu* của một đơn vị nội dung trong `Builder & QC Console`, hệ thống lập tức ghi nhận sự kiện tiếp xúc tương ứng vào `Exposure Log` của bạn.
2. **Mặc định ẩn nội dung chi tiết trong Console:**
   - Khi duyệt danh sách gói tri thức hoặc kết quả QC trong Console, màn hình mặc định chỉ hiển thị **trạng thái QC, mã lỗi và siêu dữ liệu (metadata)**; chỉ khi bạn chủ động bấm *"Xem nội dung / đáp án chi tiết"* mới mở nội dung và ghi nhận tiếp xúc.
   - Bài đã tiếp xúc vẫn có thể dùng để học hoặc tham khảo, nhưng giá trị kiểm chứng độc lập phải được `Rule Engine` xét theo mục tiêu đo và họ bài (`item_family_id`).
3. **Cô lập dữ liệu chạy thử của Builder (Dry-run Isolation):**
   - Các lần chạy thử nghiệm bộ chấm hoặc pipeline trong chế độ Builder sử dụng bộ dữ liệu thử riêng (`sandbox/test attempts`), tuyệt đối không ghi nhận vào Hồ sơ năng lực hay Kho bằng chứng học thật của bạn.
4. **Tách biệt hai khái niệm kiểm định:**
   - Quản lý riêng **Bộ kiểm thử giữ kín của hệ thống (`Holdout Benchmark` dùng để đo chất lượng AI)** và **Tập bài chưa từng tiếp xúc của người học (`Unseen Items` dùng để giao bài kiểm chứng 7A/7B/9)**.

---

## 5. Kiến trúc Kỹ thuật Modular Monolith & Sáu Cơ chế Vận hành Bền vững

### A. Kiến trúc Tổng thể (Modular Monolith chạy cục bộ bền vững)
Không sử dụng microservices, Redis, Vector DB, Graph DB hay Message Broker phức tạp bên ngoài. Toàn bộ ứng dụng là một **Modular Monolith** gọn nhẹ:

```text
[Giao diện Web: Học hôm nay · Tiến độ · Builder & QC · Cài đặt / Cài đặt AI]
                                      │
[Backend / Tầng Ứng dụng Điều phối]
 ├── 1. Workflow & Rule Engine (Điều khiển luồng, điều kiện nghiệp vụ, chuyển trạng thái)
 ├── 2. Context Builder & Output Validator (Cắt góc nhìn trước khi gọi AI, kiểm tra đầu ra & tiết lộ)
 ├── 3. Durable Task Queue & Worker (Hàng đợi tác vụ bền vững, gọi CLI thuê bao / công cụ Audio)
 └── 4. Ingestion & QC Pipeline Runner (Chạy 6 bước nạp gói tri thức & Cổng QC 4 tầng)
                                      │
[Tầng Lưu trữ Cục bộ Bền vững]
 ├── SQLite Database (Trạng thái vận hành, phiên học, bài nộp, bằng chứng, hồ sơ, hàng đợi, nhật ký)
 ├── Immutable Versioned JSON Store (Nội dung gói tri thức, rubric, đặc tả theo phiên bản bất biến)
 └── Local Media File Store (File audio gốc, hình ảnh biểu đồ/bản đồ kèm đối chiếu checksum)
```

### B. Sáu Cơ chế Kiến trúc Bắt buộc

#### 1. Phân định rõ Nguồn Dữ Liệu Chuẩn (`Source of Truth`)
Giải thích rõ phạm vi của quy tắc *"JSON là nguồn chuẩn"* ở Phần 5 để không xảy ra xung đột với cơ sở dữ liệu vận hành:

| Loại dữ liệu | Nguồn chuẩn (Single Source of Truth) | Quy tắc đồng bộ |
| :--- | :--- | :--- |
| **Nội dung gói tri thức, Rubric, Đặc tả, Bài tập** | **File JSON theo phiên bản** (Bản phát hành bất biến trên đĩa) | Nếu nạp nội dung JSON vào bảng SQLite (hoặc FTS) để tra cứu nhanh, phần trong DB chỉ là **bản nhập có thể xóa đi dựng lại (rebuildable projection)**. Không sửa tay độc lập ở cả 2 nơi. |
| **Trạng thái vòng đời (`active / suspended / retired`) & Lịch sử phát hành** | **SQLite Database** | Quản lý tập trung trạng thái cấp phát hiện hành của từng phiên bản gói/item. |
| **Phiên học, Bài nộp, Hỗ trợ, Tiếp xúc, Bằng chứng, Hồ sơ năng lực, Lịch học** | **SQLite Database** | Lưu trữ giao dịch (transactional) có khóa toàn vẹn. |
| **Audio, Hình ảnh biểu đồ/bản đồ, Tài liệu nguồn** | **Kho File cục bộ** | SQLite chỉ lưu mã tài nguyên, đường dẫn tương đối và mã băm (`checksum`). |
| **Hàng đợi tác vụ nền, Kết quả từng bước, Log lỗi & Quota** | **SQLite Database** | Phục vụ khôi phục sau gián đoạn và truy vết. |

#### 2. Workflow đứng ở Tầng Ứng dụng (Ngoài quyền quyết định của AI)
- Tầng ứng dụng trực tiếp điều khiển `workflows/`; AI chỉ thực hiện đúng một bước được giao và trả về kết quả có cấu trúc.
- `Rule Engine` kiểm tra điều kiện nghiệp vụ rồi mới quyết định lưu bằng chứng, chuyển trạng thái năng lực hoặc phát hành gói.
- Ghi nhận rõ giới hạn kỹ thuật: JSON Schema chỉ kiểm tra được cấu trúc; Regex/Code chỉ lọc được các vi phạm xác định. Các yếu tố ngữ nghĩa (đề mơ hồ, rò rỉ gợi ý tinh vi, chẩn đoán nguyên nhân) vẫn phải đi qua bước QC tương ứng và luôn giữ đường lui an toàn là `Chưa đủ khả năng kết luận`.

#### 3. Tác vụ AI bền vững, tiếp tục được sau gián đoạn (`Resumable Durable Queue`)
- Các tác vụ gọi AI hoặc chạy Pipeline 6 bước không nằm lơ lửng trong một HTTP request của trình duyệt.
- Hệ thống lưu tác vụ vào bảng hàng đợi trong SQLite và xử lý qua Worker (ở giai đoạn MVP: 1 worker xử lý tuần tự 1 job AI tại một thời điểm).
- Mỗi bước lưu trạng thái để khi đóng trình duyệt, mất mạng hoặc khởi động lại máy, hệ thống biết chính xác cần tiếp tục từ bước nào. **Tuyệt đối không mở giữ transaction của SQLite trong suốt thời gian chờ AI xử lý.**

#### 4. Chống ghi nhận trùng ở tầng Ghi Dữ Liệu (`Database-level Idempotency`)
- Sử dụng khóa duy nhất (`UNIQUE constraint` trên `idempotency_key`, `attempt_id`, `attempt_generation / fencing_token`) và `Database Transaction` tại thời điểm ghi kết quả, lưu bằng chứng và cập nhật trạng thái để đảm bảo không bao giờ ghi trùng hai lần.
- **Phạm vi khóa phải theo thực thể:** Không đặt UNIQUE đơn lẻ trên `attempt_id` trong mọi bảng; một lượt làm bài có nhiều lần chạy, bản sửa và nhận định. Định nghĩa khóa chống trùng cho từng thao tác/loại bản ghi. `attempt_generation / fencing_token` được đối chiếu với generation đang hiệu lực tại transaction commit, không chỉ tạo UNIQUE là đủ.
- Khi một lượt chạy AI trả kết quả về muộn (sau khi đã timeout), hệ thống đối chiếu `run_id` và phiên bản đầu vào; nếu đã hết hiệu lực thì bỏ qua, không ghi đè trạng thái mới.

#### 5. Thu hồi có Liên kết Phụ thuộc (`Dependency-linked Revocation`)
- Mỗi bản ghi nhận định trong Kho bằng chứng đều lưu khóa ngoại truy ngược về: `submission_id`, `item_id + version`, `rubric_version` và `ai_run_id` đã sinh ra nó.
- Khi phát hiện đề bài, đáp án hoặc rubric bị lỗi, hệ thống không chỉ đổi cờ sang `Suspended`, mà tự động truy vấn toàn bộ các nhận định phụ thuộc để giới hạn kết luận hoặc đưa vào hàng đợi tái đánh giá, đồng thời giữ nguyên lịch sử gốc.
- Quy tắc *Khóa phiên bản lúc giao bài (Version Pinning)* chỉ bảo vệ người học khỏi việc đổi tiêu chí bất ngờ giữa chừng, **không được dùng làm lý do để tiếp tục công nhận bằng chứng từ một nội dung đã xác nhận là bị lỗi**.

#### 6. Sao lưu & Khôi phục Đồng bộ (`Coordinated Backup & Restore`)
- Hệ thống tích hợp sẵn công cụ sao lưu đồng bộ cả 3 thành phần: **Database SQLite** (sử dụng cơ chế **SQLite Online Backup API** chuẩn để sao lưu an toàn ngay cả khi ứng dụng đang mở, không copy file `.db` thô tùy tiện khi đang ghi) + **Kho gói JSON** + **Kho file Audio/Hình ảnh**.
- Có quy trình kiểm tra khôi phục (Restore verification) rõ ràng để đảm bảo không bao giờ mất hồ sơ học tập hay file ghi âm cá nhân.

---

## 6. Thứ tự Xây dựng 5 Bước & Đồng bộ Ngược với Phần 1–5

### A. Thứ tự Triển khai Thực tế
1. **Bước 1 — Nền dữ liệu & Hàng đợi bền vững:** Thiết lập SQLite schema, quản lý phiên bản JSON, lưu bài nộp, nhật ký tiếp xúc dùng chung, kho bằng chứng, hàng đợi tác vụ bền vững, khóa chống trùng và liên kết truy vết.
2. **Bước 2 — `Builder & QC Console` tối thiểu + Gateway AI Thuê bao (06A):** Xây dựng bộ chạy CLI thuê bao có `subscriptionGuard`, chạy thử 1 gói tri thức nhỏ, xem kết quả QC, phát hành, ngừng sử dụng và xem log lần chạy.
3. **Bước 3 — Vòng học Writing hoàn chỉnh + Luồng Reading Giải mù + Ca Audio mẫu:** Triển khai giao diện `Học hôm nay` và `Workspace` chạy xuyên suốt 1 vòng lặp Writing, kiểm chứng cô lập ngữ cảnh Giải mù của Reading và luồng thu/phát Audio.
4. **Bước 4 — Kiểm thử 6 Tình huống Thực tế:** Kiểm tra tải lại trang giữa chừng, gửi trùng yêu cầu, AI trả kết quả muộn sau timeout, đổi phiên bản rubric, thu hồi đề sai, và mở xem đáp án trong Console rồi chuyển sang chế độ Học.
5. **Bước 5 — Mở rộng các gói kỹ năng, Daily Tracking & Tinh chỉnh UI:** Bổ sung các dạng bài tiếp theo, bộ theo dõi học hằng ngày & đề xuất bù lịch dựa trên trải nghiệm sử dụng thật của bạn.

### B. Cập nhật Đồng bộ Ngược vào Phần 2, Phần 4 và Phần 5
- **Đồng bộ vào Phần 2:** Bổ sung trạng thái ngày học (`Nghỉ có kế hoạch`, `Thiếu dữ liệu telemetry`, `Offline`), cấu trúc `Replanning Proposal` có phiên bản, và dùng chung `Exposure Log` giữa chế độ Builder và Học tập.
- **Đồng bộ vào Phần 4:** Đưa `Builder & QC Console tối thiểu` lên sớm từ Giai đoạn 2 để phục vụ kiểm chứng vòng học đầu tiên; đặt `Workflow` ở tầng ứng dụng ngoài AI; bổ sung hợp đồng `providerAdapter` và `subscriptionGuard` theo Phụ lục 06A.
- **Đồng bộ vào Phần 5:** Làm rõ bảng phân định Nguồn dữ liệu chuẩn giữa File JSON bất biến và SQLite; bổ sung `context_manifests`, khóa cache theo quyền/pha/phiên bản/mức tiết lộ và bộ đối chứng chất lượng giữa các nhà cung cấp AI.

### C. Ghi chú rà soát triển khai — 19/10/2026
- Làm rõ phạm vi idempotency/fencing tại §5.B.4; không thay quy tắc bảo toàn bằng chứng.
- Kế hoạch triển khai và cổng nghiệm thu: [IMPLEMENTATION_PLAN](engineering/IMPLEMENTATION_PLAN.md).
