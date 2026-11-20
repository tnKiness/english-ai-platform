// E-42 (D-05 C2): AI authors the IELTS Writing Task 2 competency framework from approved sources; a second,
// independent AI call reviews it; the application checks it deterministically; the learner approves or rejects.
// - Every AI call is a row in authoring_runs (provider actually used, hashes of input and output), success or not.
// - The draft is an immutable JSON object; the official rubric layer (band descriptors) is copied by the application
//   from the reconstructed table, never written by the AI.
// - Nothing here touches learner data, and nothing becomes learner-facing until approved (C3 uses the approved one).
import { randomUUID } from 'node:crypto';
import type { AdapterResult, FrameworkResult, FrameworkReviewResult } from '../ai/provider-adapter.js';
import { checkFramework, type FrameworkCheck } from '../../domain/knowledge/framework-checks.js';
import { canonicalJson, sha256 } from '../../infrastructure/files/paths.js';
import type { FrameworkPolicy, FrameworkSources } from '../../infrastructure/authoring/framework-sources.js';
import type { Store } from '../../infrastructure/sqlite/store.js';

export type AuthoringTask = 'content.author' | 'content.review' | 'content.item_author' | 'content.item_review';
export interface ExecutorOutput { result: AdapterResult; provider: string; cli_version: string | null; model: string | null; detail?: string }
/** One AI call; the real implementation goes through the gateway (subscription guard, verified providers only). */
export type AuthoringExecutor = (task: AuthoringTask, payload: Record<string, unknown>) => Promise<ExecutorOutput>;

export type FrameworkState = 'DRAFT' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED';
export interface FrameworkRow {
  framework_id: string; version: string; content_hash: string; author_run_id: string; review_run_id: string | null; check_errors: number; check_warnings: number;
  state: FrameworkState; decision_note: string | null; created_at: string; decided_at: string | null;
}
export interface FrameworkDocument {
  schema_version: '1'; framework_id: string; version: string; task: string; policy_decision: string;
  author: { run_id: string; provider: string; cli_version: string | null; model: string | null; synthetic: boolean };
  /** E-46: the reviewed draft this version revises, if any. */
  revised_from: { version: string; review_run_id: string } | null;
  sources: { source_ref: string; url: string; title: string; role: string }[];
  competencies: FrameworkResult['competencies'];
  rubric: {
    official: { source_ref: string; criterion: string; band: number; locator: string; descriptor: string }[];
    observation_guide: FrameworkResult['observation_guide'];
    aggregation: { method: 'holistic_by_criterion'; notes: string[] };
  };
  limitations: string[];
  checks: FrameworkCheck;
}
export interface ReviewDocument { schema_version: '1'; framework_id: string; version: string; run_id: string; provider: string; model: string | null; result: FrameworkReviewResult }

export class AuthoringError extends Error {
  constructor(message: string, readonly code: string, readonly statusCode = 409) { super(message); }
}

