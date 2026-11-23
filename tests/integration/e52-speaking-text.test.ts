// E-52 (E-43, D-05 N4/N5): Speaking judged on text only — framework checks per policy (spk prefix, three criteria, no
// Pronunciation), Speaking parts authored like Writing prompts (part1 = short/7A, part2/3 = practice), served in the
// bank and assessed with the Speaking framework criteria. Stub executor and scripted assessor: no real AI here.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AdapterResult, Context, Job, ProviderAdapter, WritingAssessment } from '../../src/application/ai/provider-adapter.js';
import type { AuthoringExecutor, FrameworkDocument } from '../../src/application/authoring/framework-authoring.js';
import { ItemAuthoringService } from '../../src/application/authoring/item-authoring.js';
import { LearningWorkflowService } from '../../src/application/learning/writing-workflow.js';
import { checkFramework, type FrameworkResult } from '../../src/domain/knowledge/framework-checks.js';
import type { ItemReviewResult, Wt2ItemDraft, Wt2ItemSetResult } from '../../src/domain/knowledge/item-checks.js';
import { aiResultErrors, validateAiResult } from '../../src/infrastructure/ai/result-contracts.js';
import { buildTaskInput } from '../../src/infrastructure/ai/task-instructions.js';
import { FRAMEWORK_POLICY_FILES, ITEM_POLICY_FILES, loadFrameworkPolicy, loadItemPolicy } from '../../src/infrastructure/authoring/framework-sources.js';
import { sourcesDir } from '../../src/infrastructure/sources/crawler.js';
import { SourceReview } from '../../src/infrastructure/sources/review.js';
import { builderPipeline, type Store } from '../../src/infrastructure/sqlite/store.js';
import { processNextJob } from '../../src/worker/worker.js';
import { fixture, type Fixture } from './p1-helpers.js';

const SPK = ['spk.fc.develop_answer', 'spk.lr.topic_vocabulary', 'spk.gra.complex_forms'];
const SPEAKING_POLICY = loadFrameworkPolicy(resolve(FRAMEWORK_POLICY_FILES.speaking!));
const ITEM_POLICY = { ...loadItemPolicy(resolve(ITEM_POLICY_FILES.speaking!)), item_set_id: 'test-spk-items' };

let f: Fixture | undefined;
afterEach(() => { f?.cleanup(); f = undefined; });

const comp = (id: string, criterion: FrameworkResult['competencies'][number]['criterion']) => ({ competency_id: id, criterion, title_vi: id, assessor_criterion: `Criterion ${id}.`, target_claim: 'c',
  evidence_required: ['e'], evidence_conditions: ['c'], confounders: [], inference_limits: ['l'], edges: [], source_quotes: [] });

describe('E-52 Speaking text framework', () => {
  it('the policy covers three criteria under spk, drops Pronunciation; checks enforce namespace and scope', () => {
    expect(SPEAKING_POLICY.requirements).toMatchObject({ criteria: ['fluency_coherence', 'lexical_resource', 'grammatical_range_accuracy'], id_prefix: 'spk' });
    expect(SPEAKING_POLICY.band_table?.exclude_criteria).toEqual(['Pronunciation']);
    const fw: FrameworkResult = { schema_version: '1', job_id: 'j', context_manifest_id: 'm', synthetic: false, limitations: [], aggregation_notes: [], observation_guide: [],
      competencies: [comp('spk.fc.aa', 'fluency_coherence'), comp('spk.fc.bb', 'fluency_coherence'), comp('spk.lr.aa', 'lexical_resource'), comp('spk.lr.bb', 'lexical_resource'),
        comp('spk.gra.aa', 'grammatical_range_accuracy'), comp('spk.gra.bb', 'grammatical_range_accuracy'), comp('wt2.tr.xx', 'task_response')] };
    expect(aiResultErrors('content.author', fw).filter((e) => /pattern|enum/.test(e))).toEqual([]); // spk ids and fluency_coherence are valid in the contract
    const codes = checkFramework(fw, [], SPEAKING_POLICY.requirements).findings.filter((x) => x.severity === 'error').map((x) => `${x.code}:${x.target}`);
    expect(codes).toEqual(['FW_ID_NAMESPACE:wt2.tr.xx', 'FW_CRITERION_OUT_OF_SCOPE:wt2.tr.xx']);
    const text = buildTaskInput('content.author', 'j', 'm', {});
    expect(text).toContain('DATA.context.requirements.criteria');
    expect(text).toContain('create no competency for it');
  });
});

