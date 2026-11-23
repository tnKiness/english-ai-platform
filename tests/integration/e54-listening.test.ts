// E-54 (D-05 N1/N5, E-44): AI-authored Listening parts — transcript checks, voicing with a (fake) local TTS, blind solve
// on the transcript as QC4, automatic release, and the learner flow where the transcript and key arrive only after
// submission. Stub executor and fake speech: no real AI and no Piper here.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AdapterResult } from '../../src/application/ai/provider-adapter.js';
import type { AuthoringExecutor, FrameworkDocument } from '../../src/application/authoring/framework-authoring.js';
import { ListeningAuthoringService, type ListeningPolicy, type Speech } from '../../src/application/authoring/listening-authoring.js';
import { ListeningWorkflow } from '../../src/application/learning/listening-workflow.js';
import { checkListening, compareBlind, type ListeningDraft } from '../../src/domain/knowledge/listening-checks.js';
import type { ItemReviewResult } from '../../src/domain/knowledge/item-checks.js';
import { validateAiResult } from '../../src/infrastructure/ai/result-contracts.js';
import { joinWav, makeWav, parseWav, wavDurationSeconds } from '../../src/infrastructure/audio/wav.js';
import { sourcesDir } from '../../src/infrastructure/sources/crawler.js';
import { SourceReview } from '../../src/infrastructure/sources/review.js';
import { builderPipeline } from '../../src/infrastructure/sqlite/store.js';
import { createApp } from '../../src/server/app.js';
import { fixture, type Fixture } from './p1-helpers.js';

const COMPS = ['lis.dt.specific_information', 'lis.mi.main_idea'];
const POLICY: ListeningPolicy = { schema_version: '1', item_set_id: 'test-lis', decision: 't', task: 'IELTS Listening', batch_size: 2, daily_ai_call_cap: 10, similarity_threshold: 0.6, parts: [1, 2, 3, 4],
  voices: { female: ['f1'], male: ['m1', 'm2'] }, line_gap_seconds: 0.2, usage_purposes: ['practice', 'independent_verification'] };
const FILLER = 'We have a few rooms available that week and the staff can help you with any questions you might have about the area and the local transport options nearby.';

let f: Fixture | undefined;
afterEach(() => { f?.cleanup(); f = undefined; });

function seedFramework(fx: Fixture): FrameworkDocument {
  const dir = sourcesDir(fx.store.paths); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'fmt.html'), '<html><title>Listening format</title><body><p>Listening.</p></body></html>');
  fx.store.db.prepare(`INSERT INTO source_candidates (candidate_id, url, host, origin, depth, fetch_state, http_status, content_type, title, byte_size, sha256, stored_path, text_chars, kind, skill, review_state, created_at, updated_at, fetched_at)
    VALUES ('c-fmt', 'https://ielts.example/listening', 'ielts.example', 'official', 0, 'FETCHED', 200, 'text/html', 'fmt', 10, ?, 'fmt.html', 10, 'test_format', 'listening', 'PENDING', 't', 't', '2026-11-19T00:00:00.000Z')`).run('a'.repeat(64));
  new SourceReview(fx.store.db, fx.store.paths, fx.store.builder, fx.clock.now).review(['c-fmt'], 'approve');
  const r = fx.store.db.prepare("SELECT source_id, source_version FROM source_candidates WHERE candidate_id = 'c-fmt'").get() as { source_id: string; source_version: string };
  return {
    schema_version: '1', framework_id: 'ielts-listening', version: 'v1', task: 'Listening', policy_decision: 't',
    author: { run_id: 'r', provider: 'claude-code', cli_version: '1', model: 'm', synthetic: false }, revised_from: null,
    sources: [{ source_ref: `${r.source_id}@${r.source_version}`, url: 'https://ielts.example/listening', title: 'fmt', role: 'test_format' }],
    competencies: COMPS.map((id) => ({ competency_id: id, criterion: 'detail', title_vi: id, assessor_criterion: `Criterion ${id}.`, target_claim: 'c', evidence_required: ['e'], evidence_conditions: ['c'],
      confounders: [], inference_limits: ['l'], edges: [], source_quotes: [] })),
    rubric: { official: [], observation_guide: COMPS.map((id) => ({ competency_id: id, signal: `Signal ${id}`, counter_evidence: [], valid_exceptions: [], inconclusive_when: ['Unclear'] })),
      aggregation: { method: 'holistic_by_criterion', notes: ['n'] } },
    limitations: [], checks: { errors: 0, warnings: 0, findings: [] },
  } as FrameworkDocument;
}

