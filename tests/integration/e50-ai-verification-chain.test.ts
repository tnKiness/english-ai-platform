// E-50 (D-05 C3 rest + C5): paragraph tasks for 7A, the verification chain on AI-authored prompts (Bước 6 self-check
// → novel 7A paragraph → 7B scheduled on a novel essay), N6 random sample review, N8 coverage and replenishment.
// Assessment runs through the learning worker with a scripted adapter (no real AI): application side only.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AdapterResult, Context, Job, ProviderAdapter, WritingAssessment } from '../../src/application/ai/provider-adapter.js';
import type { AuthoringExecutor, FrameworkDocument } from '../../src/application/authoring/framework-authoring.js';
import { ItemAuthoringService, type ItemPolicy } from '../../src/application/authoring/item-authoring.js';
import { LearningWorkflowService } from '../../src/application/learning/writing-workflow.js';
import { checkItems, type ItemReviewResult, type Wt2ItemDraft, type Wt2ItemSetResult } from '../../src/domain/knowledge/item-checks.js';
import { validateAiResult } from '../../src/infrastructure/ai/result-contracts.js';
import { buildTaskInput } from '../../src/infrastructure/ai/task-instructions.js';
import { loadItemPolicy } from '../../src/infrastructure/authoring/framework-sources.js';
import { sourcesDir } from '../../src/infrastructure/sources/crawler.js';
import { SourceReview } from '../../src/infrastructure/sources/review.js';
import { builderPipeline, type Store } from '../../src/infrastructure/sqlite/store.js';
import { processNextJob } from '../../src/worker/worker.js';
import { fixture, type Fixture } from './p1-helpers.js';

const COMPS = ['wt2.tr.clear_position', 'wt2.cc.logical_organisation', 'wt2.lr.precise_word_choice'];
const TAIL = ' Give reasons for your answer and include any relevant examples from your own knowledge or experience.';
const PROMPTS = {
  parks: `Some city councils plan to turn unused car parks into community vegetable gardens run by volunteers. To what extent do you agree or disagree with this plan?${TAIL}`,
  museums: `Many museums now charge visitors for special exhibitions while keeping their permanent collections free. Discuss both views on whether museums should charge entry fees and give your own opinion.${TAIL}`,
  trains: `Night trains are returning across several continents as travellers look for alternatives to short flights between capital cities. Do the advantages of this trend outweigh the disadvantages?${TAIL}`,
  para: 'A town plans to replace its weekly street market with an online ordering service for local farm produce. Write one body paragraph arguing for or against this plan, developing a single main idea. Write one paragraph of at least 100 words.',
  para2: 'Some universities now record every lecture and let students skip attending in person if they prefer to study at home. Write one body paragraph explaining one likely effect of this policy. Write one paragraph of at least 100 words.',
};
const POLICY: ItemPolicy = { ...loadItemPolicy(), item_set_id: 'test-items' };

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
    competencies: COMPS.map((id) => ({ competency_id: id, criterion: 'task_response', title_vi: `Tên ${id}`, assessor_criterion: `Criterion for ${id}.`, target_claim: 'c',
      evidence_required: ['e'], evidence_conditions: ['c'], confounders: [], inference_limits: ['l'], edges: [], source_quotes: [] })),
    rubric: {
      official: [{ source_ref: ref, criterion: 'Task Response', band: 7, locator: 'trang 1, Task Response, Band 7', descriptor: 'x' }],
      observation_guide: COMPS.map((id) => ({ competency_id: id, signal: `Signal ${id}`, counter_evidence: [], valid_exceptions: [], inconclusive_when: ['Too short'] })),
      aggregation: { method: 'holistic_by_criterion', notes: ['Holistic.'] },
    },
    limitations: [], checks: { errors: 0, warnings: 0, findings: [] },
  } as FrameworkDocument;
}