function seedFramework(fx: Fixture): FrameworkDocument {
  const dir = sourcesDir(fx.store.paths); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'bd.pdf'), '%PDF synthetic');
  fx.store.db.prepare(`INSERT INTO source_candidates (candidate_id, url, host, origin, depth, fetch_state, http_status, content_type, title, byte_size, sha256, stored_path, text_chars, kind, skill, review_state, created_at, updated_at, fetched_at)
    VALUES ('c-bd', 'https://ielts.example/spk.pdf', 'ielts.example', 'official', 0, 'FETCHED', 200, 'application/pdf', 'bd', 10, ?, 'bd.pdf', 10, 'band_descriptors', 'speaking', 'PENDING', 't', 't', '2026-11-19T00:00:00.000Z')`).run('a'.repeat(64));
  new SourceReview(fx.store.db, fx.store.paths, fx.store.builder, fx.clock.now).review(['c-bd'], 'approve');
  const r = fx.store.db.prepare("SELECT source_id, source_version FROM source_candidates WHERE candidate_id = 'c-bd'").get() as { source_id: string; source_version: string };
  const ref = `${r.source_id}@${r.source_version}`;
  return {
    schema_version: '1', framework_id: 'ielts-speaking-text', version: 'v1', task: 'Speaking', policy_decision: 'test',
    author: { run_id: 'r', provider: 'claude-code', cli_version: '1', model: 'm', synthetic: false }, revised_from: null,
    sources: [{ source_ref: ref, url: 'https://ielts.example/spk.pdf', title: 'bd', role: 'band_descriptors' }],
    competencies: [comp(SPK[0]!, 'fluency_coherence'), comp(SPK[1]!, 'lexical_resource'), comp(SPK[2]!, 'grammatical_range_accuracy')],
    rubric: { official: [{ source_ref: ref, criterion: 'Fluency and Coherence', band: 7, locator: 'trang 1, Fluency and Coherence, Band 7', descriptor: 'x' }],
      observation_guide: SPK.map((id) => ({ competency_id: id, signal: `Signal ${id}`, counter_evidence: [], valid_exceptions: [], inconclusive_when: ['Too short'] })),
      aggregation: { method: 'holistic_by_criterion', notes: ['Holistic.'] } },
    limitations: [], checks: { errors: 0, warnings: 0, findings: [] },
  } as FrameworkDocument;
}
const draft = (key: string, genre: Wt2ItemDraft['genre'], prompt: string, over: Partial<Wt2ItemDraft> = {}): Wt2ItemDraft => ({
  item_key: key, genre, topic: `Topic ${key}`, item_family: `fam_${key}`, prompt, test_type: 'both', competencies: SPK, difficulty_estimate: 'middle', rationale: 'r', ...over });
const PART2 = 'Describe a park or garden in your town that you like to visit. You should say: where it is, how often you go there, what you do there, and explain why you like it. Answer in writing as you would speak.';
const PART3 = 'Why do some people prefer quiet green spaces to busy city centres? How might cities change their public spaces in the future? Answer in writing as you would speak.';
const PART1 = 'Let us talk about your hometown. Where is your hometown? What do you like most about it? Has it changed much since you were a child? Answer in writing as you would speak.';

