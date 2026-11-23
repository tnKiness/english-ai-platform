// E-51 (D-05 C4, N7): Writing Task 2 prompts the learner owns (a book, a class, a past exam they hold) imported for
// personal practice. The learner pastes the prompt, chooses its genre, declares ownership and prior exposure; the
// application registers a Source Registry record with those rights, packages the prompt ('learner_owned'), runs
// QC1–QC3 and records the exposure (the learner has seen the prompt; "seen a sample answer" too when declared).
// An independent AI review (clarity, declared genre, measurable competencies) is the QC2/QC3 semantic + QC4 part;
// it runs from the worker or the CLI, never inside a web request, with the dedicated consent class
// learner_owned_content. Imported prompts are practice-only: they are never novel, so never independent checks.
// Everything stays in var/ (personal data): never committed, never part of a public export.
import { randomUUID } from 'node:crypto';
import type { BuilderPipeline } from '../qc/pipeline.js';
import { checkItems, REVIEW_STAGE, type ItemReviewResult, type Wt2Genre } from '../../domain/knowledge/item-checks.js';
import type { QcStage } from '../../domain/knowledge/release-gate.js';
import { studyDayOf } from '../../domain/scheduling/study-day.js';
import type { Store } from '../../infrastructure/sqlite/store.js';
import { AuthoringError, runAuthoringCall, type AuthoringExecutor, type FrameworkDocument } from './framework-authoring.js';
import type { ItemPolicy } from './item-authoring.js';

export type DeclaredExposure = 'never_done' | 'done' | 'seen_sample';
export interface ImportInput {
  request_key: string; prompt: string; task: 'writing_task2' | 'writing_task1_academic' | 'writing_task1_general' | 'speaking';
  genre: Wt2Genre; test_type: 'academic' | 'general_training' | 'both'; topic: string; exposure: DeclaredExposure; rights_confirmed: boolean; source_note: string;
}
interface LearnerItemDoc {
  schema_version: '1'; item_id: string; package_id: string; source_id: string; created_at: string; request_key: string;
  genre: Wt2Genre; topic: string; test_type: string; exposure: DeclaredExposure; source_note: string; framework_version: string; competencies: string[];
}
export interface LearnerItemView {
  item_id: string; package_id: string; created_at: string; genre: string; topic: string; exposure: DeclaredExposure; source_note: string;
  state: 'awaiting_review' | 'released' | 'qc_failed' | 'withdrawn'; qc: { stage: string; status: string }[]; review_findings: { check: string; severity: string; issue: string }[];
}

const TARGET = 'learner-items';
const VERSION = 'v1';
const DOC = 'learner-item';
const REVIEW_DOC = 'learner-item-review';
const MAX_PROMPT_CHARS = 2000;

export class LearnerItemService {
  constructor(private store: Store, private pipeline: BuilderPipeline, private approvedFramework: () => FrameworkDocument | null, private policy: ItemPolicy) {}

  private framework(): FrameworkDocument {
    const fw = this.approvedFramework();
    if (!fw || fw.author.synthetic) throw new AuthoringError('Chưa có khung năng lực Writing Task 2 đã duyệt; đề nhập vào được chấm theo khung đó', 'FRAMEWORK_NOT_APPROVED');
    return fw;
  }

  private itemIds(): string[] {
    return this.store.builder.bundles().filter((b) => b.content_origin === 'learner_owned')
      .flatMap((b) => this.store.builder.packageUnits(b.package_id, b.version).filter((u) => u.kind === 'item').map((u) => u.id))
      .filter((id) => this.store.json.find('knowledge', DOC, id));
  }
  private doc(itemId: string): LearnerItemDoc { return this.store.json.get('knowledge', DOC, itemId) as LearnerItemDoc; }

