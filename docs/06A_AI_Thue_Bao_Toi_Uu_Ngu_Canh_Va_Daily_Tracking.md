# PHỤ LỤC 06A: KIẾN TRÚC AI DÙNG THUÊ BAO CLI, TỐI ƯU NGỮ CẢNH & THEO DÕI HỌC HẰNG NGÀY

> **Trạng thái:** ĐÃ CHỐT (v1.0 — Phụ lục kỹ thuật gắn liền với [Phần 6](06_UX_UI_Va_Kien_Truc_Ky_Thuat.md))
> **Ngày đối chiếu tài liệu:** 19/10/2026.
> **Phạm vi:** Ứng dụng web học IELTS cá nhân (một người dùng sở hữu các tài khoản thuê bao ChatGPT, Claude, Gemini); ưu tiên chạy trên máy tính cá nhân và đảm bảo **không phát sinh bất kỳ chi phí API tính theo lượt (per-token billing) nào**.

---

## 1. Quyết định Cốt lõi và Giới hạn Vận hành

1. **Mô hình thực thi:** Người học thao tác hoàn toàn trên giao diện Web của ứng dụng; Backend tạo tác vụ vào hàng đợi bền vững; Worker gọi các công cụ **CLI chính thức đã đăng nhập bằng gói thuê bao** (`codex`, `claude-code`, `gemini-cli`); kết quả được kiểm tra và trả về Web.
2. **Định nghĩa "Token thuê bao":** Chỉ sử dụng quyền lợi CLI nằm trong gói thuê bao đã xác minh. "Token thuê bao" là hạn mức sử dụng (quota) của từng hãng, không phải một ví tiền/token chung có thể chuyển đổi qua lại giữa các hãng.
3. **Chính sách Không Phí Phát Sinh (`subscription_only`):**
   - **Không dùng API key** (kể cả API Free Tier có nguy cơ gắn với tài khoản thanh toán); không dùng Vertex AI, AWS Bedrock hay bất kỳ đường gọi tính tiền theo lượt nào.
   - Không tự động mua thêm credit, không bật `extra usage / auto-recharge / pay-as-you-go`.
   - Lưu ý rõ: CLI vẫn gọi tới máy chủ của hãng qua mạng Internet ("Không API" nghĩa là không đi vào đường API tính phí theo mức sử dụng, không có nghĩa là mô hình lớn chạy offline).
4. **Chuyển đổi giữa các nhà cung cấp (Cross-Provider Failover):**
   - Chỉ tự động chuyển sang nhà cung cấp tiếp theo đã được bạn bật khi nhà cung cấp đó có quyền lợi thuê bao hợp lệ và đủ năng lực xử lý tác vụ.
   - Mỗi lần chuyển hãng là một lần gửi gói ngữ cảnh của bước đó sang máy chủ của hãng tương ứng; danh sách hãng được phép nhận dữ liệu phải được cấu hình rõ trong `Cài đặt AI`.
5. **Chính sách Đa tài khoản (Multi-Account Compliance):**
   - Hỗ trợ lưu danh mục tài khoản nhưng **tuyệt đối không thiết kế cơ chế xoay vòng tài khoản cùng hãng để lách hạn mức (quota evasion)**. Chuyển tự động giữa các tài khoản cùng một hãng mặc định **TẮT** (tuân thủ điều khoản của OpenAI [S8] và Anthropic [S5] về sử dụng cá nhân).
6. **Khi hết hạn mức ở mọi nhà cung cấp hợp lệ:**
   - Chuyển tác vụ sang trạng thái chờ hạn mức (`WAITING_QUOTA`), giữ nguyên toàn bộ bài làm nháp và cho phép bạn học các nội dung tĩnh/đã có sẵn trong kho; **tuyệt đối không tự động rẽ nhánh sang đường gọi trả phí**.
7. **Điều kiện máy chạy Worker:**
   - Cần tiến trình Worker đang hoạt động để xử lý tự động. Khi máy tắt thì tác vụ tạm dừng; các báo cáo hiển thị từ bản chụp cũ (`snapshot`) phải ghi rõ mốc thời gian `as_of`, không gắn nhãn là dữ liệu thời gian thực.

