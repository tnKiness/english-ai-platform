import { randomUUID } from 'node:crypto';
import type { ClaimedRun, ClaimOptions, CommitOutcome, FenceRejection, JobQueuePort, JobRecord, NewJob, ObservationDraft, RunFence, RunProvider } from '../../application/ports.js';
import { decideAfterFailure, MAX_WORKFLOW_REGEN_ROUNDS, remainingExecutions, type JobFailure } from '../../domain/jobs/budget.js';
import { transitionJob, type JobState } from '../../domain/jobs/state.js';
import { checkPinned } from '../../domain/learning/pinning.js';
import { limitBySignal } from '../../domain/evidence/signal.js';
import { validateContract } from '../contracts/validate.js';
import { canonicalJson, sha256 } from '../files/paths.js';
import type { Db } from './database.js';
import type { KnowledgeRepository } from './knowledge-repository.js';

interface JobRow {
  job_id: string; idempotency_key: string; workflow_id: string | null; regen_round: number; attempt_id: string; submission_id: string; scope: 'learner' | 'dry_run';
  snapshot_version: number; attempt_generation: number; task_type: NewJob['task_type']; phase: NewJob['phase']; context_manifest_id: string; rubric_version: string;
  required_capabilities: string; eligible_providers: string; max_attempts_total: number; timeout_seconds: number; state: JobState; generation: number;
  executions_used: number; format_repairs_used: number; pending_format_repair: number; lease_owner: string | null; lease_expires_at: string | null;
  current_run_id: string | null; available_at: string; last_error: string | null;
}

const ACTIVE: JobState[] = ['RUNNING', 'VALIDATING'];
const toRecord = (r: JobRow): JobRecord => ({
  job_id: r.job_id, idempotency_key: r.idempotency_key, attempt_id: r.attempt_id, submission_id: r.submission_id, snapshot_version: r.snapshot_version,
  attempt_generation: r.attempt_generation, task_type: r.task_type, phase: r.phase, context_manifest_id: r.context_manifest_id, rubric_version: r.rubric_version,
  required_capabilities: JSON.parse(r.required_capabilities), eligible_providers: JSON.parse(r.eligible_providers),
  limits: { max_attempts_total: r.max_attempts_total, timeout_seconds: r.timeout_seconds }, ...(r.workflow_id ? { workflow_id: r.workflow_id } : {}),
  scope: r.scope, state: r.state, generation: r.generation, executions_used: r.executions_used, format_repairs_used: r.format_repairs_used,
  regen_round: r.regen_round, last_error: r.last_error, current_run_id: r.current_run_id, lease_owner: r.lease_owner, lease_expires_at: r.lease_expires_at, available_at: r.available_at,
});

/**
 * Durable SQLite queue (06 §5.B.3–4, 06A §6). One worker, one AI job at a time. Every transaction is short and
 * synchronous: claim commits before the provider runs, and results are compared against state, run, generation
 * and lease inside the commit transaction. No transaction is ever held while waiting for AI.
 */
export class SqliteJobQueue implements JobQueuePort {
  constructor(private db: Db, private knowledge: KnowledgeRepository, private now: () => Date = () => new Date()) {}

  private iso(offsetMs = 0) { return new Date(this.now().getTime() + offsetMs).toISOString(); }
  private row(jobId: string) { return this.db.prepare('SELECT * FROM ai_jobs WHERE job_id = ?').get(jobId) as JobRow | undefined; }
  get(jobId: string) { const r = this.row(jobId); return r && toRecord(r); }

