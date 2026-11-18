// E-32 (user decision 18/11/2026): while the app runs, one backup per study day and one restore drill per week.
// Local file copies only (no AI, no network). A job is recorded as done only after it succeeds, so a failure is
// retried at the next check the same day. Old backups are pruned by E-30 rules after each success.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { studyDayOf } from '../../domain/scheduling/study-day.js';
import type { Store } from '../sqlite/store.js';
import { createBackup } from './backup.js';
import { restoreDrill, type DrillReport } from './drill.js';
import { pruneBackups, standardBackups } from './prune.js';

export const DRILL_EVERY_DAYS = 7;
const BACKUP_JOB = 'auto_backup';
const DRILL_JOB = 'auto_restore_drill';

function drills(backupsRoot: string): DrillReport[] {
  const file = join(backupsRoot, 'restore-drills.jsonl');
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').trim().split(/\r?\n/).flatMap((l) => { try { return [JSON.parse(l) as DrillReport]; } catch { return []; } });
}

export interface AutoRunResult { backup: string | null; drill: DrillReport | null; errors: string[] }

/**
 * Called at app start and then periodically. Does nothing when both jobs are up to date, so calling it often is
 * cheap: it only reads scheduler_runs and the drill log.
 */
export async function runAutoBackup(store: Store, opts: { drillEveryDays?: number; migrationsDir?: string } = {}): Promise<AutoRunResult> {
  const now = store.now();
  const day = studyDayOf(now);
  const result: AutoRunResult = { backup: null, drill: null, errors: [] };
  if ((store.tracking.lastRunDay(BACKUP_JOB) ?? '') < day) {
    try {
      result.backup = (await createBackup(store.db, store.paths, store.now)).dir;
      store.tracking.claimSchedulerRun(BACKUP_JOB, day);
      pruneBackups(store.paths, { now: store.now });
    } catch (error) { result.errors.push(`backup: ${error instanceof Error ? error.message : String(error)}`); }
  }
  const lastOk = drills(store.paths.backups).filter((d) => d.ok).map((d) => Date.parse(d.at)).filter((t) => !Number.isNaN(t)).sort((a, b) => b - a)[0];
  const due = lastOk === undefined || now.getTime() - lastOk >= (opts.drillEveryDays ?? DRILL_EVERY_DAYS) * 86_400_000;
  // At most one drill attempt per day, so a backup that keeps failing is reported, not re-tried every hour.
  if (due && (store.tracking.lastRunDay(DRILL_JOB) ?? '') < day) {
    const newest = standardBackups(store.paths.backups)[0];
    if (newest) {
      result.drill = await restoreDrill(newest.dir, store.paths, { now: store.now, migrationsDir: opts.migrationsDir });
      store.tracking.claimSchedulerRun(DRILL_JOB, day);
      if (result.drill.ok) pruneBackups(store.paths, { now: store.now });
      else result.errors.push(`drill: ${result.drill.error ?? 'failed'}`);
    }
  }
  return result;
}

/** What Settings shows: newest backup, last drill (passed or not), when the next drill is due. */
export function autoBackupStatus(store: Store, opts: { drillEveryDays?: number } = {}) {
  const newest = standardBackups(store.paths.backups)[0] ?? null;
  const all = drills(store.paths.backups);
  const last = all.at(-1) ?? null;
  const lastOk = [...all].reverse().find((d) => d.ok) ?? null;
  const every = opts.drillEveryDays ?? DRILL_EVERY_DAYS;
  return {
    enabled: process.env.STUDY_ENGLISH_AUTO_BACKUP !== '0',
    backups_kept: standardBackups(store.paths.backups).length,
    last_backup_at: newest?.created_at ?? null,
    last_drill: last && { at: last.at, ok: last.ok, error: last.error ?? null },
    next_drill_due: lastOk ? new Date(Date.parse(lastOk.at) + every * 86_400_000).toISOString() : null,
  };
}

/**
 * Background schedule for the server process: first check shortly after start, then every hour; runs never overlap.
 * Errors are logged to the console and retried at the next check; they never stop the app.
 */
export function scheduleAutoBackup(store: Store, opts: { firstDelayMs?: number; everyMs?: number; log?: (m: string) => void } = {}): () => void {
  const log = opts.log ?? ((m) => console.log(m));
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await runAutoBackup(store);
      if (r.backup) log(`Sao lưu tự động: ${r.backup}`);
      if (r.drill) log(`Diễn tập khôi phục tự động: ${r.drill.ok ? 'ĐẠT' : `THẤT BẠI — ${r.drill.error}`}`);
      for (const e of r.errors) log(`Sao lưu tự động lỗi (sẽ thử lại): ${e}`);
    } catch (error) { log(`Sao lưu tự động lỗi (sẽ thử lại): ${error instanceof Error ? error.message : String(error)}`); }
    finally { running = false; }
  };
  const first = setTimeout(() => void tick(), opts.firstDelayMs ?? 15_000);
  const timer = setInterval(() => void tick(), opts.everyMs ?? 60 * 60_000);
  first.unref(); timer.unref();
  return () => { clearTimeout(first); clearInterval(timer); };
}
