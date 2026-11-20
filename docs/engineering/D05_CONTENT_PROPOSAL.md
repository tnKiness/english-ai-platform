# D-05 — Đề xuất: nguồn đề và kho nhiệm vụ luôn sẵn sàng

> **Trạng thái: ĐÃ CHỐT, có sửa đổi** (18/11/2026, E-36). Bảng dưới ghi quyết định của người dùng; phần sau bảng là bản đề xuất gốc, giữ lại để đối chiếu.
>
> | Mã | Người dùng chốt |
> |---|---|
> | N1 | **Làm đều cả 4 kỹ năng.** Người dùng "gần như quên hết" Writing và Speaking, phải học lại từ đầu, nên cần: lộ trình nền tảng, hướng dẫn khi sai, giải thích khi điểm thấp, đề xuất cải tiến. Listening và chấm phát âm vẫn phụ thuộc D-06 (TTS/ASR). |
> | N2 | **Quét hết** các trang thuộc các miền nguồn đã liệt kê, có **trang để người dùng duyệt**. Vì dùng cá nhân, người dùng chấp nhận rủi ro bản quyền. |
> | N3 | Đồng ý lưu bản sao cục bộ trong `var/`, không commit. |
> | N4 | Khung năng lực **bám sát mục tiêu IELTS tối đa**. AI tự tối ưu độ mịn; người dùng duyệt bản v1. |
> | N5–N8, N10 | Đồng ý theo khuyến nghị. |
> | N9 | Người dùng không có bài có điểm. Thay vào đó: **research kỹ tiêu chí** (band descriptors, bài mẫu công khai có nhận xét giám khảo) để làm căn cứ chấm. Người dùng chấp nhận rủi ro lệch với giám khảo thật. Báo Band vẫn tắt cho tới khi đo được độ khớp trên bộ mẫu công khai thu về. |
> | — | **Codex Plus đã hết hạn** (người dùng báo 18/11/2026). Hiện không có provider AI thật nào sẵn sàng, nên mọi bước cần AI (C2–C6, chấm thật P5-5) bị chặn cho tới khi có provider đạt D-01: gia hạn Codex, hoặc xác minh `claude-code`/`agy`. |
>
> Bản đề xuất gốc (soạn theo yêu cầu của người dùng: *"Đề AI sẽ tự search, build theo đúng tiêu chí của IELTS và cũng có thể tự thêm đề mà tôi sở hữu… nêu rõ cho tôi"*.
>
> Mỗi điểm cần chốt có mã **N1–N10**, kèm **khuyến nghị**.

## 1. Vấn đề hiện tại
- Mọi đề đang là **gói synthetic** do AI lập trình viết sẵn để thử luồng: 4 đề Writing Task 2, 3 kỹ năng giả lập. Quy tắc G0 của D-02 loại toàn bộ khỏi hồ sơ, nên hồ sơ năng lực luôn là *Chưa đủ dữ liệu*, kể cả khi bài của bạn được chấm bằng AI thật (P5-5).
- Bài 7A/7B/Bước 9 cần **đề mới mỗi lần**: khác họ bài, chưa từng thấy. Với 4 đề cố định, chuỗi kiểm chứng hết đề ngay sau vài vòng, và nhiệm vụ rơi vào *chờ kiểm chứng* vì bị chặn bởi kiểm tra tính mới.
- Đặc tả Phần 5 yêu cầu mọi nội dung đi qua **pipeline 6 bước + QC1–QC4** trước khi phát hành. Đặc tả cũng phân biệt ba loại đầu vào: thông tin từ nguồn ngoài, quyết định sản phẩm, nội dung AI biên soạn (05 §2.A). Hạ tầng cho việc này đã có từ P2:
  - danh mục nguồn (`source_records`), phiếu yêu cầu gói, staging;
  - QC1–4, phát hành đúng hash, thu hồi lan truyền, cổng D-05 cho bộ đối chứng.

  Còn thiếu ba phần: **công cụ lấy nguồn**, **AI biên soạn đề**, và **luồng nhập đề của bạn**.

## 2. Kiến trúc đề xuất: 3 đường vào, 1 cổng QC

```text
 (A) Nguồn chính thức ──► Danh mục nguồn (quyền, checksum) ──► Khung tiêu chí: năng lực + rubric (Khối 1–2)
                                                                      │ căn cứ
 (B) AI biên soạn đề ───► Phiếu yêu cầu gói ──► staging ──┐            ▼
 (C) Đề bạn sở hữu ─────► Phiếu nhập đề + khai quyền ─────┴──► QC1–QC4 ──► Phát hành gói ──► Kho nhiệm vụ
                                                                                              │
                     Bộ theo dõi độ phủ (thiếu đề ở đâu?) ──► tự tạo phiếu yêu cầu (B) ◄──────┘
```

- **(A) Tiêu chí IELTS** không lấy từ trí nhớ của AI. Tài liệu chính thức (band descriptors, định dạng đề — danh mục ở 05 §2.C) được lấy về bằng một lệnh có danh sách URL cho phép. Mỗi tài liệu có ngày truy cập, checksum và bản ghi quyền. AI biên soạn khung năng lực và rubric từ các đoạn trích đó; QC2 kiểm tra nội dung có trung thực với nguồn.
- **(B) AI tạo đề mới** theo quy chuẩn sinh đề (Khối 4): đề gốc, không chép hay đổi tên đề có bản quyền (05 §2.D), độ khó ghi là *ước tính*. Mỗi đề có họ bài, độ rộng nhiệm vụ, loại ràng buộc và vai trò dùng được.
- **(C) Đề bạn sở hữu** đi cùng cổng QC, kèm khai báo quyền và mức đã tiếp xúc.
- **"Luôn sẵn sàng"**: một bộ theo dõi độ phủ đếm đề *chưa thấy* theo ma trận `kỹ năng × vai trò × phạm vi × loại ràng buộc × họ bài` (05 §6.B). Ô nào dưới ngưỡng thì tự tạo phiếu yêu cầu cho (B), trong giới hạn hạn mức AI mỗi ngày.

## 3. Các điểm cần chốt

### N1 — Phạm vi và thứ tự triển khai
| Bước | Dạng đề | Vì sao |
|---|---|---|
| 1 | **Writing Task 2** (Academic + GT dùng chung) | Đã có vòng học và chấm thật; chỉ cần văn bản. |
| 2 | **Speaking Part 1–3, dạng văn bản** | Chỉ là câu hỏi, dễ sinh. Chưa chấm phát âm (D-06). |
| 3 | **Writing Task 1 GT** (thư) | Chỉ văn bản. |
| 4 | **Writing Task 1 Academic** (biểu đồ) | Cần sinh dữ liệu + vẽ biểu đồ + QC1 ba tầng (số liệu ↔ nhận định ↔ hình). |
| 5 | **Reading** | Cần bài đọc dài + đáp án; đã có QC4 giải mù. |
| — | **Listening** | Chặn ở D-06 (cần TTS và kiểm audio). |

**Khuyến nghị:** làm bước 1 trọn vẹn (A + B + C + độ phủ) rồi mới mở rộng.

### N2 — AI có được tự duyệt web không
- **Phương án 1 (khuyến nghị):** AI **không** tự duyệt web. Một lệnh (ví dụ `npm run sources -- fetch`) chỉ tải các URL đã có trong danh mục được duyệt, lưu vào `var/`, ghi checksum. AI chỉ làm việc trên các đoạn đã lưu.
  - Giữ nguyên ranh giới của D-01: CLI không có công cụ, không đọc file ngoài dữ liệu được đưa vào.
  - Mọi phát biểu truy được về nguồn, đúng yêu cầu QC2.
- **Phương án 2:** cho một profile AI riêng được bật web search. Cần xác minh D-01 mới cho profile đó (vì đổi ranh giới công cụ), khó truy nguồn hơn, và có nguy cơ prompt injection từ trang web (05 §6.A.2).
- **Ghi chú:** "tìm đề trên mạng rồi dùng lại" phần lớn là đề có bản quyền (Cambridge, IDP, British Council). Đặc tả 05 §2.D không cho nạp hàng loạt khi quyền *Chưa rõ*. Vì vậy web chỉ nên dùng để lấy **tiêu chí và định dạng**, không lấy đề.

### N3 — Lưu bản sao tài liệu chính thức
Band descriptors và định dạng đề trên ielts.org đọc công khai, nhưng **không mặc định** là được lưu toàn văn hay gửi nguyên bản cho AI (05 §2.D).

**Khuyến nghị:**
- Lưu **bản sao cục bộ cho mục đích cá nhân** (không commit, không chia sẻ).
- Chỉ gửi cho AI **các đoạn trích cần thiết** của từng tiêu chí.
- Ghi quyền từng tài liệu là `Đã xác định — dùng cá nhân` hoặc `Chưa rõ`. Tài liệu `Chưa rõ` chỉ được giữ đường dẫn.

**Bạn cần xác nhận:** bạn chấp nhận rủi ro này cho mục đích học cá nhân.

### N4 — Khung năng lực thật (thay 3 kỹ năng synthetic)
AI biên soạn danh mục `competency_id` từ band descriptors theo 4 tiêu chí: TR/TA, CC, LR, GRA. Mỗi năng lực có hợp đồng bằng chứng 5 thành phần (05 §3 Khối 1). QC2 kiểm tra trung thực với nguồn, QC3 kiểm tra khớp chính sách D-02.

Cần chốt **độ mịn**:
- **Khuyến nghị:** khoảng 4–6 năng lực cho mỗi tiêu chí, tổng khoảng 20 cho Writing Task 2. Ví dụ: TR — trả lời đủ các phần đề / lập trường nhất quán / phát triển và hỗ trợ ý.
- Mịn hơn thì khó thu đủ bằng chứng; thô hơn thì chẩn đoán kém hữu ích.
- **Bạn duyệt danh mục v1 một lần** trước khi phát hành, vì đây là nền của mọi kết luận.

### N5 — Quy chuẩn AI sinh đề (Khối 4)
**Khuyến nghị cho Writing Task 2:**
- **Nội dung đề:** đề gốc theo 5 dạng chuẩn (Opinion, Discussion, Advantages/Disadvantages, Problem/Solution, Two-part). Chủ đề theo nhóm chủ đề phổ biến của IELTS, không lặp chủ đề gần trong cùng họ bài.
- **Metadata bắt buộc:** dạng đề, chủ đề, họ bài, độ rộng (bài hoàn chỉnh = *bài tổng hợp*), loại ràng buộc (ràng buộc tình huống), vai trò dùng được, độ khó *ước tính*.
- **Bài 7A** (ngắn): sinh **nhiệm vụ đoạn** nhắm đúng một năng lực, có `meets_min_scope`.
- **Cấm:** chép hoặc chỉnh sửa nhẹ đề có bản quyền. Kiểm bằng so khớp gần đúng với đề bạn nhập và đề đã có trong kho.
- **QC:**
  - QC1: schema + metadata.
  - QC3: đề không ép một cấu trúc trừ khi vai trò yêu cầu; không chứa đáp án hay ý gợi sẵn.
  - QC4: một AI độc lập kiểm đề có rõ yêu cầu, không mơ hồ, đúng dạng.

### N6 — Ai duyệt phát hành
- **Phương án A (khuyến nghị):** đề **qua đủ QC1–QC4 thì tự phát hành** cho vai trò *luyện tập* và *kiểm chứng*. Bạn có màn **duyệt mẫu ngẫu nhiên** và nút thu hồi (đã có thu hồi lan truyền). Đúng tinh thần "giảm tải cho người vận hành một mình" (05 §7.B).
- **Phương án B:** mọi đề AI sinh đều chờ bạn duyệt tay trước khi dùng.
- **Ngoại lệ trong cả hai phương án:** khung năng lực và rubric (N4) luôn cần bạn duyệt.

### N7 — Nhập đề bạn sở hữu
- **Cách nhập:** dán văn bản đề, chọn dạng (Task 1/2, Academic/GT, Speaking part). Với Task 1 Academic: tải ảnh biểu đồ, kèm bảng số liệu bạn nhập (nếu có) để QC1 kiểm được.
- **Khai báo quyền:** "tôi sở hữu tài liệu này, dùng cá nhân". Đề **chỉ lưu trong `var/`**, không bao giờ vào Git hay bản xuất công khai.
- **Có được gửi đề cho AI chấm không:**
  - *Khuyến nghị: có.* Đề cần có trong ngữ cảnh để chấm đúng.
  - Cần một loại dữ liệu đồng ý mới, `learner_owned_content`.
- **Khai báo mức đã tiếp xúc:** *chưa từng làm* / *đã làm* / *đã xem bài mẫu hoặc đáp án*. Đề đã xem bài mẫu không dùng làm bài kiểm chứng độc lập (7A/7B/9), chỉ dùng để luyện. Đây là quy tắc tính mới đã có.
- **Phân loại:** AI tự đề xuất dạng đề, năng lực đo được và metadata; QC1/QC3 kiểm tra. Đề đạt thì được tính vào hồ sơ (không phải synthetic).
- **Bài mẫu có điểm của giám khảo trong sách** (nếu có): **không** dùng làm mẫu neo trong ngữ cảnh chấm. Nên đưa vào **bộ đối chứng giữ kín** (N9).

### N8 — Ngưỡng "luôn sẵn sàng" và hạn mức
**Khuyến nghị:**
- Mỗi ô `kỹ năng × vai trò` luôn có **≥ 3 đề chưa thấy**, thuộc **≥ 2 họ bài**.
- Khi một ô xuống dưới ngưỡng, tự tạo phiếu yêu cầu sinh **5 đề**. Ô đang có nhiệm vụ đến hạn được ưu tiên (dùng điểm ưu tiên D-02).
- Trần **10 lượt gọi AI mỗi ngày** cho việc sinh và QC đề, tách khỏi lượt chấm bài. Chỉ chạy khi worker rảnh, không chiếm lượt chấm bài của bạn.
- Kho hết đề hợp lệ → giữ *chờ kiểm chứng* (đúng 04 §5.B), không dùng đề không đạt.

**Bạn chốt:** các con số 3 / 2 / 5 / 10.

### N9 — Bộ đối chứng (phần còn lại của D-05)
- Muốn tin chất lượng chấm và sau này báo Band, cần **bộ đối chứng có nguồn**: bài viết thật có điểm từng tiêu chí do giám khảo hoặc nguồn tin cậy chấm. Tách bộ phát triển (dùng chỉnh prompt) và bộ giữ kín (chỉ dùng để đo).
- Bài mẫu do AI tự viết **không** được dùng làm chuẩn Band (05 §5.C QC4).
- **Khuyến nghị:**
  - Dùng bài mẫu có điểm trong tài liệu bạn sở hữu, và mẫu công khai của IELTS (nếu quyền cho phép lưu).
  - Bắt đầu với **20–30 bài** cho Writing Task 2. Chưa đủ bộ này thì **báo Band vẫn tắt**.

### N10 — Phân loại nguồn gốc nội dung
Hiện chỉ có hai loại: `synthetic_fixture` và `sourced`. Đề xuất thêm hai loại (một migration mới):
- `ai_authored`: AI sinh qua pipeline và QC, **được tính** vào hồ sơ.
- `learner_owned`: đề bạn nhập, **được tính** vào hồ sơ, không xuất công khai.

`synthetic_fixture` vẫn bị G0 loại. Cách hiểu "synthetic" của G0 đổi từ "đề nằm trong gói fixture" thành "nguồn gốc = `synthetic_fixture` hoặc chấm bằng FakeAdapter".

## 4. Phần việc kỹ thuật (sau khi chốt)
| Giai đoạn | Nội dung | Phụ thuộc |
|---|---|---|
| C1 | Migration nguồn gốc nội dung (N10); lệnh lấy nguồn có danh sách cho phép, checksum, quyền (N2–N3). **Đã làm:** quét + duyệt (E-37), trích văn bản PDF (E-39), lọc hàng đợi (E-40), migration N10 (E-41) | N2, N3, N10 |
| C2 | Task type `content.author` / `content.review` + hợp đồng kết quả; AI biên soạn khung năng lực + rubric Writing Task 2 từ nguồn; màn duyệt danh mục. **Code xong (E-42)**; bản v1 chờ người dùng duyệt | N4 |
| C3 | AI sinh đề Writing Task 2 + QC1–QC4 cho đề + tự phát hành theo N6. **C3a code xong (E-47)**: soạn, kiểm tra, đóng gói, QC, tự phát hành; chạy thật chờ khung được duyệt. **C3b chưa làm**: màn học cấp đề thật, chấm theo khung | N5, N6 |
| C4 | Màn nhập đề của bạn + khai quyền/tiếp xúc + loại dữ liệu đồng ý `learner_owned_content` | N7 |
| C5 | Bộ theo dõi độ phủ + tự bổ sung đề trong hạn mức (worker) | N8 |
| C6 | Khung bộ đối chứng đã có (P4); nhập bài có điểm, chạy đo, báo cáo | N9 |

Mỗi giai đoạn có test với adapter giả và một lần chạy thật có ghi log, giống P5-5. Các lần gọi AI thật đều do bạn khởi chạy.

## 5. Rủi ro cần biết
- **Chất lượng đề AI sinh:** QC giảm rủi ro nhưng không bảo đảm đề "như thật". Độ khó luôn ghi là *ước tính* cho tới khi có dữ liệu làm bài thật (05 §1.B.3).
- **Bản quyền:** đề và tài liệu bạn nhập chỉ dùng cá nhân, trong `var/`. Hệ thống không chia sẻ hay xuất công khai; trách nhiệm quyền sở hữu tài liệu thuộc về bạn.
- **Hạn mức:** sinh và QC đề tốn lượt gọi AI. Trần ở N8 giữ cho việc này không chiếm lượt chấm bài.
- **Tiêu chí lệch nguồn:** nếu ielts.org cập nhật band descriptors, checksum đổi. Hệ thống báo cần rà lại và có thể thu hồi lan truyền tới các kết luận phụ thuộc (đã có).
