// P5-1 Daily tracking persistence (migration 0010, E-25). Append-only activity/declarations, outbox, scheduler runs,
// and read-only daily counts from the learning tables. Never reads submission content, answers or audio.
import { randomUUID } from 'node:crypto';
import type { ActivityBeat, DayDeclarations, StudyActivity } from '../../domain/scheduling/study-day.js';
import type { Db } from './database.js';

export type Surface = 'workspace' | 'reading' | 'audio' | 'today' | 'progress';
export interface NewActivity { client_event_id: string; activity: StudyActivity; surface: Surface; attempt_id: string | null; span_seconds: number; occurred_at: string; study_day: string; offline: boolean }
export type DeclarationKind = 'planned_rest' | 'offline' | 'budget';
export interface Notification { notification_id: string; kind: 'daily_reminder'; study_day: string; payload: unknown; state: 'PENDING' | 'DISMISSED'; created_at: string }

/** UTC bounds [start, end) of an Asia/Bangkok study day (UTC+7, no DST). */
export const dayBoundsUtc = (day: string) => {
  const start = Date.parse(`${day}T00:00:00+07:00`);
  return { start: new Date(start).toISOString(), end: new Date(start + 86_400_000).toISOString() };
};

export class TrackingRepository {
  constructor(private db: Db, private now: () => Date) {}

  /** Idempotent by client_event_id: a resent beat returns false and changes nothing. */
  recordActivity(beats: readonly NewActivity[]): { accepted: number; duplicates: number } {
    let accepted = 0;
    this.db.transaction(() => {
      const at = this.now().toISOString();
      const insert = this.db.prepare(`INSERT INTO study_activity_events (event_id, client_event_id, activity, surface, attempt_id, span_seconds, occurred_at, study_day, offline, received_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (client_event_id) DO NOTHING`);
      for (const b of beats) accepted += insert.run(randomUUID(), b.client_event_id, b.activity, b.surface, b.attempt_id, b.span_seconds, b.occurred_at, b.study_day, b.offline ? 1 : 0, at).changes;
    }).immediate();
    return { accepted, duplicates: beats.length - accepted };
  }

  attemptExists(attemptId: string): boolean {
    return Boolean(this.db.prepare("SELECT 1 FROM attempts WHERE attempt_id = ? AND scope = 'learner'").get(attemptId));
  }

  beats(day: string): ActivityBeat[] {
    return (this.db.prepare('SELECT activity, occurred_at, span_seconds, offline FROM study_activity_events WHERE study_day = ? ORDER BY occurred_at').all(day) as
      { activity: StudyActivity; occurred_at: string; span_seconds: number; offline: number }[]).map((r) => ({ ...r, offline: r.offline === 1 }));
  }

  /** Idempotent by request_key: a double click records one declaration. */
  declare(input: { request_key: string; study_day: string; kind: DeclarationKind; active: boolean; minutes: number | null; note: string }): void {
    this.db.prepare(`INSERT INTO daily_study_logs (log_id, request_key, study_day, kind, active, minutes, note, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (request_key) DO NOTHING`).run(randomUUID(), input.request_key, input.study_day, input.kind, input.active ? 1 : 0, input.minutes, input.note, this.now().toISOString());
  }

  declarations(day: string): DayDeclarations {
    const rows = this.db.prepare(`SELECT kind, active, minutes FROM daily_study_logs WHERE study_day = ? ORDER BY recorded_at, rowid`).all(day) as { kind: DeclarationKind; active: number; minutes: number | null }[];
    const latest = new Map<DeclarationKind, { active: number; minutes: number | null }>();
    for (const r of rows) latest.set(r.kind, r);
    const on = (k: DeclarationKind) => latest.get(k)?.active === 1 ? latest.get(k)! : null;
    const offline = on('offline');
    return { planned_rest: Boolean(on('planned_rest')), offline: offline ? { minutes: offline.minutes } : null, budget_minutes: on('budget')?.minutes ?? null };
  }

  /** First day with any recorded activity or declaration, or with a saved goal: earlier days are not "missing". */
  trackingStartDay(goalDay: string | null): string | null {
    const row = this.db.prepare('SELECT MIN(d) AS d FROM (SELECT MIN(study_day) AS d FROM study_activity_events UNION ALL SELECT MIN(study_day) FROM daily_study_logs)').get() as { d: string | null };
    return [row.d, goalDay].filter((d): d is string => Boolean(d)).sort()[0] ?? null;
  }

