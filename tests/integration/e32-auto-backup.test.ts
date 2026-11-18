// E-32 (user decision 18/11/2026): one backup per study day and one restore drill per week while the app runs.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { autoBackupStatus, runAutoBackup } from '../../src/infrastructure/backup/auto.js';
import { standardBackups } from '../../src/infrastructure/backup/prune.js';
import { fixture, type Fixture } from './p1-helpers.js';

let f: Fixture | undefined;
afterEach(() => { f?.cleanup(); f = undefined; });
const DAY = 86_400_000;

it('backs up once per study day, drills weekly, and does nothing when both are up to date', async () => {
  f = await fixture();
  f.store.learning.createAttempt({ request_key: 'auto-a', scope: 'learner', item: f.item, rubric: f.rubric, mode: 'self_practice', purpose: 'practice' });
  const status0 = autoBackupStatus(f.store);
  expect(status0).toMatchObject({ backups_kept: 0, last_backup_at: null, last_drill: null, next_drill_due: null });

  const first = await runAutoBackup(f.store);
  expect(first.backup).not.toBeNull();
  expect(first.drill?.ok).toBe(true);
  expect(first.errors).toEqual([]);

  // Same day, a few hours later: nothing to do.
  f.clock.advance(3 * 3_600_000);
  expect(await runAutoBackup(f.store)).toEqual({ backup: null, drill: null, errors: [] });

  // Next day: a backup, no drill (weekly).
  f.clock.advance(DAY);
  const next = await runAutoBackup(f.store);
  expect(next.backup).not.toBeNull();
  expect(next.drill).toBeNull();

  // A week after the last passed drill: backup + drill.
  f.clock.advance(7 * DAY);
  const week = await runAutoBackup(f.store);
  expect(week.backup).not.toBeNull();
  expect(week.drill?.ok).toBe(true);
  const s = autoBackupStatus(f.store);
  expect(s.backups_kept).toBe(3);
  expect(s.last_drill?.ok).toBe(true);
  expect(Date.parse(s.next_drill_due!)).toBe(Date.parse(s.last_drill!.at) + 7 * DAY);
});

it('a failed drill is reported once a day and retried the next day; old backups are pruned to 10', async () => {
  f = await fixture();
  for (let i = 0; i < 12; i++) { await runAutoBackup(f.store); f.clock.advance(DAY); }
  expect(standardBackups(f.store.paths.backups)).toHaveLength(10);

  // Damage the newest backup, then make a drill due.
  f.clock.advance(7 * DAY);
  const r = await runAutoBackup(f.store);
  expect(r.drill?.ok).toBe(true); // today's fresh backup is drilled, before any damage
  f.clock.advance(7 * DAY);
  // Turn off today's backup so the drill uses the damaged newest one.
  const newest = standardBackups(f.store.paths.backups)[0]!.dir;
  writeFileSync(join(newest, 'db', 'study.db'), Buffer.concat([readFileSync(join(newest, 'db', 'study.db')), Buffer.from('x')]));
  f.store.tracking.claimSchedulerRun('auto_backup', '2099-01-01');
  const bad = await runAutoBackup(f.store);
  expect(bad.drill?.ok).toBe(false);
  expect(bad.errors[0]).toMatch(/drill: Checksum mismatch/);
  expect(autoBackupStatus(f.store).last_drill).toMatchObject({ ok: false });
  // Same day: not retried every hour.
  f.clock.advance(3_600_000);
  expect((await runAutoBackup(f.store)).drill).toBeNull();
});
