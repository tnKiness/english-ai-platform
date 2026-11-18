// P5-1 Daily Tracker (06A §9, 02 §5.C.2, 06 §2.A.3–4; decision E-25). Records study activity honestly and describes
// each day with the four tracking groups. It never lowers a competency, never turns a missed day into minute debt and
// never calls AI: reminders come from fixed rules, so they still work when every provider is out of quota.
import { dayBudget, dayStatus, isStudyDay, MAX_HEARTBEAT_SPAN_SECONDS, recordedMinutes, STUDY_ACTIVITIES, studyDayOf, studyDaysEnding, type StudyActivity } from '../../domain/scheduling/study-day.js';
import type { DeclarationKind, Surface, TrackingRepository } from '../../infrastructure/sqlite/tracking-repository.js';
import type { Store } from '../../infrastructure/sqlite/store.js';

/** Offline beats synced late are accepted for this long (E-25, technical). */
export const MAX_SYNC_AGE_MS = 14 * 86_400_000;
/** Client clocks may run slightly ahead. */
export const MAX_CLOCK_SKEW_MS = 5 * 60_000;
export const MAX_BEATS_PER_REQUEST = 200;
const SURFACES: readonly Surface[] = ['workspace', 'reading', 'audio', 'today', 'progress'];

const bad = (message: string) => Object.assign(new Error(message), { statusCode: 400, code: 'BAD_REQUEST' });

export interface ActivityInput { client_event_id: string; activity: StudyActivity; surface: Surface; attempt_id?: string | null; span_seconds: number; occurred_at: string; offline?: boolean }

export class DailyTracker {
  readonly repo: TrackingRepository;
  constructor(private store: Store) { this.repo = store.tracking; }

  private today() { return studyDayOf(this.store.now()); }

  private goal(): { daily_minutes: number; weekly_minutes: number; updated_at: string } | null {
    return (this.store.db.prepare('SELECT daily_minutes, weekly_minutes, updated_at FROM learner_goals ORDER BY updated_at DESC LIMIT 1').get() as
      { daily_minutes: number; weekly_minutes: number; updated_at: string } | undefined) ?? null;
  }

  /** Heartbeats from the web client. Only activity metadata is accepted; content never travels through here. */
  recordActivity(beats: readonly ActivityInput[]) {
    if (beats.length === 0 || beats.length > MAX_BEATS_PER_REQUEST) throw bad(`Send 1–${MAX_BEATS_PER_REQUEST} activity events`);
    const now = this.store.now().getTime();
    const rows = beats.map((b) => {
      if (!STUDY_ACTIVITIES.includes(b.activity) || !SURFACES.includes(b.surface)) throw bad('Unknown activity or surface');
      if (!Number.isInteger(b.span_seconds) || b.span_seconds < 1 || b.span_seconds > MAX_HEARTBEAT_SPAN_SECONDS) throw bad('span_seconds out of range');
      const at = Date.parse(b.occurred_at);
      if (Number.isNaN(at)) throw bad('occurred_at is not a date');
      if (at > now + MAX_CLOCK_SKEW_MS) throw bad('occurred_at is in the future');
      if (at < now - MAX_SYNC_AGE_MS) throw bad('occurred_at is too old to sync');
      const attempt = b.attempt_id ?? null;
      if (attempt && !this.repo.attemptExists(attempt)) throw bad('Unknown attempt');
      const occurred = new Date(at);
      return { client_event_id: b.client_event_id, activity: b.activity, surface: b.surface, attempt_id: attempt, span_seconds: b.span_seconds,
        occurred_at: occurred.toISOString(), study_day: studyDayOf(occurred), offline: Boolean(b.offline) };
    });
    return this.repo.recordActivity(rows);
  }