/** One AI authoring call, recorded in authoring_runs (provider actually used, input/output hashes) whether it succeeds or not. */
export async function runAuthoringCall(store: Store, executor: AuthoringExecutor, task: AuthoringTask, payload: Record<string, unknown>, target: { id: string; version: string | null }) {
  const runId = randomUUID();
  const started = store.now().toISOString();
  let out: ExecutorOutput;
  try { out = await executor(task, payload); } catch (e) {
    out = { result: { ok: false, error: 'NETWORK' }, provider: 'none', cli_version: null, model: null, detail: e instanceof Error ? e.message.slice(0, 300) : String(e) };
  }
  const ok = out.result.ok;
  store.db.prepare(`INSERT INTO authoring_runs (run_id, task_type, target_id, target_version, provider, cli_version, model, input_hash, output_hash, ok, error, started_at, finished_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(runId, task, target.id, target.version, out.provider, out.cli_version, out.model, sha256(canonicalJson(payload)),
    ok ? sha256(canonicalJson(out.result.ok ? out.result.result : null)) : null, ok ? 1 : 0, ok ? null : `${out.result.ok ? '' : out.result.error}${out.detail ? `: ${out.detail}` : ''}`, started, store.now().toISOString());
  return { runId, out };
}

export class FrameworkAuthoringService {
  constructor(private store: Store, private policy: FrameworkPolicy, private loadSources: () => FrameworkSources) {}

  private sourcesOrThrow(): FrameworkSources {
    const s = this.loadSources();
    if (s.missing.length) throw new AuthoringError(`Thiếu nguồn đã duyệt: ${s.missing.join(', ')}. Duyệt các trang này ở tab Nguồn (hoặc quét lại) rồi chạy lại.`, 'SOURCES_MISSING');
    return s;
  }

  private call(executor: AuthoringExecutor, task: AuthoringTask, payload: Record<string, unknown>, target: { id: string; version: string | null }) {
    return runAuthoringCall(this.store, executor, task, payload, target);
  }

  /**
   * Author a new DRAFT version. With `reviseFrom`, the AI also gets that draft, its independent review and its
   * automatic check findings, and must return a complete revised framework (E-46). Throws when the call fails; the
   * failed run stays recorded.
   */
  async author(executor: AuthoringExecutor, reviseFrom?: string): Promise<{ version: string; run_id: string; checks: FrameworkCheck }> {
    const src = this.sourcesOrThrow();
    const fid = this.policy.framework_id;
    let revision: { version: string; review_run_id: string; context: Record<string, unknown> } | null = null;
    if (reviseFrom) {
      const prev = this.document(reviseFrom);
      const review = this.reviewDocument(reviseFrom);
      if (!review) throw new AuthoringError(`${reviseFrom} chưa có lượt AI rà soát; chạy \`npm.cmd run author -- review ${reviseFrom}\` trước khi soạn lại`, 'REVIEW_MISSING');
      revision = { version: reviseFrom, review_run_id: review.run_id, context: {
        previous_version: reviseFrom,
        previous_draft: { competencies: prev.competencies, observation_guide: prev.rubric.observation_guide, aggregation_notes: prev.rubric.aggregation.notes },
        review_findings: review.result.findings, check_findings: prev.checks.findings,
      } };
    }
    const payload = { task: this.policy.task, requirements: this.policy.requirements, sources: src.sources, ...(revision ? { revision: revision.context } : {}) };
    const { runId, out } = await this.call(executor, 'content.author', payload, { id: fid, version: null });
    if (!out.result.ok) throw new AuthoringError(`AI soạn khung thất bại (${out.result.error}${out.detail ? `: ${out.detail}` : ''}). Lần chạy ${runId} đã được ghi.`, `AI_${out.result.error}`, 502);
    const fw = out.result.result as FrameworkResult;
    const checks = checkFramework(fw, src.haystacks, this.policy.requirements);
    const count = (this.store.db.prepare('SELECT COUNT(*) AS n FROM competency_frameworks WHERE framework_id = ?').get(fid) as { n: number }).n;
    const version = `v${count + 1}`;
    const band = src.sources.find((s) => s.band_table);
    const doc: FrameworkDocument = {
      schema_version: '1', framework_id: fid, version, task: this.policy.task, policy_decision: this.policy.decision,
      author: { run_id: runId, provider: out.provider, cli_version: out.cli_version, model: out.model, synthetic: fw.synthetic || out.provider === 'fake' },
      revised_from: revision ? { version: revision.version, review_run_id: revision.review_run_id } : null,
      sources: src.sources.map((s) => ({ source_ref: s.source_ref, url: s.url, title: s.title, role: s.role })),
      competencies: fw.competencies,
      rubric: {
        official: (band?.band_table ?? []).map((c) => ({ source_ref: band!.source_ref, criterion: c.criterion, band: c.band, locator: c.locator, descriptor: c.text })),
        observation_guide: fw.observation_guide,
        aggregation: { method: 'holistic_by_criterion', notes: fw.aggregation_notes },
      },
      limitations: fw.limitations,
      checks,
    };
    const ref = this.store.json.put('knowledge', fid, version, doc);
    this.store.db.prepare(`INSERT INTO competency_frameworks (framework_id, version, content_hash, author_run_id, review_run_id, check_errors, check_warnings, state, decision_note, created_at, decided_at)
      VALUES (?, ?, ?, ?, NULL, ?, ?, 'DRAFT', NULL, ?, NULL)`).run(fid, version, ref.hash, runId, checks.errors, checks.warnings, this.store.now().toISOString());
    return { version, run_id: runId, checks };
  }

  /** Independent review of a DRAFT by a separate AI call that sees the same sources and the draft only. */
  async review(executor: AuthoringExecutor, version: string): Promise<{ run_id: string; verdict: 'pass' | 'revise'; errors: number; warnings: number }> {
    const row = this.row(version);
    if (row.state !== 'DRAFT') throw new AuthoringError(`Chỉ rà soát được bản nháp; ${version} đang ở trạng thái ${row.state}`, 'NOT_DRAFT');
    const src = this.sourcesOrThrow();
    const doc = this.document(version);
    const payload = { task: this.policy.task, requirements: this.policy.requirements, sources: src.sources,
      framework: { competencies: doc.competencies, observation_guide: doc.rubric.observation_guide, aggregation_notes: doc.rubric.aggregation.notes } };
    const { runId, out } = await this.call(executor, 'content.review', payload, { id: row.framework_id, version });
    if (!out.result.ok) throw new AuthoringError(`AI rà soát thất bại (${out.result.error}${out.detail ? `: ${out.detail}` : ''}). Lần chạy ${runId} đã được ghi.`, `AI_${out.result.error}`, 502);
    const result = out.result.result as FrameworkReviewResult;
    const rev: ReviewDocument = { schema_version: '1', framework_id: row.framework_id, version, run_id: runId, provider: out.provider, model: out.model, result };
    this.store.json.put('knowledge', `${row.framework_id}-review`, `${version}-${runId}`, rev);
    this.store.db.prepare("UPDATE competency_frameworks SET review_run_id = ? WHERE framework_id = ? AND version = ? AND state = 'DRAFT'").run(runId, row.framework_id, version);
    const errors = result.findings.filter((f) => f.severity === 'error').length;
    return { run_id: runId, verdict: result.verdict, errors, warnings: result.findings.length - errors };
  }

  list(): FrameworkRow[] {
    return this.store.db.prepare('SELECT * FROM competency_frameworks WHERE framework_id = ? ORDER BY created_at DESC, version DESC').all(this.policy.framework_id) as FrameworkRow[];
  }

  private row(version: string): FrameworkRow {
    const r = this.store.db.prepare('SELECT * FROM competency_frameworks WHERE framework_id = ? AND version = ?').get(this.policy.framework_id, version) as FrameworkRow | undefined;
    if (!r) throw new AuthoringError(`Không có khung ${this.policy.framework_id}@${version}`, 'NOT_FOUND', 404);
    return r;
  }
  document(version: string): FrameworkDocument {
    const r = this.row(version);
    return this.store.json.get('knowledge', r.framework_id, version, r.content_hash) as FrameworkDocument;
  }
  reviewDocument(version: string): ReviewDocument | null {
    const r = this.row(version);
    if (!r.review_run_id) return null;
    return this.store.json.get('knowledge', `${r.framework_id}-review`, `${version}-${r.review_run_id}`) as ReviewDocument;
  }
  runs(): { run_id: string; task_type: string; target_version: string | null; provider: string; model: string | null; ok: number; error: string | null; started_at: string; finished_at: string }[] {
    return this.store.db.prepare('SELECT run_id, task_type, target_version, provider, model, ok, error, started_at, finished_at FROM authoring_runs WHERE target_id = ? ORDER BY started_at DESC LIMIT 50')
      .all(this.policy.framework_id) as ReturnType<FrameworkAuthoringService['runs']>;
  }
  detail(version: string) { return { row: this.row(version), document: this.document(version), review: this.reviewDocument(version) }; }

  /**
   * The learner's decision. Approval needs: no deterministic check error, a real (non-fake, non-synthetic) author,
   * an attached review, and a note when the reviewer reported errors. Approving supersedes the previous approved one.
   */
  decide(version: string, decision: 'approve' | 'reject', note: string): FrameworkRow {
    return this.store.db.transaction(() => {
      const r = this.row(version);
      if (r.state !== 'DRAFT') throw new AuthoringError(`${version} đã được quyết định (${r.state})`, 'NOT_DRAFT');
      const at = this.store.now().toISOString();
      if (decision === 'approve') {
        const doc = this.document(version);
        if (r.check_errors > 0) throw new AuthoringError(`Không duyệt được: còn ${r.check_errors} lỗi kiểm tra tự động`, 'CHECK_ERRORS');
        if (doc.author.synthetic) throw new AuthoringError('Không duyệt được: bản nháp do FakeAdapter/dữ liệu synthetic tạo ra', 'SYNTHETIC');
        const review = this.reviewDocument(version);
        if (!review) throw new AuthoringError('Không duyệt được: chưa có lượt AI rà soát độc lập', 'REVIEW_MISSING');
        if (review.result.findings.some((f) => f.severity === 'error') && !note.trim()) throw new AuthoringError('AI rà soát báo lỗi; cần ghi chú lý do vẫn duyệt', 'NOTE_REQUIRED', 400);
        this.store.db.prepare("UPDATE competency_frameworks SET state = 'SUPERSEDED', decided_at = ? WHERE framework_id = ? AND state = 'APPROVED'").run(at, r.framework_id);
      }
      this.store.db.prepare('UPDATE competency_frameworks SET state = ?, decision_note = ?, decided_at = ? WHERE framework_id = ? AND version = ?')
        .run(decision === 'approve' ? 'APPROVED' : 'REJECTED', note.trim() || null, at, r.framework_id, version);
      return this.row(version);
    }).immediate();
  }

  approved(): FrameworkDocument | null {
    const r = this.store.db.prepare("SELECT version FROM competency_frameworks WHERE framework_id = ? AND state = 'APPROVED'").get(this.policy.framework_id) as { version: string } | undefined;
    return r ? this.document(r.version) : null;
  }
}
