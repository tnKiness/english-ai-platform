// P2-4: session/CSRF before any write; Console metadata by default; opening content records exposure; dry-run isolated.
import { afterEach, describe, expect, it } from 'vitest';
import { assessNovelty } from '../../src/domain/knowledge/novelty.js';
import { FakeAdapter } from '../../src/infrastructure/ai/fake-adapter.js';
import { createApp } from '../../src/server/app.js';
import { ITEM_ID, KEY_ID, RUBRIC_ID, SECRET_EXPLANATION } from '../fixtures/knowledge/synthetic.js';
import { builderFixture, CORRECT, count, drain, PKG, qc, stage, type BuilderFixture } from './p2-helpers.js';

let fx: BuilderFixture | undefined;
let app: ReturnType<typeof createApp> | undefined;
afterEach(async () => { await app?.close(); app = undefined; fx?.cleanup(); fx = undefined; });

const HOST = '127.0.0.1:4317';
const ORIGIN = 'http://127.0.0.1:5173';

async function session(a: ReturnType<typeof createApp>) {
  const res = await a.inject({ url: '/api/session', headers: { host: HOST } });
  const cookie = String(res.headers['set-cookie']).split(';')[0]!;
  return { cookie, csrf: res.json().csrf_token as string, setCookie: String(res.headers['set-cookie']) };
}
const post = (a: ReturnType<typeof createApp>, url: string, s: { cookie: string; csrf: string }, payload: unknown = {}, headers: Record<string, string> = {}) =>
  a.inject({ method: 'POST', url, payload: payload as Record<string, unknown>, headers: { host: HOST, origin: ORIGIN, cookie: s.cookie, 'x-csrf-token': s.csrf, ...headers } });

async function frozenApp() {
  fx = await builderFixture();
  fx.pipeline.freeze(stage(fx), 'v1');
  app = createApp({ store: fx.store, pipeline: fx.pipeline, gatewayStatus: async () => [{ provider: 'claude-code', ready: false }] });
  return { app, s: await session(app) };
}

describe('P2-4 session and CSRF', () => {
  it('health stays open to local hosts; the session cookie is HttpOnly and SameSite=Strict', async () => {
    app = createApp();
    expect((await app.inject({ url: '/api/health', headers: { host: HOST } })).json()).toEqual({ status: 'ok', stage: 'P2', real_ai_enabled: false });
    expect((await app.inject({ url: '/api/health', headers: { host: 'evil.example' } })).statusCode).toBe(403);
    const s = await session(app);
    expect(s.setCookie).toMatch(/^sid=[A-Za-z0-9_-]{43}; HttpOnly; SameSite=Strict; Path=\/api; Max-Age=\d+$/);
    expect(s.csrf).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // Reusing the cookie returns the same token and does not mint a new session.
    const again = await app.inject({ url: '/api/session', headers: { host: HOST, cookie: s.cookie } });
    expect([again.json().csrf_token, again.headers['set-cookie']]).toEqual([s.csrf, undefined]);
  });

  it('rejects reads without a session and writes without origin, CSRF token or from another site', async () => {
    const { app: a, s } = await frozenApp();
    const url = `/api/console/packages/${PKG}/v1/qc/checks`;
    expect((await a.inject({ url: '/api/console/packages', headers: { host: HOST } })).statusCode).toBe(401);
    expect((await a.inject({ url: '/api/console/packages', headers: { host: HOST, cookie: 'sid=forged' } })).statusCode).toBe(401);
    expect((await post(a, url, s, {}, { 'x-csrf-token': 'wrong' })).json()).toEqual({ error: 'CSRF_INVALID' });
    expect((await a.inject({ method: 'POST', url, payload: {}, headers: { host: HOST, cookie: s.cookie, 'x-csrf-token': s.csrf } })).json()).toEqual({ error: 'ORIGIN_REQUIRED' });
    expect((await post(a, url, s, {}, { origin: 'https://evil.example' })).json()).toEqual({ error: 'ORIGIN_NOT_ALLOWED' });
    expect((await post(a, url, s, {}, { 'sec-fetch-site': 'cross-site' })).json()).toEqual({ error: 'CROSS_SITE' });
    expect((await post(a, url, s, { unexpected: true })).statusCode).toBe(400);
    expect(count(fx!, 'qc_results')).toBe(0);
    expect((await post(a, url, s)).statusCode).toBe(200);
    expect(count(fx!, 'qc_results')).toBe(3);
  });
});

