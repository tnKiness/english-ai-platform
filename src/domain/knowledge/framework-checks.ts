// E-42 (D-05 C2): deterministic checks the application runs on an AI-authored competency framework draft. The AI
// proposes; these checks (and the learner) decide. A draft with any error cannot be approved.
/** E-42 (D-05 C2) knowledge.v1 competency_framework_result: a DRAFT the application checks; the learner approves. */
export interface FrameworkCompetency {
  competency_id: string; criterion: 'task_response' | 'coherence_cohesion' | 'lexical_resource' | 'grammatical_range_accuracy' | 'fluency_coherence'
    | 'main_ideas' | 'detail' | 'opinion_attitude' | 'purpose' | 'development';
  title_vi: string; assessor_criterion: string; target_claim: string; evidence_required: string[]; evidence_conditions: string[];
  confounders: string[]; inference_limits: string[];
  edges: { type: 'component_of' | 'supports' | 'prerequisite' | 'transferable_to' | 'confusable_with'; target: string; basis: string | null }[];
  source_quotes: { source_ref: string; quote: string }[];
}
export interface FrameworkResult {
  schema_version: '1'; job_id: string; context_manifest_id: string; synthetic: boolean;
  competencies: FrameworkCompetency[];
  observation_guide: { competency_id: string; signal: string; counter_evidence: string[]; valid_exceptions: string[]; inconclusive_when: string[] }[];
  aggregation_notes: string[]; limitations: string[];
}
/** E-42 knowledge.v1 framework_review_result: an independent check of a draft against the same sources. */
export interface FrameworkReviewResult {
  schema_version: '1'; job_id: string; context_manifest_id: string; synthetic: boolean; verdict: 'pass' | 'revise';
  findings: { target: string; severity: 'error' | 'warning'; issue: string; suggestion: string }[]; limitations: string[];
}

export interface FrameworkSourceText { source_ref: string; texts: string[] }
/**
 * E-52: `criteria` (the official criteria this framework covers) and `id_prefix` (competency id namespace) default to
 * Writing Task 2 (`wt2`, its four criteria); the Speaking text framework sets its own (`spk`, no Pronunciation).
 */
export interface FrameworkRequirements { min_per_criterion: number; max_per_criterion: number; recommended_min: number; recommended_max: number; criteria?: string[]; id_prefix?: string }
export const WT2_CRITERIA = ['task_response', 'coherence_cohesion', 'lexical_resource', 'grammatical_range_accuracy'];
export interface FrameworkFinding { code: string; severity: 'error' | 'warning'; target: string; detail: string }
export interface FrameworkCheck { errors: number; warnings: number; findings: FrameworkFinding[] }

export const CRITERION_PREFIX: Record<string, string> = {
  task_response: 'tr', coherence_cohesion: 'cc', lexical_resource: 'lr', grammatical_range_accuracy: 'gra', fluency_coherence: 'fc',
  // E-54 Listening: the abilities the official format says the test assesses (no band descriptor table).
  main_ideas: 'mi', detail: 'dt', opinion_attitude: 'oa', purpose: 'pu', development: 'dv',
};

