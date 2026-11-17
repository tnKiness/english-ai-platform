// Đồng bộ lõi định tuyến thuần của ai-router vào src/infrastructure/ai/router-core (quyết định E-24).
//   npm run router:sync            chép lại từ checkout ai-router (mặc định ../ai-router, hoặc AI_ROUTER_DIR)
//   npm run router:sync -- --check chỉ so sánh; thoát 1 nếu bản trong repo lệch với ai-router
// Chỉ chép logic thuần (không I/O): phân loại lỗi, giờ mở lại, cooldown, thứ tự failover. Provider API trả phí, xoay
// tài khoản cùng hãng, chat/handoff và MCP của ai-router KHÔNG được đưa vào ứng dụng (06A §1.5–1.6, §8).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SOURCE = resolve(process.env.AI_ROUTER_DIR ?? join(ROOT, '..', 'ai-router'));
const TARGET = join(ROOT, 'src', 'infrastructure', 'ai', 'router-core');
const FILES = ['types.ts', 'outcome.ts', 'routing.ts'];
const HEADER = '// ĐỒNG BỘ TỪ ai-router/src/core — KHÔNG sửa tay. Sửa ở ai-router rồi chạy `npm run router:sync` (E-24).\n';

const sha = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
const lf = (text) => text.replace(/\r\n/g, '\n');
const check = process.argv.includes('--check');

if (!existsSync(join(SOURCE, 'src', 'core'))) {
  console.error(`Không thấy ai-router tại ${SOURCE}. Đặt AI_ROUTER_DIR trỏ tới checkout ai-router.`);
  process.exit(2);
}
let commit = 'unknown';
try { commit = execFileSync('git', ['-C', SOURCE, 'rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim(); } catch { /* không phải git checkout */ }
let dirty = false;
try { dirty = execFileSync('git', ['-C', SOURCE, 'status', '--porcelain', '--', 'src/core'], { encoding: 'utf8', windowsHide: true }).trim() !== ''; } catch { /* như trên */ }

const files = {};
let drift = 0;
mkdirSync(TARGET, { recursive: true });
for (const name of FILES) {
  const content = HEADER + lf(readFileSync(join(SOURCE, 'src', 'core', name), 'utf8'));
  files[name] = sha(content);
  const target = join(TARGET, name);
  const current = existsSync(target) ? lf(readFileSync(target, 'utf8')) : null;
  if (current === content) continue;
  drift += 1;
  if (check) console.log(`LỆCH: ${name}`);
  else { writeFileSync(target, content, 'utf8'); console.log(`đã chép ${name}`); }
}
if (check) {
  console.log(drift ? `${drift} file lệch với ai-router (${commit.slice(0, 7)}). Chạy npm run router:sync rồi npm run check.` : `Khớp ai-router ${commit.slice(0, 7)}.`);
  process.exit(drift ? 1 : 0);
}
writeFileSync(join(TARGET, 'SOURCE.json'), `${JSON.stringify({ source: 'ai-router/src/core', commit, uncommitted_changes: dirty, files }, null, 2)}\n`, 'utf8');
console.log(`router-core = ai-router ${commit.slice(0, 7)}${dirty ? ' (+ thay đổi chưa commit)' : ''}; ${drift} file thay đổi. Chạy npm run check.`);