describe('P2-4 Console tabs', () => {
  it('Gói tri thức lists metadata only; opening a key records exposure first and once', async () => {
    const { app: a, s } = await frozenApp();
    const list = await a.inject({ url: '/api/console/packages', headers: { host: HOST, cookie: s.cookie } });
    expect(list.statusCode).toBe(200);
    expect(list.body).not.toMatch(/Velmora|SYNTHETIC-KEY|lanterns/);
    expect(list.json()[0]).toMatchObject({ package_id: PKG, version: 'v1', state: 'draft', release_ready: false, qc: [{ stage: 'QC1', status: 'NOT_RUN' }, {}, {}, {}] });
    expect(count(fx!, 'exposure_events')).toBe(0);

    const open = (unit: unknown, request_id: string) => post(a, `/api/console/packages/${PKG}/v1/content`, s, { unit, request_id });
    const key = await open({ kind: 'knowledge', id: KEY_ID, version: 'v1' }, 'req-1');
    expect(key.statusCode, key.body).toBe(200);
    expect(key.body).toContain(SECRET_EXPLANATION);
    expect(key.json().exposure).toEqual([{ level: 'answer', created: true }, { level: 'explanation', created: true }]);
    expect((await open({ kind: 'knowledge', id: KEY_ID, version: 'v1' }, 'req-1')).json().exposure).toEqual([{ level: 'answer', created: false }, { level: 'explanation', created: false }]);
    expect((await open({ kind: 'rubric', id: RUBRIC_ID, version: 'v1' }, 'req-2')).json().exposure).toEqual([]);
    expect((await open({ kind: 'knowledge', id: 'not-in-package', version: 'v1' }, 'req-3')).statusCode).toBe(400);
    const rows = fx!.store.db.prepare('SELECT surface, level, item_id FROM exposure_events ORDER BY level').all();
    expect(rows).toEqual([{ surface: 'builder', level: 'answer', item_id: ITEM_ID }, { surface: 'builder', level: 'explanation', item_id: ITEM_ID }]);
    // The shared exposure log now makes the item non-novel for independent verification (06 §4.1).
    expect(assessNovelty({ item_id: ITEM_ID, item_family_id: 'syn-velmora-family', shared_stimulus_id: 'syn-velmora-passage', derived_from: [] }, fx!.store.learning.exposures()).novelty).toBe('exposed');
  });

  it('QC → release through the API publishes only the shown hash; withdraw stops serving', async () => {
    const { app: a, s } = await frozenApp();
    const { bundle_hash } = await qc(fx!, 'v1', new FakeAdapter('success', CORRECT));
    const wrong = await post(a, `/api/console/packages/${PKG}/v1/release`, s, { bundle_hash: 'e'.repeat(64) });
    expect([wrong.statusCode, wrong.json().reasons]).toEqual([409, ['APPROVED_HASH_MISMATCH']]);
    const listed = (await a.inject({ url: '/api/console/packages', headers: { host: HOST, cookie: s.cookie } })).json()[0];
    expect([listed.release_ready, listed.bundle_hash]).toEqual([true, bundle_hash]);
    expect((await post(a, `/api/console/packages/${PKG}/v1/release`, s, { bundle_hash })).statusCode).toBe(200);
    expect(fx!.store.knowledge.releaseState(PKG, 'v1')).toBe('active');
    const w = await post(a, `/api/console/packages/${PKG}/v1/withdraw`, s, { to: 'suspended', reason: 'synthetic complaint' });
    expect(w.statusCode).toBe(200);
    expect(fx!.store.knowledge.servableItem(ITEM_ID, 'v1', 'learner')).toEqual({ ok: false, reason: 'RELEASE_SUSPENDED' });
    const issues = (await a.inject({ url: '/api/console/issues', headers: { host: HOST, cookie: s.cookie } })).json();
    expect(issues.reviews.map((r: { kind: string }) => r.kind)).toContain('suspension_impact');
    const resolved = await post(a, `/api/console/issues/${issues.reviews[0].review_id}/resolve`, s, { resolution: 'manual_review_done' });
    expect(resolved.statusCode).toBe(200);
  });

  it('dry-run goes through the queue in dry_run scope and never touches learner data; runs show metadata only', async () => {
    const { app: a, s } = await frozenApp();
    const res = await post(a, `/api/console/packages/${PKG}/v1/dry-run`, s, { input_text: '<script>alert(1)</script> Synthetic answers q1 FALSE', request_id: 'dry-1' });
    expect(res.statusCode).toBe(200);
    expect((await post(a, `/api/console/packages/${PKG}/v1/dry-run`, s, { input_text: '<script>alert(1)</script> Synthetic answers q1 FALSE', request_id: 'dry-1' })).json()).toEqual(res.json());
    await drain(fx!, new FakeAdapter());
    expect(fx!.store.queue.get(res.json().job_id)).toMatchObject({ state: 'COMPLETED', scope: 'dry_run' });
    expect([count(fx!, "attempts WHERE scope = 'learner'"), count(fx!, 'observations'), count(fx!, "evidence_sources WHERE scope = 'learner'")]).toEqual([0, 0, 0]);
    const runs = await a.inject({ url: '/api/console/runs', headers: { host: HOST, cookie: s.cookie } });
    expect(runs.headers['content-type']).toMatch(/application\/json/);
    expect(runs.body).not.toMatch(/script|Synthetic answers/);
    expect(runs.json()[0]).toMatchObject({ scope: 'dry_run', state: 'COMPLETED', role: 'assessor', runs: [{ provider: 'fake', state: 'COMPLETED' }] });
    expect((await a.inject({ url: '/api/console/gateway', headers: { host: HOST, cookie: s.cookie } })).json()).toEqual([{ provider: 'claude-code', ready: false }]);
  });
});
