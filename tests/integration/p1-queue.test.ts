import { afterEach, describe, expect, it } from 'vitest';
import type { Assessment } from '../../src/application/ai/provider-adapter.js';
import { submitForAssessment } from '../../src/application/learning/submit-for-assessment.js';
import type { ClaimedRun, ObservationDraft, RunFence } from '../../src/application/ports.js';
import { classifyEvidence } from '../../src/domain/evidence/attribution.js';
import { summarizeEvidence } from '../../src/domain/evidence/inference.js';
import { effectiveObservations } from '../../src/domain/knowledge/revocation.js';
import { FakeAdapter, type FakeScenario, type FakeStep } from '../../src/infrastructure/ai/fake-adapter.js';
import { openStore } from '../../src/infrastructure/sqlite/store.js';
import { dataPaths } from '../../src/infrastructure/files/paths.js';
import { processNextJob, type WorkerDeps } from '../../src/worker/worker.js';
import { assessInput, fixture, tempDir, type Fixture } from './p1-helpers.js';

let f: Fixture | undefined;
const cleanups: (() => void)[] = [];
afterEach(() => { f?.cleanup(); f = undefined; cleanups.splice(0).forEach((c) => c()); });

const LEASE = 60_000;
// The app (not the AI) maps a validated result to observations; synthetic fixture: two judgements per run.
const interpret: (r: Assessment, c: ClaimedRun) => ObservationDraft[] = () => [
  { observation_key: 'task.select_data', competency_id: 'c.select_data', processing: 'processed', outcome: 'met', measurement_quality: 'sufficient', opportunity: 'observed', support_impact: 'no_related_effect_detected' },
  { observation_key: 'grammar.comparison', competency_id: 'c.comparison', processing: 'processed', outcome: 'not_met', measurement_quality: 'sufficient', opportunity: 'observed', support_impact: 'no_related_effect_detected' },
];

