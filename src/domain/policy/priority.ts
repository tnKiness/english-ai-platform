// D-02 v1 section D (E-33): stage-2 ranking after the eligibility filter (02 §5.A). Pure, no I/O.
// Two dimensions come from AI (clamped by the app), two are computed here from stored data, so changing the goal
// re-ranks immediately without calling AI.
import { DAY_MS, type CompetencyPolicyParams } from './params.js';

export type Skill = 'writing' | 'speaking' | 'reading' | 'listening';
export interface GoalTargets { exam_type: 'academic' | 'general_training'; targets: Record<Skill, number> }

/** D1 "Liên quan mục tiêu": other exam type 0; unknown 1; skill has a target 2; skill with the highest target 3. */
export function goalRelevance(goal: GoalTargets | null, skill: Skill | null, itemExamType: 'academic' | 'general_training' | null): number {
  if (!goal || !skill) return 1;
  if (itemExamType && itemExamType !== goal.exam_type) return 0;
  const target = goal.targets[skill];
  if (!(target > 0)) return 1;
  return target >= Math.max(...Object.values(goal.targets)) ? 3 : 2;
}

/** D1 "Tần suất/phạm vi": not_met sources of the skill in the window → 0/1/2/≥3 = 0/1/2/3. */
export const frequencyScore = (notMetSources: number, p: CompetencyPolicyParams) => Math.max(0, Math.min(p.priority.dimension_max, notMetSources));

export interface PriorityInput {
  task_id: string;
  purpose: string;
  due_at: string;
  estimated_minutes: number;
  /** AI-proposed dimensions; null when the diagnosis did not provide them. */
  ai_impact: number | null;
  ai_certainty: number | null;
  /** Certainty is capped while the hypothesis is only initial / insufficient_evidence. */
  hypothesis_status: 'initial' | 'insufficient_evidence' | 'confirmed' | 'rejected' | null;
  frequency: number;
  relevance: number;
  /** Study sessions (days with study activity) since the task was due in which it was not picked. */
  skipped_sessions: number;
}

export interface PriorityScore { task_id: string; score: number; parts: Record<string, number>; starving: boolean; reasons: string[] }

const VERIFY = new Set(['7A', '7B', '9']);

export function scoreTask(t: PriorityInput, now: Date, p: CompetencyPolicyParams): PriorityScore {
  const q = p.priority;
  const clamp = (v: number | null) => (v === null || !Number.isFinite(v) ? q.missing_ai_dimension : Math.max(0, Math.min(q.dimension_max, Math.round(v))));
  const reasons: string[] = [];
  const impact = clamp(t.ai_impact);
  let certainty = clamp(t.ai_certainty);
  if ((t.hypothesis_status === 'initial' || t.hypothesis_status === 'insufficient_evidence') && certainty > q.weak_certainty_cap) {
    certainty = q.weak_certainty_cap; reasons.push('D1: giả thuyết chưa xác nhận, kẹp độ chắc chắn');
  }
  const due = Date.parse(t.due_at);
  const overdueDays = (now.getTime() - due) / DAY_MS;
  const deadline = due > now.getTime() ? 0 : overdueDays >= 1 ? q.overdue_bonus : q.due_today_bonus;
  const waited = due > now.getTime() ? 0 : Math.min(q.wait_max_points, Math.floor(overdueDays / q.wait_days_per_point));
  const parts = { impact, certainty, frequency: Math.min(q.dimension_max, t.frequency), relevance: Math.min(q.dimension_max, t.relevance), deadline, waited };
  const starving = VERIFY.has(t.purpose) && (t.skipped_sessions >= q.starvation_skipped_sessions || overdueDays > q.starvation_overdue_days);
  if (starving) reasons.push('D4: chống trì hoãn — giữ chỗ đầu danh sách');
  return { task_id: t.task_id, score: Object.values(parts).reduce((s, v) => s + v, 0), parts, starving, reasons };
}

/** D2–D5: rank by score; ties → earlier due, then shorter; at most one starving verification task is pinned first. */
export function rankTasks<T extends PriorityInput>(tasks: readonly T[], now: Date, p: CompetencyPolicyParams): (T & { priority: PriorityScore })[] {
  const scored = tasks.map((t) => ({ ...t, priority: scoreTask(t, now, p) }));
  scored.sort((a, b) => b.priority.score - a.priority.score || a.due_at.localeCompare(b.due_at) || a.estimated_minutes - b.estimated_minutes || a.task_id.localeCompare(b.task_id));
  const pinned = scored.filter((s) => s.priority.starving).sort((a, b) => a.due_at.localeCompare(b.due_at))[0];
  if (!pinned) return scored;
  return [pinned, ...scored.filter((s) => s !== pinned).map((s) => (s.priority.starving ? { ...s, priority: { ...s.priority, starving: false, reasons: [...s.priority.reasons, 'D4: chỉ một nhiệm vụ giữ chỗ mỗi buổi'] } } : s))];
}

/** D5: 2–3 focuses per session, or 1 for a complex problem / whole-task work. */
export const focusLimit = (complex: boolean, p: CompetencyPolicyParams) => (complex ? p.priority.focus_complex_max : p.priority.focus_default_max);
