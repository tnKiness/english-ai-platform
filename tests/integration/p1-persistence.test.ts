import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ImmutableVersionError, IntegrityError } from '../../src/infrastructure/files/json-store.js';
import { dataPaths } from '../../src/infrastructure/files/paths.js';
import { openDatabase, openRaw } from '../../src/infrastructure/sqlite/database.js';
import { IdempotencyConflictError } from '../../src/infrastructure/sqlite/learning-repository.js';
import { openStore } from '../../src/infrastructure/sqlite/store.js';
import { fixture, tempDir, type Fixture } from './p1-helpers.js';

let f: Fixture | undefined;
const cleanups: (() => void)[] = [];
afterEach(() => { f?.cleanup(); f = undefined; cleanups.splice(0).forEach((c) => c()); });

describe('P1-1 migrations', () => {
  it('applies versioned migrations once and reopens without change', async () => {
    const t = tempDir(); cleanups.push(t.cleanup);
    const db = await openDatabase(join(t.dir, 'a.db'));
    expect(db.prepare('SELECT version, name FROM schema_migrations').all()).toEqual([{ version: 1, name: 'core' }, { version: 2, name: 'builder_qc' }, { version: 3, name: 'provider_agy' }, { version: 4, name: 'learning_p3' }, { version: 5, name: 'reading' }, { version: 6, name: 'audio_samples' }, { version: 7, name: 'p4_resilience' }]);
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    db.close();
    const again = await openDatabase(join(t.dir, 'a.db'));
    expect((again.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get() as { n: number }).n).toBe(7);
    again.close();
  });

  it('refuses a modified applied migration and backs up before applying a new one', async () => {
    const t = tempDir(); cleanups.push(t.cleanup);
    const dir = join(t.dir, 'migrations'); mkdirSync(dir);
    copyFileSync('migrations/0001_core.sql', join(dir, '0001_core.sql'));
    (await openDatabase(join(t.dir, 'b.db'), { migrationsDir: dir })).close();
    writeFileSync(join(dir, '0002_extra.sql'), 'CREATE TABLE synthetic_extra (id TEXT PRIMARY KEY);');
    const seen: number[][] = [];
    const db = await openDatabase(join(t.dir, 'b.db'), { migrationsDir: dir, beforeMigrate: (_db, pending) => { seen.push(pending.map((p) => p.version)); } });
    db.close();
    expect(seen).toEqual([[2]]);
    writeFileSync(join(dir, '0001_core.sql'), readFileSync(join(dir, '0001_core.sql'), 'utf8') + '\n-- edited');
    await expect(openDatabase(join(t.dir, 'b.db'), { migrationsDir: dir })).rejects.toThrow(/modified/);
  });
});

describe('P1-1 immutable JSON and media stores', () => {
  it('writes each version once, verifies checksum and blocks traversal', async () => {
    f = await fixture();
    const { json } = f.store;
    expect(json.get('item', f.item.id, 'v1', f.item.hash)).toMatchObject({ synthetic: true });
    expect(json.put('item', f.item.id, 'v1', { answer: 'synthetic-secret', prompt: 'Synthetic writing prompt', synthetic: true }).hash).toBe(f.item.hash);
    expect(() => json.put('item', f!.item.id, 'v1', { changed: true })).toThrow(ImmutableVersionError);
    expect(() => json.get('item', f!.item.id, 'v1', '0'.repeat(64))).toThrow(IntegrityError);
    expect(() => json.put('item', '../escape', 'v1', {})).toThrow(/Unsafe/);
    writeFileSync(join(f.store.paths.knowledge, f.item.rel_path), '{"tampered":true}');
    expect(() => json.get('item', f!.item.id, 'v1')).toThrow(IntegrityError);
    expect(() => f!.store.db.prepare("UPDATE json_objects SET content_hash = ? WHERE object_id = ?").run('1'.repeat(64), f!.item.id)).toThrow(/immutable/);
  });

  it('stores media by checksum and refuses tampered or escaping paths', async () => {
    f = await fixture();
    const { media, db } = f.store;
    const a = media.put(Buffer.from('synthetic-audio'), 'audio/wav');
    expect(media.put(Buffer.from('synthetic-audio'), 'audio/wav')).toEqual(a);
    expect(media.read(a.media_id).toString()).toBe('synthetic-audio');
    writeFileSync(join(f.store.paths.media, a.rel_path), 'tampered');
    expect(() => media.read(a.media_id)).toThrow(IntegrityError);
    db.prepare("INSERT INTO media_assets VALUES ('media_escape', '../../outside.wav', ?, 1, 'audio/wav', '2026-10-20T00:00:00.000Z')").run('2'.repeat(64));
    expect(() => media.read('media_escape')).toThrow(/escapes/);
  });
});

