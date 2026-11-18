// E-30 (user decision 18/11/2026, D-07 part): old backups are the only thing the system deletes by itself.
// Kept: the newest `keep` standard backups (default 10) and the backup of the newest PASSED restore drill.
// Never touched: folders that are not a complete standard backup (no valid manifest, `.partial`, hand-made copies such
// as pre-m8-repair-*), exports, learner data, audio, history. Every removal is appended to prune-log.jsonl.
import { appendFileSync, existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { DataPaths } from '../files/paths.js';

export const DEFAULT_BACKUPS_KEPT = 10;

interface Standard { dir: string; created_at: string }

export function standardBackups(backupsRoot: string): Standard[] {
  if (!existsSync(backupsRoot)) return [];
  const out: Standard[] = [];
  for (const entry of readdirSync(backupsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name.endsWith('.partial')) continue;
    const dir = join(backupsRoot, entry.name);
    try {
      const m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as { format?: string; created_at?: string };
      if (m.format === 'study-english-backup' && typeof m.created_at === 'string' && !Number.isNaN(Date.parse(m.created_at))) out.push({ dir, created_at: m.created_at });
    } catch { /* not a standard backup: never pruned */ }
  }
  return out.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.dir.localeCompare(a.dir));
}

/** Backup folder of the newest drill that passed, from restore-drills.jsonl (null when none). */
function lastPassedDrill(backupsRoot: string): string | null {
  const file = join(backupsRoot, 'restore-drills.jsonl');
  if (!existsSync(file)) return null;
  const lines = readFileSync(file, 'utf8').trim().split(/\r?\n/).reverse();
  for (const line of lines) {
    try { const r = JSON.parse(line) as { ok?: boolean; backup_dir?: string }; if (r.ok && r.backup_dir) return resolve(r.backup_dir); } catch { /* skip a damaged line */ }
  }
  return null;
}

export function pruneBackups(paths: DataPaths, opts: { keep?: number; now?: () => Date } = {}): { kept: string[]; removed: string[] } {
  const keep = opts.keep ?? DEFAULT_BACKUPS_KEPT;
  if (!Number.isInteger(keep) || keep < 1) throw new Error('keep must be an integer ≥ 1');
  const all = standardBackups(paths.backups);
  const drilled = lastPassedDrill(paths.backups);
  const kept = all.filter((b, i) => i < keep || resolve(b.dir) === drilled);
  const removed = all.filter((b) => !kept.includes(b));
  for (const b of removed) {
    rmSync(b.dir, { recursive: true, force: true });
    appendFileSync(join(paths.backups, 'prune-log.jsonl'), `${JSON.stringify({ at: (opts.now ?? (() => new Date()))().toISOString(), removed: b.dir, created_at: b.created_at, rule: `keep newest ${keep} + last passed drill` })}\n`, 'utf8');
  }
  return { kept: kept.map((b) => b.dir), removed: removed.map((b) => b.dir) };
}
