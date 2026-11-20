// Sinh các phần TỰ ĐỘNG của docs/HUONG_DAN_SU_DUNG.md từ mã nguồn (quy định ở AGENTS.md, quyết định E-26).
//   npm run docs:guide           ghi lại các khối <!-- AUTO:tên:START --> … <!-- AUTO:tên:END -->
//   npm run docs:guide -- --check  không ghi; thoát 1 nếu hướng dẫn lệch mã nguồn hoặc thiếu mô tả (chạy trong npm run check)
// Phần viết tay nằm ngoài các khối AUTO và không bao giờ bị script ghi đè.
// Thêm script npm, route API, cờ worker hay lệnh mới mà chưa có mô tả ở các bảng dưới thì --check báo lỗi:
// đó là lúc bổ sung mô tả ở đây VÀ phần viết tay tương ứng trong hướng dẫn.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const GUIDE = join(ROOT, 'docs', 'HUONG_DAN_SU_DUNG.md');
const read = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const problems = [];

// ---- Mô tả viết tay cho dữ liệu trích từ mã -----------------------------------------------------
const SCRIPTS = {
  dev: 'Chạy giao diện web (Vite) ở http://127.0.0.1:5173; cần `dev:server` chạy song song.',
  'dev:server': 'Chạy backend local ở 127.0.0.1:4317, mở dữ liệu thật trong `var/`, tự áp migration mới.',
  start: 'Chạy bản đã build (không build lại): giao diện + API ở http://127.0.0.1:4317.',
  app: 'Cách dùng hằng ngày: build rồi chạy giao diện + API ở http://127.0.0.1:4317 bằng một lệnh.',
  lint: 'Kiểm tra ESLint.',
  typecheck: 'Kiểm tra kiểu TypeScript (không sinh file).',
  test: 'Chạy toàn bộ test Vitest (dữ liệu synthetic, CLI giả, không gọi AI thật).',
  build: 'Build backend (`tsc`) và web (Vite).',
  check: 'Cổng chất lượng: lint → đồng bộ hướng dẫn → typecheck → test → build. Phải đạt trước khi bàn giao/commit.',
  'docs:guide': 'Sinh lại các phần tự động của hướng dẫn này; `-- --check` chỉ kiểm tra.',
  'hooks:install': 'Bật git hook của repo (`.githooks/pre-commit`): tự sinh lại phần tự động của hướng dẫn trước mỗi commit.',
  spike: 'Thử SQLite (transaction, backup) và tiến trình Windows (stdin/EOF/timeout/cây tiến trình).',
  inventory: 'Liệt kê CLI AI có trên PATH (chỉ metadata, không đọc đăng nhập, không gọi model).',
  relay: 'Relay AI lập trình: giao một nhiệm vụ code cho ai-router, tự chuyển nền tảng khi hết hạn mức.',
  'router:sync': 'Chép lõi định tuyến từ `../ai-router/src/core`; `-- --check` chỉ so sánh.',
  ai: 'Quản trị AI thật: trạng thái provider, tài khoản, bằng chứng D-01, đồng ý dữ liệu, model (xem mục lệnh `ai`).',
  worker: 'Worker xử lý job AI trong hàng đợi (xem mục cờ worker).',
  backup: 'Sao lưu / khôi phục DB + JSON + media (xem mục lệnh `backup`).',
  export: 'Xuất dữ liệu học tập cá nhân ra thư mục riêng, hoặc xem dung lượng đang dùng (xem mục lệnh `export`).',
  sources: 'Quét trang nguồn IELTS chính thức/tham chiếu trong danh sách miền cho phép (`crawl`, `status`); duyệt ở Builder & QC → Nguồn.',
  tts: 'TTS cục bộ (Piper, offline) để đọc kịch bản Listening: `status` xem engine/giọng đã cài, `say "<văn bản>" [--voice id]` đọc thử và lưu WAV vào kho media.',
  author: 'AI soạn khung năng lực + rubric Writing Task 2 từ nguồn đã duyệt rồi một AI khác rà soát (`framework`, `review <version>`, `sources`, `list`); duyệt ở Builder & QC → Khung năng lực. C3: `items [--count n]` AI soạn đề Writing Task 2 theo khung đã duyệt, đề đạt QC1–QC4 tự phát hành; `items-review <batch_id>`, `items-list`.',
  'qc:real': 'Chạy QC1–4 thật bằng provider READY trên gói synthetic trong kho tạm `var/qc-real/` (tốn vài prompt thuê bao).',
  'seed:reading': 'Nạp gói Reading synthetic đã qua QC vào kho để thử luồng Reading.',
};

