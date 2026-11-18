# D-02 — Chính sách năng lực, kiểm chứng và điều phối (v1)

> **Trạng thái: ĐÃ CHỐT v1 — 18/11/2026.** Người dùng đồng ý toàn bộ bản đề xuất A–F, rồi yêu cầu AI đánh giá một bản góp ý 8 điểm và đưa những điểm phù hợp vào. Phần [Lịch sử sửa đổi](#lịch-sử-sửa-đổi-v1) ghi rõ điểm nào được nhận, điểm nào được sửa và điểm nào bị bỏ.
>
> Mọi con số dưới đây là **đề xuất đã duyệt, chưa kiểm định thực nghiệm**, không phải chuẩn sư phạm. Khi triển khai, chính sách được ghi thành file có phiên bản (`policies/competency-policy.v1.json`) kèm nguồn. Mỗi kết luận ghi phiên bản chính sách đã dùng.
>
> Báo điểm Band **không** thuộc D-02 và vẫn tắt cho tới khi có bộ đối chứng D-05.

## Thuật ngữ
Các thuật ngữ này đã có trong code, ở `src/domain/evidence`.

- **Nguồn bằng chứng:** một lần làm bài (`evidence_source`). Nhiều nhận định, chấm lại, retry hay khiếu nại trên cùng một bài **chỉ tính là một nguồn** (02 §2.C.1).
- **Nguồn độc lập:** nguồn mà nhận định cho kỹ năng đang xét thỏa đủ các điều sau (02 §2.B, §2.C.2, §3 quy tắc 3):
  - `support_impact = no_related_effect_detected`
  - `measurement_quality = sufficient`
  - `opportunity = observed`
  - làm ở bài chưa lộ đáp án hay lời giải.

  Code gọi loại nguồn này là `independent_candidate`.
- **Điều kiện làm bài** (02 §3 cột 4, §2.C.2; 01 Cổng kiểm duyệt) là tổ hợp của bốn thành phần:
  - **phương thức:** viết / nói / đọc / nghe;
  - **chế độ:** tự luyện / thi thử;
  - **giảm tải:** không / có (`reduced_load`);
  - **loại ràng buộc:** ràng buộc tình huống/ý nghĩa, hoặc chỉ định cấu trúc.

  Vai trò bài 7A / 7B / 9 **không** thuộc điều kiện. Đó là bậc kiểm chứng (A4 → A5 → A6), nên các bậc được so cùng một điều kiện.
- **Bài ngắn / bài tổng hợp:** xếp theo độ rộng nhiệm vụ, không chỉ theo nhãn vai trò.
  - **Bài ngắn:** 7A, hoặc bài `practice` ngắn đủ phạm vi đo tối thiểu (`meets_min_scope`).
  - **Bài tổng hợp:** 7B, hoặc bài `practice` / `exam` hoàn chỉnh ở cấp đoạn hay cấp bài.

## G. Quy tắc nền
| Mã | Quy tắc |
|---|---|
| G0 | Hồ sơ năng lực, độ tin cậy, lịch kiểm chứng, điểm ưu tiên và sổ lỗi **chỉ tính** nguồn có `scope = 'learner'` và `synthetic = 0`. Dữ liệu synthetic (FakeAdapter, fixture) chỉ dùng để kiểm thử luồng và không bao giờ vào kết luận thật. |
| G1 | Kết luận luôn dựa trên **nguồn**, không dựa trên số dòng nhận định. Không đếm trùng khi retry, dùng cache hay tái đánh giá. |
| G2 | Tự sửa có gợi ý, bài đã xem lời giải (nấc 3 / "Xem giải thích trực tiếp") và nhận định `inconclusive` **không** được tính là nguồn độc lập. |

## A. Chuyển trạng thái năng lực 6 mức
**Đặc tả:** 02 §3 có 6 mức và các quy tắc sau:
1. Không bắt đi tuần tự.
2. Không hạ mức vì lâu chưa kiểm tra.
3. Dùng gợi ý lúc học không chặn trần.
4. Không suy diễn chéo điều kiện.
5. "Đã xem lời giải" không phải là một mức.

01 Bước 7–9 nối 7A → 7B → Bước 9.

Mức được xét theo bằng chứng **mới nhất** của kỹ năng, **trong từng điều kiện**:

| Mã | Mức | Điều kiện đạt |
|---|---|---|
| A1 | `Chưa đủ dữ liệu` | Chưa có nhận định `met` / `not_met` hiệu lực nào (chỉ có `inconclusive`, hoặc chưa có gì). |
| A2 | `Cần hỗ trợ` | Có ≥ 1 nhận định `not_met` và chưa có bản tự sửa đạt theo A3 cho lỗi đó. Mức này cũng áp dụng khi bản sửa chỉ đạt sau khi đã mở nấc 3. |
| A3 | `Tự sửa được khi có gợi ý` | Có ≥ 1 bản tự sửa (Bước 5) đạt, nộp khi **chưa mở tới nấc 3** (`unlocked_hint_level ≤ 2` tại thời điểm nộp), và chưa có nguồn độc lập đạt. |
| A4 | `Đã vận dụng bước đầu trong nhiệm vụ ngắn` | Có ≥ 1 nguồn độc lập đạt ở **bài ngắn** đủ phạm vi đo tối thiểu. |
| A5 | `Vận dụng được trong bài tổng hợp` | Có ≥ 1 nguồn độc lập đạt ở **bài tổng hợp**. Không cần đã qua A4 (quy tắc 1): làm tốt ngay từ bài đầu thì được ghi nhận ngay. |
| A6 | `Duy trì ổn định` | Thỏa cả ba điều kiện:<br>• có ≥ **2** nguồn độc lập đạt ở **Bước 9**, hoặc ở bài tổng hợp được tính cho Bước 9 (C2);<br>• hai nguồn cách nhau ≥ **7 ngày**;<br>• nguồn độc lập gần nhất không phải `not_met`. |

**A7 — Hạ mức.** Chỉ hạ khi có **bằng chứng độc lập chưa đạt, cùng điều kiện** với mức đang giữ:
- **1** lần `not_met` độc lập → giữ nguyên mức và đặt trạng thái kiểm chứng `Cần kiểm tra lại` (02 §4.C).
- **2** lần `not_met` độc lập liên tiếp, ở **2 bài khác nhau**, cùng điều kiện → hạ **một** mức, ghi lý do và liên kết tới hai nguồn đó.
- Không bao giờ hạ vì quá hạn, nghỉ học hay thiếu giờ (02 §3 quy tắc 2; 06A §9.2).

**A8 — Phạm vi.** Mức được ghi theo từng điều kiện. Đạt ở tự luyện không suy ra đạt ở thi thử. Đạt khi giảm tải hay khi được chỉ định cấu trúc không suy ra đạt ở bài tự gánh toàn bộ hay bài có ràng buộc tình huống. Mức hiển thị chung là mức cao nhất đã chứng minh, kèm danh sách các điều kiện đã có và chưa có bằng chứng.

## B. Độ tin cậy
**Đặc tả:** 02 §3 cột 2 — dựa trên mức độ mạnh và **đa dạng** của nguồn; không tăng nhờ lặp lại câu giống nhau.

| Mã | Mức | Điều kiện |
|---|---|---|
| B0 | Chưa xác lập | Mức A1–A3, tức là chưa có nguồn độc lập. |
| B1 | Thấp | 1 nguồn độc lập ủng hộ mức hiện tại. |
| B2 | Trung bình | ≥ 2 nguồn độc lập, ở ≥ 2 **ngày học** khác nhau **và** ≥ 2 **họ bài** (`item_family_id`) khác nhau. |
| B3 | Cao | Thỏa cả ba điều kiện:<br>• ≥ 3 nguồn độc lập, ở ≥ 2 họ bài khác nhau;<br>• thuộc ≥ 2 **điều kiện** khác nhau (ví dụ tự luyện + thi thử);<br>• **3 nguồn độc lập gần nhất đều đạt**. |
| B4 | Giảm tin cậy | Mỗi nguồn `not_met` độc lập đến sau nguồn đạt gần nhất làm tin cậy giảm **một bậc**, nhưng không làm hạ mức (hạ mức theo A7). |

## C. Lịch kiểm chứng và ôn giãn cách
**Đặc tả:**
- 01 Bước 7–9, gồm bảng "Cơ hội sử dụng". Theo bảng này, nếu qua nhiều bài liên tiếp vẫn không có cơ hội quan sát, hệ thống phải chủ động giao nhiệm vụ có ràng buộc.
- 02 §3 quy tắc 2.
- 02 §5.A.1: không mặc định ép làm lại 7A ngay đầu buổi.

Lịch hiện có trong code (E-18: 7B = +1 ngày; Bước 9 = +3 ngày sau 7A) chỉ dùng để kiểm thử luồng synthetic và sẽ được thay bằng lịch dưới đây.

| Mã | Quy tắc |
|---|---|
| C1 | Chuỗi tuần tự:<br>• Đạt 7A → xếp 7B vào buổi phù hợp sớm nhất, **từ ngày hôm sau** (+1 ngày).<br>• Chỉ khi đạt 7B, hoặc đạt thẳng A5, mới mở chuỗi Bước 9.<br>• Không xếp 7B và Bước 9 của cùng một kỹ năng cùng lúc. |
| C2 | Khoảng cách Bước 9 tăng dần **3 → 7 → 14 → 30 → 60 ngày** sau mỗi lần đạt độc lập. Khi Bước 9 đã đến hạn mà người học làm một bài tổng hợp thỏa cả hai điều kiện dưới đây, bài đó **được tính luôn cho Bước 9** (kiểm tra duy trì tích hợp) và không phải giao bài ôn riêng:<br>• đủ điều kiện độc lập;<br>• `opportunity = observed`. |
| C3 | Khi một nhiệm vụ kiểm chứng ra `not_met` độc lập:<br>• **7A** → quay về củng cố Bước 6 (xem lại chẩn đoán hoặc đổi cách hỗ trợ), không ép làm lại 7A ngay đầu buổi.<br>• **7B** → giao bài luyện trong ngữ cảnh đoạn hoặc bài, rồi xếp lại 7B sau **+2 ngày**.<br>• **Bước 9** → quay về khoảng **3 ngày**.<br>Mức năng lực chỉ hạ theo A7. |
| C4 | Bài không tạo cơ hội sử dụng (`opportunity = absent`) → `Chờ cơ hội quan sát`. Bài đó không tính là đạt hay chưa đạt và không đổi khoảng cách. Hệ thống **chủ động giao 1 nhiệm vụ ôn ngắn có ràng buộc tình huống** khi gặp một trong hai trường hợp:<br>• `absent` ở **2 bài tổng hợp liên tiếp**;<br>• đã chờ quá **7 ngày** sau hạn. |
| C5 | Quá hạn → `Đến hạn kiểm tra`. Quá hạn hơn 2 lần khoảng cách → `Cần kiểm tra lại`. Mức năng lực giữ nguyên. |

## D. Điều phối: điểm ưu tiên và chống trì hoãn
**Đặc tả:**
- 01 §Bước 4: điểm ưu tiên = ảnh hưởng chất lượng bài + tần suất/phạm vi + liên quan mục tiêu + độ chắc chắn chẩn đoán. Mỗi buổi giữ 2–3 trọng tâm, hoặc 1 nếu vấn đề phức tạp.
- 02 §5.A bước 2: cộng thêm thời hạn kiểm chứng và thời gian đã chờ, kèm chống trì hoãn.

| Mã | Quy tắc |
|---|---|
| D1 | Bốn chiều, mỗi chiều chấm **0–3**, **trọng số bằng nhau**.<br>**AI đề xuất** (ứng dụng kiểm tra phạm vi, thiếu thì lấy 1, tín hiệu yếu thì kẹp trần):<br>• **Ảnh hưởng chất lượng bài**<br>• **Độ chắc chắn chẩn đoán**: không vượt 1 khi giả thuyết đang `initial` hoặc `insufficient_evidence`.<br>**Rule Engine tự tính**, không gọi AI và cập nhật ngay khi đổi mục tiêu:<br>• **Tần suất/phạm vi:** số nguồn `not_met` (theo G0/G1) của kỹ năng trong 30 ngày → 0 / 1 / 2 / ≥ 3 nguồn = 0 / 1 / 2 / 3 điểm.<br>• **Liên quan mục tiêu:** đọc từ `learner_goals`. Kỹ năng thuộc loại kỳ thi khác = 0; không xác định được = 1; cùng kỹ năng có mục tiêu = 2; kỹ năng có mục tiêu cao nhất trong 4 kỹ năng = 3. |
| D2 | Cộng theo **thời hạn kiểm chứng**: chưa đến hạn +0; đến hạn hôm nay **+3**; quá hạn **+5**. |
| D3 | Cộng theo **thời gian đã chờ**: +1 cho mỗi **3 ngày** nhiệm vụ hợp lệ mà không được chọn, tối đa +3. |
| D4 | **Chống trì hoãn:** nhiệm vụ kiểm chứng (7A/7B/9) được giữ chỗ đầu danh sách ở buổi phù hợp tiếp theo khi gặp một trong hai trường hợp (mỗi buổi chỉ một nhiệm vụ được giữ chỗ):<br>• bị bỏ qua ở **3 buổi phù hợp** liên tiếp;<br>• quá hạn **> 7 ngày**. |
| D5 | Khi hòa điểm, chọn nhiệm vụ đến hạn sớm hơn, rồi đến nhiệm vụ ngắn hơn. Mỗi buổi giữ **2–3 trọng tâm**, hoặc **1** nếu là vấn đề phức tạp hay nhiệm vụ cấp toàn bài. Các lỗi khác vẫn được lưu và cho xem. |

## E. Sổ lỗi: trạng thái giả thuyết
**Đặc tả:**
- 02 §4.A: 4 trạng thái. Một biểu hiện có thể có nhiều giả thuyết cạnh tranh, và lời tự giải thích chỉ là hỗ trợ.
- 02 §4.C: tự sửa đúng chưa đủ để kết luận "sơ suất".

Bảng `error_hypotheses` đã có 4 trạng thái: `initial`, `insufficient_evidence`, `confirmed`, `rejected`.

| Mã | Trạng thái | Quy tắc |
|---|---|---|
| E0 | `initial` (Giả định ban đầu) | Có 1 nguồn đầu tiên. |
| E1 | `confirmed` (Đã xác nhận) | Một trong hai trường hợp:<br>• ≥ **2** nguồn độc lập `not_met` ở **2 bài khác nhau**, trong điều kiện **ủng hộ riêng giả thuyết này hơn các giả thuyết cạnh tranh**, và không có bằng chứng đối chiếu mâu thuẫn. Ví dụ: hai bài đều đủ giờ, nên loại được nguyên nhân thiếu thời gian.<br>• 1 nguồn + 1 nhiệm vụ phân biệt nguyên nhân cho kết quả khớp.<br>Chỉ khớp biểu hiện thôi thì **không đủ** để xác nhận. |
| E2 | `rejected` (Bị bác bỏ) | ≥ **2** nguồn độc lập đạt, trong điều kiện mà giả thuyết dự đoán người học sẽ sai. |
| E3 | `insufficient_evidence` (Chưa đủ bằng chứng) | Nhiệm vụ phân biệt ra `inconclusive`, hoặc bằng chứng đang trái chiều (ví dụ 1 đạt, 1 chưa đạt). |
| E4 | "Có thể là sơ suất" (nhãn phụ, không phải trạng thái) | Lỗi xuất hiện 1 lần và được tự sửa ngay mà không cần nấc 2–3. Nếu tái diễn ở **cơ hội phù hợp tiếp theo**, chuyển sang theo dõi "kiểm soát chưa ổn định". |

## F. Đề xuất lịch bù (dùng A–D)
**Đặc tả:** 06A §9.2–9.3 và 02 §5.C.2:
- lọc trước rồi xếp hạng;
- không có nợ phút;
- không cắt nhiệm vụ kiểm chứng xuống dưới phạm vi đo tối thiểu;
- mục tiêu vượt quỹ kéo dài thì đề xuất thu hẹp phạm vi hoặc dời mốc;
- proposal gắn `base_plan_version` và chờ người học xác nhận.

| Mã | Quy tắc |
|---|---|
| F1 | Tạo proposal khi có cả hai điều kiện:<br>• có nhiệm vụ quá hạn;<br>• **tổng phút (nhiệm vụ quá hạn + nhiệm vụ đến hạn trong 3 ngày tới) > tổng quỹ khả dụng của 3 ngày tới**.<br>Không tạo khi chỉ mới trễ 1 ngày học. |
| F2 | Rải nhiệm vụ theo điểm ưu tiên (D) vào các ngày tới, **không vượt quỹ từng ngày**, tối đa **1 nhiệm vụ kiểm chứng** mỗi buổi. Nhiệm vụ kiểm chứng (7A/7B/9) **không bao giờ bị cắt nhỏ**. Nếu một ngày không đủ phút cho `estimated_minutes` của nó, dời nó sang ngày đầu tiên đủ quỹ và chỉ xếp bài luyện ngắn vào ngày ít giờ. |
| F3 | Nếu tổng thời gian học thực tế trong **14 ngày** qua < **60 %** tổng quỹ mục tiêu của các ngày **không** khai báo `Nghỉ có kế hoạch` → tạo proposal "thu hẹp phạm vi ưu tiên" (bớt kỹ năng ưu tiên thấp) hoặc "dời mốc thi". Không tự nhồi thêm bài. |
| F4 | Proposal hết hạn sau **48 giờ** và luôn có lựa chọn "giữ nguyên lịch". |

---

## Lịch sử sửa đổi v1
Bản đề xuất gốc A–F được người dùng đồng ý ngày 18/11/2026. Cùng ngày, AI đối chiếu bản góp ý 8 điểm với đặc tả và schema, rồi xử lý như sau:

| Góp ý | Xử lý | Căn cứ |
|---|---|---|
| G0 — loại dữ liệu synthetic | **Nhận** | Cột `synthetic` có trong các bảng 0004; theo E-18, nhận định từ FakeAdapter chỉ dùng để kiểm thử luồng. |
| 1 — A4/A5 xét theo độ rộng nhiệm vụ | **Nhận** | 02 §3 quy tắc 1: làm tốt ngay từ đầu được ghi nhận ngay. Theo bản gốc, bài practice/exam đạt ngay sẽ không rơi vào mức nào. |
| 2 — A3 không tính bản sửa sau nấc 3 | **Nhận** | Nấc 3 là giải thích trực tiếp (`writing-workflow.ts`, `unlocked_hint_level = 3`); 01 §1 tách xem lời giải khỏi tự sửa có gợi ý. |
| 3 — bỏ 7A/7B/9 khỏi điều kiện, thêm giảm tải và loại ràng buộc | **Nhận, có sửa** | 02 §3 cột 4, §2.C.2; 01 Cổng kiểm duyệt. Điều kiện giữ "chế độ tự luyện/thi thử" thay vì "áp lực thời gian"; chế độ hướng dẫn đã không phải nguồn độc lập. |
| 4 — B0, họ bài ở B2, B3 dùng 3 nguồn gần nhất | **Nhận** | 02 §3 cột 2 (đa dạng, không tăng nhờ lặp); `item_family_id` có trong 0001. |
| 5 — chuỗi 7A→7B→9, tích hợp Bước 9, xử lý `not_met` của 7A/7B, chống kẹt "chờ cơ hội" | **Nhận**; 7B `not_met` chốt **+2 ngày** (góp ý ghi "+2–3") | 01 Bước 9 (kiểm tra tích hợp; chủ động giao nhiệm vụ có ràng buộc); 02 §5.A.1. |
| 6 — D1 tách AI / Rule Engine; D2 +3/+5 | **Nhận**; thêm bảng quy đổi điểm cho hai chiều do Rule Engine tính | Tần suất và mục tiêu là dữ liệu xác định trong DB, nên tính tại chỗ để không tốn hạn mức AI. |
| 6 — D5: 1 trọng tâm khi buổi học ≤ 20 phút | **Bỏ phần "≤ 20 phút"**, giữ "1 nếu phức tạp" | 01 §Bước 4 chỉ nói "1 nếu phức tạp"; ngưỡng 20 phút là số mới, không có căn cứ trong đặc tả. |
| 7 — E1 đòi điều kiện ủng hộ riêng giả thuyết; ánh xạ đủ 4 trạng thái | **Nhận** | 02 §4.A; CHECK của `error_hypotheses` trong 0004. |
| 8 — F1 cộng nhiệm vụ đến hạn; F2 không cắt bài kiểm chứng; F3 14 ngày, trừ ngày nghỉ có kế hoạch | **Nhận** | 06A §9.2 (không cắt dưới phạm vi đo, không nợ phút); khai báo `planned_rest` (E-25). |

## Triển khai và kiểm chứng
- **Đã triển khai 18/11/2026 (E-34).** Tham số: `policies/competency-policy.v1.json` (kiểm schema khi nạp, có hash; thiếu file → "chưa đủ kết luận"). Luật thuần: `src/domain/policy/{competency,verification,priority,hypothesis,replan}.ts`. Nối vào ứng dụng: `writing-workflow.ts` (kết luận + lịch sử `competency_conclusions`, chuỗi C, xếp hạng D, sổ lỗi E, giới hạn trọng tâm D5) và `replan-planner.ts` + 3 route `/api/learning/replan` (F).
- Test: `tests/unit/d02-policy.test.ts` có ca đạt / chưa đạt / chưa kết luận cho từng dòng G, A–F. Bản ghi bằng chứng trong test là bản ghi thường, không phải synthetic, nên G0 không cần cờ ngoại lệ; đường chạy thật luôn áp G0. `tests/integration/d02-app.test.ts` kiểm F qua HTTP, cùng C2, C4 và trường hợp không có file chính sách.
- **Làm rõ khi triển khai** (không đổi nghĩa chính sách):
  - Chỉ có bằng chứng có hỗ trợ hoặc chưa xác minh thì xếp A1 (G2 không tính).
  - Bài practice/exam chưa có metadata độ rộng thì không dùng để nâng A4/A5.
  - Độ tin cậy B4 không hạ dưới B1.
  - Đã chờ (D3) tính từ hạn. Buổi bị bỏ qua (D4) = số ngày có ghi nhận học sau ngày đến hạn.
  - F3 chỉ xét khi đã theo dõi đủ 14 ngày.
  - F2 đặt nhiệm vụ từ hôm nay trong 14 ngày tới; nhiệm vụ không vừa ngày nào thì giữ nguyên hạn.
  - Tối đa một đề xuất lịch mỗi ngày học.
- Tham số giữ nhãn "đề xuất đã duyệt, chưa kiểm định thực nghiệm". Nên xem lại sau 4–6 tuần dùng thật.
- Kết luận cũ giữ nguyên lịch sử. Khi đổi phiên bản chính sách, kết luận mới ghi phiên bản mới, không sửa bản cũ.