function executor(sets: Wt2ItemDraft[][]): AuthoringExecutor & { payloads: Record<string, unknown>[] } {
  const payloads: Record<string, unknown>[] = []; let n = 0;
  const fn = (async (task, payload) => {
    payloads.push(payload);
    if (task === 'content.item_author') return { result: { ok: true, result: { schema_version: '1', job_id: 'j', context_manifest_id: 'm', synthetic: false, limitations: [], items: sets[n++] ?? [] } satisfies Wt2ItemSetResult } as AdapterResult, provider: 'claude-code', cli_version: '1', model: 'm' };
    const review: ItemReviewResult = { schema_version: '1', job_id: 'j', context_manifest_id: 'm', synthetic: false, limitations: [], items: (payload.items as { item_key: string }[]).map((i) => ({ item_key: i.item_key, verdict: 'pass' as const, findings: [] })) };
    return { result: { ok: true, result: review } as AdapterResult, provider: 'claude-code', cli_version: '1', model: 'm' };
  }) as AuthoringExecutor & { payloads: Record<string, unknown>[] };
  fn.payloads = payloads; return fn;
}
class Scripted implements ProviderAdapter {
  readonly seen: Readonly<Record<string, unknown>>[] = [];
  async inspectAuth() { return { authenticated: true, synthetic: false }; }
  async inspectEntitlement() { return { verified: true, billing: 'subscription_only' as const, synthetic: false }; }
  async readQuotaIfSupported() { return { remaining: null, observed_at: new Date().toISOString(), source: 'test' }; }
  async execute(_r: string, job: Job, ctx: Context) {
    this.seen.push(ctx.payload);
    const comps = (ctx.payload.competencies as { competency_id: string }[]).map((c) => c.competency_id);
    const result: WritingAssessment = { schema_version: '1', job_id: job.job_id, context_manifest_id: ctx.manifest_id, synthetic: false, processing: 'processed',
      competencies: comps.map((c) => ({ competency_id: c, outcome: 'met', measurement_quality: 'sufficient', opportunity: 'observed', evidence_refs: [], rationale: 'r' })),
      diagnosis: { priority_issues: [], other_issues: [], hints: null }, limitations: [] };
    return { result };
  }
  async cancel() { /* nothing */ }
  normalizeResult(raw: unknown): AdapterResult { const r = (raw as { result: unknown }).result; return validateAiResult('writing.assess', r) ? { ok: true, result: r as WritingAssessment } : { ok: false, error: 'INVALID_SCHEMA' }; }
}
const work = (st: Store, wf: LearningWorkflowService, adapter: ProviderAdapter) => processNextJob({
  queue: st.queue, adapter, loadContext: (id) => st.learning.loadManifestPayload(id), interpret: (r, c) => wf.interpretJob(r, c.job.job_id),
  owner: 'e52', leaseMs: 60_000, heartbeatMs: 10_000, provider: 'claude-code', claimOptions: { scopes: ['learner'], excludeComplaints: true },
});

describe('E-52 Speaking parts answered in writing', () => {
  it('authors Speaking parts under spk, serves part2/part3 in the bank, assesses with Speaking criteria, records speaking evidence', async () => {
    f = await fixture(); const fw = seedFramework(f);
    const items = new ItemAuthoringService(f.store, builderPipeline(f.store), () => fw, ITEM_POLICY);
    const ex = executor([[draft('park', 'part2', PART2), draft('spaces', 'part3', PART3)], [draft('home', 'part1', PART1, { task_scope: 'paragraph', competencies: [SPK[0]!] })]]);
    const essays = await items.author(ex, 2);
    const shorts = await items.author(ex, 1, { task_scope: 'paragraph' });
    expect(ex.payloads[0]).toMatchObject({ requirements: { skill: 'speaking', genres: ['part1', 'part2', 'part3'] } });
    expect([...essays.items, ...shorts.items].map((i) => [i.item_id.startsWith('spk-ai-'), i.release_state])).toEqual([[true, 'active'], [true, 'active'], [true, 'active']]);

    const wf = new LearningWorkflowService(f.store, undefined, { aiMode: 'real', framework: (_v, skill) => (skill === 'speaking' ? fw : null) });
    const bank = wf.writingBank().items;
    expect(bank.map((i) => i.title).sort()).toEqual(['Speaking Part 2 — Topic park', 'Speaking Part 3 — Topic spaces']); // part1 kept for 7A
    expect(items.coverage().cells.find((c) => c.task_scope === 'paragraph')!.unseen).toBe(1);

    const start = wf.startAttempt({ request_key: 's', item_id: bank.find((i) => i.title.includes('Part 2'))!.item_id, mode: 'self_practice', purpose: 'practice' });
    expect(start.task_prompt).toMatchObject({ skill: 'speaking_text', min_words: 120, recommended_minutes: 15 });
    expect(start.task_prompt.criteria_summary).toContain('Không chấm phát âm (E-43)');
    await wf.submitWriting({ attempt_id: start.attempt.attempt_id, request_key: 'sub', content: 'Well, the park I like most is near my house...' });
    const adapter = new Scripted();
    await work(f.store, wf, adapter);
    expect(adapter.seen[0]).toMatchObject({ task: { skill: 'speaking_text', min_words: 120 }, competencies: SPK.map((id) => ({ competency_id: id, title: id, criterion: `Criterion ${id}.` })) });
    expect(buildTaskInput('writing.assess', 'j', 'm', {})).toContain('never judge pronunciation');
    wf.getWorkspaceView(start.attempt.attempt_id);
    expect(wf.evidenceRecords(SPK[0]!)).toEqual([expect.objectContaining({ synthetic: false, outcome: 'met', condition: expect.objectContaining({ modality: 'speaking' }) })]);
    expect(wf.progressView().competencies.map((c: { competency_id: string }) => c.competency_id)).toEqual(expect.arrayContaining(SPK));
  });
});
