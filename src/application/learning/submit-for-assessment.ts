import type { JobQueuePort, JobRecord, LearningStore, NewJob, SubmissionRecord, UnitOfWork } from '../ports.js';

export interface SubmitForAssessment {
  request_key: string;
  attempt_id: string;
  content: string;
  parent_submission_id?: string;
  rubric: { id: string; version: string; hash: string };
  task_type: Extract<NewJob['task_type'], 'writing.assess' | 'repair.assess'>;
  required_capabilities: NewJob['required_capabilities'];
  eligible_providers: NewJob['eligible_providers'];
  timeout_seconds: number;
  policy_version: string;
}

/**
 * Transaction boundary 1 (P0_DATA_AND_STATE): immutable revision + evidence source + snapshot + context manifest
 * + job commit together. Repeating the request key returns the same submission and job — never a second one.
 */
export function submitForAssessment(deps: { uow: UnitOfWork; learning: LearningStore; queue: Pick<JobQueuePort, 'enqueue'> }, input: SubmitForAssessment): { submission: SubmissionRecord; job: JobRecord } {
  return deps.uow.run(() => {
    const submission = deps.learning.submit({ request_key: input.request_key, attempt_id: input.attempt_id, content: input.content,
      ...(input.parent_submission_id ? { parent_submission_id: input.parent_submission_id } : {}) });
    const phase = input.task_type === 'repair.assess' ? 'repair' as const : 'assessment' as const;
    // Assessor view: the submission and its pinned rubric only — no learner history, credentials or answer bank.
    const manifest = deps.learning.createManifest({
      manifest_id: `ctx_${submission.submission_id}`, role: 'assessor', phase, policy_version: input.policy_version, rubric: input.rubric, knowledge: [],
      disclosure_level: 0, allowed_resource_ids: [], payload: { submission_id: submission.submission_id, submission_text: input.content, rubric: input.rubric },
    });
    const job = deps.queue.enqueue({
      idempotency_key: `${submission.submission_id}:${input.task_type}:${input.rubric.version}`, attempt_id: input.attempt_id, submission_id: submission.submission_id,
      snapshot_version: submission.snapshot_version, attempt_generation: 1, task_type: input.task_type, phase, context_manifest_id: manifest.manifest_id,
      rubric_version: input.rubric.version, required_capabilities: input.required_capabilities, eligible_providers: input.eligible_providers,
      limits: { max_attempts_total: 3, timeout_seconds: input.timeout_seconds },
    });
    return { submission, job };
  });
}
