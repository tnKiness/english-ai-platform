# Nghiệm thu P0 — 19/10/2026

## Phạm vi
P0 hoàn thành bootstrap, hợp đồng v1 và thử tính khả thi; không nghiệm thu các chức năng P1–P5. Node 22.18.0/npm 10.9.3 trên Windows. Dependency exact + lockfile; install báo 0 vulnerabilities tại thời điểm chạy (không là bảo đảm an toàn vĩnh viễn).

## Mapping đầu ra → bằng chứng
| Đầu ra P0 / nguồn | File thực tế | Kiểm chứng |
|---|---|---|
| Skeleton/commands, R-08 | package.json, tsconfig*, vite.config.ts, src/server, src/web, README | lint/typecheck/build; tests/integration/server.test.ts kiểm host/origin/health |
| ERD/state/keys/recovery, R-01/02/05/06 | P0_DATA_AND_STATE.md; src/domain/jobs/state.ts | tests/unit/boundaries.test.ts kiểm cạnh sai và stale/expired/cancelled commit; chưa phải DB transaction |
| Schema cho 15 loại record, R-01–07 | contracts/core.v1.schema.json; src/infrastructure/contracts/validate.ts | tests/contract/schema-inventory.test.ts, contracts.test.ts; fixtures đủ mỗi definition, trường thiếu/thừa, quan hệ original/repair, chất lượng phép đo, phase và UTC |
| Quyền context R-04 | src/application/context/blind-context.ts; ma trận P0_DATA_AND_STATE | tests/unit/boundaries.test.ts kiểm projection whitelist; chưa phải sandbox/resource authorization đầy đủ |
| 6-method adapter R-07 | src/application/ai/provider-adapter.ts; src/infrastructure/ai/fake-adapter.ts | success synthetic + quota/rate/auth/billing/network/timeout/schema/refusal/capability/cancel; không gọi nhà cung cấp |
| Windows runner R-07 | src/infrastructure/ai/bounded-process.ts | tests/spikes/runner.test.ts: stdin literal/EOF, timeout, output cap, cancel, từ chối shim, kill cây con thật |
| Driver/backup R-08 | better-sqlite3 13.0.3; tests/spikes/sqlite.test.ts | Native binding chạy; WAL/foreign keys, rollback, nhiều observation/attempt, online backup và restore integrity khi nguồn còn mở |
| CLI inventory D-01 | scripts/cli-inventory.mjs | codex có executable, claude có shim .cmd, gemini không tìm thấy trên PATH; tất cả entitlement/isolation unverified và không bật thực thi |

## Kết quả lệnh
- `npm.cmd run check`: lint, typecheck, 41 tests trong 6 file, build backend/web đạt sau sửa lỗi import kiểu CJS của ajv-formats và khai báo CSS Vite.
- `dev:server` + `dev`: trang web 200, `/api/health` qua proxy Vite 200 (`real_ai_enabled:false`), Host/Origin lạ bị 403; kiểm bằng curl và trình duyệt, không lỗi console.
- `npm.cmd run inventory`: chạy thành công, chỉ metadata executable; không đọc secret.
- Cài runtime và dev dependencies thành công sau khi quyền mạng npm được cho phép; sandbox ban đầu gặp DNS ENOTFOUND. Không lách giới hạn bằng nguồn tải khác.

## Giới hạn còn giữ nguyên
- D-01: chưa xác minh tài khoản, billing, quota, sandbox thực của bất cứ CLI nào; chưa có adapter thật.
- D-02: chưa chốt ngưỡng sư phạm; không tự nâng/hạ năng lực.
- D-03: schema logic/state P0 đã có; migrations và 6 đầu ra gói tri thức đầy đủ vẫn thuộc P1/P2.
- D-04: spike Windows kill-tree và SQLite online backup đạt; entrypoint của Claude/Gemini, isolation và backup phối hợp DB/JSON/media vẫn phải hoàn thành sau.
- D-05–07: chưa có gói học/QC/đối chứng/audio/retention thực tế.
- P0 chưa dựng worker chạy liên tục, lịch học, chấm điểm, queue bền vững, DB thực hay phát hành nội dung. Không có API mutation, session/CSRF phải được làm trước khi thêm thao tác ghi.

## Bước kế tiếp
P1: từ hợp đồng và ERD chuyển sang migrations/ports/repositories, kiểm transaction/idempotency/fencing bằng SQLite thật; sau đó queue/recovery và backup phối hợp. Giữ toàn bộ model thật tắt cho tới cổng P2 tương ứng.
