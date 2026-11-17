// E-24: WAITING_QUOTA jobs return to the queue by themselves once an eligible provider is usable again
// (ai-router's "wait for the earliest reset"), without a model call, without resetting the 3-execution budget,
// and never through a backup provider missing the D-05 gate.
import { join, resolve } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type { CliProvider } from '../../src/application/ai/subscription-guard.js';
import { submitForAssessment } from '../../src/application/learning/submit-for-assessment.js';
import type { ExecutionPermit } from '../../src/infrastructure/ai/gateway/cli-adapters.js';
import { AiExecutionGateway, GatewayAdapter, type GatewayJob } from '../../src/infrastructure/ai/gateway/gateway.js';
import { processNextJob, resumeWaitingJobs } from '../../src/worker/worker.js';
import { assessInput, fixture, type Fixture } from './p1-helpers.js';

let f: Fixture | undefined;
afterEach(() => { f?.cleanup(); f = undefined; vi.restoreAllMocks(); });

async function setup(backup: { allowed: boolean }) {
  f = await fixture();
  const fx = f;
  const providers: CliProvider[] = ['codex', 'claude-code'];
  for (const provider of providers) fx.store.aiAccounts.upsertAccount({ profile_id: `${provider}-fixture`, provider, label: 'Synthetic', runner_ref: 'synthetic-only', state: 'READY' });
  // Per provider, the outcome of each successive execution.
  const script: Record<string, string[]> = { codex: ['QUOTA_EXHAUSTED', 'success'], 'claude-code': ['success'] };
  const gw = new AiExecutionGateway({ evidence: () => undefined, account: (p) => fx.store.aiAccounts.account(p), consents: () => new Set(), parentEnv: {},
    roots: { repo: join(fx.root, 'repo'), data: fx.root, sandboxRoot: join(fx.root, 'sandbox') }, now: fx.clock.now,
    runtimeFailure: (p, error, resetAt) => fx.store.aiAccounts.recordRuntimeFailure(p, error, 'synthetic', resetAt),
    backupAllowed: () => ({ allowed: backup.allowed, reasons: ['D05_SOURCED_BENCHMARK_REQUIRED'] }) });
  // Seam for D-01 fixtures only, NOT verification of any real provider. decide() is pure here: it does not consume the script.
  vi.spyOn(gw, 'decide').mockImplementation(async (provider) => {
    const permit: ExecutionPermit = { provider, entrypoint: process.execPath, argv: [resolve('tests/fixtures/p4-cli.mjs'), script[provider]?.[0] ?? 'success'],
      envelope: { status: 'VERIFIED', source: 'synthetic', format: 'json_object', result_path: ['result'], error_flag_path: ['is_error'],
        error_patterns: [{ pattern: 'QUOTA_EXHAUSTED', error: 'QUOTA_EXHAUSTED' }] },
      profileEnv: {}, sandboxRoot: join(fx.root, 'sandbox'), timeoutMs: 5000, maxOutputBytes: 10000, model: 'synthetic', cli_version: 'fixture-v1' };
    return { decision: { allowed: true }, permit };
  });
  const a = fx.store.learning.createAttempt({ request_key: 'a', scope: 'learner', item: fx.item, rubric: fx.rubric, mode: 'self_practice', purpose: '7A' });
  const { job } = submitForAssessment(fx.store, { ...assessInput(fx, a.attempt_id, 's'), eligible_providers: providers });
  const facts: GatewayJob = { billing_policy: 'subscription_only', required_capabilities: ['text', 'structured_result'], data_classes: ['synthetic_fixture'] };
  const adapter = new GatewayAdapter(gw, () => ({ eligible: providers, job: facts }));
  const execute = adapter.execute.bind(adapter);
  // After each real execution the provider moves to its next scripted outcome.
  vi.spyOn(adapter, 'execute').mockImplementation(async (runId, j, c) => {
    const raw = await execute(runId, j, c) as { provider?: string };
    if (raw.provider) script[raw.provider]?.shift();
    return raw;
  });
  const deps = { queue: fx.store.queue, adapter, owner: 'e24', leaseMs: 60000, heartbeatMs: 10000, loadContext: (id: string) => fx.store.learning.loadManifestPayload(id),
    interpret: () => [{ observation_key: 'c', competency_id: 'c', processing: 'processed' as const, outcome: 'met' as const,
      measurement_quality: 'sufficient' as const, opportunity: 'observed' as const, support_impact: 'no_related_effect_detected' as const }] };
  return { fx, job, deps, backup };
}

it('a parked job resumes on the same provider after the default quota cooldown, keeping its budget', async () => {
  const { fx, job, deps } = await setup({ allowed: false });
  expect((await processNextJob(deps)).status).toBe('STOPPED');
  expect(fx.store.queue.get(job.job_id)).toMatchObject({ state: 'WAITING_QUOTA', executions_used: 1 });
  expect(fx.store.aiAccounts.account('codex')?.state).toBe('QUOTA_EXHAUSTED');

  // Still cooling down, and the backup lacks the D-05 report: nothing resumes, nothing runs.
  expect(await resumeWaitingJobs(deps)).toEqual([]);
  fx.clock.advance(59 * 60_000);
  expect(await resumeWaitingJobs(deps)).toEqual([]);
  expect(fx.store.queue.runs(job.job_id)).toHaveLength(1);

  fx.clock.advance(2 * 60_000);
  expect(await resumeWaitingJobs(deps)).toEqual([job.job_id]);
  expect(fx.store.queue.get(job.job_id)).toMatchObject({ state: 'QUEUED', executions_used: 1 });
  expect((await processNextJob(deps)).status).toBe('COMMITTED');
  expect(fx.store.queue.runs(job.job_id).map((r) => r.provider)).toEqual(['codex', 'codex']);
  expect(fx.store.db.prepare('SELECT COUNT(*) FROM evidence_sources').pluck().get()).toBe(1);
});

it('a backup that passes D-05 is used immediately, so the job never parks', async () => {
  const { fx, job, deps } = await setup({ allowed: true });
  expect((await processNextJob(deps)).status).toBe('RETRY_SCHEDULED');
  expect((await processNextJob(deps)).status).toBe('COMMITTED');
  expect(fx.store.queue.runs(job.job_id).map((r) => r.provider)).toEqual(['codex', 'claude-code']);
});

it('only scopes the worker owns are rechecked', async () => {
  const { fx, job, deps } = await setup({ allowed: false });
  await processNextJob(deps);
  fx.clock.advance(61 * 60_000);
  expect(await resumeWaitingJobs({ ...deps, claimOptions: { scopes: ['dry_run'] } })).toEqual([]);
  expect(fx.store.queue.get(job.job_id)?.state).toBe('WAITING_QUOTA');
});
