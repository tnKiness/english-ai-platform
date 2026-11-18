// P5-1 Daily tracking over HTTP + SQLite (06A §9, §10.A; 02 §5.C.2; E-25).
import { afterEach, expect, it } from 'vitest';
import { dataPaths } from '../../src/infrastructure/files/paths.js';
import { openStore, type Store } from '../../src/infrastructure/sqlite/store.js';
import { createApp } from '../../src/server/app.js';
import { clock, tempDir, type Clock } from './p1-helpers.js';

let store: Store | undefined;
let app: ReturnType<typeof createApp> | undefined;
const cleanups: (() => void)[] = [];
afterEach(async () => {
  await app?.close(); app = undefined;
  try { store?.close(); } catch { /* closed */ }
  store = undefined;
  cleanups.splice(0).forEach((c) => c());
});

const HOST = '127.0.0.1:4317';
const ORIGIN = 'http://127.0.0.1:5173';
type S = { cookie: string; csrf: string };

// 2026-11-17 09:00 in Bangkok.
async function setup(start = '2026-11-17T02:00:00.000Z'): Promise<{ a: ReturnType<typeof createApp>; s: S; c: Clock; dir: string }> {
  const t = tempDir('ielts-p5-'); cleanups.push(t.cleanup);
  const c = clock(start);
  store = await openStore(dataPaths(t.dir), { now: c.now });
  app = createApp({ store, gatewayStatus: async () => [] });
  const res = await app.inject({ url: '/api/session', headers: { host: HOST } });
  return { a: app, c, dir: t.dir, s: { cookie: String(res.headers['set-cookie']).split(';')[0]!, csrf: res.json().csrf_token as string } };
}
const get = (a: ReturnType<typeof createApp>, url: string, s: S) => a.inject({ method: 'GET', url, headers: { host: HOST, cookie: s.cookie } });
const post = (a: ReturnType<typeof createApp>, url: string, s: S, payload: unknown = {}) =>
  a.inject({ method: 'POST', url, payload: payload as Record<string, unknown>, headers: { host: HOST, origin: ORIGIN, cookie: s.cookie, 'x-csrf-token': s.csrf } });
const goal = { target_band_overall: 7, target_listening: 7, target_reading: 7, target_writing: 6.5, target_speaking: 6.5, exam_type: 'academic', exam_date: null, daily_minutes: 40, weekly_minutes: 240 };
const beat = (id: string, at: string, extra: Record<string, unknown> = {}) => ({ client_event_id: id, activity: 'writing', surface: 'workspace', span_seconds: 60, occurred_at: at, ...extra });

it('records heartbeats idempotently, merges overlaps and counts reading/listening without keystrokes', async () => {
  const { a, s } = await setup();
  expect((await post(a, '/api/learning/goals', s, goal)).statusCode).toBe(200);
  const events = [beat('b1', '2026-11-17T01:01:00Z'), beat('b2', '2026-11-17T01:02:00Z'), beat('b3', '2026-11-17T01:02:00Z', { activity: 'listening', surface: 'audio' }),
    beat('b4', '2026-11-17T01:10:00Z', { activity: 'reading', surface: 'reading' })];
  expect((await post(a, '/api/learning/tracking/activity', s, { events })).json()).toEqual({ accepted: 4, duplicates: 0 });
  expect((await post(a, '/api/learning/tracking/activity', s, { events })).json()).toEqual({ accepted: 0, duplicates: 4 });
  const o = (await get(a, '/api/learning/tracking?days=7', s)).json();
  expect(o.time_zone).toBe('Asia/Bangkok');
  expect(o.days).toHaveLength(7);
  const today = o.days.at(-1);
  expect(today).toMatchObject({ study_day: '2026-11-17', status: 'studied', time: { recorded_minutes: 3, budget_minutes: 40, by_activity: { writing: 2, listening: 1, reading: 1 } } });
  expect(o.days.slice(0, 6).every((d: { status: string }) => d.status === 'before_tracking')).toBe(true);
  expect(o.policy).toMatchObject({ no_minute_debt: true, competency_unchanged_by_attendance: true });
});

