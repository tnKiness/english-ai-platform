// P5-5 (E-35): Writing assessed by a real provider through the learning worker. A scripted adapter stands in for the
// gateway (it returns synthetic: false); this proves the application side only, not that a real CLI works.
import { afterEach, describe, expect, it } from 'vitest';
import type { AdapterResult, Context, Job, ProviderAdapter, WritingAssessment } from '../../src/application/ai/provider-adapter.js';
import { diagnosisFromResult, observationsFromResult } from '../../src/application/learning/writing-assessment.js';
import { LearningWorkflowService, SYNTHETIC_COMPETENCY_ID, SYNTHETIC_SECONDARY_COMPETENCY_ID } from '../../src/application/learning/writing-workflow.js';
import { validateAiResult } from '../../src/infrastructure/ai/result-contracts.js';
import { buildTaskInput } from '../../src/infrastructure/ai/task-instructions.js';
import { dataPaths } from '../../src/infrastructure/files/paths.js';
import { openStore, type Store } from '../../src/infrastructure/sqlite/store.js';
import { processNextJob } from '../../src/worker/worker.js';
import { clock, tempDir } from './p1-helpers.js';

const REWRITE = 'While digital archives widen access, physical libraries remain essential, so councils should fund both.';
const sample = (o: Partial<WritingAssessment['diagnosis']> = {}, job = 'j', manifest = 'm'): WritingAssessment => ({
  schema_version: '1', job_id: job, context_manifest_id: manifest, synthetic: false, processing: 'processed',
  competencies: [
    { competency_id: SYNTHETIC_COMPETENCY_ID, outcome: 'not_met', measurement_quality: 'sufficient', opportunity: 'observed', evidence_refs: ['para 2'], rationale: 'Lập trường đổi giữa hai đoạn.' },
    { competency_id: SYNTHETIC_SECONDARY_COMPETENCY_ID, outcome: 'met', measurement_quality: 'sufficient', opportunity: 'observed', evidence_refs: [], rationale: 'Đoạn rõ ý.' },
  ],
  diagnosis: {
    priority_issues: [{ competency_id: SYNTHETIC_COMPETENCY_ID, location: 'Câu chủ đề đoạn 2', symptom: 'Đoạn 2 phủ nhận lập trường ở mở bài.', hypothesis: 'Chưa dùng cấu trúc nhượng bộ.', expected_verification: 'Viết bài mới giữ lập trường.', impact: 3, certainty: 2 }],
    other_issues: ['Lặp từ "important".'],
    hints: { level_1: 'Xem câu chủ đề đoạn 2: nó đứng về phía nào so với mở bài?', level_2: 'Dùng mệnh đề nhượng bộ để thừa nhận ý đối lập mà vẫn giữ lập trường.',
      level_3_explanation: 'Câu mẫu thừa nhận lợi ích của lưu trữ số nhưng giữ lập trường cần cả hai.', model_rewrite: REWRITE,
      concept_check_question: 'Vì sao mệnh đề nhượng bộ giữ được lập trường?', concept_check_expected: 'thừa nhận nhưng không đổi lập trường' },
    ...o,
  },
  limitations: [],
});

describe('contract and interpretation', () => {
  it('the writing instruction carries a self-contained learning.v1 schema; the validator accepts it and rejects extras', () => {
    const text = buildTaskInput('writing.assess', 'job-1', 'ctx-1', { task: { prompt: 'p' } });
    expect(text).not.toContain('$ref');
    expect(text).toContain('"competencies"');
    expect(validateAiResult('writing.assess', sample())).toBe(true);
    expect(validateAiResult('writing.assess', { ...sample(), band: 7 })).toBe(false);
    const badScore = sample(); badScore.diagnosis.priority_issues[0]!.impact = 5;
    expect(validateAiResult('writing.assess', badScore)).toBe(false);
  });
  it('keeps only asked-about competencies once each; support impact is the application\'s', () => {
    const r = sample();
    r.competencies.push({ ...r.competencies[0]!, competency_id: 'unasked' }, { ...r.competencies[0]! });
    const drafts = observationsFromResult(r, { submission_id: 's', allowed: [SYNTHETIC_COMPETENCY_ID, SYNTHETIC_SECONDARY_COMPETENCY_ID], support_impact: 'affected' });
    expect(drafts.map((d) => d.competency_id)).toEqual([SYNTHETIC_COMPETENCY_ID, SYNTHETIC_SECONDARY_COMPETENCY_ID]);
    expect(drafts.every((d) => d.support_impact === 'affected')).toBe(true);
  });
  it('applies the focus limit, drops unknown competencies, and refuses hints that leak the rewrite early', () => {
    const issue = sample().diagnosis.priority_issues[0]!;
    const many = sample({ priority_issues: [issue, { ...issue, symptom: 'second' }, { ...issue, competency_id: 'unknown' }] });
    const d = diagnosisFromResult(many, { allowed: [SYNTHETIC_COMPETENCY_ID], focus_limit: 1 });
    expect(d.priority_issues).toHaveLength(1);
    expect(d.other_issues).toContain('second');
    expect(d.hints?.level_3).toContain(REWRITE);
    const leaky = sample(); leaky.diagnosis.hints!.level_2 = `Thử viết: ${REWRITE}`;
    const l = diagnosisFromResult(leaky, { allowed: [SYNTHETIC_COMPETENCY_ID], focus_limit: 3 });
    expect(l.hints).toBeNull();
    expect(l.disclosure.ok).toBe(false);
  });
});

