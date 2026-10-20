// Dev-tooling relay: runs one coding task on subscription CLIs and hands it to the next CLI when a quota/rate
// limit is hit. Usage: see README "Relay AI lập trình". State lives in var/relay (gitignored).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  PROVIDERS, applyFailure, buildPrompt, decideOutcome, earliestReset, emptyState, pickProvider, subscriptionEnv,
  type Handoff, type ProviderId, type RelayState,
} from './core.js';
import { providerSpecs } from './providers.js';
import { runCli } from './run-process.js';

const ROOT = resolve(import.meta.dirname, '..', '..');
const DIR = join(ROOT, 'var', 'relay');
const STATE = join(DIR, 'state.json');
const TASK = join(DIR, 'task.json');
const LOCK = join(DIR, 'lock');

interface TaskFile { task: string; handoffs: Handoff[]; status: 'RUNNING' | 'DONE' | 'BLOCKED' | 'STOPPED' | 'EXHAUSTED'; updated_at: string }

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    'task-file': { type: 'string' }, continue: { type: 'boolean' }, status: { type: 'boolean' },
    preflight: { type: 'boolean' }, smoke: { type: 'boolean' }, reset: { type: 'string' },
    order: { type: 'string' }, 'timeout-min': { type: 'string' }, 'max-runs': { type: 'string' },
    wait: { type: 'boolean' }, quiet: { type: 'boolean' },
  },
});

const readJson = <T>(file: string, fallback: T): T => { try { return JSON.parse(readFileSync(file, 'utf8')) as T; } catch { return fallback; } };
const writeJson = (file: string, data: unknown) => writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
const loadState = (): RelayState => ({ ...emptyState(), ...readJson<Partial<RelayState>>(STATE, {}) });
const git = (...args: string[]) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', shell: false, windowsHide: true }).stdout ?? '';
const local = (iso: string | Date) => new Date(iso).toLocaleString('vi-VN', { hour12: false });

function parseOrder(raw: string | undefined): ProviderId[] {
  const ids = (raw ?? process.env.RELAY_ORDER ?? 'claude,codex,agy').split(',').map((s) => s.trim()).filter(Boolean);
  const bad = ids.filter((id) => !PROVIDERS.includes(id as ProviderId));
  if (bad.length || !ids.length) throw new Error(`--order không hợp lệ: ${bad.join(',') || '(trống)'}; dùng ${PROVIDERS.join(',')}`);
  return ids as ProviderId[];
}

function acquireLock(): () => void {
  mkdirSync(DIR, { recursive: true });
  try { writeFileSync(LOCK, String(process.pid), { flag: 'wx' }); } catch {
    const pid = Number(readFileSync(LOCK, 'utf8'));
    let alive = false; try { process.kill(pid, 0); alive = true; } catch { /* stale lock */ }
    if (alive) throw new Error(`Relay khác đang chạy (pid ${pid}). Chỉ một relay được sửa workspace tại một thời điểm.`);
    writeFileSync(LOCK, String(process.pid));
  }
  return () => { if (existsSync(LOCK) && readFileSync(LOCK, 'utf8') === String(process.pid)) rmSync(LOCK); };
}

function printStatus(order: ProviderId[]) {
  const state = loadState(); const now = new Date();
  for (const id of order) {
    const s = state[id];
    const note = s.status === 'COOLDOWN' && s.until ? (new Date(s.until) <= now ? 'hết cooldown, dùng được' : `tới ${local(s.until)} (${s.reason})`) : (s.reason ?? '');
    console.log(`${id.padEnd(7)} ${s.status.padEnd(12)} ${note}`);
  }
  const task = readJson<TaskFile | null>(TASK, null);
  if (task) console.log(`\nNhiệm vụ gần nhất: ${task.status}, ${task.handoffs.length} lần chuyển, cập nhật ${local(task.updated_at)}`);
}