function part(key = 'hotel_booking', over: Partial<ListeningDraft> = {}): ListeningDraft {
  return {
    item_key: key, part: 1, topic: 'Booking a guesthouse room', item_family: 'guesthouse_booking', context: 'A woman phones a guesthouse to book a room.',
    speakers: [{ id: 'A', role: 'receptionist', voice: 'female' }, { id: 'B', role: 'caller', voice: 'male' }],
    script: [
      { speaker: 'A', text: `Good morning, Riverside Guesthouse, how can I help? ${FILLER}` },
      { speaker: 'B', text: `Hello, I would like to book a double room for three nights, please. ${FILLER}` },
      { speaker: 'A', text: `Of course. Can I have your surname? ${FILLER}` },
      { speaker: 'B', text: `Yes, it is Harlow, H-A-R-L-O-W. ${FILLER}` },
      { speaker: 'A', text: `Thank you. Breakfast is served in the garden room from seven. ${FILLER}` },
      { speaker: 'B', text: `Lovely. And is parking free? ${FILLER} Actually, I will come by train, so I will not need parking.` },
    ],
    questions: [
      { question_id: 'q1', type: 'form_completion', prompt: 'Type of room: ________', options: [], word_limit: 1, answers: ['double'], evidence_quote: 'book a double room', competencies: [COMPS[0]!] },
      { question_id: 'q2', type: 'form_completion', prompt: 'Surname: ________', options: [], word_limit: 1, answers: ['Harlow'], evidence_quote: 'it is Harlow', competencies: [COMPS[0]!] },
      { question_id: 'q3', type: 'note_completion', prompt: 'Breakfast is served in the ________', options: [], word_limit: 2, answers: ['garden room'], evidence_quote: 'served in the garden room', competencies: [COMPS[0]!] },
      { question_id: 'q4', type: 'multiple_choice', prompt: 'How will the caller travel?', options: ['By car', 'By train', 'By bus'], word_limit: null, answers: ['By train'], evidence_quote: 'I will come by train', competencies: [COMPS[1]!] },
      { question_id: 'q5', type: 'short_answer', prompt: 'How many nights will she stay?', options: [], word_limit: 1, answers: ['three', '3'], evidence_quote: 'for three nights', competencies: [COMPS[0]!] },
    ],
    difficulty_estimate: 'lower', rationale: 'Standard Part 1 form.', ...over,
  };
}
const speech = (): Speech & { calls: string[] } => {
  const calls: string[] = [];
  return { calls, voices: () => [{ id: 'f1' }, { id: 'm1' }], synthesize: async (_t, v) => { calls.push(v); return makeWav(0.1); } };
};
function executor(parts: ListeningDraft[], solve: (items: { item_key: string; questions: { question_id: string }[] }[]) => { question_id: string; answer: string }[], ambiguities: string[] = []) {
  const tasks: string[] = []; const payloads: Record<string, unknown>[] = [];
  const fn = (async (task, payload) => {
    tasks.push(task); payloads.push(payload);
    const ok = (result: unknown) => ({ result: { ok: true, result } as AdapterResult, provider: 'claude-code', cli_version: '1', model: 'm' });
    if (task === 'content.listening_author') return ok({ schema_version: '1', job_id: 'j', context_manifest_id: 'm', synthetic: false, items: parts, limitations: [] });
    if (task === 'content.listening_solve') return ok({ schema_version: '1', job_id: 'j', context_manifest_id: 'm', synthetic: false, answers: solve(payload.items as never), ambiguities });
    const review: ItemReviewResult = { schema_version: '1', job_id: 'j', context_manifest_id: 'm', synthetic: false, limitations: [],
      items: (payload.items as { item_key: string }[]).map((i) => ({ item_key: i.item_key, verdict: 'pass', findings: [] })) };
    return ok(review);
  }) as AuthoringExecutor & { tasks: string[]; payloads: Record<string, unknown>[] };
  fn.tasks = tasks; fn.payloads = payloads; return fn;
}
const correct = (items: { item_key: string; questions: { question_id: string }[] }[]) => {
  const key: Record<string, string> = { q1: 'Double', q2: 'harlow', q3: 'garden room.', q4: 'By train', q5: '3' };
  return items.flatMap((i) => i.questions.map((q) => ({ question_id: `${i.item_key}:${q.question_id}`, answer: key[q.question_id]! })));
};

