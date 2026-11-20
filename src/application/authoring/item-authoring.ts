// E-47 (D-05 C3, N5/N6/N8): AI writes IELTS Writing Task 2 prompts from the APPROVED competency framework; the
// application checks them, packages each passing prompt through the Builder pipeline (freeze → QC1–QC3 deterministic
// → independent AI review recorded as QC2/QC3 semantic + QC4 on the frozen bundle hash) and releases it automatically
// when every QC part passed (N6 option A). Nothing here reads learner data. Every AI call is a row in authoring_runs.
// - Packages are content_origin 'ai_authored' and count towards the learner profile; a FakeAdapter review is
//   recorded as synthetic_fake, which the release gate refuses.
// - Batch documents are immutable JSON; the live state of each prompt (draft, active, suspended…) is read from the
//   release store, so a later revoke in the QC console is reflected here without rewriting history.
import type { BuilderPipeline } from '../qc/pipeline.js';
import type { QcStage } from '../../domain/knowledge/release-gate.js';
import { studyDayOf } from '../../domain/scheduling/study-day.js';
import { checkItems, REVIEW_STAGE, type ItemFinding, type ItemReviewResult, type Wt2ItemDraft, type Wt2ItemSetResult } from '../../domain/knowledge/item-checks.js';
import type { Store } from '../../infrastructure/sqlite/store.js';
import { AuthoringError, runAuthoringCall, type AuthoringExecutor, type FrameworkDocument } from './framework-authoring.js';

export interface ItemPolicy {
  schema_version: '1'; item_set_id: string; decision: string; task: string; batch_size: number; daily_ai_call_cap: number; similarity_threshold: number;
  min_prompt_words: number; essay_min_words: number; recommended_minutes: number; genres: string[]; usage_purposes: ('practice' | 'independent_verification')[];
}

export interface BatchItem extends Wt2ItemDraft { item_id: string; package_id: string; precheck: 'passed' | 'rejected' }
export interface BatchDocument {
  schema_version: '1'; batch_id: string; item_set_id: string; created_at: string;
  framework: { framework_id: string; version: string };
  author: { run_id: string; provider: string; cli_version: string | null; model: string | null; synthetic: boolean };
  checks: ItemFinding[]; limitations: string[]; items: BatchItem[];
}
export interface ItemReviewDocument { schema_version: '1'; batch_id: string; run_id: string; provider: string; model: string | null; reviewed: { item_id: string; bundle_hash: string }[]; result: ItemReviewResult }
/** Metadata only: the prompt text is never part of a status, so listing batches is not an exposure (06 §4.1). */
export interface ItemStatus {
  item_id: string; package_id: string; item_key: string; genre: string; topic: string; competencies: string[]; precheck: 'passed' | 'rejected';
  release_state: string | null; bundle_hash: string | null; qc: { stage: string; status: string }[]; release_reasons: string[];
}

const PKG_VERSION = 'v1';
const BATCH_DOC = 'wt2-item-batch';
const REVIEW_DOC = 'wt2-item-review';
const ESSAY_KEY = 'essay_assessed_by_rubric';

const splitRef = (ref: string) => { const i = ref.lastIndexOf('@'); return { source_id: ref.slice(0, i), source_version: ref.slice(i + 1) }; };

export class ItemAuthoringService {
  /** Release-gate reasons of the last automatic release attempt, per package (not persisted; the console re-checks). */
  private lastReasons = new Map<string, string[]>();
  constructor(private store: Store, private pipeline: BuilderPipeline, private approvedFramework: () => FrameworkDocument | null, private policy: ItemPolicy) {}

  private framework(): FrameworkDocument {
    const fw = this.approvedFramework();
    if (!fw) throw new AuthoringError('Chưa có khung năng lực đã duyệt. Duyệt một bản ở Builder & QC → Khung năng lực trước khi sinh đề (C3 dùng khung đã duyệt).', 'FRAMEWORK_NOT_APPROVED');
    if (fw.author.synthetic) throw new AuthoringError('Khung đã duyệt là synthetic; không dùng để sinh đề thật', 'SYNTHETIC');
    return fw;
  }

