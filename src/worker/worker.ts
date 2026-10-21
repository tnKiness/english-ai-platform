import type { AiResult, ProviderAdapter } from '../application/ai/provider-adapter.js';
import type { ClaimedRun, ClaimOptions, JobQueuePort, ObservationDraft, RunFence, RunProvider } from '../application/ports.js';

export interface WorkerDeps {
  queue: JobQueuePort;
  adapter: ProviderAdapter;
  loadContext(manifestId: string): Readonly<Record<string, unknown>>;
  /** Application mapping from a validated AI result to observation drafts; the AI never writes evidence itself. */
  interpret(result: AiResult, claim: ClaimedRun): ObservationDraft[];
  owner: string;
  leaseMs: number;
  heartbeatMs: number;
  /** Recorded on ai_runs; defaults to 'fake' (P1 behaviour). */
  provider?: RunProvider;
  claimOptions?: ClaimOptions;
}

export type ProcessOutcome =
  | { status: 'IDLE' }
  | { status: 'COMMITTED' | 'ALREADY_COMMITTED'; job_id: string; run_id: string }
  | { status: 'RETRY_SCHEDULED' | 'STOPPED'; job_id: string; run_id: string; detail: string }
  | { status: 'ABANDONED'; job_id: string; run_id: string; detail: string };

/**
 * One queue step: claim (committed) → run provider with no transaction open → validate → fenced commit.
 * A lost lease, cancel or stale generation means the result is dropped, never committed.
 */
export async function processNextJob(deps: WorkerDeps): Promise<ProcessOutcome> {
  const claim = deps.queue.claim(deps.owner, deps.leaseMs, deps.provider ?? 'fake', deps.claimOptions);
  if (!claim) return { status: 'IDLE' };
  const fence: RunFence = { job_id: claim.job_id, run_id: claim.run_id, generation: claim.generation, lease_owner: claim.lease_owner };
  const ids = { job_id: claim.job_id, run_id: claim.run_id };
  let lost = false;
  let timedOut = false;
  let timer: NodeJS.Timeout | undefined;
  const heartbeat = setInterval(() => {
    if (!deps.queue.heartbeat(fence, deps.leaseMs)) { lost = true; void deps.adapter.cancel(claim.run_id); }
  }, deps.heartbeatMs);
  let raw: unknown;
  try {
    const context = { manifest_id: claim.job.context_manifest_id, payload: deps.loadContext(claim.job.context_manifest_id) };
    const job = { job_id: claim.job_id, context_manifest_id: claim.job.context_manifest_id, billing_policy: 'subscription_only' as const,
      required_capabilities: claim.job.required_capabilities, task_type: claim.job.task_type };
    const timeout = new Promise<'TIMEOUT'>((resolve) => { timer = setTimeout(() => { timedOut = true; void deps.adapter.cancel(claim.run_id); resolve('TIMEOUT'); }, claim.job.limits.timeout_seconds * 1000); });
    raw = await Promise.race([deps.adapter.execute(claim.run_id, job, context), timeout]);
  } catch (error) {
    raw = { error: 'NETWORK', detail: error instanceof Error ? error.message : String(error) };
  } finally {
    clearInterval(heartbeat);
    clearTimeout(timer);
  }
  if (lost || !deps.queue.isCurrent(fence)) return { status: 'ABANDONED', ...ids, detail: 'fence lost before result' };

  const chosen = deps.adapter.chosenProvider?.(claim.run_id);
  if (chosen) {
    deps.queue.recordRunProvider?.(fence, chosen.provider, chosen.cli_version, chosen.model);
  }

  const jobForAdapter = { job_id: claim.job_id, context_manifest_id: claim.job.context_manifest_id, billing_policy: 'subscription_only' as const,
    required_capabilities: claim.job.required_capabilities, task_type: claim.job.task_type };

  const stop = async (failure: Parameters<JobQueuePort['fail']>[1], detail: string): Promise<ProcessOutcome> => {
    let failoverAvailable = false;
    if ((failure === 'QUOTA_EXHAUSTED' || failure === 'RATE_LIMIT' || failure === 'AUTH_EXPIRED') && deps.adapter.canFailover) {
      failoverAvailable = await deps.adapter.canFailover(jobForAdapter);
    }
    const r = deps.queue.fail(fence, failure, detail, failoverAvailable ? 0 : undefined, { failoverAvailable });
    if (!r.accepted) return { status: 'ABANDONED', ...ids, detail: r.reason };
    return { status: r.to === 'QUEUED' ? 'RETRY_SCHEDULED' : 'STOPPED', ...ids, detail: `${failure} -> ${r.to}` };
  };
  if (timedOut) return stop('TIMEOUT', `exceeded ${claim.job.limits.timeout_seconds}s`);
  const normalized = deps.adapter.normalizeResult(raw, claim.job.task_type);
  if (!normalized.ok) return stop(normalized.error, 'provider result');
  // Correlation: a result for another job or another context manifest is never accepted.
  if (normalized.result.job_id !== claim.job_id || normalized.result.context_manifest_id !== claim.job.context_manifest_id) return stop('INVALID_SCHEMA', 'correlation mismatch');

  const recorded = deps.queue.recordOutput(fence, normalized.result);
  if (!recorded.accepted) return { status: 'ABANDONED', ...ids, detail: recorded.reason };
  const outcome = deps.queue.complete(fence, normalized.result, deps.interpret(normalized.result, claim));
  if (outcome.status === 'COMMITTED' || outcome.status === 'ALREADY_COMMITTED') return { status: outcome.status, ...ids };
  if (outcome.reason === 'INVALID_OBSERVATION') return stop('INVALID_SCHEMA', 'observation drafts rejected');
  return { status: outcome.reason === 'DEPENDENCY_REVOKED' ? 'STOPPED' : 'ABANDONED', ...ids, detail: outcome.reason };
}

/** Single sequential worker loop. Restart-safe: expired leases are recovered on every claim. */
export async function runWorkerLoop(deps: WorkerDeps & { pollMs: number; signal: AbortSignal }): Promise<void> {
  deps.queue.recoverExpired();
  while (!deps.signal.aborted) {
    const outcome = await processNextJob(deps);
    if (outcome.status === 'IDLE') await new Promise((resolve) => setTimeout(resolve, deps.pollMs));
  }
}
