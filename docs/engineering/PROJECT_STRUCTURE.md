# Cấu trúc triển khai

Trạng thái: P0 đã triển khai khung theo quyết định kỹ thuật E-05 ngày 19/10/2026; P1–P2 (phần code) và P3-1…P3-3 (khung học, vòng Writing với FakeAdapter, gợi mở theo nấc) đã triển khai tới quyết định E-18 ngày 20/10/2026. Cây bên dưới vẫn là cây đích toàn dự án; chỉ tạo các module thực sự có code. Hiện có domain/{jobs,evidence,knowledge,learning,scheduling}, application/{ai,context,learning,qc} + ports.ts, infrastructure/{ai (+ gateway/),contracts,files,sqlite,backup}, worker (vòng lặp + entrypoint `main.ts`), cli/ (ai, backup), migrations 0001–0004, server (session/CSRF, API Console + API Learning), web (Khung học 5 màn + Console 3 tab), contracts (core.v1, provider.v2, knowledge.v1, knowledge/), tests và scripts (P1 E-07, P2 E-08…E-17, P3 E-18); chưa có policies/ vì chưa có chính sách sư phạm được duyệt (D-02).

## Phương án mặc định cho P0
E-11/E-12 bổ sung `migrations/0003_provider_agy.sql`, `contracts/provider.v2.schema.json`, `gateway/verify-codex.ts`, `tests/integration/p2-e11.test.ts` và CLI giả `tests/fixtures/fake-codex.mjs`. E-18 bổ sung `migrations/0004_learning_p3.sql`, `src/domain/learning/scaffold-hints.ts`, `src/application/learning/writing-workflow.ts`, `src/web/learning.tsx` và `tests/integration/p3-learning.test.ts`. Profile CODEX_HOME nằm ngoài repo/var; báo cáo không bí mật mặc định ở `var/ai/`. Hiện có 4 migration; provider hiện hành codex/claude-code/agy đều chưa xác minh D-01.

TypeScript cho web/backend/worker; React + Vite cho web, Node.js + Fastify cho backend; SQLite và JSON Schema cho hợp đồng. npm với một lockfile; Vitest cho unit/integration. P0 đã khóa dependency trong package.json/package-lock.json và kiểm chứng better-sqlite3 13.0.3 với Node 22.18.0 trên Windows (transaction/online backup/restore). Playwright dự kiến ở giai đoạn luồng UI, chưa cài ở P0. Audio local có thể cần tiến trình Python riêng qua adapter, chưa bắt buộc công cụ cụ thể.

## Cây đích (tạo khi có chức năng, không tạo hàng loạt file rỗng)
```text
AGENTS.md
PROGRESS.md
README.md                   # P0: cách cài, chạy, kiểm tra thực sự tồn tại
docs/
  00_...md … 06A_...md      # nguồn nghiệp vụ
  engineering/              # quy trình, kế hoạch, quyết định
src/
  domain/                   # thực thể, bất biến, rule thuần; không I/O
    learning/ competencies/ evidence/ scheduling/ knowledge/
  application/              # use cases, workflow, transaction boundaries, ports
    workflows/ context/ qc/ jobs/
  infrastructure/           # triển khai ports
    sqlite/ files/ ai/ audio/ backup/
  server/                   # HTTP, session local, input validation, composition
  worker/                   # queue loop, lease, retry, process supervision
  web/                      # UI; chỉ gọi API, không đọc DB/files trực tiếp
contracts/                  # JSON Schema cho job, AI result, gói tri thức, API
policies/                   # luật cấu hình có phiên bản và nguồn quyết định
migrations/                 # migrations SQLite tuần tự, không sửa bản đã áp dụng
tests/
  unit/ integration/ contract/ e2e/ fixtures/
scripts/                    # kiểm tra, khởi động, backup/restore, tooling; relay/ = relay AI lập trình (E-06)
var/                        # runtime riêng tư, phải gitignore khi bootstrap
  db/ knowledge/ media/ staging/ logs/ backups/
```

Credential runner nằm ngoài cây này và ngoài bản backup học tập. Holdout có quyền truy cập riêng; không gộp vào fixtures dùng cho prompt hay context phát triển. Chỉ synthetic fixtures an toàn mới được version-control công khai.

## Ranh giới phụ thuộc
- domain không import web, server, infrastructure hay SDK model.
- application phụ thuộc domain và interfaces; không gọi CLI cụ thể.
- infrastructure triển khai interfaces; server/worker lắp ráp dependencies.
- web chỉ nhận DTO theo quyền, không nhận đáp án/gợi ý chưa được mở hay credential.
- Một modular monolith; HTTP và worker có thể là hai entrypoint cùng codebase và SQLite, không biến thành hệ microservices.
- Không dùng module `utils` chung để giấu luật nghiệp vụ; đặt luật ở domain có tên và nguồn rõ.

## Dữ liệu và hợp đồng
- JSON bất biến là nguồn nội dung; SQLite là nguồn trạng thái/vòng đời; chỉ mục FTS là projection dựng lại được.
- Quan hệ `attempt → submission/revision → run → observation → evidence source` phải rõ trước migration. Một attempt có nhiều runs/observations; không UNIQUE đơn lẻ attempt_id ở mọi bảng.
- Mỗi hợp đồng có schema version; schema cấu trúc không thay thế QC ngữ nghĩa.
- Mọi đường dẫn media lưu tương đối, kiểm tra containment/checksum trước đọc. Migration và runtime data không nhập vào browser bundle.
- Chỉ khai báo command trong README/AGENTS khi command đã được tạo. Không mô tả cây đích như hiện trạng.
