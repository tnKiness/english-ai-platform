// P5-4 (E-29): one-command app (built UI served by the backend) and the restore drill.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createBackup } from '../../src/infrastructure/backup/backup.js';
import { restoreDrill } from '../../src/infrastructure/backup/drill.js';
import { createApp } from '../../src/server/app.js';
import { fixture, tempDir, type Fixture } from './p1-helpers.js';

const cleanups: (() => void)[] = [];
let f: Fixture | undefined;
afterEach(() => { f?.cleanup(); f = undefined; cleanups.splice(0).forEach((c) => c()); });
const HOST = { host: '127.0.0.1:4317' };

function webRoot() {
  const t = tempDir('ielts-web-'); cleanups.push(t.cleanup);
  const root = join(t.dir, 'web');
  mkdirSync(join(root, 'assets'), { recursive: true });
  writeFileSync(join(root, 'index.html'), '<!doctype html><div id="root"></div>');
  writeFileSync(join(root, 'assets', 'app-abc123.js'), 'console.log(1)');
  writeFileSync(join(t.dir, 'secret.json'), '{"secret":"OUTSIDE_WEB_ROOT"}');
  return root;
}

it('serves the built UI on the API origin without a session, with SPA fallback, and never outside the web root', async () => {
  const app = createApp({ webRoot: webRoot() });
  try {
    const page = await app.inject({ url: '/', headers: HOST });
    expect(page.statusCode).toBe(200);
    expect(page.headers['content-type']).toContain('text/html');
    expect(page.headers['cache-control']).toBe('no-store');
    expect(page.headers['x-content-type-options']).toBe('nosniff');
    const js = await app.inject({ url: '/assets/app-abc123.js', headers: HOST });
    expect(js.headers['content-type']).toContain('text/javascript');
    expect(js.headers['cache-control']).toContain('immutable');
    expect((await app.inject({ url: '/progress', headers: HOST })).body).toContain('id="root"');
    expect((await app.inject({ url: '/assets/missing.js', headers: HOST })).statusCode).toBe(404);
    for (const url of ['/../secret.json', '/%2e%2e/secret.json', '/..%2fsecret.json', '/assets/..%5c..%5csecret.json']) {
      const res = await app.inject({ url, headers: HOST });
      expect(res.body, url).not.toContain('OUTSIDE_WEB_ROOT');
    }
    // Host check still applies; /api still needs a session; writes outside /api still need a session.
    expect((await app.inject({ url: '/', headers: { host: 'evil.example:4317' } })).statusCode).toBe(403);
    expect((await app.inject({ url: '/api/learning/progress', headers: HOST })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/', headers: HOST, payload: {} })).statusCode).toBe(401);
  } finally { await app.close(); }
});

it('refuses to start without a built UI', () => {
  const t = tempDir('ielts-noweb-'); cleanups.push(t.cleanup);
  expect(() => createApp({ webRoot: t.dir })).toThrow(/npm run build/);
});

it('restore drill: restores into a throwaway folder, reads learner data back, logs the result, leaves live data alone', async () => {
  f = await fixture();
  f.store.learning.createAttempt({ request_key: 'drill-a', scope: 'learner', item: f.item, rubric: f.rubric, mode: 'self_practice', purpose: 'practice' });
  const { dir } = await createBackup(f.store.db, f.store.paths, f.store.now);
  const ok = await restoreDrill(dir, f.store.paths);
  expect(ok).toMatchObject({ ok: true, media: 0 });
  expect(ok.tables?.attempts).toBe(1);
  expect(f.store.db.prepare('SELECT COUNT(*) FROM attempts').pluck().get()).toBe(1);

  // A damaged backup fails the drill (and is logged), instead of passing silently.
  writeFileSync(join(dir, 'db', 'study.db'), Buffer.concat([readFileSync(join(dir, 'db', 'study.db')), Buffer.from('x')]));
  const bad = await restoreDrill(dir, f.store.paths);
  expect(bad.ok).toBe(false);
  expect(bad.error).toMatch(/Checksum mismatch/);
  const log = readFileSync(join(f.store.paths.backups, 'restore-drills.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { ok: boolean });
  expect(log.map((l) => l.ok)).toEqual([true, false]);
});
