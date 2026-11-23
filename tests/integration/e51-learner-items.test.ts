// E-51 (D-05 C4, N7): Writing Task 2 prompts the learner owns — rights and exposure declared at import, packaged as
// 'learner_owned', QC1–QC3 at once, the AI review later (stub executor here), then practice-only in the bank. The new
// consent class learner_owned_content is what a provider needs to receive them.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { dataClassesFor } from '../../src/application/ai/subscription-guard.js';
import type { AdapterResult } from '../../src/application/ai/provider-adapter.js';
import type { AuthoringExecutor, FrameworkDocument } from '../../src/application/authoring/framework-authoring.js';
import { ItemAuthoringService } from '../../src/application/authoring/item-authoring.js';
import { LearnerItemService, type ImportInput } from '../../src/application/authoring/learner-items.js';
import { LearningWorkflowService } from '../../src/application/learning/writing-workflow.js';
import type { ItemReviewResult } from '../../src/domain/knowledge/item-checks.js';
import { loadItemPolicy } from '../../src/infrastructure/authoring/framework-sources.js';
import { sourcesDir } from '../../src/infrastructure/sources/crawler.js';
import { SourceReview } from '../../src/infrastructure/sources/review.js';
import { builderPipeline } from '../../src/infrastructure/sqlite/store.js';
import { createApp } from '../../src/server/app.js';
import { fixture, type Fixture } from './p1-helpers.js';

const COMPS = ['wt2.tr.clear_position', 'wt2.cc.logical_organisation'];
const PROMPT = 'In many countries, the number of people choosing to live alone is increasing. Why is this happening? Is this a positive or negative development? Give reasons for your answer and include any relevant examples from your own knowledge or experience.';
const POLICY = { ...loadItemPolicy(), item_set_id: 'test-items' };

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
    competencies: COMPS.map((id) => ({ competency_id: id, criterion: 'task_response', title_vi: id, assessor_criterion: `Criterion ${id}.`, target_claim: 'c',
      evidence_required: ['e'], evidence_conditions: ['c'], confounders: [], inference_limits: ['l'], edges: [], source_quotes: [] })),
    rubric: {
      official: [{ source_ref: ref, criterion: 'Task Response', band: 7, locator: 'trang 1, Task Response, Band 7', descriptor: 'x' }],
      observation_guide: COMPS.map((id) => ({ competency_id: id, signal: `Signal ${id}`, counter_evidence: [], valid_exceptions: [], inconclusive_when: ['Too short'] })),
      aggregation: { method: 'holistic_by_criterion', notes: ['Holistic.'] },
    },
    limitations: [], checks: { errors: 0, warnings: 0, findings: [] },
  } as FrameworkDocument;
}
const input = (over: Partial<ImportInput> = {}): ImportInput => ({ request_key: 'imp-1', prompt: PROMPT, task: 'writing_task2', genre: 'two_part', test_type: 'both', topic: 'Living alone',
  exposure: 'never_done', rights_confirmed: true, source_note: 'Sách luyện thi của tôi, trang 12', ...over });
function reviewer(findings: ItemReviewResult['items'][number]['findings'] = []) {
  const calls: Record<string, unknown>[] = [];
  const fn = (async (_task, payload) => {
    calls.push(payload);
    const result: ItemReviewResult = { schema_version: '1', job_id: 'j', context_manifest_id: 'm', synthetic: false, limitations: [],
      items: (payload.items as { item_key: string }[]).map((i) => ({ item_key: i.item_key, verdict: findings.some((x) => x.severity === 'error' && x.check !== 'originality') ? 'fail' as const : 'pass' as const, findings })) };
    return { result: { ok: true, result } as AdapterResult, provider: 'claude-code', cli_version: '1', model: 'm' };
  }) as AuthoringExecutor & { calls: typeof calls };
  fn.calls = calls; return fn;
}

