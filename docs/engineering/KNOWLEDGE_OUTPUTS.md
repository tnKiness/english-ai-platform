# Sáu đầu ra thực thi Phần 5 — v1

Ngày lập: 20/10/2026 (P2-1). Nguồn: [05 §5.D](../05_He_Thong_Co_So_Tri_Thuc_Chuan_Hoa.md), §2.D, §3, §4, §5.A–C. Đây là cụ thể hóa kỹ thuật theo quyết định E-08; không thêm ngưỡng sư phạm/Band (D-02) và không chứa nội dung IELTS có bản quyền. Fixture duy nhất là nội dung synthetic tự viết ở `tests/fixtures/knowledge/synthetic.ts`.

| # | Đầu ra | Phiên bản | File chuẩn | Validator | Test |
|---|---|---|---|---|---|
| 1 | Source Registry | `source_record` trong knowledge.v1 | [schema](../../contracts/knowledge.v1.schema.json); bản ghi lưu append-only ở bảng `source_records` (P2-2) | `validateKnowledge('source_record')`, `sourceUseDecision` (`src/domain/knowledge/source-rights.ts`) | tests/contract/knowledge-schemas |
| 2 | Knowledge Schemas | knowledge.v1 (`governance` 8 nhóm + 10 loại khối) | [schema](../../contracts/knowledge.v1.schema.json) | `validateKnowledge('knowledge_unit')` | như trên |
| 3 | Ingestion Playbook | `playbook-1` | [ingestion-playbook.v1.json](../../contracts/knowledge/ingestion-playbook.v1.json) + `package_request` | `loadPlaybook()` (`src/infrastructure/contracts/knowledge-specs.ts`) | như trên |
| 4 | QC Specification | `qc-spec-1` | [qc-spec.v1.json](../../contracts/knowledge/qc-spec.v1.json) | `loadQcSpec()` kiểm mã duy nhất, đúng tầng | như trên; thực thi ở P2-2 |
| 5 | Test & Coverage Manifest | `coverage_manifest` trong knowledge.v1 | nằm trong `package_manifest.coverage` | schema + `evaluateCoverage` (`src/domain/knowledge/coverage.ts`) | như trên |
| 6 | Release Manifest | `release_manifest` trong knowledge.v1 | lưu ở bảng `release_manifests` khi phát hành (P2-2) | schema (bắt buộc đủ QC1–QC4 PASS gắn `bundle_hash`) | như trên |

## Quy ước chính
- **Tám nhóm trường quản trị** (05 §4.A): `identity`, `scope`, `basis` (nguồn, locator, cách suy ra, knowledge gaps), `authority` (1 trong 6 loại phát biểu), `validity`, `verification` (5 trục độc lập, không có nhãn "Verified" chung), `dependencies` (đơn vị + media sha256), `permissions` (vai trò được nhận, mức tiết lộ, tình trạng bản quyền).
- **Mười loại khối**: `foundation_language`, `foundation_policy` (Nền 1–2), `competency_spec` (hợp đồng bằng chứng 5 thành phần; cạnh `prerequisite` bắt buộc có `basis`), `rubric` (chuẩn gốc chỉ Band nguyên — kiểu integer, không biểu diễn được 6.5), `diagnostic_card` (7 thành phần), `generation_spec`, `micro_lesson` (≥1 phản ví dụ), `scaffold` (thông tin được phép, quyết định người học giữ, dấu hiệu vượt tiết lộ), `task_item`, `answer_key`.
- **Tách đề và đáp án ở mức dữ liệu**: `task_item` không có trường đáp án/giải thích/mục tiêu đo (schema chặn `additionalProperties`); chúng nằm trong `answer_key` với quyền `verifier`/`assessor`. Nhờ vậy giải mù được dựng mà không cần đọc rồi lọc đáp án.
- **Quyền nguồn (D-05)**: `rights.status = unclear` buộc `store_copy = ai_processing = learner_display = false` và không được `approved`; `sourceUseDecision` chặn khi nguồn chưa đăng ký/chưa approved, quyền chưa rõ, hoặc mục đích dùng vượt quyền đã ghi. Code chỉ áp dụng quyền đã ghi nhận, không tự suy quyền pháp lý.
- **Bao phủ**: mỗi vai trò sử dụng (`teach`, `practice`, `diagnose`, `independent_verification`) khai báo nhóm ca bắt buộc; thiếu nhóm nào chỉ chặn vai trò đó (`evaluateCoverage`). Ca `synthetic` không được khai là `external_reference`; ca `assessment` phải có đầu vào và kỳ vọng.
- **QC Spec**: mỗi luật có `method` = `deterministic` | `preliminary_filter` | `semantic`. Bộ lọc chuỗi/từ khóa chỉ là cảnh báo sơ bộ; luật `semantic` (QC2_SOURCE_SUPPORT, QC3_POLICY_COMPLIANCE) cần kết quả ngữ nghĩa trên đúng `bundle_hash` (P2-2).
- **Đổi phiên bản**: không sửa knowledge.v1/qc-spec-1/playbook-1 tại chỗ sau khi đã có gói đóng băng theo chúng; tạo bản mới. Kết quả QC gắn `qc_spec_version`, nên đổi QC Spec làm kết quả cũ hết hiệu lực.

## Giới hạn
JSON Schema chỉ kiểm cấu trúc; không chứng minh nội dung đúng, nguồn hỗ trợ phát biểu hay chấm đúng. Chưa có gói Writing/Reading thật được phép dùng (D-05 vẫn mở cho nội dung thật).
