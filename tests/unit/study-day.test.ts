// P5-1 (06A §9): study day in Asia/Bangkok, merged activity minutes, honest day status, no minute debt.
import { describe, expect, it } from 'vitest';
import { dayBudget, dayStatus, recordedMinutes, studyDayOf, studyDaysEnding, type ActivityBeat } from '../../src/domain/scheduling/study-day.js';

const none = { planned_rest: false, offline: null, budget_minutes: null };
const beat = (at: string, activity: ActivityBeat['activity'] = 'writing', span = 60, offline = false): ActivityBeat => ({ activity, occurred_at: at, span_seconds: span, offline });

describe('studyDayOf', () => {
  it('uses Asia/Bangkok (UTC+7) for the day boundary', () => {
    expect(studyDayOf(new Date('2026-11-16T16:59:59Z'))).toBe('2026-11-16');
    expect(studyDayOf(new Date('2026-11-16T17:00:00Z'))).toBe('2026-11-17');
    expect(studyDaysEnding('2026-03-02', 3)).toEqual(['2026-02-28', '2026-03-01', '2026-03-02']);
  });
});

describe('recordedMinutes', () => {
  it('merges overlapping beats so two tabs or a resent beat never count twice', () => {
    const beats = [beat('2026-11-17T01:01:00Z'), beat('2026-11-17T01:01:00Z'), beat('2026-11-17T01:01:30Z', 'reading'), beat('2026-11-17T01:02:00Z')];
    expect(recordedMinutes(beats)).toEqual({ total: 2, by_activity: { writing: 2, reading: 1 } });
  });
  it('caps a beat at 120 s', () => {
    expect(recordedMinutes([beat('2026-11-17T01:30:00Z', 'thinking', 9999)]).total).toBe(2);
  });
});

describe('dayStatus', () => {
  const base = { day: '2026-11-15', today: '2026-11-17', trackingStartDay: '2026-11-10', declarations: none, recordedMinutes: 0, offlineBeats: 0 };
  it('a past day without data is missing telemetry, never "skipped"', () => {
    expect(dayStatus(base)).toBe('missing_telemetry');
    expect(dayStatus({ ...base, day: '2026-11-17' })).toBe('today_no_data_yet');
    expect(dayStatus({ ...base, day: '2026-11-01' })).toBe('before_tracking');
    expect(dayStatus({ ...base, trackingStartDay: null })).toBe('before_tracking');
  });
  it('declared rest wins; offline (declared or synced late) comes before plain studied', () => {
    expect(dayStatus({ ...base, declarations: { ...none, planned_rest: true }, recordedMinutes: 20 })).toBe('planned_rest');
    expect(dayStatus({ ...base, declarations: { ...none, offline: { minutes: 30 } } })).toBe('offline');
    expect(dayStatus({ ...base, recordedMinutes: 5, offlineBeats: 1 })).toBe('offline');
    expect(dayStatus({ ...base, recordedMinutes: 5 })).toBe('studied');
  });
});

describe('dayBudget', () => {
  it('is the day override or the goal, zero on rest, and never includes earlier shortfalls', () => {
    expect(dayBudget(none, 40)).toBe(40);
    expect(dayBudget({ ...none, budget_minutes: 15 }, 40)).toBe(15);
    expect(dayBudget({ ...none, planned_rest: true, budget_minutes: 15 }, 40)).toBe(0);
    expect(dayBudget.length).toBe(2); // the signature has no "missed minutes" input by design
  });
});
