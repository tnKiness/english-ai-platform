// D-02 v1 sections G, A, B (E-33): competency level per condition, overall level and confidence. Pure, no I/O.
// The caller builds one EvidenceRecord per observation; this module never sees submission content or answers.
import type { EvidenceUse } from '../evidence/attribution.js';
import type { CompetencyState } from '../evidence/inference.js';
import type { Mode, Outcome, Purpose, Scope } from '../evidence/types.js';
import { DAY_MS, type CompetencyPolicyParams, type PolicyRef } from './params.js';

export type Modality = 'writing' | 'speaking' | 'reading' | 'listening';
export type TaskBreadth = 'short' | 'composite' | 'unknown';
export type ConstraintKind = 'semantic' | 'explicit_form' | 'unknown';

/** Điều kiện làm bài (D-02 thuật ngữ): phương thức × chế độ × giảm tải × loại ràng buộc. Vai trò 7A/7B/9 is NOT part of it. */
export interface Condition { modality: Modality; mode: Exclude<Mode, 'guided'>; reduced_load: boolean; constraint: ConstraintKind }
export const conditionKey = (c: Condition) => `${c.modality}|${c.mode}|${c.reduced_load ? 'reduced' : 'full'}|${c.constraint}`;

export interface EvidenceRecord {
  evidence_source_id: string;
  attempt_id: string;
  item_id: string;
  item_family_id: string;
  /** Submission time (ISO) and its study day. */
  at: string;
  study_day: string;
  outcome: Outcome;
  use: EvidenceUse;
  scope: Scope;
  synthetic: boolean;
  kind: 'original' | 'repair';
  purpose: Purpose;
  mode: Mode;
  breadth: TaskBreadth;
  /** null for guided work (never independent) — the condition is only defined for self-practice / exam. */
  condition: Condition | null;
  /** Highest hint level shown in the attempt before this submission (3 = direct explanation / worked rewrite). */
  hint_level_before: number;
  /** Purpose 9, or a composite task done while a Bước 9 check was due (C2 integrated maintenance check). */
  counts_for_step9: boolean;
}

export type LevelCode = 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6';
export const LEVEL_STATE: Record<LevelCode, CompetencyState> = {
  A1: 'insufficient_data', A2: 'needs_support', A3: 'repairs_with_hints', A4: 'initial_short_task', A5: 'integrated', A6: 'stable',
};
export const LEVEL_LABEL: Record<LevelCode, string> = {
  A1: 'Chưa đủ dữ liệu', A2: 'Cần hỗ trợ', A3: 'Tự sửa được khi có gợi ý', A4: 'Đã vận dụng bước đầu trong nhiệm vụ ngắn',
  A5: 'Vận dụng được trong bài tổng hợp', A6: 'Duy trì ổn định',
};
const ORDER: LevelCode[] = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'];
const rank = (l: LevelCode) => ORDER.indexOf(l);
const maxLevel = (a: LevelCode, b: LevelCode) => (rank(a) >= rank(b) ? a : b);

export type ConfidenceCode = 'B0' | 'B1' | 'B2' | 'B3';
export const CONFIDENCE_LABEL: Record<ConfidenceCode, string> = { B0: 'Chưa xác lập', B1: 'Thấp', B2: 'Trung bình', B3: 'Cao' };

export interface Demotion { condition: string; from: LevelCode; to: LevelCode; at: string; evidence_source_ids: string[] }
export interface ConditionLevel {
  condition: Condition;
  key: string;
  level: LevelCode;
  independent_met: number;
  independent_not_met: number;
  last_outcome: 'met' | 'not_met';
  /** A7: one independent not_met keeps the level but asks for a recheck. */
  needs_recheck: boolean;
}

export interface CompetencyDecision {
  competency_id: string;
  level: LevelCode;
  state: CompetencyState;
  label: string;
  confidence: ConfidenceCode;
  confidence_label: string;
  by_condition: ConditionLevel[];
  demotions: Demotion[];
  needs_recheck: boolean;
  /** How many records were left out by G0 (synthetic or not learner scope). */
  excluded_by_g0: number;
  rationale: string[];
  policy: PolicyRef;
}