---

## 2. Đối chiếu Thay đổi so với Phương án Cầu nối Phụ Bên Ngoài

| Hạng mục trước đây | Thiết kế chuẩn hóa tại Phụ lục 06A |
| :--- | :--- |
| Custom GPT là giao diện đồng hành chính | **Web học IELTS là giao diện chính duy nhất**; AI chạy phía sau qua các Adapter CLI thuê bao. |
| `chatgptCompanionBridge` riêng lẻ | Thay bằng **`aiExecutionGateway` trung lập nhà cung cấp** (`codex`, `claude-code`, `gemini-cli`). |
| Custom GPT Actions đọc/ghi trực tiếp vào App | **Hoãn khỏi MVP**; Worker nội bộ tự xử lý nên không cần mở cổng Endpoint Actions ra ngoài. |
| Dựa vào ChatGPT Scheduled Tasks để gọi GPTs | **Bỏ giả định này** (do Scheduled Tasks hiện không hỗ trợ Custom GPTs [S9]); dùng `Scheduler` nội bộ của ứng dụng để điều phối nhật ký và nhắc học. |
| Copy/paste thủ công là cầu nối chính | Chỉ giữ làm **phương án dự phòng cuối cùng (Manual Fallback)** khi mọi CLI đều lỗi; dữ liệu dán vào vẫn phải qua `resultValidator` kiểm tra trước khi lưu. |
| Telegram / Email tùy chọn | Giữ làm kênh nhận thông báo đẩy bổ sung (Outbox); không bắt buộc để chạy AI. |
| Cam kết "Chi phí bằng 0 tuyệt đối" | Cam kết chính xác: **Thiết kế chặn mọi đường inference tính phí theo lượt** (còn phí thuê bao tháng bạn đã mua sẵn và điện/máy tính). |
| Bật máy tự đồng bộ lịch sử chat sang ChatGPT | Worker chỉ xử lý hàng đợi tác vụ và đọc trạng thái chuẩn từ SQLite, không đồng bộ lịch sử hội thoại tự do. |
| Chia nhỏ bài thành nhiệm vụ 7A 10–15 phút | Chỉ chia nhỏ thành `7A` khi **giữ đủ phạm vi đo tối thiểu và điều kiện tiên quyết**; nếu 10 phút không đủ độ rộng để đo thì giao làm **Bài luyện** và giữ lịch kiểm chứng cho buổi đủ thời gian. |
| Lọc đáp án khỏi bản tóm tắt ngày (`Digest`) | Giữ và mở rộng thành **cơ chế kiểm soát quyền đọc file, tắt tool thừa của CLI, cô lập thư mục chạy (Clean Sandbox), cache và lịch sử phiên**. |
| AI ghi thẳng lịch học mới vào SQLite | AI chỉ tạo **Đề xuất điều chỉnh lịch (`replan_proposal`)**; Backend kiểm tra tính hợp lệ, bạn bấm xác nhận đúng phiên bản trên Web rồi Backend mới commit vào SQLite. |

---

## 3. Ba Adapter CLI Thuê bao, Xác thực và Cô lập Tài khoản

### A. Bảng Cấu hình Ba Adapter Chính thức
| Adapter | Cơ chế xác thực được chọn | Lệnh gọi chuẩn (Non-interactive) | Điều kiện bắt buộc trước khi chuyển sang `READY` |
| :--- | :--- | :--- | :--- |
| **`codex`** | `Sign in with ChatGPT` | `codex exec` *(nâng cấp dùng `app-server` khi cần đọc telemetry hạn mức [S11])* | CLI báo đúng tài khoản và quyền truy cập theo đường thuê bao ChatGPT, không dùng `OPENAI_API_KEY` [S1, S2]. |
| **`claude-code`** | Đăng nhập tài khoản `claude.ai` của người dùng | `claude -p` | Xác nhận gói Pro/Max hợp lệ, không đi qua Console/API hay cloud provider khác; **không dùng cờ `--bare`** (vì `--bare` bỏ qua đăng nhập thuê bao [S4]). |
| **`gemini-cli`** | `Sign in with Google` | `gemini -p` | Xác minh quyền lợi thuê bao (như Google AI Pro/Ultra hoặc tương đương [S10]) thực sự áp dụng cho CLI [S6, S7]. |

