// P2 Builder/QC helpers: real SQLite in a temp dir, synthetic content, FakeAdapter limited to dry-run jobs.
import type { BuilderPipeline } from '../../src/application/qc/pipeline.js';
import { FakeAdapter, type FakeQcScript } from '../../src/infrastructure/ai/fake-adapter.js';
import { dataPaths } from '../../src/infrastructure/files/paths.js';
import { builderPipeline, openStore, type Store } from '../../src/infrastructure/sqlite/store.js';
import { processNextJob } from '../../src/worker/worker.js';
import { REQUEST, SYNTHETIC_SOURCE, UNITS, coverage } from '../fixtures/knowledge/synthetic.js';
import { clock, tempDir, type Clock } from './p1-helpers.js';

export const PKG = REQUEST.package_id;
export const CORRECT: FakeQcScript = { blindAnswers: { q1: 'FALSE', q2: 'NOT GIVEN' } };

export interface BuilderFixture { store: Store; clock: Clock; pipeline: BuilderPipeline; root: string; cleanup(): void }

export async function builderFixture(): Promise<BuilderFixture> {
  const t = tempDir('ielts-p2-');
  const c = clock();
  const store = await openStore(dataPaths(t.dir), { now: c.now });
  return { store, clock: c, pipeline: builderPipeline(store), root: t.dir, cleanup: () => { try { store.close(); } catch { /* closed */ } t.cleanup(); } };
}

/** Steps 1–3 for the synthetic package; `units` lets a test stage edited content. */
export function stage(fx: BuilderFixture, opts: { request?: Record<string, unknown>; units?: ReturnType<typeof UNITS>; source?: unknown; coverage?: unknown } = {}) {
  fx.pipeline.registerSource(opts.source ?? SYNTHETIC_SOURCE);
  const req = fx.pipeline.createRequest(opts.request ?? REQUEST);
  for (const u of opts.units ?? UNITS()) fx.pipeline.stageUnit(req.request_id, u.kind, u.value);
  fx.pipeline.setCoverage(req.request_id, opts.coverage ?? coverage());
  return req.request_id;
}

/** Runs the fake worker on dry-run jobs only, until the queue is idle. */
export async function drain(fx: BuilderFixture, adapter: FakeAdapter): Promise<number> {
  let n = 0;
  for (let i = 0; i < 20; i++) {
    const out = await processNextJob({ queue: fx.store.queue, adapter, loadContext: (id) => fx.store.learning.loadManifestPayload(id), interpret: () => [],
      owner: 'fake-worker', leaseMs: 60_000, heartbeatMs: 10_000, provider: 'fake', claimOptions: { scopes: ['dry_run'] } });
    if (out.status === 'IDLE') return n;
    n++;
  }
  throw new Error('worker did not go idle');
}

/** Full QC on a frozen version: deterministic checks, builder attestations, blind solve → verification. */
export async function qc(fx: BuilderFixture, version: string, adapter = new FakeAdapter('success', CORRECT)) {
  const checks = fx.pipeline.runChecks(PKG, version);
  const { bundle_hash } = fx.pipeline.qcStatus(PKG, version);
  fx.pipeline.attest(PKG, version, 'QC2', 'PASS', bundle_hash, 'Synthetic content checked against its own author notes');
  fx.pipeline.attest(PKG, version, 'QC3', 'PASS', bundle_hash, 'Synthetic content checked against 04 §2.B');
  fx.pipeline.startQc4(PKG, version);
  await drain(fx, adapter);
  const first = fx.pipeline.advanceQc4(PKG, version);
  await drain(fx, adapter);
  const qc4 = fx.pipeline.advanceQc4(PKG, version);
  return { checks, bundle_hash, first, qc4, adapter };
}

export const count = (fx: BuilderFixture, sql: string, ...args: unknown[]) => (fx.store.db.prepare(`SELECT COUNT(*) AS n FROM ${sql}`).get(...args) as { n: number }).n;