const draft = (key: keyof typeof PROMPTS, over: Partial<Wt2ItemDraft> = {}): Wt2ItemDraft => ({
  item_key: key, genre: 'opinion', topic: `Topic ${key}`, item_family: `fam_${key}`, prompt: PROMPTS[key], test_type: 'both', competencies: COMPS, difficulty_estimate: 'middle', rationale: 'r', ...over,
});
function executor(batches: Wt2ItemDraft[][]): AuthoringExecutor & { tasks: string[]; payloads: Record<string, unknown>[] } {
  const tasks: string[] = []; const payloads: Record<string, unknown>[] = []; let n = 0;
  const fn = (async (task, payload) => {
    tasks.push(task); payloads.push(payload);
    if (task === 'content.item_author') {
      const set: Wt2ItemSetResult = { schema_version: '1', job_id: 'j', context_manifest_id: 'm', synthetic: false, limitations: [], items: batches[n++] ?? [] };
      return { result: { ok: true, result: set } as AdapterResult, provider: 'claude-code', cli_version: '1', model: 'm' };
    }
    const review: ItemReviewResult = { schema_version: '1', job_id: 'j', context_manifest_id: 'm', synthetic: false, limitations: [],
      items: (payload.items as { item_key: string }[]).map((i) => ({ item_key: i.item_key, verdict: 'pass' as const, findings: [] })) };
    return { result: { ok: true, result: review } as AdapterResult, provider: 'claude-code', cli_version: '1', model: 'm' };
  }) as AuthoringExecutor & { tasks: string[]; payloads: Record<string, unknown>[] };
  fn.tasks = tasks; fn.payloads = payloads; return fn;
}
const service = (fx: Fixture, fw: FrameworkDocument | null, policy = POLICY) => new ItemAuthoringService(fx.store, builderPipeline(fx.store), () => fw, policy);

/** Assessment: every competency in the context gets the scripted outcome; a not_met one becomes the priority issue. */
class Scripted implements ProviderAdapter {
  constructor(public outcome: (competencyId: string) => 'met' | 'not_met') {}
  readonly seen: Readonly<Record<string, unknown>>[] = [];
  async inspectAuth() { return { authenticated: true, synthetic: false }; }
  async inspectEntitlement() { return { verified: true, billing: 'subscription_only' as const, synthetic: false }; }
  async readQuotaIfSupported() { return { remaining: null, observed_at: new Date().toISOString(), source: 'test' }; }
  async execute(_r: string, job: Job, ctx: Context) {
    this.seen.push(ctx.payload);
    const comps = (ctx.payload.competencies as { competency_id: string }[]).map((c) => c.competency_id);
    const notMet = comps.filter((c) => this.outcome(c) === 'not_met');
    const result: WritingAssessment = {
      schema_version: '1', job_id: job.job_id, context_manifest_id: ctx.manifest_id, synthetic: false, processing: 'processed',
      competencies: comps.map((c) => ({ competency_id: c, outcome: this.outcome(c), measurement_quality: 'sufficient', opportunity: 'observed', evidence_refs: ['p'], rationale: 'r' })),
      diagnosis: {
        priority_issues: notMet.slice(0, 1).map((c) => ({ competency_id: c, location: 'Đoạn 2', symptom: 's', hypothesis: 'h', expected_verification: 'v', impact: 2, certainty: 2 })),
        other_issues: [],
        hints: notMet.length ? { level_1: 'Xem lại đoạn 2.', level_2: 'Mỗi câu phát triển ý chính.', level_3_explanation: 'Giải thích.', model_rewrite: 'Moreover, gardens give neighbours a reason to meet.',
          concept_check_question: 'Vì sao?', concept_check_expected: 'mạch ý' } : null,
      },
      limitations: [],
    };
    return { result };
  }
  async cancel() { /* nothing */ }
  normalizeResult(raw: unknown): AdapterResult { const r = (raw as { result: unknown }).result; return validateAiResult('writing.assess', r) ? { ok: true, result: r as WritingAssessment } : { ok: false, error: 'INVALID_SCHEMA' }; }
}
const work = (st: Store, wf: LearningWorkflowService, adapter: ProviderAdapter) => processNextJob({
  queue: st.queue, adapter, loadContext: (id) => st.learning.loadManifestPayload(id), interpret: (r, c) => wf.interpretJob(r, c.job.job_id),
  owner: 'e50', leaseMs: 60_000, heartbeatMs: 10_000, provider: 'claude-code', claimOptions: { scopes: ['learner'], excludeComplaints: true },
});

describe('E-50 paragraph tasks (7A, N5)', () => {
  it('a paragraph task targets exactly one competency and must match the requested scope; instructions explain both', () => {
    const codes = checkItems([draft('para', { task_scope: 'paragraph' }), draft('para2', { task_scope: 'paragraph', competencies: [COMPS[1]!] }), draft('parks')],
      { competencies: new Set(COMPS), existing: [], similarity_threshold: 0.6, min_prompt_words: 25, task_scope: 'paragraph' }).map((x) => `${x.item_key}:${x.code}`);
    expect(codes).toEqual(['para:PARAGRAPH_TARGET', 'parks:TASK_SCOPE_MISMATCH']);
    expect(buildTaskInput('content.item_author', 'j', 'm', {})).toContain('"paragraph": short transfer tasks');
    expect(buildTaskInput('content.item_review', 'j', 'm', {})).toContain('asking for one paragraph is the role of the task');
  });
});

