// D-02 v1 section F (E-33; 06A §9.2–9.3, 02 §5.C.2): catch-up schedule proposals. The learner always decides:
// a proposal changes nothing until accepted (compare-and-set on the plan version), expires after 48 h and can be
// rejected ("giữ nguyên lịch"). No minute debt, no AI call, verification tasks are never cut down.
import { randomUUID } from 'node:crypto';
import type { LoadedPolicy } from '../../domain/policy/params.js';
import { DAY_MS } from '../../domain/policy/params.js';
import { needsCatchUp, placeTasks, underfunded, type DayBudget, type Placement, type PlanTask } from '../../domain/policy/replan.js';
import { dayBudget, recordedMinutes, studyDayOf, studyDaysEnding } from '../../domain/scheduling/study-day.js';
import { dayBoundsUtc } from '../../infrastructure/sqlite/tracking-repository.js';
import { ReplanRepository } from '../../infrastructure/sqlite/replan-repository.js';
import type { Store } from '../../infrastructure/sqlite/store.js';

const JOB = 'replan_proposal';
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

export interface ReplanChanges {
  policy: { id: string; version: string; hash: string };
  placements: Placement[];
  unplaced: string[];
  /** F3 advice only: never applied automatically. */
  advisory: { kind: 'narrow_scope_or_move_exam'; actual_minutes: number; target_minutes: number; window_days: number } | null;
}

export interface ReplanProposalView {
  proposal_id: string; state: string; base_plan_version: number; expires_at: string; created_at: string; estimated_minutes: number;
  changes: ReplanChanges; reasons: string[];
}

export class ReplanPlanner {
  private repo: ReplanRepository;
  constructor(private store: Store, private policy: LoadedPolicy | null, private priorities: () => Map<string, number> = () => new Map()) {
    this.repo = new ReplanRepository(store.db, store.now);
  }

  private goalDaily(): number | null {
    return (this.store.db.prepare('SELECT daily_minutes FROM learner_goals ORDER BY updated_at DESC LIMIT 1').get() as { daily_minutes: number } | undefined)?.daily_minutes ?? null;
  }

  /** Budget left per day from today on: planned rest = 0; today minus what was already recorded. Never raised to repay missed days. */
  private budgets(today: string, count: number): DayBudget[] {
    const goal = this.goalDaily();
    return Array.from({ length: count }, (_, i) => {
      const day = addDays(today, i);
      const budget = dayBudget(this.store.tracking.declarations(day), goal) ?? 0;
      const used = i === 0 ? recordedMinutes(this.store.tracking.beats(day)).total : 0;
      return { day, minutes: Math.max(0, budget - used) };
    });
  }

  private view(row: { proposal_id: string; state: string; base_plan_version: number; expires_at: string; created_at: string; estimated_minutes: number; changes_json: string; reasons_json: string }): ReplanProposalView {
    return { proposal_id: row.proposal_id, state: row.state, base_plan_version: row.base_plan_version, expires_at: row.expires_at, created_at: row.created_at,
      estimated_minutes: row.estimated_minutes, changes: JSON.parse(row.changes_json) as ReplanChanges, reasons: JSON.parse(row.reasons_json) as string[] };
  }