describe('E-51 learner-owned prompts', () => {
  it('imports with rights and exposure, reviews later, joins the bank as practice-only, never as a verification item', async () => {
    f = await fixture(); const fw = seedFramework(f);
    const own = new LearnerItemService(f.store, builderPipeline(f.store), () => fw, POLICY);
    expect(() => own.importPrompt(input({ rights_confirmed: false }))).toThrow(expect.objectContaining({ code: 'RIGHTS_NOT_CONFIRMED' }));
    expect(() => own.importPrompt(input({ task: 'writing_task1_academic' }))).toThrow(expect.objectContaining({ code: 'TASK_NOT_SUPPORTED' }));
    expect(() => own.importPrompt(input({ prompt: 'Too short to be a prompt.' }))).toThrow(expect.objectContaining({ code: 'PROMPT_TOO_SHORT' }));

    const v = own.importPrompt(input({ exposure: 'seen_sample' }));
    expect(v).toMatchObject({ state: 'awaiting_review', exposure: 'seen_sample' });
    expect(own.importPrompt(input({ exposure: 'seen_sample' })).item_id).toBe(v.item_id); // same request_key → same item
    expect(() => own.importPrompt(input({ request_key: 'imp-2' }))).toThrow(expect.objectContaining({ code: 'NEAR_DUPLICATE' }));
    expect(f.store.builder.bundle(v.package_id, 'v1')!.content_origin).toBe('learner_owned');
    expect(f.store.learning.exposures().filter((e) => e.item_id === v.item_id).map((e) => e.level).sort()).toEqual(['prompt', 'sample_or_variant']);
    const src = f.store.builder.latestSource(`learner-src-${v.item_id.slice(-8)}`)!.record as { rights: { status: string; ai_processing: boolean }; registry_state: string };
    expect(src).toMatchObject({ rights: { status: 'determined', ai_processing: true }, registry_state: 'approved' });

    const wf = new LearningWorkflowService(f.store, undefined, { aiMode: 'real', framework: () => fw });
    expect(wf.writingBank().items).toEqual([]); // not before the review

    const ex = reviewer([{ check: 'originality', severity: 'error', issue: 'This is a published prompt.' }]);
    expect(await own.reviewPending(ex)).toMatchObject({ reviewed: 1, released: 1 }); // originality does not count for owned material
    expect(ex.calls[0]).toMatchObject({ note: expect.stringContaining('Do not report originality'), items: [{ prompt: PROMPT, competencies: COMPS }] });
    expect(await own.reviewPending(ex)).toMatchObject({ run_id: null, reviewed: 0 });
    expect(own.view(v.item_id)).toMatchObject({ state: 'released', review_findings: [] });

    const bank = wf.writingBank();
    expect(bank.items).toEqual([expect.objectContaining({ item_id: v.item_id, title: 'Writing Task 2 — Living alone (đề của bạn)', origin: 'learner_owned', seen: true })]);
    const start = wf.startAttempt({ request_key: 'a1', item_id: v.item_id, mode: 'exam', purpose: 'practice' });
    expect(start.task_prompt.prompt).toBe(PROMPT);
    // Never a novel verification item, and not counted for N8 coverage of AI prompts.
    const items = new ItemAuthoringService(f.store, builderPipeline(f.store), () => fw, POLICY);
    expect(items.coverage().cells.every((c) => c.unseen === 0)).toBe(true);
  });

  it('a review error keeps the prompt out of the bank with its findings shown to the learner', async () => {
    f = await fixture(); const fw = seedFramework(f);
    const own = new LearnerItemService(f.store, builderPipeline(f.store), () => fw, POLICY);
    const v = own.importPrompt(input());
    await own.reviewPending(reviewer([{ check: 'genre_match', severity: 'error', issue: 'Declared two_part but it is an opinion question.' }]));
    expect(own.view(v.item_id)).toMatchObject({ state: 'qc_failed', review_findings: [{ check: 'genre_match', severity: 'error' }] });
    expect(new LearningWorkflowService(f.store, undefined, { aiMode: 'real', framework: () => fw }).writingBank().items).toEqual([]);
  });

  it('learner-owned content needs its own consent class; the consent table accepts it', async () => {
    expect(dataClassesFor({ role: 'assessor', scope: 'dry_run', content_origin: 'learner_owned' })).toEqual(['learner_owned_content']);
    f = await fixture();
    f.store.db.prepare("INSERT INTO ai_data_consents (event_id, provider, data_class, granted, recorded_at) VALUES ('e1', 'claude-code', 'learner_owned_content', 1, 't')").run();
    expect(() => f!.store.db.prepare("INSERT INTO ai_data_consents (event_id, provider, data_class, granted, recorded_at) VALUES ('e2', 'claude-code', 'unknown_class', 1, 't')").run()).toThrow(/CHECK/);
  });

  it('API: list and import need a session; import is AI-free', async () => {
    f = await fixture();
    const app = createApp({ store: f.store, gatewayStatus: async () => [] });
    try {
      const HOST = '127.0.0.1:4317'; const ORIGIN = 'http://127.0.0.1:5173';
      expect((await app.inject({ url: '/api/learning/own-items', headers: { host: HOST } })).statusCode).toBe(401);
      const s = await app.inject({ url: '/api/session', headers: { host: HOST } });
      const cookie = String(s.headers['set-cookie']).split(';')[0]!; const csrf = s.json().csrf_token as string;
      expect((await app.inject({ url: '/api/learning/own-items', headers: { host: HOST, cookie } })).json()).toEqual({ items: [] });
      // No approved framework in this store: refused before anything is written.
      const r = await app.inject({ method: 'POST', url: '/api/learning/own-items', payload: input(), headers: { host: HOST, origin: ORIGIN, cookie, 'x-csrf-token': csrf } });
      expect([r.statusCode, r.json().error]).toEqual([409, 'FRAMEWORK_NOT_APPROVED']);
    } finally { await app.close(); }
  });
});
