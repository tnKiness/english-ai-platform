import type { FrameworkResult, FrameworkReviewResult } from '../../domain/knowledge/framework-checks.js';
import type { ItemReviewResult, Wt2ItemSetResult } from '../../domain/knowledge/item-checks.js';
export type { FrameworkCompetency, FrameworkResult, FrameworkReviewResult } from '../../domain/knowledge/framework-checks.js';
export type ProviderError = 'QUOTA_EXHAUSTED' | 'RATE_LIMIT' | 'AUTH_EXPIRED' | 'BILLING_UNVERIFIED' | 'NETWORK' | 'TIMEOUT' | 'INVALID_SCHEMA' | 'REFUSAL' | 'CAPABILITY_MISSING' | 'CANCELLED';
export type TaskType = 'writing.assess' | 'reading.blind_solve' | 'reading.verify' | 'repair.assess' | 'content.author' | 'content.review' | 'content.item_author' | 'content.item_review' | 'content.listening_author' | 'content.listening_solve';
export interface Job {
  job_id: string;
  context_manifest_id: string;
  billing_policy: 'subscription_only';
  required_capabilities: string[];
  /** Selects the business result contract inside the transport envelope; absent = assessment (P0/P1). */
  task_type?: TaskType;
}
export interface Context { manifest_id: string; payload: Readonly<Record<string, unknown>> }
export interface Assessment {
  schema_version: '1'; job_id: string; context_manifest_id: string;
  processing: 'processed' | 'missing_data' | 'technical_error';
  outcome: 'met' | 'not_met' | 'inconclusive';
  evidence_refs: string[]; limitations: string[]; synthetic: boolean;
}
/** QC4 blind solve: answers only — the solver never received the key (knowledge.v1 blind_solve_result). */
export interface BlindSolveResult { schema_version: '1'; job_id: string; context_manifest_id: string; answers: { question_id: string; answer: string }[]; ambiguities: string[]; synthetic: boolean }
/** QC4 verification audit, a separate job and context from the blind solve (knowledge.v1 verification_result). */
export interface VerificationResult {
  schema_version: '1'; job_id: string; context_manifest_id: string; verdict: 'consistent' | 'conflict' | 'ambiguous';
  competing_answers: { question_id: string; answer: string; rationale: string }[]; findings: string[]; synthetic: boolean;
}
/** P5-5 (E-35) learning.v1 writing_assessment_result: the AI proposes; the application decides what is recorded or shown. */
export interface WritingAssessment {
  schema_version: '1'; job_id: string; context_manifest_id: string; synthetic: boolean;
  processing: 'processed' | 'missing_data' | 'technical_error';
  competencies: { competency_id: string; outcome: 'met' | 'not_met' | 'inconclusive'; measurement_quality: 'sufficient' | 'insufficient' | 'unknown'; opportunity: 'observed' | 'absent' | 'unknown'; evidence_refs: string[]; rationale: string }[];
  diagnosis: {
    priority_issues: { competency_id: string; location: string; symptom: string; hypothesis: string; expected_verification: string; impact: number; certainty: number }[];
    other_issues: string[];
    hints: { level_1: string; level_2: string; level_3_explanation: string; model_rewrite: string; concept_check_question: string; concept_check_expected: string } | null;
  };
  limitations: string[];
}
export const isWritingAssessment = (r: unknown): r is WritingAssessment => typeof r === 'object' && r !== null && Array.isArray((r as { competencies?: unknown }).competencies);
export type AiResult = Assessment | WritingAssessment | BlindSolveResult | VerificationResult | FrameworkResult | FrameworkReviewResult | Wt2ItemSetResult | ItemReviewResult;
/** reset_at (E-24): thời điểm hãng báo mở lại hạn mức/giới hạn tốc độ, nếu đọc được từ lỗi của CLI. */
export type AdapterResult = { ok: true; result: AiResult } | { ok: false; error: ProviderError; reset_at?: string | null; /** E-52: why (no content values), e.g. contract paths. */ detail?: string };
export interface ProviderAdapter {
  inspectAuth(): Promise<{ authenticated: boolean; synthetic: boolean }>;
  inspectEntitlement(): Promise<{ verified: boolean; billing: 'subscription_only' | 'unverified'; synthetic: boolean }>;
  readQuotaIfSupported(): Promise<{ remaining: number | null; observed_at: string; source: string }>;
  execute(runId: string, job: Job, context: Context): Promise<unknown>;
  cancel(runId: string): Promise<void>;
  normalizeResult(raw: unknown, taskType?: TaskType): AdapterResult;
  /** P4: trả về provider/version/model thực tế mà Gateway đã cấp phép cho runId. */
  chosenProvider?(runId: string): { provider: 'codex' | 'claude-code' | 'agy'; cli_version: string; model: string } | undefined;
  /** P4: kiểm tra xem còn provider dự phòng nào đủ điều kiện (D-01 + READY + D-05 benchmark) để failover hay không. */
  canFailover?(job: Job): Promise<boolean>;
}