class ScriptedProvider implements ProviderAdapter {
  constructor(private make: (job: Job, ctx: Context) => WritingAssessment) {}
  readonly seen: Readonly<Record<string, unknown>>[] = [];
  async inspectAuth() { return { authenticated: true, synthetic: false }; }
  async inspectEntitlement() { return { verified: true, billing: 'subscription_only' as const, synthetic: false }; }
  async readQuotaIfSupported() { return { remaining: null, observed_at: new Date().toISOString(), source: 'test' }; }
  async execute(_runId: string, job: Job, context: Context) { this.seen.push(context.payload); return { result: this.make(job, context) }; }
  async cancel() { /* nothing to stop */ }
  normalizeResult(raw: unknown, taskType = 'writing.assess' as const): AdapterResult {
    const r = (raw as { result: unknown }).result;
    return validateAiResult(taskType, r) ? { ok: true, result: r as WritingAssessment } : { ok: false, error: 'INVALID_SCHEMA' };
  }
}

let store: Store | undefined;
const cleanups: (() => void)[] = [];
afterEach(() => { try { store?.close(); } catch { /* closed */ } store = undefined; cleanups.splice(0).forEach((c) => c()); });

async function realMode() {
  const t = tempDir('ielts-p55-'); cleanups.push(t.cleanup);
  store = await openStore(dataPaths(t.dir), { now: clock('2026-12-01T03:00:00.000Z').now });
  const wf = new LearningWorkflowService(store, undefined, { aiMode: 'real' });
  wf.ensureSyntheticWritingCatalog();
  const view = wf.startAttempt({ request_key: 'start', mode: 'self_practice', purpose: 'lesson' });
  return { st: store, wf, attemptId: view.attempt.attempt_id };
}
const work = (st: Store, wf: LearningWorkflowService, adapter: ProviderAdapter) => processNextJob({
  queue: st.queue, adapter, loadContext: (id) => st.learning.loadManifestPayload(id), interpret: (r, c) => wf.interpretJob(r, c.job.job_id),
  owner: 'learning-worker-test', leaseMs: 60_000, heartbeatMs: 10_000, provider: 'codex', claimOptions: { scopes: ['learner'], excludeComplaints: true },
});

