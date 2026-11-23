// E-55 (D-05 C6, N9; user decision "Nhập mẫu, đo định tính"): run the Writing Task 2 assessor on the official scored
// samples and write a side-by-side report (examiner band + comment | per-competency outcomes + priority issues of the
// assessor). Nothing is compared numerically: there is no band threshold, no band estimate and band reporting stays
// off. Task 1 samples are kept in the set but not assessed (no Task 1 framework yet). The sample texts are public
// official material, sent as knowledge_content; no learner data is involved.
import { canonicalJson, sha256 } from '../../infrastructure/files/paths.js';
import type { Store } from '../../infrastructure/sqlite/store.js';
import type { ScoredSample } from '../../domain/knowledge/calibration.js';
import { isWritingAssessment, type AdapterResult, type WritingAssessment } from '../ai/provider-adapter.js';
import { DATA_POLICY } from '../context/scoped-reader.js';
import { assessorContext } from '../learning/writing-assessment.js';
import { AuthoringError, type FrameworkDocument } from './framework-authoring.js';

export type AssessExecutor = (payload: Record<string, unknown>) => Promise<{ result: AdapterResult; provider: string; cli_version: string | null; model: string | null; detail?: string }>;
export interface CalibrationRow {
  sample_id: string; module: string; task: number; band: number; examiner_comment: string; words: number;
  assessed: boolean; provider: string | null; model: string | null; error: string | null; input_hash: string | null; output_hash: string | null;
  by_criterion: { criterion: string; met: number; not_met: number; inconclusive: number }[];
  not_met: { competency_id: string; rationale: string }[]; priority_issues: { competency_id: string; symptom: string }[];
}
export interface CalibrationReport {
  schema_version: '1'; run_id: string; created_at: string; framework: { framework_id: string; version: string };
  samples: number; assessed: number; band_reporting_enabled: false; n9_target_task2: number; limitations: string[]; rows: CalibrationRow[];
}

export const PROMPT_UNAVAILABLE = 'The task prompt is not included in the source of this sample. Judge task-related competencies only where the response itself makes its position and development evident; otherwise answer inconclusive with opportunity "unknown".';

export class CalibrationService {
  constructor(private store: Store, private loadSamples: () => { samples: ScoredSample[]; missing: string[] }, private framework: () => FrameworkDocument | null) {}

  samples() { return this.loadSamples(); }

