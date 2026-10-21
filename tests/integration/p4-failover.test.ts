import { resolve, join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type { CliProvider } from '../../src/application/ai/subscription-guard.js';
import { submitForAssessment } from '../../src/application/learning/submit-for-assessment.js';
import { AiExecutionGateway, GatewayAdapter, type GatewayJob } from '../../src/infrastructure/ai/gateway/gateway.js';
import type { ExecutionPermit } from '../../src/infrastructure/ai/gateway/cli-adapters.js';
import { processNextJob } from '../../src/worker/worker.js';
import { fixture, assessInput, type Fixture } from './p1-helpers.js';
let f: Fixture | undefined;
afterEach(() => { f?.cleanup(); f = undefined; vi.restoreAllMocks(); });

async function setup(errors: string[], benchmark = true, unverified = false) {
  f = await fixture();
  const fx = f;
  const providers: CliProvider[] = ['codex', 'claude-code', 'agy'];
  const gw = new AiExecutionGateway({ evidence: () => undefined, account: () => undefined, consents: () => new Set(), parentEnv: {},
    roots: { repo: join(f.root, 'repo'), data: f.root, sandboxRoot: join(f.root, 'sandbox') }, now: f.clock.now,
    backupAllowed: () => ({ allowed: benchmark, reasons: ['D05_SOURCED_BENCHMARK_REQUIRED'] }) });
  // This seam represents D-01 fixtures, NOT verification of any real provider (agy has no collector).
  vi.spyOn(gw, 'decide').mockImplementation(async (provider) => {
    if (unverified && provider !== 'codex') return { decision: { allowed: false, error: 'BILLING_UNVERIFIED', reasons: ['NO_D01_EVIDENCE'] } };
    const permit: ExecutionPermit = { provider, entrypoint: process.execPath, argv: [resolve('tests/fixtures/p4-cli.mjs'), errors[providers.indexOf(provider)] ?? 'success'],
      envelope: { status: 'VERIFIED', source: 'synthetic', format: 'json_object', result_path: ['result'], error_flag_path: ['is_error'],
        error_patterns: ['QUOTA_EXHAUSTED', 'RATE_LIMIT', 'AUTH_EXPIRED', 'REFUSAL'].map((error) => ({ pattern: error, error: error as 'QUOTA_EXHAUSTED' | 'RATE_LIMIT' | 'AUTH_EXPIRED' | 'REFUSAL' })) },
      profileEnv: {}, sandboxRoot: join(fx.root, 'sandbox'), timeoutMs: 5000, maxOutputBytes: 10000, model: 'synthetic', cli_version: 'fixture-v1' };
    return { decision: { allowed: true }, permit };
  });
  const a = f.store.learning.createAttempt({ request_key: 'a', scope: 'learner', item: f.item, rubric: f.rubric, mode: 'self_practice', purpose: '7A' });
  const { job } = submitForAssessment(f.store, { ...assessInput(f, a.attempt_id, 's'), eligible_providers: providers });
  const facts: GatewayJob = { billing_policy: 'subscription_only', required_capabilities: ['text', 'structured_result'], data_classes: ['synthetic_fixture'] };
  const adapter = new GatewayAdapter(gw, () => ({ eligible: providers, job: facts }));
  const contexts: unknown[] = [];
  const deps = { queue: f.store.queue, adapter, owner: 'p4', leaseMs: 60000, heartbeatMs: 10000,
    loadContext: (id: string) => { const c = fx.store.learning.loadManifestPayload(id); contexts.push(c); return c; },
    interpret: () => [{ observation_key: 'c', competency_id: 'c', processing: 'processed' as const, outcome: 'met' as const,
      measurement_quality: 'sufficient' as const, opportunity: 'observed' as const, support_impact: 'no_related_effect_detected' as const }] };
  return { fx, job, deps, contexts };
}

it.each(['QUOTA_EXHAUSTED', 'RATE_LIMIT', 'AUTH_EXPIRED'])('06A-1/3/12: %s fails over with identical context and one source', async (error) => {
  const { fx, job, deps, contexts } = await setup([error, 'success']);
  expect((await processNextJob(deps)).status).toBe('RETRY_SCHEDULED');
  const old = fx.store.queue.runs(job.job_id)[0]!;
  expect((await processNextJob(deps)).status).toBe('COMMITTED');
  expect(contexts[0]).toEqual(contexts[1]);
  expect(fx.store.queue.runs(job.job_id).map((r) => [r.provider, r.cli_version])).toEqual([['codex', 'fixture-v1'], ['claude-code', 'fixture-v1']]);
  expect(fx.store.db.prepare('SELECT COUNT(*) FROM evidence_sources').pluck().get()).toBe(1);
  expect(fx.store.db.prepare('SELECT COUNT(*) FROM observations').pluck().get()).toBe(1);
  expect(fx.store.queue.recordOutput({ job_id: job.job_id, run_id: old.run_id, generation: old.generation, lease_owner: 'p4' }, {} ).accepted).toBe(false);
});

it('06A-2: three quota failures park safely and never execute a fourth time', async () => {
  const { fx, job, deps } = await setup(['QUOTA_EXHAUSTED', 'QUOTA_EXHAUSTED', 'QUOTA_EXHAUSTED']);
  for (let i = 0; i < 3; i++) await processNextJob(deps);
  expect(fx.store.queue.get(job.job_id)).toMatchObject({ state: 'WAITING_QUOTA', executions_used: 3 });
  expect((await processNextJob(deps)).status).toBe('IDLE');
  expect(fx.store.queue.resumeWaiting(job.job_id)).toBe('CANCELLED');
  expect(fx.store.db.prepare('SELECT COUNT(*) FROM observations').pluck().get()).toBe(0);
});

it.each(['D01', 'D05'])('never chooses backup missing %s evidence', async (gate) => {
  const { fx, job, deps } = await setup(['QUOTA_EXHAUSTED', 'success'], gate !== 'D05', gate === 'D01');
  await processNextJob(deps);
  expect(fx.store.queue.get(job.job_id)?.state).toBe('WAITING_QUOTA');
  expect(fx.store.queue.runs(job.job_id)).toHaveLength(1);
});

it('refusal never triggers provider shopping', async () => {
  const { fx, job, deps } = await setup(['REFUSAL', 'success']);
  await processNextJob(deps);
  expect(fx.store.queue.get(job.job_id)?.state).toBe('NEEDS_REVIEW');
  expect(fx.store.queue.runs(job.job_id)).toHaveLength(1);
});

it('06A-12: switching providers preserves displayed hint history and does not transmit a future hint', async () => {
  const { fx, job, deps, contexts } = await setup(['QUOTA_EXHAUSTED', 'success']);
  fx.store.learning.recordAssistance({ idempotency_key: 'shown-1', attempt_id: job.attempt_id, submission_id: job.submission_id, hint_level: 1,
    content: 'Synthetic displayed hint', impacts: [{ competency_id: 'c', impact: 'affected', reduced_load: false }], pre_snapshot_id: null, post_snapshot_id: null });
  const before = fx.store.db.prepare('SELECT * FROM assistance_events').all();
  await processNextJob(deps); await processNextJob(deps);
  expect(fx.store.db.prepare('SELECT * FROM assistance_events').all()).toEqual(before);
  expect(contexts[1]).toEqual(contexts[0]);
  expect(contexts[1]).not.toHaveProperty('level_3');
});

it('runtime quota/auth state is durable and recovery does not self-certify READY', async () => {
  f = await fixture(); const repo = f.store.aiAccounts;
  repo.upsertAccount({ profile_id: 'fixture', provider: 'codex', label: 'Synthetic', runner_ref: 'synthetic-only', state: 'READY' });
  repo.recordRuntimeFailure('codex', 'RATE_LIMIT', 'synthetic');
  expect(repo.account('codex')?.state).toBe('COOLDOWN');
  repo.recordRuntimeFailure('codex', 'AUTH_EXPIRED', 'synthetic');
  expect(repo.account('codex')?.state).toBe('NEEDS_LOGIN');
  expect(repo.quotaEvents().map((e) => e.event_kind)).toEqual(['RATE_LIMIT', 'AUTH_EXPIRED']);
  expect(() => repo.recoverAccount('codex')).toThrow(/D-01 evidence/);
});

it('a quota/rate-limit pause ends on its own at the reset time; a login failure does not', async () => {
  f = await fixture(); const repo = f.store.aiAccounts;
  repo.upsertAccount({ profile_id: 'fixture', provider: 'codex', label: 'Synthetic', runner_ref: 'synthetic-only', state: 'READY' });
  const reset = new Date(f.clock.now().getTime() + 2 * 3_600_000).toISOString();
  repo.recordRuntimeFailure('codex', 'QUOTA_EXHAUSTED', 'synthetic', reset);
  f.clock.advance(2 * 3_600_000 - 1000);
  expect(repo.account('codex')?.state).toBe('QUOTA_EXHAUSTED');
  f.clock.advance(2000);
  expect(repo.account('codex')?.state).toBe('READY');
  expect(repo.quotaEvents('codex').at(-1)).toMatchObject({ event_kind: 'RECOVERED', detail: expect.stringMatching(/^auto: QUOTA_EXHAUSTED/) });
  // No reset time: default 5 min for a rate limit.
  repo.recordRuntimeFailure('codex', 'RATE_LIMIT', 'synthetic');
  f.clock.advance(4 * 60_000);
  expect(repo.account('codex')?.state).toBe('COOLDOWN');
  f.clock.advance(60_000);
  expect(repo.account('codex')?.state).toBe('READY');
  repo.recordRuntimeFailure('codex', 'AUTH_EXPIRED', 'synthetic');
  f.clock.advance(24 * 3_600_000);
  expect(repo.account('codex')?.state).toBe('NEEDS_LOGIN');
});
