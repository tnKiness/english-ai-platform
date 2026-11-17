# D-01 cho Claude Code (`claude-code`) và Antigravity (`agy`) theo E-21

Ngày lập: 21/10/2026. Liên quan: E-09, E-11…E-17, E-20, **E-21** trong [DECISIONS](DECISIONS.md), [P2_ACCEPTANCE](P2_ACCEPTANCE.md), [P4_ACCEPTANCE](P4_ACCEPTANCE.md), [D01_CODEX_READ_BOUNDARY](D01_CODEX_READ_BOUNDARY.md).

Tài liệu này ghi nhận thông số đã đo thực tế trên máy ngày 21/10/2026, cách triển khai kỹ thuật E-21 trong AI Gateway và các bước theo thứ tự để người dùng tự chạy nhằm đóng D-01 cho `claude-code` và `agy`. **Codex đã READY từ trước và giữ nguyên hoàn toàn argv, bằng chứng `enforced_boundary` cũng như ranh giới hệ điều hành.**

---

## 1. Sự thật đã đo trên máy (21/10/2026) và cơ chế E-21

Khác với Codex (có tài khoản Windows sandbox `CodexSandboxOffline`), Claude Code và Antigravity (`agy`) chạy dưới chính tài khoản Windows của người dùng. Theo quyết định **E-21** (người dùng chốt 21/10/2026), ranh giới đọc do chính CLI cưỡng chế được chấp nhận thay cho bằng chứng hệ điều hành và được ghi bằng `method` riêng (không gọi là `enforced_boundary`):

| Thuộc tính | `claude-code` | `agy` (Antigravity CLI) | `codex` (giữ nguyên) |
|---|---|---|---|
| Phiên bản đo được | `2.1.288` | `1.4.2` | `0.163.0-alpha.10.2` |
| Entrypoint native | `…\node_modules\@anthropic-ai\claude-code\bin\claude.exe` (từ chối shim `claude.cmd`) | `%LOCALAPPDATA%\agy\bin\agy.exe` | `%LOCALAPPDATA%\OpenAI\Codex\bin\<hash>\codex.exe` |
| Biến môi trường tách profile | `CLAUDE_CONFIG_DIR` trỏ thư mục profile riêng | `USERPROFILE` **và** `HOME` của tiến trình con cùng trỏ thư mục profile riêng | `CODEX_HOME` trỏ thư mục profile riêng |
| Argv cố định của Gateway | `-p --output-format stream-json --verbose --restricted --tools "" --strict-mcp-config --no-session-persistence --model <m> --effort <e>` | `-p --input-format stream-json --output-format stream-json --sandbox --mode plan --model <m>` | `exec --json --sandbox read-only -c windows.sandbox="elevated" --disable <28 cờ> --skip-git-repo-check --color never -` |
| Model mặc định (đề xuất, người dùng xác nhận khi verify) | `claude-opus-5-5` (`--effort medium`) | `gemini-4-argon-medium` | `gpt-6-astra` (đã xác nhận) |
| Truyền dữ liệu qua stdin | Văn bản chỉ dẫn + `DATA (...)` qua stdin | Một dòng NDJSON user message (`--input-format stream-json`) qua stdin | Văn bản chỉ dẫn + `DATA (...)` qua stdin |
| Method `file_scope_test` | `cli_tools_disabled` (chỉ hợp lệ cho `claude-code`) | `cli_permission_deny` (chỉ hợp lệ cho `agy`) | `enforced_boundary` (chỉ hợp lệ cho `codex`) |
| Bằng chứng probe ranh giới (`probe-boundary`) | Sự kiện `system/init` của CLI báo `tools: []`, `mcp_servers: []`, `plugins` chỉ gồm 3 plugin builtin (`cc-plugin-agents-md`, `cc-plugin-telemetry`, `cc-plugin-plugin-authoring`) + kiểm tra cấu hình (`CLAUDE.md`/`AGENTS.md` ở profile và tổ tiên workspace) | `<profile>\.gemini\antigravity-cli\settings.json` có đủ 5 quy tắc `permissions.deny`: `command(*)`, `read_file(*)`, `write_file(*)`, `read_url(*)`, `mcp(*)` + 2 ca đọc mồi (trong và ngoài cwd) bị CLI chặn `"permission check failed"` không lộ mồi + kiểm tra cấu hình `.gemini` | `codex sandbox` dưới tài khoản `CodexSandboxOffline` + ACL Deny + `inspectCodexConfig` |
| Kiểm tra đăng nhập (không lưu secret) | `claude auth status` → JSON `loggedIn: true`, `authMethod: "claude.ai"`, `subscriptionType` | `agy models` → liệt kê model `gemini-*` (đăng nhập Google dùng chung; gói **Google AI Ultra** do người dùng xác nhận) | `codex login status` → `Logged in using ChatGPT` |
| Quan sát extra usage | `rate_limit_event.rate_limit_info.overageStatus = "rejected"`, `overageDisabledReason = "org_level_disabled"` + xác nhận người dùng 30 ngày | Xác nhận người dùng 30 ngày (`confirm-extra-usage agy off`) | Xác nhận người dùng 30 ngày (`confirm-extra-usage codex off`) |