  /**
   * Planned rest, "studied offline/outside the app" (optional self-reported minutes, kept apart from recorded minutes)
   * or today's time budget. Only today and the 14 previous days can be declared; future days only for rest/budget.
   */
  declare(input: { request_key: string; study_day: string; kind: DeclarationKind; active: boolean; minutes?: number | null; note?: string }) {
    if (!isStudyDay(input.study_day)) throw bad('study_day must be YYYY-MM-DD');
    const today = this.today();
    const oldest = studyDaysEnding(today, 15)[0]!;
    if (input.study_day < oldest) throw bad('Only the last 14 days can be changed');
    if (input.kind === 'offline' && input.study_day > today) throw bad('Offline study can only be recorded for today or earlier');
    if (input.study_day > new Date(Date.parse(`${today}T00:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10)) throw bad('Only the next 30 days can be planned');
    const minutes = input.minutes ?? null;
    if (input.kind === 'budget' && input.active && (minutes === null || minutes < 1)) throw bad('A budget needs minutes ≥ 1');
    if (input.kind === 'planned_rest' && minutes !== null) throw bad('Planned rest takes no minutes');
    this.repo.declare({ request_key: input.request_key, study_day: input.study_day, kind: input.kind, active: input.active, minutes: input.active ? minutes : null, note: (input.note ?? '').slice(0, 500) });
    return this.dayView(input.study_day);
  }

  dayView(day: string) {
    const today = this.today();
    const goal = this.goal();
    const declarations = this.repo.declarations(day);
    const beats = this.repo.beats(day);
    const minutes = recordedMinutes(beats);
    const status = dayStatus({ day, today, trackingStartDay: this.repo.trackingStartDay(goal ? studyDayOf(new Date(goal.updated_at)) : null), declarations,
      recordedMinutes: minutes.total, offlineBeats: beats.filter((b) => b.offline).length });
    const counts = this.repo.dayCounts(day);
    return {
      study_day: day, status,
      time: {
        recorded_minutes: minutes.total, by_activity: minutes.by_activity,
        self_reported_offline_minutes: declarations.offline?.minutes ?? null,
        budget_minutes: dayBudget(declarations, goal?.daily_minutes ?? null),
      },
      loop: counts.loop,
      evidence: counts.evidence,
    };
  }

  /**
   * The last `days` study days (default 7) plus plan drift as of now. Every figure is a description with its as_of
   * time; nothing here is a judgement of ability, and missing days never raise later budgets (06A §9.2).
   */
  overview(days = 7) {
    if (!Number.isInteger(days) || days < 1 || days > 31) throw bad('days must be 1–31');
    const now = this.store.now();
    const list = studyDaysEnding(this.today(), days).map((d) => this.dayView(d));
    const goal = this.goal();
    const byStatus: Record<string, number> = {};
    for (const d of list) byStatus[d.status] = (byStatus[d.status] ?? 0) + 1;
    return {
      as_of: now.toISOString(), time_zone: 'Asia/Bangkok', today: this.today(),
      goal: goal ? { daily_minutes: goal.daily_minutes, weekly_minutes: goal.weekly_minutes } : null,
      days: list,
      summary: {
        recorded_minutes: list.reduce((s, d) => s + d.time.recorded_minutes, 0),
        self_reported_offline_minutes: list.reduce((s, d) => s + (d.time.self_reported_offline_minutes ?? 0), 0),
        days_by_status: byStatus,
      },
      drift: this.repo.drift(now.toISOString()),
      policy: {
        no_minute_debt: true, competency_unchanged_by_attendance: true,
        note: 'Ngày không có dữ liệu được ghi là "thiếu dữ liệu quan sát", không phải bỏ học. Thiếu giờ không cộng dồn sang ngày sau và không làm giảm hồ sơ năng lực.',
      },
    };
  }

  /**
   * Rule-based daily reminder (06A §9.3): at most one per study day thanks to scheduler_runs.last_run_day and the
   * outbox dedupe key, so reopening the machine or a second process sends nothing twice. Missed days are not backfilled.
   * No reminder on a planned rest day, and none before a goal is saved (its budget would be missing).
   */
  runDailyScheduler(): { ran: boolean; enqueued: boolean } {
    const day = this.today();
    // Without a goal there is no budget to remind about; the day stays unclaimed so the reminder is built once a goal exists.
    if (!this.goal()) return { ran: false, enqueued: false };
    if (!this.repo.claimSchedulerRun('daily_reminder', day)) return { ran: false, enqueued: false };
    const view = this.dayView(day);
    if (view.status === 'planned_rest') return { ran: true, enqueued: false };
    const drift = this.repo.drift(this.store.now().toISOString());
    const budget = view.time.budget_minutes;
    const enqueued = this.repo.enqueueNotification({ dedupe_key: `daily_reminder:${day}`, kind: 'daily_reminder', study_day: day, payload: {
      title: 'Học hôm nay',
      body: [budget ? `Quỹ thời gian hôm nay: ${budget} phút.` : 'Chưa đặt quỹ thời gian hôm nay.',
        drift.overdue_tasks ? `Có ${drift.overdue_tasks} nhiệm vụ đã đến hạn; bạn chọn làm phần vừa sức, phần còn lại không bị dồn sang ngày mai.` : null].filter(Boolean).join(' '),
      budget_minutes: budget, overdue_tasks: drift.overdue_tasks,
    } });
    return { ran: true, enqueued };
  }

  notifications() { this.runDailyScheduler(); return { notifications: this.repo.notifications('PENDING') }; }
  dismiss(id: string) {
    if (!this.repo.dismissNotification(id)) throw Object.assign(new Error('Unknown or already dismissed notification'), { statusCode: 404, code: 'NOT_FOUND' });
    return { dismissed: true };
  }
}