describe('E-50 verification chain on AI-authored prompts', () => {
  it('practice → diagnosis → Bước 6 self-check → novel 7A paragraph → 7B scheduled on a novel essay; the bank keeps paragraphs unseen', async () => {
    f = await fixture(); const fw = seedFramework(f);
    const items = service(f, fw);
    const essays = await items.author(executor([[draft('parks'), draft('museums', { genre: 'discussion' })]]));
    const paras = await items.author(executor([[draft('para', { task_scope: 'paragraph', competencies: [COMPS[1]!] })]]), 1, { task_scope: 'paragraph' });
    expect([...essays.items, ...paras.items].map((i) => i.release_state)).toEqual(['active', 'active', 'active']);
    const id = (k: string) => [...essays.items, ...paras.items].find((i) => i.item_key === k)!.item_id;

    const wf = new LearningWorkflowService(f.store, undefined, { aiMode: 'real', framework: () => fw });
    expect(wf.writingBank().items.map((i) => i.item_id).sort()).toEqual([id('museums'), id('parks')].sort()); // paragraphs are for 7A only
    expect(() => wf.startAttempt({ request_key: 'p0', item_id: id('para'), mode: 'self_practice', purpose: 'practice' })).toThrow(expect.objectContaining({ code: 'AI_ITEM_PRACTICE_ONLY' }));

    const start = wf.startAttempt({ request_key: 'p1', item_id: id('parks'), mode: 'self_practice', purpose: 'practice' });
    await wf.submitWriting({ attempt_id: start.attempt.attempt_id, request_key: 's1', content: 'Essay one.' });
    await work(f.store, wf, new Scripted((c) => (c === COMPS[1] ? 'not_met' : 'met')));
    expect(wf.getWorkspaceView(start.attempt.attempt_id).loop).toMatchObject({ competency_id: COMPS[1], step: 5, step6_self_check: true });

    // Bước 6: the lesson is the checked level-3 explanation; showing it records an explanation exposure.
    const step6View = wf.getWorkspaceView(start.attempt.attempt_id);
    if (step6View.loop!.step6_lesson) expect(step6View.loop!.step6_lesson.concept_question).toBe('Vì sao?');
    expect(wf.completeStep6(start.attempt.attempt_id, 'nối ý với câu chủ đề').loop!.step6_expected).toBe('mạch ý');
    expect(wf.completeStep6(start.attempt.attempt_id, 'nối ý', false).loop).toMatchObject({ step6_completed: false, concept_check_passed: false });
    expect(wf.completeStep6(start.attempt.attempt_id, 'nối ý', true).loop).toMatchObject({ step6_completed: true, step: 7 });

    // 7A: a novel paragraph task for the loop competency, assessed on that one competency only.
    const a7 = wf.startStep7A(start.attempt.attempt_id, '7a');
    expect(a7.attempt).toMatchObject({ purpose: '7A', mode: 'self_practice', item: { id: id('para') }, rubric: { id: `${id('para')}-rubric` } });
    expect(a7.task_prompt).toMatchObject({ prompt: PROMPTS.para, min_words: 100, recommended_minutes: 15 });
    expect(wf.startStep7A(start.attempt.attempt_id, '7a-again').attempt.attempt_id).toBe(a7.attempt.attempt_id);
    await wf.submitWriting({ attempt_id: a7.attempt.attempt_id, request_key: 's7a', content: 'A paragraph.' });
    const adapter = new Scripted(() => 'met');
    await work(f.store, wf, adapter);
    expect((adapter.seen[0]!.competencies as { competency_id: string }[]).map((c) => c.competency_id)).toEqual([COMPS[1]]);
    wf.getWorkspaceView(a7.attempt.attempt_id); // finalise
    const rec = wf.evidenceRecords(COMPS[1]!).find((r) => r.attempt_id === a7.attempt.attempt_id);
    expect(rec).toMatchObject({ purpose: '7A', breadth: 'short', synthetic: false, outcome: 'met' });

    // 7B goes to the only essay still novel (museums); parks was seen.
    const tasks = f.store.db.prepare("SELECT purpose, competency_id, item_id, rubric_id, synthetic, state FROM scheduled_tasks WHERE competency_id = ?").all(COMPS[1]);
    expect(tasks).toEqual([{ purpose: '7B', competency_id: COMPS[1], item_id: id('museums'), rubric_id: `${id('museums')}-rubric`, synthetic: 0, state: 'PENDING' }]);
  });

  it('no novel paragraph for the loop competency → 7A refused with a coverage gap that C5 turns into a focused batch', async () => {
    f = await fixture(); const fw = seedFramework(f);
    const items = service(f, fw);
    await items.author(executor([[draft('parks')]]));
    const wf = new LearningWorkflowService(f.store, undefined, { aiMode: 'real', framework: () => fw });
    const start = wf.startAttempt({ request_key: 'p1', item_id: wf.writingBank().items[0]!.item_id, mode: 'exam', purpose: 'practice' });
    await wf.submitWriting({ attempt_id: start.attempt.attempt_id, request_key: 's1', content: 'Essay.' });
    await work(f.store, wf, new Scripted((c) => (c === COMPS[2] ? 'not_met' : 'met')));
    wf.getWorkspaceView(start.attempt.attempt_id);
    wf.completeStep6(start.attempt.attempt_id, 'x', true);
    expect(() => wf.startStep7A(start.attempt.attempt_id, '7a')).toThrow(expect.objectContaining({ code: 'NO_ELIGIBLE_7A_TASK' }));

    const cov = items.coverage();
    expect(cov.cells[0]).toMatchObject({ task_scope: 'paragraph', unseen: 0, deficient: true, focus: [COMPS[2]] });
    expect(cov.cells[1]).toMatchObject({ task_scope: 'essay', unseen: 0, deficient: true }); // parks was seen
    const ex = executor([[draft('para2', { task_scope: 'paragraph', competencies: [COMPS[2]!] })], [draft('trains', { genre: 'advantages_disadvantages' }), draft('museums', { genre: 'discussion' })]]);
    const r = await items.replenish(ex);
    expect(r.ran.map((x) => [x.task_scope, x.released])).toEqual([['paragraph', 1], ['essay', 2]]);
    expect(ex.payloads[0]).toMatchObject({ requirements: { task_scope: 'paragraph', focus_competencies: [COMPS[2]] } });
    expect(wf.startStep7A(start.attempt.attempt_id, '7a-2').attempt.purpose).toBe('7A');
  });

  it('C5 respects the N8 daily cap and reports a missing framework instead of failing', async () => {
    f = await fixture(); const fw = seedFramework(f);
    expect(await service(f, null).replenish(executor([]))).toEqual({ ran: [], skipped: ['FRAMEWORK_NOT_APPROVED'] });
    const items = service(f, fw, { ...POLICY, daily_ai_call_cap: 2 });
    const r = await items.replenish(executor([[draft('para', { task_scope: 'paragraph', competencies: [COMPS[0]!] })], [draft('parks')]]));
    expect(r.ran).toHaveLength(1);
    expect(r.skipped).toEqual(['DAILY_CAP:essay']);
  });
});