  /** N8: AI calls for item authoring and review per study day, separate from assessment calls. */
  callsToday(): number {
    const today = studyDayOf(this.store.now());
    const since = new Date(this.store.now().getTime() - 2 * 86_400_000).toISOString();
    const rows = this.store.db.prepare('SELECT started_at FROM authoring_runs WHERE target_id = ? AND started_at >= ?').all(this.policy.item_set_id, since) as { started_at: string }[];
    return rows.filter((r) => studyDayOf(new Date(r.started_at)) === today).length;
  }
  private ensureQuota(needed: number) {
    const used = this.callsToday();
    if (used + needed > this.policy.daily_ai_call_cap) {
      throw new AuthoringError(`Đã dùng ${used}/${this.policy.daily_ai_call_cap} lượt gọi AI sinh đề hôm nay (N8); cần thêm ${needed}. Chạy lại vào ngày học sau.`, 'DAILY_CAP', 429);
    }
  }

  private batchIds(): string[] {
    return (this.store.db.prepare("SELECT run_id FROM authoring_runs WHERE target_id = ? AND task_type = 'content.item_author' AND ok = 1 ORDER BY started_at DESC")
      .all(this.policy.item_set_id) as { run_id: string }[]).map((r) => r.run_id).filter((id) => this.store.json.find('knowledge', BATCH_DOC, id));
  }
  batch(batchId: string): BatchDocument {
    if (!this.store.json.find('knowledge', BATCH_DOC, batchId)) throw new AuthoringError(`Không có lô đề ${batchId}`, 'NOT_FOUND', 404);
    return this.store.json.get('knowledge', BATCH_DOC, batchId) as BatchDocument;
  }
  private reviews(batchId: string): ItemReviewDocument[] {
    const runs = this.store.db.prepare("SELECT run_id FROM authoring_runs WHERE target_id = ? AND task_type = 'content.item_review' AND target_version = ? AND ok = 1 ORDER BY started_at")
      .all(this.policy.item_set_id, batchId) as { run_id: string }[];
    return runs.flatMap((r) => this.store.json.find('knowledge', REVIEW_DOC, `${batchId}-${r.run_id}`) ? [this.store.json.get('knowledge', REVIEW_DOC, `${batchId}-${r.run_id}`) as ItemReviewDocument] : []);
  }

  /** Every packaged prompt so far: the AI is told to avoid their themes, and new prompts are compared against them. */
  private existing() {
    return this.batchIds().flatMap((id) => this.batch(id).items.filter((i) => i.precheck === 'passed').map((i) => ({ item_id: i.item_id, prompt: i.prompt, item_family: i.item_family, topic: i.topic, genre: i.genre })));
  }

  /**
   * One batch: author (1 AI call), deterministic pre-checks, package + freeze + QC1–3 each passing prompt, then one
   * independent review call over the frozen prompts and automatic release of those that pass every QC part.
   */
  async author(executor: AuthoringExecutor, count = this.policy.batch_size): Promise<{ batch_id: string; items: ItemStatus[] }> {
    const fw = this.framework();
    const n = Math.max(1, Math.min(10, Math.floor(count)));
    this.ensureQuota(2);
    const existing = this.existing();
    const competencies = fw.competencies.map((c) => ({ competency_id: c.competency_id, criterion: c.criterion, title_vi: c.title_vi, assessor_criterion: c.assessor_criterion }));
    const payload = {
      task: this.policy.task,
      requirements: { count: n, genres: this.policy.genres, essay_min_words: this.policy.essay_min_words },
      framework: { framework_id: fw.framework_id, version: fw.version, competencies },
      avoid: existing.map(({ prompt, item_family, topic, genre }) => ({ prompt, item_family, topic, genre })),
    };
    const { runId, out } = await runAuthoringCall(this.store, executor, 'content.item_author', payload, { id: this.policy.item_set_id, version: null });
    if (!out.result.ok) throw new AuthoringError(`AI soạn đề thất bại (${out.result.error}${out.detail ? `: ${out.detail}` : ''}). Lần chạy ${runId} đã được ghi.`, `AI_${out.result.error}`, 502);
    const set = out.result.result as Wt2ItemSetResult;
    const checks = checkItems(set.items, { competencies: new Set(fw.competencies.map((c) => c.competency_id)), existing,
      similarity_threshold: this.policy.similarity_threshold, min_prompt_words: this.policy.min_prompt_words });
    const short = runId.slice(0, 8);
    const items: BatchItem[] = set.items.map((it) => {
      const item_id = `wt2-ai-${short}-${it.item_key.replace(/_/g, '-')}`;
      const rejected = checks.some((f) => f.item_key === it.item_key && f.severity === 'error');
      return { ...it, item_id, package_id: `pkg-${item_id}`, precheck: rejected ? 'rejected' as const : 'passed' as const };
    });
    const doc: BatchDocument = {
      schema_version: '1', batch_id: runId, item_set_id: this.policy.item_set_id, created_at: this.store.now().toISOString(),
      framework: { framework_id: fw.framework_id, version: fw.version },
      author: { run_id: runId, provider: out.provider, cli_version: out.cli_version, model: out.model, synthetic: set.synthetic || out.provider === 'fake' },
      checks, limitations: set.limitations, items,
    };
    this.store.json.put('knowledge', BATCH_DOC, runId, doc);
    for (const it of items.filter((i) => i.precheck === 'passed')) this.freezeItem(fw, it);
    await this.review(executor, runId);
    return { batch_id: runId, items: this.status(runId) };
  }