it('a missed day is missing telemetry and does not raise the next day budget; rest and offline are honest states', async () => {
  const { a, s, c } = await setup();
  await post(a, '/api/learning/goals', s, goal);
  await post(a, '/api/learning/tracking/activity', s, { events: [beat('d1', '2026-11-17T02:00:00Z')] });
  c.advance(2 * 86_400_000); // now 2026-11-19
  await post(a, '/api/learning/tracking/day', s, { request_key: 'r1', study_day: '2026-11-19', kind: 'planned_rest', active: true });
  // A beat recorded while offline on the 18th arrives late.
  await post(a, '/api/learning/tracking/activity', s, { events: [beat('late', '2026-11-18T03:00:00Z', { offline: true })] });
  let o = (await get(a, '/api/learning/tracking?days=3', s)).json();
  expect(o.days.map((d: { status: string }) => d.status)).toEqual(['studied', 'offline', 'planned_rest']);
  expect(o.days[2].time.budget_minutes).toBe(0);

  c.advance(86_400_000); // 2026-11-20: nothing recorded on the 20th yet; the 19th rest is still rest
  o = (await get(a, '/api/learning/tracking?days=4', s)).json();
  expect(o.days.at(-1)).toMatchObject({ status: 'today_no_data_yet', time: { budget_minutes: 40 } });

  c.advance(86_400_000); // 2026-11-21: the 20th had no data at all
  o = (await get(a, '/api/learning/tracking?days=2', s)).json();
  expect(o.days.map((d: { status: string }) => d.status)).toEqual(['missing_telemetry', 'today_no_data_yet']);
  expect(o.days[1].time.budget_minutes).toBe(40); // no minute debt from the empty day

  // Studied outside the app, with self-reported minutes kept apart from recorded minutes; then withdrawn.
  let d = (await post(a, '/api/learning/tracking/day', s, { request_key: 'r2', study_day: '2026-11-20', kind: 'offline', active: true, minutes: 30 })).json();
  expect(d).toMatchObject({ status: 'offline', time: { recorded_minutes: 0, self_reported_offline_minutes: 30 } });
  d = (await post(a, '/api/learning/tracking/day', s, { request_key: 'r3', study_day: '2026-11-20', kind: 'offline', active: false })).json();
  expect(d.status).toBe('missing_telemetry');
  // Same request_key twice = one declaration.
  await post(a, '/api/learning/tracking/day', s, { request_key: 'r4', study_day: '2026-11-21', kind: 'budget', active: true, minutes: 15 });
  await post(a, '/api/learning/tracking/day', s, { request_key: 'r4', study_day: '2026-11-21', kind: 'budget', active: true, minutes: 15 });
  expect(store!.db.prepare("SELECT COUNT(*) FROM daily_study_logs WHERE request_key = 'r4'").pluck().get()).toBe(1);
  expect((await get(a, '/api/learning/tracking?days=1', s)).json().days[0].time.budget_minutes).toBe(15);
});