function submitted(fx: Fixture, key = 'k1', purpose: '7A' | 'practice' = 'practice') {
  const attempt = fx.store.learning.createAttempt({ request_key: `a-${key}`, scope: 'learner', item: { id: fx.item.id, version: 'v1' }, rubric: { id: fx.rubric.id, version: 'v1' }, mode: 'self_practice', purpose });
  return { attempt, ...submitForAssessment(fx.store, assessInput(fx, attempt.attempt_id, `s-${key}`)) };
}
function deps(fx: Fixture, script: FakeScenario | FakeStep[] = 'success', owner = 'worker-A'): WorkerDeps & { adapter: FakeAdapter } {
  return { queue: fx.store.queue, adapter: new FakeAdapter(script), loadContext: (id) => fx.store.learning.loadManifestPayload(id), interpret, owner, leaseMs: LEASE, heartbeatMs: 10_000 };
}
const count = (fx: Fixture, table: string) => (fx.store.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
const fenceOf = (c: ClaimedRun): RunFence => ({ job_id: c.job_id, run_id: c.run_id, generation: c.generation, lease_owner: c.lease_owner });

describe('P1-3 submit + happy path', () => {
  it('commits submission, manifest and job together; double submit creates one job', async () => {
    f = await fixture();
    const first = submitted(f);
    const again = submitForAssessment(f.store, assessInput(f, first.attempt.attempt_id, 's-k1'));
    expect(again.job.job_id).toBe(first.job.job_id);
    expect([count(f, 'submissions'), count(f, 'ai_jobs'), count(f, 'context_manifests')]).toEqual([1, 1, 1]);
    expect(f.store.learning.loadManifestPayload(first.job.context_manifest_id)).not.toHaveProperty('answer');
    const out = await processNextJob(deps(f));
    expect(out.status).toBe('COMMITTED');
    expect(f.store.queue.get(first.job.job_id)).toMatchObject({ state: 'COMPLETED', executions_used: 1 });
    const stored = [...f.store.learning.observations('c.select_data', 'learner'), ...f.store.learning.observations('c.comparison', 'learner')];
    expect(stored).toHaveLength(2);
    expect(new Set(stored.map((o) => o.evidence_source_id))).toEqual(new Set([first.attempt.evidence_source_id]));
    expect(await processNextJob(deps(f))).toEqual({ status: 'IDLE' });
  });

  it('rolls back the whole submit when the job cannot be enqueued', async () => {
    f = await fixture();
    const attempt = f.store.learning.createAttempt({ request_key: 'a', scope: 'learner', item: { id: f.item.id, version: 'v1' }, rubric: { id: f.rubric.id, version: 'v1' }, mode: 'self_practice', purpose: 'practice' });
    expect(() => submitForAssessment(f!.store, { ...assessInput(f!, attempt.attempt_id, 's'), timeout_seconds: 999 })).toThrow(/contract/);
    expect([count(f, 'submissions'), count(f, 'snapshots'), count(f, 'context_manifests'), count(f, 'ai_jobs')]).toEqual([0, 0, 0, 0]);
    expect(f.store.learning.getAttempt(attempt.attempt_id)!.state).toBe('DRAFT');
  });
});

describe('P1-3 retry does not duplicate evidence', () => {
  it('a timeout then success stores one result and one set of observations; re-commit returns the stored result', async () => {
    f = await fixture();
    const { job } = submitted(f);
    const d = deps(f, [{ scenario: 'NETWORK' }, { scenario: 'success' }]);
    expect((await processNextJob(d)).status).toBe('RETRY_SCHEDULED');
    expect(await processNextJob(d)).toEqual({ status: 'IDLE' }); // backoff not elapsed
    f.clock.advance(31_000);
    const second = await processNextJob(d);
    expect(second.status).toBe('COMMITTED');
    expect(f.store.queue.runs(job.job_id).map((r) => [r.execution_index, r.state])).toEqual([[1, 'FAILED'], [2, 'COMPLETED']]);
    expect([count(f, 'job_results'), count(f, 'observations')]).toEqual([1, 2]);
    // A duplicated completion call (crash after commit, before response) writes nothing new.
    const run2 = f.store.queue.runs(job.job_id)[1]!;
    const replay = f.store.queue.complete({ job_id: job.job_id, run_id: run2.run_id, generation: run2.generation, lease_owner: 'worker-A' }, {}, interpret({} as Assessment, {} as ClaimedRun));
    expect(replay.status).toBe('ALREADY_COMMITTED');
    expect(count(f, 'observations')).toBe(2);
  });

  it('a re-evaluation adds linked observations on the same source without a new independent source', async () => {
    f = await fixture();
    const { submission, attempt } = submitted(f, 'k1', '7A');
    await processNextJob(deps(f));
    const old = f.store.learning.observations('c.comparison', 'learner')[0]!;
    // Bug-fix re-evaluation of the same original submission (04 §4.A): new job key, observation supersedes the old one.
    f.store.queue.enqueue({ ...f.store.queue.get(f.store.db.prepare('SELECT job_id FROM ai_jobs').pluck().get() as string)!, idempotency_key: `${submission.submission_id}:reeval:1` });
    const reeval = deps(f);
    reeval.interpret = () => [{ observation_key: 'grammar.comparison', competency_id: 'c.comparison', supersedes_id: old.observation_id, processing: 'processed', outcome: 'met', measurement_quality: 'sufficient', opportunity: 'observed', support_impact: 'no_related_effect_detected' }];
    expect((await processNextJob(reeval)).status).toBe('COMMITTED');
    const all = f.store.learning.observations('c.comparison', 'learner');
    expect(all).toHaveLength(2); // history kept
    const { effective } = effectiveObservations(all, f.store.knowledge.revocations());
    expect(effective.map((o) => o.supersedes_id)).toEqual([old.observation_id]);
    const classified = effective.map((o) => ({ observation: o, use: classifyEvidence({ observation: o, submission: { kind: 'original', created_at: submission.created_at }, attempt: { mode: attempt.mode, purpose: attempt.purpose }, assistance: [], novelty: 'novel' }).use }));
    const summary = summarizeEvidence('c.comparison', classified);
    expect(summary).toMatchObject({ independent_sources_met: 1, independent_sources_not_met: 0, sources_by_use: { independent_candidate: 1 } });
    expect(summary.sources).toHaveLength(1);
  });
});

describe('P1-3 fencing: late, stale and cancelled results never commit', () => {
  it('rejects a result that arrives after its lease expired and another generation took over', async () => {
    f = await fixture();
    const { job } = submitted(f);
    const a = f.store.queue.claim('worker-A', LEASE, 'fake')!;
    f.clock.advance(LEASE + 1);
    expect(f.store.queue.recoverExpired()).toEqual([{ job_id: job.job_id, to: 'QUEUED' }]);
    const b = f.store.queue.claim('worker-B', LEASE, 'fake')!;
    // Generation moves on both revocation of the old grant and the new grant (P0_DATA_AND_STATE).
    expect(b.generation).toBe(a.generation + 2);
    expect(f.store.queue.recordOutput(fenceOf(a), { late: true })).toEqual({ accepted: false, reason: 'STALE_GENERATION' });
    expect(f.store.queue.fail(fenceOf(a), 'NETWORK')).toEqual({ accepted: false, reason: 'STALE_GENERATION' });
    expect(f.store.queue.heartbeat(fenceOf(a), LEASE)).toBe(false);
    expect(f.store.queue.recordOutput(fenceOf(b), { ok: true })).toEqual({ accepted: true });
    expect(f.store.queue.complete(fenceOf(a), {}, interpret({} as Assessment, a))).toEqual({ status: 'REJECTED', reason: 'STALE_GENERATION' });
    expect(count(f, 'observations')).toBe(0);
    expect(f.store.queue.complete(fenceOf(b), { ok: true }, interpret({} as Assessment, b)).status).toBe('COMMITTED');
    expect(f.store.queue.runs(job.job_id).map((r) => r.state)).toEqual(['STALE', 'COMPLETED']);
  });

  it('rejects commit once the lease has expired even before recovery runs', async () => {
    f = await fixture();
    submitted(f);
    const a = f.store.queue.claim('worker-A', LEASE, 'fake')!;
    f.store.queue.recordOutput(fenceOf(a), {});
    f.clock.advance(LEASE);
    expect(f.store.queue.complete(fenceOf(a), {}, interpret({} as Assessment, a))).toEqual({ status: 'REJECTED', reason: 'LEASE_EXPIRED' });
    expect(count(f, 'job_results')).toBe(0);
  });

  it('cancel during a running provider call drops the result', async () => {
    f = await fixture();
    const { job } = submitted(f);
    const d = deps(f, [{ scenario: 'success', delayMs: 300 }]);
    const pending = processNextJob(d);
    await new Promise((r) => setTimeout(r, 50));
    expect(f.store.queue.cancel(job.job_id, 'user cancelled')).toEqual({ cancelled: true, state: 'CANCELLED' });
    expect((await pending).status).toBe('ABANDONED');
    expect(f.store.queue.get(job.job_id)!.state).toBe('CANCELLED');
    expect(f.store.queue.runs(job.job_id)[0]!.state).toBe('CANCELLED');
    expect([count(f, 'job_results'), count(f, 'observations')]).toEqual([0, 0]);
    expect(f.store.queue.cancel(job.job_id, 'again')).toEqual({ cancelled: false, state: 'CANCELLED' });
  });

  it('a provider that outlives the job timeout is cancelled and retried within budget', async () => {
    f = await fixture();
    const attempt = f.store.learning.createAttempt({ request_key: 'a', scope: 'learner', item: { id: f.item.id, version: 'v1' }, rubric: { id: f.rubric.id, version: 'v1' }, mode: 'self_practice', purpose: 'practice' });
    const { job } = submitForAssessment(f.store, { ...assessInput(f, attempt.attempt_id, 's'), timeout_seconds: 1 });
    const d = deps(f, [{ scenario: 'success', delayMs: 5_000 }, { scenario: 'success' }]);
    const started = Date.now();
    expect((await processNextJob(d)).status).toBe('RETRY_SCHEDULED');
    expect(Date.now() - started).toBeLessThan(4_000);
    expect(f.store.queue.get(job.job_id)).toMatchObject({ state: 'QUEUED', executions_used: 1, last_error: expect.stringMatching(/^TIMEOUT/) });
    f.clock.advance(31_000);
    expect((await processNextJob(d)).status).toBe('COMMITTED');
  });
});

describe('P1-3 restart recovery', () => {
  it('a new process recovers the expired lease of a crashed worker and finishes the job once', async () => {
    const t = tempDir(); cleanups.push(t.cleanup);
    f = await fixture({ root: t.dir });
    const { job } = submitted(f);
    const crashed = f.store.queue.claim('worker-crashed', LEASE, 'fake')!;
    f.store.close(); // process dies mid-run: no commit, no cleanup
    f.clock.advance(LEASE + 1);
    const store = await openStore(dataPaths(t.dir), { now: f.clock.now });
    try {
      const fx = { ...f, store };
      expect(store.queue.get(job.job_id)!.state).toBe('RUNNING');
      expect((await processNextJob(deps(fx, 'success', 'worker-restarted'))).status).toBe('COMMITTED');
      expect(store.queue.get(job.job_id)).toMatchObject({ state: 'COMPLETED', executions_used: 2 });
      expect(store.queue.runs(job.job_id).map((r) => r.state)).toEqual(['STALE', 'COMPLETED']);
      expect(store.queue.complete(fenceOf(crashed), {}, [])).toMatchObject({ status: 'ALREADY_COMMITTED' });
      expect(count(fx, 'observations')).toBe(2);
    } finally { store.close(); }
  });
});

describe('P1-3 budgets and single-job concurrency', () => {
  it('runs one AI job at a time', async () => {
    f = await fixture();
    submitted(f, 'k1'); submitted(f, 'k2');
    expect(f.store.queue.claim('worker-A', LEASE, 'fake')).not.toBeNull();
    expect(f.store.queue.claim('worker-B', LEASE, 'fake')).toBeNull();
  });

  it('stops at 3 executions and the DB refuses to reset the budget', async () => {
    f = await fixture();
    const { job } = submitted(f);
    const d = deps(f, 'NETWORK');
    for (let i = 0; i < 3; i += 1) { await processNextJob(d); f.clock.advance(120_000); }
    expect(await processNextJob(d)).toEqual({ status: 'IDLE' });
    expect(f.store.queue.get(job.job_id)).toMatchObject({ state: 'FAILED', executions_used: 3, last_error: 'NETWORK_BUDGET_EXHAUSTED: provider result' });
    expect(d.adapter.executed).toHaveLength(3);
    expect(() => f!.store.db.prepare("UPDATE ai_jobs SET executions_used = 0 WHERE job_id = ?").run(job.job_id)).toThrow(/backwards/);
    expect(() => f!.store.db.prepare("UPDATE ai_jobs SET state = 'QUEUED' WHERE job_id = ?").run(job.job_id)).toThrow(/backwards/);
    expect(() => f!.store.db.prepare("INSERT INTO ai_runs (run_id, job_id, generation, execution_index, purpose, lease_owner, lease_expires_at, state, provider, started_at) VALUES ('x', ?, 99, 4, 'execute', 'w', 'z', 'RUNNING', 'fake', 'z')").run(job.job_id)).toThrow(/CHECK/);
  });

  it('allows exactly one format repair inside the 3-execution ceiling', async () => {
    f = await fixture();
    const { job } = submitted(f);
    const d = deps(f, ['malformed', 'malformed', 'success'].map((scenario) => ({ scenario: scenario as FakeScenario })));
    expect((await processNextJob(d)).status).toBe('RETRY_SCHEDULED');
    expect((await processNextJob(d)).status).toBe('STOPPED');
    expect(f.store.queue.get(job.job_id)).toMatchObject({ state: 'NEEDS_REVIEW', executions_used: 2, format_repairs_used: 1 });
    expect(f.store.queue.runs(job.job_id).map((r) => r.purpose)).toEqual(['execute', 'format_repair']);
    expect(await processNextJob(d)).toEqual({ status: 'IDLE' });
  });

  it('caps workflow fix/regenerate rounds at 2 without resetting', async () => {
    f = await fixture();
    const { job, attempt } = submitted(f);
    const wf = f.store.queue.createWorkflow('task.generate', attempt.attempt_id, 'learner');
    const spec = (n: number) => ({ ...job, idempotency_key: `regen-${n}` });
    expect(f.store.queue.enqueueRegeneration(wf, spec(1))).toMatchObject({ ok: true, round: 1 });
    expect(f.store.queue.enqueueRegeneration(wf, spec(1))).toMatchObject({ ok: true, round: 1 }); // idempotent replay
    expect(f.store.queue.enqueueRegeneration(wf, spec(2))).toMatchObject({ ok: true, round: 2 });
    expect(f.store.queue.enqueueRegeneration(wf, spec(3))).toEqual({ ok: false, reason: 'WORKFLOW_BUDGET_EXHAUSTED' });
    expect(() => f!.store.db.prepare('UPDATE workflows SET regen_rounds_used = 0').run()).toThrow(/reset/);
  });

  it('waits on quota without resetting the budget and resumes only on request', async () => {
    f = await fixture();
    const { job } = submitted(f);
    const d = deps(f, ['QUOTA_EXHAUSTED', 'success'].map((scenario) => ({ scenario: scenario as FakeScenario })));
    expect((await processNextJob(d)).status).toBe('STOPPED');
    expect(f.store.queue.get(job.job_id)).toMatchObject({ state: 'WAITING_QUOTA', executions_used: 1 });
    expect(await processNextJob(d)).toEqual({ status: 'IDLE' });
    expect(f.store.queue.resumeWaiting(job.job_id)).toBe('QUEUED');
    expect((await processNextJob(d)).status).toBe('COMMITTED');
    expect(f.store.queue.get(job.job_id)!.executions_used).toBe(2);
  });
});

describe('P1-3 revocation between enqueue and commit', () => {
  it('does not recognise evidence from a rubric revoked while the AI was running', async () => {
    f = await fixture();
    const { job } = submitted(f);
    const a = f.store.queue.claim('worker-A', LEASE, 'fake')!;
    f.store.queue.recordOutput(fenceOf(a), {});
    f.store.knowledge.revoke({ target_kind: 'rubric', target_id: f.rubric.id, target_version: 'v1' }, 'synthetic rubric bug');
    expect(f.store.queue.complete(fenceOf(a), {}, interpret({} as Assessment, a))).toEqual({ status: 'REJECTED', reason: 'DEPENDENCY_REVOKED' });
    expect(f.store.queue.get(job.job_id)!.state).toBe('NEEDS_REVIEW');
    expect([count(f, 'observations'), count(f, 'submissions')]).toEqual([0, 1]);
  });

  it('limits AI-proposed outcomes when the signal is not sufficient', async () => {
    f = await fixture();
    submitted(f);
    const d = deps(f);
    d.interpret = () => [{ observation_key: 'pron.final_s', competency_id: 'c.final_s', processing: 'processed', outcome: 'not_met', measurement_quality: 'insufficient', opportunity: 'observed', support_impact: 'unknown' }];
    expect((await processNextJob(d)).status).toBe('COMMITTED');
    expect(f.store.learning.observations('c.final_s', 'learner')[0]).toMatchObject({ outcome: 'inconclusive', measurement_quality: 'insufficient' });
  });
});
