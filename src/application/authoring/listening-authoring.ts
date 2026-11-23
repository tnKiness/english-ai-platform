// E-54 (D-05 N1/N5/N6/N8, E-44): AI-authored IELTS Listening parts. The AI writes a script, questions and a key from
// the APPROVED Listening framework; the application checks them against the transcript, voices the script with the
// local TTS (one voice per speaker, offline), packages each passing part through the Builder pipeline and then:
// - QC4: a separate AI call solves the questions blind from the transcript (never sees the key); the application
//   compares its answers with the key and fails the part on any mismatch or declared ambiguity;
// - QC2/QC3 semantic: an independent review (with the key) of competency mapping, clarity and answer give-away.
// Parts that pass every QC part are released automatically (N6). The transcript is the source of truth; the audio is
// how it is presented. Learners see the transcript only after submitting (ListeningWorkflow).
import type { BuilderPipeline } from '../qc/pipeline.js';
import { checkListening, compareBlind, transcriptText, type ListeningDraft, type ListeningSetResult } from '../../domain/knowledge/listening-checks.js';
import { REVIEW_STAGE, type ItemFinding, type ItemReviewResult } from '../../domain/knowledge/item-checks.js';
import type { QcStage } from '../../domain/knowledge/release-gate.js';
import { studyDayOf } from '../../domain/scheduling/study-day.js';
import type { BlindSolveResult } from '../ai/provider-adapter.js';
import { CLI_PROVIDERS } from '../ai/subscription-guard.js';
import type { Store } from '../../infrastructure/sqlite/store.js';
import { assertCanStoreNew } from '../../infrastructure/files/disk-guard.js';
import { joinWav } from '../../infrastructure/audio/wav.js';
import { AuthoringError, runAuthoringCall, type AuthoringExecutor, type FrameworkDocument } from './framework-authoring.js';

export interface ListeningPolicy {
  schema_version: '1'; item_set_id: string; decision: string; task: string; batch_size: number; daily_ai_call_cap: number; similarity_threshold: number;
  parts: number[]; voices: { female: string[]; male: string[] }; line_gap_seconds: number; usage_purposes: ('practice' | 'independent_verification')[];
}
/** The local speech engine (PiperTts in production). */
export interface Speech { voices(): { id: string }[]; synthesize(text: string, voiceId: string): Promise<Uint8Array> }

export interface ListeningBatchItem extends ListeningDraft { item_id: string; package_id: string; precheck: 'passed' | 'rejected'; media_sha: string | null; voices: Record<string, string> }
interface BatchDoc { schema_version: '1'; batch_id: string; created_at: string; framework: { framework_id: string; version: string }; author: { run_id: string; provider: string; model: string | null; synthetic: boolean }; checks: ItemFinding[]; limitations: string[]; items: ListeningBatchItem[] }
export interface ListeningItemStatus { item_id: string; package_id: string; item_key: string; part: number; topic: string; questions: number; precheck: 'passed' | 'rejected'; release_state: string | null; qc: { stage: string; status: string }[]; release_reasons: string[] }

const VERSION = 'v1';
const BATCH_DOC = 'lis-item-batch';

export class ListeningAuthoringService {
  private lastReasons = new Map<string, string[]>();
  constructor(private store: Store, private pipeline: BuilderPipeline, private approvedFramework: () => FrameworkDocument | null, private policy: ListeningPolicy) {}

  private framework(): FrameworkDocument {
    const fw = this.approvedFramework();
    if (!fw) throw new AuthoringError('Chưa có khung năng lực Listening đã duyệt. Soạn và duyệt: npm.cmd run author -- framework --skill listening', 'FRAMEWORK_NOT_APPROVED');
    if (fw.author.synthetic) throw new AuthoringError('Khung Listening đã duyệt là synthetic; không dùng để soạn đề thật', 'SYNTHETIC');
    return fw;
  }

  callsToday(): number {
    const today = studyDayOf(this.store.now());
    const since = new Date(this.store.now().getTime() - 2 * 86_400_000).toISOString();
    return (this.store.db.prepare('SELECT started_at FROM authoring_runs WHERE target_id = ? AND started_at >= ?').all(this.policy.item_set_id, since) as { started_at: string }[])
      .filter((r) => studyDayOf(new Date(r.started_at)) === today).length;
  }
  private ensureQuota(n: number) {
    const used = this.callsToday();
    if (used + n > this.policy.daily_ai_call_cap) throw new AuthoringError(`Đã dùng ${used}/${this.policy.daily_ai_call_cap} lượt gọi AI soạn Listening hôm nay (N8); cần thêm ${n}.`, 'DAILY_CAP', 429);
  }