/** Independent evidence for D-02: full independence, or reduced load recorded under the reduced-load condition (A8). */
export const isIndependent = (r: EvidenceRecord) =>
  r.condition !== null && r.kind === 'original' && (r.outcome === 'met' || r.outcome === 'not_met')
  && (r.use === 'independent_candidate' || (r.use === 'reduced_load' && r.condition.reduced_load));

/** G0 + G1: learner, non-synthetic evidence only, one record per evidence source (the latest effective one). */
export function effectiveSources(records: readonly EvidenceRecord[]): { sources: EvidenceRecord[]; excluded: number } {
  const kept = records.filter((r) => r.scope === 'learner' && !r.synthetic);
  const bySource = new Map<string, EvidenceRecord>();
  for (const r of [...kept].sort((a, b) => a.at.localeCompare(b.at))) bySource.set(r.evidence_source_id, r);
  return { sources: [...bySource.values()].sort((a, b) => a.at.localeCompare(b.at) || a.evidence_source_id.localeCompare(b.evidence_source_id)), excluded: records.length - kept.length };
}

/** A1–A3: what the record shows before any independent evidence (not tied to a condition). */
function baseLevel(sources: readonly EvidenceRecord[], p: CompetencyPolicyParams, why: string[]): LevelCode {
  const decisive = sources.filter((s) => s.outcome === 'met' || s.outcome === 'not_met');
  if (decisive.length === 0) { why.push('A1: chưa có nhận định met/not_met hiệu lực'); return 'A1'; }
  const repairMet = decisive.some((s) => s.kind === 'repair' && s.outcome === 'met' && s.hint_level_before <= p.competency.repair_max_hint_level);
  const repairAfterSolution = decisive.some((s) => s.kind === 'repair' && s.outcome === 'met' && s.hint_level_before > p.competency.repair_max_hint_level);
  const notMet = decisive.some((s) => s.outcome === 'not_met');
  if (repairMet) { why.push(`A3: có bản tự sửa đạt khi chỉ mở tới nấc ${p.competency.repair_max_hint_level}`); return 'A3'; }
  if (notMet) {
    why.push(repairAfterSolution ? 'A2: bản sửa chỉ đạt sau khi đã mở nấc 3 (đã xem lời giải), không tính là tự sửa' : 'A2: có nhận định chưa đạt, chưa có bản tự sửa đạt');
    return 'A2';
  }
  // Only assisted / unverified / exposed evidence: G2 does not count it, so it is treated like no data.
  why.push('A1: chỉ có bằng chứng có hỗ trợ hoặc chưa xác minh (G2 không tính)');
  return 'A1';
}

/** A4–A7 inside one condition, walking its independent sources in time order. */
function levelInCondition(base: LevelCode, items: readonly EvidenceRecord[], p: CompetencyPolicyParams, key: string, why: string[], demotions: Demotion[]) {
  let level = base;
  let streak: EvidenceRecord[] = [];
  let step9Met: string[] = [];
  for (const r of items) {
    if (r.outcome === 'met') {
      streak = [];
      if (r.breadth === 'short') level = maxLevel(level, 'A4');
      else if (r.breadth === 'composite') level = maxLevel(level, 'A5');
      else why.push(`${key}: nguồn ${r.evidence_source_id} chưa có metadata độ rộng nhiệm vụ, chưa dùng để nâng mức`);
      if (r.counts_for_step9 && r.breadth !== 'unknown') {
        step9Met.push(r.at);
        const first = Date.parse(step9Met[0]!);
        const enough = step9Met.length >= p.competency.stable_min_step9_sources && Date.parse(r.at) - first >= p.competency.stable_min_gap_days * DAY_MS;
        if (enough) level = 'A6';
      }
      continue;
    }
    // not_met: count consecutive failures on different tasks (A7).
    if (!streak.some((s) => s.attempt_id === r.attempt_id || s.item_id === r.item_id)) streak.push(r);
    if (streak.length >= p.competency.demote_after_consecutive_not_met) {
      const to = ORDER[Math.max(rank('A2'), rank(level) - 1)]!;
      if (to !== level) {
        demotions.push({ condition: key, from: level, to, at: r.at, evidence_source_ids: streak.map((s) => s.evidence_source_id) });
        why.push(`${key}: A7 hạ ${level} → ${to} sau ${streak.length} lần chưa đạt độc lập liên tiếp ở các bài khác nhau`);
        level = to;
      }
      streak = [];
      step9Met = [];
    }
  }
  return { level, needs_recheck: streak.length > 0 };
}

