// D-02 v1 (E-33): one case per policy line — met / not met / not conclusive — on the approved policy file.
import { describe, expect, it } from 'vitest';
import { decideCompetency, type EvidenceRecord } from '../../src/domain/policy/competency.js';
import { hypothesisStatus, slipLabel, type HypothesisEvidence } from '../../src/domain/policy/hypothesis.js';
import { focusLimit, goalRelevance, rankTasks, scoreTask, type PriorityInput } from '../../src/domain/policy/priority.js';
import { needsCatchUp, placeTasks, underfunded } from '../../src/domain/policy/replan.js';
import { afterVerification, needsDirectCheck, verificationStatus } from '../../src/domain/policy/verification.js';
import { loadCompetencyPolicy, parsePolicy } from '../../src/infrastructure/policy/competency-policy.js';

const policy = loadCompetencyPolicy()!;
const p = policy.params;
const DAY = 86_400_000;
const T0 = Date.parse('2026-12-01T03:00:00.000Z');
const at = (d: number) => new Date(T0 + d * DAY).toISOString();

let n = 0;
const rec = (o: Partial<EvidenceRecord> & { day?: number }): EvidenceRecord => {
  n += 1;
  const when = at(o.day ?? n);
  return {
    evidence_source_id: `src-${n}`, attempt_id: `att-${n}`, item_id: `item-${n}`, item_family_id: `fam-${n}`, at: when, study_day: when.slice(0, 10),
    outcome: 'met', use: 'independent_candidate', scope: 'learner', synthetic: false, kind: 'original', purpose: '7A', mode: 'self_practice', breadth: 'short',
    condition: { modality: 'writing', mode: 'self_practice', reduced_load: false, constraint: 'semantic' }, hint_level_before: 0, counts_for_step9: false,
    ...o,
  };
};
const decide = (rs: EvidenceRecord[]) => decideCompetency('c1', rs, policy);
const guided = { use: 'assisted' as const, mode: 'guided' as const, purpose: 'lesson' as const, condition: null, breadth: 'unknown' as const };

