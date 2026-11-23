// P5-3 learner export + storage report (D-07 independent part; E-28): read-only, complete for learner data,
// never contains unopened hints, answer keys or dry-run work; checksums verifiable; failures leave nothing behind.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { SYNTHETIC_KEY_SECRET, SYNTHETIC_SECRET_REWRITE } from '../../src/application/learning/writing-workflow.js';
import { EXPORT_TABLES, exportLearnerData, storageUsage, unsafeExportParent } from '../../src/infrastructure/export/learner-export.js';
import { dataPaths, sha256 } from '../../src/infrastructure/files/paths.js';
import { openStore, type Store } from '../../src/infrastructure/sqlite/store.js';
import { createApp } from '../../src/server/app.js';
import { clock, tempDir } from './p1-helpers.js';

let store: Store | undefined;
let app: ReturnType<typeof createApp> | undefined;
const cleanups: (() => void)[] = [];
afterEach(async () => {
  await app?.close(); app = undefined;
  try { store?.close(); } catch { /* closed */ }
  store = undefined;
  cleanups.splice(0).forEach((c) => c());
});

const HOST = '127.0.0.1:4317';
const ORIGIN = 'http://127.0.0.1:5173';
const wav = (tag: string) => { const p = Buffer.from(tag, 'ascii'); const h = Buffer.alloc(12); h.write('RIFF', 0, 'ascii'); h.writeUInt32LE(p.length + 4, 4); h.write('WAVE', 8, 'ascii'); return Buffer.concat([h, p]); };

async function withLearnerData() {
  const t = tempDir('ielts-p5x-'); cleanups.push(t.cleanup);
  store = await openStore(dataPaths(t.dir), { now: clock('2026-11-17T02:00:00.000Z').now });
  app = createApp({ store, gatewayStatus: async () => [] });
  const s = await app.inject({ url: '/api/session', headers: { host: HOST } });
  const headers = { host: HOST, origin: ORIGIN, cookie: String(s.headers['set-cookie']).split(';')[0]!, 'x-csrf-token': s.json().csrf_token as string };
  const post = (url: string, payload: object = {}) => app!.inject({ method: 'POST', url, headers, payload });
  // Writing: a not-met submission makes the server store a diagnosis with pre-generated hints (none unlocked).
  const attempt = (await post('/api/learning/attempts', { request_key: 'x-attempt', mode: 'self_practice', purpose: 'practice' })).json();
  const id = attempt.attempt.attempt_id as string;
  expect((await post(`/api/learning/attempts/${id}/submit`, { request_key: 'x-sub', content: 'Libraries matter. [SYNTHETIC_NOT_MET]' })).statusCode).toBe(200);
  // Speaking: one recording.
  const audio = (await post('/api/learning/audio', { request_key: 'x-audio' })).json().attempt_id as string;
  expect((await post(`/api/learning/audio/${audio}/recordings`, { request_key: 'x-rec', data: wav('SYNTHETIC_EXPORT_AUDIO').toString('base64'), media_type: 'audio/wav' })).statusCode).toBe(200);
  await post('/api/learning/tracking/activity', { events: [{ client_event_id: 'x-beat', activity: 'writing', surface: 'workspace', span_seconds: 60, occurred_at: '2026-11-17T01:59:00Z' }] });
  // A dry-run attempt (Builder & QC) must never be exported.
  store.db.prepare(`INSERT INTO attempts (attempt_id, request_key, scope, item_id, item_version, item_hash, rubric_id, rubric_version, rubric_hash, mode, purpose, state, created_at, updated_at)
    SELECT 'dry-run-attempt', 'dry-run-key', 'dry_run', item_id, item_version, item_hash, rubric_id, rubric_version, rubric_hash, mode, purpose, state, created_at, updated_at FROM attempts WHERE attempt_id = ?`).run(id);
  return { root: t.dir, post, headers, writingId: id };
}

const allText = (dir: string): string => readdirSync(dir, { withFileTypes: true }).map((e) =>
  e.isDirectory() ? allText(join(dir, e.name)) : readFileSync(join(dir, e.name)).toString('latin1')).join('\n');