/** Comparison form for quotes: case, quote marks, dashes, hyphen spacing and whitespace do not matter. */
export function normalizeForQuote(s: string): string {
  return s.normalize('NFKC').toLowerCase()
    .replace(/[‘’‛′]/g, "'").replace(/[“”″]/g, '"').replace(/[‐-―−]/g, '-')
    .replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ').trim();
}
const stripEdges = (s: string) => s.replace(/^[\s"'.,;:…]+|[\s"'.,;:…]+$/g, '');

export function checkFramework(fw: FrameworkResult, sources: readonly FrameworkSourceText[], req: FrameworkRequirements): FrameworkCheck {
  const findings: FrameworkFinding[] = [];
  const add = (code: string, severity: 'error' | 'warning', target: string, detail: string) => findings.push({ code, severity, target, detail });
  const hay = new Map(sources.map((s) => [s.source_ref, s.texts.map(normalizeForQuote)]));
  const ids = new Set<string>();
  const criteria = req.criteria ?? WT2_CRITERIA;

  for (const c of fw.competencies) {
    if (ids.has(c.competency_id)) add('FW_DUPLICATE_ID', 'error', c.competency_id, 'competency_id lặp lại');
    ids.add(c.competency_id);
    const [ns, prefix] = c.competency_id.split('.');
    if (CRITERION_PREFIX[c.criterion] !== prefix) add('FW_CRITERION_PREFIX', 'error', c.competency_id, `Mã "${prefix}" không khớp tiêu chí ${c.criterion}`);
    if (ns !== (req.id_prefix ?? 'wt2')) add('FW_ID_NAMESPACE', 'error', c.competency_id, `Mã phải bắt đầu bằng "${req.id_prefix ?? 'wt2'}."`);
    if (!criteria.includes(c.criterion)) add('FW_CRITERION_OUT_OF_SCOPE', 'error', c.competency_id, `Tiêu chí ${c.criterion} không thuộc khung này (${criteria.join(', ')})`);
    for (const field of ['assessor_criterion', 'target_claim'] as const) {
      if (/\bband\s*\d/i.test(c[field])) add('FW_BAND_MAPPING', 'error', c.competency_id, `${field} nhắc tới mức Band; khung năng lực không được tự đặt ngưỡng Band`);
    }
    for (const q of c.source_quotes) {
      const texts = hay.get(q.source_ref);
      if (!texts) { add('FW_UNKNOWN_SOURCE', 'error', c.competency_id, `Nguồn ${q.source_ref} không có trong dữ liệu đã cấp`); continue; }
      const needle = stripEdges(normalizeForQuote(q.quote));
      if (needle.length < 3 || !texts.some((t) => t.includes(needle))) add('FW_QUOTE_NOT_FOUND', 'error', c.competency_id, `Trích dẫn không có nguyên văn trong ${q.source_ref}: "${q.quote.slice(0, 160)}"`);
    }
  }
  for (const c of fw.competencies) {
    for (const e of c.edges) {
      if (e.target === c.competency_id) add('FW_EDGE_SELF', 'error', c.competency_id, `Cạnh ${e.type} trỏ về chính nó`);
      else if (!ids.has(e.target)) add('FW_EDGE_UNKNOWN_TARGET', 'error', c.competency_id, `Cạnh ${e.type} trỏ tới ${e.target} không có trong khung`);
      if (e.type === 'prerequisite' && !(e.basis ?? '').trim()) add('FW_PREREQUISITE_NO_BASIS', 'error', c.competency_id, 'Cạnh tiên quyết cần căn cứ từ nguồn');
    }
  }
  for (const criterion of criteria) {
    const n = fw.competencies.filter((c) => c.criterion === criterion).length;
    if (n < req.min_per_criterion || n > req.max_per_criterion) add('FW_COVERAGE', 'error', criterion, `${n} năng lực; giới hạn ${req.min_per_criterion}–${req.max_per_criterion}`);
    else if (n < req.recommended_min || n > req.recommended_max) add('FW_COVERAGE', 'warning', criterion, `${n} năng lực; khuyến nghị ${req.recommended_min}–${req.recommended_max}`);
  }
  const guided = new Set<string>();
  for (const g of fw.observation_guide) {
    if (!ids.has(g.competency_id)) add('FW_GUIDE_UNKNOWN', 'error', g.competency_id, 'Hướng dẫn quan sát cho năng lực không có trong khung');
    guided.add(g.competency_id);
  }
  for (const id of ids) if (!guided.has(id)) add('FW_GUIDE_MISSING', 'warning', id, 'Chưa có hướng dẫn quan sát');
  return { errors: findings.filter((f) => f.severity === 'error').length, warnings: findings.filter((f) => f.severity === 'warning').length, findings };
}
