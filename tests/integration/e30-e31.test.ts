// E-30 (backup pruning) and E-31 (worker waits for quota), both decided by the user on 18/11/2026.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createBackup } from '../../src/infrastructure/backup/backup.js';
import { restoreDrill } from '../../src/infrastructure/backup/drill.js';
import { pruneBackups } from '../../src/infrastructure/backup/prune.js';
import { quotaWaitable, waitForProvider } from '../../src/worker/worker.js';
import { fixture, type Fixture } from './p1-helpers.js';

let f: Fixture | undefined;
afterEach(() => { f?.cleanup(); f = undefined; });

describe('E-30 backup pruning', () => {
  it('keeps the newest N and the last passed drill; never touches non-standard folders; logs removals', async () => {
    f = await fixture();
    const made: string[] = [];
    for (let i = 0; i < 5; i++) { made.push((await createBackup(f.store.db, f.store.paths, f.clock.now)).dir); f.clock.advance(60_000); }
    // The oldest backup passed a drill: it must survive even though it is beyond the limit.
    expect((await restoreDrill(made[0]!, f.store.paths)).ok).toBe(true);
    const handMade = join(f.store.paths.backups, 'pre-m8-repair-manual');
    mkdirSync(handMade); writeFileSync(join(handMade, 'study.db'), 'x');
    const partial = join(f.store.paths.backups, 'x.partial');
    mkdirSync(partial);

    const r = pruneBackups(f.store.paths, { keep: 2, now: f.clock.now });
    expect(r.kept.sort()).toEqual([made[0], made[3], made[4]].sort());
    expect(r.removed.sort()).toEqual([made[1], made[2]].sort());
    for (const d of r.removed) expect(existsSync(d)).toBe(false);
    for (const d of [...r.kept, handMade, partial]) expect(existsSync(d)).toBe(true);
    expect(readFileSync(join(f.store.paths.backups, 'prune-log.jsonl'), 'utf8').trim().split('\n')).toHaveLength(2);
    // Idempotent; learner data untouched.
    expect(pruneBackups(f.store.paths, { keep: 2 }).removed).toEqual([]);
    expect(() => pruneBackups(f!.store.paths, { keep: 0 })).toThrow();
  });
});

describe('E-31 worker waits for quota', () => {
  const q = (provider: string, reasons: string[], ready = false) => ({ provider, ready, reasons });
  it('waits only when a provider is blocked by quota alone', () => {
    expect(quotaWaitable([q('codex', ['PROFILE_QUOTA_EXHAUSTED']), q('agy', ['NO_D01_EVIDENCE'])])).toBe(true);
    expect(quotaWaitable([q('codex', ['PROFILE_COOLDOWN'])])).toBe(true);
    expect(quotaWaitable([q('codex', ['PROFILE_QUOTA_EXHAUSTED', 'EXTRA_USAGE_CONFIRMATION_EXPIRED'])])).toBe(false);
    expect(quotaWaitable([q('codex', ['NO_D01_EVIDENCE'])])).toBe(false);
    expect(quotaWaitable([q('codex', [], true)])).toBe(false);
    expect(quotaWaitable([])).toBe(false);
  });

  it('returns once a provider reopens; stops waiting when the reason changes or the worker is stopped', async () => {
    const sleeps: number[] = [];
    const sleep = async (ms: number) => { sleeps.push(ms); };
    const seq = [[q('codex', ['PROFILE_QUOTA_EXHAUSTED'])], [q('codex', ['PROFILE_QUOTA_EXHAUSTED'])], [q('codex', [], true)]];
    let i = 0;
    const waits: number[] = [];
    const ok = await waitForProvider(async () => seq[Math.min(i++, seq.length - 1)]!, { intervalMs: 1000, signal: new AbortController().signal, sleep, onWait: () => waits.push(i) });
    expect(ok?.[0]?.ready).toBe(true);
    expect(sleeps).toEqual([1000, 1000]);
    expect(waits).toHaveLength(2);

    const changed = [[q('codex', ['PROFILE_QUOTA_EXHAUSTED'])], [q('codex', ['NEEDS_LOGIN'])]];
    let j = 0;
    expect(await waitForProvider(async () => changed[j++]!, { intervalMs: 1, signal: new AbortController().signal, sleep })).toBeNull();

    const stop = new AbortController();
    const stopped = await waitForProvider(async () => [q('codex', ['PROFILE_COOLDOWN'])], { intervalMs: 1, signal: stop.signal, sleep: async () => { stop.abort(); } });
    expect(stopped).toBeNull();
  });
});