describe('P1-1 learner records', () => {
  it('pins item and rubric version + hash at assignment; a newer rubric does not change the attempt', async () => {
    f = await fixture();
    const attempt = f.store.learning.createAttempt({ request_key: 'r1', scope: 'learner', item: { id: f.item.id, version: 'v1' }, rubric: { id: f.rubric.id, version: 'v1' }, mode: 'self_practice', purpose: 'practice' });
    f.store.json.put('rubric', f.rubric.id, 'v2', { synthetic: true, criteria: ['changed'] });
    const again = f.store.learning.getAttempt(attempt.attempt_id)!;
    expect(again.rubric).toEqual({ id: f.rubric.id, version: 'v1', hash: f.rubric.hash });
    expect(again.item.hash).toBe(f.item.hash);
    expect(() => f!.store.db.prepare("UPDATE attempts SET rubric_version = 'v2' WHERE attempt_id = ?").run(attempt.attempt_id)).toThrow(/immutable/);
    expect(f.store.learning.createAttempt({ request_key: 'r1', scope: 'learner', item: { id: f.item.id, version: 'v1' }, rubric: { id: f.rubric.id, version: 'v1' }, mode: 'self_practice', purpose: 'practice' }).attempt_id).toBe(attempt.attempt_id);
    expect(() => f!.store.learning.createAttempt({ request_key: 'r1', scope: 'learner', item: { id: f!.item.id, version: 'v1' }, rubric: { id: f!.rubric.id, version: 'v2' }, mode: 'self_practice', purpose: 'practice' })).toThrow(IdempotencyConflictError);
  });

  it('keeps original and repair revisions immutable on one evidence source; double submit stores once', async () => {
    f = await fixture();
    const { learning, db } = f.store;
    const attempt = learning.createAttempt({ request_key: 'r1', scope: 'learner', item: { id: f.item.id, version: 'v1' }, rubric: { id: f.rubric.id, version: 'v1' }, mode: 'guided', purpose: 'lesson' });
    const original = learning.submit({ request_key: 's0', attempt_id: attempt.attempt_id, content: 'Original synthetic text' });
    expect(learning.submit({ request_key: 's0', attempt_id: attempt.attempt_id, content: 'Original synthetic text' }).submission_id).toBe(original.submission_id);
    expect(() => learning.submit({ request_key: 's0', attempt_id: attempt.attempt_id, content: 'different' })).toThrow(IdempotencyConflictError);
    const repair1 = learning.submit({ request_key: 's1', attempt_id: attempt.attempt_id, content: 'Repair 1', parent_submission_id: original.submission_id });
    const repair2 = learning.submit({ request_key: 's2', attempt_id: attempt.attempt_id, content: 'Repair 2', parent_submission_id: repair1.submission_id });
    expect([original, repair1, repair2].map((s) => [s.kind, s.revision, s.repair_attempt_index])).toEqual([['original', 0, 0], ['repair', 1, 1], ['repair', 2, 2]]);
    expect(new Set([original, repair1, repair2].map((s) => s.evidence_source_id)).size).toBe(1);
    expect(learning.getAttempt(attempt.attempt_id)!.state).toBe('REPAIRING');
    expect((db.prepare('SELECT COUNT(*) AS n FROM submissions').get() as { n: number }).n).toBe(3);
    expect(() => db.prepare("UPDATE submissions SET content = 'rewritten' WHERE submission_id = ?").run(original.submission_id)).toThrow(/immutable/);
    expect(() => db.prepare('DELETE FROM submissions WHERE submission_id = ?').run(original.submission_id)).toThrow(/immutable/);
    expect(learning.submissionContent(original.submission_id)).toBe('Original synthetic text');
  });

  it('records assistance and exposure once per idempotency key', async () => {
    f = await fixture();
    const { learning, db } = f.store;
    const attempt = learning.createAttempt({ request_key: 'r1', scope: 'learner', item: { id: f.item.id, version: 'v1' }, rubric: { id: f.rubric.id, version: 'v1' }, mode: 'guided', purpose: 'lesson' });
    const sub = learning.submit({ request_key: 's0', attempt_id: attempt.attempt_id, content: 'text' });
    const pre = learning.saveSnapshot(attempt.attempt_id, 'pre_assistance', 'text');
    const hint = { idempotency_key: 'hint-1', attempt_id: attempt.attempt_id, submission_id: sub.submission_id, hint_level: 1, content: 'Synthetic hint', impacts: [{ competency_id: 'c.synthetic', impact: 'affected' as const, reduced_load: false }], pre_snapshot_id: pre.snapshot_id, post_snapshot_id: null };
    expect(learning.recordAssistance(hint).created).toBe(true);
    expect(learning.recordAssistance(hint).created).toBe(false);
    const exposure = { idempotency_key: 'exp-1', item: { id: f.item.id, version: 'v1', hash: f.item.hash }, item_family_id: 'family-1', shared_stimulus_id: null, surface: 'builder' as const, scope: 'dry_run' as const, level: 'answer' as const };
    learning.recordExposure(exposure); learning.recordExposure(exposure);
    expect((db.prepare('SELECT COUNT(*) AS n FROM assistance_events').get() as { n: number }).n).toBe(1);
    expect(learning.exposures()).toEqual([{ item_id: f.item.id, item_family_id: 'family-1', shared_stimulus_id: null, level: 'answer' }]);
    expect(learning.assistanceFor(attempt.attempt_id)[0]!.impacts).toEqual([{ competency_id: 'c.synthetic', impact: 'affected', reduced_load: false }]);
  });

  it('separates dry-run from learner scope and only lets dry-run use draft content', async () => {
    f = await fixture({ active: false });
    const { learning, db } = f.store;
    const req = { item: { id: f.item.id, version: 'v1' }, rubric: { id: f.rubric.id, version: 'v1' }, mode: 'self_practice' as const, purpose: 'practice' as const };
    expect(() => learning.createAttempt({ request_key: 'l', scope: 'learner', ...req })).toThrow(/RELEASE_DRAFT/);
    const dry = learning.createAttempt({ request_key: 'd', scope: 'dry_run', ...req });
    const source = db.prepare('SELECT scope FROM evidence_sources WHERE attempt_id = ?').get(dry.attempt_id);
    expect(source).toEqual({ scope: 'dry_run' });
    expect(() => db.prepare("INSERT INTO evidence_sources VALUES ('x', ?, 'learner', '2026-10-20T00:00:00.000Z')").run(dry.attempt_id)).toThrow();
    expect(learning.observations('c.synthetic', 'learner')).toEqual([]);
  });
});

