import { randomUUID } from 'node:crypto';
import type { Store } from '../../infrastructure/sqlite/store.js';
import type { AiResult } from '../ai/provider-adapter.js';
import type { ClaimedRun, ObservationDraft } from '../ports.js';

/** Learner disputes never change an outcome themselves. Reassessment is a new, fenced job. */
export class ComplaintService {
  constructor(private store: Store) {}
  request(input: { request_key: string; observation_id: string; reason: string }) {
    if (!input.reason.trim() || input.reason.length > 2000) throw new Error('INVALID_COMPLAINT_REASON');
    return this.store.uow.run(() => {
      const prior = this.store.db.prepare('SELECT complaint_id, reeval_job_id, target_observation_id, reason FROM learner_complaints WHERE request_key = ?').get(input.request_key) as
        { complaint_id: string; reeval_job_id: string; target_observation_id: string; reason: string } | undefined;
      if (prior) {
        if (prior.target_observation_id !== input.observation_id || prior.reason !== input.reason) throw new Error('COMPLAINT_IDEMPOTENCY_CONFLICT');
        return { complaint_id: prior.complaint_id, job_id: prior.reeval_job_id };
      }
      const o = this.store.db.prepare("SELECT o.*, s.attempt_id FROM observations o JOIN submissions s USING (submission_id) WHERE observation_id = ? AND o.scope = 'learner'").get(input.observation_id) as
        { observation_id: string; job_id: string; attempt_id: string; submission_id: string; evidence_source_id: string; competency_id: string } | undefined;
      if (!o) throw new Error('UNKNOWN_LEARNER_OBSERVATION');
      if (this.store.db.prepare('SELECT 1 FROM observations WHERE supersedes_id = ?').get(o.observation_id)) throw new Error('OBSERVATION_ALREADY_SUPERSEDED');
      const active = this.store.db.prepare("SELECT complaint_id, reeval_job_id FROM learner_complaints WHERE target_observation_id = ? AND state != 'RESOLVED'").get(o.observation_id) as { complaint_id: string; reeval_job_id: string } | undefined;
      if (active) return { complaint_id: active.complaint_id, job_id: active.reeval_job_id };
      const original = this.store.queue.get(o.job_id)!;
      const id = randomUUID();
      const manifestRow = this.store.db.prepare('SELECT role, phase, policy_version, rubric_id, rubric_version, rubric_hash, disclosure_level, allowed_resource_ids FROM context_manifests WHERE manifest_id = ?').get(original.context_manifest_id) as
        { role: 'assessor'; phase: 'assessment' | 'repair'; policy_version: string; rubric_id: string; rubric_version: string; rubric_hash: string; disclosure_level: number; allowed_resource_ids: string };
      const knowledge = this.store.db.prepare('SELECT kind, object_id AS id, version, content_hash AS hash FROM manifest_knowledge WHERE manifest_id = ?').all(original.context_manifest_id) as { kind: string; id: string; version: string; hash: string }[];
      const context = this.store.learning.createManifest({ manifest_id: `complaint_${id}`, role: manifestRow.role, phase: manifestRow.phase,
        policy_version: manifestRow.policy_version, rubric: { id: manifestRow.rubric_id, version: manifestRow.rubric_version, hash: manifestRow.rubric_hash },
        knowledge, disclosure_level: manifestRow.disclosure_level, allowed_resource_ids: JSON.parse(manifestRow.allowed_resource_ids) as string[],
        payload: { ...this.store.learning.loadManifestPayload(original.context_manifest_id), reassessment_competency_id: o.competency_id } });
      // Same source, targeted reassessment; old outcome and complaint text do not bias the model's context.
      const job = this.store.queue.enqueue({ ...original, context_manifest_id: context.manifest_id, idempotency_key: `complaint:${id}` });
      const review = this.store.builder.openReview({ dedupe_key: `complaint:${id}`, kind: 'job_needs_review', target_kind: 'observation', target_id: o.observation_id,
        target_version: null, severity: 'normal', summary: 'Learner requested reassessment', detail: { complaint_id: id, job_id: job.job_id } });
      const at = this.store.now().toISOString();
      this.store.db.prepare(`INSERT INTO learner_complaints (complaint_id, request_key, attempt_id, submission_id, evidence_source_id, target_observation_id,
        competency_id, reason, state, reeval_job_id, review_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'RE_EVALUATING', ?, ?, ?, ?)`)
        .run(id, input.request_key, o.attempt_id, o.submission_id, o.evidence_source_id, o.observation_id, o.competency_id, input.reason, job.job_id, review.review_id, at, at);
      return { complaint_id: id, job_id: job.job_id };
    });
  }

  /** Application-owned mapping; the model cannot choose which judgement it replaces. */
  interpret(result: AiResult, claim: ClaimedRun): ObservationDraft[] {
    const old = this.store.db.prepare(`SELECT o.* FROM learner_complaints c JOIN observations o ON o.observation_id = c.target_observation_id
      WHERE c.reeval_job_id = ? AND c.state = 'RE_EVALUATING'`).get(claim.job_id) as
      { observation_id: string; observation_key: string; competency_id: string; measurement_quality: ObservationDraft['measurement_quality']; opportunity: ObservationDraft['opportunity']; support_impact: ObservationDraft['support_impact'] } | undefined;
    if (!old || !('outcome' in result)) throw new Error('INVALID_REASSESSMENT_RESULT');
    return [{ observation_key: old.observation_key, competency_id: old.competency_id, supersedes_id: old.observation_id,
      processing: result.processing, outcome: result.outcome, measurement_quality: old.measurement_quality, opportunity: old.opportunity, support_impact: old.support_impact }];
  }
}
