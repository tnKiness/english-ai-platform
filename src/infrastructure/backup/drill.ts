// P5-4 restore drill (IMPLEMENTATION_PLAN P5 "restore thực nghiệm thành công", 06 §5.B.6; E-29).
// Restores a backup into a throwaway folder, opens it with the real application store and reads every piece of
// learner data back (export path, media checksums), compares row counts with the backup itself, then deletes the
// throwaway copy. The live data and the backup are never modified. Each drill is appended to restore-drills.jsonl.
import { appendFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportLearnerData, EXPORT_TABLES } from '../export/learner-export.js';
import { dataPaths, type DataPaths } from '../files/paths.js';
import { openRaw } from '../sqlite/database.js';
import { openStore } from '../sqlite/store.js';
import { restoreBackup } from './backup.js';

export interface DrillReport {
  at: string; backup_dir: string; ok: boolean; duration_ms: number;
  restored?: { files: number; migrations: number };
  tables?: Record<string, number>; media?: number; error?: string;
}

/** Learner tables counted in the backup's own DB file and again through the restored store. */
function counts(db: { prepare(sql: string): { get(): unknown } }): Record<string, number> {
  return Object.fromEntries(EXPORT_TABLES.map((t) => [t.table, (db.prepare(`SELECT COUNT(*) AS n FROM ${t.table}${t.where ? ` WHERE ${t.where}` : ''}`).get() as { n: number }).n]));
}

export async function restoreDrill(backupDir: string, live: DataPaths, opts: { now?: () => Date; migrationsDir?: string } = {}): Promise<DrillReport> {
  const now = opts.now ?? (() => new Date());
  const started = Date.now();
  const report: DrillReport = { at: now().toISOString(), backup_dir: backupDir, ok: false, duration_ms: 0 };
  const scratch = mkdtempSync(join(tmpdir(), 'study-english-drill-'));
  try {
    const raw = openRaw(join(backupDir, 'db', 'study.db'), true);
    let expected: Record<string, number>;
    try { expected = counts(raw); } finally { raw.close(); }
    const restored = restoreBackup(backupDir, join(scratch, 'data'), opts.migrationsDir);
    report.restored = { files: restored.files, migrations: restored.migrations };
    const store = await openStore(dataPaths(restored.root), { migrationsDir: opts.migrationsDir });
    try {
      const actual = counts(store.db);
      const diff = Object.keys(expected).filter((t) => expected[t] !== actual[t]);
      if (diff.length) throw new Error(`Row counts differ after restore: ${diff.map((t) => `${t} ${expected[t]}→${actual[t]}`).join(', ')}`);
      // Reading every learner row and re-hashing every recording through the normal export path.
      const exported = exportLearnerData(store.db, store.paths, { parentDir: join(scratch, 'export'), now });
      report.tables = actual;
      report.media = exported.manifest.media.length;
    } finally { store.close(); }
    report.ok = true;
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
    report.duration_ms = Date.now() - started;
    appendFileSync(join(live.backups, 'restore-drills.jsonl'), `${JSON.stringify(report)}\n`, 'utf8');
  }
  return report;
}
