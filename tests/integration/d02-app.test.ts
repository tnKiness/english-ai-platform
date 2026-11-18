// D-02 v1 (E-33) wired into the app: catch-up proposals over HTTP (F), integrated Bước 9 check (C2) and the
// direct check after repeated absent opportunities (C4). Synthetic data only.
import { afterEach, expect, it } from 'vitest';
import { SYNTHETIC_COMPETENCY_ID, SYNTHETIC_ITEM_9_ID, SYNTHETIC_WRITING_RUBRIC_ID, LearningWorkflowService } from '../../src/application/learning/writing-workflow.js';
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
const DAY = 86_400_000;

async function setup(): Promise<{ app: ReturnType<typeof createApp>; store: Store; clock: Clock; s: { cookie: string; csrf: string } }> {
  const t = tempDir('ielts-d02-');
  cleanups.push(t.cleanup);
  const c = clock('2026-12-01T03:00:00.000Z');
  store = await openStore(dataPaths(t.dir), { now: c.now });
  app = createApp({ store, gatewayStatus: async () => [] });
  const res = await app.inject({ url: '/api/session', headers: { host: HOST } });
  return { app, store, clock: c, s: { cookie: String(res.headers['set-cookie']).split(';')[0]!, csrf: res.json().csrf_token as string } };
}
const get = (a: ReturnType<typeof createApp>, url: string, s: { cookie: string }) => a.inject({ url, headers: { host: HOST, cookie: s.cookie } });
const post = (a: ReturnType<typeof createApp>, url: string, s: { cookie: string; csrf: string }, payload: unknown) =>
  a.inject({ method: 'POST', url, payload: payload as object, headers: { host: HOST, origin: ORIGIN, cookie: s.cookie, 'x-csrf-token': s.csrf } });

function addTask(st: Store, id: string, purpose: '7B' | '9' | 'practice', dueMs: number, minutes: number) {
  const at = st.now().toISOString();
  st.db.prepare(`INSERT INTO scheduled_tasks (task_id, origin_attempt_id, assigned_attempt_id, competency_id, item_id, item_version, rubric_id, rubric_version, purpose, mode,
    estimated_minutes, meets_min_scope, due_at, state, synthetic, created_at, updated_at) VALUES (?, NULL, NULL, ?, ?, 'v1', ?, 'v1', ?, 'self_practice', ?, 1, ?, 'PENDING', 1, ?, ?)`)
    .run(id, SYNTHETIC_COMPETENCY_ID, SYNTHETIC_ITEM_9_ID, SYNTHETIC_WRITING_RUBRIC_ID, purpose, minutes, new Date(dueMs).toISOString(), at, at);
}

it('F: proposes a catch-up plan once a day, applies it only on accept (CAS), and "keep schedule" changes nothing', async () => {
  const { app: a, store: st, clock: clk, s } = await setup();
  expect((await post(a, '/api/learning/goals', s, { target_band_overall: 7, target_listening: 7, target_reading: 7, target_writing: 7, target_speaking: 6.5,
    exam_type: 'academic', exam_date: null, daily_minutes: 30, weekly_minutes: 210 })).statusCode).toBe(200);
  await get(a, '/api/learning/today', s); // seeds the synthetic catalog (one lesson task due now)
  const now = st.now().getTime();
  addTask(st, 'v-old', '7B', now - 3 * DAY, 30);
  addTask(st, 'v-soon', '9', now + DAY, 30);
  addTask(st, 'p-soon', 'practice', now + 2 * DAY, 30);

  const r1 = (await get(a, '/api/learning/replan', s)).json();
  expect(r1.policy_status).toBe('APPROVED');
  expect(r1.proposal.reasons[0]).toMatch(/^F1/);
  const placements = r1.proposal.changes.placements as { task_id: string; to_day: string }[];
  // ≤ 1 verification task per day and never more minutes than the 30-minute daily budget.
  const perDay = new Map<string, string[]>();
  for (const x of placements) perDay.set(x.to_day, [...(perDay.get(x.to_day) ?? []), x.task_id]);
  for (const ids of perDay.values()) expect(ids.filter((i) => i.startsWith('v-')).length).toBeLessThanOrEqual(1);
  const dueBefore = (st.db.prepare("SELECT due_at FROM scheduled_tasks WHERE task_id = 'v-old'").get() as { due_at: string }).due_at;

  // Same open proposal is returned, not a second one.
  expect((await get(a, '/api/learning/replan', s)).json().proposal.proposal_id).toBe(r1.proposal.proposal_id);
  // Keep schedule: nothing moves, and no new proposal the same day.
  expect((await post(a, `/api/learning/replan/${r1.proposal.proposal_id}/reject`, s, {})).json()).toEqual({ state: 'REJECTED' });
  expect((st.db.prepare("SELECT due_at FROM scheduled_tasks WHERE task_id = 'v-old'").get() as { due_at: string }).due_at).toBe(dueBefore);
  const sameDay = (await get(a, '/api/learning/replan', s)).json();
  expect(sameDay.proposal).toBeNull();

  // Next day: a new proposal; accept applies it under the plan version it was built on.
  clk.advance(DAY);
  const r2 = (await get(a, '/api/learning/replan', s)).json();
  expect(r2.proposal).not.toBeNull();
  expect((await post(a, `/api/learning/replan/${r2.proposal.proposal_id}/accept`, s, {})).json()).toEqual({ state: 'ACCEPTED' });
  const moved = r2.proposal.changes.placements.find((x: { task_id: string }) => x.task_id === 'v-old');
  expect((st.db.prepare("SELECT due_at FROM scheduled_tasks WHERE task_id = 'v-old'").get() as { due_at: string }).due_at).toBe(new Date(Date.parse(`${moved.to_day}T00:00:00+07:00`)).toISOString());
  // Accepting twice is a no-op; unknown ids are 404.
  expect((await post(a, `/api/learning/replan/${r2.proposal.proposal_id}/accept`, s, {})).json()).toEqual({ state: 'ACCEPTED' });
  expect((await post(a, '/api/learning/replan/nope/accept', s, {})).statusCode).toBe(404);
});

