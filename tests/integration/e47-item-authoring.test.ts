// E-47 (D-05 C3): AI-authored Writing Task 2 prompts from the approved framework → deterministic pre-checks → Builder
// package (ai_authored) → QC1–QC3 → independent AI review as QC2/QC3 semantic + QC4 on the frozen hash → automatic
// release (N6) → N8 daily cap. The executor is a stub: no real AI here.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AdapterResult } from '../../src/application/ai/provider-adapter.js';
import type { AuthoringExecutor, FrameworkDocument } from '../../src/application/authoring/framework-authoring.js';
import { ItemAuthoringService, type ItemPolicy } from '../../src/application/authoring/item-authoring.js';
import { checkItems, promptSimilarity, type ItemReviewResult, type Wt2ItemDraft, type Wt2ItemSetResult } from '../../src/domain/knowledge/item-checks.js';
import { buildTaskInput } from '../../src/infrastructure/ai/task-instructions.js';
import { validateAiResult } from '../../src/infrastructure/ai/result-contracts.js';
import { loadItemPolicy } from '../../src/infrastructure/authoring/framework-sources.js';
import { sourcesDir } from '../../src/infrastructure/sources/crawler.js';
import { SourceReview } from '../../src/infrastructure/sources/review.js';
import { builderPipeline } from '../../src/infrastructure/sqlite/store.js';
import { createApp } from '../../src/server/app.js';
import { fixture, type Fixture } from './p1-helpers.js';

const POLICY: ItemPolicy = { ...loadItemPolicy(), item_set_id: 'test-items', daily_ai_call_cap: 10 };
const COMPS = ['wt2.tr.clear_position', 'wt2.cc.logical_organisation', 'wt2.lr.precise_word_choice', 'wt2.gra.sentence_accuracy'];

let f: Fixture | undefined;
afterEach(() => { f?.cleanup(); f = undefined; });

function seedFramework(fx: Fixture): FrameworkDocument {
  const dir = sourcesDir(fx.store.paths); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'bd.pdf'), '%PDF synthetic'); writeFileSync(join(dir, 'fmt.html'), '<html><title>Format</title><body><p>Task 2 essay.</p></body></html>');
  const ins = fx.store.db.prepare(`INSERT INTO source_candidates (candidate_id, url, host, origin, depth, fetch_state, http_status, content_type, title, byte_size, sha256, stored_path, text_chars, kind, skill, review_state, created_at, updated_at, fetched_at)
    VALUES (?, ?, 'ielts.example', 'official', 0, 'FETCHED', 200, ?, ?, 10, ?, ?, 10, ?, 'writing', 'PENDING', 't', 't', '2026-11-19T00:00:00.000Z')`);
  ins.run('c-bd', 'https://ielts.example/bd.pdf', 'application/pdf', 'band descriptors', 'a'.repeat(64), 'bd.pdf', 'band_descriptors');
  ins.run('c-fmt', 'https://ielts.example/format', 'text/html', 'Format', 'b'.repeat(64), 'fmt.html', 'test_format');
  new SourceReview(fx.store.db, fx.store.paths, fx.store.builder, fx.clock.now).review(['c-bd', 'c-fmt'], 'approve');
  const ref = (id: string) => { const r = fx.store.db.prepare('SELECT source_id, source_version FROM source_candidates WHERE candidate_id = ?').get(id) as { source_id: string; source_version: string }; return `${r.source_id}@${r.source_version}`; };
  return {
    schema_version: '1', framework_id: 'test-wt2', version: 'v3', task: 'WT2', policy_decision: 'test',
    author: { run_id: 'r', provider: 'claude-code', cli_version: '1', model: 'm', synthetic: false }, revised_from: null,
    sources: [{ source_ref: ref('c-bd'), url: 'https://ielts.example/bd.pdf', title: 'bd', role: 'band_descriptors' }, { source_ref: ref('c-fmt'), url: 'https://ielts.example/format', title: 'fmt', role: 'test_format' }],
    competencies: COMPS.map((id) => ({ competency_id: id, criterion: 'task_response', title_vi: id, assessor_criterion: `Criterion for ${id}.`, target_claim: 'c', evidence_required: ['e'],
      evidence_conditions: ['c'], confounders: [], inference_limits: ['l'], edges: [], source_quotes: [] })),
    rubric: {
      official: [{ source_ref: ref('c-bd'), criterion: 'Task Response', band: 7, locator: 'trang 1, Task Response, Band 7', descriptor: 'A clear position.' }],
      observation_guide: COMPS.map((id) => ({ competency_id: id, signal: `Signal ${id}`, counter_evidence: [], valid_exceptions: [], inconclusive_when: ['Too short to judge'] })),
      aggregation: { method: 'holistic_by_criterion', notes: ['Holistic per criterion.'] },
    },
    limitations: [], checks: { errors: 0, warnings: 0, findings: [] },
  } as FrameworkDocument;
}