  private batchIds(): string[] {
    return (this.store.db.prepare("SELECT run_id FROM authoring_runs WHERE target_id = ? AND task_type = 'content.listening_author' AND ok = 1 ORDER BY started_at DESC")
      .all(this.policy.item_set_id) as { run_id: string }[]).map((r) => r.run_id).filter((id) => this.store.json.find('knowledge', BATCH_DOC, id));
  }
  private batch(id: string): BatchDoc {
    if (!this.store.json.find('knowledge', BATCH_DOC, id)) throw new AuthoringError(`Không có lô Listening ${id}`, 'NOT_FOUND', 404);
    return this.store.json.get('knowledge', BATCH_DOC, id) as BatchDoc;
  }

  /** One voice per speaker: female/male from the policy lists that are installed, distinct where possible. */
  private assignVoices(speech: Speech, d: ListeningDraft): Record<string, string> {
    const installed = new Set(speech.voices().map((v) => v.id));
    const pool = { female: this.policy.voices.female.filter((v) => installed.has(v)), male: this.policy.voices.male.filter((v) => installed.has(v)) };
    const any = [...installed];
    if (any.length === 0) throw new AuthoringError('Chưa cài giọng TTS (Piper). Xem: npm.cmd run tts -- status', 'TTS_NOT_READY');
    const used: Record<'female' | 'male', number> = { female: 0, male: 0 };
    return Object.fromEntries(d.speakers.map((s) => {
      const list = pool[s.voice].length ? pool[s.voice] : any;
      return [s.id, list[used[s.voice]++ % list.length]!];
    }));
  }

  /**
   * Author `count` parts (1 call), check them, voice and package each passing part, then QC4 blind solve + review
   * (2 calls) and automatic release. TTS must be ready before any AI call is spent.
   */
  async author(executor: AuthoringExecutor, speech: Speech, count = this.policy.batch_size, parts?: number[]): Promise<{ batch_id: string; items: ListeningItemStatus[] }> {
    const fw = this.framework();
    if (speech.voices().length === 0) throw new AuthoringError('Chưa cài giọng TTS (Piper). Xem: npm.cmd run tts -- status', 'TTS_NOT_READY');
    assertCanStoreNew(this.store.paths.root, 'tạo audio Listening mới');
    this.ensureQuota(3);
    const n = Math.max(1, Math.min(4, Math.floor(count)));
    const wanted = (parts ?? this.policy.parts).filter((p) => this.policy.parts.includes(p));
    const existing = this.batchIds().flatMap((id) => this.batch(id).items.filter((i) => i.precheck === 'passed').map((i) => ({ item_id: i.item_id, text: transcriptText(i), topic: i.topic, part: i.part })));
    const payload = {
      task: this.policy.task,
      requirements: { count: n, parts: wanted.length ? wanted : this.policy.parts },
      framework: { framework_id: fw.framework_id, version: fw.version, competencies: fw.competencies.map((c) => ({ competency_id: c.competency_id, criterion: c.criterion, title_vi: c.title_vi, assessor_criterion: c.assessor_criterion })) },
      avoid: existing.map(({ topic, part }) => ({ topic, part })),
    };
    const { runId, out } = await runAuthoringCall(this.store, executor, 'content.listening_author', payload, { id: this.policy.item_set_id, version: null });
    if (!out.result.ok) throw new AuthoringError(`AI soạn Listening thất bại (${out.result.error}${out.detail ? `: ${out.detail}` : ''}). Lần chạy ${runId} đã được ghi.`, `AI_${out.result.error}`, 502);
    const set = out.result.result as unknown as ListeningSetResult;
    const checks = checkListening(set.items, { competencies: new Set(fw.competencies.map((c) => c.competency_id)), existing, similarity_threshold: this.policy.similarity_threshold });
    const short = runId.slice(0, 8);
    const items: ListeningBatchItem[] = [];
    for (const it of set.items) {
      const item_id = `lis-ai-${short}-${it.item_key.replace(/_/g, '-')}`;
      const rejected = checks.some((f) => (f.item_key === it.item_key || f.item_key.startsWith(`${it.item_key}:`)) && f.severity === 'error');
      let media_sha: string | null = null; let voices: Record<string, string> = {};
      if (!rejected) {
        voices = this.assignVoices(speech, it);
        const clips: Uint8Array[] = [];
        for (const line of it.script) clips.push(await speech.synthesize(line.text, voices[line.speaker]!));
        media_sha = this.store.media.put(joinWav(clips, this.policy.line_gap_seconds), 'audio/wav').sha256;
      }
      items.push({ ...it, item_id, package_id: `pkg-${item_id}`, precheck: rejected ? 'rejected' : 'passed', media_sha, voices });
    }
    const doc: BatchDoc = { schema_version: '1', batch_id: runId, created_at: this.store.now().toISOString(), framework: { framework_id: fw.framework_id, version: fw.version },
      author: { run_id: runId, provider: out.provider, model: out.model, synthetic: set.synthetic || out.provider === 'fake' }, checks, limitations: set.limitations, items };
    this.store.json.put('knowledge', BATCH_DOC, runId, doc);
    for (const it of items.filter((i) => i.precheck === 'passed')) this.freezeItem(fw, it);
    await this.review(executor, runId);
    return { batch_id: runId, items: this.status(runId) };
  }