const WORKER_FLAGS = {
  '--once': 'Xử lý đúng một job rồi thoát, in kết quả JSON.',
  '--fake': 'Khi không có provider READY: chạy job dry-run bằng FakeAdapter (kết quả synthetic, không thành bằng chứng học).',
  '--fake-blind-answers': 'Kèm `--fake`: đáp án giải mù giả lập, ví dụ `"q1=FALSE,q2=NOT GIVEN"`.',
  '--complaints': 'Chỉ xử lý job khiếu nại/tái đánh giá của người học qua gateway.',
  '--learning': 'Chấm bài Writing của người học bằng AI thật qua gateway (bài nộp khi app chạy với `STUDY_ENGLISH_LEARNING_AI=real`). Không dùng được với `--fake`.',
  '--poll-ms': 'Khoảng nghỉ khi hàng đợi trống (mặc định 2000 ms).',
  '--quota-recheck-ms': 'Chu kỳ kiểm lại job `WAITING_QUOTA` (mặc định 300000 ms = 5 phút); không gọi model.',
};

const ROUTES = {
  'GET /api/health': 'Kiểm tra server sống (không cần phiên).',
  'GET /api/session': 'Tạo/lấy phiên và CSRF token (không cần phiên).',
  'GET /api/learning/goals': 'Đọc mục tiêu học.',
  'POST /api/learning/goals': 'Lưu mục tiêu (Band, loại thi, ngày thi, phút/ngày, phút/tuần).',
  'GET /api/learning/today': 'Màn Học hôm nay: bài đang dở, nhiệm vụ đề xuất (`?available_minutes=`).',
  'POST /api/learning/attempts': 'Bắt đầu một bài Writing (chế độ, mục đích).',
  'GET /api/learning/attempts/:id': 'Workspace của một bài (đã cắt quyền: không lộ đáp án/gợi ý chưa mở).',
  'POST /api/learning/attempts/:id/autosave': 'Lưu nháp lên server.',
  'POST /api/learning/attempts/:id/input-support': 'Hỗ trợ đầu vào (dàn ý/từ vựng); bị chặn ở chế độ thi.',
  'POST /api/learning/attempts/:id/submit': 'Nộp bài gốc hoặc bản sửa (`is_repair`).',
  'POST /api/learning/attempts/:id/hints/unlock': 'Mở gợi mở theo nấc 1 → 2 → 3.',
  'POST /api/learning/attempts/:id/step5/action': 'Bước 5: "Để mình thử thêm", "Giải thích trực tiếp", hỏi lại.',
  'POST /api/learning/attempts/:id/step6/complete': 'Bước 6: trả lời câu kiểm tra khái niệm.',
  'POST /api/learning/attempts/:id/start-7a': 'Tạo bài kiểm chứng 7A mới, sạch gợi ý.',
  'GET /api/learning/reading': 'Danh mục bài Reading được cấp phát.',
  'POST /api/learning/reading': 'Bắt đầu một bài Reading.',
  'GET /api/learning/reading/:id': 'Xem bài Reading (đề giải mù, không có đáp án trước khi nộp).',
  'POST /api/learning/reading/:id/autosave': 'Lưu nháp Reading.',
  'POST /api/learning/reading/:id/submit': 'Nộp đáp án Reading.',
  'POST /api/learning/reading/:id/hints': 'Mở gợi ý Reading theo nấc (nấc 3 mở đáp án, ghi exposure).',
  'GET /api/learning/audio': 'Danh sách phiên luyện nói.',
  'POST /api/learning/audio': 'Tạo phiên luyện nói.',
  'GET /api/learning/audio/:id': 'Xem phiên luyện nói.',
  'POST /api/learning/audio/:id/recordings': 'Lưu bản thu (WAV/WebM/OGG ≤ 8 MiB) vào kho media cục bộ.',
  'GET /api/learning/audio/:id/recordings/:recording': 'Phát lại bản thu.',
  'POST /api/learning/audio/:id/autosave': 'Lưu nháp phần văn bản của phiên nói.',
  'POST /api/learning/audio/:id/transcripts': 'Lưu bản chép lời do người học tự nhập.',
  'POST /api/learning/audio/:id/review-text': 'Nhận xét dạng văn bản (không gửi audio, không báo Band Speaking).',
  'POST /api/learning/tracking/activity': 'Heartbeat thời gian học (chỉ siêu dữ liệu, idempotent).',
  'POST /api/learning/tracking/day': 'Khai báo ngày: nghỉ có kế hoạch / học ngoài ứng dụng / quỹ thời gian.',
  'GET /api/learning/tracking': 'Theo dõi N ngày gần nhất (`?days=1..31`), kèm `as_of`.',
  'GET /api/learning/notifications': 'Lời nhắc trong ứng dụng (tạo nhắc của hôm nay nếu chưa có).',
  'POST /api/learning/notifications/:id/dismiss': 'Đánh dấu đã xem một lời nhắc.',
  'POST /api/learning/export': 'Xuất dữ liệu học tập vào `var/exports/` (chỉ đọc, không xóa gì).',
  'GET /api/learning/storage': 'Dung lượng dữ liệu trong `var/`, dung lượng trống của ổ, các bảng lớn nhất.',
  'GET /api/learning/progress': 'Tiến độ & hồ sơ năng lực: mức A1–A6, độ tin cậy, mức theo từng điều kiện làm bài theo chính sách D-02 v1 (chưa báo Band).',
  'GET /api/learning/replan': 'Đề xuất sắp xếp lại lịch (D-02 F): tạo tối đa 1 đề xuất mỗi ngày khi bị trễ quá quỹ giờ; không thay đổi gì cho tới khi bạn chọn.',
  'POST /api/learning/replan/:id/accept': 'Áp dụng đề xuất lịch (chỉ khi lịch chưa đổi từ lúc đề xuất; quá 48 giờ thì hết hạn).',
  'POST /api/learning/replan/:id/reject': '"Giữ nguyên lịch": đóng đề xuất, không dời nhiệm vụ nào.',
  'GET /api/learning/settings': 'Cài đặt: mục tiêu và trạng thái gateway AI.',
  'POST /api/learning/complaints': 'Yêu cầu xem xét lại một nhận định (tạo job tái đánh giá).',
  'GET /api/console/packages': 'Builder & QC: danh sách gói tri thức.',
  'GET /api/console/packages/:id/:version/events': 'Nhật ký pipeline của một gói.',
  'POST /api/console/packages/:id/:version/content': 'Mở xem nội dung gói (ghi exposure trước khi trả).',
  'POST /api/console/packages/:id/:version/qc/checks': 'Chạy QC1–3 phần xác định.',
  'POST /api/console/packages/:id/:version/qc/attest': 'Xác nhận QC2/QC3 ngữ nghĩa trên đúng bundle hash.',
  'POST /api/console/packages/:id/:version/qc/qc4/start': 'Tạo job QC4 (giải mù + đối chiếu).',
  'POST /api/console/packages/:id/:version/qc/qc4/advance': 'Cập nhật kết quả QC4 từ hàng đợi.',
  'POST /api/console/packages/:id/:version/release': 'Phát hành gói khi QC1–4 đạt trên đúng hash.',
  'POST /api/console/packages/:id/:version/withdraw': 'Ngừng (suspended) hoặc loại bỏ (retired) gói.',
  'POST /api/console/packages/:id/:version/dry-run': 'Chạy thử (dry-run) với văn bản nhập, không thành bằng chứng học.',
  'POST /api/console/revoke': 'Thu hồi item/rubric/gói/tri thức; lan truyền tới cache và nhận định.',
  'GET /api/console/search': 'Tìm gói tri thức (BM25) theo vai trò: `?q=&role=`; chỉ trả tham chiếu + tiêu đề, không trả nội dung.',
  'POST /api/console/search/rebuild': 'Dựng lại chỉ mục tìm kiếm từ các file JSON bất biến.',
  'GET /api/console/issues': 'Mục "Cần xử lý": review mở và job bị dừng.',
  'POST /api/console/issues/:reviewId/resolve': 'Đóng một review với cách xử lý đã chọn.',
  'GET /api/console/runs': 'Các lần chạy AI gần đây.',
  'GET /api/console/sources': 'Danh sách trang nguồn đã quét (lọc theo trạng thái duyệt/tải, loại, kỹ năng, miền, từ khóa) và số đếm.',
  'GET /api/console/sources/:id/excerpt': 'Trích đoạn văn bản thuần của một trang đã tải (không trả HTML gốc).',
  'GET /api/console/sources/:id/audio': 'Phát file audio Listening đã tải (chỉ nguồn audio đã nhận diện bằng magic bytes; nosniff).',
  'POST /api/console/sources/review': 'Duyệt hoặc loại nhiều trang nguồn; trang được duyệt thành bản ghi Source Registry (quyền dùng cá nhân, E-36).',
  'GET /api/console/frameworks': 'Các phiên bản khung năng lực Writing Task 2 do AI soạn (trạng thái, số lỗi/cảnh báo kiểm tra tự động) và các lần gọi AI soạn/rà soát.',
  'GET /api/console/frameworks/:version': 'Một bản khung: năng lực, hợp đồng bằng chứng, trích dẫn nguồn, rubric chính thức, kết quả kiểm tra tự động và lượt AI rà soát.',
  'GET /api/console/item-batches': 'Các lô đề Writing Task 2 do AI soạn (C3): số đề phát hành/nháp/bị loại, số lượt gọi AI sinh đề hôm nay. Không chứa nguyên văn đề.',
  'GET /api/console/item-batches/:batchId': 'Một lô đề: thể loại, chủ đề, trạng thái QC/phát hành từng đề, lỗi kiểm tra tự động và kết quả AI rà soát; không chứa nguyên văn đề (xem đề qua Gói tri thức để ghi tiếp xúc).',
  'POST /api/console/frameworks/:version/decision': 'Duyệt hoặc loại một bản nháp khung năng lực (cần không còn lỗi kiểm tra, đã có AI rà soát, không phải synthetic).',
  'GET /api/console/gateway': 'Trạng thái gateway AI từng provider.',
};

