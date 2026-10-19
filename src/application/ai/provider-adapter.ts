export type ProviderError = 'QUOTA_EXHAUSTED' | 'RATE_LIMIT' | 'AUTH_EXPIRED' | 'BILLING_UNVERIFIED' | 'NETWORK' | 'TIMEOUT' | 'INVALID_SCHEMA' | 'REFUSAL' | 'CAPABILITY_MISSING' | 'CANCELLED';
export interface Job {
  job_id: string;
  context_manifest_id: string;
  billing_policy: 'subscription_only';
  required_capabilities: string[];
}
export interface Context { manifest_id: string; payload: Readonly<Record<string, unknown>> }
export interface Assessment {
  schema_version: '1'; job_id: string; context_manifest_id: string;
  processing: 'processed' | 'missing_data' | 'technical_error';
  outcome: 'met' | 'not_met' | 'inconclusive';
  evidence_refs: string[]; limitations: string[]; synthetic: boolean;
}
export type AdapterResult = { ok: true; result: Assessment } | { ok: false; error: ProviderError };
export interface ProviderAdapter {
  inspectAuth(): Promise<{ authenticated: boolean; synthetic: boolean }>;
  inspectEntitlement(): Promise<{ verified: boolean; billing: 'subscription_only' | 'unverified'; synthetic: boolean }>;
  readQuotaIfSupported(): Promise<{ remaining: number | null; observed_at: string; source: string }>;
  execute(runId: string, job: Job, context: Context): Promise<unknown>;
  cancel(runId: string): Promise<void>;
  normalizeResult(raw: unknown): AdapterResult;
}