- **Không gán cứng (hard-code) thông số quảng cáo:** Không gán cứng tên model, số lượt còn lại hay giờ reset từ tài liệu quảng cáo. Hệ thống lưu `entitlement` thực tế quan sát được, phiên bản CLI đã chốt, danh sách model khả dụng và ngày xác minh gần nhất.
- **Đánh giá năng lực thực nghiệm (bao gồm Audio cho Speaking):**
  - Tên hãng không tự động là bằng chứng về chất lượng chấm IELTS hay khả năng xử lý âm thanh.
  - **Quy tắc riêng cho Speaking & Đa phương thức:** Chế độ headless qua `stdin` của các CLI lập trình chủ yếu xử lý văn bản (và hình ảnh trong thư mục được cấp). Do đó, hệ thống sử dụng công cụ xử lý âm thanh cục bộ (như `faster-whisper` chạy local miễn phí) để lấy bản chép lời, thời gian từng từ (word timestamps) và độ tự tin âm thanh; chỉ bật nhận định sâu về **Phát âm (`Pronunciation`)** qua Adapter khi đã xác minh thực nghiệm Adapter đó có đường nhận và phân tích trực tiếp file audio gốc. Khi chưa có đường audio trực tiếp vào model, hệ thống chỉ cảnh báo các vị trí từ có tín hiệu nhận diện không rõ để bạn tự nghe lại đối chiếu với audio gốc, giữ nhận định phát âm ở mức `Chưa đủ khả năng kết luận sâu`.

### B. Quy trình Đăng nhập 5 Bước và Cô lập Hồ sơ Thực thi (Profile Isolation)
1. Bạn bấm **“Thêm / Xác minh tài khoản”** trong trang `Cài đặt AI` trên Web local.
2. Backend khởi tạo yêu cầu onboarding; mở luồng đăng nhập chính thức của CLI để bạn trực tiếp đăng nhập trên trình duyệt/terminal.
3. Worker chạy kiểm tra danh tính (`inspectAuth`), loại quyền lợi (`inspectEntitlement`) và chạy 1 tác vụ mẫu nhỏ để xác nhận đường thuê bao hoạt động.
4. Chỉ chuyển trạng thái sang `READY` khi xác nhận không đi qua đường tính phí API và kết quả mẫu hợp lệ; nếu chưa rõ thì giữ ở `NEEDS_VERIFICATION`.
5. Cơ sở dữ liệu Web chỉ lưu: `nhãn hiển thị`, `provider`, `profile_id`, `runner_ref` và `trạng thái`; **tuyệt đối không lưu mật khẩu, OAuth token hay cookie vào SQLite hay gửi về trình duyệt**.
- **Cô lập thông tin xác thực:** Mỗi profile thuộc một runner cô lập có khóa thực thi riêng (dùng cơ chế chính thức như `CLAUDE_CONFIG_DIR` của Claude [S3] hoặc môi trường người dùng tách biệt; không tự ý tráo file auth khi worker đang chạy, không đưa thư mục chứa credential vào workspace học tập, file log hay bản sao lưu bài học).

---

## 4. Kiến trúc Thực thi Trung lập Nhà cung cấp (`aiExecutionGateway`)

```text
[Giao diện Web Học IELTS]
   ↓
[Backend: Xác thực phiên, Lưu Snapshot bài làm, Chạy Rule Engine]
   ↓
[Context Builder: Kiểm tra quyền trước truy xuất -> Đóng gói ngữ cảnh tối thiểu + Manifest Hash]
   ↓
[Durable Job Queue (SQLite)]
   ↓
[Router & Subscription Guard: Kiểm tra thuê bao, Năng lực, Quota, Quyền nhận dữ liệu]
   ↓
[Worker + Provider Adapter (Chạy CLI trong Thư mục Sandbox Sạch, Đóng stdin/EOF ngay)]
   ↓
[Result Validator: Bóc tách Envelope -> Kiểm tra JSON Schema -> Kiểm tra Bằng chứng & Tiết lộ]
   ↓
[Database Transaction: Lưu kết quả (Khóa Idempotency + Fencing Token) & Cập nhật Workflow]
   ↓
[Web nhận cập nhật trạng thái qua Server-Sent Events (SSE) hoặc Polling]
```

