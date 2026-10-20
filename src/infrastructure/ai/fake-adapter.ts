import type { AdapterResult, AiResult, Context, Job, ProviderAdapter, ProviderError, TaskType } from '../../application/ai/provider-adapter.js';
import { validateAiResult } from './result-contracts.js';

export type FakeScenario = 'success' | 'malformed' | ProviderError;
/** One scripted execution; `delayMs` simulates a slow or hung provider and is cut short by cancel(). */
export interface FakeStep { scenario: FakeScenario; delayMs?: number }
/** Scripted QC4 behaviour. The fake never reads an answer key: blind answers are whatever the test scripts. */
export interface FakeQcScript {
  blindAnswers?: Record<string, string>;
  verdict?: 'consistent' | 'conflict' | 'ambiguous';
  competing?: { question_id: string; answer: string; rationale: string }[];
  /** Tùy chọn ghi đè hoặc kiểm thử luồng chấm Writing/Repair synthetic (mặc định tự suy từ nội dung bài nộp). */
  writingOutcome?: 'met' | 'not_met' | 'inconclusive';
  repairOutcome?: 'met' | 'not_met' | 'inconclusive';
}

const ERRORS: ProviderError[] = ['QUOTA_EXHAUSTED', 'RATE_LIMIT', 'AUTH_EXPIRED', 'BILLING_UNVERIFIED', 'NETWORK', 'TIMEOUT', 'INVALID_SCHEMA', 'REFUSAL', 'CAPABILITY_MISSING', 'CANCELLED'];

export class FakeAdapter implements ProviderAdapter {
  private cancelled = new Set<string>();
  private wake = new Map<string, () => void>();
  private steps: FakeStep[];
  readonly executed: string[] = [];
  /** Context payloads seen per run, so tests can prove what a phase was (not) given. */
  readonly contexts = new Map<string, Readonly<Record<string, unknown>>>();
  constructor(script: FakeScenario | FakeStep[] = 'success', private qc: FakeQcScript = {}) {
    this.steps = Array.isArray(script) ? [...script] : [{ scenario: script }];
  }
  async inspectAuth() { return { authenticated: false, synthetic: true }; }
  async inspectEntitlement() { return { verified: false, billing: 'unverified' as const, synthetic: true }; }
  async readQuotaIfSupported() { return { remaining: null, observed_at: new Date().toISOString(), source: 'fake:no-provider-observation' }; }
  async cancel(runId: string) { this.cancelled.add(runId); this.wake.get(runId)?.(); }
  async execute(runId: string, job: Job, context: Context): Promise<unknown> {
    this.executed.push(runId);
    this.contexts.set(runId, context.payload);
    // The last step repeats, so a single scenario behaves like the P0 adapter.
    const step = (this.steps.length > 1 ? this.steps.shift() : this.steps[0]) ?? { scenario: 'success' };
    if (step.delayMs) await new Promise<void>((resolve) => { const t = setTimeout(resolve, step.delayMs); this.wake.set(runId, () => { clearTimeout(t); resolve(); }); });
    this.wake.delete(runId);
    if (this.cancelled.has(runId)) return { error: 'CANCELLED' };
    if (context.manifest_id !== job.context_manifest_id) return { error: 'INVALID_SCHEMA' };
    if (step.scenario === 'malformed') return 'not JSON';
    if (step.scenario !== 'success') return { error: step.scenario };
    return { result: this.result(job, context) };
  }
  private result(job: Job, context: Context): AiResult {
    const base = { schema_version: '1' as const, job_id: job.job_id, context_manifest_id: context.manifest_id, synthetic: true };
    if (job.task_type === 'reading.blind_solve') {
      const questions = ((context.payload.task as { questions?: { question_id: string }[] } | undefined)?.questions ?? []);
      return { ...base, answers: questions.map((q) => ({ question_id: q.question_id, answer: this.qc.blindAnswers?.[q.question_id] ?? 'NO ANSWER' })), ambiguities: [] };
    }
    if (job.task_type === 'reading.verify') {
      return { ...base, verdict: this.qc.verdict ?? 'consistent', competing_answers: this.qc.competing ?? [], findings: ['Synthetic fixture verification; not a real audit.'] };
    }
    const text = typeof context.payload.submission_text === 'string' ? context.payload.submission_text : '';
    const scripted = job.task_type === 'repair.assess' ? this.qc.repairOutcome : this.qc.writingOutcome;
    const outcome = scripted
      ?? (text.includes('[SYNTHETIC_MET]') ? 'met' : text.includes('[SYNTHETIC_NOT_MET]') ? 'not_met' : 'inconclusive');
    return { ...base, processing: 'processed', outcome, evidence_refs: text ? ['submission:paragraph_1'] : [], limitations: ['Synthetic fixture; not a learner assessment.'] };
  }
  normalizeResult(raw: unknown, taskType: TaskType = 'writing.assess'): AdapterResult {
    if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'INVALID_SCHEMA' };
    if ('error' in raw && ERRORS.includes(raw.error as ProviderError)) return { ok: false, error: raw.error as ProviderError };
    if (!('result' in raw) || !validateAiResult(taskType, raw.result)) return { ok: false, error: 'INVALID_SCHEMA' };
    return { ok: true, result: raw.result as AiResult };
  }
}
