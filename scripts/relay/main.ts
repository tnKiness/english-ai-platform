// Dev-tooling relay: runs one coding task through ai-router, which picks a subscription CLI (Claude Code, Codex,
// Antigravity) and moves the task to the next one when a quota/rate limit is hit. Usage: see README "Relay AI lập trình".
// This file only adds the project's rules to the task and remembers the conversation for --continue (var/relay).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { buildPrompt, continuePrompt, relayOutcome, type RelayStatus, type RouterResult } from './core.js';

const ROOT = resolve(import.meta.dirname, '..', '..');
const DIR = join(ROOT, 'var', 'relay');
const TASK = join(DIR, 'router-task.json');
const PROMPT = join(DIR, 'router-prompt.md');
/** ai-router's launcher: a sibling checkout by default. */
const ROUTER = resolve(process.env.AI_ROUTER_BIN ?? join(ROOT, '..', 'ai-router', 'bin', 'ai-router.mjs'));

interface TaskFile { title: string; threadId: string; status: RelayStatus; updated_at: string }

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { 'task-file': { type: 'string' }, continue: { type: 'boolean' }, status: { type: 'boolean' }, wait: { type: 'boolean' }, provider: { type: 'string' } },
});

const readTask = (): TaskFile | null => { try { return JSON.parse(readFileSync(TASK, 'utf8')) as TaskFile; } catch { return null; } };
const local = (iso: string) => new Date(iso).toLocaleString('vi-VN', { hour12: false });

/** Runs `ai-router ask`: progress goes straight to the terminal, the result comes back as one JSON line on stdout. */
function ask(prompt: string, threadId: string | null): Promise<RouterResult> {
  // Through a file: the Windows command line cannot carry a long task.
  writeFileSync(PROMPT, prompt, 'utf8');
  const args = [ROUTER, 'ask', '--task-file', PROMPT, '--workspace', ROOT, '--mode', 'edit', '--json',
    ...(threadId ? ['--thread', threadId] : []), ...(values.wait ? ['--wait'] : []), ...(values.provider ? ['--provider', values.provider] : [])];
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, args, { cwd: ROOT, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.on('data', (c: Buffer) => { out += c.toString('utf8'); });
    child.once('error', fail);
    child.once('close', () => {
      const line = out.trim().split(/\r?\n/).at(-1) ?? '';
      try { done(JSON.parse(line) as RouterResult); } catch { fail(new Error(`ai-router không trả kết quả: ${out.trim().slice(-400) || '(trống)'}`)); }
    });
  });
}

async function main(): Promise<number> {
  if (!existsSync(ROUTER)) throw new Error(`Không thấy ai-router tại ${ROUTER}. Đặt AI_ROUTER_BIN trỏ tới bin/ai-router.mjs.`);
  mkdirSync(DIR, { recursive: true });
  const prev = readTask();
  if (values.status) {
    spawnSync(process.execPath, [ROUTER, 'status'], { stdio: 'inherit', shell: false, windowsHide: true });
    if (prev) console.log(`\nNhiệm vụ gần nhất: ${prev.status}, cập nhật ${local(prev.updated_at)} — ${prev.title}\n  cuộc trò chuyện ${prev.threadId} (xem trong ai-router: /chat)`);
    return 0;
  }
  let prompt: string; let threadId: string | null = null; let title: string;
  if (values.continue) {
    if (!prev || prev.status === 'DONE') throw new Error('Không có nhiệm vụ dở để --continue.');
    prompt = continuePrompt(); threadId = prev.threadId; title = prev.title;
  } else {
    const text = values['task-file'] ? readFileSync(resolve(values['task-file']), 'utf8') : positionals.join(' ');
    if (!text.trim()) throw new Error('Thiếu nhiệm vụ: truyền mô tả, --task-file <file> hoặc --continue.');
    prompt = buildPrompt(text);
    title = text.split(/\r?\n/).find((l) => l.trim())?.replace(/^#+\s*/, '').slice(0, 70) ?? 'nhiệm vụ';
  }
  console.log('(Relay chạy qua ai-router: chỉ dùng CLI thuê bao đã cấu hình ở đó. Theo dõi trực tiếp tại trang /chat của ai-router khi "serve" đang chạy.)');
  const result = await ask(prompt, threadId);
  const outcome = relayOutcome(result);
  writeFileSync(TASK, JSON.stringify({ title, threadId: result.threadId, status: outcome.status, updated_at: new Date().toISOString() } satisfies TaskFile, null, 2), 'utf8');
  if (result.finalText.trim()) console.log(`\n${result.finalText.trim()}`);
  console.log(`\n${outcome.exitCode === 0 ? '✔' : outcome.exitCode === 2 ? '⏸' : '✖'} ${result.providerId ?? 'relay'}: ${outcome.note}`);
  return outcome.exitCode;
}

main().then((code) => { process.exitCode = code; }, (error: unknown) => {
  console.error(`relay: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1;
});