// ---- Trích xuất -----------------------------------------------------------------------------------
const table = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
const code = (s) => `\`${s.replace(/\|/g, '\\|')}\``;
const describe = (map, key, what) => {
  if (map[key]) return map[key];
  problems.push(`Thiếu mô tả cho ${what} ${key} (bổ sung trong scripts/user-guide.mjs và phần viết tay của hướng dẫn)`);
  return '**(chưa có mô tả)**';
};
const unused = (map, present, what) => { for (const k of Object.keys(map)) if (!present.includes(k)) problems.push(`Mô tả thừa cho ${what} ${k} (không còn trong mã; xóa khỏi scripts/user-guide.mjs và cập nhật hướng dẫn)`); };

function scriptsBlock() {
  const scripts = JSON.parse(read('package.json')).scripts;
  const names = Object.keys(scripts);
  unused(SCRIPTS, names, 'script');
  return table(['Lệnh', 'Tác dụng'], names.map((n) => [code(`npm.cmd run ${n}`), describe(SCRIPTS, n, 'script')]));
}

function usageBlock(file) {
  const m = /const USAGE = `([\s\S]*?)`;/.exec(read(file));
  if (!m) { problems.push(`Không đọc được USAGE trong ${file}`); return ''; }
  return ['```text', m[1].replace(/\$\{[^}]+\}/g, '<mặc định>'), '```'].join('\n');
}

