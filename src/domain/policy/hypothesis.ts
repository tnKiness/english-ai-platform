// D-02 v1 section E (E-33): error-hypothesis status from evidence. Pure, no I/O.
// Matching a symptom is not enough to confirm a cause (02 §4.A): confirmation needs conditions that favour this
// hypothesis over competing ones, or a discriminating task. Self-repairs never confirm or reject (02 §4.C).
import type { CompetencyPolicyParams } from './params.js';

export type HypothesisStatus = 'initial' | 'insufficient_evidence' | 'confirmed' | 'rejected';

export interface HypothesisEvidence {
  attempt_id: string;
  outcome: 'met' | 'not_met';
  /** Independent evidence per G/A definitions; anything else is ignored. */
  independent: boolean;
  /** The task conditions favour this hypothesis over competing ones (e.g. enough time, so "ran out of time" is ruled out). */
  supports_specifically: boolean;
  /** Comparison evidence contradicts this hypothesis. */
  contradicts: boolean;
}

export interface HypothesisInput {
  evidence: readonly HypothesisEvidence[];
  discriminating_task: 'match' | 'mismatch' | 'inconclusive' | null;
}

export function hypothesisStatus(input: HypothesisInput, p: CompetencyPolicyParams): { status: HypothesisStatus; reason: string } {
  const ind = input.evidence.filter((e) => e.independent);
  const distinct = (list: readonly HypothesisEvidence[]) => new Set(list.map((e) => e.attempt_id)).size;
  const met = ind.filter((e) => e.outcome === 'met');
  const notMet = ind.filter((e) => e.outcome === 'not_met');
  const contradicted = ind.some((e) => e.contradicts) || input.discriminating_task === 'mismatch';
  if (distinct(met) >= p.hypothesis.reject_min_sources && notMet.length === 0) return { status: 'rejected', reason: `E2: ${distinct(met)} nguồn độc lập đạt ở điều kiện giả thuyết dự đoán sẽ sai` };
  const specific = notMet.filter((e) => e.supports_specifically);
  if (!contradicted && distinct(specific) >= p.hypothesis.confirm_min_sources) return { status: 'confirmed', reason: `E1: ${distinct(specific)} nguồn độc lập chưa đạt ở điều kiện ủng hộ riêng giả thuyết` };
  if (!contradicted && specific.length >= 1 && input.discriminating_task === 'match') return { status: 'confirmed', reason: 'E1: 1 nguồn + nhiệm vụ phân biệt nguyên nhân cho kết quả khớp' };
  if (input.discriminating_task === 'inconclusive' || (met.length > 0 && notMet.length > 0) || contradicted) return { status: 'insufficient_evidence', reason: 'E3: bằng chứng trái chiều hoặc nhiệm vụ phân biệt chưa kết luận' };
  if (notMet.length > 0 && specific.length < notMet.length) {
    return { status: 'initial', reason: 'E0: mới khớp biểu hiện; chưa có điều kiện ủng hộ riêng giả thuyết này nên chưa xác nhận' };
  }
  return { status: 'initial', reason: 'E0: giả định ban đầu' };
}

/** E4: "có thể là sơ suất" label — one occurrence fixed at once without hint levels 2–3; recurrence at the next fitting chance → unstable control. */
export function slipLabel(input: { occurrences: number; repaired_immediately_max_hint: number | null; recurred_at_next_opportunity: boolean }): 'possible_slip' | 'unstable_control' | null {
  if (input.recurred_at_next_opportunity) return 'unstable_control';
  if (input.occurrences === 1 && input.repaired_immediately_max_hint !== null && input.repaired_immediately_max_hint < 2) return 'possible_slip';
  return null;
}
