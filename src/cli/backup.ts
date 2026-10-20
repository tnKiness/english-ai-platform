// Backup/restore CLI over P1-4 (06 §5.B.6). Restore always goes to a new location and is verified there;
// promote swaps it in only with --confirm, while the app and worker are stopped, keeping the old data beside it.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createBackup, promoteRestored, restoreBackup, type RestoreReport } from '../infrastructure/backup/backup.js';
import { dataPaths } from '../infrastructure/files/paths.js';
import { openStore } from '../infrastructure/sqlite/store.js';

const USAGE = `Usage: npm run backup -- <command>
  create                              online backup of var/ (DB + JSON + media) into var/backups
  restore <backup_dir> <target_dir>   restore into a NEW/empty directory and verify (does not touch var/)
  promote <target_dir> --confirm      replace var/ with a verified restore (stop server and worker first)`;

async function main(args: string[]): Promise<number> {
  const [command, a, b] = args;
  if (command === 'create') {
    const store = await openStore(dataPaths());
    try {
      const { dir, manifest } = await createBackup(store.db, store.paths, store.now);
      console.log(`Backup OK: ${dir}\n  db sha256 ${manifest.db.sha256}, ${manifest.files.length} files, ${manifest.migrations.length} migrations`);
      return 0;
    } finally { store.close(); }
  }
  if (command === 'restore' && a && b) {
    const report = restoreBackup(resolve(a), resolve(b));
    writeFileSync(`${report.root}.restore-report.json`, JSON.stringify(report, null, 2), { flag: 'wx' });
    console.log(`Restore verified at ${report.root} (${report.files} files, ${report.migrations} migrations). Not in use yet; run promote to switch.`);
    return 0;
  }
  if (command === 'promote' && a && args.includes('--confirm')) {
    const reportFile = `${resolve(a)}.restore-report.json`;
    if (!existsSync(reportFile)) throw new Error('No restore report next to target; run restore first');
    const report = JSON.parse(readFileSync(reportFile, 'utf8')) as RestoreReport;
    const { replaced } = promoteRestored(report, dataPaths().root);
    console.log(`Promoted ${report.root} → ${dataPaths().root}${replaced ? `; previous data kept at ${replaced}` : ''}`);
    return 0;
  }
  console.error(USAGE);
  return 1;
}

process.exitCode = await main(process.argv.slice(2)).catch((e: unknown) => { console.error(e instanceof Error ? e.message : String(e)); return 1; });