---

## 5. Hợp đồng Gọi CLI, Chống Treo Ngầm & Tắt Công Cụ Lập Trình Thừa

### A. Cấu trúc Job Nội bộ Chuẩn hóa
```json
{
  "job_id": "job_001",
  "idempotency_key": "attempt_42:assess:v1",
  "task_type": "writing.assess",
  "phase": "assessment",
  "attempt_id": "attempt_42",
  "attempt_generation": 1,
  "snapshot_version": 1,
  "billing_policy": "subscription_only",
  "required_capabilities": ["text", "structured_result"],
  "eligible_providers": ["codex", "claude-code", "gemini-cli"],
  "context_manifest_id": "ctx_001",
  "rubric_version": "writing_v1",
  "schema_version": "assessment_v1",
  "limits": {
    "max_attempts_total": 3,
    "timeout_seconds": 180
  }
}
```

### B. Giao diện chuẩn của mỗi `providerAdapter`
Mỗi Adapter cài đặt thống nhất 6 phương thức: `inspectAuth()`, `inspectEntitlement()`, `readQuotaIfSupported()`, `execute(job, context)`, `cancel(run)`, và `normalizeResult()`. (Trường nào hãng không cung cấp dữ liệu thì trả về `null` kèm nguồn/thời điểm quan sát, tuyệt đối không giả lập số liệu quota).

### C. Năm Quy tắc An toàn Cấp Tiến trình khi Gọi CLI (Process-Level Safeguards)
1. **Truyền qua `stdin`, không ghép chuỗi lệnh Shell:** Worker gọi `spawn` với mảng tham số `argv` cố định và `shell = false`; toàn bộ gói ngữ cảnh và bài làm của người học được truyền qua luồng `stdin` để chống lỗi ký tự đặc biệt và Command Injection.
2. **Đóng ngay `stdin` (`EOF`) và ép chế độ Non-Interactive để chống treo ngầm:**
   - Ngay sau khi ghi xong gói dữ liệu vào `stdin`, Worker phải gọi `stdin.end()` (gửi tín hiệu `EOF`) ngay lập tức và đặt môi trường không tương tác (`CI=true`, không cấp PTY/TTY tương tác).
   - Đóng EOF và chế độ không tương tác giúp hạn chế chờ nhập liệu nhưng **không bảo đảm CLI thoát ngay** khi hỏi `[Y/n]` hoặc còn tác vụ nền. Worker bắt buộc có timeout độc lập, giới hạn output, hủy cả cây tiến trình theo cơ chế đã kiểm chứng trên Windows và dùng fencing token để từ chối kết quả muộn; không suy mã lỗi chỉ từ việc stdin đã đóng.
3. **Chạy trong Thư mục Sandbox Sạch & Tắt Công cụ Lập trình Nội bộ của CLI:**
   - Tiến trình CLI được khởi chạy trong một **thư mục tạm hoàn toàn trống hoặc chỉ chứa đúng file tài nguyên được phép xem của bước đó** (không chứa file `.db`, không chứa kho đáp án, và không chứa các file cấu hình lập trình như `CLAUDE.md`, `GEMINI.md`, `AGENTS.md` ngoài ý muốn).
   - **Thư mục sạch không tự tạo ranh giới bảo mật đọc file.** Runner phải thực thi quyền đọc đúng danh sách tài nguyên được cấp, chặn truy cập ngoài phạm vi kể cả đường dẫn tuyệt đối, symlink/junction, cấu hình người dùng, hooks và plugin kế thừa. Cơ chế cô lập phải được kiểm chứng cho từng CLI/phiên bản; nếu chưa chứng minh được thì adapter chưa được chuyển READY. Không coi chế độ read-only là giới hạn phạm vi đọc.
   - Tắt hoặc giới hạn tối đa các công cụ đọc/ghi file và chạy lệnh bash mặc định của CLI lập trình để AI tập trung 100% vào nhiệm vụ phân tích IELTS từ `stdin` và giảm tiêu hao token ngầm cho định nghĩa công cụ thừa.