function workerBlock() {
  const src = read('src/worker/main.ts');
  const flags = [...new Set([...src.matchAll(/(?:flag|option)\('(--[a-z-]+)'\)/g)].map((m) => m[1]))];
  unused(WORKER_FLAGS, flags, 'cờ worker');
  return table(['Cờ', 'Tác dụng'], flags.map((f) => [code(f), describe(WORKER_FLAGS, f, 'cờ worker')]));
}

function routesBlock() {
  const src = read('src/server/app.ts');
  const routes = [...src.matchAll(/app\.(get|post)\b[\s\S]*?\('(\/api[^']*)'/g)].map((m) => `${m[1].toUpperCase()} ${m[2]}`);
  unused(ROUTES, routes, 'route');
  const group = (r) => (r.includes('/api/console/') ? 'Builder & QC' : r.includes('/api/learning/') ? 'Học tập' : 'Hệ thống');
  return ['Hệ thống', 'Học tập', 'Builder & QC'].map((g) => [`**${g}**`, '', table(['Route', 'Tác dụng'],
    routes.filter((r) => group(r) === g).map((r) => [code(r), describe(ROUTES, r, 'route')]))].join('\n')).join('\n\n');
}

function migrationsBlock() {
  const files = readdirSync(join(ROOT, 'migrations')).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
  return table(['Migration', 'Nội dung (dòng chú thích đầu file)'], files.map((f) => {
    const first = read(`migrations/${f}`).split('\n').find((l) => l.startsWith('--'))?.replace(/^--\s*/, '') ?? '(file không có dòng chú thích đầu)';
    return [code(f), first.slice(0, 180).replace(/\|/g, '\\|')];
  }));
}

function decisionsBlock() {
  const text = read('docs/engineering/DECISIONS.md');
  const seen = new Map();
  for (const line of text.split('\n')) {
    const m = /^(?:##\s+|-\s+)(E-\d+)\b\s*[—:-]?\s*(.*)$/.exec(line.trim());
    if (m && !seen.has(m[1])) seen.set(m[1], m[2].replace(/\*\*/g, '').replace(/\|/g, '\\|').slice(0, 150));
  }
  return table(['Quyết định', 'Tóm tắt (cắt ngắn, xem DECISIONS)'], [...seen].sort((a, b) => Number(a[0].slice(2)) - Number(b[0].slice(2))).map(([id, t]) => [id, t]));
}

function statusBlock() {
  const rows = read('PROGRESS.md').split('\n').filter((l) => /^\| [A-Z]+[-0-9]* \|/.test(l) && !l.startsWith('| Mã'));
  return table(['Mã', 'Công việc', 'Trạng thái'], rows.map((l) => l.split('|').slice(1, 4).map((c) => c.trim())));
}

const BLOCKS = {
  scripts: scriptsBlock, 'ai-cli': () => usageBlock('src/cli/ai.ts'), 'backup-cli': () => usageBlock('src/cli/backup.ts'), 'export-cli': () => usageBlock('src/cli/export.ts'),
  'worker-flags': workerBlock, routes: routesBlock, migrations: migrationsBlock, decisions: decisionsBlock, status: statusBlock,
};

// ---- Ghi / kiểm ---------------------------------------------------------------------------------------
const before = read('docs/HUONG_DAN_SU_DUNG.md');
let after = before;
for (const [name, build] of Object.entries(BLOCKS)) {
  const re = new RegExp(`(<!-- AUTO:${name}:START[^>]*-->)[\\s\\S]*?(<!-- AUTO:${name}:END -->)`);
  if (!re.test(after)) { problems.push(`Hướng dẫn thiếu khối AUTO:${name}`); continue; }
  const body = build();
  after = after.replace(re, (_, start, end) => `${start}\n${body}\n${end}`);
}

const check = process.argv.includes('--check');
if (check) {
  if (after !== before) problems.push('Phần tự động của docs/HUONG_DAN_SU_DUNG.md đã cũ: chạy `npm.cmd run docs:guide` rồi xem lại phần viết tay liên quan.');
} else if (after !== before) {
  writeFileSync(GUIDE, after, 'utf8');
  console.log('Đã cập nhật phần tự động của docs/HUONG_DAN_SU_DUNG.md.');
} else console.log('Hướng dẫn đã khớp mã nguồn.');

if (problems.length) {
  for (const p of problems) console.error(`✖ ${p}`);
  process.exit(1);
}
if (check) console.log('Hướng dẫn sử dụng khớp mã nguồn.');