it('F4: an unanswered proposal expires after 48 hours', async () => {
  const { app: a, store: st, clock: clk, s } = await setup();
  await post(a, '/api/learning/goals', s, { target_band_overall: 7, target_listening: 7, target_reading: 7, target_writing: 7, target_speaking: 7, exam_type: 'academic', exam_date: null, daily_minutes: 30, weekly_minutes: 210 });
  await get(a, '/api/learning/today', s);
  addTask(st, 'v-old', '7B', st.now().getTime() - 3 * DAY, 30);
  addTask(st, 'v-old2', '9', st.now().getTime() - 3 * DAY, 30);
  addTask(st, 'p-soon', 'practice', st.now().getTime() + DAY, 30);
  const r = (await get(a, '/api/learning/replan', s)).json();
  expect(r.proposal.state).toBe('PROPOSED');
  clk.advance(49 * 3_600_000);
  await get(a, '/api/learning/replan', s);
  expect((st.db.prepare('SELECT state FROM replan_proposals WHERE proposal_id = ?').get(r.proposal.proposal_id) as { state: string }).state).toBe('EXPIRED');
  expect((await post(a, `/api/learning/replan/${r.proposal.proposal_id}/accept`, s, {})).json()).toEqual({ state: 'EXPIRED' });
});

it('C4: a Bước 9 check waiting too long for an opportunity becomes a direct check with a situational constraint', async () => {
  const { app: a, store: st, clock: clk, s } = await setup();
  await get(a, '/api/learning/today', s);
  addTask(st, 'wait-9', '9', st.now().getTime() - DAY, 30);
  st.db.prepare("UPDATE scheduled_tasks SET state = 'AWAITING_OPPORTUNITY', absent_count = 1 WHERE task_id = 'wait-9'").run();
  await get(a, '/api/learning/today', s);
  expect((st.db.prepare("SELECT state FROM scheduled_tasks WHERE task_id = 'wait-9'").get() as { state: string }).state).toBe('AWAITING_OPPORTUNITY');
  clk.advance(7 * DAY);
  expect((await get(a, '/api/learning/today', s)).statusCode).toBe(200);
  expect((st.db.prepare("SELECT state FROM scheduled_tasks WHERE task_id = 'wait-9'").get() as { state: string }).state).toBe('CANCELLED');
  const direct = st.db.prepare("SELECT purpose, constraint_kind, schedule_reason, policy_version FROM scheduled_tasks WHERE schedule_reason = 'C4_DIRECT_CHECK'").get();
  expect(direct).toEqual({ purpose: '9', constraint_kind: 'semantic', schedule_reason: 'C4_DIRECT_CHECK', policy_version: 'v1' });
});

it('without an approved policy file nothing is concluded or scheduled automatically', async () => {
  const t = tempDir('ielts-d02-none-');
  cleanups.push(t.cleanup);
  store = await openStore(dataPaths(t.dir), { now: clock().now });
  const wf = new LearningWorkflowService(store, null);
  wf.ensureSyntheticWritingCatalog();
  const progress = wf.progressView();
  expect(progress.policy_status).toBe('POLICY_NOT_APPROVED');
  expect(progress.competencies[0]!.conclusion).toMatchObject({ status: 'inconclusive' });
});

it('C2: a composite practice task done while Bước 9 is due counts as the maintenance check and extends the interval', async () => {
  const { app: a, store: st, s } = await setup();
  await get(a, '/api/learning/today', s);
  addTask(st, 'due-9', '9', st.now().getTime() - 3_600_000, 30);
  st.db.prepare("UPDATE scheduled_tasks SET step9_index = 0, interval_days = 3, schedule_reason = 'C2_STEP9_INTERVAL' WHERE task_id = 'due-9'").run();
  const started = (await post(a, '/api/learning/attempts', s, { request_key: 'c2-start', item_id: 'syn-writing-task2-lesson', item_version: 'v1', mode: 'exam', purpose: 'practice' })).json();
  expect((await post(a, `/api/learning/attempts/${started.attempt.attempt_id}/submit`, s, { request_key: 'c2-sub', content: 'While archives help, libraries stay essential. [SYNTHETIC_MET]' })).statusCode).toBe(200);
  expect(st.db.prepare("SELECT state, assigned_attempt_id FROM scheduled_tasks WHERE task_id = 'due-9'").get()).toEqual({ state: 'COMPLETED', assigned_attempt_id: started.attempt.attempt_id });
  expect(st.db.prepare("SELECT purpose, interval_days, step9_index FROM scheduled_tasks WHERE state = 'PENDING' AND purpose = '9'").get()).toEqual({ purpose: '9', interval_days: 7, step9_index: 1 });
});