4. **Không dùng cờ bỏ qua toàn bộ kiểm soát an toàn** (như các cờ tự động chạy mọi lệnh hệ thống không kiểm soát).
5. **Bóc tách hai lớp JSON:** Định dạng `--output-format json` của CLI chỉ là lớp vỏ vận chuyển (Transport envelope); `resultValidator` phải bóc lớp vỏ này, parse phần nội dung nghiệp vụ bên trong, kiểm tra khớp `schema_version` rồi mới kiểm tra điều kiện bằng chứng.

---

## 6. Quản lý Hạn mức (Quota), Chuyển Nhà cung cấp & Xử lý Lỗi

### A. Máy Trạng Thái của Profile và Job
- **Trạng thái Profile tài khoản:** `NEEDS_LOGIN` | `NEEDS_VERIFICATION` | `READY` | `BUSY` | `COOLDOWN` | `QUOTA_EXHAUSTED` | `DISABLED`.
- **Trạng thái Job AI:** `QUEUED` | `RUNNING` | `VALIDATING` | `COMPLETED` | `WAITING_QUOTA` | `NEEDS_REVIEW` | `FAILED` | `CANCELLED`.

### B. Quy tắc Xử lý Từng Loại Lỗi & Chuyển Hãng (Tổng ngân sách tối đa 3 lần chạy/job)
| Mã lỗi quan sát được | Hành vi xử lý của Router & Worker |
| :--- | :--- |
| **`QUOTA_EXHAUSTED`** | Đánh dấu bucket/profile hết hạn mức (khóa đến thời điểm `reset_at` nếu hãng có trả về; nếu không rõ giờ reset thì chỉ kiểm tra lại khi bạn yêu cầu hoặc sau khoảng chờ dài đã cấu hình, không polling liên tục). Tự động chuyển sang hãng hợp lệ tiếp theo; **không chuyển sang đường tính phí**. |
| **`RATE_LIMIT` (Tạm thời)** | Tôn trọng `retry-after` và chờ lùi (backoff); không vội gắn nhãn là hết sạch hạn mức tuần/tháng. |
| **`AUTH_EXPIRED`** | Chuyển profile sang `NEEDS_LOGIN`, báo trên giao diện và chuyển hãng khác nếu có. |
| **`BILLING_UNVERIFIED`** | Chặn chạy ngay lập tức; không bao giờ "thử gọi 1 lần tính phí" để dò. |
| **`NETWORK / TIMEOUT`** | Thử lại trong ngân sách tối đa 3 attempt; tăng `attempt_generation` (fencing token) để nếu tiến trình cũ trả kết quả về muộn thì tự động bị từ chối commit. |
| **`INVALID_SCHEMA`** | Cho phép tối đa 1 lần gọi sửa định dạng JSON (nằm trong tổng trần 3 attempt); nếu vẫn sai cấu trúc thì chuyển sang `NEEDS_REVIEW`. |
| **`REFUSAL`** | Không tự động đổi hãng chỉ để lách việc từ chối; hiển thị hoặc đánh giá lại yêu cầu. |
| **`CAPABILITY_MISSING`** | Chọn hãng có đủ năng lực yêu cầu hoặc báo chưa hỗ trợ. |

- **Bảo toàn tính toàn vẹn khi đổi hãng:** Khi chuyển từ hãng A sang hãng B do hết quota, gửi lại đúng gói ngữ cảnh chuẩn tối thiểu (`context_manifest`), không gửi toàn bộ lịch sử chat dài dòng, và **không bao giờ cắt ghép một nửa bài chấm của hãng A với một nửa của hãng B**.

---

## 7. Nạp Dữ Liệu Tối Ưu Token & Tiết Kiệm Số Lượt Gọi Thuê Bao