const draft = (key: string, prompt: string, over: Partial<Wt2ItemDraft> = {}): Wt2ItemDraft => ({
  item_key: key, genre: 'opinion', topic: `Topic ${key}`, item_family: `family_${key}`, prompt, test_type: 'both', competencies: COMPS, difficulty_estimate: 'middle', rationale: 'Clear opinion prompt.', ...over,
});
const P = {
  parks: 'Some city councils plan to turn unused car parks into community vegetable gardens run by volunteers. To what extent do you agree or disagree with this plan? Give reasons for your answer and include any relevant examples from your own knowledge or experience.',
  museums: 'Many museums now charge visitors for special exhibitions while keeping their permanent collections free. Discuss both views on whether museums should charge entry fees and give your own opinion. Give reasons for your answer and include any relevant examples from your own knowledge or experience.',
  forced: 'Some schools now ask teenagers to complete unpaid community work before graduation. Write five paragraphs and use three linking words to explain whether you agree. Give reasons for your answer and include any relevant examples from your own knowledge or experience.',
};
const set = (items: Wt2ItemDraft[], synthetic = false): Wt2ItemSetResult => ({ schema_version: '1', job_id: 'j', context_manifest_id: 'm', synthetic, items, limitations: [] });
const reviewOf = (items: ItemReviewResult['items']): ItemReviewResult => ({ schema_version: '1', job_id: 'j', context_manifest_id: 'm', synthetic: false, items, limitations: [] });
const passAll = (payload: Record<string, unknown>): AdapterResult => ({ ok: true, result: reviewOf((payload.items as { item_key: string }[]).map((i) => ({ item_key: i.item_key, verdict: 'pass', findings: [] }))) });

function stub(author: () => AdapterResult, rev: (payload: Record<string, unknown>) => AdapterResult = passAll, provider = 'claude-code') {
  const calls: { task: string; payload: Record<string, unknown> }[] = [];
  const fn = (async (task, payload) => { calls.push({ task, payload }); return { result: task === 'content.item_author' ? author() : rev(payload), provider, cli_version: '1.0', model: 'test-model' }; }) as AuthoringExecutor & { calls: typeof calls };
  fn.calls = calls; return fn;
}
const svc = (fx: Fixture, fw: FrameworkDocument | null, policy = POLICY) => new ItemAuthoringService(fx.store, builderPipeline(fx.store), () => fw, policy);

describe('E-47 deterministic item checks', () => {
  it('flags unknown competencies, forced structure, given ideas and near-duplicates; similarity ignores the shared task wording', () => {
    expect(promptSimilarity(P.parks, P.parks.replace('car parks', 'parking lots'))).toBeGreaterThanOrEqual(POLICY.similarity_threshold);
    expect(promptSimilarity(P.parks, P.museums)).toBeLessThan(0.15);
    const items = [draft('a', P.parks), draft('b', P.forced), draft('c', `${P.museums} For example, you could mention ticket prices.`, { competencies: ['wt2.tr.made_up'] }), draft('d', P.parks.replace('volunteers', 'local volunteers'))];
    const codes = checkItems(items, { competencies: new Set(COMPS), existing: [], similarity_threshold: 0.6, min_prompt_words: 25 }).map((x) => `${x.item_key}:${x.code}`);
    expect(codes).toEqual(expect.arrayContaining(['b:FORCED_STRUCTURE', 'c:COMPETENCY_UNKNOWN', 'c:GIVEN_IDEAS', 'd:NEAR_DUPLICATE']));
    expect(codes.filter((c) => c.startsWith('a:'))).toEqual([]);
  });
  it('the result contracts and task instructions exist for both new task types', () => {
    expect(validateAiResult('content.item_author', set([draft('a', P.parks)]))).toBe(true);
    expect(validateAiResult('content.item_author', set([draft('a', 'too short')]))).toBe(false); // minLength 40
    expect(validateAiResult('content.item_review', reviewOf([{ item_key: 'a', verdict: 'pass', findings: [{ check: 'originality', severity: 'warning', issue: 'x' }] }]))).toBe(true);
    const text = buildTaskInput('content.item_author', 'job', 'man', {});
    expect(text).toContain('Never copy or lightly edit a published IELTS prompt');
    expect(text).toContain('Do not tell the learner how many paragraphs');
    expect(buildTaskInput('content.item_review', 'job', 'man', {})).toContain('"no_model_answer_or_ideas"');
  });
});

