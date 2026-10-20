import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ProviderId } from '../../scripts/relay/core.js';
import type { ProviderSpec } from '../../scripts/relay/providers.js';

// State goes to a temp dir; engine reads RELAY_STATE_DIR at import time, so import after setting it.
const stateDir = mkdtempSync(join(tmpdir(), 'relay-console-'));
process.env.RELAY_STATE_DIR = stateDir;
const { createConsole } = await import('../../scripts/relay/console/server.js');

const fake = resolve('tests/fixtures/fake-relay-cli.mjs');
const behaviour: Record<ProviderId, 'ok' | 'quota' | 'plain'> ={ claude: 'ok', codex: 'ok', agy: 'ok' };
const spec = (id: ProviderId): ProviderSpec => ({
  id, label: id, bin: process.execPath,
  invocation: (prompt, { resume }) => ({ args: [fake, id, behaviour[id], resume ?? ''], stdin: prompt }),
  checkSubscription: () => ({ ok: true, detail: 'fake' }),
});

let app: ReturnType<typeof createConsole>; let base = ''; let token = '';
const call = async (path: string, init: RequestInit & { json?: unknown } = {}) => {
  const res = await fetch(`${base}${path}`, { ...init, method: init.json !== undefined ? 'POST' : init.method,
    headers: { 'x-relay-token': token, ...(init.json !== undefined ? { 'content-type': 'application/json' } : {}), ...(init.headers ?? {}) },
    body: init.json !== undefined ? JSON.stringify(init.json) : undefined });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- loosely typed JSON responses in assertions
  return { status: res.status, body: await res.json().catch(() => null) as Record<string, any> };
};
const idle = async () => {
  for (let i = 0; i < 200; i++) { const s = await call('/api/state'); if (!s.body.busy) return s.body; await new Promise((r) => setTimeout(r, 50)); }
  throw new Error('console stayed busy');
};

beforeAll(async () => {
  app = createConsole({ port: 0, specs: { claude: spec('claude'), codex: spec('codex'), agy: spec('agy') }, env: { ...process.env } });
  base = `http://127.0.0.1:${await app.listen()}`; token = app.token;
});
afterAll(async () => { await app.close(); rmSync(stateDir, { recursive: true, force: true }); });

describe('Relay Console access control', () => {
  it('embeds the token in the page and requires it on the API', async () => {
    expect(await (await fetch(`${base}/`)).text()).toContain(`content="${token}"`);
    expect((await fetch(`${base}/api/state`)).status).toBe(401);
    expect((await call('/api/state', { headers: { 'x-relay-token': 'wrong' } })).status).toBe(401);
  });
  it('rejects a foreign Host, a foreign Origin and non-JSON posts', async () => {
    const { request } = await import('node:http');
    const status = await new Promise<number>((done) => {
      const req = request(`${base}/api/state`, { headers: { host: 'evil.test', 'x-relay-token': token } }, (res) => { res.resume(); done(res.statusCode ?? 0); });
      req.end();
    });
    expect(status).toBe(403);
    expect((await call('/api/stop', { json: {}, headers: { origin: 'http://evil.test' } })).status).toBe(403);
    expect((await call('/api/stop', { method: 'POST', headers: { 'content-type': 'text/plain' } })).status).toBe(415);
    expect((await call('/api/chat', { json: { provider: 'nope', message: 'x' } })).status).toBe(400);
  });
});

describe('Relay Console chat', () => {
  it('runs a turn on agy, records the session as a thread segment and continues it', async () => {
    const first = await call('/api/chat', { json: { provider: 'agy', message: 'xin chào', mode: 'read' } });
    expect(first.status).toBe(202);
    await idle();
    const t1 = (await call(`/api/thread?id=${first.body.threadId}`)).body;
    expect(t1.thread.segments).toHaveLength(1);
    expect(t1.entries.map((e: { role: string }) => e.role)).toEqual(['user', 'progress', 'progress', 'progress', 'assistant', 'status']);
    expect(t1.entries.find((e: { role: string }) => e.role === 'assistant').text).toContain('echo:xin chào|missed=false|resumed=false');

    await call('/api/chat', { json: { threadId: first.body.threadId, provider: 'agy', message: 'tiếp nhé', mode: 'read' } });
    await idle();
    const t2 = (await call(`/api/thread?id=${first.body.threadId}`)).body;
    expect(t2.thread.segments).toHaveLength(1); // same native session, resumed
    expect(t2.entries.filter((e: { role: string }) => e.role === 'assistant').at(-1).text).toContain('echo:tiếp nhé|missed=false|resumed=true');
  });

  it('falls back to the next CLI on quota, then catches the first CLI up when it is used again', async () => {
    behaviour.claude = 'quota';
    const r = await call('/api/chat', { json: { provider: 'claude', message: 'sửa lỗi A', mode: 'read', autoFallback: true } });
    const state = await idle();
    expect(state.providers.find((p: { id: string }) => p.id === 'claude').status).toBe('COOLDOWN');
    const t = (await call(`/api/thread?id=${r.body.threadId}`)).body;
    expect(t.thread.segments.map((s: { provider: string }) => s.provider)).toEqual(['claude', 'codex']);
    expect(t.entries.filter((e: { role: string }) => e.role === 'assistant').at(-1)).toMatchObject({ provider: 'codex' });

    // Quota came back: the user picks Claude again in the same thread; it resumes its session and receives what it missed.
    behaviour.claude = 'ok';
    const { writeFileSync } = await import('node:fs');
    writeFileSync(join(stateDir, 'state.json'), '{}');
    await call('/api/chat', { json: { threadId: r.body.threadId, provider: 'claude', message: 'giờ làm tiếp', mode: 'read' } });
    await idle();
    const after = (await call(`/api/thread?id=${r.body.threadId}`)).body;
    expect(after.thread.segments).toHaveLength(2);
    expect(after.entries.filter((e: { role: string }) => e.role === 'assistant').at(-1).text).toContain('missed=true|resumed=true');
  });

  it('treats a normal chat answer without RELAY_STATUS as a completed turn (seen live 20/10: it was logged as STOP)', async () => {
    behaviour.codex = 'plain';
    const r = await call('/api/chat', { json: { provider: 'codex', message: 'câu thường', mode: 'read' } });
    await idle();
    const t = (await call(`/api/thread?id=${r.body.threadId}`)).body;
    expect(t.entries.at(-1)).toMatchObject({ role: 'status' });
    expect(t.entries.at(-1).text).toMatch(/^DONE/);
    behaviour.codex = 'ok';
  });

  it('refuses a second writer while a run holds the lock', async () => {
    behaviour.agy = 'ok';
    const a = call('/api/chat', { json: { provider: 'agy', message: 'một', mode: 'read' } });
    const b = call('/api/chat', { json: { provider: 'agy', message: 'hai', mode: 'read' } });
    const statuses = (await Promise.all([a, b])).map((x) => x.status).sort();
    expect(statuses).toEqual([202, 409]);
    await idle();
  });
});