  /**
   * Import one prompt. Synchronous and AI-free: rights and exposure are recorded, the package is frozen and checked
   * deterministically; the AI review happens later (reviewPending). The same request_key returns the same item.
   */
  importPrompt(input: ImportInput): LearnerItemView {
    if (input.task !== 'writing_task2') {
      throw new AuthoringError('Hiện chỉ nhập được đề Writing Task 2: Task 1 và Speaking chưa có khung năng lực để chấm', 'TASK_NOT_SUPPORTED');
    }
    if (!input.rights_confirmed) throw new AuthoringError('Cần xác nhận bạn sở hữu tài liệu này và chỉ dùng cá nhân', 'RIGHTS_NOT_CONFIRMED', 400);
    const prompt = input.prompt.trim().replace(/\r\n/g, '\n');
    if (prompt.length > MAX_PROMPT_CHARS) throw new AuthoringError(`Đề dài quá ${MAX_PROMPT_CHARS} ký tự`, 'PROMPT_TOO_LONG', 400);
    const existing = this.itemIds().map((id) => this.doc(id)).find((d) => d.request_key === input.request_key);
    if (existing) return this.view(existing.item_id);
    const fw = this.framework();
    const prior = this.itemIds().map((id) => ({ item_id: id, prompt: (this.store.json.get('item', id, VERSION) as { body: { prompt: string } }).body.prompt, item_family: null }));
    const findings = checkItems([{ item_key: 'imported', genre: input.genre, topic: input.topic || 'imported', item_family: 'imported', prompt, test_type: input.test_type,
      competencies: fw.competencies.map((c) => c.competency_id), difficulty_estimate: 'middle', rationale: 'learner import' }],
      { competencies: new Set(fw.competencies.map((c) => c.competency_id)), existing: prior, similarity_threshold: this.policy.similarity_threshold, min_prompt_words: 15 })
      .filter((f) => f.severity === 'error' && (f.code === 'NEAR_DUPLICATE' || f.code === 'PROMPT_TOO_SHORT'));
    if (findings.length) throw new AuthoringError(`Không nhập: ${findings.map((f) => f.code === 'NEAR_DUPLICATE' ? `trùng gần với đề đã nhập (${f.detail})` : `đề quá ngắn (${f.detail})`).join('; ')}`, findings[0]!.code, 409);

    const short = randomUUID().slice(0, 8);
    const itemId = `wt2-own-${short}`;
    const packageId = `pkg-${itemId}`;
    const sourceId = `learner-src-${short}`;
    const at = this.store.now().toISOString();
    // Every framework competency: a whole Task 2 essay gives the chance to show each; the assessor answers
    // opportunity "absent" where the prompt gave none, and the review flags a competency it cannot show.
    const competencies = fw.competencies.map((c) => c.competency_id);
    return this.store.db.transaction(() => {
      this.pipeline.registerSource({
        schema_version: '1', source_id: sourceId, version: VERSION, title: `Đề người học nhập: ${input.topic || itemId}`, origin: 'teaching',
        locator: { url: null, document: input.source_note.trim() || 'learner import' }, scope_level: 'document',
        copyright_notice: 'Tài liệu người học sở hữu; chỉ lưu cục bộ, dùng cá nhân.', accessed_at: at, checksum: null,
        intended_purposes: ['internal_use', 'learner_display'],
        rights: { status: 'determined', store_copy: true, ai_processing: true, learner_display: true, basis: `Người học xác nhận sở hữu, dùng cá nhân (D-05 N7, E-51), ${at}` },
        registry_state: 'approved',
      });
      const src = [{ source_id: sourceId, source_version: VERSION, locator: input.source_note.trim() || 'learner import' }];
      const gov = (unitType: 'task_item' | 'answer_key' | 'rubric', id: string, roles: string[], disclosure: string, extra: { deps?: { kind: string; id: string; version: string }[]; sources?: unknown[]; derivation?: string; authority?: string } = {}) => ({
        identity: { unit_id: id, unit_type: unitType, version: VERSION },
        scope: { test_type: input.test_type, skills: ['writing'], task_types: ['writing_task2', input.genre], context: `Learner-owned IELTS Writing Task 2 prompt (E-51), framework ${fw.framework_id}@${fw.version}` },
        basis: { sources: extra.sources ?? src, derivation: extra.derivation ?? 'extracted', derived_from: [], knowledge_gaps: [] },
        authority: extra.authority ?? 'pedagogical_guidance',
        validity: { status: 'draft', effective_from: null, review_due: null },
        verification: { content: 'not_checked', resources: 'not_applicable', usage_roles: [], empirical: 'untested', lifecycle: 'draft' },
        dependencies: { units: extra.deps ?? [], media: [] },
        permissions: { roles, disclosure, copyright: 'licensed' },
      });
      const itemRef = { kind: 'item', id: itemId, version: VERSION };
      const bandSources = fw.sources.filter((s) => s.role === 'band_descriptors').map((s) => { const i = s.source_ref.lastIndexOf('@'); return { source_id: s.source_ref.slice(0, i), source_version: s.source_ref.slice(i + 1), locator: 'band descriptor table' }; });
      const req = this.pipeline.createRequest({
        schema_version: '1', request_id: `req-${itemId}`, package_id: packageId, competencies, task_roles: ['practice'], blocks: ['task_item', 'answer_key', 'rubric'],
        usage_purposes: ['practice'], scope: { test_type: input.test_type, skills: ['writing'] }, out_of_scope: ['Band estimation', 'Independent verification (prompt already seen)', 'Public export'],
        acceptance_criteria: ['QC1–QC4 PASS on the frozen bundle hash'], limits: { max_sources: 1, max_revision_rounds: 0, max_ai_runs: 1 }, content_origin: 'learner_owned',
      });
      this.pipeline.stageUnit(req.request_id, 'item', { schema_version: '1', governance: gov('task_item', itemId, ['learner', 'blind_solver', 'verifier', 'assessor'], 'prompt'), body: {
        item_family_id: `wt2-own-fam-${short}`, derived_from: [], shared_stimulus_id: null, decisive_features: [input.genre, input.topic || 'imported'],
        stimulus: { text: null, media: [] }, prompt, questions: [{ question_id: 'q1', prompt: `Write at least ${this.policy.essay_min_words} words.`, response_type: 'essay', options: [] }],
        difficulty: { target_learner_level: null, initial_estimate: null, observed: null, calibration: 'estimated' },
      } });
      this.pipeline.stageUnit(req.request_id, 'knowledge', { schema_version: '1', governance: gov('answer_key', `${itemId}-key`, ['verifier', 'assessor'], 'answer', { deps: [itemRef], derivation: 'interpreted' }), body: {
        item: itemRef, answers: [{ question_id: 'q1', accepted: ['essay_assessed_by_rubric'], explanation: 'Essay task: judged against the rubric for the measurement targets, never against a model essay.', evidence_locator: 'rubric' }],
        measurement_targets: competencies, competing_answers_considered: [],
      } });
      this.pipeline.stageUnit(req.request_id, 'rubric', { schema_version: '1', governance: gov('rubric', `${itemId}-rubric`, ['assessor', 'verifier'], 'prompt', { sources: bandSources.length ? bandSources : src, derivation: 'authored_from_sources', authority: 'internal_interpretation' }), body: {
        official_criteria: fw.rubric.official.map((o) => ({ criterion: o.criterion, band: o.band, descriptor_locator: o.locator })),
        observation_guide: fw.rubric.observation_guide.map((g) => ({ signal: `[${g.competency_id}] ${g.signal}`, counter_evidence: g.counter_evidence, valid_exceptions: g.valid_exceptions, inconclusive_when: g.inconclusive_when })),
        aggregation: { method: 'holistic_by_criterion', notes: fw.rubric.aggregation.notes },
      } });
      this.pipeline.setCoverage(req.request_id, { schema_version: '1', functions: [{ usage_role: 'practice', required_categories: ['support_content'] }],
        entries: [{ category: 'support_content', units: [{ kind: 'rubric', id: `${itemId}-rubric`, version: VERSION }], note: `Rubric from approved framework ${fw.framework_id}@${fw.version}` }], test_cases: [] });
      this.pipeline.freeze(req.request_id, VERSION);
      this.pipeline.runChecks(packageId, VERSION);
      const servable = this.store.knowledge.servableItem(itemId, VERSION, 'learner');
      const hash = this.store.json.find('item', itemId, VERSION)!.hash;
      const family = servable.ok ? servable.item_family_id : `wt2-own-fam-${short}`;
      // The learner typed the prompt in: it is seen. A declared sample answer is an exposure of its own (N7).
      for (const level of input.exposure === 'seen_sample' ? ['prompt', 'sample_or_variant'] as const : ['prompt'] as const) {
        this.store.learning.recordExposure({ idempotency_key: `learner:import:${itemId}:${level}`, item: { id: itemId, version: VERSION, hash }, item_family_id: family,
          shared_stimulus_id: null, surface: 'learner', scope: 'learner', level });
      }
      const doc: LearnerItemDoc = { schema_version: '1', item_id: itemId, package_id: packageId, source_id: sourceId, created_at: at, request_key: input.request_key,
        genre: input.genre, topic: input.topic || 'imported', test_type: input.test_type, exposure: input.exposure, source_note: input.source_note.trim(), framework_version: fw.version, competencies };
      this.store.json.put('knowledge', DOC, itemId, doc);
      return this.view(itemId);
    }).immediate();
  }