it('exports learner data with verifiable checksums, the original audio, and none of the hidden hints, keys or dry-run work', async () => {
  const { root, writingId } = await withLearnerData();
  const { dir, manifest } = exportLearnerData(store!.db, store!.paths, { now: store!.now });
  expect(dir.startsWith(join(root, 'exports'))).toBe(true);
  expect(Object.keys(manifest.tables)).toEqual(EXPORT_TABLES.map((t) => t.table));
  for (const t of Object.values(manifest.tables)) expect(sha256(readFileSync(join(dir, t.file), 'utf8'))).toBe(t.sha256);
  const attempts = JSON.parse(readFileSync(join(dir, 'data/attempts.json'), 'utf8')) as { attempt_id: string; scope: string }[];
  expect(attempts.map((a) => a.attempt_id)).toContain(writingId);
  expect(attempts.every((a) => a.scope === 'learner')).toBe(true);
  expect(manifest.tables.submissions!.rows).toBeGreaterThan(0);
  expect(manifest.tables.study_activity_events!.rows).toBe(1);
  const diag = JSON.parse(readFileSync(join(dir, 'data/writing_diagnoses.json'), 'utf8')) as Record<string, unknown>[];
  expect(diag.length).toBeGreaterThan(0);
  expect(diag.every((d) => !('hints_json' in d))).toBe(true);
  // The hidden level-3 rewrite and the synthetic answer key exist in the DB but nowhere in the export.
  expect(store!.db.prepare('SELECT hints_json FROM writing_diagnoses').pluck().get()).toContain('SYNTHETIC-LEVEL3');
  const text = allText(dir);
  expect(text).not.toContain(SYNTHETIC_SECRET_REWRITE.slice(0, 40));
  expect(text).not.toContain(SYNTHETIC_KEY_SECRET);
  expect(text).not.toContain('dry-run-attempt');
  // Audio copied byte for byte.
  expect(manifest.media).toHaveLength(1);
  const m = manifest.media[0]!;
  expect(sha256(readFileSync(join(dir, m.file)))).toBe(m.sha256);
  expect(readFileSync(join(dir, m.file)).toString('latin1')).toContain('SYNTHETIC_EXPORT_AUDIO');
  expect(JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')).excluded.length).toBeGreaterThan(0);
  expect(existsSync(join(dir, 'DOC_TRUOC.txt'))).toBe(true);
});

it('a changed media file stops the export and leaves no partial folder; nothing in var/ is modified', async () => {
  await withLearnerData();
  const media = store!.db.prepare('SELECT rel_path FROM media_assets').pluck().get() as string;
  const before = store!.db.prepare('SELECT COUNT(*) FROM submissions').pluck().get();
  writeFileSync(join(store!.paths.media, media), 'tampered');
  expect(() => exportLearnerData(store!.db, store!.paths, { now: store!.now })).toThrow(/checksum/);
  expect(existsSync(join(store!.paths.root, 'exports')) ? readdirSync(join(store!.paths.root, 'exports')) : []).toEqual([]);
  expect(store!.db.prepare('SELECT COUNT(*) FROM submissions').pluck().get()).toBe(before);
});

it('storage report and HTTP routes are read-only and session/CSRF protected', async () => {
  const { post, headers } = await withLearnerData();
  const u = storageUsage(store!.db, store!.paths);
  expect(u.areas.database).toBeGreaterThan(0);
  expect(u.areas.media).toBeGreaterThan(0);
  expect(u.disk.free_bytes).toBeGreaterThan(0);
  expect(u.retention.policy).toBe('warn_block_manual_prune'); // E-53 (D-07): never deletes automatically
  expect((await app!.inject({ url: '/api/learning/storage', headers: { host: HOST } })).statusCode).toBe(401);
  expect((await app!.inject({ url: '/api/learning/storage', headers: { host: HOST, cookie: headers.cookie } })).json().total_bytes).toBeGreaterThan(0);
  const noCsrf = await app!.inject({ method: 'POST', url: '/api/learning/export', headers: { host: HOST, origin: ORIGIN, cookie: headers.cookie }, payload: {} });
  expect(noCsrf.statusCode).toBe(403);
  const ok = (await post('/api/learning/export')).json();
  expect(ok.media).toBe(1);
  expect(ok.tables.attempts).toBeGreaterThan(0);
});

it('refuses an export folder inside the repository but outside var/', () => {
  expect(unsafeExportParent('C:/repo/docs', 'C:/repo', 'C:/repo/var')).toBe(true);
  expect(unsafeExportParent('C:/repo/var/exports', 'C:/repo', 'C:/repo/var')).toBe(false);
  expect(unsafeExportParent('D:/backup', 'C:/repo', 'C:/repo/var')).toBe(false);
  expect(unsafeExportParent('C:/repo-other', 'C:/repo', 'C:/repo/var')).toBe(false);
});