### A. Quy trình 6 Bước Đóng Gói Ngữ Cảnh Trước Mỗi Lần Gọi
1. `Rule Engine` xác định loại tác vụ, pha thực thi và phạm vi dữ liệu được phép nhìn thấy.
2. Lọc quyền trên kho tri thức trước khi tra cứu (dùng **SQLite FTS/BM25 và lọc Metadata trực tiếp**, không tốn phí gọi API Embedding).
3. Nạp đúng phiên bản `Rubric / Đặc tả kỹ năng / Thẻ chẩn đoán` đã qua QC và đang được khóa cho lượt làm bài đó.
4. Đính kèm bài làm gốc, trạng thái phiên có cấu trúc (`structured session state`) và phần hồ sơ năng lực liên quan trực tiếp.
5. Ước tính kích thước token; cắt bớt dữ liệu tham khảo tùy chọn nếu vượt ngân sách mục tiêu (nếu phần bằng chứng bắt buộc quá dài thì tách bước workflow hợp lệ, không cắt cụt bài làm của người học).
6. Ghi bản kê `context_manifest` kèm mã băm (`input_hash`) để phục vụ kiểm chứng, bộ nhớ đệm (`result_cache`) và chuyển hãng.

### B. Ngân Sách Token Mục Tiêu (Dùng để giám sát tối ưu nội bộ)
- *Báo cáo ngày / Đề xuất lịch:* Input `800–2.000` tokens | Output `250–800` tokens.
- *Đánh giá một lượt tự sửa / Gợi mở bổ sung:* Input `1.200–2.500` tokens | Output `200–500` tokens.
- *Chấm toàn bài Writing (gộp nhận định + gợi mở ban đầu):* Input `3.000–6.000` tokens | Output `800–1.500` tokens.

### C. Bốn Chiến Lược Tiết Kiệm Hạn Mức Thuê Bao Trọng Tâm
1. **Gộp sinh sẵn Gợi mở 3 nấc cho các trọng tâm ưu tiên ngay trong lần gọi Đánh giá (Bước 4):**
   - Trong 1 lần gọi chấm bài ở Bước 4, yêu cầu mô hình trả về đồng thời các nhận định chẩn đoán VÀ gói gợi mở dự kiến (Nấc 1, Nấc 2, Giải thích ngắn) cho 2–3 trọng tâm ưu tiên.
   - Backend kiểm tra chính sách tiết lộ rồi lưu sẵn vào trạng thái phiên; khi người học bước sang Bước 5, các nấc gợi mở được cấp phát tức thì từ SQLite (0 giây chờ đợi, không tốn thêm lượt gọi CLI). Chỉ khi người học gửi **bản tự sửa mới** lên thì Worker mới gọi CLI để chấm bản sửa đó.
2. **Không gọi tách lẻ từng tiêu chí trên cùng một bài làm:** Chấm `TR/TA, CC, LR, GRA` và trích xuất nhận định vi kỹ năng trong cùng một lần gọi của pha Đánh giá (nhưng tuyệt đối không gộp Pha Giải mù với Pha Đối chiếu kiểm duyệt).
3. **Chỉ gọi Thẩm định lại (Second-opinion) khi có tín hiệu mơ hồ hoặc khiếu nại:** Không mặc định gọi cả 3 hãng cùng chấm một bài thông thường.
4. **Bộ nhớ đệm kết quả chặt chẽ (`Result Cache`):** Chỉ tái sử dụng khi khớp đồng thời `input_hash`, vai trò, pha, phiên bản chính sách/rubric/tri thức, model và mức tiết lộ; **một lần lấy từ cache (cache hit) không bao giờ được đếm thành một lần bằng chứng học tập mới**. Khi một đơn vị tri thức chuyển sang `Suspended/Retired`, tự động xóa cache liên quan.

---

## 8. Cơ Chế Chặn Phát Sinh Phí (`subscriptionGuard`)

