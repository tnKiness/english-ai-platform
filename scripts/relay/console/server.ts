// Relay Console: a local web page to watch relay runs live and chat with Claude Code / Codex / Antigravity in one
// thread, falling back to the next CLI when one runs out of quota. Binds 127.0.0.1 only; every API call needs the
// per-start token embedded in the page, plus Host/Origin checks, so other websites cannot drive local CLIs.
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { closeSync, openSync, readFileSync, readSync, statSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { PROVIDERS, applyFailure, isAvailable, subscriptionEnv, type ProviderId } from '../core.js';
import {
  DIR, HISTORY, LIVE, ROOT, STATE, TASK, acquireLock, appendLive, ensureDirs, execute, loadState, lockOwner, readJson, writeJson,
  type EngineEvent, type SessionRecord,
} from '../engine.js';
import { DEFAULT_MODELS, providerSpecs, type ProviderSpec } from '../providers.js';
import { buildChatPrompt, createThread, getThread, loadThreads, planTurn, threadEntries, touchThread } from './threads.js';

export interface ConsoleOptions {
  port: number;
  /** Test seam: provider specs (defaults to the real CLIs). */
  specs?: Record<ProviderId, ProviderSpec>;
  env?: NodeJS.ProcessEnv;
  chatTimeoutMs?: number;
  /** Test seam: how to start a background relay (defaults to `node --import tsx scripts/relay/main.ts`). */
  relayCommand?: (args: string[]) => { bin: string; args: string[] };
}

interface Busy { kind: 'chat' | 'relay' | 'external'; provider?: ProviderId; threadId?: string; pid?: number; since: string }

const STATIC: Record<string, [string, string]> = {
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/app.css': ['app.css', 'text/css; charset=utf-8'],
};

export function createConsole(opts: ConsoleOptions) {
  ensureDirs();
  const token = randomBytes(24).toString('hex');
  const specs = opts.specs ?? providerSpecs();
  const env = opts.env ?? subscriptionEnv(process.env).env;
  const clients = new Set<ServerResponse>();
  let busy: Busy | null = null;
  let chatAbort: AbortController | null = null;
  let relayChild: ChildProcess | null = null;
  let port = opts.port;

  const broadcast = (event: string, data: unknown) => {
    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const c of clients) c.write(frame);
  };

  // Tail live.log so relay runs started anywhere (another terminal, this console) show up live.
  let liveOffset = (() => { try { return statSync(LIVE).size; } catch { return 0; } })();
  let liveRest = '';
  const tail = setInterval(() => {
    let size: number; try { size = statSync(LIVE).size; } catch { return; }
    if (size < liveOffset) liveOffset = 0;
    if (size === liveOffset) return;
    const fd = openSync(LIVE, 'r');
    try {
      const buf = Buffer.alloc(Math.min(size - liveOffset, 1 << 20));
      const n = readSync(fd, buf, 0, buf.length, liveOffset); liveOffset += n;
      const lines = (liveRest + buf.subarray(0, n).toString('utf8')).split(/\r?\n/); liveRest = lines.pop() ?? '';
      for (const line of lines) broadcast('live', { line });
    } finally { closeSync(fd); }
  }, 400);
  const external = setInterval(() => {
    const owner = lockOwner();
    const wasExternal = busy?.kind === 'external';
    if (!busy && owner && owner !== process.pid) { busy = { kind: 'external', pid: owner, since: new Date().toISOString() }; broadcast('state', {}); }
    else if (wasExternal && !owner) { busy = null; broadcast('state', {}); }
  }, 2000);

  function state() {
    const s = loadState(); const now = new Date();
    const providers = PROVIDERS.map((id) => {
      const m = DEFAULT_MODELS[id];
      return { id, label: specs[id].label, installed: !!specs[id].bin, ...s[id], available: !!specs[id].bin && isAvailable(s[id], now),
        model: 'effort' in m ? `${m.model}/${m.effort}` : m.model };
    });
    const threads = loadThreads().sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 60);
    const grouped = new Set(loadThreads().flatMap((t) => t.segments.map((g) => `${g.provider}:${g.sessionId}`)));
    const seen = new Map<string, SessionRecord>();
    for (const r of readJson<SessionRecord[]>(HISTORY, [])) seen.set(`${r.provider}:${r.session_id}`, r);
    const sessions = [...seen.entries()].filter(([k]) => !grouped.has(k)).map(([, r]) => r)
      .sort((a, b) => b.started_at.localeCompare(a.started_at)).slice(0, 40);
    return { providers, threads, sessions, busy, task: readJson<unknown>(TASK, null) };
  }

  function nextProvider(after: ProviderId, tried: ReadonlySet<ProviderId>): ProviderId | null {
    const s = loadState(); const now = new Date();
    const order = (process.env.RELAY_ORDER ?? 'claude,codex,agy').split(',') as ProviderId[];
    return order.find((id) => id !== after && !tried.has(id) && specs[id]?.bin && isAvailable(s[id], now)) ?? null;
  }

  /** One user turn; on quota/rate/auth failure it optionally continues the same thread on the next available CLI. */
  async function chat(threadId: string, first: ProviderId, message: string, mode: 'work' | 'read', autoFallback: boolean): Promise<void> {
    const release = acquireLock();
    chatAbort = new AbortController();
    const tried = new Set<ProviderId>();
    let provider: ProviderId | null = first;
    try {
      while (provider && !chatAbort.signal.aborted) {
        tried.add(provider);
        const current: ProviderId = provider;
        const { resume, missed } = planTurn(getThread(threadId), current);
        busy = { kind: 'chat', provider: current, threadId, since: new Date().toISOString() };
        broadcast('state', {});
        const emit = (e: EngineEvent | { kind: 'error' | 'fallback'; text: string }) => broadcast('run', { threadId, provider: current, ...e });
        appendLive(`\n=== Console · ${specs[current].label} · ${resume ? 'tiếp phiên' : 'phiên mới'} ===`);
        const run = await execute({ provider: current, spec: specs[current], prompt: buildChatPrompt(message, missed, !resume), mode, resume,
          userLabel: message, timeoutMs: opts.chatTimeoutMs ?? 60 * 60_000, env, signal: chatAbort.signal,
          onEvent: (e) => { if (e.kind === 'session') touchThread(threadId, { provider: current, sessionId: e.sessionId }); emit(e); } });
        touchThread(threadId);
        provider = null;
        if (run.outcome.kind === 'SWITCH' && run.outcome.failure !== 'TIMEOUT') {
          writeJson(STATE, applyFailure(loadState(), current, run.outcome, new Date()));
          const next = nextProvider(current, tried);
          const why = `${specs[current].label} dừng: ${run.outcome.failure}`;
          if (next && autoFallback) { emit({ kind: 'fallback', text: `${why}. Tự chuyển sang ${specs[next].label}.` }); provider = next; }
          else emit({ kind: 'error', text: next ? `${why}. Chọn ${specs[next].label} rồi gửi lại để tiếp tục.` : `${why}. Không còn nền tảng khả dụng.` });
        } else if (run.outcome.kind === 'STOP' && !run.facts.finalText.trim()) {
          emit({ kind: 'error', text: `${specs[current].label}: ${run.outcome.reason}. ${run.facts.diagnostics.slice(-3).join(' ').slice(0, 400)}` });
        }
      }
    } catch (error) {
      broadcast('run', { threadId, provider: first, kind: 'error', text: error instanceof Error ? error.message : String(error) });
    } finally {
      busy = null; chatAbort = null;
      release();
      broadcast('state', {});
    }
  }

  function startRelay(args: string[]) {
    const cmd = opts.relayCommand?.(args) ?? { bin: process.execPath, args: ['--import', 'tsx', join(ROOT, 'scripts', 'relay', 'main.ts'), '--quiet', ...args] };
    relayChild = spawn(cmd.bin, cmd.args, { cwd: ROOT, env: process.env, shell: false, windowsHide: true, stdio: 'ignore' });
    busy = { kind: 'relay', pid: relayChild.pid, since: new Date().toISOString() };
    relayChild.once('exit', (code) => { appendLive(`Relay kết thúc (mã ${code}).`); relayChild = null; busy = null; broadcast('state', {}); });
    broadcast('state', {});
  }

  function stop() {
    chatAbort?.abort();
    if (relayChild?.pid) {
      if (process.platform === 'win32') {
        spawn(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(relayChild.pid), '/T', '/F'], { shell: false, windowsHide: true, stdio: 'ignore' });
      } else relayChild.kill('SIGINT');
    }
  }

  const tokenOk = (given: string | null | undefined) => {
    if (!given) return false;
    const a = Buffer.from(given); const b = Buffer.from(token);
    return a.length === b.length && timingSafeEqual(a, b);
  };
  const send = (res: ServerResponse, code: number, body: unknown) => {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(body));
  };
  const readBody = (req: IncomingMessage) => new Promise<Record<string, unknown>>((resolve, reject) => {
    let size = 0; const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => { size += c.length; if (size > 64 * 1024) { reject(new Error('BODY_TOO_LARGE')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Record<string, unknown>); } catch { reject(new Error('BAD_JSON')); } });
  });
  const isProvider = (v: unknown): v is ProviderId => typeof v === 'string' && (PROVIDERS as readonly string[]).includes(v);

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host ?? '')) return send(res, 403, { error: 'HOST_NOT_ALLOWED' });
    const security = { 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer',
      'content-security-policy': "default-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'" };
    if (req.method === 'GET' && (url.pathname === '/' || STATIC[url.pathname])) {
      const [file, type] = STATIC[url.pathname] ?? ['index.html', 'text/html; charset=utf-8'];
      let body = readFileSync(join(import.meta.dirname, 'public', file), 'utf8');
      if (file === 'index.html') body = body.replace('__RELAY_TOKEN__', token);
      res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store', ...security }); return res.end(body);
    }
    if (!url.pathname.startsWith('/api/')) return send(res, 404, { error: 'NOT_FOUND' });
    const given = req.headers['x-relay-token'] as string | undefined ?? (url.pathname === '/api/events' ? url.searchParams.get('token') : null);
    if (!tokenOk(given)) return send(res, 401, { error: 'TOKEN_REQUIRED' });

    try {
      if (req.method === 'GET' && url.pathname === '/api/events') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', ...security });
        res.write('event: hello\ndata: {}\n\n'); clients.add(res);
        req.on('close', () => clients.delete(res)); return;
      }
      if (req.method === 'GET' && url.pathname === '/api/state') return send(res, 200, state());
      if (req.method === 'GET' && url.pathname === '/api/thread') {
        const thread = getThread(url.searchParams.get('id') ?? '');
        return thread ? send(res, 200, { thread, entries: threadEntries(thread) }) : send(res, 404, { error: 'THREAD_NOT_FOUND' });
      }
      if (req.method !== 'POST') return send(res, 405, { error: 'METHOD_NOT_ALLOWED' });
      const origin = req.headers.origin;
      if (origin && ![`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(origin)) return send(res, 403, { error: 'ORIGIN_NOT_ALLOWED' });
      if (!(req.headers['content-type'] ?? '').startsWith('application/json')) return send(res, 415, { error: 'JSON_REQUIRED' });
      const body = await readBody(req);

      if (url.pathname === '/api/thread/open') {
        if (!isProvider(body.provider) || typeof body.sessionId !== 'string') return send(res, 400, { error: 'BAD_REQUEST' });
        const rec = readJson<SessionRecord[]>(HISTORY, []).find((r) => r.provider === body.provider && r.session_id === body.sessionId);
        if (!rec) return send(res, 404, { error: 'SESSION_NOT_FOUND' });
        const thread = createThread(rec.title ?? rec.session_id, { provider: rec.provider, sessionId: rec.session_id });
        broadcast('state', {}); return send(res, 200, { thread });
      }
      if (url.pathname === '/api/chat') {
        const message = typeof body.message === 'string' ? body.message.trim() : '';
        if (!isProvider(body.provider) || !message || message.length > 20_000) return send(res, 400, { error: 'BAD_REQUEST' });
        if (busy || (lockOwner() && lockOwner() !== process.pid)) return send(res, 409, { error: 'BUSY', busy });
        if (!specs[body.provider].bin) return send(res, 400, { error: 'PROVIDER_NOT_INSTALLED' });
        const thread = typeof body.threadId === 'string' && body.threadId ? getThread(body.threadId) : createThread(message.split('\n')[0] ?? message);
        if (!thread) return send(res, 404, { error: 'THREAD_NOT_FOUND' });
        void chat(thread.id, body.provider, message, body.mode === 'read' ? 'read' : 'work', body.autoFallback !== false);
        return send(res, 202, { threadId: thread.id });
      }
      if (url.pathname === '/api/relay') {
        if (busy || lockOwner()) return send(res, 409, { error: 'BUSY', busy });
        if (body.continue === true) { startRelay(['--continue', '--wait']); return send(res, 202, { started: true }); }
        const task = typeof body.task === 'string' ? body.task.trim() : '';
        if (!task || task.length > 50_000) return send(res, 400, { error: 'BAD_REQUEST' });
        // Via a file: a task starting with "--" must never be parsed as relay options.
        const file = join(DIR, 'console-task.md'); writeFileSync(file, task, 'utf8');
        startRelay(['--wait', '--task-file', file]); return send(res, 202, { started: true });
      }
      if (url.pathname === '/api/stop') { stop(); return send(res, 202, { stopping: true }); }
      return send(res, 404, { error: 'NOT_FOUND' });
    } catch (error) {
      return send(res, 400, { error: error instanceof Error ? error.message : 'BAD_REQUEST' });
    }
  });

  return {
    server, token,
    listen: () => new Promise<number>((resolve) => server.listen(opts.port, '127.0.0.1', () => {
      const addr = server.address(); port = typeof addr === 'object' && addr ? addr.port : opts.port; resolve(port);
    })),
    close: () => new Promise<void>((resolve) => { clearInterval(tail); clearInterval(external); stop(); for (const c of clients) c.end(); server.close(() => resolve()); }),
  };
}