  callsToday(): number {
    const today = studyDayOf(this.store.now());
    const since = new Date(this.store.now().getTime() - 2 * 86_400_000).toISOString();
    return (this.store.db.prepare('SELECT started_at FROM authoring_runs WHERE target_id = ? AND started_at >= ?').all(TARGET, since) as { started_at: string }[])
      .filter((r) => studyDayOf(new Date(r.started_at)) === today).length;
  }

  private pending() {
    return this.itemIds().flatMap((id) => {
      const d = this.doc(id);
      if (this.store.knowledge.releaseState(d.package_id, VERSION) !== 'draft') return [];
      const s = this.pipeline.qcStatus(d.package_id, VERSION);
      const det = s.stages.filter((x) => x.stage !== 'QC4').every((x) => x.parts.find((p) => p.part === 'deterministic')?.status === 'PASS');
      return det && s.stages.find((x) => x.stage === 'QC4')!.status === 'NOT_RUN' ? [{ doc: d, bundle_hash: s.bundle_hash }] : [];
    });
  }

  /**
   * One review call over every imported prompt still waiting, on exactly the frozen text. Originality is not a
   * criterion here (the learner owns a published prompt by design); clarity and the declared genre are (QC4).
   */
  async reviewPending(executor: AuthoringExecutor): Promise<{ run_id: string | null; reviewed: number; released: number }> {
    const pending = this.pending();
    if (pending.length === 0) return { run_id: null, reviewed: 0, released: 0 };
    if (this.callsToday() + 1 > this.policy.daily_ai_call_cap) throw new AuthoringError(`Đã dùng ${this.callsToday()}/${this.policy.daily_ai_call_cap} lượt rà soát đề nhập hôm nay`, 'DAILY_CAP', 429);
    const fw = this.framework();
    const items = pending.map((p) => ({ item_key: p.doc.item_id.replace(/-/g, '_').slice(-24), task_scope: 'essay', genre: p.doc.genre, topic: p.doc.topic,
      prompt: (this.store.json.get('item', p.doc.item_id, VERSION) as { body: { prompt: string } }).body.prompt, competencies: p.doc.competencies, origin: 'learner_owned' }));
    const payload = {
      task: this.policy.task, note: 'These prompts were imported by the learner from material they own. Do not report originality: being a published prompt is expected here.',
      framework: { framework_id: fw.framework_id, version: fw.version, competencies: fw.competencies.map((c) => ({ competency_id: c.competency_id, criterion: c.criterion, assessor_criterion: c.assessor_criterion })) },
      items, avoid: [],
    };
    const { runId, out } = await runAuthoringCall(this.store, executor, 'content.item_review', payload, { id: TARGET, version: null });
    if (!out.result.ok) throw new AuthoringError(`AI rà soát đề nhập thất bại (${out.result.error}${out.detail ? `: ${out.detail}` : ''}). Lần chạy ${runId} đã được ghi.`, `AI_${out.result.error}`, 502);
    const result = out.result.result as ItemReviewResult;
    this.store.json.put('knowledge', REVIEW_DOC, runId, { schema_version: '1', run_id: runId, provider: out.provider, model: out.model, reviewed: pending.map((p) => ({ item_id: p.doc.item_id, bundle_hash: p.bundle_hash })), items, result });
    let released = 0;
    pending.forEach((p, i) => {
      const entry = result.items.find((r) => r.item_key === items[i]!.item_key);
      if (!entry) return;
      const findings = entry.findings.filter((x) => x.check !== 'originality');
      const stage = (st: QcStage) => {
        const f = findings.filter((x) => REVIEW_STAGE[x.check] === st);
        const verdictFail = st === 'QC4' && entry.verdict === 'fail' && !entry.findings.some((x) => x.severity === 'error');
        return { status: f.some((x) => x.severity === 'error') || verdictFail ? 'FAIL' as const : 'PASS' as const, findings: f };
      };
      this.pipeline.recordAiReview(p.doc.package_id, VERSION, p.bundle_hash, out.provider, result.synthetic, [
        { stage: 'QC2', part: 'semantic', ...stage('QC2') }, { stage: 'QC3', part: 'semantic', ...stage('QC3') }, { stage: 'QC4', part: 'deterministic', ...stage('QC4') },
      ]);
      if (this.pipeline.release(p.doc.package_id, VERSION, p.bundle_hash, `Learner-owned prompt passed QC1–QC4 (E-51, review ${runId})`).allowed) released++;
    });
    return { run_id: runId, reviewed: pending.length, released };
  }