describe('P1-1 lifecycle and revocation', () => {
  it('needs the exact hash to activate, keeps release history, and stops serving revoked content at once', async () => {
    f = await fixture({ active: false });
    const { knowledge, db } = f.store;
    expect(() => knowledge.transition(f!.pkg.id, 'v1', 'active', 'wrong hash', '0'.repeat(64))).toThrow(/hash/);
    knowledge.transition(f.pkg.id, 'v1', 'active', 'ok', f.pkg.hash);
    expect(knowledge.servableItem(f.item.id, 'v1', 'learner').ok).toBe(true);
    knowledge.revoke({ target_kind: 'package', target_id: f.pkg.id, target_version: 'v1' }, 'synthetic answer key error');
    expect(knowledge.releaseState(f.pkg.id, 'v1')).toBe('suspended');
    expect(knowledge.servableItem(f.item.id, 'v1', 'learner')).toEqual({ ok: false, reason: 'REVOKED' });
    expect(() => knowledge.transition(f!.pkg.id, 'v1', 'active', 'reactivate', f!.pkg.hash)).toThrow(/Invalid release transition/);
    const history = db.prepare('SELECT from_state, to_state FROM release_events ORDER BY created_at, rowid').all();
    expect(history).toEqual([{ from_state: null, to_state: 'draft' }, { from_state: 'draft', to_state: 'active' }, { from_state: 'active', to_state: 'suspended' }]);
    expect(() => db.prepare('DELETE FROM revocations').run()).toThrow(/immutable/);
  });

  it('persists across reopen of the same file (no in-memory state)', async () => {
    const t = tempDir(); cleanups.push(t.cleanup);
    f = await fixture({ root: t.dir });
    f.store.close();
    const store = await openStore(dataPaths(t.dir));
    try {
      expect(store.knowledge.releaseState('synthetic-pkg', 'v1')).toBe('active');
      expect(store.json.get('rubric', 'synthetic-rubric', 'v1')).toEqual({ synthetic: true, criteria: ['synthetic'] });
      const raw = openRaw(dataPaths(t.dir).db, true);
      expect(raw.pragma('integrity_check', { simple: true })).toBe('ok');
      raw.close();
    } finally { store.close(); }
  });
});
