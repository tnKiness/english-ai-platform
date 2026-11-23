// E-49 (D-05 C3b): released AI-authored Writing Task 2 prompts served to the learner as practice, assessed against
// the framework competencies by a (scripted) real provider through the learning worker; the evidence counts (not
// synthetic), the loop focuses on the first not-met priority issue, Bước 6/7A stay synthetic-only, revocation stops
// serving. No real AI here: the adapter is scripted, so this proves the application side only.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AdapterResult, Context, Job, ProviderAdapter, WritingAssessment } from '../../src/application/ai/provider-adapter.js';
import type { AuthoringExecutor, FrameworkDocument } from '../../src/application/authoring/framework-authoring.js';
import { ItemAuthoringService } from '../../src/application/authoring/item-authoring.js';
import { LearningWorkflowService } from '../../src/application/learning/writing-workflow.js';
import type { ItemReviewResult, Wt2ItemSetResult } from '../../src/domain/knowledge/item-checks.js';
import { validateAiResult } from '../../src/infrastructure/ai/result-contracts.js';
import { loadItemPolicy } from '../../src/infrastructure/authoring/framework-sources.js';
import { sourcesDir } from '../../src/infrastructure/sources/crawler.js';
import { SourceReview } from '../../src/infrastructure/sources/review.js';
import { builderPipeline, type Store } from '../../src/infrastructure/sqlite/store.js';
import { processNextJob } from '../../src/worker/worker.js';
import { fixture, type Fixture } from './p1-helpers.js';

const COMPS = ['wt2.tr.clear_position', 'wt2.cc.logical_organisation', 'wt2.lr.precise_word_choice'];
const PROMPT = 'Some city councils plan to turn unused car parks into community vegetable gardens run by volunteers. To what extent do you agree or disagree with this plan? Give reasons for your answer and include any relevant examples from your own knowledge or experience.';
const REWRITE = 'Moreover, gardens give neighbours a reason to meet, which a car park never did.';

let f: Fixture | undefined;
afterEach(() => { f?.cleanup(); f = undefined; });

function seedFramework(fx: Fixture): FrameworkDocument {
  const dir = sourcesDir(fx.store.paths); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'bd.pdf'), '%PDF synthetic');
  fx.store.db.prepare(`INSERT INTO source_candidates (candidate_id, url, host, origin, depth, fetch_state, http_status, content_type, title, byte_size, sha256, stored_path, text_chars, kind, skill, review_state, created_at, updated_at, fetched_at)
    VALUES ('c-bd', 'https://ielts.example/bd.pdf', 'ielts.example', 'official', 0, 'FETCHED', 200, 'application/pdf', 'bd', 10, ?, 'bd.pdf', 10, 'band_descriptors', 'writing', 'PENDING', 't', 't', '2026-11-19T00:00:00.000Z')`).run('a'.repeat(64));
  new SourceReview(fx.store.db, fx.store.paths, fx.store.builder, fx.clock.now).review(['c-bd'], 'approve');
  const r = fx.store.db.prepare("SELECT source_id, source_version FROM source_candidates WHERE candidate_id = 'c-bd'").get() as { source_id: string; source_version: string };
  const ref = `${r.source_id}@${r.source_version}`;
  return {
    schema_version: '1', framework_id: 'test-wt2', version: 'v3', task: 'WT2', policy_decision: 'test',
    author: { run_id: 'r', provider: 'claude-code', cli_version: '1', model: 'm', synthetic: false }, revised_from: null,
    sources: [{ source_ref: ref, url: 'https://ielts.example/bd.pdf', title: 'bd', role: 'band_descriptors' }],
    competencies: COMPS.map((id) => ({ competency_id: id, criterion: 'task_response', title_vi: `Tên ${id}`, assessor_criterion: `Criterion for ${id}.`, target_claim: `Claim ${id}`,
      evidence_required: ['e'], evidence_conditions: ['c'], confounders: [], inference_limits: ['l'], edges: [], source_quotes: [] })),
    rubric: {
      official: [{ source_ref: ref, criterion: 'Task Response', band: 7, locator: 'trang 1, Task Response, Band 7', descriptor: 'x' }],
      observation_guide: COMPS.map((id) => ({ competency_id: id, signal: `Signal ${id}`, counter_evidence: [], valid_exceptions: [], inconclusive_when: ['Too short'] })),
      aggregation: { method: 'holistic_by_criterion', notes: ['Holistic.'] },
    },
    limitations: [], checks: { errors: 0, warnings: 0, findings: [] },
  } as FrameworkDocument;
}