describe('E-47 authoring → QC → automatic release', () => {
  it('refuses before any AI call while no framework is approved', async () => {
    f = await fixture();
    const ex = stub(() => ({ ok: true, result: set([draft('a', P.parks)]) }));
    await expect(svc(f, null).author(ex)).rejects.toMatchObject({ code: 'FRAMEWORK_NOT_APPROVED' });
    const fw = seedFramework(f);
    await expect(svc(f, { ...fw, author: { ...fw.author, synthetic: true } }).author(ex)).rejects.toMatchObject({ code: 'SYNTHETIC' });
    expect(ex.calls).toEqual([]);
  });

  it('releases prompts that pass QC1–QC4 as ai_authored practice content; pre-check failures are never packaged', async () => {
    f = await fixture(); const fw = seedFramework(f);
    const ex = stub(() => ({ ok: true, result: set([draft('parks', P.parks), draft('forced', P.forced), draft('museums', P.museums, { genre: 'discussion' })]) }));
    const s = svc(f, fw);
    const r = await s.author(ex);
    expect(ex.calls.map((c) => c.task)).toEqual(['content.item_author', 'content.item_review']);
    // The author sees framework competencies (ids + criteria), never sources or learner data; the reviewer sees exactly the frozen prompts.
    expect(Object.keys(ex.calls[0]!.payload).sort()).toEqual(['avoid', 'framework', 'requirements', 'task']);
    expect((ex.calls[1]!.payload.items as { item_key: string }[]).map((i) => i.item_key)).toEqual(['parks', 'museums']);
    const by = Object.fromEntries(r.items.map((i) => [i.item_key, i]));
    expect(by.forced).toMatchObject({ precheck: 'rejected', release_state: null });
    expect(by.parks).toMatchObject({ precheck: 'passed', release_state: 'active' });
    expect(by.museums!.release_state).toBe('active');
    expect(by.parks!.qc.map((q) => `${q.stage}:${q.status}`)).toEqual(['QC1:PASS', 'QC2:PASS', 'QC3:PASS', 'QC4:PASS']);

    const pkg = by.parks!.package_id;
    expect(f.store.builder.bundle(pkg, 'v1')!.content_origin).toBe('ai_authored');
    expect(f.store.knowledge.servableItem(by.parks!.item_id, 'v1', 'learner').ok).toBe(true);
    const methods = f.store.db.prepare("SELECT stage, part, method FROM qc_results WHERE package_id = ? AND method <> 'deterministic' ORDER BY stage").all(pkg);
    expect(methods).toEqual([{ stage: 'QC2', part: 'semantic', method: 'ai_semantic' }, { stage: 'QC3', part: 'semantic', method: 'ai_semantic' }, { stage: 'QC4', part: 'deterministic', method: 'ai_semantic' }]);
    // The hidden measurement targets live in the answer key, which the learner and the blind solver never get.
    expect(f.store.builder.unitPermission('knowledge', `${by.parks!.item_id}-key`, 'v1')!.roles).toEqual(['verifier', 'assessor']);
    expect(s.list()).toEqual([expect.objectContaining({ batch_id: r.batch_id, items: 3, active: 2, rejected: 1, draft: 0 })]);
    // The console detail carries no prompt text (viewing a prompt is an exposure, logged by the package console).
    const detail = JSON.stringify(s.detail(r.batch_id));
    expect(detail).not.toContain('vegetable gardens');
    expect(detail).toContain(by.parks!.package_id);
    expect(f.store.db.prepare('SELECT task_type, ok FROM authoring_runs ORDER BY started_at, rowid').all()).toEqual([{ task_type: 'content.item_author', ok: 1 }, { task_type: 'content.item_review', ok: 1 }]);
  });

  it('a review error keeps that prompt in draft with a failed QC stage and an open issue; others still release', async () => {
    f = await fixture(); const fw = seedFramework(f);
    const ex = stub(() => ({ ok: true, result: set([draft('parks', P.parks), draft('museums', P.museums)]) }), () => ({ ok: true, result: reviewOf([
      { item_key: 'parks', verdict: 'pass', findings: [{ check: 'originality', severity: 'warning', issue: 'Common theme' }] },
      { item_key: 'museums', verdict: 'fail', findings: [{ check: 'genre_match', severity: 'error', issue: 'Instruction says discuss both views but genre is opinion' }] },
    ]) }));
    const r = await svc(f, fw).author(ex);
    const by = Object.fromEntries(r.items.map((i) => [i.item_key, i]));
    expect(by.parks!.release_state).toBe('active');
    expect(by.museums).toMatchObject({ release_state: 'draft' });
    expect(by.museums!.qc.find((q) => q.stage === 'QC4')!.status).toBe('FAIL');
    expect(by.museums!.release_reasons).toContain('QC_FAIL_QC4_DETERMINISTIC');
    expect(f.store.builder.reviews('open').some((x) => x.target_id === by.museums!.package_id)).toBe(true);
    expect(f.store.knowledge.servableItem(by.museums!.item_id, 'v1', 'learner').ok).toBe(false);
  });

  it('a FakeAdapter review is synthetic_fake: the gate refuses to release ai_authored content', async () => {
    f = await fixture(); const fw = seedFramework(f);
    const r = await svc(f, fw).author(stub(() => ({ ok: true, result: set([draft('parks', P.parks)]) }), passAll, 'fake'));
    expect(r.items[0]).toMatchObject({ release_state: 'draft' });
    expect(r.items[0]!.release_reasons).toContain('QC_SYNTHETIC_ON_SOURCED_QC4_DETERMINISTIC');
  });

  it('a failed review call leaves frozen drafts that items-review completes later', async () => {
    f = await fixture(); const fw = seedFramework(f);
    const s = svc(f, fw);
    const bad = stub(() => ({ ok: true, result: set([draft('parks', P.parks)]) }), () => ({ ok: false, error: 'TIMEOUT' }));
    await expect(s.author(bad)).rejects.toMatchObject({ code: 'AI_TIMEOUT' });
    const [batch] = s.list();
    expect(batch).toMatchObject({ items: 1, draft: 1, active: 0 });
    const good = stub(() => { throw new Error('author must not run'); });
    expect(await s.review(good, batch!.batch_id)).toMatchObject({ reviewed: 1, released: 1 });
    expect(await s.review(good, batch!.batch_id)).toMatchObject({ run_id: null, reviewed: 0 }); // nothing left to review: no AI call
    expect(good.calls.map((c) => c.task)).toEqual(['content.item_review']);
  });

  it('a later batch avoids and rejects near-duplicates of earlier prompts; the N8 daily cap stops calls before they run', async () => {
    f = await fixture(); const fw = seedFramework(f);
    const s = svc(f, fw, { ...POLICY, daily_ai_call_cap: 4 });
    await s.author(stub(() => ({ ok: true, result: set([draft('parks', P.parks)]) })));
    const second = stub(() => ({ ok: true, result: set([draft('parks2', P.parks.replace('volunteers', 'retired volunteers')), draft('museums', P.museums)]) }));
    const r = await s.author(second);
    expect((second.calls[0]!.payload.avoid as { prompt: string }[]).map((a) => a.prompt)).toEqual([P.parks]);
    expect(r.items.find((i) => i.item_key === 'parks2')).toMatchObject({ precheck: 'rejected' });
    expect(r.items.find((i) => i.item_key === 'museums')!.release_state).toBe('active');
    const third = stub(() => ({ ok: true, result: set([draft('x', P.museums)]) }));
    await expect(s.author(third)).rejects.toMatchObject({ code: 'DAILY_CAP', statusCode: 429 });
    expect(third.calls).toEqual([]);
    expect(s.callsToday()).toBe(4);
  });
});

describe('E-47 Console API', () => {
  it('lists batches only with a session', async () => {
    f = await fixture();
    const app = createApp({ store: f.store, gatewayStatus: async () => [] });
    try {
      const HOST = '127.0.0.1:4317';
      expect((await app.inject({ url: '/api/console/item-batches', headers: { host: HOST } })).statusCode).toBe(401);
      const s = await app.inject({ url: '/api/session', headers: { host: HOST } });
      const cookie = String(s.headers['set-cookie']).split(';')[0]!;
      expect((await app.inject({ url: '/api/console/item-batches', headers: { host: HOST, cookie } })).json()).toEqual({ batches: [], calls_today: 0 });
      const missing = await app.inject({ url: '/api/console/item-batches/nope', headers: { host: HOST, cookie } });
      expect([missing.statusCode, missing.json().error]).toEqual([404, 'NOT_FOUND']);
    } finally { await app.close(); }
  });
});