/** B: confidence from the diversity of independent sources supporting the current level. */
function confidenceOf(level: LevelCode, independent: readonly EvidenceRecord[], p: CompetencyPolicyParams, why: string[]): ConfidenceCode {
  if (rank(level) <= rank('A3')) return 'B0';
  const met = independent.filter((s) => s.outcome === 'met');
  if (met.length === 0) return 'B0';
  const distinct = (f: (s: EvidenceRecord) => string, list: readonly EvidenceRecord[]) => new Set(list.map(f)).size;
  const c = p.confidence;
  const recent = independent.slice(-c.high_recent_all_met);
  let code: ConfidenceCode = 'B1';
  if (met.length >= c.medium_min_sources && distinct((s) => s.study_day, met) >= c.medium_min_study_days && distinct((s) => s.item_family_id, met) >= c.medium_min_item_families) code = 'B2';
  if (met.length >= c.high_min_sources && distinct((s) => s.item_family_id, met) >= c.high_min_item_families
    && distinct((s) => conditionKey(s.condition!), met) >= c.high_min_conditions
    && recent.length >= c.high_recent_all_met && recent.every((s) => s.outcome === 'met')) code = 'B3';
  // B4: each independent not_met after the latest met lowers confidence one step (never below B1; level changes follow A7).
  const lastMet = independent.map((s) => s.outcome).lastIndexOf('met');
  const after = independent.slice(lastMet + 1).filter((s) => s.outcome === 'not_met').length;
  if (after > 0) {
    const lowered = (['B1', 'B2', 'B3'] as const)[Math.max(0, ['B1', 'B2', 'B3'].indexOf(code) - after)]!;
    why.push(`B4: ${after} nguồn chưa đạt độc lập sau nguồn đạt gần nhất, tin cậy ${code} → ${lowered}`);
    code = lowered;
  }
  return code;
}

export function decideCompetency(competencyId: string, records: readonly EvidenceRecord[], policy: { params: CompetencyPolicyParams; ref: PolicyRef }): CompetencyDecision {
  const p = policy.params;
  const why: string[] = [];
  const { sources, excluded } = effectiveSources(records);
  if (excluded > 0) why.push(`G0: bỏ ${excluded} nhận định synthetic hoặc không thuộc người học`);
  const base = baseLevel(sources, p, why);
  const independent = sources.filter(isIndependent);
  const groups = new Map<string, EvidenceRecord[]>();
  for (const s of independent) groups.set(conditionKey(s.condition!), [...(groups.get(conditionKey(s.condition!)) ?? []), s]);
  const demotions: Demotion[] = [];
  const byCondition: ConditionLevel[] = [...groups.entries()].map(([key, items]) => {
    const { level, needs_recheck } = levelInCondition(base, items, p, key, why, demotions);
    return { condition: items[0]!.condition!, key, level, independent_met: items.filter((s) => s.outcome === 'met').length,
      independent_not_met: items.filter((s) => s.outcome === 'not_met').length, last_outcome: items.at(-1)!.outcome as 'met' | 'not_met', needs_recheck };
  });
  // A8: overall = highest level proven in some condition; each condition keeps its own level.
  const level = byCondition.reduce<LevelCode>((acc, c) => maxLevel(acc, c.level), base);
  const supporting = independent.filter((s) => byCondition.find((c) => c.key === conditionKey(s.condition!))?.level === level || rank(level) <= rank('A3'));
  const confidence = confidenceOf(level, supporting.length ? supporting : independent, p, why);
  return {
    competency_id: competencyId, level, state: LEVEL_STATE[level], label: LEVEL_LABEL[level], confidence, confidence_label: CONFIDENCE_LABEL[confidence],
    by_condition: byCondition, demotions, needs_recheck: byCondition.some((c) => c.needs_recheck), excluded_by_g0: excluded, rationale: why, policy: policy.ref,
  };
}