async function releasedItem(fx: Fixture, fw: FrameworkDocument): Promise<{ item_id: string; package_id: string }> {
  const set: Wt2ItemSetResult = { schema_version: '1', job_id: 'j', context_manifest_id: 'm', synthetic: false, limitations: [], items: [{
    item_key: 'parks', genre: 'opinion', topic: 'Car parks to gardens', item_family: 'urban_gardens', prompt: PROMPT, test_type: 'both', competencies: COMPS, difficulty_estimate: 'middle', rationale: 'r' }] };
  const review: ItemReviewResult = { schema_version: '1', job_id: 'j', context_manifest_id: 'm', synthetic: false, limitations: [], items: [{ item_key: 'parks', verdict: 'pass', findings: [] }] };
  const ex: AuthoringExecutor = async (task) => ({ result: { ok: true, result: task === 'content.item_author' ? set : review } as AdapterResult, provider: 'claude-code', cli_version: '1', model: 'm' });
  const r = await new ItemAuthoringService(fx.store, builderPipeline(fx.store), () => fw, { ...loadItemPolicy(), item_set_id: 'test-items' }).author(ex);
  expect(r.items[0]!.release_state).toBe('active');
  return { item_id: r.items[0]!.item_id, package_id: r.items[0]!.package_id };
}

const assessment = (job: Job, ctx: Context): WritingAssessment => ({
  schema_version: '1', job_id: job.job_id, context_manifest_id: ctx.manifest_id, synthetic: false, processing: 'processed',
  competencies: [
    { competency_id: COMPS[0]!, outcome: 'met', measurement_quality: 'sufficient', opportunity: 'observed', evidence_refs: ['intro'], rationale: 'Clear position.' },
    { competency_id: COMPS[1]!, outcome: 'not_met', measurement_quality: 'sufficient', opportunity: 'observed', evidence_refs: ['para 2'], rationale: 'Ideas jump.' },
    { competency_id: COMPS[2]!, outcome: 'inconclusive', measurement_quality: 'insufficient', opportunity: 'observed', evidence_refs: [], rationale: 'Too short to tell.' },
  ],
  diagnosis: {
    priority_issues: [{ competency_id: COMPS[1]!, location: 'Đoạn 2', symptom: 'Ý nhảy, thiếu liên kết.', hypothesis: 'Chưa nối ý với câu chủ đề.', expected_verification: 'Viết lại đoạn 2.', impact: 2, certainty: 2 }],
    other_issues: [],
    hints: { level_1: 'Đọc lại đoạn 2: câu thứ hai nối với câu chủ đề thế nào?', level_2: 'Mỗi câu nên phát triển ý của câu chủ đề.', level_3_explanation: 'Câu mẫu nối ý về cộng đồng.',
      model_rewrite: REWRITE, concept_check_question: 'Vì sao cần nối câu với câu chủ đề?', concept_check_expected: 'mạch ý' },
  },
  limitations: [],
});
class Scripted implements ProviderAdapter {
  readonly seen: Readonly<Record<string, unknown>>[] = [];
  async inspectAuth() { return { authenticated: true, synthetic: false }; }
  async inspectEntitlement() { return { verified: true, billing: 'subscription_only' as const, synthetic: false }; }
  async readQuotaIfSupported() { return { remaining: null, observed_at: new Date().toISOString(), source: 'test' }; }
  async execute(_r: string, job: Job, ctx: Context) { this.seen.push(ctx.payload); return { result: assessment(job, ctx) }; }
  async cancel() { /* nothing */ }
  normalizeResult(raw: unknown): AdapterResult { const r = (raw as { result: unknown }).result; return validateAiResult('writing.assess', r) ? { ok: true, result: r as WritingAssessment } : { ok: false, error: 'INVALID_SCHEMA' }; }
}
const work = (st: Store, wf: LearningWorkflowService, adapter: ProviderAdapter) => processNextJob({
  queue: st.queue, adapter, loadContext: (id) => st.learning.loadManifestPayload(id), interpret: (r, c) => wf.interpretJob(r, c.job.job_id),
  owner: 'e49', leaseMs: 60_000, heartbeatMs: 10_000, provider: 'claude-code', claimOptions: { scopes: ['learner'], excludeComplaints: true },
});