describe('policy file', () => {
  it('loads the approved v1 file with a stable hash and rejects invalid or unapproved copies', () => {
    expect(policy.ref).toMatchObject({ id: 'competency-policy', version: 'v1' });
    expect(policy.ref.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(parsePolicy(JSON.parse(JSON.stringify(p))).ref.hash).toBe(policy.ref.hash);
    expect(() => parsePolicy({ ...p, approved: false })).toThrow(/invalid/);
    expect(() => parsePolicy({ ...p, schedule: { ...p.schedule, step9_intervals_days: [7, 3] } })).toThrow(/increase/);
    expect(() => parsePolicy({ ...p, extra: 1 })).toThrow(/invalid/);
    expect(loadCompetencyPolicy('does/not/exist.json')).toBeNull();
  });
});

describe('G0–G2', () => {
  it('G0: synthetic or dry-run evidence never reaches the conclusion', () => {
    const d = decide([rec({ synthetic: true }), rec({ scope: 'dry_run' })]);
    expect(d.level).toBe('A1');
    expect(d.excluded_by_g0).toBe(2);
  });
  it('G1: re-evaluations of one source count once', () => {
    const a = rec({ outcome: 'not_met', day: 1 });
    const d = decide([a, { ...a, outcome: 'met', at: at(1.5) }]);
    expect(d.by_condition[0]).toMatchObject({ independent_met: 1, independent_not_met: 0 });
  });
  it('G2: assisted / unverified evidence alone is treated as no data', () => {
    expect(decide([rec({ ...guided })]).level).toBe('A1');
  });
});

describe('A — levels', () => {
  it('A1: inconclusive only → not enough data', () => {
    expect(decide([rec({ outcome: 'inconclusive' })]).level).toBe('A1');
  });
  it('A2: not met without a valid repair', () => {
    expect(decide([rec({ ...guided, outcome: 'not_met' })]).level).toBe('A2');
  });
  it('A3: repair met with at most hint level 2; a repair after level 3 stays A2', () => {
    const orig = rec({ ...guided, outcome: 'not_met', day: 1 });
    expect(decide([orig, rec({ ...guided, kind: 'repair', use: 'scaffolded_repair', evidence_source_id: orig.evidence_source_id, attempt_id: orig.attempt_id, hint_level_before: 2, day: 2 })]).level).toBe('A3');
    const orig2 = rec({ ...guided, outcome: 'not_met', day: 1 });
    const after3 = decide([orig2, rec({ ...guided, kind: 'repair', use: 'scaffolded_repair', evidence_source_id: `${orig2.evidence_source_id}-r`, attempt_id: orig2.attempt_id, hint_level_before: 3, day: 2 })]);
    expect(after3.level).toBe('A2');
    expect(after3.rationale.join(' ')).toMatch(/nấc 3/);
  });
  it('A4: independent met on a short task; A5 straight away on a composite practice task (no 7A needed)', () => {
    expect(decide([rec({ breadth: 'short' })]).level).toBe('A4');
    expect(decide([rec({ purpose: 'practice', breadth: 'composite' })]).level).toBe('A5');
  });
  it('A4/A5: unknown task breadth does not raise the level', () => {
    const d = decide([rec({ purpose: 'practice', breadth: 'unknown' })]);
    expect(d.level).toBe('A1');
    expect(d.rationale.join(' ')).toMatch(/độ rộng/);
  });
  it('A6: two Bước 9 passes ≥ 7 days apart; closer passes stay A5', () => {
    const s9 = { purpose: '9' as const, breadth: 'composite' as const, counts_for_step9: true, mode: 'exam' as const, condition: { modality: 'writing' as const, mode: 'exam' as const, reduced_load: false, constraint: 'semantic' as const } };
    expect(decide([rec({ ...s9, day: 1 }), rec({ ...s9, day: 9 })]).level).toBe('A6');
    expect(decide([rec({ ...s9, day: 1 }), rec({ ...s9, day: 4 })]).level).toBe('A5');
  });
  it('A7: one independent not met keeps the level and asks for a recheck; two on different tasks lower one level', () => {
    const met = rec({ purpose: '7B', breadth: 'composite', day: 1 });
    const one = decide([met, rec({ outcome: 'not_met', breadth: 'composite', day: 2 })]);
    expect(one.level).toBe('A5');
    expect(one.needs_recheck).toBe(true);
    const two = decide([met, rec({ outcome: 'not_met', breadth: 'composite', day: 2 }), rec({ outcome: 'not_met', breadth: 'composite', day: 3 })]);
    expect(two.level).toBe('A4');
    expect(two.demotions).toHaveLength(1);
    expect(two.demotions[0]!.evidence_source_ids).toHaveLength(2);
    // Same task twice is not "two different tasks".
    const a = rec({ outcome: 'not_met', breadth: 'composite', day: 2 });
    expect(decide([met, a, { ...a, evidence_source_id: 'again', at: at(3) }]).level).toBe('A5');
  });
  it('A8: a level is per condition; failing in exam does not lower self-practice', () => {
    const exam = { mode: 'exam' as const, condition: { modality: 'writing' as const, mode: 'exam' as const, reduced_load: false, constraint: 'semantic' as const } };
    const d = decide([rec({ purpose: '7B', breadth: 'composite', day: 1 }), rec({ ...exam, outcome: 'not_met', breadth: 'composite', day: 2 }), rec({ ...exam, outcome: 'not_met', breadth: 'composite', day: 3 })]);
    expect(d.level).toBe('A5');
    expect(d.by_condition.map((c) => c.level).sort()).toEqual(['A2', 'A5']);
  });
  it('A8: reduced-load evidence is recorded under the reduced-load condition only', () => {
    const d = decide([rec({ use: 'reduced_load', condition: { modality: 'writing', mode: 'self_practice', reduced_load: true, constraint: 'semantic' } })]);
    expect(d.by_condition[0]!.key).toContain('reduced');
  });
});

describe('B — confidence', () => {
  const short = (o: Partial<EvidenceRecord> & { day?: number }) => rec({ breadth: 'short', ...o });
  it('B0 below A4, B1 with one source', () => {
    expect(decide([rec({ ...guided, outcome: 'not_met' })]).confidence).toBe('B0');
    expect(decide([short({})]).confidence).toBe('B1');
  });
  it('B2 needs two study days AND two item families', () => {
    expect(decide([short({ day: 1, item_family_id: 'f' }), short({ day: 2, item_family_id: 'f' })]).confidence).toBe('B1');
    expect(decide([short({ day: 1 }), short({ day: 2 })]).confidence).toBe('B2');
  });
  it('B3 needs 3 sources, 2 families, 2 conditions and the last 3 all met', () => {
    const exam = { mode: 'exam' as const, condition: { modality: 'writing' as const, mode: 'exam' as const, reduced_load: false, constraint: 'semantic' as const } };
    expect(decide([short({ day: 1 }), short({ day: 2 }), short({ ...exam, day: 3 })]).confidence).toBe('B3');
    expect(decide([short({ day: 1 }), short({ day: 2 }), short({ day: 3 })]).confidence).toBe('B2');
  });
  it('B4: a not met after the last met lowers confidence one step', () => {
    expect(decide([short({ day: 1 }), short({ day: 2 }), short({ outcome: 'not_met', day: 3 })]).confidence).toBe('B1');
  });
});

describe('C — verification chain', () => {
  const ev = (o: Partial<Parameters<typeof afterVerification>[0]>) => afterVerification({ purpose: '7A', independent: true, outcome: 'met', opportunity: 'observed', step9_index: null, ...o }, p);
  it('C1: 7A met → 7B tomorrow; 7B met → Bước 9 after 3 days', () => {
    expect(ev({}).schedule).toMatchObject({ purpose: '7B', due_in_days: 1, reason: 'C1_AFTER_7A' });
    expect(ev({ purpose: '7B' }).schedule).toMatchObject({ purpose: '9', due_in_days: 3, step9_index: 0 });
  });
  it('C2: Bước 9 intervals grow 3 → 7 → 14 → 30 → 60 and stay at 60', () => {
    expect([0, 1, 2, 3, 4].map((i) => ev({ purpose: '9', step9_index: i }).schedule!.due_in_days)).toEqual([7, 14, 30, 60, 60]);
  });
  it('C3: 7A not met → back to Bước 6; 7B not met → practice + 7B in 2 days; Bước 9 not met → 3 days', () => {
    expect(ev({ outcome: 'not_met' })).toMatchObject({ back_to_step6: true, schedule: null });
    expect(ev({ purpose: '7B', outcome: 'not_met' })).toMatchObject({ contextual_practice: true, schedule: { purpose: '7B', due_in_days: 2 } });
    expect(ev({ purpose: '9', outcome: 'not_met', step9_index: 3 }).schedule).toMatchObject({ due_in_days: 3, step9_index: 0, reason: 'C3_STEP9_RESET' });
  });
  it('C4: absent / inconclusive / non-independent results wait and change nothing', () => {
    expect(ev({ opportunity: 'absent' })).toMatchObject({ awaiting_opportunity: true, schedule: null });
    expect(ev({ outcome: 'inconclusive' })).toMatchObject({ awaiting_opportunity: true, schedule: null });
    expect(ev({ independent: false })).toMatchObject({ awaiting_opportunity: true, schedule: null });
    expect(needsDirectCheck({ absent_count: 2, due_at: at(0), now: new Date(T0) }, p)).toBe(true);
    expect(needsDirectCheck({ absent_count: 1, due_at: at(0), now: new Date(T0 + 8 * DAY) }, p)).toBe(true);
    expect(needsDirectCheck({ absent_count: 1, due_at: at(0), now: new Date(T0 + 2 * DAY) }, p)).toBe(false);
  });
  it('C5: overdue → due; overdue more than twice the interval → recheck', () => {
    const vs = (days: number) => verificationStatus({ due_at: at(0), interval_days: 7, awaiting: false, now: new Date(T0 + days * DAY) }, p);
    expect([vs(-1), vs(3), vs(15)]).toEqual(['not_due', 'due', 'recheck']);
  });
});

describe('D — priority', () => {
  const base: PriorityInput = { task_id: 't', purpose: 'practice', due_at: at(1), estimated_minutes: 20, ai_impact: null, ai_certainty: null, hypothesis_status: null, frequency: 0, relevance: 1, skipped_sessions: 0 };
  const now = new Date(T0);
  it('D1: missing AI dimensions default to 1; certainty is capped for unconfirmed hypotheses; values are clamped', () => {
    expect(scoreTask(base, now, p).parts).toMatchObject({ impact: 1, certainty: 1 });
    expect(scoreTask({ ...base, ai_impact: 9, ai_certainty: 3, hypothesis_status: 'initial' }, now, p).parts).toMatchObject({ impact: 3, certainty: 1 });
  });
  it('D1: goal relevance from the goal (other exam type 0, unknown 1, target 2, highest target 3)', () => {
    const goal = { exam_type: 'academic' as const, targets: { writing: 7, speaking: 6.5, reading: 6, listening: 6 } };
    expect([goalRelevance(goal, 'writing', 'general_training'), goalRelevance(null, 'writing', null), goalRelevance(goal, 'speaking', null), goalRelevance(goal, 'writing', null)]).toEqual([0, 1, 2, 3]);
  });
  it('D2/D3: due today +3, overdue +5, +1 per 3 days waited (max 3)', () => {
    expect(scoreTask({ ...base, due_at: at(-0.2) }, now, p).parts).toMatchObject({ deadline: 3, waited: 0 });
    expect(scoreTask({ ...base, due_at: at(-7) }, now, p).parts).toMatchObject({ deadline: 5, waited: 2 });
    expect(scoreTask({ ...base, due_at: at(-30) }, now, p).parts.waited).toBe(3);
  });
  it('D4: only one starving verification task is pinned first', () => {
    const ranked = rankTasks([
      { ...base, task_id: 'hot', ai_impact: 3, ai_certainty: 3, frequency: 3, relevance: 3, due_at: at(-0.1) },
      { ...base, task_id: 'v1', purpose: '9', skipped_sessions: 3, due_at: at(-2) },
      { ...base, task_id: 'v2', purpose: '7B', due_at: at(-8) },
    ], now, p);
    expect(ranked[0]!.task_id).toBe('v2');
    expect(ranked.filter((r) => r.priority.starving)).toHaveLength(1);
  });
  it('D5: ties → earlier due then shorter; focus limit 3, or 1 for complex work', () => {
    const r = rankTasks([{ ...base, task_id: 'b', due_at: at(2) }, { ...base, task_id: 'a', due_at: at(2), estimated_minutes: 10 }, { ...base, task_id: 'c', due_at: at(1.5) }], now, p);
    expect(r.map((x) => x.task_id)).toEqual(['c', 'a', 'b']);
    expect([focusLimit(false, p), focusLimit(true, p)]).toEqual([3, 1]);
  });
});

describe('E — hypotheses', () => {
  const e = (o: Partial<HypothesisEvidence>): HypothesisEvidence => ({ attempt_id: `a${(n += 1)}`, outcome: 'not_met', independent: true, supports_specifically: false, contradicts: false, ...o });
  const hs = (evidence: HypothesisEvidence[], discriminating_task: 'match' | 'mismatch' | 'inconclusive' | null = null) => hypothesisStatus({ evidence, discriminating_task }, p).status;
  it('E0/E1: matching symptoms alone stay initial; specific conditions on 2 tasks, or 1 + a discriminating task, confirm', () => {
    expect(hs([e({}), e({})])).toBe('initial');
    expect(hs([e({ supports_specifically: true }), e({ supports_specifically: true })])).toBe('confirmed');
    expect(hs([e({ supports_specifically: true })], 'match')).toBe('confirmed');
    expect(hs([e({ supports_specifically: true, attempt_id: 'same' }), e({ supports_specifically: true, attempt_id: 'same' })])).toBe('initial');
  });
  it('E2: two independent passes in conditions where it predicts failure → rejected', () => {
    expect(hs([e({ outcome: 'met' }), e({ outcome: 'met' })])).toBe('rejected');
  });
  it('E3: mixed evidence or an inconclusive discriminating task → insufficient evidence; repairs never count', () => {
    expect(hs([e({ outcome: 'met' }), e({})])).toBe('insufficient_evidence');
    expect(hs([e({})], 'inconclusive')).toBe('insufficient_evidence');
    expect(hs([e({ outcome: 'met', independent: false }), e({ outcome: 'met', independent: false })])).toBe('initial');
  });
  it('E4: possible slip vs unstable control', () => {
    expect(slipLabel({ occurrences: 1, repaired_immediately_max_hint: 1, recurred_at_next_opportunity: false })).toBe('possible_slip');
    expect(slipLabel({ occurrences: 1, repaired_immediately_max_hint: 2, recurred_at_next_opportunity: false })).toBeNull();
    expect(slipLabel({ occurrences: 2, repaired_immediately_max_hint: 0, recurred_at_next_opportunity: true })).toBe('unstable_control');
  });
});

describe('F — catch-up', () => {
  const now = new Date(T0);
  const task = (id: string, purpose: string, due: number, minutes: number, score = 1) => ({ task_id: id, purpose, due_at: at(due), estimated_minutes: minutes, score });
  const days = (m: number[]) => m.map((minutes, i) => ({ day: at(i).slice(0, 10), minutes }));
  it('F1: counts due-soon work too; not before the overdue threshold', () => {
    expect(needsCatchUp({ overdue: [task('o', '7B', -3, 30)], dueSoon: [task('s', '9', 1, 30), task('s2', 'practice', 2, 50)], nextDays: days([30, 30, 40]), now }, p).needed).toBe(true);
    expect(needsCatchUp({ overdue: [task('o', '7B', -3, 30)], dueSoon: [], nextDays: days([30, 30, 40]), now }, p).needed).toBe(false);
    expect(needsCatchUp({ overdue: [task('o', '7B', -1, 300)], dueSoon: [], nextDays: days([10, 10, 10]), now }, p).needed).toBe(false);
    expect(needsCatchUp({ overdue: [], dueSoon: [task('s', '9', 1, 300)], nextDays: days([10, 10, 10]), now }, p).needed).toBe(false);
  });
  it('F2: no day over budget, ≤ 1 verification task per day, verification never cut', () => {
    const r = placeTasks([task('v1', '7B', -3, 30, 9), task('v2', '9', -2, 30, 8), task('p', 'practice', -1, 10, 1), task('big', '9', -1, 90, 7)], days([40, 15, 35, 60]), p);
    const where = Object.fromEntries(r.placements.map((x) => [x.task_id, x.to_day]));
    expect(where).toEqual({ v1: at(0).slice(0, 10), v2: at(2).slice(0, 10), p: at(0).slice(0, 10) });
    expect(r.unplaced).toEqual(['big']);
  });
  it('F3: 14 days below 60 % of the budget of non-rest days', () => {
    const d = (minutes: number, rest = false) => ({ minutes, budget: 60, planned_rest: rest });
    expect(underfunded({ days: Array.from({ length: 14 }, () => d(30)) }, p).underfunded).toBe(true);
    expect(underfunded({ days: [...Array.from({ length: 7 }, () => d(60)), ...Array.from({ length: 7 }, () => d(0, true))] }, p).underfunded).toBe(false);
    expect(underfunded({ days: Array.from({ length: 14 }, () => d(40)) }, p).underfunded).toBe(false);
  });
});
