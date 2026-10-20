import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export type Db = Database.Database;
export interface Migration { version: number; name: string; sql: string; checksum: string }

// Run from the repository root (same convention as contracts/). Files: NNNN_name.sql, applied in order.
export function loadMigrations(dir = resolve('migrations')): Migration[] {
  const migrations = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().map((file) => {
    const match = /^(\d{4})_([a-z0-9_]+)\.sql$/.exec(file);
    if (!match) throw new Error(`Invalid migration file name: ${file}`);
    // Normalise line endings so a CRLF checkout does not look like an edited migration.
    const sql = readFileSync(join(dir, file), 'utf8').replace(/\r\n/g, '\n');
    return { version: Number(match[1]), name: match[2]!, sql, checksum: createHash('sha256').update(sql).digest('hex') };
  });
  migrations.forEach((m, i) => { if (m.version !== i + 1) throw new Error(`Migration sequence gap at ${m.version}`); });
  return migrations;
}

export interface OpenOptions {
  migrationsDir?: string;
  /** Called with the open DB before pending migrations touch an already-initialised database. */
  beforeMigrate?: (db: Db, pending: Migration[]) => Promise<void> | void;
  now?: () => Date;
}

export function openRaw(path: string, readonly = false): Db {
  const db = new Database(path, { readonly, fileMustExist: readonly });
  if (!readonly) db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  return db;
}

export async function openDatabase(path: string, options: OpenOptions = {}): Promise<Db> {
  const db = openRaw(path);
  try {
    await migrate(db, options);
    return db;
  } catch (error) { db.close(); throw error; }
}

export function appliedMigrations(db: Db): { version: number; name: string; checksum: string }[] {
  const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get();
  if (!exists) return [];
  return db.prepare('SELECT version, name, checksum FROM schema_migrations ORDER BY version').all() as { version: number; name: string; checksum: string }[];
}

/** Rejects edited or unknown applied migrations; applies each pending file in its own transaction. */
export async function migrate(db: Db, options: OpenOptions = {}): Promise<number[]> {
  const migrations = loadMigrations(options.migrationsDir);
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)');
  const applied = appliedMigrations(db);
  for (const a of applied) {
    const known = migrations.find((m) => m.version === a.version);
    if (!known) throw new Error(`Database has migration ${a.version} unknown to this code; refusing to open`);
    if (known.checksum !== a.checksum) throw new Error(`Applied migration ${a.version} was modified; add a new migration instead`);
  }
  const pending = migrations.filter((m) => m.version > applied.length);
  if (pending.length === 0) return [];
  if (applied.length > 0 && options.beforeMigrate) await options.beforeMigrate(db, pending);
  const now = options.now ?? (() => new Date());
  for (const m of pending) {
    db.transaction(() => {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)').run(m.version, m.name, m.checksum, now().toISOString());
    }).immediate();
  }
  return pending.map((m) => m.version);
}