  private units(fw: FrameworkDocument, it: BatchItem) {
    const sources = fw.sources.map((s) => ({ ...splitRef(s.source_ref), locator: s.role }));
    const bandSources = fw.sources.filter((s) => s.role === 'band_descriptors').map((s) => ({ ...splitRef(s.source_ref), locator: 'band descriptor table' }));
    const gov = (unitType: 'task_item' | 'answer_key' | 'rubric', id: string, roles: string[], disclosure: string, extra: { deps?: { kind: string; id: string; version: string }[]; sources?: typeof sources; authority?: string } = {}) => ({
      identity: { unit_id: id, unit_type: unitType, version: PKG_VERSION },
      scope: { test_type: it.test_type, skills: ['writing'], task_types: ['writing_task2', it.genre], context: `AI-authored IELTS Writing Task 2 prompt (E-47), framework ${fw.framework_id}@${fw.version}` },
      basis: { sources: extra.sources ?? sources, derivation: 'authored_from_sources', derived_from: [], knowledge_gaps: [] },
      authority: extra.authority ?? 'pedagogical_guidance',
      validity: { status: 'draft', effective_from: null, review_due: null },
      verification: { content: 'not_checked', resources: 'not_applicable', usage_roles: [], empirical: 'untested', lifecycle: 'draft' },
      dependencies: { units: extra.deps ?? [], media: [] },
      permissions: { roles, disclosure, copyright: 'licensed' },
    });
    const itemRef = { kind: 'item', id: it.item_id, version: PKG_VERSION };
    const keyId = `${it.item_id}-key`; const rubricId = `${it.item_id}-rubric`;
    const guide = fw.rubric.observation_guide.filter((g) => it.competencies.includes(g.competency_id))
      .map((g) => ({ signal: `[${g.competency_id}] ${g.signal}`, counter_evidence: g.counter_evidence, valid_exceptions: g.valid_exceptions, inconclusive_when: g.inconclusive_when }));
    return {
      item: { schema_version: '1', governance: gov('task_item', it.item_id, ['learner', 'blind_solver', 'verifier', 'assessor'], 'prompt'), body: {
        item_family_id: `wt2-fam-${it.item_family}`, derived_from: [], shared_stimulus_id: null, decisive_features: [it.genre, it.topic],
        stimulus: { text: null, media: [] }, prompt: it.prompt,
        questions: [{ question_id: 'q1', prompt: `Write at least ${this.policy.essay_min_words} words.`, response_type: 'essay', options: [] }],
        difficulty: { target_learner_level: null, initial_estimate: it.difficulty_estimate, observed: null, calibration: 'estimated' },
      } },
      key: { schema_version: '1', governance: gov('answer_key', keyId, ['verifier', 'assessor'], 'answer', { deps: [itemRef] }), body: {
        item: itemRef,
        answers: [{ question_id: 'q1', accepted: [ESSAY_KEY], explanation: 'Essay task: there is no fixed answer. The response is judged against the rubric for the measurement targets, never against a model essay.', evidence_locator: 'rubric' }],
        measurement_targets: it.competencies, competing_answers_considered: [],
      } },
      rubric: { schema_version: '1', governance: gov('rubric', rubricId, ['assessor', 'verifier'], 'prompt', { sources: bandSources.length ? bandSources : sources, authority: 'internal_interpretation' }), body: {
        official_criteria: fw.rubric.official.map((o) => ({ criterion: o.criterion, band: o.band, descriptor_locator: o.locator })),
        observation_guide: guide, aggregation: { method: 'holistic_by_criterion', notes: fw.rubric.aggregation.notes },
      } },
      ids: { keyId, rubricId },
    };
  }