describe('E-54 Listening checks and audio', () => {
  it('joins WAV clips with pauses and refuses mixed formats', () => {
    const joined = parseWav(joinWav([makeWav(1), makeWav(0.5)], 0.25));
    expect(wavDurationSeconds(joined)).toBeCloseTo(1.75, 2);
    expect(() => joinWav([makeWav(0.1), makeWav(0.1, { sampleRate: 22050, channels: 1, bitsPerSample: 16 })])).toThrow('WAV_FORMAT_MISMATCH');
  });
  it('checks every answer against the transcript; compares a blind solve with the key', () => {
    expect(validateAiResult('content.listening_author', { schema_version: '1', job_id: 'j', context_manifest_id: 'm', synthetic: false, items: [part()], limitations: [] })).toBe(true);
    const bad = part('bad', { questions: [
      { ...part().questions[0]!, answers: ['single'] },
      { ...part().questions[1]!, prompt: 'Surname (Harlow): ____' },
      { ...part().questions[2]!, answers: ['the garden room downstairs'] },
      { ...part().questions[3]!, answers: ['By plane'] },
      { ...part().questions[4]!, evidence_quote: 'for four nights' },
    ] });
    const codes = checkListening([part(), bad], { competencies: new Set(COMPS), existing: [], similarity_threshold: 0.99 }).filter((x) => x.severity === 'error').map((x) => `${x.item_key}:${x.code}`);
    expect(codes).toEqual(expect.arrayContaining(['bad:q1:ANSWER_NOT_SPOKEN', 'bad:q2:ANSWER_IN_PROMPT', 'bad:q3:ANSWER_OVER_LIMIT', 'bad:q4:MCQ_KEY_NOT_OPTION', 'bad:q5:EVIDENCE_NOT_IN_SCRIPT']));
    expect(codes.filter((c) => c.startsWith('hotel_booking'))).toEqual([]);
    const cmp = compareBlind([{ item_key: 'hotel_booking', questions: part().questions }], { answers: correct([{ item_key: 'hotel_booking', questions: part().questions }]).map((a) => (a.question_id.endsWith('q2') ? { ...a, answer: 'Harlowe' } : a)), ambiguities: [] });
    expect(cmp).toEqual([{ item_key: 'hotel_booking', mismatches: ['q2'], ambiguous: [], pass: false }]);
  });
});

