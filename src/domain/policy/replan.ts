// D-02 v1 section F (E-33, 06A §9.2–9.3, 02 §5.C.2): catch-up schedule proposals. Pure, no I/O.
// Never minute debt: a day's budget is never raised; verification tasks are never cut below their measured scope.
import { DAY_MS, type CompetencyPolicyParams } from './params.js';

export interface PlanTask { task_id: string; purpose: string; due_at: string; estimated_minutes: number; score: number }
export interface DayBudget { day: string; minutes: number }

const VERIFY = new Set(['7A', '7B', '9']);
const isVerification = (t: PlanTask) => VERIFY.has(t.purpose);

/** F1: overdue work exists, it is more than a day late, and overdue + due-soon minutes exceed the budget of the next days. */
export function needsCatchUp(input: { overdue: readonly PlanTask[]; dueSoon: readonly PlanTask[]; nextDays: readonly DayBudget[]; now: Date }, p: CompetencyPolicyParams) {
  if (input.overdue.length === 0) return { needed: false, reason: 'Không có nhiệm vụ quá hạn' };
  const oldest = Math.min(...input.overdue.map((t) => Date.parse(t.due_at)));
  if ((input.now.getTime() - oldest) / DAY_MS < p.replan.min_overdue_days) return { needed: false, reason: 'Mới trễ chưa tới ngưỡng, chưa đề xuất' };
  const need = [...input.overdue, ...input.dueSoon].reduce((s, t) => s + t.estimated_minutes, 0);
  const have = input.nextDays.slice(0, p.replan.lookahead_days).reduce((s, d) => s + d.minutes, 0);
  return need > have
    ? { needed: true, reason: `F1: cần ${need} phút (quá hạn + đến hạn ${p.replan.lookahead_days} ngày tới) > quỹ ${have} phút` }
    : { needed: false, reason: `Quỹ ${have} phút đủ cho ${need} phút` };
}

export interface Placement { task_id: string; from_due_at: string; to_day: string; reason: string }

/**
 * F2: spread tasks by priority into the coming days without exceeding any day's budget and with at most one
 * verification task per day. A verification task that does not fit a day whole moves to the first day that fits;
 * only short practice goes into small days. Tasks that fit nowhere in the horizon stay where they are.
 */
export function placeTasks(tasks: readonly PlanTask[], days: readonly DayBudget[], p: CompetencyPolicyParams): { placements: Placement[]; unplaced: string[] } {
  const left = days.map((d) => ({ ...d, verification: 0 }));
  const placements: Placement[] = [];
  const unplaced: string[] = [];
  const ordered = [...tasks].sort((a, b) => b.score - a.score || a.due_at.localeCompare(b.due_at) || a.estimated_minutes - b.estimated_minutes);
  for (const t of ordered) {
    const slot = left.find((d) => d.minutes >= t.estimated_minutes && (!isVerification(t) || d.verification < p.replan.max_verification_per_day));
    if (!slot) { unplaced.push(t.task_id); continue; }
    slot.minutes -= t.estimated_minutes;
    if (isVerification(t)) slot.verification += 1;
    placements.push({ task_id: t.task_id, from_due_at: t.due_at, to_day: slot.day,
      reason: isVerification(t) ? 'F2: nhiệm vụ kiểm chứng giữ nguyên phạm vi đo, đặt vào ngày đầu tiên đủ quỹ' : 'F2: theo điểm ưu tiên, không vượt quỹ ngày' });
  }
  return { placements, unplaced };
}

/** F3: over the window, recorded study < ratio × goal budget of days that were not declared planned rest. */
export function underfunded(input: { days: readonly { minutes: number; budget: number | null; planned_rest: boolean }[] }, p: CompetencyPolicyParams) {
  const counted = input.days.filter((d) => !d.planned_rest && d.budget !== null && d.budget > 0);
  const target = counted.reduce((s, d) => s + (d.budget ?? 0), 0);
  const actual = counted.reduce((s, d) => s + d.minutes, 0);
  if (target === 0) return { underfunded: false, actual, target };
  return { underfunded: actual < p.replan.underfunded_ratio * target, actual, target };
}