function preflight(order: ProviderId[]): Set<ProviderId> {
  const specs = providerSpecs(); const { env, removed } = subscriptionEnv(process.env); const ok = new Set<ProviderId>();
  if (removed.length) console.log(`Đã gỡ khỏi env tiến trình con: ${removed.join(', ')}`);
  for (const id of order) {
    const spec = specs[id];
    const check = spec.checkSubscription(env);
    const mark = check.ok === false ? 'CHẶN' : check.ok === null ? 'CHƯA XÁC MINH GÓI' : 'OK';
    console.log(`${id.padEnd(7)} ${mark.padEnd(18)} ${check.detail}${spec.bin ? `  [${spec.bin}]` : ''}`);
    if (check.ok !== false) ok.add(id);
  }
  return ok;
}

async function smoke(order: ProviderId[]) {
  const usable = preflight(order); const specs = providerSpecs(); const { env } = subscriptionEnv(process.env);
  mkdirSync(join(DIR, 'runs'), { recursive: true });
  for (const id of order) {
    const spec = specs[id];
    if (!usable.has(id) || !spec.bin) { console.log(`${id}: bỏ qua`); continue; }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const lastMessageFile = join(DIR, 'runs', `${stamp}-${id}-smoke.last.txt`);
    const inv = spec.invocation('Không dùng công cụ nào. Trả lời đúng một dòng: RELAY_SMOKE_OK', { cwd: ROOT, mode: 'smoke', lastMessageFile });
    const started = Date.now();
    const r = await runCli(spec.bin, inv.args, { cwd: ROOT, env, stdin: inv.stdin, timeoutMs: 180_000, logFile: join(DIR, 'runs', `${stamp}-${id}-smoke.log`), echo: false });
    const ok = r.exitCode === 0 && r.output.includes('RELAY_SMOKE_OK');
    console.log(`${id}: ${ok ? 'OK' : 'LỖI'} exit=${r.exitCode} ${(Date.now() - started) / 1000}s${ok ? '' : `\n${r.output.slice(-600)}`}`);
    // A smoke run is real evidence of quota/login state, so record it the same way a work run would.
    const outcome = decideOutcome({ ...r, output: ok ? `${r.output}\nRELAY_STATUS: DONE` : r.output }, new Date());
    const state = loadState();
    if (outcome.kind === 'SWITCH') writeJson(STATE, applyFailure(state, id, outcome, new Date()));
    else if (ok) { state[id] = emptyState()[id]; writeJson(STATE, state); }
  }
}

