import { redact } from '../ai/gateway/redaction.js';
import type { Db } from './database.js';

/** Read models for the console. Metadata only: no submission text, context payload or AI output body. */
export class ConsoleQueries {
  constructor(private db: Db) {}

  itemMeta(id: string, version: string) {
    return this.db.prepare('SELECT item_family_id, shared_stimulus_id, content_hash AS hash FROM item_versions WHERE item_id = ? AND version = ?').get(id, version) as
      { item_family_id: string; shared_stimulus_id: string | null; hash: string } | undefined;
  }

  /** "Lần chạy": job/run technical log with versions, retries, timings and redacted errors (06 §3 tab 3). */
  runs(limit = 50) {
    const jobs = this.db.prepare(`SELECT j.job_id, j.task_type, j.phase, j.scope, j.state, j.executions_used, j.format_repairs_used, j.last_error, j.created_at, j.updated_at,
      m.manifest_id, m.role, m.input_hash, length(m.payload_json) AS context_bytes, r.result_hash
      FROM ai_jobs j JOIN context_manifests m ON m.manifest_id = j.context_manifest_id LEFT JOIN job_results r ON r.job_id = j.job_id ORDER BY j.created_at DESC LIMIT ?`).all(limit) as
      { job_id: string; last_error: string | null; [k: string]: unknown }[];
    const runs = this.db.prepare('SELECT run_id, execution_index, purpose, provider, cli_version, model, state, error, output_hash, started_at, finished_at FROM ai_runs WHERE job_id = ? ORDER BY execution_index');
    return jobs.map((j) => ({ ...j, last_error: j.last_error ? redact(j.last_error, 300) : null,
      runs: (runs.all(j.job_id) as { started_at: string; finished_at: string | null; error: string | null }[]).map((r) => ({ ...r, error: r.error ? redact(r.error, 200) : null,
        duration_ms: r.finished_at ? Date.parse(r.finished_at) - Date.parse(r.started_at) : null })) }));
  }

  /** Jobs the queue parked for a human (NEEDS_REVIEW) or stopped (FAILED), for the "Cần xử lý" tab. */
  stoppedJobs() {
    return (this.db.prepare("SELECT job_id, task_type, scope, state, last_error, updated_at FROM ai_jobs WHERE state IN ('NEEDS_REVIEW', 'FAILED', 'WAITING_QUOTA') ORDER BY updated_at DESC").all() as
      { last_error: string | null; [k: string]: unknown }[]).map((j) => ({ ...j, last_error: j.last_error ? redact(j.last_error, 300) : null }));
  }

  /** Facts the gateway needs to decide what data a job sends: role, scope and content origin (never AI output). */
  jobFacts(jobId: string): { role: string; scope: 'learner' | 'dry_run'; content_origin: 'synthetic_fixture' | 'sourced' | null } | undefined {
    return this.db.prepare(`SELECT m.role, j.scope, b.content_origin FROM ai_jobs j JOIN context_manifests m ON m.manifest_id = j.context_manifest_id
      JOIN attempts a ON a.attempt_id = j.attempt_id LEFT JOIN item_versions i ON i.item_id = a.item_id AND i.version = a.item_version
      LEFT JOIN package_bundles b ON b.package_id = i.package_id AND b.version = i.package_version WHERE j.job_id = ?`).get(jobId) as
      { role: string; scope: 'learner' | 'dry_run'; content_origin: 'synthetic_fixture' | 'sourced' | null } | undefined;
  }
}