  /** Stage, freeze and run the deterministic QC1–QC3 checks for one prompt; failures stay visible in the QC console. */
  private freezeItem(fw: FrameworkDocument, it: BatchItem) {
    const u = this.units(fw, it);
    const req = this.pipeline.createRequest({
      schema_version: '1', request_id: `req-${it.item_id}`, package_id: it.package_id, competencies: it.competencies, task_roles: [...this.policy.usage_purposes],
      blocks: ['task_item', 'answer_key', 'rubric'], usage_purposes: [...this.policy.usage_purposes], scope: { test_type: it.test_type, skills: ['writing'] },
      out_of_scope: ['Band estimation', 'Model answers'], acceptance_criteria: ['QC1–QC4 PASS on the frozen bundle hash; automatic release (D-05 N6)'],
      limits: { max_sources: Math.max(1, fw.sources.length), max_revision_rounds: 0, max_ai_runs: 2 }, content_origin: 'ai_authored',
    });
    this.pipeline.stageUnit(req.request_id, 'item', u.item);
    this.pipeline.stageUnit(req.request_id, 'knowledge', u.key);
    this.pipeline.stageUnit(req.request_id, 'rubric', u.rubric);
    // Prompt packages: the rubric is the support content both roles rely on. Assessment test cases with expected
    // outcomes belong to the calibration set (C6, N9), not to a prompt package (E-47).
    this.pipeline.setCoverage(req.request_id, {
      schema_version: '1',
      functions: this.policy.usage_purposes.map((usage_role) => ({ usage_role, required_categories: ['support_content'] })),
      entries: [{ category: 'support_content', units: [{ kind: 'rubric', id: u.ids.rubricId, version: PKG_VERSION }], note: `Rubric from approved framework ${fw.framework_id}@${fw.version}` }],
      test_cases: [],
    });
    this.pipeline.freeze(req.request_id, PKG_VERSION);
    this.pipeline.runChecks(it.package_id, PKG_VERSION);
  }

  /** Draft packages of a batch whose deterministic QC passed and that have no QC4 yet on their current hash. */
  private awaitingReview(batchId: string) {
    return this.batch(batchId).items.filter((i) => i.precheck === 'passed' && this.store.knowledge.releaseState(i.package_id, PKG_VERSION) === 'draft').flatMap((i) => {
      const s = this.pipeline.qcStatus(i.package_id, PKG_VERSION);
      const det = s.stages.filter((x) => x.stage !== 'QC4').every((x) => x.parts.find((p) => p.part === 'deterministic')?.status === 'PASS');
      const qc4 = s.stages.find((x) => x.stage === 'QC4')!.status;
      return det && qc4 === 'NOT_RUN' ? [{ item: i, bundle_hash: s.bundle_hash }] : [];
    });
  }