  private freezeItem(fw: FrameworkDocument, it: ListeningBatchItem) {
    const sources = fw.sources.map((s) => { const i = s.source_ref.lastIndexOf('@'); return { source_id: s.source_ref.slice(0, i), source_version: s.source_ref.slice(i + 1), locator: s.role }; });
    const gov = (unitType: 'task_item' | 'answer_key' | 'rubric', id: string, roles: string[], disclosure: string, deps: { kind: string; id: string; version: string }[] = []) => ({
      identity: { unit_id: id, unit_type: unitType, version: VERSION },
      scope: { test_type: 'both', skills: ['listening'], task_types: ['listening', `part${it.part}`], context: `AI-authored IELTS Listening part (E-54), framework ${fw.framework_id}@${fw.version}` },
      basis: { sources, derivation: 'authored_from_sources', derived_from: [], knowledge_gaps: [] },
      authority: 'pedagogical_guidance',
      validity: { status: 'draft', effective_from: null, review_due: null },
      verification: { content: 'not_checked', resources: unitType === 'task_item' ? 'not_checked' : 'not_applicable', usage_roles: [], empirical: 'untested', lifecycle: 'draft' },
      dependencies: { units: deps, media: [] },
      permissions: { roles, disclosure, copyright: 'licensed' },
    });
    const itemRef = { kind: 'item', id: it.item_id, version: VERSION };
    const rubricId = `${it.item_id}-rubric`;
    const req = this.pipeline.createRequest({
      schema_version: '1', request_id: `req-${it.item_id}`, package_id: it.package_id, competencies: [...new Set(it.questions.flatMap((q) => q.competencies))], task_roles: [...this.policy.usage_purposes],
      blocks: ['task_item', 'answer_key', 'rubric'], usage_purposes: [...this.policy.usage_purposes], scope: { test_type: 'both', skills: ['listening'] },
      out_of_scope: ['Band estimation'], acceptance_criteria: ['Blind solve on the transcript matches the key; QC1–QC4 PASS on the frozen bundle hash (D-05 N6)'],
      limits: { max_sources: Math.max(1, fw.sources.length), max_revision_rounds: 0, max_ai_runs: 3 }, content_origin: 'ai_authored',
    });
    this.pipeline.stageUnit(req.request_id, 'item', { schema_version: '1', governance: gov('task_item', it.item_id, ['learner', 'blind_solver', 'verifier', 'assessor'], 'prompt'), body: {
      item_family_id: `lis-fam-${it.item_family}`, derived_from: [], shared_stimulus_id: null, decisive_features: [`part${it.part}`, it.topic],
      // The transcript is the stimulus text: the blind solver works from it; the learner view withholds it until submission.
      stimulus: { text: transcriptText(it), media: [it.media_sha!] },
      prompt: `${it.context}\nQuestions 1–${it.questions.length}.`,
      questions: it.questions.map((q) => ({ question_id: q.question_id, prompt: q.word_limit ? `${q.prompt} (NO MORE THAN ${['ONE', 'TWO', 'THREE'][q.word_limit - 1]} WORD${q.word_limit > 1 ? 'S' : ''})` : q.prompt,
        response_type: q.type === 'multiple_choice' ? 'choice' : 'short_text', options: q.options })),
      difficulty: { target_learner_level: null, initial_estimate: it.difficulty_estimate, observed: null, calibration: 'estimated' },
    } });
    this.pipeline.stageUnit(req.request_id, 'knowledge', { schema_version: '1', governance: gov('answer_key', `${it.item_id}-key`, ['verifier', 'assessor'], 'answer', [itemRef]), body: {
      item: itemRef,
      answers: it.questions.map((q) => ({ question_id: q.question_id, accepted: q.answers, explanation: `Transcript: "${q.evidence_quote}"`, evidence_locator: 'transcript' })),
      measurement_targets: [...new Set(it.questions.flatMap((q) => q.competencies))], competing_answers_considered: [],
    } });
    this.pipeline.stageUnit(req.request_id, 'rubric', { schema_version: '1', governance: gov('rubric', rubricId, ['assessor', 'verifier'], 'prompt'), body: {
      official_criteria: [],
      observation_guide: fw.rubric.observation_guide.map((g) => ({ signal: `[${g.competency_id}] ${g.signal}`, counter_evidence: g.counter_evidence, valid_exceptions: g.valid_exceptions, inconclusive_when: g.inconclusive_when })),
      aggregation: { method: 'holistic_by_criterion', notes: ['Listening is scored by correct answers; competency notes are diagnostic only.'] },
    } });
    this.pipeline.setCoverage(req.request_id, { schema_version: '1', functions: this.policy.usage_purposes.map((usage_role) => ({ usage_role, required_categories: ['support_content'] })),
      entries: [{ category: 'support_content', units: [{ kind: 'rubric', id: rubricId, version: VERSION }], note: `Rubric from approved framework ${fw.framework_id}@${fw.version}` }], test_cases: [] });
    this.pipeline.freeze(req.request_id, VERSION);
    this.pipeline.runChecks(it.package_id, VERSION);
  }

