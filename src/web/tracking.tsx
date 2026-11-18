// P5-1 Daily tracking in the browser (06A §9, 06 §2.A.3–4; E-25): activity heartbeats, day declarations, in-app
// reminders and the 7-day overview. Only activity metadata leaves this file: never draft text, answers or audio.
import { useCallback, useEffect, useState } from 'react';
import { get, post, requestId } from './api.js';

type Activity = 'writing' | 'reading' | 'listening' | 'speaking' | 'thinking' | 'review';
type Surface = 'workspace' | 'reading' | 'audio' | 'today' | 'progress';
interface Beat { client_event_id: string; activity: Activity; surface: Surface; attempt_id: string | null; span_seconds: number; occurred_at: string; offline?: boolean }

const BEAT_MS = 60_000;
const QUEUE_KEY = 'study-activity-queue';
const MAX_QUEUE = 2000;

// Unsent beats survive a lost connection or a closed tab; storage may be unavailable (private window), then they are dropped.
const readQueue = (): Beat[] => { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') as Beat[]; } catch { return []; } };
const writeQueue = (q: Beat[]) => { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-MAX_QUEUE))); } catch { /* storage unavailable */ } };

async function flush(extra: Beat[]) {
  const queued = readQueue();
  const all = [...queued, ...extra];
  if (!all.length) return;
  try {
    for (let i = 0; i < all.length; i += 200) await post('/api/learning/tracking/activity', { events: all.slice(i, i + 200) });
    writeQueue([]);
  } catch {
    // Not sent now: kept and marked offline, so the day is reported honestly as partly recorded while offline.
    writeQueue(all.map((b) => ({ ...b, offline: true })));
  }
}

/**
 * Sends one heartbeat per minute while this learning surface is visible, or while audio plays on it. Reading,
 * listening and thinking count through the open surface, not through keystrokes (06A §9.1).
 */
export function useStudyHeartbeat(surface: Surface, activity: Activity, attemptId: string | null = null) {
  useEffect(() => {
    void flush([]);
    const tick = () => {
      const audioPlaying = [...document.querySelectorAll('audio')].some((a) => !a.paused);
      if (document.visibilityState !== 'visible' && !audioPlaying) return;
      void flush([{ client_event_id: requestId(), activity: audioPlaying ? 'listening' : activity, surface, attempt_id: attemptId,
        span_seconds: BEAT_MS / 1000, occurred_at: new Date().toISOString() }]);
    };
    const timer = setInterval(tick, BEAT_MS);
    return () => clearInterval(timer);
  }, [surface, activity, attemptId]);
}

interface DayView {
  study_day: string; status: 'planned_rest' | 'offline' | 'studied' | 'missing_telemetry' | 'today_no_data_yet' | 'before_tracking';
  time: { recorded_minutes: number; by_activity: Partial<Record<Activity, number>>; self_reported_offline_minutes: number | null; budget_minutes: number | null };
  loop: { attempts_started: number; original_submissions: number; repair_submissions: number; scheduled_tasks_completed: number };
  evidence: { observations: Partial<Record<'met' | 'not_met' | 'inconclusive', number>>; error_hypotheses_updated: Record<string, number> };
}
interface Overview {
  as_of: string; today: string; goal: { daily_minutes: number; weekly_minutes: number } | null; days: DayView[];
  summary: { recorded_minutes: number; self_reported_offline_minutes: number; days_by_status: Record<string, number> };
  drift: { overdue_tasks: number; oldest_overdue_due_at: string | null; upcoming_tasks: number; plan_version: number | null };
  policy: { note: string };
}
interface Notice { notification_id: string; study_day: string; payload: { title: string; body: string } }

export const STATUS_LABELS: Record<DayView['status'], string> = {
  planned_rest: 'Nghỉ có kế hoạch', offline: 'Học ngoài ứng dụng / offline', studied: 'Có ghi nhận học',
  missing_telemetry: 'Thiếu dữ liệu quan sát', today_no_data_yet: 'Hôm nay: chưa có dữ liệu', before_tracking: 'Trước khi bắt đầu theo dõi',
};
const ACTIVITY_LABELS: Record<Activity, string> = { writing: 'viết', reading: 'đọc', listening: 'nghe', speaking: 'nói', thinking: 'suy nghĩ', review: 'ôn' };

