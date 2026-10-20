import { existsSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { submitForAssessment } from '../../src/application/learning/submit-for-assessment.js';
import { BackupError, createBackup, promoteRestored, restoreBackup } from '../../src/infrastructure/backup/backup.js';
import { dataPaths, sha256 } from '../../src/infrastructure/files/paths.js';
import { openStore } from '../../src/infrastructure/sqlite/store.js';
import { assessInput, fixture, tempDir, type Fixture } from './p1-helpers.js';

let f: Fixture | undefined;
const cleanups: (() => void)[] = [];
afterEach(() => { f?.cleanup(); f = undefined; cleanups.splice(0).forEach((c) => c()); });

async function seeded() {
  const t = tempDir(); cleanups.push(t.cleanup);
  const live = join(t.dir, 'live');
  f = await fixture({ root: live });
  const audio = f.store.media.put(Buffer.from('synthetic-audio-bytes'), 'audio/wav');
  const attempt = f.store.learning.createAttempt({ request_key: 'a', scope: 'learner', item: { id: f.item.id, version: 'v1' }, rubric: { id: f.rubric.id, version: 'v1' }, mode: 'self_practice', purpose: 'practice' });
  submitForAssessment(f.store, assessInput(f, attempt.attempt_id, 's'));
  return { base: t.dir, live, audio };
}
const tables = ['json_objects', 'media_assets', 'attempts', 'submissions', 'snapshots', 'context_manifests', 'ai_jobs', 'release_events'];

describe('P1-4 coordinated backup and restore', () => {
  it('backs up DB + JSON + media online, restores to a separate place and verifies before use', async () => {
    const { base, live, audio } = await seeded();
    const fx = f!;
    // Online: the store stays open; a write right after the snapshot is not part of this backup.
    const backup = await createBackup(fx.store.db, fx.store.paths, fx.clock.now);
    fx.store.json.put('knowledge', 'after-backup', 'v1', { synthetic: true });
    expect(backup.manifest.files.map((x) => x.store).sort()).toEqual(['knowledge', 'knowledge', 'knowledge', 'media']);
    expect(readdirSync(fx.store.paths.backups).some((d) => d.endsWith('.partial'))).toBe(false);

    const target = join(base, 'restored');
    const report = restoreBackup(backup.dir, target);
    expect(report).toMatchObject({ root: target, files: 4, migrations: 1 });
    const restored = await openStore(dataPaths(target));
    try {
      for (const t of tables) {
        const n = (s: typeof restored) => (s.db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;
        expect(n(restored), t).toBe(t === 'json_objects' ? n(fx.store) - 1 : n(fx.store));
      }
      expect(restored.media.read(audio.media_id).toString()).toBe('synthetic-audio-bytes');
      expect(restored.json.get('item', fx.item.id, 'v1', fx.item.hash)).toMatchObject({ synthetic: true });
      expect(restored.db.pragma('foreign_key_check')).toEqual([]);
    } finally { restored.close(); }
    // The live data was not touched by the restore.
    expect(existsSync(join(live, 'db', 'study.db'))).toBe(true);
    expect(fx.store.json.get('knowledge', 'after-backup', 'v1')).toEqual({ synthetic: true });
  });

  it('stays consistent when JSON/media/DB writes happen while the online backup runs', async () => {
    const { base } = await seeded();
    const fx = f!;
    const pending = createBackup(fx.store.db, fx.store.paths, fx.clock.now);
    for (let i = 0; i < 20; i += 1) {
      fx.store.json.put('knowledge', `concurrent-${i}`, 'v1', { synthetic: true, i });
      fx.store.media.put(Buffer.from(`synthetic-concurrent-${i}`), 'audio/wav');
    }
    const backup = await pending;
    // Whatever rows the snapshot contains, every referenced file is present and verified (restore re-checks it).
    const report = restoreBackup(backup.dir, join(base, 'restored'));
    expect(report.files).toBe(backup.manifest.files.length);
    expect(report.files).toBeGreaterThanOrEqual(4);
  });

  it('refuses to restore a backup whose files fail checksum, leaving nothing behind', async () => {
    const { base, audio } = await seeded();
    const backup = await createBackup(f!.store.db, f!.store.paths);
    writeFileSync(join(backup.dir, 'media', audio.rel_path), 'corrupted');
    const target = join(base, 'restored');
    expect(() => restoreBackup(backup.dir, target)).toThrow(BackupError);
    expect(existsSync(target)).toBe(false);
    expect(readdirSync(base).filter((d) => d.includes('restoring'))).toEqual([]);
  });

  it('does not report success when a referenced live file is missing or modified', async () => {
    const { audio } = await seeded();
    rmSync(join(f!.store.paths.media, audio.rel_path));
    await expect(createBackup(f!.store.db, f!.store.paths)).rejects.toThrow();
    writeFileSync(join(f!.store.paths.media, audio.rel_path), 'tampered');
    await expect(createBackup(f!.store.db, f!.store.paths)).rejects.toThrow(BackupError);
    expect(readdirSync(f!.store.paths.backups)).toEqual([]);
  });

  it('refuses a non-empty target and a backup DB that differs from its manifest', async () => {
    const { base } = await seeded();
    const backup = await createBackup(f!.store.db, f!.store.paths);
    expect(() => restoreBackup(backup.dir, base)).toThrow(/empty/); // base already holds live data
    writeFileSync(join(backup.dir, 'db', 'study.db'), 'not a database');
    expect(() => restoreBackup(backup.dir, join(base, 'fresh'))).toThrow(/Checksum/);
  });

  it('promotes a verified restore only with the app stopped, keeping the replaced data', async () => {
    const { base, live } = await seeded();
    const fx = f!;
    const backup = await createBackup(fx.store.db, fx.store.paths);
    const content = () => fx.store.db.prepare('SELECT submission_id, content_hash FROM submissions').all();
    const before = content();
    const report = restoreBackup(backup.dir, join(base, 'restored'));
    fx.store.close();
    const { replaced } = promoteRestored(report, live, fx.clock.now);
    expect(replaced).not.toBeNull();
    expect(existsSync(join(replaced!, 'db', 'study.db'))).toBe(true);
    const reopened = await openStore(dataPaths(live));
    try {
      expect(reopened.knowledge.releaseState('synthetic-pkg', 'v1')).toBe('active');
      expect(reopened.db.prepare('SELECT submission_id, content_hash FROM submissions').all()).toEqual(before);
      expect(sha256(reopened.learning.submissionContent((before[0] as { submission_id: string }).submission_id))).toBe((before[0] as { content_hash: string }).content_hash);
    } finally { reopened.close(); }
  });
});