  private awaitingReview(batchId: string) {
    return this.batch(batchId).items.filter((i) => i.precheck === 'passed' && this.store.knowledge.releaseState(i.package_id, VERSION) === 'draft').flatMap((i) => {
      const s = this.pipeline.qcStatus(i.package_id, VERSION);
      const det = s.stages.filter((x) => x.stage !== 'QC4').every((x) => x.parts.find((p) => p.part === 'deterministic')?.status === 'PASS');
      return det && s.stages.find((x) => x.stage === 'QC4')!.status === 'NOT_RUN' ? [{ item: i, bundle_hash: s.bundle_hash }] : [];
    });
  }

  /** QC4 blind solve (no key) + QC2/QC3 review (with key) on exactly the frozen parts, then automatic release. */
  async review(executor: AuthoringExecutor, batchId: string): Promise<{ reviewed: number; released: number }> {
    const fw = this.framework();
    const pending = this.awaitingReview(batchId);
    if (pending.length === 0) return { reviewed: 0, released: 0 };
    this.ensureQuota(2);
    const frozen = pending.map(({ item, bundle_hash }) => {
      const body = (this.store.json.get('item', item.item_id, VERSION) as { body: { stimulus: { text: string }; prompt: string; questions: { question_id: string; prompt: string; options: string[] }[] } }).body;
      const key = (this.store.json.get('knowledge', `${item.item_id}-key`, VERSION) as { body: { answers: { question_id: string; accepted: string[] }[] } }).body;
      return { item, bundle_hash, body, key };
    });
    // QC4: blind solve. Only what the learner will hear (the transcript) and the questions; no key, no evidence quotes.
    const solvePayload = { items: frozen.map((f) => ({ item_key: f.item.item_key, part: f.item.part, transcript: f.body.stimulus.text, instructions: f.body.prompt, questions: f.body.questions })) };
    const solve = await runAuthoringCall(this.store, executor, 'content.listening_solve', solvePayload, { id: this.policy.item_set_id, version: batchId });
    if (!solve.out.result.ok) throw new AuthoringError(`AI giải mù Listening thất bại (${solve.out.result.error}). Lần chạy ${solve.runId} đã được ghi; chạy lại: npm.cmd run author -- listening-review ${batchId}`, `AI_${solve.out.result.error}`, 502);
    const blind = solve.out.result.result as BlindSolveResult;
    const compared = compareBlind(frozen.map((f) => ({ item_key: f.item.item_key, questions: f.key.answers.map((a) => ({ question_id: a.question_id, answers: a.accepted })) })), blind);
    // QC2/QC3: review with the key (a verifier context, separate from the blind solve).
    const reviewPayload = {
      task: this.policy.task,
      note: 'These are IELTS Listening parts (genre = part number). The learner hears the transcript and answers the questions. competency_mapping: each question really needs its listed competency and its key is supported by the transcript. no_model_answer_or_ideas: the question wording must not give away its answer. clear_unambiguous: one defensible answer per question. Do not report no_forced_structure for word limits: they are part of the IELTS format.',
      framework: { framework_id: fw.framework_id, version: fw.version, competencies: fw.competencies.map((c) => ({ competency_id: c.competency_id, criterion: c.criterion, assessor_criterion: c.assessor_criterion })) },
      items: frozen.map((f) => ({ item_key: f.item.item_key, task_scope: 'listening', genre: `part${f.item.part}`, topic: f.item.topic, prompt: f.body.prompt, transcript: f.body.stimulus.text,
        questions: f.item.questions.map((q) => ({ question_id: q.question_id, type: q.type, prompt: q.prompt, options: q.options, word_limit: q.word_limit, answers: q.answers, competencies: q.competencies })),
        competencies: [...new Set(f.item.questions.flatMap((q) => q.competencies))] })),
      avoid: [],
    };
    const rev = await runAuthoringCall(this.store, executor, 'content.item_review', reviewPayload, { id: this.policy.item_set_id, version: batchId });
    if (!rev.out.result.ok) throw new AuthoringError(`AI rà soát Listening thất bại (${rev.out.result.error}). Lần chạy ${rev.runId} đã được ghi; chạy lại: npm.cmd run author -- listening-review ${batchId}`, `AI_${rev.out.result.error}`, 502);
    const review = rev.out.result.result as ItemReviewResult;
    this.store.json.put('knowledge', 'lis-item-review', `${batchId}-${rev.runId}`, { schema_version: '1', batch_id: batchId, solve_run_id: solve.runId, review_run_id: rev.runId,
      reviewed: frozen.map((f) => ({ item_id: f.item.item_id, bundle_hash: f.bundle_hash })), blind, compared, review });
    const synthetic = blind.synthetic || review.synthetic;
    // Both calls must come from verified subscription CLIs; a fake/none provider on either makes the QC synthetic_fake.
    const provider = [solve.out.provider, rev.out.provider].every((p) => (CLI_PROVIDERS as readonly string[]).includes(p)) ? rev.out.provider : 'fake';
    let released = 0;
    for (const f of frozen) {
      const entry = review.items.find((r) => r.item_key === f.item.item_key);
      const cmp = compared.find((c) => c.item_key === f.item.item_key)!;
      if (!entry) continue;
      const stage = (st: QcStage) => {
        const findings: unknown[] = entry.findings.filter((x) => REVIEW_STAGE[x.check] === st && x.check !== 'originality' && x.check !== 'no_forced_structure');
        let fail = (findings as { severity: string }[]).some((x) => x.severity === 'error');
        if (st === 'QC4') {
          if (!cmp.pass) { fail = true; findings.push({ check: 'blind_solve', severity: 'error', issue: `mismatch: ${cmp.mismatches.join(',') || '-'}; ambiguous: ${cmp.ambiguous.join(' | ') || '-'}` }); }
          if (entry.verdict === 'fail' && !entry.findings.some((x) => x.severity === 'error')) { fail = true; findings.push({ check: 'verdict', severity: 'error', issue: 'reviewer verdict fail' }); }
        }
        return { status: fail ? 'FAIL' as const : 'PASS' as const, findings };
      };
      this.pipeline.recordAiReview(f.item.package_id, VERSION, f.bundle_hash, provider, synthetic, [
        { stage: 'QC2', part: 'semantic', ...stage('QC2') }, { stage: 'QC3', part: 'semantic', ...stage('QC3') }, { stage: 'QC4', part: 'deterministic', ...stage('QC4') },
      ]);
      const r = this.pipeline.release(f.item.package_id, VERSION, f.bundle_hash, `D-05 N6 automatic release after blind solve + QC1–QC4 (E-54, batch ${batchId})`);
      if (r.allowed) released++; else this.lastReasons.set(f.item.package_id, r.reasons);
    }
    return { reviewed: frozen.length, released };
  }

  status(batchId: string): ListeningItemStatus[] {
    return this.batch(batchId).items.map((i) => {
      const state = this.store.knowledge.releaseState(i.package_id, VERSION) ?? null;
      const qc = state === null ? null : this.pipeline.qcStatus(i.package_id, VERSION);
      return { item_id: i.item_id, package_id: i.package_id, item_key: i.item_key, part: i.part, topic: i.topic, questions: i.questions.length, precheck: i.precheck, release_state: state,
        qc: qc?.stages.map((s) => ({ stage: s.stage, status: s.status })) ?? [], release_reasons: this.lastReasons.get(i.package_id) ?? [] };
    });
  }

  list() {
    return this.batchIds().map((id) => {
      const b = this.batch(id); const st = this.status(id);
      return { batch_id: id, created_at: b.created_at, framework_version: b.framework.version, provider: b.author.provider, items: st.length,
        active: st.filter((s) => s.release_state === 'active').length, draft: st.filter((s) => s.release_state === 'draft').length, rejected: st.filter((s) => s.precheck === 'rejected').length,
        checks: b.checks.filter((c) => c.severity === 'error').map((c) => `${c.item_key} ${c.code}`) };
    });
  }
}