  /** Idempotent by idempotency_key: a double submit returns the first job, a different payload is a conflict. */
  enqueue(job: NewJob, regenRound = 0, options: { allowUpdatedRubric?: boolean } = {}): JobRecord {
    return this.db.transaction(() => {
      const prior = this.db.prepare('SELECT * FROM ai_jobs WHERE idempotency_key = ?').get(job.idempotency_key) as JobRow | undefined;
      if (prior) {
        if (prior.submission_id !== job.submission_id || prior.context_manifest_id !== job.context_manifest_id || prior.task_type !== job.task_type) {
          throw new Error('idempotency_key reused for a different job');
        }
        return toRecord(prior);
      }
      const jobId = randomUUID();
      const contract = { schema_version: '2', job_id: jobId, idempotency_key: job.idempotency_key, attempt_id: job.attempt_id, snapshot_version: job.snapshot_version,
        attempt_generation: job.attempt_generation, billing_policy: 'subscription_only', task_type: job.task_type, phase: job.phase, context_manifest_id: job.context_manifest_id,
        rubric_version: job.rubric_version, required_capabilities: job.required_capabilities, eligible_providers: job.eligible_providers,
        limits: { max_attempts_total: job.limits.max_attempts_total, timeout_seconds: job.limits.timeout_seconds } };
      if (!validateContract('job', contract)) throw new Error('Job violates contract');
      const attempt = this.db.prepare('SELECT scope, rubric_id, rubric_version FROM attempts WHERE attempt_id = ?').get(job.attempt_id) as { scope: 'learner' | 'dry_run'; rubric_id: string; rubric_version: string } | undefined;
      if (!attempt) throw new Error('Unknown attempt');
      if (attempt.rubric_version !== job.rubric_version) {
        if (!options.allowUpdatedRubric) throw new Error('Job rubric_version differs from the version pinned on the attempt');
        const rubExists = this.db.prepare("SELECT 1 FROM json_objects WHERE kind = 'rubric' AND object_id = ? AND version = ?").get(attempt.rubric_id, job.rubric_version);
        if (!rubExists) throw new Error('Unknown updated rubric version for re-evaluation');
        const manifest = this.db.prepare('SELECT rubric_id, rubric_version, rubric_hash FROM context_manifests WHERE manifest_id = ?').get(job.context_manifest_id) as { rubric_id: string; rubric_version: string; rubric_hash: string } | undefined;
        const ref = this.db.prepare("SELECT content_hash FROM json_objects WHERE kind = 'rubric' AND object_id = ? AND version = ?").get(attempt.rubric_id, job.rubric_version) as { content_hash: string };
        if (!manifest || manifest.rubric_id !== attempt.rubric_id || manifest.rubric_version !== job.rubric_version || manifest.rubric_hash !== ref.content_hash) throw new Error('Re-evaluation context rubric mismatch');
      }
      const snapshot = this.db.prepare('SELECT n.snapshot_version FROM submissions s JOIN snapshots n USING (snapshot_id) WHERE s.submission_id = ?').get(job.submission_id) as { snapshot_version: number } | undefined;
      if (!snapshot || snapshot.snapshot_version !== job.snapshot_version) throw new Error('Job snapshot_version does not match the submission snapshot');
      const at = this.iso();
      this.db.prepare(`INSERT INTO ai_jobs (job_id, idempotency_key, workflow_id, regen_round, attempt_id, submission_id, scope, snapshot_version, attempt_generation, task_type, phase,
        context_manifest_id, rubric_version, required_capabilities, eligible_providers, max_attempts_total, timeout_seconds, state, available_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'QUEUED', ?, ?, ?)`).run(jobId, job.idempotency_key, job.workflow_id ?? null, regenRound, job.attempt_id,
        job.submission_id, attempt.scope, job.snapshot_version, job.attempt_generation, job.task_type, job.phase, job.context_manifest_id, job.rubric_version,
        JSON.stringify(job.required_capabilities), JSON.stringify(job.eligible_providers), job.limits.max_attempts_total, job.limits.timeout_seconds, at, at, at);
      return toRecord(this.row(jobId)!);
    }).immediate();
  }