  /**
   * Independent review of the frozen prompts of a batch (also used to retry after a failed review call). The reviewer
   * gets exactly what was frozen — read back from the immutable store — and the result is bound to each bundle hash.
   */
  async review(executor: AuthoringExecutor, batchId: string): Promise<{ run_id: string | null; reviewed: number; released: number }> {
    const fw = this.framework();
    const pending = this.awaitingReview(batchId);
    if (pending.length === 0) return { run_id: null, reviewed: 0, released: 0 };
    this.ensureQuota(1);
    const frozen = pending.map(({ item, bundle_hash }) => {
      const body = (this.store.json.get('item', item.item_id, PKG_VERSION) as { body: { prompt: string } }).body;
      const key = (this.store.json.get('knowledge', `${item.item_id}-key`, PKG_VERSION) as { body: { measurement_targets: string[] } }).body;
      return { item, bundle_hash, view: { item_key: item.item_key, genre: item.genre, topic: item.topic, prompt: body.prompt, competencies: key.measurement_targets } };
    });
    const others = this.existing().filter((e) => !frozen.some((f) => f.item.item_id === e.item_id));
    const payload = {
      task: this.policy.task,
      framework: { framework_id: fw.framework_id, version: fw.version, competencies: fw.competencies.map((c) => ({ competency_id: c.competency_id, criterion: c.criterion, assessor_criterion: c.assessor_criterion })) },
      items: frozen.map((f) => f.view),
      avoid: others.map(({ prompt, topic, genre }) => ({ prompt, topic, genre })),
    };
    const { runId, out } = await runAuthoringCall(this.store, executor, 'content.item_review', payload, { id: this.policy.item_set_id, version: batchId });
    if (!out.result.ok) throw new AuthoringError(`AI rà soát đề thất bại (${out.result.error}${out.detail ? `: ${out.detail}` : ''}). Lần chạy ${runId} đã được ghi; chạy lại: npm.cmd run author -- items-review ${batchId}`, `AI_${out.result.error}`, 502);
    const result = out.result.result as ItemReviewResult;
    const doc: ItemReviewDocument = { schema_version: '1', batch_id: batchId, run_id: runId, provider: out.provider, model: out.model,
      reviewed: frozen.map((f) => ({ item_id: f.item.item_id, bundle_hash: f.bundle_hash })), result };
    this.store.json.put('knowledge', REVIEW_DOC, `${batchId}-${runId}`, doc);
    let released = 0;
    for (const f of frozen) {
      const entry = result.items.find((r) => r.item_key === f.item.item_key);
      if (!entry) continue; // QC4 stays NOT_RUN; the gate reports QC_MISSING and a later review can complete it
      const stageResult = (stage: QcStage) => {
        const findings = entry.findings.filter((x) => REVIEW_STAGE[x.check] === stage);
        const failVerdict = stage === 'QC4' && entry.verdict === 'fail' && !entry.findings.some((x) => x.severity === 'error');
        const fail = findings.some((x) => x.severity === 'error') || failVerdict;
        return { status: fail ? 'FAIL' as const : 'PASS' as const, findings: failVerdict ? [...findings, { check: 'verdict', severity: 'error', issue: 'reviewer verdict fail' }] : findings };
      };
      this.pipeline.recordAiReview(f.item.package_id, PKG_VERSION, f.bundle_hash, out.provider, result.synthetic, [
        { stage: 'QC2', part: 'semantic', ...stageResult('QC2') }, { stage: 'QC3', part: 'semantic', ...stageResult('QC3') }, { stage: 'QC4', part: 'deterministic', ...stageResult('QC4') },
      ]);
      const r = this.pipeline.release(f.item.package_id, PKG_VERSION, f.bundle_hash, `D-05 N6 automatic release after QC1–QC4 (E-47, batch ${batchId})`);
      if (r.allowed) released++; else this.lastReasons.set(f.item.package_id, r.reasons);
    }
    return { run_id: runId, reviewed: frozen.length, released };
  }

  status(batchId: string): ItemStatus[] {
    return this.batch(batchId).items.map((i) => {
      const state = this.store.knowledge.releaseState(i.package_id, PKG_VERSION) ?? null;
      const qc = state === null ? null : this.pipeline.qcStatus(i.package_id, PKG_VERSION);
      return { item_id: i.item_id, package_id: i.package_id, item_key: i.item_key, genre: i.genre, topic: i.topic, competencies: i.competencies, precheck: i.precheck,
        release_state: state, bundle_hash: qc?.bundle_hash ?? null, qc: qc?.stages.map((s) => ({ stage: s.stage, status: s.status })) ?? [], release_reasons: this.lastReasons.get(i.package_id) ?? [] };
    });
  }

  list() {
    return this.batchIds().map((id) => {
      const b = this.batch(id);
      const st = this.status(id);
      return { batch_id: id, created_at: b.created_at, framework_version: b.framework.version, provider: b.author.provider, model: b.author.model,
        items: st.length, rejected: st.filter((s) => s.precheck === 'rejected').length, active: st.filter((s) => s.release_state === 'active').length,
        draft: st.filter((s) => s.release_state === 'draft').length };
    });
  }

  /**
   * Console view of a batch without any prompt text: reading a prompt is an exposure that must be logged first, so
   * the learner opens it from the package console ("Xem nội dung"), which records the exposure before reading.
   */
  detail(batchId: string) {
    const { items: _items, ...batch } = this.batch(batchId);
    return { batch, items: this.status(batchId), reviews: this.reviews(batchId).map(({ reviewed: _r, ...r }) => r), calls_today: this.callsToday(), daily_cap: this.policy.daily_ai_call_cap };
  }
}