/** "Học hôm nay": reminders, planned rest, studied outside the app, today's time budget (06 §2.A.3). */
export function DayPanel({ onChanged }: { onChanged?: () => void }) {
  const [day, setDay] = useState<DayView | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [offlineMinutes, setOfflineMinutes] = useState('');
  const [budget, setBudget] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    get<Overview>('/api/learning/tracking?days=1').then((o) => { setDay(o.days[0] ?? null); setBudget(String(o.days[0]?.time.budget_minutes ?? '')); })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    get<{ notifications: Notice[] }>('/api/learning/notifications').then((r) => setNotices(r.notifications)).catch(() => undefined);
  }, []);
  useEffect(load, [load]);

  const declare = async (kind: 'planned_rest' | 'offline' | 'budget', active: boolean, minutes: number | null = null) => {
    if (!day) return;
    setError(null);
    try {
      setDay(await post<DayView>('/api/learning/tracking/day', { request_key: requestId(), study_day: day.study_day, kind, active, minutes }));
      onChanged?.();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const dismiss = async (id: string) => {
    try { await post(`/api/learning/notifications/${encodeURIComponent(id)}/dismiss`); setNotices((n) => n.filter((x) => x.notification_id !== id)); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  return <article className="card">
    <h3>Ngày học hôm nay {day && <span className="mono">({day.study_day}, giờ Việt Nam)</span>}</h3>
    {notices.map((n) => <p key={n.notification_id} className="notice"><b>{n.payload.title}:</b> {n.payload.body}{' '}
      <button onClick={() => void dismiss(n.notification_id)}>Đã xem</button></p>)}
    {error && <p role="alert" className="error">{error}</p>}
    {day && <>
      <p>Trạng thái: <b>{STATUS_LABELS[day.status]}</b> · Đã ghi nhận {day.time.recorded_minutes} phút
        {day.time.budget_minutes !== null && <> / quỹ {day.time.budget_minutes} phút</>}
        {day.time.self_reported_offline_minutes !== null && <> · tự khai ngoài ứng dụng {day.time.self_reported_offline_minutes} phút</>}</p>
      <div className="actions">
        {day.status === 'planned_rest'
          ? <button onClick={() => void declare('planned_rest', false)}>Bỏ đánh dấu nghỉ</button>
          : <button onClick={() => void declare('planned_rest', true)}>Hôm nay nghỉ có kế hoạch</button>}
        <label>Quỹ thời gian hôm nay (phút):{' '}
          <input type="number" min="1" max="480" value={budget} onChange={(e) => setBudget(e.target.value)} /></label>
        <button onClick={() => void declare('budget', true, Number(budget))}>Lưu quỹ hôm nay</button>
        <label>Đã học ngoài ứng dụng (phút, không bắt buộc):{' '}
          <input type="number" min="0" max="480" value={offlineMinutes} onChange={(e) => setOfflineMinutes(e.target.value)} /></label>
        <button onClick={() => void declare('offline', true, offlineMinutes === '' ? null : Number(offlineMinutes))}>Ghi nhận học ngoài ứng dụng</button>
      </div>
      <p className="mono">Thiếu giờ hôm nay không bị cộng dồn sang ngày mai và không làm giảm hồ sơ năng lực.</p>
    </>}
  </article>;
}

/** "Tiến độ": the last 7 study days with the four tracking groups (06A §9.1), each labelled with its as_of time. */
export function TrackingPanel() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { get<Overview>('/api/learning/tracking?days=7').then(setData).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e))); }, []);
  if (error) return <article className="card"><p role="alert" className="error">{error}</p></article>;
  if (!data) return <article className="card"><p>Đang tải theo dõi hằng ngày…</p></article>;
  const outcomes = (d: DayView) => ['met', 'not_met', 'inconclusive'].map((k) => d.evidence.observations[k as 'met'] ?? 0).join(' / ');
  return <article className="card">
    <h3>Theo dõi 7 ngày (06A §9)</h3>
    <p className="mono">Số liệu tính lúc {new Date(data.as_of).toLocaleString('vi-VN', { hour12: false })} (giờ Việt Nam){data.goal ? ` · mục tiêu ${data.goal.daily_minutes} phút/ngày, ${data.goal.weekly_minutes} phút/tuần` : ''}</p>
    <table>
      <thead><tr><th>Ngày</th><th>Trạng thái</th><th>Thời gian (phút)</th><th>Vòng học: bắt đầu / nộp / sửa / nhiệm vụ xong</th><th>Nhận định: đạt / chưa đạt / chưa kết luận</th></tr></thead>
      <tbody>{data.days.map((d) => <tr key={d.study_day}>
        <td>{d.study_day}</td><td>{STATUS_LABELS[d.status]}</td>
        <td>{d.status === 'before_tracking' ? '—' : <>{d.time.recorded_minutes}{d.time.budget_minutes !== null ? ` / ${d.time.budget_minutes}` : ''}</>}
          {Object.entries(d.time.by_activity).length > 0 && <span className="mono"> ({Object.entries(d.time.by_activity).map(([a, m]) => `${ACTIVITY_LABELS[a as Activity]} ${m}`).join(', ')})</span>}
          {d.time.self_reported_offline_minutes !== null && <span className="mono"> + tự khai {d.time.self_reported_offline_minutes}</span>}</td>
        <td>{d.loop.attempts_started} / {d.loop.original_submissions} / {d.loop.repair_submissions} / {d.loop.scheduled_tasks_completed}</td>
        <td>{outcomes(d)}</td>
      </tr>)}</tbody>
    </table>
    <p>Tổng 7 ngày: {data.summary.recorded_minutes} phút ghi nhận{data.summary.self_reported_offline_minutes ? ` + ${data.summary.self_reported_offline_minutes} phút tự khai` : ''}.
      {' '}Độ lệch lộ trình: {data.drift.overdue_tasks} nhiệm vụ đã đến hạn, {data.drift.upcoming_tasks} sắp tới{data.drift.plan_version !== null ? ` · lịch phiên bản ${data.drift.plan_version}` : ''}.</p>
    <p className="mono">{data.policy.note}</p>
  </article>;
}
