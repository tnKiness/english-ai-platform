// Ports used by application use cases and the worker; infrastructure/sqlite implements them.
import type { JobFailure } from '../domain/jobs/budget.js';
import type { JobState } from '../domain/jobs/state.js';
import type { Mode, Outcome, Purpose, Scope, SupportImpact, MeasurementQuality, Opportunity, Processing } from '../domain/evidence/types.js';

/** Synchronous unit of work: everything inside commits or rolls back together. Never await inside. */
export interface UnitOfWork { run<T>(fn: () => T): T }

export interface AttemptRecord {
  attempt_id: string; scope: Scope; mode: Mode; purpose: Purpose; state: string;
  item: { id: string; version: string; hash: string }; rubric: { id: string; version: string; hash: string };
  evidence_source_id: string; created_at: string;
}
export interface SubmissionRecord {
  submission_id: string; attempt_id: string; revision: number; kind: 'original' | 'repair'; parent_submission_id: string | null;
  evidence_source_id: string; snapshot_id: string; snapshot_version: number; content_hash: string; repair_attempt_index: number; created_at: string;
}
export interface NewAttempt { request_key: string; scope: Scope; item: { id: string; version: string }; rubric: { id: string; version: string }; mode: Mode; purpose: Purpose }
export interface NewSubmission { request_key: string; attempt_id: string; content: string; parent_submission_id?: string; media_id?: string }
export interface NewManifest {
  manifest_id: string; role: 'assessor' | 'blind_solver' | 'verifier' | 'repair_tutor'; phase: 'assessment' | 'blind_solve' | 'verification' | 'repair';
  policy_version: string; rubric: { id: string; version: string; hash: string } | null; knowledge: { kind: string; id: string; version: string; hash: string }[];
  disclosure_level: number; allowed_resource_ids: string[]; payload: Record<string, unknown>;
}

export interface LearningStore {
  createAttempt(input: NewAttempt): AttemptRecord;
  submit(input: NewSubmission): SubmissionRecord;
  createManifest(input: NewManifest): { manifest_id: string; input_hash: string };
  loadManifestPayload(manifestId: string): Readonly<Record<string, unknown>>;
}

export interface NewJob {
  idempotency_key: string; attempt_id: string; submission_id: string; snapshot_version: number; attempt_generation: number;
  task_type: 'writing.assess' | 'reading.blind_solve' | 'reading.verify' | 'repair.assess';
  phase: 'assessment' | 'blind_solve' | 'verification' | 'repair'; context_manifest_id: string; rubric_version: string;
  required_capabilities: ('text' | 'structured_result' | 'direct_audio')[]; eligible_providers: ('codex' | 'claude-code' | 'gemini-cli')[];
  limits: { max_attempts_total: number; timeout_seconds: number }; workflow_id?: string;
}
export interface JobRecord extends NewJob {
  job_id: string; scope: Scope; state: JobState; generation: number; executions_used: number; format_repairs_used: number;
  regen_round: number; last_error: string | null; current_run_id: string | null; lease_owner: string | null; lease_expires_at: string | null; available_at: string;
}

/** Fencing token presented on every write after a claim; stale tokens are rejected inside the transaction. */
export interface RunFence { job_id: string; run_id: string; generation: number; lease_owner: string }
export interface ClaimedRun extends RunFence { job: JobRecord; execution_index: number; purpose: 'execute' | 'format_repair'; lease_expires_at: string }

export interface ObservationDraft {
  observation_key: string; competency_id: string; supersedes_id?: string | null;
  processing: Processing; outcome: Outcome; measurement_quality: MeasurementQuality; opportunity: Opportunity; support_impact: SupportImpact;
}

export type FenceRejection = 'STALE_GENERATION' | 'LEASE_EXPIRED' | 'WRONG_STATE' | 'NOT_OWNER' | 'UNKNOWN_JOB';
export type CommitOutcome =
  | { status: 'COMMITTED'; observation_ids: string[] }
  | { status: 'ALREADY_COMMITTED'; run_id: string; observation_ids: string[] }
  | { status: 'REJECTED'; reason: FenceRejection | 'DEPENDENCY_REVOKED' | 'INVALID_OBSERVATION' | 'PIN_MISMATCH' };

export interface JobQueuePort {
  enqueue(job: NewJob): JobRecord;
  recoverExpired(): { job_id: string; to: JobState }[];
  claim(owner: string, leaseMs: number, provider: 'fake'): ClaimedRun | null;
  heartbeat(fence: RunFence, leaseMs: number): boolean;
  recordOutput(fence: RunFence, output: unknown): { accepted: true } | { accepted: false; reason: FenceRejection };
  fail(fence: RunFence, failure: JobFailure, detail?: string, retryAfterMs?: number): { accepted: true; to: JobState } | { accepted: false; reason: FenceRejection };
  complete(fence: RunFence, result: unknown, observations: ObservationDraft[]): CommitOutcome;
  cancel(jobId: string, reason: string): { cancelled: boolean; state: JobState };
  isCurrent(fence: RunFence): boolean;
  get(jobId: string): JobRecord | undefined;
}
