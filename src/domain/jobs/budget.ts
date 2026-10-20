// Retry budget rules (06A §6.B, 04 §5.A, 01 §4). Pure: the SQLite queue applies the decision under fencing.
export type JobFailure = 'QUOTA_EXHAUSTED' | 'RATE_LIMIT' | 'AUTH_EXPIRED' | 'BILLING_UNVERIFIED' | 'NETWORK' | 'TIMEOUT'
  | 'INVALID_SCHEMA' | 'REFUSAL' | 'CAPABILITY_MISSING' | 'CANCELLED' | 'LEASE_EXPIRED' | 'DEPENDENCY_REVOKED';

export interface JobBudget { executions_used: number; max_attempts_total: number; format_repairs_used: number }
export const MAX_EXECUTIONS_PER_JOB = 3;
export const MAX_FORMAT_REPAIRS_PER_JOB = 1;
export const MAX_WORKFLOW_REGEN_ROUNDS = 2;

export type FailureDecision =
  | { next: 'QUEUED'; format_repair: boolean; delay_ms: number }
  | { next: 'WAITING_QUOTA' }
  | { next: 'NEEDS_REVIEW' | 'FAILED'; reason: string }
  | { next: 'CANCELLED' };

/** Technical backoff, not a pedagogical parameter (decision E-07): honour retry-after, else linear 30 s steps. */
export const DEFAULT_BACKOFF_MS = 30_000;

export function remainingExecutions(b: JobBudget): number {
  return Math.min(b.max_attempts_total, MAX_EXECUTIONS_PER_JOB) - b.executions_used;
}

/**
 * Decide what a failed execution leads to. The budget is total per job: format repair, timeouts and lease
 * expiry all consume the same ≤3 executions; nothing here ever resets it.
 */
export function decideAfterFailure(failure: JobFailure, b: JobBudget, retryAfterMs?: number): FailureDecision {
  const canRetry = remainingExecutions(b) > 0;
  const delay = retryAfterMs ?? DEFAULT_BACKOFF_MS * Math.max(1, b.executions_used);
  switch (failure) {
    case 'NETWORK': case 'TIMEOUT': case 'LEASE_EXPIRED': case 'RATE_LIMIT':
      return canRetry ? { next: 'QUEUED', format_repair: false, delay_ms: failure === 'LEASE_EXPIRED' ? 0 : delay } : { next: 'FAILED', reason: `${failure}_BUDGET_EXHAUSTED` };
    case 'INVALID_SCHEMA':
      return canRetry && b.format_repairs_used < MAX_FORMAT_REPAIRS_PER_JOB
        ? { next: 'QUEUED', format_repair: true, delay_ms: 0 }
        : { next: 'NEEDS_REVIEW', reason: 'INVALID_SCHEMA_AFTER_REPAIR' };
    // Only one provider path exists in P1; failover between providers belongs to the P2/P4 gateway.
    case 'QUOTA_EXHAUSTED': return { next: 'WAITING_QUOTA' };
    case 'REFUSAL': return { next: 'NEEDS_REVIEW', reason: 'REFUSAL' };
    // Item/rubric revoked between enqueue and commit: no recognition, needs traced re-evaluation (06 §5.B.5).
    case 'DEPENDENCY_REVOKED': return { next: 'NEEDS_REVIEW', reason: 'DEPENDENCY_REVOKED' };
    case 'AUTH_EXPIRED': case 'BILLING_UNVERIFIED': case 'CAPABILITY_MISSING': return { next: 'FAILED', reason: failure };
    case 'CANCELLED': return { next: 'CANCELLED' };
  }
}
