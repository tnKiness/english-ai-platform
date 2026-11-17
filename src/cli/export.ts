// Learner data export and storage report (P5-3, E-28). Read-only: never deletes or changes data.
import { resolve } from 'node:path';
import { exportLearnerData, storageUsage, unsafeExportParent } from '../infrastructure/export/learner-export.js';
import { dataPaths } from '../infrastructure/files/paths.js';
import { openStore } from '../infrastructure/sqlite/store.js';

const USAGE = `Usage: npm run export -- <command>
  create [--out <parent_dir>]   export your learning data (JSON + your audio + manifest with SHA-256) into var/exports
                                or <parent_dir>; refuses a folder inside the repository but outside var/
  usage                         disk space used under var/, free space, largest tables (nothing is deleted)`;

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

async function main(args: string[]): Promise<number> {
  const [command] = args;
  if (command !== 'create' && command !== 'usage') { console.log(USAGE); return command ? 1 : 0; }
  const store = await openStore(dataPaths());
  try {
    if (command === 'usage') {
      const u = storageUsage(store.db, store.paths);
      console.log(`Dữ liệu ở ${u.root}: ${mb(u.total_bytes)}`);
      for (const [area, bytes] of Object.entries(u.areas).sort((a, b) => b[1] - a[1])) console.log(`  ${area.padEnd(12)} ${mb(bytes)}`);
      console.log(`Ổ đĩa: còn trống ${mb(u.disk.free_bytes)} / ${mb(u.disk.total_bytes)}`);
      console.log(`Bảng nhiều dòng nhất: ${u.largest_tables.map((t) => `${t.table} ${t.rows}`).join(', ')}`);
      console.log(u.retention.note);
      return 0;
    }
    const i = args.indexOf('--out');
    const parent = i >= 0 ? args[i + 1] : undefined;
    if (i >= 0 && !parent) throw new Error('--out cần một thư mục');
    if (parent && unsafeExportParent(parent, resolve('.'), store.paths.root)) throw new Error('Không xuất vào thư mục trong repository (ngoài var/): dữ liệu cá nhân có thể bị commit nhầm.');
    const { dir, manifest } = exportLearnerData(store.db, store.paths, { parentDir: parent, now: store.now });
    const rows = Object.values(manifest.tables).reduce((s, t) => s + t.rows, 0);
    console.log(`Đã xuất: ${dir}\n  ${Object.keys(manifest.tables).length} bảng, ${rows} dòng, ${manifest.media.length} bản thu âm. Giữ thư mục này riêng tư.`);
    return 0;
  } finally { store.close(); }
}

main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1;
});