### Lưu ý bảo mật quan trọng
1. **Kiểm tra chéo tại `subscriptionGuard` và `AiExecutionGateway`:**
   - `codex` chỉ chấp nhận `enforced_boundary`.
   - `claude-code` chỉ chấp nhận `cli_tools_disabled`.
   - `agy` chỉ chấp nhận `cli_permission_deny`.
   - Nếu nạp sai `method` cho provider (ví dụ gán `cli_tools_disabled` cho `codex` hoặc `agy`), guard từ chối ngay với `READ_BOUNDARY_UNVERIFIED` và `BOUNDARY_METHOD_NOT_ALLOWED_FOR_<provider>:<method>`.
   - Trước mỗi lần chạy, gateway đọc lại báo cáo `enforcement_evidence_ref` và so khớp SHA-256 entrypoint, `cli_version`, thư mục profile, `workspace` (`C:\se-runner\work`) và **toàn bộ mảng `argv` thực thi** với `gateway_argv` trong báo cáo probe (`ARGV_MISMATCH`). Đồng thời gateway chạy lại `config_inspection` trực tiếp trên đĩa.
2. **Không tự tạo hoặc ghi đè `settings.json` của người dùng:**
   - Lệnh `probe-boundary agy` chỉ đọc `<profile>\.gemini\antigravity-cli\settings.json`. Nếu file chưa có hoặc có nội dung khác 5 quy tắc deny bắt buộc, lệnh dừng với kết luận `FAIL` và in hướng dẫn để người dùng tự cấu hình, tuyệt đối không ghi đè.
3. **Cổng đối chứng D-05 cho provider dự phòng (E-20):**
   - Sau khi `claude-code` và `agy` đạt `READY` ở cổng D-01, chúng có thể chạy khi được chọn làm provider chính hoặc chạy kiểm thử, nhưng khi đóng vai trò **provider dự phòng tự động (failover)** đứng sau Codex thì vẫn phải có thêm báo cáo đối chứng `sourced` đạt cổng D-05 (`canEnableBackupProvider`).

---

## 2. Các bước người dùng cần làm theo thứ tự (đóng D-01 cho `claude-code` và `agy`)

Chạy các lệnh dưới đây trong **PowerShell thường do bạn mở** tại thư mục gốc repository `C:\Code\study-english` (không chạy qua relay tự động).

### Bước 1: Đảm bảo thư mục workspace runner và tạo 2 thư mục profile riêng

```powershell
New-Item -ItemType Directory -Force C:\se-runner\work | Out-Null

$claudeProfile = Join-Path $env:LOCALAPPDATA 'study-english\runners\claude-main'
$agyProfile    = Join-Path $env:LOCALAPPDATA 'study-english\runners\agy-main'
New-Item -ItemType Directory -Force -Path $claudeProfile | Out-Null
New-Item -ItemType Directory -Force -Path $agyProfile | Out-Null
```

### Bước 2: Đăng nhập Claude trong profile riêng và cấu hình deny cho profile `agy`

1. **Đăng nhập Claude Code (`claude.ai`) trong profile `claude-main`:**
   ```powershell
   $env:CLAUDE_CONFIG_DIR = $claudeProfile
   claude
   ```
   Trong giao diện Claude Code, gõ `/login`, đăng nhập bằng tài khoản thuê bao `claude.ai` (Pro/Max, không dùng API key), sau đó thoát (`/exit`). Kiểm tra lại:
   ```powershell
   claude auth status
   Remove-Item Env:CLAUDE_CONFIG_DIR
   ```
   Kết quả in ra phải có `"loggedIn": true` và `"authMethod": "claude.ai"`. Không thêm `CLAUDE.md`, MCP server hay plugin ngoài vào `$claudeProfile`.

