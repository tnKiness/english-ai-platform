import { describe, expect, it } from 'vitest';
import { validateContract } from '../../src/infrastructure/contracts/validate.js';
import { FakeAdapter } from '../../src/infrastructure/ai/fake-adapter.js';
import type { ProviderError } from '../../src/application/ai/provider-adapter.js';
const job = { job_id: 'synthetic-job', context_manifest_id: 'ctx', billing_policy: 'subscription_only' as const, required_capabilities: ['text'] };
const context = { manifest_id: 'ctx', payload: {} };
describe('adapter contract', () => {
  it('returns synthetic inconclusive data, never verified auth/billing or invented quota', async () => {
    const adapter = new FakeAdapter();
    const result = adapter.normalizeResult(await adapter.execute('run', job, context));
    expect(result).toMatchObject({ ok: true, result: { synthetic: true, outcome: 'inconclusive' } });
    expect(await adapter.inspectAuth()).toMatchObject({ authenticated: false });
    expect(await adapter.inspectEntitlement()).toMatchObject({ verified: false });
    expect((await adapter.readQuotaIfSupported()).remaining).toBeNull();
  });
  it.each<ProviderError>(['QUOTA_EXHAUSTED', 'RATE_LIMIT', 'AUTH_EXPIRED', 'BILLING_UNVERIFIED', 'NETWORK', 'TIMEOUT', 'INVALID_SCHEMA', 'REFUSAL', 'CAPABILITY_MISSING'])('preserves %s without fallback', async (error) => {
    const adapter = new FakeAdapter(error);
    expect(adapter.normalizeResult(await adapter.execute('run', job, context))).toEqual({ ok: false, error });
  });
  it('rejects malformed output and mismatched manifest', async () => {
    const adapter = new FakeAdapter('malformed');
    expect(adapter.normalizeResult(await adapter.execute('run', job, context))).toEqual({ ok: false, error: 'INVALID_SCHEMA' });
    expect(new FakeAdapter().normalizeResult({ result: { outcome: 'met' } }).ok).toBe(false);
    expect(await adapter.execute('run', job, { ...context, manifest_id: 'other' })).toEqual({ error: 'INVALID_SCHEMA' });
  });
  it('cancels only the addressed fake run', async () => {
    const adapter = new FakeAdapter(); await adapter.cancel('cancelled');
    expect(adapter.normalizeResult(await adapter.execute('cancelled', job, context))).toEqual({ ok: false, error: 'CANCELLED' });
    expect(adapter.normalizeResult(await adapter.execute('other', job, context)).ok).toBe(true);
  });
});
it('rejects credentials in profile and unbounded job budgets', () => {
  const profile = { schema_version: '1', profile_id: 'p', provider: 'codex', label: 'test', runner_ref: 'isolated', state: 'NEEDS_VERIFICATION' };
  expect(validateContract('profile', profile)).toBe(true);
  expect(validateContract('profile', { ...profile, token: 'synthetic-secret' })).toBe(false);
  const fullJob = { ...job, schema_version: '1', idempotency_key: 'key', attempt_id: 'a', snapshot_version: 0, attempt_generation: 1, task_type: 'writing.assess', phase: 'assessment', rubric_version: 'v1', eligible_providers: ['codex'], limits: { max_attempts_total: 3, timeout_seconds: 180 } };
  expect(validateContract('job', fullJob)).toBe(true);
  expect(validateContract('job', { ...fullJob, billing_policy: 'api' })).toBe(false);
  expect(validateContract('job', { ...fullJob, limits: { max_attempts_total: 4, timeout_seconds: 180 } })).toBe(false);
});
