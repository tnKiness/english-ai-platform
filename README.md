# Study English — IELTS cá nhân

Ứng dụng web local theo kiến trúc modular monolith. Hiện hoàn thành khung P0: trang trạng thái, health endpoint, schema, fake adapter và spike Windows/SQLite. **Chưa có luồng học, database vận hành, queue hay AI thật.**

AI lập trình phải đọc [AGENTS.md](AGENTS.md), [PROGRESS.md](PROGRESS.md) và [kế hoạch](docs/engineering/IMPLEMENTATION_PLAN.md) trước khi sửa.

## Môi trường và cài đặt
- Đã kiểm chứng trên Windows, Node **22.18.0**, npm **10.9.3**; `.node-version` ghi bản baseline, engines giới hạn Node 22 từ 22.18.0.
- Dependency khóa exact trong `package.json` và `package-lock.json`; cài lại bằng `npm ci` (PowerShell có thể dùng `npm.cmd ci`).
- `better-sqlite3` có native binding; cần tải binary phù hợp khi cài. Không cần API key hoặc đăng nhập AI để chạy P0.

## Chạy khung ứng dụng
Mở hai terminal tại root repository:
```powershell
npm.cmd run dev:server
```
```powershell
npm.cmd run dev
```
Mở [ứng dụng local](http://127.0.0.1:5173). Backend chỉ bind `127.0.0.1:4317`, endpoint `GET /api/health`. Không public server qua LAN/tunnel. UI chỉ hiển thị trạng thái kết nối, không giả lập tiến độ học.

## Kiểm tra
```powershell
npm.cmd run check
npm.cmd run spike
npm.cmd run inventory
```
- `check`: ESLint → TypeScript → Vitest → build backend và web.
- `spike`: SQLite transaction/online backup/restore và stdin/EOF/timeout/output/cancel/cây tiến trình Windows, toàn bộ bằng dữ liệu synthetic tạm.
- `inventory`: chỉ tra executable CLI trên PATH, không đọc auth hoặc gọi inference; không thấy trên PATH không chứng minh chưa cài.
- Sau build: `npm.cmd start` chạy backend đã biên dịch; chưa có server phục vụ static bundle production. Dùng `dev` để xem UI P0.

## Hợp đồng và giới hạn
- [Schema v1](contracts/core.v1.schema.json), [ERD/trạng thái/quyền/recovery](docs/engineering/P0_DATA_AND_STATE.md), [nghiệm thu P0](docs/engineering/P0_ACCEPTANCE.md).
- JSON Schema không kiểm chứng nội dung IELTS hay quyền thuê bao. FakeAdapter chỉ trả dữ liệu synthetic, không ghi bằng chứng học thật.
- Process supervisor thử nghiệm chưa phải sandbox. Cơ chế kill-tree được kiểm chứng Windows; không cam kết tương đương trên hệ điều hành khác. Tích hợp CLI và kiểm tra billing/isolation nằm ở P2.
- Backup spike mới chứng minh SQLite; phối hợp DB + JSON + media và recovery sau crash thuộc P1.
- `var/`, database, log, credential và media cá nhân không được commit. Chưa có migrations; không khởi tạo kho học thật ở P0.

Chưa khởi tạo Git hoặc tạo commit; đã có `.gitignore` chuẩn bị quản lý phiên bản. Khởi tạo/commit có thể thực hiện riêng khi người dùng yêu cầu.