  /** One assessor call per Task 2 sample, sequentially; a failed call is recorded in its row and the run continues. */
  async run(executor: AssessExecutor): Promise<CalibrationReport> {
    const fw = this.framework();
    if (!fw || fw.author.synthetic) throw new AuthoringError('Cần khung Writing Task 2 đã duyệt để chấm thử bài mẫu', 'FRAMEWORK_NOT_APPROVED');
    const { samples, missing } = this.loadSamples();
    if (missing.length) throw new AuthoringError(`Thiếu nguồn bài mẫu đã duyệt: ${missing.join(', ')}`, 'SOURCES_MISSING');
    const comps = fw.competencies.map((c) => ({ competency_id: c.competency_id, title: c.title_vi, criterion: c.assessor_criterion }));
    const criterionOf = new Map(fw.competencies.map((c) => [c.competency_id, c.criterion]));
    const rows: CalibrationRow[] = [];
    for (const s of samples) {
      const base = { sample_id: s.sample_id, module: s.module, task: s.task, band: s.band, examiner_comment: s.examiner_comment, words: s.response.split(/\s+/).filter(Boolean).length };
      if (s.task !== 2) { rows.push({ ...base, assessed: false, provider: null, model: null, error: 'TASK1_NO_FRAMEWORK', input_hash: null, output_hash: null, by_criterion: [], not_met: [], priority_issues: [] }); continue; }
      const payload = { data_policy: DATA_POLICY, submission_text: s.response,
        ...assessorContext({ task: { title: `${s.module === 'academic' ? 'Academic' : 'General Training'} Writing Task 2 (official sample)`, prompt: PROMPT_UNAVAILABLE, genre: 'unknown', min_words: 250, skill: 'writing' },
          competencies: comps, mode: 'exam', purpose: 'practice', is_repair: false }) };
      let out: Awaited<ReturnType<AssessExecutor>>;
      try { out = await executor(payload); } catch (e) { out = { result: { ok: false, error: 'NETWORK' }, provider: 'none', cli_version: null, model: null, detail: e instanceof Error ? e.message.slice(0, 200) : String(e) }; }
      const inputHash = sha256(canonicalJson(payload));
      if (!out.result.ok || !isWritingAssessment(out.result.result)) {
        rows.push({ ...base, assessed: false, provider: out.provider, model: out.model, error: out.result.ok ? 'NOT_A_WRITING_ASSESSMENT' : `${out.result.error}${out.detail ? `: ${out.detail}` : ''}`, input_hash: inputHash, output_hash: null, by_criterion: [], not_met: [], priority_issues: [] });
        continue;
      }
      const a: WritingAssessment = out.result.result;
      const asked = new Set(comps.map((c) => c.competency_id));
      const outcomes = a.competencies.filter((c) => asked.has(c.competency_id));
      const criteria = [...new Set(fw.competencies.map((c) => c.criterion))];
      rows.push({ ...base, assessed: true, provider: out.provider, model: out.model, error: null, input_hash: inputHash, output_hash: sha256(canonicalJson(a)),
        by_criterion: criteria.map((criterion) => {
          const of = outcomes.filter((o) => criterionOf.get(o.competency_id) === criterion);
          return { criterion, met: of.filter((o) => o.outcome === 'met').length, not_met: of.filter((o) => o.outcome === 'not_met').length, inconclusive: of.filter((o) => o.outcome === 'inconclusive').length };
        }),
        not_met: outcomes.filter((o) => o.outcome === 'not_met').map((o) => ({ competency_id: o.competency_id, rationale: o.rationale })),
        priority_issues: a.diagnosis.priority_issues.map((p) => ({ competency_id: p.competency_id, symptom: p.symptom })) });
    }
    const report: CalibrationReport = {
      schema_version: '1', run_id: sha256(`${this.store.now().toISOString()}:${Math.random()}`).slice(0, 16), created_at: this.store.now().toISOString(),
      framework: { framework_id: fw.framework_id, version: fw.version }, samples: samples.length, assessed: rows.filter((r) => r.assessed).length,
      band_reporting_enabled: false, n9_target_task2: 20,
      limitations: [
        `Chỉ ${samples.filter((s) => s.task === 2).length} bài Task 2 có điểm và nhận xét giám khảo trong nguồn chính thức đã duyệt; N9 cần 20–30 trước khi có bất kỳ nhận định Band nào.`,
        'Đề bài không có trong nguồn bài mẫu: nhận định về Task Response kém tin cậy.',
        'So sánh định tính (đặt cạnh nhau); không có ngưỡng ánh xạ Band ↔ kết quả năng lực, không tính độ lệch số.',
        'Bài Task 1 được lưu nhưng chưa chấm (chưa có khung Task 1).',
      ],
      rows,
    };
    this.store.json.put('knowledge', 'calibration-run', report.run_id, report);
    return report;
  }
}

/** The report as Markdown for the learner to read next to the examiner comments. */
export function calibrationMarkdown(r: CalibrationReport): string {
  const lines = [`# Đối chiếu định tính bài mẫu chính thức (C6) — ${r.created_at}`, '', `Khung: ${r.framework.framework_id}@${r.framework.version} · ${r.assessed}/${r.samples} bài được chấm thử · Báo Band: TẮT`, '', '## Giới hạn', ...r.limitations.map((l) => `- ${l}`), ''];
  for (const row of r.rows) {
    lines.push(`## ${row.sample_id} — ${row.module === 'academic' ? 'Academic' : 'General Training'} Task ${row.task} — giám khảo: Band ${row.band} (${row.words} từ)`, '', '**Nhận xét giám khảo:**', '', row.examiner_comment, '');
    if (!row.assessed) { lines.push(`_Không chấm thử: ${row.error}_`, ''); continue; }
    lines.push(`**AI chấm theo khung** (${row.provider}${row.model ? `, ${row.model}` : ''}):`, '', '| Tiêu chí | Đạt | Chưa đạt | Chưa đủ kết luận |', '|---|---|---|---|',
      ...row.by_criterion.map((c) => `| ${c.criterion} | ${c.met} | ${c.not_met} | ${c.inconclusive} |`), '');
    if (row.not_met.length) lines.push('**Năng lực AI đánh giá chưa đạt:**', ...row.not_met.map((n) => `- \`${n.competency_id}\`: ${n.rationale}`), '');
    if (row.priority_issues.length) lines.push('**Lỗi trọng tâm AI nêu:**', ...row.priority_issues.map((p) => `- \`${p.competency_id}\`: ${p.symptom}`), '');
  }
  return `${lines.join('\n')}\n`;
}