describe('E-50 N6 random sample review', () => {
  it('drawing shows the prompt and records the exposure first; revoking goes through the pipeline; a sample is decided once', async () => {
    f = await fixture(); const fw = seedFramework(f);
    const items = service(f, fw);
    await items.author(executor([[draft('parks'), draft('museums', { genre: 'discussion' })]]));
    const drawn = items.drawSamples(1);
    expect(drawn).toHaveLength(1);
    expect([PROMPTS.parks, PROMPTS.museums]).toContain(drawn[0]!.prompt);
    expect(f.store.learning.exposures().some((e) => e.item_id === drawn[0]!.item_id && e.level === 'prompt')).toBe(true);
    const second = items.drawSamples(5);
    expect(second.map((s) => s.item_id)).not.toContain(drawn[0]!.item_id); // never the same prompt twice
    expect(items.drawSamples(5)).toEqual([]);
    expect(() => items.decideSample(drawn[0]!.sample_id, 'revoke', ' ')).toThrow(expect.objectContaining({ code: 'NOTE_REQUIRED' }));
    const decided = items.decideSample(drawn[0]!.sample_id, 'revoke', 'Mơ hồ');
    expect(decided).toMatchObject({ decision: 'revoke', release_state: 'suspended' });
    expect(f.store.knowledge.servableItem(drawn[0]!.item_id, 'v1', 'learner').ok).toBe(false);
    expect(() => items.decideSample(drawn[0]!.sample_id, 'keep', '')).toThrow(expect.objectContaining({ code: 'ALREADY_DECIDED' }));
    expect(items.decideSample(second[0]!.sample_id, 'keep', '')).toMatchObject({ decision: 'keep', release_state: 'active' });
    expect(() => f!.store.db.prepare("UPDATE item_sample_reviews SET decision = 'revoke'").run()).toThrow(/immutable/);
  });
});