describe('real-AI mode', () => {
  it('queues the job, the learning worker records evidence, and the workspace finalises an AI diagnosis with checked hints', async () => {
    const { st, wf, attemptId } = await realMode();
    const queued = await wf.submitWriting({ attempt_id: attemptId, request_key: 'sub-1', content: 'My essay text about libraries and archives.' });
    expect(queued.diagnosis).toBeNull();
    expect(queued.assessment).toMatchObject({ job_state: 'QUEUED', mode: 'real' });
    expect((st.db.prepare('SELECT COUNT(*) AS n FROM observations').get() as { n: number }).n).toBe(0);

    const adapter = new ScriptedProvider((job, ctx) => sample({}, job.job_id, ctx.manifest_id));
    await work(st, wf, adapter);
    // Assessor context: task, criteria and conditions; no history, no hints, no answer bank.
    const ctx = adapter.seen[0]!;
    expect(ctx).toMatchObject({ task: { prompt: expect.stringContaining('Synthetic Task') }, conditions: { mode: 'self_practice', purpose: 'lesson', is_repair: false } });
    expect((ctx.competencies as { competency_id: string }[]).map((c) => c.competency_id)).toEqual([SYNTHETIC_COMPETENCY_ID, SYNTHETIC_SECONDARY_COMPETENCY_ID]);
    expect(JSON.stringify(ctx)).not.toMatch(/SYNTHETIC-LEVEL3|HIDDEN-ANSWER|level_1/);

    const view = wf.getWorkspaceView(attemptId);
    expect(view.assessment).toBeNull();
    expect(view.diagnosis).toMatchObject({ synthetic: false, priority_issues: [{ impact: 3, certainty: 2, hypothesis_status: 'initial' }] });
    expect(view.diagnosis!.scaffold).toMatchObject({ unlocked_level: 0, hints: [] });
    expect(view.loop!.step).toBe(5);
    expect(JSON.stringify(view)).not.toContain(REWRITE);
    expect(st.db.prepare('SELECT synthetic, status FROM error_hypotheses').all()).toEqual([{ synthetic: 0, status: 'initial' }]);
    expect(st.db.prepare('SELECT competency_id, outcome, support_impact FROM observations ORDER BY competency_id').all()).toEqual([
      { competency_id: SYNTHETIC_SECONDARY_COMPETENCY_ID, outcome: 'met', support_impact: 'no_related_effect_detected' },
      { competency_id: SYNTHETIC_COMPETENCY_ID, outcome: 'not_met', support_impact: 'no_related_effect_detected' },
    ]);
    // Level 1 shows only level 1; the rewrite stays on the server until level 3.
    const l1 = wf.unlockHint(attemptId, 1, 'h1');
    expect(l1.diagnosis!.scaffold.hints.map((h) => h.level)).toEqual([1]);
    expect(JSON.stringify(l1)).not.toContain(REWRITE);
    expect(JSON.stringify(wf.unlockHint(attemptId, 2, 'h2'))).not.toContain(REWRITE);
    expect(JSON.stringify(wf.unlockHint(attemptId, 3, 'h3'))).toContain(REWRITE);
    // Finalising twice changes nothing.
    expect(wf.finalizeAssessment(view.diagnosis!.submission_id)).toBe(false);
  });

  it('hints that fail the disclosure check are never stored for display; unlocking reports HINTS_UNAVAILABLE', async () => {
    const { st, wf, attemptId } = await realMode();
    await wf.submitWriting({ attempt_id: attemptId, request_key: 'sub-1', content: 'Essay.' });
    await work(st, wf, new ScriptedProvider((job, ctx) => { const r = sample({}, job.job_id, ctx.manifest_id); r.diagnosis.hints!.level_1 = `Gợi ý: ${REWRITE}`; return r; }));
    const view = wf.getWorkspaceView(attemptId);
    expect(view.diagnosis!.other_issues_summary.some((o) => o.startsWith('Gợi ý theo nấc bị loại'))).toBe(true);
    expect(JSON.stringify(view)).not.toContain(REWRITE);
    expect(() => wf.unlockHint(attemptId, 1, 'h1')).toThrow(/No checked hint levels/);
  });

  it('a synthetic-mode service never leaves a learner job for the worker; the learning worker skips complaint jobs', async () => {
    const t = tempDir('ielts-p55s-'); cleanups.push(t.cleanup);
    store = await openStore(dataPaths(t.dir), { now: clock().now });
    const wf = new LearningWorkflowService(store);
    expect(wf.aiMode).toBe('synthetic');
    wf.ensureSyntheticWritingCatalog();
    const a = wf.startAttempt({ request_key: 's', mode: 'guided', purpose: 'lesson' });
    await wf.submitWriting({ attempt_id: a.attempt.attempt_id, request_key: 'x', content: 'Essay [SYNTHETIC_NOT_MET]' });
    expect((store.db.prepare("SELECT COUNT(*) AS n FROM ai_jobs WHERE state = 'QUEUED'").get() as { n: number }).n).toBe(0);
    expect(wf.getWorkspaceView(a.attempt.attempt_id).diagnosis!.synthetic).toBe(true);
  });
});

it('a complaint re-evaluation with a learning.v1 result supersedes only the disputed competency', async () => {
  const { ComplaintService } = await import('../../src/application/learning/complaints.js');
  const { st, wf, attemptId } = await realMode();
  await wf.submitWriting({ attempt_id: attemptId, request_key: 'sub-1', content: 'Essay.' });
  await work(st, wf, new ScriptedProvider((job, ctx) => sample({}, job.job_id, ctx.manifest_id)));
  const target = st.db.prepare('SELECT observation_id FROM observations WHERE competency_id = ?').get(SYNTHETIC_COMPETENCY_ID) as { observation_id: string };
  const complaints = new ComplaintService(st);
  const { job_id } = complaints.request({ request_key: 'c1', observation_id: target.observation_id, reason: 'Mình nghĩ đoạn 2 vẫn giữ lập trường.' });
  await processNextJob({ queue: st.queue, adapter: new ScriptedProvider((job, ctx) => { const r = sample({}, job.job_id, ctx.manifest_id); r.competencies[0]!.outcome = 'met'; return r; }),
    loadContext: (id) => st.learning.loadManifestPayload(id), interpret: (r, c) => complaints.interpret(r, c), owner: 'complaints-test', leaseMs: 60_000, heartbeatMs: 10_000,
    provider: 'codex', claimOptions: { scopes: ['learner'], complaintsOnly: true, jobId: job_id } });
  expect(st.db.prepare('SELECT competency_id, outcome FROM observations WHERE supersedes_id = ?').all(target.observation_id)).toEqual([{ competency_id: SYNTHETIC_COMPETENCY_ID, outcome: 'met' }]);
});