Trước mỗi lần đẩy job vào Adapter CLI, `subscriptionGuard` thực thi 6 chốt chặn:
1. Tạo môi trường biến (Environment variables) theo danh sách trắng (`allowlist`); **loại bỏ triệt để mọi biến `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`, cấu hình Vertex/Bedrock hoặc proxy tính phí** kế thừa từ máy chủ.
2. Kiểm tra trực tiếp trạng thái cấu hình và chế độ đăng nhập của CLI (`inspectAuth / inspectEntitlement`), không chỉ dựa vào việc xóa biến môi trường.
3. Chỉ cho phép gọi các model nằm trong danh sách quyền lợi thuê bao đã xác minh.
4. Kiểm tra và nhắc xác nhận định kỳ rằng tính năng tự động nạp thêm tiền (`extra usage / auto-recharge / pay-as-you-go`) đang **TẮT** trên tài khoản của hãng; giao diện hiển thị trung thực mức độ kiểm chứng được của từng hãng.
5. Tắt mọi plugin bên thứ ba hoặc công cụ mở rộng có nguy cơ gọi ra dịch vụ tính phí bên ngoài.
6. Nếu phát hiện bất kỳ dấu hiệu không rõ ràng nào về đường thanh toán (`BILLING_UNVERIFIED`) $\rightarrow$ **Dừng ngay lập tức**, không chạy thử.

---

## 9. Theo Dõi Học Hằng Ngày (`Daily Tracking`) & Lập Lại Lịch (`Adaptive Re-planning`)

1. **Bốn nhóm chỉ số theo dõi + Trạng thái thực tế:**
   - Theo dõi: (1) *Thời gian & Cam kết*, (2) *Tiến độ đóng vòng lặp*, (3) *Biến động Bằng chứng & Sổ lỗi*, (4) *Độ lệch lộ trình*.
   - Bổ sung các trạng thái ngày học trung thực: `Nghỉ có kế hoạch (Planned Rest)`, `Thiếu dữ liệu quan sát (Missing Telemetry)` và `Offline`; ghi nhận thời gian đọc, nghe và suy nghĩ qua trạng thái phiên/audio/sản phẩm thay vì coi việc không gõ phím là không học.
2. **Nguyên tắc lập lịch bù không gây quá tải (Anti-Overload Re-planning):**
   - Không lấy việc nghỉ học hay thiếu giờ để tự động hạ trạng thái năng lực; bỏ lỡ buổi học **không tạo ra "nợ số phút cộng dồn"** bắt học bù gấp đôi vào hôm sau.
   - Lọc các nhiệm vụ hợp lệ trước, sau đó sắp xếp theo trọng số ưu tiên, thời hạn kiểm chứng và ngưỡng chống trì hoãn của Phần 2.
   - Chỉ chia nhỏ thành bài kiểm chứng `7A` khi thời gian còn lại vẫn đủ phạm vi đo kỹ năng đó; nếu chỉ có 10 phút mà kỹ năng cần viết/làm bài dài hơn, hệ thống chọn **Bài luyện tập** phù hợp và xếp lịch kiểm chứng vào buổi có đủ thời gian.
   - Khi mục tiêu vượt quá quỹ thời gian thực tế kéo dài, hệ thống đề xuất thu hẹp phạm vi ưu tiên hoặc dời mốc mục tiêu thay vì âm thầm nhồi thêm bài.
3. **Quy trình xác nhận Đề xuất Điều chỉnh Lịch (`Replanning Proposal`):**
   - Mỗi đề xuất gồm: `proposal_id`, `base_plan_version`, `changes`, `reasons`, `estimated_minutes`, `expires_at`.
   - Bạn xem trước trên Web và bấm xác nhận; Backend kiểm tra `base_plan_version` chưa bị thay đổi rồi mới ghi vào SQLite (chống xác nhận lặp). Khi hết quota AI, hệ thống vẫn tạo được lịch điều chỉnh và thông báo nhắc học bằng bộ quy tắc xác định của `Rule Engine`.
   - Múi giờ tính ngày học mặc định theo `Asia/Bangkok` (UTC+7), lưu mốc thời gian chuẩn UTC trong cơ sở dữ liệu; `Scheduler` lưu `last_run` để không gửi thông báo trùng sau khi mở lại máy.

---

## 10. Các Bảng Dữ Liệu Bổ Sung & Lộ Trình Nghiệm Thu Thực Tế