  view(itemId: string): LearnerItemView {
    const d = this.doc(itemId);
    const state = this.store.knowledge.releaseState(d.package_id, VERSION);
    const qc = this.pipeline.qcStatus(d.package_id, VERSION);
    const failed = qc.stages.some((s) => s.status === 'FAIL');
    const reviews = (this.store.db.prepare("SELECT run_id FROM authoring_runs WHERE target_id = ? AND task_type = 'content.item_review' AND ok = 1 ORDER BY started_at").all(TARGET) as { run_id: string }[])
      .flatMap((r) => this.store.json.find('knowledge', REVIEW_DOC, r.run_id) ? [this.store.json.get('knowledge', REVIEW_DOC, r.run_id) as { reviewed: { item_id: string }[]; items: { item_key: string }[]; result: ItemReviewResult }] : [])
      .filter((r) => r.reviewed.some((x) => x.item_id === itemId));
    const last = reviews.at(-1);
    const key = last?.items[last.reviewed.findIndex((x) => x.item_id === itemId)]?.item_key;
    const entry = last?.result.items.find((x) => x.item_key === key);
    return {
      item_id: d.item_id, package_id: d.package_id, created_at: d.created_at, genre: d.genre, topic: d.topic, exposure: d.exposure, source_note: d.source_note,
      state: state === 'active' ? 'released' : state === 'draft' ? (failed ? 'qc_failed' : 'awaiting_review') : 'withdrawn',
      qc: qc.stages.map((s) => ({ stage: s.stage, status: s.status })), review_findings: (entry?.findings ?? []).filter((x) => x.check !== 'originality'),
    };
  }

  list(): LearnerItemView[] {
    return this.itemIds().map((id) => this.view(id)).sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
}
