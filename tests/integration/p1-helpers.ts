// Synthetic P1 fixtures on a real SQLite file in a temporary directory. No learner data.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dataPaths } from '../../src/infrastructure/files/paths.js';
import { openStore, type Store } from '../../src/infrastructure/sqlite/store.js';
import type { JsonRef } from '../../src/infrastructure/files/json-store.js';

export interface Clock { now: () => Date; advance(ms: number): void }
export function clock(start = '2026-10-20T00:00:00.000Z'): Clock {
  let t = Date.parse(start);
  return { now: () => new Date(t), advance: (ms) => { t += ms; } };
}

export function tempDir(prefix = 'ielts-p1-'): { dir: string; cleanup(): void } {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export interface Fixture { store: Store; clock: Clock; root: string; item: JsonRef; rubric: JsonRef; pkg: JsonRef; cleanup(): void }

/** Seeds one synthetic package with one item and one rubric; activates it unless `active` is false. */
export async function fixture(options: { root?: string; active?: boolean; clock?: Clock; migrationsDir?: string } = {}): Promise<Fixture> {
  const tmp = options.root ? undefined : tempDir();
  const root = options.root ?? tmp!.dir;
  const c = options.clock ?? clock();
  const store = await openStore(dataPaths(root), { now: c.now, migrationsDir: options.migrationsDir });
  const item = store.json.put('item', 'synthetic-item-1', 'v1', { synthetic: true, prompt: 'Synthetic writing prompt', answer: 'synthetic-secret' });
  const rubric = store.json.put('rubric', 'synthetic-rubric', 'v1', { synthetic: true, criteria: ['synthetic'] });
  const pkg = store.json.put('package', 'synthetic-pkg', 'v1', { synthetic: true, items: [item.id] });
  store.knowledge.registerPackage(pkg, 'unknown', 'qc-synthetic-0', [rubric], [{ ref: item, item_family_id: 'family-1', shared_stimulus_id: null, media_ids: [] }]);
  if (options.active !== false) store.knowledge.transition(pkg.id, pkg.version, 'active', 'synthetic fixture', pkg.hash);
  return { store, clock: c, root, item, rubric, pkg, cleanup: () => { try { store.close(); } catch { /* already closed */ } tmp?.cleanup(); } };
}

export const assessInput = (f: Fixture, attemptId: string, key: string, content = 'Synthetic essay text.') => ({
  request_key: key, attempt_id: attemptId, content, rubric: { id: f.rubric.id, version: f.rubric.version, hash: f.rubric.hash },
  task_type: 'writing.assess' as const, required_capabilities: ['text' as const, 'structured_result' as const],
  eligible_providers: ['codex' as const], timeout_seconds: 60, policy_version: 'context-policy-synthetic',
});