2. **Tạo file `settings.json` khóa công cụ cho profile `agy-main`:**
   Kiểm tra nếu chưa có file cấu hình trong `$agyProfile` thì tạo mới với đúng 5 quy tắc `deny`:
   ```powershell
   $agySettingsDir  = Join-Path $agyProfile '.gemini\antigravity-cli'
   $agySettingsFile = Join-Path $agySettingsDir 'settings.json'
   New-Item -ItemType Directory -Force -Path $agySettingsDir | Out-Null
   if (Test-Path $agySettingsFile) {
     Write-Warning "Đã có $agySettingsFile — hãy kiểm tra thủ công trước khi sửa:"
     Get-Content $agySettingsFile
   } else {
     '{"permissions":{"deny":["command(*)","read_file(*)","write_file(*)","read_url(*)","mcp(*)"]}}' |
       Set-Content -Encoding UTF8 -NoNewline $agySettingsFile
   }
   ```
   *(Lưu ý: hoàn toàn không đụng tới `~/.gemini/antigravity-cli/settings.json` của tài khoản chính/relay).*

### Bước 3: Đăng ký tài khoản (`account`) và xác nhận tắt extra usage (`confirm-extra-usage`)

Sau khi bạn đã kiểm tra trên tài khoản `claude.ai` và tài khoản Google AI Ultra rằng mua thêm credit / extra usage / auto-recharge đang **TẮT**:

```powershell
npm.cmd run ai -- account claude-main claude-code "Claude Code chính" "$claudeProfile"
npm.cmd run ai -- account agy-main agy "Antigravity chính" "$agyProfile"

npm.cmd run ai -- confirm-extra-usage claude-code off
npm.cmd run ai -- confirm-extra-usage agy off
```

*(Xác nhận có hiệu lực 30 ngày theo E-11).*

### Bước 4: Chạy `probe-boundary` cho `claude` và `agy`

- **Với Claude Code** *(tốn 1 prompt ngắn trên thuê bao để đọc sự kiện `system/init`)*:
  ```powershell
  npm.cmd run ai -- probe-boundary claude --profile "$claudeProfile" --out var/ai/probe-boundary-claude-1.json
  ```
  Kỳ vọng: `init: tools=[], mcp_servers=[]`, `Cấu hình (config_inspection): sạch`, `Kết luận (cli_tools_disabled): PASS`.

- **Với Antigravity `agy`** *(tốn 2 prompt ngắn trên thuê bao để thử đọc file mồi trong và ngoài cwd)*:
  ```powershell
  npm.cmd run ai -- probe-boundary agy --profile "$agyProfile" --out var/ai/probe-boundary-agy-1.json
  ```
  Kỳ vọng: cả `inside_cwd` và `outside_cwd` đều `ĐẠT (PERMISSION_CHECK_FAILED_NO_LEAK)`, `Cấu hình (config_inspection): sạch`, `Kết luận (cli_permission_deny): PASS`.

### Bước 5: Chạy `verify` cho `claude` và `agy`

Model mặc định được đề xuất là `claude-opus-5-5` (`--effort medium`) cho Claude và `gemini-4-argon-medium` cho `agy` (bạn có thể truyền `--model` / `--effort` khác nếu muốn, nhưng phải khớp với argv trong `probe-boundary`):

```powershell
npm.cmd run ai -- verify claude --profile "$claudeProfile" --profile-id claude-main --model claude-opus-5-5 --effort medium --out var/ai/evidence-claude-1.json
npm.cmd run ai -- verify agy --profile "$agyProfile" --profile-id agy-main --model gemini-4-argon-medium --out var/ai/evidence-agy-1.json
```

Mỗi lệnh kiểm tra phiên bản + SHA-256 entrypoint native, trạng thái đăng nhập, 1 lượt chạy synthetic quan sát envelope JSONL, và 2 lượt kiểm tra timeout/cancel kết thúc cây tiến trình (tốn ~3 prompt mỗi hãng; nếu hết hạn mức giữa chừng lệnh sẽ dừng sớm với `QUOTA_OR_RATE_LIMIT`).