  /** Current open proposal, creating one (at most once per study day) when F1 or F3 holds. */
  current(): { policy_status: 'APPROVED' | 'POLICY_NOT_APPROVED'; proposal: ReplanProposalView | null; evaluation: string[] } {
    if (!this.policy) return { policy_status: 'POLICY_NOT_APPROVED', proposal: null, evaluation: ['Chưa có chính sách D-02 được duyệt'] };
    const p = this.policy.params;
    const now = this.store.now();
    const at = now.toISOString();
    const today = studyDayOf(now);
    return this.store.db.transaction(() => {
      this.store.db.prepare("UPDATE replan_proposals SET state = 'EXPIRED', updated_at = ? WHERE state = 'PROPOSED' AND expires_at <= ?").run(at, at);
      const open = this.store.db.prepare("SELECT * FROM replan_proposals WHERE state = 'PROPOSED' ORDER BY created_at DESC LIMIT 1").get() as Parameters<ReplanPlanner['view']>[0] | undefined;
      if (open) return { policy_status: 'APPROVED' as const, proposal: this.view(open), evaluation: ['Đang có đề xuất chờ bạn quyết định'] };

      const scores = this.priorities();
      const rows = this.store.db.prepare("SELECT task_id, purpose, due_at, estimated_minutes FROM scheduled_tasks WHERE state IN ('PENDING', 'AWAITING_OPPORTUNITY') ORDER BY due_at").all() as Omit<PlanTask, 'score'>[];
      const tasks = rows.map((r) => ({ ...r, score: scores.get(r.task_id) ?? 0 }));
      const horizonEnd = new Date(now.getTime() + p.replan.lookahead_days * DAY_MS).toISOString();
      const overdue = tasks.filter((t) => t.due_at <= at);
      const dueSoon = tasks.filter((t) => t.due_at > at && t.due_at <= horizonEnd);
      const days = this.budgets(today, p.replan.placement_horizon_days);
      const f1 = needsCatchUp({ overdue, dueSoon, nextDays: days, now }, p);

      // F3: last N study days before today, counted from the first tracked day, minus declared planned rest.
      const goal = this.goalDaily();
      const start = this.store.tracking.trackingStartDay(null);
      const window = studyDaysEnding(addDays(today, -1), p.replan.underfunded_window_days).filter((d) => start !== null && d >= start);
      const f3 = underfunded({ days: window.map((d) => {
        const decl = this.store.tracking.declarations(d);
        return { minutes: recordedMinutes(this.store.tracking.beats(d)).total + (decl.offline?.minutes ?? 0), budget: dayBudget(decl, goal), planned_rest: decl.planned_rest };
      }) }, p);
      const f3Applies = f3.underfunded && window.length >= p.replan.underfunded_window_days;

      const evaluation = [f1.reason, f3Applies ? `F3: ${f3.actual}/${f3.target} phút trong ${window.length} ngày (< ${Math.round(p.replan.underfunded_ratio * 100)} %)` : `F3: chưa áp dụng (${f3.actual}/${f3.target} phút trong ${window.length} ngày theo dõi)`];
      if (!f1.needed && !f3Applies) return { policy_status: 'APPROVED' as const, proposal: null, evaluation };
      if ((this.store.tracking.lastRunDay(JOB) ?? '') >= today) return { policy_status: 'APPROVED' as const, proposal: null, evaluation: [...evaluation, 'Hôm nay đã có một đề xuất; không tạo lại'] };

      const placed = f1.needed ? placeTasks([...overdue, ...dueSoon], days, p) : { placements: [], unplaced: [] };
      const changes: ReplanChanges = {
        policy: this.policy!.ref,
        placements: placed.placements.filter((x) => studyDayOf(new Date(x.from_due_at)) !== x.to_day),
        unplaced: placed.unplaced,
        advisory: f3Applies ? { kind: 'narrow_scope_or_move_exam', actual_minutes: f3.actual, target_minutes: f3.target, window_days: window.length } : null,
      };
      if (changes.placements.length === 0 && !changes.advisory) return { policy_status: 'APPROVED' as const, proposal: null, evaluation: [...evaluation, 'Không có thay đổi lịch nào cần đề xuất'] };
      this.store.db.prepare("INSERT INTO plan_versions (plan_id, plan_version, updated_at) VALUES ('learner', 1, ?) ON CONFLICT (plan_id) DO NOTHING").run(at);
      const base = (this.store.db.prepare("SELECT plan_version FROM plan_versions WHERE plan_id = 'learner'").get() as { plan_version: number }).plan_version;
      const minutes = changes.placements.reduce((s, x) => s + (tasks.find((t) => t.task_id === x.task_id)?.estimated_minutes ?? 0), 0);
      const id = randomUUID();
      this.store.db.prepare(`INSERT INTO replan_proposals (proposal_id, base_plan_version, changes_json, reasons_json, estimated_minutes, expires_at, state, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'PROPOSED', ?, ?)`).run(id, base, JSON.stringify(changes), JSON.stringify(evaluation.filter((e) => /^F\d/.test(e))), minutes,
        new Date(now.getTime() + p.replan.proposal_ttl_hours * 3_600_000).toISOString(), at, at);
      this.store.tracking.claimSchedulerRun(JOB, today);
      const row = this.store.db.prepare('SELECT * FROM replan_proposals WHERE proposal_id = ?').get(id) as Parameters<ReplanPlanner['view']>[0];
      return { policy_status: 'APPROVED' as const, proposal: this.view(row), evaluation };
    }).immediate();
  }

  /** Accept: compare-and-set on the plan version, then move each still-open task to its new day (start of that study day). */
  accept(proposalId: string): { state: string } {
    try {
      return { state: this.repo.accept(proposalId, (json) => {
        const changes = JSON.parse(json) as ReplanChanges;
        const move = this.store.db.prepare("UPDATE scheduled_tasks SET due_at = ?, updated_at = ? WHERE task_id = ? AND state IN ('PENDING', 'AWAITING_OPPORTUNITY')");
        for (const x of changes.placements) move.run(dayBoundsUtc(x.to_day).start, this.store.now().toISOString(), x.task_id);
      }) };
    } catch (error) {
      if (error instanceof Error && error.message === 'UNKNOWN_PROPOSAL') throw Object.assign(new Error('Unknown proposal'), { statusCode: 404, code: 'NOT_FOUND' });
      throw error;
    }
  }

  reject(proposalId: string): { state: string } {
    try { return { state: this.repo.reject(proposalId) }; } catch (error) {
      if (error instanceof Error && error.message === 'UNKNOWN_PROPOSAL') throw Object.assign(new Error('Unknown proposal'), { statusCode: 404, code: 'NOT_FOUND' });
      throw error;
    }
  }
}
