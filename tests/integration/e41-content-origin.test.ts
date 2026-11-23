// E-41 (D-05 N10): content origins 'ai_authored' and 'learner_owned'; G0 excludes only fixture/unknown origin or FakeAdapter.
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { dataClassesFor } from '../../src/application/ai/subscription-guard.js';
import { CONTENT_ORIGINS, isContentOrigin, isSyntheticEvidence } from '../../src/domain/knowledge/content-origin.js';
import { openDatabase } from '../../src/infrastructure/sqlite/database.js';
import { tempDir } from './p1-helpers.js';

const cleanups: (() => void)[] = [];
afterEach(() => { while (cleanups.length) cleanups.pop()!(); });
const H = 'a'.repeat(64);

describe('E-41 content origin', () => {
  it('G0: only real-provider evidence on sourced / ai_authored / learner_owned content counts', () => {
    expect(CONTENT_ORIGINS).toEqual(['synthetic_fixture', 'sourced', 'ai_authored', 'learner_owned']);
    for (const o of ['sourced', 'ai_authored', 'learner_owned'] as const) {
      expect(isSyntheticEvidence(o, 'claude-code')).toBe(false);
      expect(isSyntheticEvidence(o, 'fake')).toBe(true);
      expect(isSyntheticEvidence(o, null)).toBe(true);
    }
    expect(isSyntheticEvidence('synthetic_fixture', 'claude-code')).toBe(true);
    expect(isSyntheticEvidence(null, 'claude-code')).toBe(true); // content not released through the pipeline
    expect([isContentOrigin('ai_authored'), isContentOrigin('own_synthetic'), isContentOrigin(1)]).toEqual([true, false, false]);
  });

  it('imported learner material needs the learner_submission consent, not only knowledge_content', () => {
    expect(dataClassesFor({ role: 'assessor', scope: 'dry_run', content_origin: 'learner_owned' })).toEqual(['learner_owned_content']); // E-51: its own consent class
    expect(dataClassesFor({ role: 'assessor', scope: 'learner', content_origin: 'learner_owned' })).toEqual(['learner_owned_content', 'learner_submission']);
    expect(dataClassesFor({ role: 'assessor', scope: 'dry_run', content_origin: 'ai_authored' })).toEqual(['knowledge_content']);
  });

  it('migration 0014 keeps existing rows, child references and append-only triggers, and accepts the new origins', async () => {
    const t = tempDir(); cleanups.push(t.cleanup);
    const dir = join(t.dir, 'migrations'); mkdirSync(dir);
    for (const f of readdirSync('migrations').filter((f) => f < '0014')) copyFileSync(join('migrations', f), join(dir, f));
    const file = join(t.dir, 'u.db');
    const old = await openDatabase(file, { migrationsDir: dir });
    old.prepare("INSERT INTO package_requests VALUES ('r1', 'p1', 'sourced', ?, '{}', 't')").run(H);
    old.prepare("INSERT INTO pipeline_events VALUES ('e1', 'r1', NULL, 1, 'started', 'x', NULL, 't')").run();
    expect(() => old.prepare("INSERT INTO package_requests VALUES ('r2', 'p1', 'ai_authored', ?, '{}', 't')").run(H)).toThrow(/CHECK/);
    old.close();

    const db = await openDatabase(file); // full migrations directory: applies 0014
    try {
      expect((db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number }).v).toBeGreaterThanOrEqual(14);
      expect(db.prepare("SELECT request_id, content_origin FROM package_requests").all()).toEqual([{ request_id: 'r1', content_origin: 'sourced' }]);
      const ddl = (db.prepare("SELECT group_concat(sql, ' ') AS s FROM sqlite_master").get() as { s: string }).s;
      expect(ddl).not.toMatch(/_pre_0014/);
      expect(db.pragma('foreign_key_check')).toEqual([]);
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
      db.prepare("INSERT INTO package_requests VALUES ('r2', 'p1', 'ai_authored', ?, '{}', 't')").run(H);
      db.prepare("INSERT INTO package_requests VALUES ('r3', 'p1', 'learner_owned', ?, '{}', 't')").run(H);
      expect(() => db.prepare("INSERT INTO package_requests VALUES ('r4', 'p1', 'own_synthetic', ?, '{}', 't')").run(H)).toThrow(/CHECK/);
      expect(() => db.prepare("UPDATE package_requests SET content_origin = 'ai_authored' WHERE request_id = 'r1'").run()).toThrow(/immutable/);
      expect(() => db.prepare("INSERT INTO pipeline_events VALUES ('e2', 'missing', NULL, 1, 'started', 'x', NULL, 't')").run()).toThrow(/FOREIGN KEY/);
    } finally { db.close(); }
  });
});
