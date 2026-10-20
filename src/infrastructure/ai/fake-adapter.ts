import type { AdapterResult, Assessment, Context, Job, ProviderAdapter, ProviderError } from '../../application/ai/provider-adapter.js';
import { validateContract } from '../contracts/validate.js';

export type FakeScenario = 'success' | 'malformed' | ProviderError;
/** One scripted execution; `delayMs` simulates a slow or hung provider and is cut short by cancel(). */
export interface FakeStep { scenario: FakeScenario; delayMs?: number }

export class FakeAdapter implements ProviderAdapter {
  private cancelled = new Set<string>();
  private wake = new Map<string, () => void>();
  private steps: FakeStep[];
  readonly executed: string[] = [];
  constructor(script: FakeScenario | FakeStep[] = 'success') {
    this.steps = Array.isArray(script) ? [...script] : [{ scenario: script }];
  }
  async inspectAuth() { return { authenticated: false, synthetic: true }; }
  async inspectEntitlement() { return { verified: false, billing: 'unverified' as const, synthetic: true }; }
  async readQuotaIfSupported() { return { remaining: null, observed_at: new Date().toISOString(), source: 'fake:no-provider-observation' }; }
  async cancel(runId: string) { this.cancelled.add(runId); this.wake.get(runId)?.(); }
  async execute(runId: string, job: Job, context: Context): Promise<unknown> {
    this.executed.push(runId);
    // The last step repeats, so a single scenario behaves like the P0 adapter.
    const step = (this.steps.length > 1 ? this.steps.shift() : this.steps[0]) ?? { scenario: 'success' };
    if (step.delayMs) await new Promise<void>((resolve) => { const t = setTimeout(resolve, step.delayMs); this.wake.set(runId, () => { clearTimeout(t); resolve(); }); });
    this.wake.delete(runId);
    if (this.cancelled.has(runId)) return { error: 'CANCELLED' };
    if (context.manifest_id !== job.context_manifest_id) return { error: 'INVALID_SCHEMA' };
    if (step.scenario === 'malformed') return 'not JSON';
    if (step.scenario !== 'success') return { error: step.scenario };
    return { result: { schema_version: '1', job_id: job.job_id, context_manifest_id: context.manifest_id,
      processing: 'processed', outcome: 'inconclusive', evidence_refs: [],
      limitations: ['Synthetic fixture; not a learner assessment.'], synthetic: true } };
  }
  normalizeResult(raw: unknown): AdapterResult {
    if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'INVALID_SCHEMA' };
    const errors: ProviderError[] = ['QUOTA_EXHAUSTED', 'RATE_LIMIT', 'AUTH_EXPIRED', 'BILLING_UNVERIFIED', 'NETWORK', 'TIMEOUT', 'INVALID_SCHEMA', 'REFUSAL', 'CAPABILITY_MISSING', 'CANCELLED'];
    if ('error' in raw && errors.includes(raw.error as ProviderError)) return { ok: false, error: raw.error as ProviderError };
    if (!('result' in raw) || !validateContract('result', raw.result)) return { ok: false, error: 'INVALID_SCHEMA' };
    return { ok: true, result: raw.result as Assessment };
  }
}