describe('E-54 authoring → QC4 blind solve → release → learner flow', () => {
  it('voices each line with the speaker voice, releases a part the blind solver answers correctly, and hides the transcript until submission', async () => {
    f = await fixture(); const fw = seedFramework(f);
    const sp = speech();
    const svc = new ListeningAuthoringService(f.store, builderPipeline(f.store), () => fw, POLICY);
    const ex = executor([part()], correct);
    const r = await svc.author(ex, sp, 1);
    expect(ex.tasks).toEqual(['content.listening_author', 'content.listening_solve', 'content.item_review']);
    expect(sp.calls).toEqual(['f1', 'm1', 'f1', 'm1', 'f1', 'm1']); // A female, B male
    // The blind solver gets the transcript and questions only: no key, no evidence quotes.
    const solvePayload = JSON.stringify(ex.payloads[1]);
    expect(solvePayload).toContain('H-A-R-L-O-W');
    expect(solvePayload).not.toMatch(/evidence_quote|accepted|"answers"/);
    expect(r.items[0]).toMatchObject({ release_state: 'active', qc: [{ stage: 'QC1', status: 'PASS' }, { stage: 'QC2', status: 'PASS' }, { stage: 'QC3', status: 'PASS' }, { stage: 'QC4', status: 'PASS' }] });

    const lw = new ListeningWorkflow(f.store);
    const cat = lw.catalog();
    expect(cat.items).toEqual([expect.objectContaining({ title: 'Listening Part 1 — Booking a guesthouse room', questions: 5, seen: false })]);
    expect(JSON.stringify(cat)).not.toContain('Riverside');
    expect(() => lw.start(cat.items[0]!.item_id, 'v1', 'guided', 's0')).toThrow();
    const v = lw.start(cat.items[0]!.item_id, 'v1', 'exam', 's1');
    expect(v.submitted).toBe(false);
    expect(JSON.stringify(v)).not.toMatch(/Riverside|Harlow|garden room/); // transcript and key stay on the server
    const wav = lw.audio(v.attempt_id);
    expect(wav.type).toBe('audio/wav');
    expect(wavDurationSeconds(parseWav(new Uint8Array(wav.bytes)))).toBeGreaterThan(0.5);
    const done = lw.submit(v.attempt_id, 'sub', [{ question_id: 'q1', answer: ' Double ' }, { question_id: 'q2', answer: 'Harlowe' }, { question_id: 'q4', answer: 'by train' }, { question_id: 'q5', answer: 'three' }]);
    if (!done.submitted) throw new Error('not submitted');
    expect(done.score).toEqual({ correct: 3, total: 5 });
    expect(done.results.map((x) => x.item_result)).toEqual(['correct', 'incorrect', 'unanswered', 'correct', 'correct']);
    expect(done.review.transcript).toContain('Riverside Guesthouse');
    expect(f.store.learning.exposures().filter((e) => e.item_id === cat.items[0]!.item_id).map((e) => e.level).sort()).toEqual(['answer', 'explanation', 'prompt']);
    expect(lw.submit(v.attempt_id, 'sub2', []).submitted).toBe(true); // one scored submission per attempt
  });

  it('a blind-solve mismatch or an ambiguity fails QC4 and keeps the part out of the catalog', async () => {
    f = await fixture(); const fw = seedFramework(f);
    const svc = new ListeningAuthoringService(f.store, builderPipeline(f.store), () => fw, POLICY);
    const r = await svc.author(executor([part()], correct, ['hotel_booking:q3: two rooms are mentioned']), speech(), 1);
    expect(r.items[0]).toMatchObject({ release_state: 'draft' });
    expect(r.items[0]!.qc.find((q) => q.stage === 'QC4')!.status).toBe('FAIL');
    expect(new ListeningWorkflow(f.store).catalog().items).toEqual([]);
  });

  it('refuses before any AI call without an approved framework or an installed voice', async () => {
    f = await fixture(); const fw = seedFramework(f);
    const ex = executor([part()], correct);
    await expect(new ListeningAuthoringService(f.store, builderPipeline(f.store), () => null, POLICY).author(ex, speech())).rejects.toMatchObject({ code: 'FRAMEWORK_NOT_APPROVED' });
    await expect(new ListeningAuthoringService(f.store, builderPipeline(f.store), () => fw, POLICY).author(ex, { voices: () => [], synthesize: async () => makeWav(0.1) })).rejects.toMatchObject({ code: 'TTS_NOT_READY' });
    expect(ex.tasks).toEqual([]);
  });

  it('API: Listening routes need a session', async () => {
    f = await fixture();
    const app = createApp({ store: f.store, gatewayStatus: async () => [] });
    try {
      const HOST = '127.0.0.1:4317';
      expect((await app.inject({ url: '/api/learning/listening', headers: { host: HOST } })).statusCode).toBe(401);
      const s = await app.inject({ url: '/api/session', headers: { host: HOST } });
      const cookie = String(s.headers['set-cookie']).split(';')[0]!;
      expect((await app.inject({ url: '/api/learning/listening', headers: { host: HOST, cookie } })).json()).toMatchObject({ items: [], band_reporting_enabled: false });
      expect((await app.inject({ url: '/api/console/listening-batches', headers: { host: HOST, cookie } })).json()).toEqual({ batches: [], calls_today: 0 });
    } finally { await app.close(); }
  });
});