  /** Loop-closure and evidence counts of one day, learner scope only (06A §9.1 groups 2 and 3). Descriptive, no thresholds. */
  dayCounts(day: string) {
    const { start, end } = dayBoundsUtc(day);
    const count = (sql: string) => (this.db.prepare(sql).get(start, end) as { n: number }).n;
    const outcomes = this.db.prepare(`SELECT outcome, COUNT(*) AS n FROM observations WHERE scope = 'learner' AND created_at >= ? AND created_at < ? GROUP BY outcome`).all(start, end) as { outcome: string; n: number }[];
    const hypotheses = this.db.prepare(`SELECT status, COUNT(*) AS n FROM error_hypotheses WHERE updated_at >= ? AND updated_at < ? GROUP BY status`).all(start, end) as { status: string; n: number }[];
    return {
      loop: {
        attempts_started: count(`SELECT COUNT(*) AS n FROM attempts WHERE scope = 'learner' AND created_at >= ? AND created_at < ?`),
        original_submissions: count(`SELECT COUNT(*) AS n FROM submissions s JOIN attempts a USING (attempt_id) WHERE a.scope = 'learner' AND s.kind = 'original' AND s.created_at >= ? AND s.created_at < ?`),
        repair_submissions: count(`SELECT COUNT(*) AS n FROM submissions s JOIN attempts a USING (attempt_id) WHERE a.scope = 'learner' AND s.kind = 'repair' AND s.created_at >= ? AND s.created_at < ?`),
        scheduled_tasks_completed: count(`SELECT COUNT(*) AS n FROM scheduled_tasks WHERE state = 'COMPLETED' AND updated_at >= ? AND updated_at < ?`),
      },
      evidence: {
        observations: Object.fromEntries(outcomes.map((o) => [o.outcome, o.n])) as Partial<Record<'met' | 'not_met' | 'inconclusive', number>>,
        error_hypotheses_updated: Object.fromEntries(hypotheses.map((h) => [h.status, h.n])) as Record<string, number>,
      },
    };
  }

  /** Plan drift as of now (06A §9.1 group 4): open scheduled tasks past due, and the current plan version. */
  drift(nowIso: string) {
    const overdue = this.db.prepare(`SELECT COUNT(*) AS n, MIN(due_at) AS oldest FROM scheduled_tasks WHERE state IN ('PENDING', 'AWAITING_OPPORTUNITY') AND due_at <= ?`).get(nowIso) as { n: number; oldest: string | null };
    const upcoming = (this.db.prepare(`SELECT COUNT(*) AS n FROM scheduled_tasks WHERE state IN ('PENDING', 'AWAITING_OPPORTUNITY') AND due_at > ?`).get(nowIso) as { n: number }).n;
    const plan = this.db.prepare("SELECT plan_version FROM plan_versions WHERE plan_id = 'learner'").get() as { plan_version: number } | undefined;
    return { overdue_tasks: overdue.n, oldest_overdue_due_at: overdue.oldest, upcoming_tasks: upcoming, plan_version: plan?.plan_version ?? null };
  }

  // ---- Scheduler + outbox ----------------------------------------------------------------------
  /** Claims the job for `day`; false when it already ran that day (after a restart, a second tab, a second process). */
  claimSchedulerRun(job: string, day: string): boolean {
    return this.db.transaction(() => {
      const row = this.db.prepare('SELECT last_run_day FROM scheduler_runs WHERE job_name = ?').get(job) as { last_run_day: string } | undefined;
      if (row && row.last_run_day >= day) return false;
      this.db.prepare(`INSERT INTO scheduler_runs (job_name, last_run_day, last_run_at) VALUES (?, ?, ?)
        ON CONFLICT (job_name) DO UPDATE SET last_run_day = excluded.last_run_day, last_run_at = excluded.last_run_at`).run(job, day, this.now().toISOString());
      return true;
    }).immediate();
  }

  /** Day a job last completed (E-32 auto backup: recorded only after success, so a failure is retried later the same day). */
  lastRunDay(job: string): string | null {
    return (this.db.prepare('SELECT last_run_day FROM scheduler_runs WHERE job_name = ?').get(job) as { last_run_day: string } | undefined)?.last_run_day ?? null;
  }

  enqueueNotification(n: { dedupe_key: string; kind: 'daily_reminder'; study_day: string; payload: unknown }): boolean {
    const at = this.now().toISOString();
    return this.db.prepare(`INSERT INTO notification_outbox (notification_id, dedupe_key, channel, kind, study_day, payload_json, state, created_at, updated_at)
      VALUES (?, ?, 'in_app', ?, ?, ?, 'PENDING', ?, ?) ON CONFLICT (dedupe_key) DO NOTHING`).run(randomUUID(), n.dedupe_key, n.kind, n.study_day, JSON.stringify(n.payload), at, at).changes === 1;
  }

  notifications(state: 'PENDING' | 'ALL' = 'PENDING'): Notification[] {
    const rows = this.db.prepare(`SELECT notification_id, kind, study_day, payload_json, state, created_at FROM notification_outbox ${state === 'PENDING' ? "WHERE state = 'PENDING'" : ''} ORDER BY created_at DESC LIMIT 50`).all() as
      { notification_id: string; kind: 'daily_reminder'; study_day: string; payload_json: string; state: 'PENDING' | 'DISMISSED'; created_at: string }[];
    return rows.map(({ payload_json, ...r }) => ({ ...r, payload: JSON.parse(payload_json) as unknown }));
  }

  dismissNotification(id: string): boolean {
    return this.db.prepare("UPDATE notification_outbox SET state = 'DISMISSED', updated_at = ? WHERE notification_id = ? AND state = 'PENDING'").run(this.now().toISOString(), id).changes === 1;
  }
}