it('rejects bad input, future beats, stale syncs and writes without CSRF', async () => {
  const { a, s } = await setup();
  const bad = async (payload: unknown, url = '/api/learning/tracking/activity') => (await post(a, url, s, payload)).statusCode;
  expect(await bad({ events: [beat('f', '2026-11-17T03:00:00Z')] })).toBe(400); // one hour ahead
  expect(await bad({ events: [beat('o', '2026-10-01T00:00:00Z')] })).toBe(400); // older than 14 days
  expect(await bad({ events: [beat('x', '2026-11-17T01:00:00Z', { span_seconds: 500 })] })).toBe(400);
  expect(await bad({ events: [beat('y', '2026-11-17T01:00:00Z', { attempt_id: 'nope' })] })).toBe(400);
  expect(await bad({ events: [beat('z', '2026-11-17T01:00:00Z', { content: 'draft text' })] })).toBe(400); // no content field accepted
  expect(await bad({ request_key: 'k', study_day: '2026-11-18', kind: 'offline', active: true }, '/api/learning/tracking/day')).toBe(400);
  expect(await bad({ request_key: 'k2', study_day: '2026-10-01', kind: 'planned_rest', active: true }, '/api/learning/tracking/day')).toBe(400);
  expect(await bad({ request_key: 'k3', study_day: '2026-11-17', kind: 'budget', active: true }, '/api/learning/tracking/day')).toBe(400);
  const noCsrf = await a.inject({ method: 'POST', url: '/api/learning/tracking/activity', payload: { events: [beat('c', '2026-11-17T01:00:00Z')] }, headers: { host: HOST, origin: ORIGIN, cookie: s.cookie } });
  expect(noCsrf.statusCode).toBe(403);
  expect(store!.db.prepare('SELECT COUNT(*) FROM study_activity_events').pluck().get()).toBe(0);
});

it('one rule-based reminder per study day, none on rest, none duplicated after a restart, no backfill', async () => {
  const { a, s, c, dir } = await setup();
  // No goal yet: no reminder, and the day is not used up (found on the real UI, 18/11/2026).
  expect((await get(a, '/api/learning/notifications', s)).json().notifications).toHaveLength(0);
  await post(a, '/api/learning/goals', s, goal);
  let n = (await get(a, '/api/learning/notifications', s)).json().notifications;
  expect(n).toHaveLength(1);
  expect(n[0]).toMatchObject({ study_day: '2026-11-17', payload: { title: 'Học hôm nay', budget_minutes: 40 } });
  expect((await get(a, '/api/learning/notifications', s)).json().notifications).toHaveLength(1);

  // Restart: a new store/app on the same data sends nothing new the same day.
  await app!.close(); store!.close();
  store = await openStore(dataPaths(dir), { now: c.now });
  app = createApp({ store, gatewayStatus: async () => [] });
  const res = await app.inject({ url: '/api/session', headers: { host: HOST } });
  const s2 = { cookie: String(res.headers['set-cookie']).split(';')[0]!, csrf: res.json().csrf_token as string };
  n = (await get(app, '/api/learning/notifications', s2)).json().notifications;
  expect(n).toHaveLength(1);
  expect((await post(app, `/api/learning/notifications/${n[0].notification_id}/dismiss`, s2)).json()).toEqual({ dismissed: true });
  expect((await post(app, `/api/learning/notifications/${n[0].notification_id}/dismiss`, s2)).statusCode).toBe(404);

  // Machine off for 3 days, and the day it reopens is a planned rest: no backfilled reminders, none for today.
  c.advance(3 * 86_400_000);
  await post(app, '/api/learning/tracking/day', s2, { request_key: 'rest', study_day: '2026-11-20', kind: 'planned_rest', active: true });
  expect((await get(app, '/api/learning/notifications', s2)).json().notifications).toHaveLength(0);
  c.advance(86_400_000);
  expect((await get(app, '/api/learning/notifications', s2)).json().notifications.map((x: { study_day: string }) => x.study_day)).toEqual(['2026-11-21']);
  expect(store.db.prepare('SELECT COUNT(*) FROM notification_outbox').pluck().get()).toBe(2);
});

it('activity and declarations are append-only', async () => {
  const { a, s } = await setup();
  await post(a, '/api/learning/tracking/activity', s, { events: [beat('e1', '2026-11-17T01:00:00Z')] });
  await post(a, '/api/learning/tracking/day', s, { request_key: 'k', study_day: '2026-11-17', kind: 'planned_rest', active: true });
  expect(() => store!.db.prepare('UPDATE study_activity_events SET span_seconds = 1').run()).toThrow(/append-only/);
  expect(() => store!.db.prepare('DELETE FROM daily_study_logs').run()).toThrow(/append-only/);
});