### Bước 6: Người dùng rà soát và xác nhận bằng chứng (`evidence-*.json`)

Script `verify` **không tự đặt `VERIFIED`** và không tự điền gói thuê bao. Mở từng file (`notepad var/ai/evidence-claude-1.json` và `notepad var/ai/evidence-agy-1.json`) rồi lưu sang bản đã duyệt (ví dụ `evidence-claude-approved.json`, `evidence-agy-approved.json`) sau khi kiểm tra:

1. `evidence.entitlement.plan`: điền gói thực tế (ví dụ `"Claude Pro"` cho Claude, `"Google AI Ultra"` cho agy) và đặt `"applies_to_cli": true`.
2. `evidence.models_allowed`: xác nhận đúng model bạn cho phép dùng (ví dụ `["claude-opus-5-5"]` và `["gemini-4-argon-medium"]`).
3. `evidence.isolation.plugins_disabled`: đặt `true` (sau khi `probe-boundary` ở Bước 4 đã báo cấu hình sạch).
4. `envelope.status`: đặt `"VERIFIED"` và bổ sung `envelope.error_patterns` (ví dụ `[{"pattern": "usage limit|rate_limit", "error": "QUOTA_EXHAUSTED"}, {"pattern": "session expired|not logged in", "error": "AUTH_EXPIRED"}]`); đặt `evidence.output_contract.envelope_verified`: `true`.
5. Giữ nguyên `evidence.isolation.file_scope_test` — lệnh nạp ở Bước 7 sẽ ghép phần `file_scope_test` từ báo cáo `--boundary` đã PASS.

### Bước 7: Nạp `evidence` kèm `--boundary`, cấp `consent` 5 loại dữ liệu và kiểm tra `status`

```powershell
npm.cmd run ai -- evidence var/ai/evidence-claude-approved.json --boundary var/ai/probe-boundary-claude-1.json
npm.cmd run ai -- consent claude-code approved grant

npm.cmd run ai -- evidence var/ai/evidence-agy-approved.json --boundary var/ai/probe-boundary-agy-1.json
npm.cmd run ai -- consent agy approved grant

npm.cmd run ai -- status
```

Khi mọi chốt đều đạt, `npm.cmd run ai -- status` sẽ báo cả 3 provider (`codex`, `claude-code`, `agy`) đều `READY`, kèm danh sách 5 loại dữ liệu được phép nhận (`synthetic_fixture`, `knowledge_content`, `answer_key`, `learner_submission`, `learner_profile`; `learner_audio` luôn bị chặn cứng).


## Cập nhật 21/10/2026 (sau lượt relay)
- Đã làm sẵn: Bước 1 (hai thư mục profile), Bước 2.2 (settings.json deny cho `agy-main`), `ai -- account` cho `claude-main` và `agy-main`.
- agy 1.4.3: argv dùng `-p=` (không phải `-p`) và stdin dạng `{"event":"user","message":{"content":"…"}}` — đã sửa trong code.
- `probe-boundary agy` thật: PASS (`var/ai/probe-boundary-agy-2.json`). Còn lại: đăng nhập Claude (Bước 2.1), `confirm-extra-usage` cho cả hai, probe claude, verify, duyệt evidence, nạp, consent.


## Thêm/đổi model theo E-22 (21/10/2026)
1. Xem ứng viên và nguồn: `npm.cmd run ai -- models <provider>` (codex, claude-code hoặc agy; claude là bí danh). Danh mục không gọi inference, không chứng minh quyền thuê bao.
2. Khi xác nhận extra usage OFF còn hạn: `npm.cmd run ai -- verify <provider> --profile <dir> --models <model-a>,<model-b> [--effort <e>] --out <file-moi.json>`. Dùng ID từ danh mục; bỏ effort cho agy. Một synthetic/model + hai lượt timeout/cancel chung; --models không chạy các behavioral probe Codex cũ.
3. Kiểm tra observations.models/models_verified/models_unverified. Chỉ thành công mới vào models_allowed; model_configurations ghim cặp model/effort. Quota dừng sớm, model chưa chạy ghi not_run. Báo cáo abort không được nạp làm READY; tiếp tục khi có quota, không bật trả phí.
4. Duyệt bản mới theo D-01, không thêm model/effort chưa thử bằng tay. Nạp `npm.cmd run ai -- evidence <file-moi-da-duyet.json> --boundary <probe-PASS.json>`. Không sửa đè báo cáo cũ. Probe dùng lại khi chỉ khác model/effort; binary/profile/workspace/cờ an toàn phải giữ nguyên, cấu hình sống vẫn được kiểm tra. Lập luận và ngoại lệ cần probe lại tại E-22.
5. `npm.cmd run ai -- model <provider> <model> [effort]` lưu mặc định cho app; gateway kiểm lại mỗi lượt, sai trả MODEL_NOT_VERIFIED. Evidence cũ chỉ cho effort đã ghi, effort mới cần verify riêng. D-05 failover vẫn phải khớp model.

