# Hướng dẫn sử dụng hệ thống Study English

Tài liệu này là **sổ tay vận hành** cho người dùng: cài đặt, chạy, học trên giao diện, quản trị AI thật, sao lưu, xử lý sự cố. Đặc tả nghiệp vụ nằm ở `docs/00–06A`; quyết định kỹ thuật ở [DECISIONS](engineering/DECISIONS.md); tiến độ ở [PROGRESS](../PROGRESS.md).

> **Cách tài liệu này tự cập nhật.** Các khối có nhãn *Tự động* (bảng lệnh, route API, cờ worker, migration, quyết định, trạng thái) được sinh từ mã nguồn bằng `npm.cmd run docs:guide`. `npm.cmd run check` chạy `docs:guide -- --check` và **thất bại** nếu hướng dẫn lệch mã, nếu có lệnh/route/cờ mới chưa được mô tả, hoặc còn mô tả cho thứ đã bị xóa. Phần viết tay được AI lập trình cập nhật theo quy định trong [AGENTS.md](../AGENTS.md) mỗi khi tính năng hay cách dùng thay đổi. Xem mục [13](#13-cách-tài-liệu-này-được-giữ-đúng).

## Mục lục
1. [Hệ thống gồm những gì](#1-hệ-thống-gồm-những-gì)
2. [Cài đặt lần đầu](#2-cài-đặt-lần-đầu)
3. [Chạy hằng ngày](#3-chạy-hằng-ngày)
4. [Học trên giao diện](#4-học-trên-giao-diện)
5. [Builder & QC](#5-builder--qc)
6. [AI thật: gateway thuê bao](#6-ai-thật-gateway-thuê-bao)
7. [Worker và hàng đợi AI](#7-worker-và-hàng-đợi-ai)
8. [Sao lưu, khôi phục và xuất dữ liệu](#8-sao-lưu-khôi-phục-và-xuất-dữ-liệu)
9. [Relay AI lập trình và ai-router](#9-relay-ai-lập-trình-và-ai-router)
10. [Kiểm tra và phát triển](#10-kiểm-tra-và-phát-triển)
11. [Xử lý sự cố](#11-xử-lý-sự-cố)
12. [Giới hạn hiện tại](#12-giới-hạn-hiện-tại)
13. [Cách tài liệu này được giữ đúng](#13-cách-tài-liệu-này-được-giữ-đúng)
14. [Tra cứu tự động](#14-tra-cứu-tự-động)

---

## 1. Hệ thống gồm những gì

Ứng dụng học IELTS cá nhân chạy hoàn toàn trên máy (web local, một người dùng). Các thành phần:

| Thành phần | Vai trò | Chạy bằng |
|---|---|---|
| **Backend** (`src/server`) | API cục bộ ở `127.0.0.1:4317`, phiên + CSRF, mở dữ liệu trong `var/`; khi đã build thì phục vụ luôn giao diện | `npm.cmd run app` (dùng hằng ngày) hoặc `npm.cmd run dev:server` (phát triển) |
| **Giao diện web** (`src/web`) | Học hôm nay, Workspace, Reading, Luyện nói, Tiến độ, Cài đặt, Builder & QC | cùng địa chỉ http://127.0.0.1:4317 khi chạy `app`; khi phát triển: `npm.cmd run dev` → http://127.0.0.1:5173 |
| **Worker** (`src/worker`) | Lấy job AI trong hàng đợi, gọi AI thật qua gateway, ghi kết quả có kiểm tra | `npm.cmd run worker` |
| **Gateway AI** (`src/infrastructure/ai/gateway`) | Chỉ gọi CLI thuê bao (Codex, Claude Code, Antigravity) khi đủ bằng chứng D-01; không bao giờ dùng API tính phí | dùng bởi worker |
| **Lõi định tuyến** (`src/infrastructure/ai/router-core`) | Bản sao lõi ai-router: nhận diện hết hạn mức/giới hạn tốc độ/mất đăng nhập, giờ mở lại | `npm.cmd run router:sync` |
| **Dữ liệu** (`var/`) | SQLite (`var/db/study.db`), kho JSON bất biến, media (audio), backup | tự tạo khi chạy |
| **CLI quản trị** | `ai` (AI thật), `backup`, `worker` | `npm.cmd run <lệnh> -- …` |
| **Relay** (`scripts/relay`) | Công cụ cho AI lập trình (không phải AI của app học) | `npm.cmd run relay -- …` |

Nguyên tắc chung bạn sẽ gặp khắp hệ thống:
- **AI chỉ đề xuất**; ứng dụng kiểm tra rồi mới ghi nhận. Thiếu căn cứ thì chặn, không đoán.
- **Không lộ đáp án**: đề giải mù, gợi ý mở theo nấc ở server; xem lời giải, tự sửa có hỗ trợ và làm độc lập được tính khác nhau.
- **Chưa báo Band** (chờ bộ đối chứng D-05). Mức năng lực được kết luận theo [chính sách D-02 v1](engineering/D02_PROPOSAL.md) đã duyệt (chưa kiểm định thực nghiệm), **chỉ từ bài làm thật** của bạn: kết quả synthetic không được tính.
- Dữ liệu cá nhân (bài làm, audio, DB) **chỉ nằm trong `var/`**, không commit.

## 2. Cài đặt lần đầu

Yêu cầu: Windows, Node **22.18.0** trở lên (bản 22), npm 10. Trong PowerShell dùng `npm.cmd`.

```powershell
npm.cmd ci
```

```powershell
npm.cmd run check
```

`check` đạt nghĩa là cài đúng. Không cần đăng nhập AI để dùng phần học với dữ liệu synthetic.

Tùy chọn:
- Đặt `ai-router` cạnh thư mục dự án (`..\ai-router`) nếu dùng relay hoặc đồng bộ lõi định tuyến.
- Muốn dùng AI thật: làm theo [mục 6](#6-ai-thật-gateway-thuê-bao).

## 3. Chạy hằng ngày

Mở một terminal tại thư mục gốc của repo (bắt buộc chạy từ root để nạp migration) và chạy:

```powershell
npm.cmd run app
```

Lệnh này build rồi chạy giao diện + API ở **http://127.0.0.1:4317**. Nếu không đổi code từ lần build trước, `npm.cmd start` khởi động nhanh hơn (không build lại).

Khi phát triển (sửa code, muốn tự tải lại), dùng hai terminal thay vì `app`, rồi mở http://127.0.0.1:5173:

```powershell
npm.cmd run dev:server
```

```powershell
npm.cmd run dev
```

Khi có job AI cần xử lý (chấm bài, QC), mở thêm một terminal:

```powershell
npm.cmd run worker
```

Dừng: `Ctrl+C` trong từng terminal (đừng đóng cửa sổ npm đột ngột, có thể sót tiến trình node).

Lưu ý:
- Backend chỉ nghe `127.0.0.1`; **không** mở ra LAN/Internet.
- Lần đầu chạy sau khi cập nhật code, backend tự áp migration mới vào `var/db/study.db`. Nên `npm.cmd run backup -- create` trước khi cập nhật lớn.
- Trạng thái AI thật (provider nào Sẵn sàng) xem ở **Cài đặt & Mục tiêu**.
- **Chạy thử trên dữ liệu riêng** mà không đụng `var/`: đặt `STUDY_ENGLISH_DATA_DIR` (thư mục dữ liệu khác) và, nếu bản thật đang chạy, `STUDY_ENGLISH_PORT` (ví dụ 4327):
  ```powershell
  $env:STUDY_ENGLISH_DATA_DIR = "D:\study-english-thu"; $env:STUDY_ENGLISH_PORT = "4327"; npm.cmd start
  ```
  Mở http://127.0.0.1:4327. Đóng terminal (hoặc xóa hai biến) để quay về dữ liệu thật. `STUDY_ENGLISH_SERVE_WEB=0` tắt phục vụ giao diện (chỉ API).

## 4. Học trên giao diện

Thanh điều hướng: **Học hôm nay** · **Tiến độ** · **Builder & QC**, và nút **Cài đặt & Mục tiêu** ở góc trên.

### 4.1. Cài đặt & Mục tiêu
Nhập Band mục tiêu tổng và từng kỹ năng, loại thi (Academic/General), ngày thi dự kiến, **số phút học mỗi ngày** và **mỗi tuần**. Số phút/ngày là quỹ thời gian mặc định cho mỗi ngày học. Màn này cũng cho xem trạng thái gateway AI, và khung **Dữ liệu của bạn** (dung lượng, sao lưu tự động: bản gần nhất và kết quả diễn tập, nút xuất dữ liệu; xem [mục 8](#8-sao-lưu-khôi-phục-và-xuất-dữ-liệu)).

### 4.2. Học hôm nay
- **Ngày học hôm nay** (theo giờ Việt Nam):
  - Lời nhắc học trong ứng dụng, tối đa 1 lần/ngày; bấm *Đã xem* để ẩn.
  - *Hôm nay nghỉ có kế hoạch*: ngày được ghi là nghỉ, quỹ = 0, không nhắc. Bấm lại để bỏ.
  - *Quỹ thời gian hôm nay*: đổi số phút chỉ cho hôm nay.
  - *Đã học ngoài ứng dụng*: ghi ngày học offline, kèm số phút tự khai (không bắt buộc). Phút tự khai hiển thị tách biệt với phút đo được.
- **Tiếp tục bài đang làm**: bài Writing còn dở hiện ở đầu.
- **Quỹ thời gian phiên này** và **chế độ làm bài**: *Có hướng dẫn*, *Tự luyện*, *Mô phỏng thi* (ẩn mọi hỗ trợ). Bấm *Cập nhật danh sách nhiệm vụ* để lọc nhiệm vụ vừa với số phút.
- **Nhiệm vụ đề xuất** kèm lý do và nhãn mục đích: bài học/luyện, kiểm chứng 7A, tổng hợp 7B, ôn giãn cách Bước 9. Danh sách được xếp theo **điểm ưu tiên D-02** (hiện ngay dưới mỗi nhiệm vụ): ảnh hưởng + độ chắc chắn + tần suất lỗi + liên quan mục tiêu (mỗi phần 0–3) + thời hạn (+3 đến hạn hôm nay, +5 quá hạn) + đã chờ (+1 mỗi 3 ngày, tối đa +3). Nhiệm vụ kiểm chứng bị bỏ qua 3 buổi học hoặc quá hạn hơn 7 ngày được **giữ chỗ đầu danh sách** (mỗi buổi một nhiệm vụ).
- **Đề xuất sắp xếp lại lịch** (chỉ hiện khi cần): khi có nhiệm vụ trễ quá 1 ngày và tổng phút (trễ + đến hạn 3 ngày tới) vượt quỹ 3 ngày tới, hệ thống đề xuất dời nhiệm vụ sang các ngày tới, không ngày nào vượt quỹ, tối đa 1 bài kiểm chứng/ngày, không cắt nhỏ bài kiểm chứng. Nếu 14 ngày qua bạn học dưới 60 % quỹ (không tính ngày nghỉ có kế hoạch), đề xuất kèm gợi ý thu hẹp phạm vi hoặc dời mốc thi. **Không có gì thay đổi cho tới khi bạn bấm** *Áp dụng lịch mới* hoặc *Giữ nguyên lịch*; đề xuất hết hạn sau 48 giờ và tối đa 1 đề xuất mỗi ngày.
- Phía dưới cùng màn: **Reading** và **Luyện nói (audio mẫu)**.

### 4.3. Workspace Writing (vòng học)
1. Viết bài; nháp **tự lưu lên server** (hoặc bấm *Lưu nháp ngay*). Tải lại trang không mất bài.
2. *Hỗ trợ đầu vào* (dàn ý, khung từ vựng) chỉ có ở chế độ hướng dẫn/tự luyện.
3. **Nộp bài** → nhận chẩn đoán tối đa 1–2 lỗi trọng tâm.
4. **Tự sửa (Bước 5)**: mở gợi mở theo nấc 1 → 2 → 3 (mỗi nấc ghi lại mức hỗ trợ đã dùng), hoặc chọn *Để mình thử thêm* / *Giải thích trực tiếp*. Gửi **bản sửa** mới được chấm lại.
5. **Bước 6**: bài học nhỏ + câu kiểm tra khái niệm.
6. **Làm bài kiểm chứng 7A**: một bài mới, không gợi ý, để xem bạn tự áp dụng được chưa. Lịch theo D-02 (mục C):
   - Đạt 7A → xếp **7B** từ ngày hôm sau. Chưa đạt 7A → quay về củng cố Bước 6, không bắt làm lại 7A ngay.
   - Đạt 7B → mở **Bước 9** sau 3 ngày; mỗi lần đạt, khoảng cách giãn ra 3 → 7 → 14 → 30 → 60 ngày. Chưa đạt 7B → luyện thêm rồi làm lại 7B sau 2 ngày. Chưa đạt Bước 9 → quay về khoảng 3 ngày.
   - Bài tổng hợp (luyện tập/thi thử) làm khi Bước 9 đã đến hạn được **tính luôn cho Bước 9** nếu là bài độc lập và có cơ hội dùng cấu trúc.
   - Bài không có cơ hội dùng cấu trúc → *chờ cơ hội*, không tính đạt/chưa đạt; sau 2 bài như vậy (hoặc chờ quá 7 ngày) hệ thống giao một bài ôn ngắn có ràng buộc tình huống.
   - Chỉ kết quả **độc lập** (không gợi ý, bài mới) mới đẩy chuỗi kiểm chứng.

Kết quả hiện tại là **synthetic** (FakeAdapter) trừ khi worker chạy với AI thật. Lịch kiểm chứng vẫn chạy với dữ liệu synthetic để bạn thử luồng, nhưng **mức năng lực không tính kết quả synthetic** (quy tắc G0), nên hồ sơ sẽ ở *Chưa đủ dữ liệu* cho tới khi có bài chấm thật.

### 4.4. Reading
Chọn bài → làm trên đề **giải mù** (không có đáp án trong trang) → nộp. Gợi ý theo nấc; nấc 3 mới mở đáp án + giải thích và được ghi là đã xem lời giải. Chế độ thi không có gợi ý. Bài bị thu hồi ngừng cấp phát ngay.

### 4.5. Luyện nói (audio mẫu)
Thu âm (WAV/WebM/OGG, tối đa 8 MiB), nghe lại, thu lại; mọi bản thu lưu cục bộ có SHA-256. Chưa có nhận dạng giọng nói (ASR: chờ D-06): bạn tự chép lời, rồi có thể xin nhận xét **dạng văn bản**. **Audio không bao giờ được gửi cho AI**, và không có điểm Band Speaking.

### 4.6. Tiến độ
- **Theo dõi 7 ngày**: trạng thái từng ngày (*Có ghi nhận học*, *Nghỉ có kế hoạch*, *Học ngoài ứng dụng / offline*, *Thiếu dữ liệu quan sát*, *Hôm nay: chưa có dữ liệu*), phút ghi nhận / quỹ (chia theo viết, đọc, nghe, nói), vòng học (bắt đầu / nộp / sửa / nhiệm vụ xong), nhận định (đạt / chưa đạt / chưa kết luận), độ lệch lộ trình (nhiệm vụ đã đến hạn), kèm thời điểm tính.
- Thời gian học được ghi **tự động mỗi phút** khi màn Workspace/Reading/Luyện nói đang hiển thị hoặc audio đang phát; không cần gõ phím. Mất mạng thì trình duyệt giữ lại và gửi sau.
- Ngày không có dữ liệu **không** bị coi là bỏ học; thiếu giờ **không** cộng dồn sang ngày sau và **không** làm giảm hồ sơ năng lực.
- **Hồ sơ năng lực** theo 4 thành phần, chỉ từ dữ liệu thật trong DB; báo Band đang tắt. Dòng *Nhận định hiện tại* cho:
  - **Mức** A1–A6: *Chưa đủ dữ liệu* → *Cần hỗ trợ* → *Tự sửa được khi có gợi ý* (bản sửa đạt khi chỉ mở tới nấc 2; mở nấc 3 là đã xem lời giải, không tính) → *Vận dụng bước đầu trong nhiệm vụ ngắn* → *Vận dụng được trong bài tổng hợp* → *Duy trì ổn định* (2 lần đạt Bước 9 cách nhau ≥ 7 ngày).
  - **Độ tin cậy**: *Chưa xác lập* / *Thấp* / *Trung bình* (≥ 2 nguồn, ≥ 2 ngày, ≥ 2 họ bài) / *Cao* (≥ 3 nguồn, ≥ 2 họ bài, ≥ 2 điều kiện, 3 lần gần nhất đều đạt).
  - **Mức theo từng điều kiện làm bài** (phương thức × tự luyện/thi thử × giảm tải × loại ràng buộc): đạt ở tự luyện không suy ra đạt ở thi thử. Một lần chưa đạt độc lập chỉ đánh dấu *cần kiểm tra lại*; 2 lần liên tiếp ở 2 bài khác nhau cùng điều kiện mới hạ một mức. Không bao giờ hạ vì nghỉ học hay quá hạn.
  - Bấm *Lý do* để xem căn cứ từng kết luận. Mỗi kết luận được lưu lịch sử kèm phiên bản chính sách (bảng `competency_conclusions`).
- **Yêu cầu xem xét lại** một nhận định: nhập lý do, bấm nút cạnh nhận định. Hệ thống tạo job tái đánh giá (worker `--complaints` xử lý), giữ nguyên bản cũ và lịch sử.

## 5. Builder & QC

Dành cho việc tạo/kiểm định gói nội dung. Ba tab:
- **Tìm trong kho tri thức** (đầu tab Gói tri thức): gõ từ khóa (gõ không dấu cũng được), chọn **vai trò** để xem đúng những gì vai trò đó được phép thấy (ví dụ `blind_solver` không bao giờ thấy đáp án), bấm *Tìm*. Kết quả xếp theo BM25, chỉ hiện tham chiếu + tiêu đề, không hiện nội dung; muốn xem nội dung thì mở gói bên dưới (được ghi vào nhật ký tiếp xúc). Nội dung bị thu hồi hoặc gói đã loại bỏ biến mất khỏi kết quả ngay. *Dựng lại chỉ mục* tạo lại chỉ mục từ các file JSON (an toàn, không mất dữ liệu).
- **Gói tri thức**: chạy QC1–3 (kiểm tra xác định), xác nhận QC2/QC3 ngữ nghĩa trên đúng hash, chạy QC4 (giải mù + đối chiếu bằng AI qua worker), **Phát hành** khi đủ QC1–4, **Ngừng**/**Loại bỏ**, xem nội dung (được ghi vào nhật ký tiếp xúc để không dùng bài đã lộ làm bài kiểm chứng).
- **Cần xử lý**: review mở (sau thu hồi, khiếu nại…) và job bị dừng; chọn cách xử lý.
- **Lần chạy**: các lần chạy AI và trạng thái gateway.

Thu hồi một item/rubric/gói lan truyền tới cache và các nhận định liên quan (cả đạt và chưa đạt), giữ lịch sử.

## 6. AI thật: gateway thuê bao

Ứng dụng chỉ gọi AI qua **CLI của gói thuê bao** đã đăng nhập (Codex/ChatGPT, Claude Code/claude.ai, Antigravity/Google), mỗi provider dùng **profile riêng** của app (thư mục runner trong `%LOCALAPPDATA%\study-english\runners\…`). Không có đường API tính phí; thiếu bất kỳ căn cứ nào thì gateway chặn và không chạy gì.

### 6.1. Xem trạng thái
```powershell
npm.cmd run ai -- status
```
Mỗi provider hiện `READY` hoặc lý do bị chặn, model đang chọn, và thông tin phiên bản CLI (đổi phiên bản chỉ là thông tin, không chặn).

### 6.2. Bật một provider (một lần, theo D-01)
Tóm tắt; hướng dẫn chi tiết từng lệnh: [Codex](engineering/D01_CODEX_READ_BOUNDARY.md), [Claude Code và Antigravity](engineering/D01_CLAUDE_AGY.md), [P2_ACCEPTANCE](engineering/P2_ACCEPTANCE.md).
1. Tạo thư mục profile riêng, đăng nhập CLI trong profile đó bằng tài khoản thuê bao.
2. `npm.cmd run ai -- account <profile_id> <provider> <nhãn> <thư_mục_runner>`.
3. `npm.cmd run ai -- confirm-extra-usage <provider> off` sau khi tự kiểm tra trên trang tài khoản rằng *extra usage / auto-recharge* đang **tắt**.
4. `npm.cmd run ai -- probe-boundary <codex|claude|agy> --profile <dir>`: chứng minh CLI không đọc được file ngoài phạm vi.
5. `npm.cmd run ai -- verify <codex|claude|agy> --profile <dir>`: tốn vài prompt synthetic; ghi bằng chứng, không tự đặt VERIFIED.
6. Bạn duyệt file bằng chứng, rồi `npm.cmd run ai -- evidence <file.json> --boundary <báo_cáo_probe.json>`.
7. `npm.cmd run ai -- consent <provider> approved grant`: cho phép đúng 5 loại dữ liệu đã duyệt (audio người học luôn bị chặn).

### 6.3. Việc định kỳ
- **Mỗi 30 ngày**: xác nhận lại extra usage vẫn tắt (`confirm-extra-usage … off`), nếu không gateway chặn provider đó. `ai -- status` in hạn xác nhận.
- Đăng nhập hết hạn (`AUTH_EXPIRED`/`NEEDS_LOGIN`): đăng nhập lại trong profile riêng, `npm.cmd run ai -- recover <provider>`, rồi nạp lại bằng chứng (bước 6).

### 6.4. Model
- `npm.cmd run ai -- models <provider>`: model ứng viên và model được phép (không gọi AI).
- `npm.cmd run ai -- allow-models <provider> <m1,m2>`: khai báo model được phép.
- `npm.cmd run ai -- model <provider> <model> [effort]`: đặt mặc định. Lần đầu dùng một model trên một phiên bản CLI, gateway tự chạy **1 prompt canary**; canary hỏng thì model bị chặn.

### 6.5. Khi hết hạn mức
- Lỗi được nhận diện theo mẫu đã ghi trong bằng chứng D-01 trước, sau đó theo lõi ai-router. Profile bị khóa tới giờ hãng báo mở lại; không có giờ thì 60 phút (giới hạn tốc độ: 5 phút), rồi tự về `READY`.
- Có provider dự phòng hợp lệ (đủ D-01 **và** có báo cáo đối chứng D-05) thì job chuyển sang đó ngay; nếu không, job vào `WAITING_QUOTA`.
- Worker kiểm lại job `WAITING_QUOTA` mỗi 5 phút (không gọi model) và tự đưa về hàng đợi khi có provider dùng được. Mỗi job tối đa **3 lần chạy**, không bao giờ reset.
- Một hãng **từ chối** trả lời (REFUSAL) thì không chuyển hãng khác để lách; job chuyển sang cần xem xét.

## 7. Worker và hàng đợi AI

```powershell
npm.cmd run worker
```
- Mọi provider **chỉ đang hết hạn mức**: worker không thoát mà **chờ**, kiểm lại mỗi 5 phút (đổi bằng `--quota-recheck-ms`, không gọi model) và tự bắt đầu khi có provider mở lại. `Ctrl+C` để dừng.
- Không có provider nào `READY` vì lý do khác (thiếu bằng chứng D-01, hết hạn xác nhận extra usage, cần đăng nhập…): worker in lý do và thoát (mã 3). Dùng `--fake` để thử với dữ liệu synthetic (chỉ job dry-run).
- `--complaints`: xử lý job khiếu nại/tái đánh giá.
- `--learning`: **chấm bài Writing của bạn bằng AI thật** (P5-5). Cần chạy app với biến môi trường `STUDY_ENGLISH_LEARNING_AI=real`, mở thêm một terminal cho worker:
  ```powershell
  $env:STUDY_ENGLISH_LEARNING_AI = 'real'; npm.cmd run app
  ```
  ```powershell
  npm.cmd run worker -- --learning
  ```
  - Bài nộp vào hàng đợi; Workspace hiện *Đang chờ worker chấm* / *AI đang chấm…* và tự tải lại mỗi 3 giây.
  - Mỗi lần nộp (bài gốc hoặc bản sửa) tốn **một lượt gọi model** trên gói thuê bao của provider đã xác minh (Codex). Không có provider sẵn sàng thì worker không chạy; hết hạn mức thì bài chờ tới khi mở lại.
  - AI chỉ nhận đề bài, tiêu chí của từng kỹ năng, chế độ làm bài và bài viết của bạn; không nhận lịch sử học, gợi ý cũ hay kho đáp án. AI chỉ **đề xuất**: kết quả từng tiêu chí, tối đa 3 lỗi trọng tâm (kèm điểm ảnh hưởng/độ chắc chắn 0–3) và 3 nấc gợi ý. Ứng dụng tự quyết mức hỗ trợ, giới hạn trọng tâm, trạng thái giả thuyết; gợi ý nấc 1–2 nào lộ câu mẫu nấc 3 bị **loại bỏ toàn bộ** (lượt đó không có gợi ý).
  - Không đặt biến (mặc định): vẫn chấm synthetic ngay trong app như trước, không tốn hạn mức.
  - Đề bài hiện vẫn là gói synthetic, nên theo quy tắc G0 kết quả **không** vào mức năng lực cho tới khi có nội dung thật (D-05); bạn vẫn nhận chẩn đoán và gợi ý thật.
- Danh sách đầy đủ các cờ: [bảng tự động](#cờ-worker).
- Worker chỉ xử lý một job một lúc; khởi động lại an toàn (job đang chạy dở được thu hồi khi hết lease).

## 8. Sao lưu, khôi phục và xuất dữ liệu

```powershell
npm.cmd run backup -- create
```
Sao lưu trực tuyến DB + JSON + media vào `var/backups/`.

Khôi phục **luôn vào thư mục mới** và được kiểm tra ở đó, không đụng `var/`:
```powershell
npm.cmd run backup -- restore <thư_mục_backup> <thư_mục_mới>
```
Chỉ khi kiểm tra đạt, **dừng server và worker**, rồi thay `var/` (bản cũ được giữ bên cạnh):
```powershell
npm.cmd run backup -- promote <thư_mục_mới> --confirm
```
Nên sao lưu trước khi cập nhật code có migration mới.

**Sao lưu tự động** (E-32, bạn chốt): khi ứng dụng (`app`, `start` hoặc `dev:server`) đang chạy, hệ thống tự tạo **một backup mỗi ngày học** (lần kiểm đầu tiên khoảng 15 giây sau khi mở, sau đó kiểm mỗi giờ) và **diễn tập khôi phục mỗi tuần** trên bản mới nhất, rồi dọn backup cũ theo quy tắc bên dưới. Chỉ là chép file trên máy: không gọi AI, không tốn hạn mức, không gửi gì ra ngoài; mỗi lần mất vài giây và chiếm dung lượng bằng khoảng kích thước dữ liệu. Máy tắt hoặc ứng dụng không chạy thì không chạy bù. Lỗi được thử lại ở lần kiểm sau (diễn tập lỗi chỉ thử lại vào ngày hôm sau) và hiện ở **Cài đặt & Mục tiêu → Dữ liệu của bạn**, cùng thời điểm backup gần nhất và kết quả diễn tập. Tắt bằng biến môi trường `STUDY_ENGLISH_AUTO_BACKUP=0`.

**Tự dọn backup cũ** (theo quyết định của bạn, E-30): sau mỗi `backup -- create` và mỗi lần diễn tập đạt, hệ thống giữ **10 bản backup mới nhất** và bản đã diễn tập ĐẠT gần nhất, xóa các bản chuẩn cũ hơn. Chỉ xóa thư mục backup do `backup -- create` tạo (có `manifest.json` đúng định dạng); không bao giờ đụng bản sao tay (ví dụ `pre-m8-repair-…`), bản xuất, bài làm, audio hay lịch sử. Mỗi lần xóa ghi vào `var/backups/prune-log.jsonl`. Đổi số bản giữ khi dọn tay:
```powershell
npm.cmd run backup -- prune --keep 20
```

### Diễn tập khôi phục
Một bản sao lưu chỉ đáng tin khi đã khôi phục thử thành công:
```powershell
npm.cmd run backup -- drill
```
Lệnh tạo backup mới (hoặc dùng backup chỉ định: `drill <thư_mục_backup>`), khôi phục vào thư mục tạm, mở bằng chính ứng dụng, đối chiếu số dòng dữ liệu học với backup và đọc lại toàn bộ dữ liệu + kiểm SHA-256 từng bản thu âm, rồi xóa bản tạm. Không đụng `var/` đang dùng. Kết quả (ĐẠT/THẤT BẠI, thời gian, số dòng) ghi thêm vào `var/backups/restore-drills.jsonl`. Nên chạy sau mỗi lần cập nhật lớn hoặc định kỳ.

### Xuất dữ liệu học tập
Khác với sao lưu (để khôi phục ứng dụng), **bản xuất** là dữ liệu cá nhân của bạn ở dạng đọc được: mang đi, lưu trữ riêng, hoặc xem bằng công cụ khác.

```powershell
npm.cmd run export -- create
```
- Tạo thư mục `var/exports/learner-export-<thời điểm>/` gồm `data/*.json` (mục tiêu, bài làm và mọi bản nháp/bản nộp, hỗ trợ đã dùng, nhận định, giả thuyết lỗi, khiếu nại, Reading, bản chép lời, lịch, theo dõi ngày, lời nhắc, đồng ý chia sẻ dữ liệu), `media/` (bản thu âm gốc, sao nguyên byte), `manifest.json` (số dòng, SHA-256 từng file, danh sách những gì **cố ý không xuất**) và `DOC_TRUOC.txt`.
- **Không xuất**: nội dung đề/đáp án/rubric (chỉ có tham chiếu), gợi ý sinh sẵn mà bạn chưa mở, bài dry-run của Builder & QC, tài khoản AI và bằng chứng D-01.
- `--out <thư_mục>` để xuất ra chỗ khác (ví dụ ổ ngoài). Lệnh từ chối thư mục nằm trong repo nhưng ngoài `var/`, vì dữ liệu cá nhân có thể bị commit nhầm.
- Đang làm dở mà xuất bị lỗi (ví dụ file audio bị thay đổi trên đĩa) thì không để lại thư mục dở dang.
- Trên giao diện: **Cài đặt & Mục tiêu → Dữ liệu của bạn → Xuất dữ liệu học tập**.

### Dung lượng
```powershell
npm.cmd run export -- usage
```
Cho biết `var/` đang dùng bao nhiêu theo từng khu (database, media, backups, exports, …), ổ đĩa còn trống bao nhiêu và các bảng nhiều dòng nhất. Cùng thông tin này hiện ở **Cài đặt & Mục tiêu → Dữ liệu của bạn**. **Hệ thống không tự xóa dữ liệu**: chính sách lưu giữ (D-07) chưa được chốt; tự dọn thì xóa các bản `var/backups/` và `var/exports/` cũ bạn không cần nữa.

## 9. Relay AI lập trình và ai-router

Relay là công cụ cho **AI lập trình** sửa repo này, không phải AI của app học. Phần máy nằm ở dự án `ai-router` cạnh repo.

```powershell
npm.cmd run relay -- --status
```
```powershell
npm.cmd run relay -- "Mô tả nhiệm vụ"
```
```powershell
npm.cmd run relay -- --task-file task.md --wait
```
```powershell
npm.cmd run relay -- --continue
```
- Một lần: trong ai-router, tin cậy thư mục này ở mức `edit` kèm danh sách lệnh được phép (`node bin\ai-router.mjs workspace add C:\Code\study-english --trust edit --cmd "npm.cmd run" …`).
- `--wait`: hết hạn mức mọi nền tảng thì chờ tới giờ mở lại sớm nhất; `--provider <id>`: ưu tiên một nền tảng; `--continue`: tiếp nhiệm vụ dở.
- Mã thoát: 0 xong · 2 AI cần bạn quyết định · 75 hết nền tảng · 130 bị dừng · 1 lỗi khác.
- Xem trực tiếp, cấu hình thứ tự/model: chạy `npm run serve` trong ai-router, mở `/chat` hoặc `/admin`.

**Đồng bộ lõi định tuyến** (khi bạn sửa `ai-router/src/core`):
```powershell
npm.cmd run router:sync -- --check
```
```powershell
npm.cmd run router:sync
```
Sau đó `npm.cmd run check`. Không sửa tay `src/infrastructure/ai/router-core/` (có test kiểm SHA-256).

## 10. Kiểm tra và phát triển

```powershell
npm.cmd run check
```
Chạy lint → kiểm tra hướng dẫn này → typecheck → test → build. Phải đạt trước khi commit. Test dùng dữ liệu synthetic và CLI giả, không tốn hạn mức.

- `npm.cmd run spike`: thử SQLite và quản lý tiến trình Windows.
- `npm.cmd run inventory`: các CLI AI có trên PATH.
- AI lập trình phải đọc [AGENTS.md](../AGENTS.md) và [PROGRESS.md](../PROGRESS.md) trước khi sửa; mọi lượt ghi kết quả thật vào PROGRESS.
- Migration đã áp vào DB thật thì **không sửa**; thay đổi schema bằng migration mới.

## 11. Xử lý sự cố

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| Trang báo không kết nối | Backend chưa chạy hoặc chạy sai thư mục | Chạy `npm.cmd run app` từ root repo |
| `EADDRINUSE` / cổng 4317 đang dùng | Một bản khác (`app`, `start` hoặc `dev:server`) đang chạy | Dùng bản đang chạy, dừng nó bằng `Ctrl+C`, hoặc chạy bản thứ hai với `STUDY_ENGLISH_PORT` khác |
| `Built web UI not found` | Chưa build giao diện | `npm.cmd run app` (tự build) |
| Cài đặt báo diễn tập THẤT BẠI | Backup mới nhất hỏng hoặc thiếu file | Chạy `npm.cmd run backup -- drill` (tạo bản mới rồi diễn tập); nếu vẫn lỗi, giữ nguyên `var/` và kiểm tra ổ đĩa |
| `backup -- drill` báo THẤT BẠI | Backup hỏng hoặc thiếu file | Đọc lý do in ra/`restore-drills.jsonl`; tạo backup mới và diễn tập lại trước khi dựa vào bản cũ |
| `403 HOST_NOT_ALLOWED` / `ORIGIN_NOT_ALLOWED` | Mở bằng địa chỉ khác `127.0.0.1`/`localhost` | Mở đúng http://127.0.0.1:5173 |
| `401 SESSION_REQUIRED`, `403 CSRF_INVALID` | Phiên cũ sau khi khởi động lại backend | Tải lại trang |
| `Applied migration N was modified` | File migration đã áp bị sửa | Không sửa migration cũ; khôi phục file gốc, đưa thay đổi vào migration mới |
| Worker thoát mã 3 | Không provider nào `READY` vì lý do khác hạn mức | `npm.cmd run ai -- status` xem lý do; hoặc `--fake` để thử |
| Worker in "Mọi provider đang hết hạn mức… Worker chờ" | Hết hạn mức ở mọi hãng | Bình thường: worker tự chạy tiếp khi có hãng mở lại |
| Provider `BILLING_UNVERIFIED` | Thiếu/hết hạn bằng chứng, xác nhận extra usage quá 30 ngày, biến API key trong môi trường, CLI trả lỗi lạ | Đọc `reasons` trong `ai -- status`; xác nhận lại hoặc chạy lại D-01 |
| Provider `QUOTA_EXHAUSTED`/`COOLDOWN` | Hết hạn mức | Chờ tới giờ mở lại (tự về READY); job tự chạy tiếp nếu worker đang chạy |
| `MODEL_NOT_VERIFIED` / `MODEL_CANARY_FAILED` | Model chưa được phép hoặc canary hỏng | `ai -- allow-models` hoặc chọn model khác bằng `ai -- model` |
| `npm run check` báo hướng dẫn cũ | Mã đổi mà hướng dẫn chưa sinh lại | `npm.cmd run docs:guide`, bổ sung mô tả còn thiếu, xem lại phần viết tay |
| Tìm trong kho không ra kết quả | Vai trò được chọn không có quyền với nội dung đó, gói chưa phát hành/đã loại bỏ, hoặc đã bị thu hồi; từ khóa dưới 2 ký tự bị bỏ | Đổi vai trò, kiểm tra trạng thái gói; *Dựng lại chỉ mục* nếu nghi chỉ mục lỗi |
| Ổ đĩa sắp đầy | Backup/export cũ, nhiều bản thu âm | `npm.cmd run export -- usage` xem khu nào lớn; xóa bản `var/backups/`, `var/exports/` cũ không cần (hệ thống không tự xóa) |
| `router:sync -- --check` báo LỆCH | ai-router đã đổi lõi | `npm.cmd run router:sync` rồi `npm.cmd run check` |
| Theo dõi ngày báo "Thiếu dữ liệu quan sát" dù có học | Học ngoài ứng dụng hoặc trình duyệt chặn lưu tạm | Khai báo *Đã học ngoài ứng dụng* cho ngày đó (trong 14 ngày) |

## 12. Giới hạn hiện tại

- **Chưa báo Band** (D-05). Mức năng lực theo D-02 v1 là tham số **đã duyệt nhưng chưa kiểm định thực nghiệm**; nên xem lại sau 4–6 tuần dùng thật. Hai chiều điểm AI (ảnh hưởng, độ chắc chắn) chỉ có khi chấm bằng AI thật (`--learning`); chế độ synthetic lấy mặc định 1; chưa có dữ liệu "điều kiện ủng hộ riêng một giả thuyết" nên sổ lỗi chỉ xác nhận được qua nhiệm vụ phân biệt nguyên nhân (chưa có). Bài kiểm chứng 7B/Bước 9 tự xếp đang dùng bài synthetic (chờ nội dung thật D-05).
- **Nội dung thật và bộ đối chứng** chưa có (D-05); bài học hiện là synthetic. Chấm bằng AI thật (P5-5) mới là lựa chọn bật tay, chưa được đối chứng chất lượng (D-05) và chỉ chạy qua Codex. Provider dự phòng chỉ được tự động dùng khi có báo cáo đối chứng D-05.
- **Chưa có ASR/chấm phát âm** (D-06).
- Chỉ backup cũ được tự dọn (E-30); dữ liệu học, audio, bản xuất không bao giờ tự xóa. Sao lưu tự động chỉ chạy khi ứng dụng đang mở (không có dịch vụ nền của Windows). Chưa có kênh nhắc qua Telegram/email.
- Danh sách quyết định còn mở: [DECISIONS — Điểm mở](engineering/DECISIONS.md).

## 13. Cách tài liệu này được giữ đúng

- **Phần tự động** (mục 14) do `scripts/user-guide.mjs` sinh từ: `package.json` (lệnh npm), `src/cli/ai.ts`, `src/cli/backup.ts` và `src/cli/export.ts` (USAGE), `src/worker/main.ts` (cờ), `src/server/app.ts` (route), `migrations/`, `docs/engineering/DECISIONS.md`, bảng công việc trong `PROGRESS.md`.
- `npm.cmd run check` thất bại khi:
  - phần tự động khác với mã hiện tại;
  - có lệnh npm, route hoặc cờ worker mới chưa có mô tả trong `scripts/user-guide.mjs`;
  - còn mô tả cho thứ đã bị xóa.
- Sửa: `npm.cmd run docs:guide`, rồi cập nhật phần viết tay liên quan (mục 1–12).
- AI lập trình bắt buộc cập nhật phần viết tay khi thêm/đổi tính năng, màn hình, lệnh, cách cài/chạy hay giới hạn (quy định trong [AGENTS.md](../AGENTS.md)).
- Tùy chọn: bật git hook để tự sinh lại phần tự động trước mỗi commit: `npm.cmd run hooks:install` (đặt `core.hooksPath` của repo này thành `.githooks`).

## 14. Tra cứu tự động

> Các khối dưới đây được sinh bằng `npm.cmd run docs:guide`. Không sửa tay; sửa mô tả trong `scripts/user-guide.mjs`.

### Lệnh npm
<!-- AUTO:scripts:START — tự động, không sửa tay -->
| Lệnh | Tác dụng |
|---|---|
| `npm.cmd run dev` | Chạy giao diện web (Vite) ở http://127.0.0.1:5173; cần `dev:server` chạy song song. |
| `npm.cmd run dev:server` | Chạy backend local ở 127.0.0.1:4317, mở dữ liệu thật trong `var/`, tự áp migration mới. |
| `npm.cmd run start` | Chạy bản đã build (không build lại): giao diện + API ở http://127.0.0.1:4317. |
| `npm.cmd run app` | Cách dùng hằng ngày: build rồi chạy giao diện + API ở http://127.0.0.1:4317 bằng một lệnh. |
| `npm.cmd run lint` | Kiểm tra ESLint. |
| `npm.cmd run typecheck` | Kiểm tra kiểu TypeScript (không sinh file). |
| `npm.cmd run test` | Chạy toàn bộ test Vitest (dữ liệu synthetic, CLI giả, không gọi AI thật). |
| `npm.cmd run build` | Build backend (`tsc`) và web (Vite). |
| `npm.cmd run check` | Cổng chất lượng: lint → đồng bộ hướng dẫn → typecheck → test → build. Phải đạt trước khi bàn giao/commit. |
| `npm.cmd run spike` | Thử SQLite (transaction, backup) và tiến trình Windows (stdin/EOF/timeout/cây tiến trình). |
| `npm.cmd run inventory` | Liệt kê CLI AI có trên PATH (chỉ metadata, không đọc đăng nhập, không gọi model). |
| `npm.cmd run relay` | Relay AI lập trình: giao một nhiệm vụ code cho ai-router, tự chuyển nền tảng khi hết hạn mức. |
| `npm.cmd run router:sync` | Chép lõi định tuyến từ `../ai-router/src/core`; `-- --check` chỉ so sánh. |
| `npm.cmd run docs:guide` | Sinh lại các phần tự động của hướng dẫn này; `-- --check` chỉ kiểm tra. |
| `npm.cmd run hooks:install` | Bật git hook của repo (`.githooks/pre-commit`): tự sinh lại phần tự động của hướng dẫn trước mỗi commit. |
| `npm.cmd run ai` | Quản trị AI thật: trạng thái provider, tài khoản, bằng chứng D-01, đồng ý dữ liệu, model (xem mục lệnh `ai`). |
| `npm.cmd run worker` | Worker xử lý job AI trong hàng đợi (xem mục cờ worker). |
| `npm.cmd run backup` | Sao lưu / khôi phục DB + JSON + media (xem mục lệnh `backup`). |
| `npm.cmd run export` | Xuất dữ liệu học tập cá nhân ra thư mục riêng, hoặc xem dung lượng đang dùng (xem mục lệnh `export`). |
| `npm.cmd run qc:real` | Chạy QC1–4 thật bằng provider READY trên gói synthetic trong kho tạm `var/qc-real/` (tốn vài prompt thuê bao). |
| `npm.cmd run seed:reading` | Nạp gói Reading synthetic đã qua QC vào kho để thử luồng Reading. |
<!-- AUTO:scripts:END -->

### Lệnh `ai`
<!-- AUTO:ai-cli:START — tự động, không sửa tay -->
```text
Usage: npm run ai -- <command>
  models <provider> [--allow <m1,m2,...>]           list candidates and allowed models, or set models_allowed (no inference)
  allow-models <provider> <m1,m2,...>               declare allowed models list (persists across CLI versions without verify)
  model <provider> <model> [effort]                 save default configuration (must be in models_allowed; canary runs on first use)
  status                                            why each provider is (not) usable + observed vs verified version/hash
  recover <provider>                                after signing in again: NEEDS_VERIFICATION, then re-record evidence
  account <profile_id> <provider> <label> <runner_dir>  register a profile (state NEEDS_VERIFICATION)
  evidence <file.json> [--boundary <probe.json>]    record {"evidence":…,"envelope":…} (no secrets), then re-check;
                                                    --boundary takes file_scope_test from a PASS probe-boundary report
  consent <provider> <data_class> grant|revoke      who may receive which data (default: nobody; learner_audio never)
  consent <provider> approved grant                 E-11: grant the 5 user-approved classes to a D-01-verified provider
  confirm-extra-usage <provider> off                you checked today that extra usage / auto-recharge is OFF (valid 30 days)
  verify codex|claude|agy --profile <dir> [--profile-id <id>] [--model <m> | --models <a,b,c>] [--effort <e>] [--entrypoint <exe>] [--argv '<json>'] [--out <file>]
                                                    collect D-01 evidence (codex ~8 prompts; claude/agy ~3 prompts); never sets VERIFIED
  probe-boundary codex|claude|agy --profile <dir> [--workspace <dir>] [--out <file>] [--entrypoint <exe>] [--argv '<json>']
                                                    D-01 read-boundary test (codex: 0 prompts via codex sandbox; claude: 1 prompt to read init;
                                                    agy: 2 prompts to probe bait files; workspace default <mặc định>)
```
<!-- AUTO:ai-cli:END -->

### Lệnh `backup`
<!-- AUTO:backup-cli:START — tự động, không sửa tay -->
```text
Usage: npm run backup -- <command>
  create                              online backup of var/ (DB + JSON + media) into var/backups, then prune old backups
  prune [--keep <n>]                  delete old standard backups, keeping the newest n (default 10) and the last passed drill;
                                      nothing else is ever deleted (E-30)
  restore <backup_dir> <target_dir>   restore into a NEW/empty directory and verify (does not touch var/)
  promote <target_dir> --confirm      replace var/ with a verified restore (stop server and worker first)
  drill [backup_dir]                  restore drill: new backup (or the given one) → restore into a temp folder → open with the
                                      app and read all learner data back → delete the temp copy; logged in var/backups/restore-drills.jsonl
```
<!-- AUTO:backup-cli:END -->

### Lệnh `export`
<!-- AUTO:export-cli:START — tự động, không sửa tay -->
```text
Usage: npm run export -- <command>
  create [--out <parent_dir>]   export your learning data (JSON + your audio + manifest with SHA-256) into var/exports
                                or <parent_dir>; refuses a folder inside the repository but outside var/
  usage                         disk space used under var/, free space, largest tables (nothing is deleted)
```
<!-- AUTO:export-cli:END -->

### Cờ worker
<!-- AUTO:worker-flags:START — tự động, không sửa tay -->
| Cờ | Tác dụng |
|---|---|
| `--fake` | Khi không có provider READY: chạy job dry-run bằng FakeAdapter (kết quả synthetic, không thành bằng chứng học). |
| `--once` | Xử lý đúng một job rồi thoát, in kết quả JSON. |
| `--quota-recheck-ms` | Chu kỳ kiểm lại job `WAITING_QUOTA` (mặc định 300000 ms = 5 phút); không gọi model. |
| `--learning` | Chấm bài Writing của người học bằng AI thật qua gateway (bài nộp khi app chạy với `STUDY_ENGLISH_LEARNING_AI=real`). Không dùng được với `--fake`. |
| `--fake-blind-answers` | Kèm `--fake`: đáp án giải mù giả lập, ví dụ `"q1=FALSE,q2=NOT GIVEN"`. |
| `--complaints` | Chỉ xử lý job khiếu nại/tái đánh giá của người học qua gateway. |
| `--poll-ms` | Khoảng nghỉ khi hàng đợi trống (mặc định 2000 ms). |
<!-- AUTO:worker-flags:END -->

### Route API cục bộ
Mọi route trừ `/api/health` và `GET /api/session` cần cookie phiên; route ghi (POST) cần thêm Origin hợp lệ và header `x-csrf-token`.

<!-- AUTO:routes:START — tự động, không sửa tay -->
**Hệ thống**

| Route | Tác dụng |
|---|---|
| `GET /api/health` | Kiểm tra server sống (không cần phiên). |
| `GET /api/session` | Tạo/lấy phiên và CSRF token (không cần phiên). |

**Học tập**

| Route | Tác dụng |
|---|---|
| `POST /api/learning/complaints` | Yêu cầu xem xét lại một nhận định (tạo job tái đánh giá). |
| `GET /api/learning/reading` | Danh mục bài Reading được cấp phát. |
| `GET /api/learning/audio` | Danh sách phiên luyện nói. |
| `POST /api/learning/audio` | Tạo phiên luyện nói. |
| `GET /api/learning/audio/:id` | Xem phiên luyện nói. |
| `POST /api/learning/audio/:id/recordings` | Lưu bản thu (WAV/WebM/OGG ≤ 8 MiB) vào kho media cục bộ. |
| `GET /api/learning/audio/:id/recordings/:recording` | Phát lại bản thu. |
| `POST /api/learning/audio/:id/autosave` | Lưu nháp phần văn bản của phiên nói. |
| `POST /api/learning/audio/:id/transcripts` | Lưu bản chép lời do người học tự nhập. |
| `POST /api/learning/audio/:id/review-text` | Nhận xét dạng văn bản (không gửi audio, không báo Band Speaking). |
| `POST /api/learning/reading` | Bắt đầu một bài Reading. |
| `GET /api/learning/reading/:id` | Xem bài Reading (đề giải mù, không có đáp án trước khi nộp). |
| `POST /api/learning/reading/:id/autosave` | Lưu nháp Reading. |
| `POST /api/learning/reading/:id/submit` | Nộp đáp án Reading. |
| `POST /api/learning/reading/:id/hints` | Mở gợi ý Reading theo nấc (nấc 3 mở đáp án, ghi exposure). |
| `GET /api/learning/goals` | Đọc mục tiêu học. |
| `POST /api/learning/goals` | Lưu mục tiêu (Band, loại thi, ngày thi, phút/ngày, phút/tuần). |
| `GET /api/learning/today` | Màn Học hôm nay: bài đang dở, nhiệm vụ đề xuất (`?available_minutes=`). |
| `POST /api/learning/attempts` | Bắt đầu một bài Writing (chế độ, mục đích). |
| `GET /api/learning/attempts/:id` | Workspace của một bài (đã cắt quyền: không lộ đáp án/gợi ý chưa mở). |
| `POST /api/learning/attempts/:id/autosave` | Lưu nháp lên server. |
| `POST /api/learning/attempts/:id/input-support` | Hỗ trợ đầu vào (dàn ý/từ vựng); bị chặn ở chế độ thi. |
| `POST /api/learning/attempts/:id/submit` | Nộp bài gốc hoặc bản sửa (`is_repair`). |
| `POST /api/learning/attempts/:id/hints/unlock` | Mở gợi mở theo nấc 1 → 2 → 3. |
| `POST /api/learning/attempts/:id/step5/action` | Bước 5: "Để mình thử thêm", "Giải thích trực tiếp", hỏi lại. |
| `POST /api/learning/attempts/:id/step6/complete` | Bước 6: trả lời câu kiểm tra khái niệm. |
| `POST /api/learning/attempts/:id/start-7a` | Tạo bài kiểm chứng 7A mới, sạch gợi ý. |
| `POST /api/learning/tracking/activity` | Heartbeat thời gian học (chỉ siêu dữ liệu, idempotent). |
| `POST /api/learning/tracking/day` | Khai báo ngày: nghỉ có kế hoạch / học ngoài ứng dụng / quỹ thời gian. |
| `GET /api/learning/tracking` | Theo dõi N ngày gần nhất (`?days=1..31`), kèm `as_of`. |
| `GET /api/learning/notifications` | Lời nhắc trong ứng dụng (tạo nhắc của hôm nay nếu chưa có). |
| `POST /api/learning/notifications/:id/dismiss` | Đánh dấu đã xem một lời nhắc. |
| `POST /api/learning/export` | Xuất dữ liệu học tập vào `var/exports/` (chỉ đọc, không xóa gì). |
| `GET /api/learning/storage` | Dung lượng dữ liệu trong `var/`, dung lượng trống của ổ, các bảng lớn nhất. |
| `GET /api/learning/progress` | Tiến độ & hồ sơ năng lực: mức A1–A6, độ tin cậy, mức theo từng điều kiện làm bài theo chính sách D-02 v1 (chưa báo Band). |
| `GET /api/learning/replan` | Đề xuất sắp xếp lại lịch (D-02 F): tạo tối đa 1 đề xuất mỗi ngày khi bị trễ quá quỹ giờ; không thay đổi gì cho tới khi bạn chọn. |
| `POST /api/learning/replan/:id/accept` | Áp dụng đề xuất lịch (chỉ khi lịch chưa đổi từ lúc đề xuất; quá 48 giờ thì hết hạn). |
| `POST /api/learning/replan/:id/reject` | "Giữ nguyên lịch": đóng đề xuất, không dời nhiệm vụ nào. |
| `GET /api/learning/settings` | Cài đặt: mục tiêu và trạng thái gateway AI. |

**Builder & QC**

| Route | Tác dụng |
|---|---|
| `GET /api/console/packages` | Builder & QC: danh sách gói tri thức. |
| `GET /api/console/packages/:id/:version/events` | Nhật ký pipeline của một gói. |
| `POST /api/console/packages/:id/:version/content` | Mở xem nội dung gói (ghi exposure trước khi trả). |
| `POST /api/console/packages/:id/:version/qc/checks` | Chạy QC1–3 phần xác định. |
| `POST /api/console/packages/:id/:version/qc/attest` | Xác nhận QC2/QC3 ngữ nghĩa trên đúng bundle hash. |
| `POST /api/console/packages/:id/:version/qc/qc4/start` | Tạo job QC4 (giải mù + đối chiếu). |
| `POST /api/console/packages/:id/:version/qc/qc4/advance` | Cập nhật kết quả QC4 từ hàng đợi. |
| `POST /api/console/packages/:id/:version/release` | Phát hành gói khi QC1–4 đạt trên đúng hash. |
| `POST /api/console/packages/:id/:version/withdraw` | Ngừng (suspended) hoặc loại bỏ (retired) gói. |
| `POST /api/console/packages/:id/:version/dry-run` | Chạy thử (dry-run) với văn bản nhập, không thành bằng chứng học. |
| `POST /api/console/revoke` | Thu hồi item/rubric/gói/tri thức; lan truyền tới cache và nhận định. |
| `GET /api/console/search` | Tìm gói tri thức (BM25) theo vai trò: `?q=&role=`; chỉ trả tham chiếu + tiêu đề, không trả nội dung. |
| `POST /api/console/search/rebuild` | Dựng lại chỉ mục tìm kiếm từ các file JSON bất biến. |
| `GET /api/console/issues` | Mục "Cần xử lý": review mở và job bị dừng. |
| `POST /api/console/issues/:reviewId/resolve` | Đóng một review với cách xử lý đã chọn. |
| `GET /api/console/runs` | Các lần chạy AI gần đây. |
| `GET /api/console/gateway` | Trạng thái gateway AI từng provider. |
<!-- AUTO:routes:END -->

### Migration cơ sở dữ liệu
<!-- AUTO:migrations:START — tự động, không sửa tay -->
| Migration | Nội dung (dòng chú thích đầu file) |
|---|---|
| `0001_core.sql` | 0001_core — P1 persistence for P0_DATA_AND_STATE ERD. Applied migrations are immutable: |
| `0002_builder_qc.sql` | 0002_builder_qc — P2 Builder/QC pipeline, result cache, review queue, AI gateway records (E-08, E-09). |
| `0003_provider_agy.sql` | E-11 (20/10/2026, user decision): the Google-side CLI is Antigravity `agy`, replacing `gemini-cli`. |
| `0004_learning_p3.sql` | 0004_learning_p3 — P3 learning frame, goals, server-side writing diagnosis & step-by-step hints, error bank and scheduled checks. |
| `0005_reading.sql` | (file không có dòng chú thích đầu) |
| `0006_audio_samples.sql` | (file không có dòng chú thích đầu) |
| `0007_p4_resilience.sql` | 0007_p4_resilience — P4 multi-provider quota/runtime tracking, D-05 benchmark suite & gate, |
| `0008_provider_model_preferences.sql` | 0008_provider_model_preferences — E-22: per-provider default model & effort preferences. |
| `0009_runtime_canary.sql` | 0009_runtime_canary — E-23: user-declared allowed models, per-CLI-version model canary records and |
| `0010_daily_tracking.sql` | P5-1 Daily tracking (06A §9, §10.A; 02 §5.C.2; decision E-25). Append-only activity and declarations; the daily |
| `0011_knowledge_search.sql` | P5-2 Knowledge search (06A §7.A.2 "lọc quyền trước khi tra cứu bằng SQLite FTS/BM25", 05 §C.5, 06 §5.B.1; E-27). |
| `0012_competency_policy.sql` | D-02 v1 (E-33, user decision 18/11/2026): verification-chain metadata on scheduled tasks and an append-only |
<!-- AUTO:migrations:END -->

### Quyết định kỹ thuật
<!-- AUTO:decisions:START — tự động, không sửa tay -->
| Quyết định | Tóm tắt (cắt ngắn, xem DECISIONS) |
|---|---|
| E-01 | Giữ modular monolith và thứ tự dữ liệu → Builder/QC → vòng học → chịu lỗi → mở rộng theo 06 §6. Không thêm dịch vụ cloud, vector DB hoặc API trả phí. |
| E-02 | Cấu trúc và stack dự kiến ở PROJECT_STRUCTURE; phiên bản và SQLite driver chờ P0 kiểm chứng. Có thể điều chỉnh kỹ thuật có căn cứ mà không đổi nghiệp  |
| E-03 | Adapter giả lập dùng để phát triển đường lỗi; adapter thật mặc định chưa sẵn sàng. Chưa đủ ba provider không chặn code lõi; không tuyên bố đã hoàn thà |
| E-04 | Các thay đổi làm rõ EOF, sandbox, idempotency trong 06/06A là sửa mô tả kỹ thuật để giữ đúng mục tiêu bảo vệ đã chốt; không giảm yêu cầu. |
| E-05 | (19/10/2026, áp dụng kỹ thuật P0): triển khai stack E-02 với Node 22.18.0/npm 10.9.3, TypeScript/React/Vite/Fastify/Ajv/Vitest và better-sqlite3 13.0. |
| E-06 | (19/10/2026, theo yêu cầu người dùng, công cụ lập trình): thêm relay `scripts/relay` để một nhiệm vụ code chạy lần lượt qua Claude Code → Codex → Anti |
| E-07 | (20/10/2026, áp dụng kỹ thuật P1; có thể đảo ngược bằng migration/code mới): cụ thể hóa persistence, queue và backup P1. Không thêm dependency. |
| E-08 | (20/10/2026, áp dụng kỹ thuật P2; có thể đảo ngược bằng schema/migration mới): cụ thể hóa 6 đầu ra Phần 5 và pipeline QC. Không thêm dependency. |
| E-09 | (20/10/2026, áp dụng kỹ thuật P2-3; có thể đảo ngược): AI Gateway của ứng dụng (khác relay E-06). Không thêm dependency. |
| E-10 | (20/10/2026, áp dụng kỹ thuật P2-4; có thể đảo ngược): session/CSRF, Console và entrypoint. |
| E-11 | (20/10/2026, người dùng chốt, trả lời BLOCKED của P2): (1) Provider xác minh D-01 đầu tiên là Codex (ChatGPT); ứng viên cô lập profile là `CODEX_HOME` |
| E-12 | (20/10/2026, áp dụng kỹ thuật E-11; không đóng D-01): `contracts/provider.v2.schema.json` thêm profile/job/run v2 cho agy, giữ nguyên core.v1 và migra |
| E-13 | (20/10/2026, sửa kiểm chứng D-01 theo 06A §5.C.3/§10.B ca 11): probe qua model chỉ là quan sát hành vi. `CANNOT_READ`, `OK` hoặc công cụ báo `blocked  |
| E-14 | (20/10/2026, áp dụng kỹ thuật E-13, đảo ngược được; không đóng D-01): bộ thu `npm run ai -- probe-boundary codex` dùng `codex sandbox` (không gọi mode |
| E-15 | (20/10/2026, trả lời BLOCKED của probe-boundary): (1) Người dùng chốt: repo (mã nguồn, tài liệu, AGENTS.md) được phép đọc từ sandbox Codex của gateway |
| E-16 | (20/10/2026, áp dụng kỹ thuật E-15; đảo ngược được; không đóng D-01): (1) `repo_agents` thành ca ghi nhận (`expected: info`), vẫn chạy; `var/` bắt buộ |
| E-17 | (20/10/2026, người dùng chốt, trả lời BLOCKED của E-15/E-16): `unified_exec` không tắt được trên codex-cli 0.163.0-alpha.10.2, nên thay vì chấp nhận r |
| E-18 | (20/10/2026, áp dụng kỹ thuật P3-1…P3-3 phần độc lập; đảo ngược được bằng migration/code mới; không đóng D-01/D-02/D-05): |
| E-19 | (20/10/2026, áp dụng kỹ thuật P3-4 Reading trong luồng học + audio mẫu cục bộ; đảo ngược được bằng migration/code mới; không đóng D-02/D-05/D-06): |
| E-20 | (21/10/2026, áp dụng kỹ thuật P4 phần độc lập; đảo ngược qua migration/code mới): migration 0007 thêm quota events, benchmark suite/report, complaint  |
| E-21 | (21/10/2026, người dùng chốt, D-01 cho claude-code và agy): Claude Code và agy chạy dưới tài khoản Windows của người dùng (không có tài khoản sandbox  |
| E-22 | Model và effort đã verify (21/10/2026) |
| E-23 | (21/10/2026, người dùng chốt "mức A"): đổi phiên bản CLI không còn là lý do chặn. Thay vào đó, ranh giới được kiểm trong mỗi lần chạy thật, gần như kh |
| E-24 | Dùng lõi định tuyến của ai-router làm nền xử lý AI của ứng dụng (17/11/2026) |
| E-25 | P5-1 Theo dõi học hằng ngày (Daily Tracker) và nhắc học theo luật (17/11/2026) |
| E-26 | Hướng dẫn sử dụng tự cập nhật (17/11/2026) |
| E-27 | P5-2 Tra cứu kho tri thức FTS5/BM25 lọc quyền trong cùng truy vấn (17/11/2026) |
| E-28 | P5-3 Xuất dữ liệu học tập và báo cáo dung lượng (17/11/2026) |
| E-29 | P5-4 Chạy một lệnh, dữ liệu/cổng tùy chọn, diễn tập khôi phục (18/11/2026) |
| E-30 | Tự dọn backup cũ (18/11/2026, người dùng chốt) |
| E-31 | Worker chờ khi mọi provider hết hạn mức (18/11/2026, người dùng chốt) |
| E-32 | Sao lưu tự động mỗi ngày + diễn tập khôi phục mỗi tuần (18/11/2026, người dùng chốt "Bật cả hai") |
| E-33 | Chốt chính sách D-02 v1 (18/11/2026, người dùng chốt) |
| E-34 | Triển khai chính sách D-02 v1 (18/11/2026, người dùng yêu cầu "Triển khai D-02") |
| E-35 | P5-5: chấm Writing bằng AI thật qua worker (18/11/2026, áp dụng kỹ thuật, đảo ngược được) |
<!-- AUTO:decisions:END -->

### Trạng thái công việc
<!-- AUTO:status:START — tự động, không sửa tay -->
| Mã | Công việc | Trạng thái |
|---|---|---|
| DOC-01 | Rà soát và quy định cho AI | DONE |
| P0 | Chốt hợp đồng, bootstrap, thử tính khả thi | DONE |
| TOOL-01 | Relay AI lập trình chuyển nền tảng khi hết quota | DONE |
| P1 | Nền dữ liệu, Rule Engine, queue | DONE |
| P2 | Builder/QC + một adapter thật đủ điều kiện | DONE |
| P3 | Vòng Writing + Reading giải mù + audio mẫu | DONE |
| P4 | Chịu lỗi, adapter bổ sung, đối chứng | IN_PROGRESS |
| AI-01 | Lõi định tuyến ai-router làm nền gateway AI (E-24) | DONE |
| DOC-02 | Hướng dẫn sử dụng tự cập nhật (E-26) | DONE |
| P5 | Mở rộng, daily tracking, tối ưu | IN_PROGRESS |
<!-- AUTO:status:END -->
