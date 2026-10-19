import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
it('rolls back transactions and restores an online backup while the source stays open', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ielts-sqlite-'));
  const db = new Database(join(dir, 'source.db'));
  let restored: Database.Database | undefined;
  try {
    db.pragma('journal_mode = WAL'); db.pragma('foreign_keys = ON');
    db.exec('CREATE TABLE attempt(id TEXT PRIMARY KEY); CREATE TABLE observation(id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL REFERENCES attempt(id));');
    db.prepare('INSERT INTO attempt VALUES (?)').run('synthetic-a');
    const insert = db.prepare('INSERT INTO observation VALUES (?, ?)');
    insert.run('o1', 'synthetic-a'); insert.run('o2', 'synthetic-a');
    expect(() => db.transaction(() => { insert.run('o3', 'synthetic-a'); insert.run('o1', 'synthetic-a'); })()).toThrow();
    expect(db.prepare('SELECT COUNT(*) AS n FROM observation').get()).toEqual({ n: 2 });
    expect(() => insert.run('invalid', 'missing')).toThrow();
    await db.backup(join(dir, 'backup.db'));
    restored = new Database(join(dir, 'backup.db'), { readonly: true });
    expect(restored.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(restored.pragma('foreign_key_check')).toEqual([]);
    expect(restored.prepare('SELECT * FROM observation ORDER BY id').all()).toEqual(db.prepare('SELECT * FROM observation ORDER BY id').all());
    db.prepare('INSERT INTO attempt VALUES (?)').run('after-backup');
    expect(restored.prepare('SELECT COUNT(*) AS n FROM attempt').get()).toEqual({ n: 1 });
  } finally { restored?.close(); db.close(); rmSync(dir, { recursive: true, force: true }); }
});