Phần này cập nhật yêu cầu khớp toàn bộ argv trong hướng dẫn cũ: nay so khớp mẫu chính xác ngoài model/effort. Quyền dữ liệu, ACL và deny giữ nguyên. Lượt E-22 chỉ chạy fixture, chưa verify thêm model thật.

## Vận hành khi CLI tự cập nhật, runtime self-check và canary model theo E-23 (21/10/2026)
1. **Không phải verify lại khi `claude` hoặc `agy` tự cập nhật:**
   - Khi `agy` (ví dụ `1.4.2` → `1.4.4`) hoặc `claude` đổi `cli_version` / SHA-256 entrypoint, gateway giữ trạng thái `READY`, không chặn `CLI_VERSION_CHANGED_SINCE_VERIFICATION` hay `ENTRYPOINT_CHANGED_SINCE_VERIFICATION`.
   - `npm.cmd run ai -- status` hiển thị cả bản đã verify lẫn bản quan sát trực tiếp dưới dạng thông tin (`INFO:`). Entrypoint vẫn phải là file native thực thi đúng hãng (từ chối shim `.cmd` và sai binary).
   - Các xác nhận của người dùng (gói thuê bao, `models_allowed`, `confirm-extra-usage`, `consent`) tự động giữ hiệu lực qua các phiên bản CLI.
2. **Kiểm tra ranh giới trong mỗi lượt chạy (runtime self-check):**
   - `claude-code`: adapter đọc trực tiếp sự kiện `system/init` (và các block nội dung) trong luồng `stream-json` của chính lượt chạy; nếu `tools` hoặc `mcp_servers` khác rỗng (hoặc có sự kiện `tool_use`), kết quả bị loại ngay (`BILLING_UNVERIFIED`), không commit observation, và tài khoản chuyển sang trạng thái chặn (`NEEDS_VERIFICATION`) kèm lý do `RUNTIME_TOOLS_PRESENT`.
   - `agy`: ngay trước khi spawn tiến trình, adapter đọc `<profile>\.gemini\antigravity-cli\settings.json` và đối chiếu đúng 5 quy tắc `permissions.deny` (`command(*)`, `read_file(*)`, `write_file(*)`, `read_url(*)`, `mcp(*)`); nếu thiếu, thừa hoặc bị sửa, tiến trình không được chạy và bị chặn với `RUNTIME_DENY_RULES_CHANGED`. Sau khi chạy, nếu có bất kỳ sự kiện `step_update` kiểu tool nào hoàn tất (`state: 'DONE'`) mà không phải lỗi từ chối quyền (`permission check failed`), kết quả bị loại và tài khoản bị chặn với `RUNTIME_TOOL_EXECUTED`.
3. **Khai báo `models_allowed` và canary model theo phiên bản:**
   - Khai báo danh sách model cho phép dùng mà không cần chạy `verify`:
     ```powershell
     npm.cmd run ai -- allow-models claude-code claude-opus-5-5,sonnet,opus
     npm.cmd run ai -- allow-models agy gemini-4-argon-medium,gemini-4-argon-low
     ```
   - Đổi model/effort mặc định:
     ```powershell
     npm.cmd run ai -- model claude-code sonnet high
     npm.cmd run ai -- model agy gemini-4-argon-medium
     ```
   - Lần đầu tiên chạy một tổ hợp `(provider, cli_version, model[, effort])` chưa có canary đạt trong phiên bản CLI hiện tại, gateway tự chạy 1 prompt synthetic ngắn qua đúng đường adapter để kiểm tra envelope + hợp đồng đầu ra: đạt thì lưu vào bảng `provider_model_canaries` và chạy job thật; không đạt thì chặn riêng model/effort đó với `MODEL_CANARY_FAILED`.