  createWorkflow(kind: string, attemptId: string | null, scope: 'learner' | 'dry_run'): string {
    const id = randomUUID();
    const at = this.iso();
    this.db.prepare('INSERT INTO workflows (workflow_id, kind, attempt_id, scope, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, kind, attemptId, scope, at, at);
    return id;
  }

  /**
   * Workflow-level fix/regenerate round (01 §4: tối đa 2 vòng). Consumes the round and enqueues the new job in
   * one transaction; the new job has its own ≤3 execution budget, the workflow counter is never reset.
   */
  enqueueRegeneration(workflowId: string, job: NewJob): { ok: true; job: JobRecord; round: number } | { ok: false; reason: 'WORKFLOW_BUDGET_EXHAUSTED' } {
    return this.db.transaction(() => {
      const wf = this.db.prepare('SELECT regen_rounds_used FROM workflows WHERE workflow_id = ?').get(workflowId) as { regen_rounds_used: number } | undefined;
      if (!wf) throw new Error('Unknown workflow');
      const prior = this.db.prepare('SELECT job_id, regen_round FROM ai_jobs WHERE idempotency_key = ?').get(job.idempotency_key) as { job_id: string; regen_round: number } | undefined;
      if (prior) return { ok: true as const, job: this.get(prior.job_id)!, round: prior.regen_round };
      if (wf.regen_rounds_used >= MAX_WORKFLOW_REGEN_ROUNDS) return { ok: false as const, reason: 'WORKFLOW_BUDGET_EXHAUSTED' as const };
      const round = wf.regen_rounds_used + 1;
      this.db.prepare('UPDATE workflows SET regen_rounds_used = ?, updated_at = ? WHERE workflow_id = ?').run(round, this.iso(), workflowId);
      return { ok: true as const, job: this.enqueue({ ...job, workflow_id: workflowId }, round), round };
    }).immediate();
  }

  /** Expired leases (worker crash/restart, hung run): invalidate the generation and requeue within budget. */
  recoverExpired(): { job_id: string; to: JobState }[] {
    return this.db.transaction(() => {
      const now = this.iso();
      const expired = this.db.prepare("SELECT * FROM ai_jobs WHERE state IN ('RUNNING', 'VALIDATING') AND lease_expires_at <= ?").all(now) as JobRow[];
      return expired.map((job) => ({ job_id: job.job_id, to: this.applyFailure(job, 'LEASE_EXPIRED', 'lease expired before commit', undefined, 'STALE') }));
    }).immediate();
  }

  claim(owner: string, leaseMs: number, provider: RunProvider, options: ClaimOptions = {}): ClaimedRun | null {
    return this.db.transaction(() => {
      this.recoverExpired();
      const now = this.iso();
      // MVP: one AI job at a time across the whole database (06 §5.B.3).
      if (this.db.prepare("SELECT 1 FROM ai_jobs WHERE state IN ('RUNNING', 'VALIDATING') LIMIT 1").get()) return null;
      const scopes = options.scopes ?? ['learner', 'dry_run'];
      const job = this.db.prepare(`SELECT * FROM ai_jobs WHERE state = 'QUEUED' AND available_at <= ? AND scope IN (${scopes.map(() => '?').join(', ')})
        AND (? IS NULL OR job_id = ?) ${options.complaintsOnly ? "AND job_id IN (SELECT reeval_job_id FROM learner_complaints WHERE state = 'RE_EVALUATING')" : ''}
        ORDER BY available_at, created_at LIMIT 1`).get(now, ...scopes, options.jobId ?? null, options.jobId ?? null) as JobRow | undefined;
      if (!job) return null;
      if (remainingExecutions(job) <= 0) { this.setState(job, 'FAILED', 'EXECUTION_BUDGET_EXHAUSTED'); return null; }
      const generation = job.generation + 1;
      const executionIndex = job.executions_used + 1;
      const purpose = job.pending_format_repair === 1 ? 'format_repair' as const : 'execute' as const;
      const runId = randomUUID();
      const leaseExpiresAt = this.iso(leaseMs);
      transitionJob(job.state, 'RUNNING');
      this.db.prepare(`UPDATE ai_jobs SET state = 'RUNNING', generation = ?, executions_used = ?, format_repairs_used = format_repairs_used + ?, pending_format_repair = 0,
        lease_owner = ?, lease_expires_at = ?, current_run_id = ?, updated_at = ? WHERE job_id = ?`)
        .run(generation, executionIndex, purpose === 'format_repair' ? 1 : 0, owner, leaseExpiresAt, runId, now, job.job_id);
      this.db.prepare(`INSERT INTO ai_runs (run_id, job_id, generation, execution_index, purpose, lease_owner, lease_expires_at, state, provider, cli_version, model, started_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'RUNNING', ?, ?, ?, ?)`).run(runId, job.job_id, generation, executionIndex, purpose, owner, leaseExpiresAt, provider, options.cli_version ?? null, options.model ?? null, now);
      return { job_id: job.job_id, run_id: runId, generation, lease_owner: owner, execution_index: executionIndex, purpose, lease_expires_at: leaseExpiresAt, job: toRecord(this.row(job.job_id)!) };
    }).immediate();
  }

  /** Compare-and-set fence check, used inside every write transaction. */
  private check(fence: RunFence, states: JobState[]): { ok: true; job: JobRow } | { ok: false; reason: FenceRejection } {
    const job = this.row(fence.job_id);
    if (!job) return { ok: false, reason: 'UNKNOWN_JOB' };
    if (job.generation !== fence.generation || job.current_run_id !== fence.run_id) return { ok: false, reason: 'STALE_GENERATION' };
    if (job.lease_owner !== fence.lease_owner) return { ok: false, reason: 'NOT_OWNER' };
    if (!states.includes(job.state)) return { ok: false, reason: 'WRONG_STATE' };
    if (!job.lease_expires_at || job.lease_expires_at <= this.iso()) return { ok: false, reason: 'LEASE_EXPIRED' };
    return { ok: true, job };
  }

  isCurrent(fence: RunFence): boolean { return this.check(fence, ACTIVE).ok; }

  heartbeat(fence: RunFence, leaseMs: number): boolean {
    return this.db.transaction(() => {
      const c = this.check(fence, ACTIVE);
      if (!c.ok) return false;
      const until = this.iso(leaseMs);
      this.db.prepare('UPDATE ai_jobs SET lease_expires_at = ?, updated_at = ? WHERE job_id = ?').run(until, this.iso(), fence.job_id);
      this.db.prepare('UPDATE ai_runs SET lease_expires_at = ? WHERE run_id = ?').run(until, fence.run_id);
      return true;
    }).immediate();
  }

  /** P4: cập nhật provider, cli_version, model thực tế đã được Gateway chọn cho lượt chạy hiện hành. */
  recordRunProvider(fence: RunFence, provider: RunProvider, cliVersion: string | null = null, model: string | null = null): boolean {
    return this.db.transaction(() => {
      const c = this.check(fence, ACTIVE);
      if (!c.ok) return false;
      this.db.prepare('UPDATE ai_runs SET provider = ?, cli_version = COALESCE(?, cli_version), model = COALESCE(?, model) WHERE run_id = ?')
        .run(provider, cliVersion, model, fence.run_id);
      return true;
    }).immediate();
  }

  /** RUNNING → VALIDATING with the raw output kept on the run for audit; stale or late output is not stored. */
  recordOutput(fence: RunFence, output: unknown) {
    return this.db.transaction(() => {
      const c = this.check(fence, ['RUNNING']);
      if (!c.ok) return { accepted: false as const, reason: c.reason };
      const json = canonicalJson(output ?? null);
      transitionJob('RUNNING', 'VALIDATING');
      this.db.prepare("UPDATE ai_jobs SET state = 'VALIDATING', updated_at = ? WHERE job_id = ?").run(this.iso(), fence.job_id);
      this.db.prepare("UPDATE ai_runs SET state = 'VALIDATING', output_json = ?, output_hash = ? WHERE run_id = ?").run(json, sha256(json), fence.run_id);
      return { accepted: true as const };
    }).immediate();
  }

  fail(fence: RunFence, failure: JobFailure, detail?: string, retryAfterMs?: number, options?: { failoverAvailable?: boolean }) {
    return this.db.transaction(() => {
      const c = this.check(fence, ACTIVE);
      if (!c.ok) return { accepted: false as const, reason: c.reason };
      return { accepted: true as const, to: this.applyFailure(c.job, failure, detail, retryAfterMs, failure === 'CANCELLED' ? 'CANCELLED' : 'FAILED', options) };
    }).immediate();
  }

  /** Applies the pure budget decision. Leaving RUNNING/VALIDATING always bumps the generation (fencing). */
  private applyFailure(job: JobRow, failure: JobFailure, detail: string | undefined, retryAfterMs: number | undefined, runState: 'FAILED' | 'STALE' | 'CANCELLED', options?: { failoverAvailable?: boolean }): JobState {
    const decision = decideAfterFailure(failure, job, retryAfterMs, options);
    let to: JobState = decision.next;
    // VALIDATING has no WAITING_QUOTA edge; such a failure cannot come from validation, so stop safely.
    if (job.state === 'VALIDATING' && to === 'WAITING_QUOTA') to = 'FAILED';
    transitionJob(job.state, to);
    const at = this.iso();
    const availableAt = decision.next === 'QUEUED' ? this.iso(decision.delay_ms) : job.available_at;
    const repair = decision.next === 'QUEUED' && decision.format_repair ? 1 : 0;
    const reason = 'reason' in decision ? decision.reason : failure;
    this.db.prepare(`UPDATE ai_jobs SET state = ?, generation = generation + 1, pending_format_repair = ?, lease_owner = NULL, lease_expires_at = NULL, current_run_id = NULL,
      available_at = ?, last_error = ?, updated_at = ? WHERE job_id = ?`).run(to, repair, availableAt, detail ? `${reason}: ${detail}` : reason, at, job.job_id);
    if (job.current_run_id) this.db.prepare('UPDATE ai_runs SET state = ?, error = ?, finished_at = ? WHERE run_id = ?').run(runState, failure, at, job.current_run_id);
    return to;
  }

  private setState(job: JobRow, to: JobState, reason: string) {
    transitionJob(job.state, to);
    this.db.prepare('UPDATE ai_jobs SET state = ?, last_error = ?, updated_at = ? WHERE job_id = ?').run(to, reason, this.iso(), job.job_id);
  }

  /**
   * VALIDATING → COMPLETED. In one transaction: fence check, idempotent result row, pin/revocation check,
   * observation insert with provenance. A retried commit returns the stored result; nothing is written twice.
   */
  complete(fence: RunFence, result: unknown, drafts: ObservationDraft[]): CommitOutcome {
    return this.db.transaction((): CommitOutcome => {
      const committed = this.db.prepare('SELECT run_id FROM job_results WHERE job_id = ?').get(fence.job_id) as { run_id: string } | undefined;
      if (committed) {
        const ids = (this.db.prepare('SELECT observation_id FROM observations WHERE job_id = ? ORDER BY observation_key').all(fence.job_id) as { observation_id: string }[]).map((r) => r.observation_id);
        return { status: 'ALREADY_COMMITTED', run_id: committed.run_id, observation_ids: ids };
      }
      const c = this.check(fence, ['VALIDATING']);
      if (!c.ok) return { status: 'REJECTED', reason: c.reason };
      const attempt = this.db.prepare('SELECT a.*, s.evidence_source_id, s.submission_id FROM attempts a JOIN submissions s ON s.attempt_id = a.attempt_id WHERE s.submission_id = ?')
        .get(c.job.submission_id) as { item_id: string; item_version: string; item_hash: string; rubric_id: string; rubric_version: string; rubric_hash: string; evidence_source_id: string; scope: 'learner' | 'dry_run' };
      let rubricPin = { id: attempt.rubric_id, version: attempt.rubric_version, hash: attempt.rubric_hash };
      if (c.job.rubric_version !== attempt.rubric_version && (drafts.length === 0 || drafts.some((d) => !d.supersedes_id))) return { status: 'REJECTED', reason: 'PIN_MISMATCH' };
      if (c.job.rubric_version !== attempt.rubric_version && drafts.length > 0 && drafts.every((d) => Boolean(d.supersedes_id))) {
        const rubRow = this.db.prepare("SELECT content_hash FROM json_objects WHERE kind = 'rubric' AND object_id = ? AND version = ?")
          .get(attempt.rubric_id, c.job.rubric_version) as { content_hash: string } | undefined;
        if (rubRow) rubricPin = { id: attempt.rubric_id, version: c.job.rubric_version, hash: rubRow.content_hash };
      }
      const pins = { item: { id: attempt.item_id, version: attempt.item_version, hash: attempt.item_hash }, rubric: rubricPin };
      const pinned = checkPinned(pins, pins, this.knowledge.revocations());
      const servable = this.knowledge.servableItem(attempt.item_id, attempt.item_version, attempt.scope);
      if (!pinned.ok || !servable.ok) {
        // Revoked between enqueue and commit: no recognition; the job goes to review, history stays intact.
        this.applyFailure(c.job, 'DEPENDENCY_REVOKED', `dependency revoked: ${!pinned.ok ? pinned.detail.join(',') : !servable.ok ? servable.reason : ''}`, undefined, 'FAILED');
        return { status: 'REJECTED', reason: 'DEPENDENCY_REVOKED' };
      }
      const at = this.iso();
      const keys = new Set<string>();
      // Migration regression fixtures run the old schema before upgrading; no complaint exists there.
      const hasComplaints = this.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'learner_complaints'").get();
      const complaint = hasComplaints ? this.db.prepare("SELECT target_observation_id FROM learner_complaints WHERE reeval_job_id = ? AND state = 'RE_EVALUATING'").get(fence.job_id) as { target_observation_id: string } | undefined : undefined;
      if (complaint && (drafts.length !== 1 || drafts[0]!.supersedes_id !== complaint.target_observation_id)) return { status: 'REJECTED', reason: 'INVALID_OBSERVATION' };
      for (const d of drafts) {
        if (!d.supersedes_id) continue;
        const old = this.db.prepare('SELECT submission_id, evidence_source_id, competency_id FROM observations WHERE observation_id = ?').get(d.supersedes_id) as
          { submission_id: string; evidence_source_id: string; competency_id: string } | undefined;
        if (!old || old.submission_id !== c.job.submission_id || old.evidence_source_id !== attempt.evidence_source_id || old.competency_id !== d.competency_id ||
          this.db.prepare('SELECT 1 FROM observations WHERE supersedes_id = ?').get(d.supersedes_id)) return { status: 'REJECTED', reason: 'INVALID_OBSERVATION' };
      }
      const rows = drafts.map((d) => {
        if (keys.has(d.observation_key)) return null;
        keys.add(d.observation_key);
        // The application enforces the signal limit; AI output cannot claim met/not_met on a weak signal.
        const limited = limitBySignal(d.outcome, { required_signal_present: true, processing: d.processing, measurement_quality: d.measurement_quality, opportunity: d.opportunity });
        const o = { schema_version: '1', observation_id: randomUUID(), submission_id: c.job.submission_id, evidence_source_id: attempt.evidence_source_id, competency_id: d.competency_id,
          item: pins.item, rubric: pins.rubric, ai_run_id: fence.run_id, supersedes_id: d.supersedes_id ?? null, processing: limited.processing, outcome: limited.outcome,
          measurement_quality: d.measurement_quality, opportunity: d.opportunity, support_impact: d.support_impact, scope: attempt.scope };
        return validateContract('observation', o) ? { o, key: d.observation_key } : undefined;
      });
      if (rows.some((r) => r === undefined)) return { status: 'REJECTED', reason: 'INVALID_OBSERVATION' };
      const resultJson = canonicalJson(result);
      transitionJob('VALIDATING', 'COMPLETED');
      this.db.prepare('INSERT INTO job_results (job_id, run_id, result_hash, result_json, committed_at) VALUES (?, ?, ?, ?, ?)').run(fence.job_id, fence.run_id, sha256(resultJson), resultJson, at);
      const insert = this.db.prepare(`INSERT INTO observations (observation_id, observation_key, submission_id, evidence_source_id, competency_id, item_id, item_version, item_hash,
        rubric_id, rubric_version, rubric_hash, ai_run_id, job_id, supersedes_id, processing, outcome, measurement_quality, opportunity, support_impact, scope, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      const ids: string[] = [];
      for (const r of rows) {
        if (!r) continue;
        const { o } = r;
        insert.run(o.observation_id, r.key, o.submission_id, o.evidence_source_id, o.competency_id, o.item.id, o.item.version, o.item.hash, o.rubric.id, o.rubric.version, o.rubric.hash,
          o.ai_run_id, fence.job_id, o.supersedes_id, o.processing, o.outcome, o.measurement_quality, o.opportunity, o.support_impact, o.scope, at);
        ids.push(o.observation_id);
      }
      if (complaint) {
        this.db.prepare("UPDATE learner_complaints SET state = 'RESOLVED', superseding_observation_id = ?, resolution_note = 'Reassessment committed; source retained', updated_at = ? WHERE reeval_job_id = ?")
          .run(ids[0], at, fence.job_id);
      }
      this.db.prepare(`UPDATE ai_jobs SET state = 'COMPLETED', lease_owner = NULL, lease_expires_at = NULL, current_run_id = NULL, last_error = NULL, updated_at = ? WHERE job_id = ?`).run(at, fence.job_id);
      this.db.prepare("UPDATE ai_runs SET state = 'COMPLETED', finished_at = ? WHERE run_id = ?").run(at, fence.run_id);
      return { status: 'COMMITTED', observation_ids: ids };
    }).immediate();
  }

  /** User cancel. Active runs lose their generation so any later result is rejected at commit. */
  cancel(jobId: string, reason: string): { cancelled: boolean; state: JobState } {
    return this.db.transaction(() => {
      const job = this.row(jobId);
      if (!job) throw new Error('Unknown job');
      if (['COMPLETED', 'FAILED', 'CANCELLED', 'NEEDS_REVIEW'].includes(job.state)) return { cancelled: false, state: job.state };
      if (ACTIVE.includes(job.state)) return { cancelled: true, state: this.applyFailure(job, 'CANCELLED', reason, undefined, 'CANCELLED') };
      this.setState(job, 'CANCELLED', `CANCELLED: ${reason}`);
      return { cancelled: true, state: 'CANCELLED' as JobState };
    }).immediate();
  }

  /** WAITING_QUOTA → QUEUED after an explicit quota recheck; the execution budget is not reset. */
  resumeWaiting(jobId: string): JobState {
    return this.db.transaction(() => {
      const job = this.row(jobId);
      if (!job || job.state !== 'WAITING_QUOTA') throw new Error('Job is not waiting for quota');
      // WAITING_QUOTA only leads to QUEUED or CANCELLED; an exhausted budget cannot be reopened.
      if (remainingExecutions(job) <= 0) { this.setState(job, 'CANCELLED', 'EXECUTION_BUDGET_EXHAUSTED'); return 'CANCELLED' as JobState; }
      transitionJob(job.state, 'QUEUED');
      this.db.prepare("UPDATE ai_jobs SET state = 'QUEUED', available_at = ?, updated_at = ? WHERE job_id = ?").run(this.iso(), this.iso(), jobId);
      return 'QUEUED' as JobState;
    }).immediate();
  }

  runs(jobId: string) {
    return this.db.prepare('SELECT run_id, generation, execution_index, purpose, state, error, provider, cli_version, model FROM ai_runs WHERE job_id = ? ORDER BY execution_index').all(jobId) as
      { run_id: string; generation: number; execution_index: number; purpose: string; state: string; error: string | null; provider: RunProvider; cli_version: string | null; model: string | null }[];
  }

  /** Committed business result of a job, or undefined if it never committed. */
  result(jobId: string): unknown {
    const row = this.db.prepare('SELECT result_json, result_hash FROM job_results WHERE job_id = ?').get(jobId) as { result_json: string; result_hash: string } | undefined;
    if (!row) return undefined;
    if (sha256(row.result_json) !== row.result_hash) throw new Error('Job result checksum mismatch');
    return JSON.parse(row.result_json);
  }
}