### A. Mười Bảng Dữ Liệu Vận Hành Bổ Sung Trong SQLite
`ai_accounts` *(không lưu mật khẩu/token)*, `provider_capabilities`, `quota_observations`, `ai_jobs`, `ai_runs`, `context_manifests`, `result_cache`, `daily_study_logs`, `replan_proposals`, và `notification_outbox`.

### B. Năm Bước Nghiệm Thu & 12 Tình Huống Kiểm Thử Bắt Buộc
1. **Bước 1:** Xác minh 3 CLI (`codex`, `claude-code`, `gemini-cli`) và onboard từng tài khoản qua luồng đăng nhập thuê bao chính thức.
2. **Bước 2:** Chạy thông suốt 1 vòng học Writing end-to-end với 1 Adapter, `Durable Job Queue`, `subscriptionGuard`, kiểm tra Schema và commit chống trùng.
3. **Bước 3:** Tích hợp 2 Adapter còn lại; kiểm thử chuyển hãng khi hết quota bằng dữ liệu giả lập (`fixture/mock`), không cố tình đốt hết quota thật để test.
4. **Bước 4:** Chạy bộ bài đối chứng dùng chung để đo và so sánh chất lượng chấm/gợi mở thực tế giữa các model trước khi bật làm phương án dự phòng.
5. **Bước 5:** Hoàn thiện tra cứu FTS/BM25, cache, `Daily Tracker`, đề xuất lịch bù và hộp thư thông báo.
- **12 Ca kiểm thử bắt buộc:** *(1) Hết quota hãng A tự chuyển sang hãng B đúng dữ liệu; (2) Cả 3 hãng hết quota thì chuyển sang `WAITING_QUOTA` an toàn; (3) Hết hạn đăng nhập (`AUTH_EXPIRED`); (4) Biến môi trường chứa API key vô tình tồn tại trên máy bị chặn sạch; (5) Trạng thái thanh toán không rõ bị chặn chạy; (6) CLI trả JSON lỗi cấu trúc; (7) Timeout rồi tiến trình cũ trả kết quả về muộn bị chặn bởi fencing token; (8) Khởi động lại Worker giữa chừng; (9) Nguồn tri thức bị thu hồi làm vô hiệu cache; (10) Lịch gốc thay đổi trước khi bấm xác nhận proposal; (11) CLI cố tình đọc file đáp án ngoài phạm vi bị chặn bởi quyền thực thi đã kiểm chứng, kể cả đường dẫn tuyệt đối và cấu hình/tool kế thừa (không chỉ kiểm tra thư mục sạch); (12) Đổi hãng giữa các bước gợi mở và yêu cầu chấm phát âm khi thiếu đường audio trực tiếp.*

---

## 11. Tài liệu Tham chiếu Chính thức
- [S1 — Codex authentication](https://learn.chatgpt.com/docs/auth) & [S2 — Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode)
- [S3 — Claude Code authentication](https://code.claude.com/docs/en/authentication), [S4 — Claude Code programmatic execution](https://code.claude.com/docs/en/headless) & [S5 — Claude Code legal and compliance](https://code.claude.com/docs/en/legal-and-compliance)
- [S6 — Gemini CLI authentication](https://geminicli.com/docs/get-started/authentication/) & [S7 — Gemini CLI headless](https://geminicli.com/docs/cli/headless/)
- [S8 — OpenAI Terms of Use](https://openai.com/policies/terms-of-use/) & [S9 — ChatGPT Scheduled Tasks](https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt)
- [S10 — Gemini CLI quotas and pricing](https://geminicli.com/docs/resources/quota-and-pricing/) & [S11 — Codex app-server](https://learn.chatgpt.com/docs/app-server)

## 12. Ghi chú rà soát triển khai — 19/10/2026
- Làm rõ giới hạn EOF và thư mục sạch tại §5, cập nhật ca 11 tại §10; giữ nguyên mục tiêu cô lập ngữ cảnh và subscription_only. Đây là bổ sung kỹ thuật để tránh bảo đảm vượt quá khả năng thực tế.
- Theo dõi điều kiện bật adapter thật ở [DECISIONS](engineering/DECISIONS.md), kết quả rà soát ở [READINESS_REVIEW](engineering/READINESS_REVIEW.md).