async function relay(order: ProviderId[], task: TaskFile) {
  const specs = providerSpecs(); const { env, removed } = subscriptionEnv(process.env);
  const timeoutMs = Number(values['timeout-min'] ?? 60) * 60_000;
  const maxRuns = Number(values['max-runs'] ?? 6);
  const usable = preflight(order);
  if (removed.length) console.log('(Relay chỉ dùng đăng nhập thuê bao; không fallback API tính phí.)');
  mkdirSync(join(DIR, 'runs'), { recursive: true });
  const abort = new AbortController();
  process.once('SIGINT', () => { console.log('\nĐang dừng, chạy lại với --continue để tiếp tục.'); abort.abort(); });

  const save = (status: TaskFile['status']) => { task.status = status; task.updated_at = new Date().toISOString(); writeJson(TASK, task); };
  save('RUNNING');
  for (let runs = 0; runs < maxRuns && !abort.signal.aborted; runs++) {
    let state = loadState(); const now = new Date();
    const excluded = new Set(order.filter((id) => !usable.has(id) || !specs[id].bin));
    const id = pickProvider(state, order, now, excluded);
    if (!id) {
      const reset = earliestReset(state, order.filter((p) => !excluded.has(p)));
      if (!values.wait || !reset) {
        save('EXHAUSTED');
        console.log(`\nKhông còn nền tảng khả dụng.${reset ? ` Sớm nhất mở lại lúc ${local(reset)}.` : ''} Chạy lại với --continue (hoặc thêm --wait).`);
        return 75;
      }
      const ms = Math.max(0, reset.getTime() - Date.now()) + 30_000;
      console.log(`\nMọi nền tảng đang hết quota; chờ tới ${local(new Date(Date.now() + ms))}...`);
      await new Promise((r) => { const t = setTimeout(r, ms); abort.signal.addEventListener('abort', () => { clearTimeout(t); r(null); }, { once: true }); });
      runs--; continue;
    }
    const spec = specs[id]; const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const lastMessageFile = join(DIR, 'runs', `${stamp}-${id}.last.txt`);
    const inv = spec.invocation(buildPrompt(task.task, task.handoffs), { cwd: ROOT, mode: 'work', lastMessageFile });
    console.log(`\n=== [${local(now)}] Lượt ${runs + 1}/${maxRuns}: ${spec.label} ===`);
    const result = await runCli(spec.bin as string, inv.args, { cwd: ROOT, env, stdin: inv.stdin, timeoutMs,
      logFile: join(DIR, 'runs', `${stamp}-${id}.log`), signal: abort.signal, echo: !values.quiet });
    if (abort.signal.aborted) { save('STOPPED'); return 130; }
    const lastMessage = inv.lastMessageFile && existsSync(inv.lastMessageFile) ? readFileSync(inv.lastMessageFile, 'utf8') : '';
    const outcome = decideOutcome({ ...result, output: `${result.output}\n${lastMessage}` }, new Date());

    if (outcome.kind === 'DONE') { save('DONE'); console.log(`\n✔ ${spec.label} báo hoàn thành. Xem PROGRESS.md và git diff trước khi commit.`); return 0; }
    if (outcome.kind === 'BLOCKED') { save('BLOCKED'); console.log(`\n⏸ ${spec.label} cần người dùng quyết định: ${outcome.reason}`); return 2; }
    if (outcome.kind === 'STOP') {
      save('STOPPED');
      console.log(`\n✖ ${spec.label} dừng: ${outcome.reason}. Không chuyển tiếp vì lỗi không phải quota; xem log trong var/relay/runs, sửa rồi chạy --continue.`);
      return 1;
    }
    state = applyFailure(loadState(), id, outcome, new Date()); writeJson(STATE, state);
    const reason = outcome.failure === 'TIMEOUT' ? `quá thời gian ${timeoutMs / 60_000} phút`
      : `${outcome.failure}${state[id].until ? `, mở lại ${local(state[id].until as string)}` : ''}`;
    task.handoffs.push({ from: id, reason, at: new Date().toISOString(), gitStatus: git('status', '--short').slice(0, 4000), diffStat: git('diff', '--stat').slice(0, 4000) });
    save('RUNNING');
    console.log(`\n↪ ${spec.label} dừng (${reason}); chuyển nền tảng tiếp theo.`);
  }
  if (!abort.signal.aborted) { save('STOPPED'); console.log(`\nĐạt giới hạn ${maxRuns} lượt; chạy --continue nếu muốn tiếp.`); }
  return 1;
}

async function main(): Promise<number> {
  const order = parseOrder(values.order);
  mkdirSync(DIR, { recursive: true });
  if (values.status) { printStatus(order); return 0; }
  if (values.reset !== undefined) {
    const state = loadState(); const ids = values.reset === 'all' || values.reset === '' ? PROVIDERS : parseOrder(values.reset);
    for (const id of ids) state[id] = emptyState()[id];
    writeJson(STATE, state); printStatus(order); return 0;
  }
  if (values.preflight) { preflight(order); return 0; }
  const release = acquireLock();
  try {
    if (values.smoke) { await smoke(order); return 0; }
    let task: TaskFile;
    if (values.continue) {
      const prev = readJson<TaskFile | null>(TASK, null);
      if (!prev || prev.status === 'DONE') throw new Error('Không có nhiệm vụ dở để --continue.');
      task = prev;
    } else {
      const text = values['task-file'] ? readFileSync(resolve(values['task-file']), 'utf8') : positionals.join(' ');
      if (!text.trim()) throw new Error('Thiếu nhiệm vụ: truyền mô tả, --task-file <file> hoặc --continue.');
      task = { task: text, handoffs: [], status: 'RUNNING', updated_at: new Date().toISOString() };
    }
    return await relay(order, task);
  } finally { release(); }
}

main().then((code) => { process.exitCode = code; }, (error: unknown) => {
  console.error(`relay: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1;
});
