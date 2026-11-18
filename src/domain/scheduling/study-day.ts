// Daily tracking, pure part (06A §9.1–2, 02 §5.C.2). No I/O, no pedagogical thresholds: these functions only
// describe what was recorded. A day without data is "missing telemetry", never "skipped"; a short or missed day never
// creates minute debt and never lowers a competency.

/** 06A §9.3: the study day is counted in Asia/Bangkok; instants are stored in UTC. */
export const STUDY_TIME_ZONE = 'Asia/Bangkok';

export type StudyActivity = 'writing' | 'reading' | 'listening' | 'speaking' | 'thinking' | 'review';
export const STUDY_ACTIVITIES: readonly StudyActivity[] = ['writing', 'reading', 'listening', 'speaking', 'thinking', 'review'];

/** Longest span one heartbeat may claim (E-25, technical): the client sends one at least every 60 s while visible. */
export const MAX_HEARTBEAT_SPAN_SECONDS = 120;

const dayFormat = new Map<string, Intl.DateTimeFormat>();
/** "YYYY-MM-DD" of an instant in the study time zone. */
export function studyDayOf(at: Date, timeZone = STUDY_TIME_ZONE): string {
  let f = dayFormat.get(timeZone);
  if (!f) { f = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }); dayFormat.set(timeZone, f); }
  return f.format(at);
}

export const isStudyDay = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(`${day}T00:00:00Z`)) && new Date(`${day}T00:00:00Z`).toISOString().startsWith(day);

/** The previous `count` study days ending at `lastDay`, oldest first. Calendar arithmetic only (Asia/Bangkok has no DST). */
export function studyDaysEnding(lastDay: string, count: number): string[] {
  const end = Date.parse(`${lastDay}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) => new Date(end - (count - 1 - i) * 86_400_000).toISOString().slice(0, 10));
}

export interface ActivityBeat { activity: StudyActivity; occurred_at: string; span_seconds: number; offline: boolean }

/**
 * Minutes actually covered by heartbeats. Each beat covers [occurred_at − span, occurred_at]; overlapping beats
 * (two tabs, a retried sync, reading while audio plays) are merged, so time is never counted twice. Time spent
 * reading, listening or thinking counts through the surface the learner has open, not through keystrokes.
 */
export function recordedMinutes(beats: readonly ActivityBeat[]): { total: number; by_activity: Partial<Record<StudyActivity, number>> } {
  const union = (spans: [number, number][]) => {
    const sorted = [...spans].sort((a, b) => a[0] - b[0]);
    let ms = 0; let cur: [number, number] | null = null;
    for (const s of sorted) {
      if (cur && s[0] <= cur[1]) cur[1] = Math.max(cur[1], s[1]);
      else { if (cur) ms += cur[1] - cur[0]; cur = [s[0], s[1]]; }
    }
    if (cur) ms += cur[1] - cur[0];
    return Math.round(ms / 60_000);
  };
  const span = (b: ActivityBeat): [number, number] => {
    const end = Date.parse(b.occurred_at);
    return [end - Math.min(Math.max(b.span_seconds, 0), MAX_HEARTBEAT_SPAN_SECONDS) * 1000, end];
  };
  const by_activity: Partial<Record<StudyActivity, number>> = {};
  for (const a of STUDY_ACTIVITIES) {
    const own = beats.filter((b) => b.activity === a);
    if (own.length) by_activity[a] = union(own.map(span));
  }
  return { total: union(beats.map(span)), by_activity };
}

/** What the learner declared for a day (latest declaration of each kind wins). */
export interface DayDeclarations { planned_rest: boolean; offline: { minutes: number | null } | null; budget_minutes: number | null }

export type DayStatus = 'planned_rest' | 'offline' | 'studied' | 'missing_telemetry' | 'today_no_data_yet' | 'before_tracking';

/**
 * Honest status of one day (06A §9.1). Precedence: a declared rest; studying outside the app or while offline;
 * recorded activity; otherwise unknown — "missing telemetry" for a past day, "no data yet" for today.
 */
export function dayStatus(input: { day: string; today: string; trackingStartDay: string | null; declarations: DayDeclarations; recordedMinutes: number; offlineBeats: number }): DayStatus {
  if (input.declarations.planned_rest) return 'planned_rest';
  if (input.declarations.offline || input.offlineBeats > 0) return 'offline';
  if (input.recordedMinutes > 0) return 'studied';
  // Today is never "before tracking": the day is still open.
  if (input.day >= input.today) return 'today_no_data_yet';
  if (!input.trackingStartDay || input.day < input.trackingStartDay) return 'before_tracking';
  return 'missing_telemetry';
}

/**
 * Time budget of a day (06A §9.2): the day's own override, else the goal's daily minutes; zero on a planned rest.
 * Earlier shortfalls are deliberately not an input: a missed day never adds minutes to another day.
 */
export function dayBudget(declarations: DayDeclarations, goalDailyMinutes: number | null): number | null {
  if (declarations.planned_rest) return 0;
  return declarations.budget_minutes ?? goalDailyMinutes;
}