describe('E-49 Writing bank (AI-authored prompts as practice)', () => {
  it('serves a released prompt only in real mode as practice; assessment uses the framework criteria; evidence counts', async () => {
    f = await fixture(); const fw = seedFramework(f);
    const { item_id, package_id } = await releasedItem(f, fw);
    const wf = new LearningWorkflowService(f.store, undefined, { aiMode: 'real', framework: () => fw });

    const bank = wf.writingBank();
    expect(bank).toMatchObject({ available: true, items: [{ item_id, title: 'Writing Task 2 — Car parks to gardens', competencies: 3, seen: false }] });
    expect(JSON.stringify(bank)).not.toContain('vegetable gardens'); // listing is not an exposure

    const synthetic = new LearningWorkflowService(f.store, undefined, { aiMode: 'synthetic', framework: () => fw });
    expect(synthetic.writingBank().available).toBe(false);
    expect(() => synthetic.startAttempt({ request_key: 's0', item_id, mode: 'self_practice', purpose: 'practice' })).toThrow(expect.objectContaining({ code: 'AI_ITEM_NEEDS_REAL_MODE' }));
    expect(() => wf.startAttempt({ request_key: 's1', item_id, mode: 'guided', purpose: 'lesson' })).toThrow(expect.objectContaining({ code: 'AI_ITEM_PRACTICE_ONLY' }));

    const start = wf.startAttempt({ request_key: 's2', item_id, mode: 'self_practice', purpose: 'practice' });
    expect(start.task_prompt).toMatchObject({ prompt: PROMPT, min_words: 250, title: 'Writing Task 2 — Car parks to gardens', input_support: null });
    expect(start.attempt.rubric.id).toBe(`${item_id}-rubric`);
    expect(JSON.stringify(start)).not.toMatch(/wt2\.cc\.logical_organisation|measurement_targets|essay_assessed_by_rubric/); // hidden targets stay on the server
    expect(wf.writingBank().items[0]!.seen).toBe(true);

    await wf.submitWriting({ attempt_id: start.attempt.attempt_id, request_key: 'sub', content: 'Converting car parks into gardens is a good idea because ...' });
    const adapter = new Scripted();
    await work(f.store, wf, adapter);
    const ctx = adapter.seen[0] as { task: { prompt: string; min_words: number }; competencies: { competency_id: string; criterion: string }[] };
    expect(ctx.task).toMatchObject({ prompt: PROMPT, min_words: 250 });
    expect(ctx.competencies).toEqual(COMPS.map((id) => ({ competency_id: id, title: `Tên ${id}`, criterion: `Criterion for ${id}.` })));

    const view = wf.getWorkspaceView(start.attempt.attempt_id);
    expect(view.diagnosis).toMatchObject({ synthetic: false, priority_issues: [{ competency_id: COMPS[1] }] });
    expect(view.loop).toMatchObject({ competency_id: COMPS[1], step: 5 });
    expect(view.submissions[0]).toMatchObject({ outcome: 'not_met', synthetic: false });
    expect(JSON.stringify(view)).not.toContain(REWRITE);
    expect(JSON.stringify(wf.unlockHint(start.attempt.attempt_id, 1, 'h1'))).not.toContain(REWRITE);
    expect(f.store.db.prepare('SELECT competency_id FROM assistance_impacts').all()).toEqual([{ competency_id: COMPS[1] }]);

    // The profile shows the framework competencies; this real evidence is not synthetic and is a composite practice task.
    const progress = wf.progressView();
    expect(progress.competencies.map((c: { competency_id: string }) => c.competency_id)).toEqual(expect.arrayContaining(COMPS));
    const rec = wf.evidenceRecords(COMPS[0]!);
    expect(rec).toEqual([expect.objectContaining({ outcome: 'met', synthetic: false, breadth: 'composite', item_id })]);

    // E-50 Bước 6: the key idea comes back once after an answer; the learner's self-check gates 7A, nothing else.
    expect(() => wf.startStep7A(start.attempt.attempt_id, 'x')).toThrow(expect.objectContaining({ code: 'STEP6_NOT_COMPLETED' }));
    expect(wf.completeStep6(start.attempt.attempt_id, 'nối ý').loop!.step6_expected).toBe('mạch ý');
    expect(wf.getWorkspaceView(start.attempt.attempt_id).loop!.step6_expected).toBeUndefined();
    expect(wf.completeStep6(start.attempt.attempt_id, 'nối ý', true).loop).toMatchObject({ step6_completed: true, concept_check_passed: true, step: 7 });
    // No novel paragraph task for that competency yet → a coverage gap, not a fallback to a synthetic or seen item.
    expect(() => wf.startStep7A(start.attempt.attempt_id, 'x')).toThrow(expect.objectContaining({ code: 'NO_ELIGIBLE_7A_TASK' }));
    expect(f.store.builder.reviews('open').some((r) => r.kind === 'coverage_gap' && r.target_id === COMPS[1])).toBe(true);

    // Revoking the prompt stops serving it; its history keeps its labels.
    builderPipeline(f.store).revoke({ target_kind: 'item', target_id: item_id, target_version: 'v1' }, 'test revoke');
    expect(f.store.knowledge.releaseState(package_id, 'v1')).toBe('suspended');
    expect(wf.writingBank().items).toEqual([]);
    expect(() => wf.startAttempt({ request_key: 's3', item_id, mode: 'exam', purpose: 'practice' })).toThrow(expect.objectContaining({ code: 'ITEM_NOT_SERVABLE' }));
    expect(wf.todayView().in_progress[0]!.title).toBe('Writing Task 2 — Car parks to gardens');
  });
});
