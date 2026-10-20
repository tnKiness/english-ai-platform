import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { dataPaths, resolveContained, sha256, type DataPaths } from '../files/paths.js';
import { appliedMigrations, loadMigrations, openRaw, type Db } from '../sqlite/database.js';

export class BackupError extends Error {}

type StoreName = 'knowledge' | 'media';
export interface BackupManifest {
  format: 'study-english-backup';
  format_version: 1;
  created_at: string;
  migrations: { version: number; checksum: string }[];
  db: { path: 'db/study.db'; sha256: string; bytes: number };
  files: { store: StoreName; rel_path: string; sha256: string; bytes: number }[];
}

function inventory(db: Db): BackupManifest['files'] {
  const json = db.prepare('SELECT rel_path, content_hash AS sha256, bytes FROM json_objects ORDER BY rel_path').all() as { rel_path: string; sha256: string; bytes: number }[];
  const media = db.prepare('SELECT rel_path, sha256, bytes FROM media_assets ORDER BY rel_path').all() as { rel_path: string; sha256: string; bytes: number }[];
  return [...json.map((f) => ({ store: 'knowledge' as const, ...f })), ...media.map((f) => ({ store: 'media' as const, ...f }))];
}

function copyVerified(from: string, to: string, expected: string): number {
  const data = readFileSync(from);
  if (sha256(data) !== expected) throw new BackupError(`Checksum mismatch: ${from}`);
  mkdirSync(dirname(to), { recursive: true });
  writeFileSync(to, data, { flag: 'wx' });
  return data.byteLength;
}

/**
 * Coordinated backup (06 §5.B.6, QUALITY_AND_DATA): SQLite Online Backup API first, then the JSON/media files
 * that this DB snapshot references, each checksum-verified. JSON and media stores are append-only and
 * content-addressed, so files referenced by the snapshot cannot change or disappear while copying. The backup
 * becomes visible (renamed from .partial) only after every file verified; any failure leaves no backup.
 */
export async function createBackup(db: Db, paths: DataPaths, now: () => Date = () => new Date()): Promise<{ dir: string; manifest: BackupManifest }> {
  const createdAt = now().toISOString();
  const name = `${createdAt.replace(/[:.]/g, '-')}-${randomBytes(3).toString('hex')}`;
  const partial = join(paths.backups, `${name}.partial`);
  const final = join(paths.backups, name);
  mkdirSync(join(partial, 'db'), { recursive: true });
  try {
    const dbFile = join(partial, 'db', 'study.db');
    await db.backup(dbFile);
    const snapshot = openRaw(dbFile, true);
    let files: BackupManifest['files'];
    let migrations: BackupManifest['migrations'];
    try {
      if (snapshot.pragma('integrity_check', { simple: true }) !== 'ok') throw new BackupError('Snapshot integrity_check failed');
      files = inventory(snapshot);
      migrations = appliedMigrations(snapshot).map(({ version, checksum }) => ({ version, checksum }));
    } finally { snapshot.close(); }
    for (const f of files) {
      const root = f.store === 'knowledge' ? paths.knowledge : paths.media;
      const bytes = copyVerified(resolveContained(root, f.rel_path, true), resolveContained(join(partial, f.store), f.rel_path), f.sha256);
      if (bytes !== f.bytes) throw new BackupError(`Size mismatch: ${f.store}/${f.rel_path}`);
    }
    const dbData = readFileSync(dbFile);
    const manifest: BackupManifest = { format: 'study-english-backup', format_version: 1, created_at: createdAt, migrations,
      db: { path: 'db/study.db', sha256: sha256(dbData), bytes: dbData.byteLength }, files };
    writeFileSync(join(partial, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx' });
    renameSync(partial, final);
    return { dir: final, manifest };
  } catch (error) {
    rmSync(partial, { recursive: true, force: true });
    throw error;
  }
}

export interface RestoreReport { root: string; db_sha256: string; files: number; migrations: number }

/**
 * Restore into a separate, empty location and verify before anything uses it: manifest checksums, SQLite
 * integrity_check and foreign_key_check, migrations known to this code, and DB ↔ file inventory agreement.
 */
export function restoreBackup(backupDir: string, targetRoot: string, migrationsDir?: string): RestoreReport {
  if (existsSync(targetRoot) && readdirSync(targetRoot).length > 0) throw new BackupError('Restore target must be a new or empty directory');
  const manifest = JSON.parse(readFileSync(join(backupDir, 'manifest.json'), 'utf8')) as BackupManifest;
  if (manifest.format !== 'study-english-backup' || manifest.format_version !== 1) throw new BackupError('Unknown backup format');
  const staging = `${targetRoot}.restoring-${randomBytes(3).toString('hex')}`;
  const target = dataPaths(staging);
  try {
    copyVerified(join(backupDir, manifest.db.path), target.db, manifest.db.sha256);
    for (const f of manifest.files) {
      copyVerified(resolveContained(join(backupDir, f.store), f.rel_path, true), resolveContained(f.store === 'knowledge' ? target.knowledge : target.media, f.rel_path), f.sha256);
    }
    const db = openRaw(target.db, true);
    try {
      if (db.pragma('integrity_check', { simple: true }) !== 'ok') throw new BackupError('Restored DB integrity_check failed');
      if ((db.pragma('foreign_key_check') as unknown[]).length > 0) throw new BackupError('Restored DB has foreign key violations');
      const known = loadMigrations(migrationsDir);
      for (const m of appliedMigrations(db)) {
        if (known.find((k) => k.version === m.version)?.checksum !== m.checksum) throw new BackupError(`Restored migration ${m.version} unknown or modified`);
      }
      const expected = new Map(manifest.files.map((f) => [`${f.store}/${f.rel_path}`, f.sha256]));
      const actual = inventory(db);
      if (actual.length !== expected.size || actual.some((f) => expected.get(`${f.store}/${f.rel_path}`) !== f.sha256)) throw new BackupError('DB inventory and backup files disagree');
    } finally { db.close(); }
    mkdirSync(dirname(targetRoot), { recursive: true });
    if (existsSync(targetRoot)) rmSync(targetRoot, { recursive: true });
    renameSync(staging, targetRoot);
    return { root: targetRoot, db_sha256: manifest.db.sha256, files: manifest.files.length, migrations: manifest.migrations.length };
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

/**
 * Switch a verified restore into use. The application must be stopped (DB closed). The data being replaced is
 * kept beside it, never deleted.
 */
export function promoteRestored(report: RestoreReport, liveRoot: string, now: () => Date = () => new Date()): { replaced: string | null } {
  const db = readFileSync(dataPaths(report.root).db);
  if (sha256(db) !== report.db_sha256) throw new BackupError('Verified restore changed after verification');
  let replaced: string | null = null;
  if (existsSync(liveRoot) && statSync(liveRoot).isDirectory()) {
    replaced = `${liveRoot}.replaced-${now().toISOString().replace(/[:.]/g, '-')}`;
    renameSync(liveRoot, replaced);
  }
  renameSync(report.root, liveRoot);
  return { replaced };
}
