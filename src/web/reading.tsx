import { useEffect, useState } from 'react';
import { get, post, requestId } from './api.js';
import type { ReadingWorkflow } from '../application/learning/reading-workflow.js';
import type { ReadingAnswer } from '../domain/learning/reading.js';

type View = ReturnType<ReadingWorkflow['view']>;
type Catalog = { items: { item_id: string; version: string; title: string }[]; attempts: { attempt_id: string; state: string }[] };
export function ReadingScreen() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [answers, setAnswers] = useState<ReadingAnswer[]>([]);
  const [mode, setMode] = useState('self_practice');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [submissionKey, setSubmissionKey] = useState(requestId);
  const accept = (v: View) => {
    if (!v.attempt_id) throw new Error('Không mở được bài Reading');
    setView(v);
    const draft = v.draft?.content ? JSON.parse(v.draft.content) as ReadingAnswer[] : [];
    setAnswers(v.task.questions.map((q) => draft.find((a) => a.question_id === q.question_id) ?? { question_id: q.question_id, answer: '', rationale: '' }));
    setDirty(false);
  };
  const run = (fn: () => Promise<void>) => {
    setBusy(true); setError('');
    void fn().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e))).finally(() => setBusy(false));
  };
  useEffect(() => { void get<Catalog>('/api/learning/reading').then(setCatalog).catch((e: unknown) => setError(String(e))); }, [view?.attempt_id]);
  useEffect(() => {
    if (!view || !dirty) return;
    const timer = setTimeout(() => {
      setSaved('Đang lưu…');
      void post(`/api/learning/reading/${view.attempt_id}/autosave`, { content: JSON.stringify(answers) })
        .then(() => setSaved('Đã lưu')).catch(() => setSaved('Chưa lưu được'));
    }, 500);
    return () => clearTimeout(timer);
  }, [answers, dirty, view]);
  return <article className="card">
    <h3>Reading — bài synthetic đã qua QC</h3>
    <p>Không quy đổi kết quả thành Band. Bản lý giải có thể viết bằng tiếng Việt.</p>
    {error && <p role="alert">{error}</p>}
    {!view ? <>
      <label>Chế độ <select value={mode} onChange={(e) => setMode(e.target.value)}>
        <option value="guided">Có hướng dẫn</option><option value="self_practice">Tự luyện</option><option value="exam">Thi thử</option>
      </select></label>
      {catalog?.items.length === 0 && <p>Chưa có bài Reading được phát hành.</p>}
      {catalog?.items.map((i) => <button disabled={busy} key={`${i.item_id}:${i.version}`} onClick={() => run(async () => accept(await post<View>('/api/learning/reading', { ...i, title: undefined, mode, request_key: requestId() }))) }>{i.title}</button>)}
      {catalog?.attempts.map((a) => <button disabled={busy} key={a.attempt_id} onClick={() => run(async () => accept(await get<View>(`/api/learning/reading/${a.attempt_id}`)))}>Tiếp tục Reading ({a.state})</button>)}
    </> : <>
      <p>{view.task.stimulus_text}</p><p>{view.task.prompt}</p>
      {view.task.questions.map((q, i) => <fieldset key={q.question_id}><legend>{q.prompt}</legend>
        <label>Đáp án <input value={answers[i]?.answer ?? ''} onChange={(e) => { setAnswers(answers.map((a, j) => j === i ? { ...a, answer: e.target.value } : a)); setDirty(true); setSubmissionKey(requestId()); }} /></label>
        <p>Các lựa chọn: {q.options.join(' · ')}</p>
        <label>Lý giải / thông tin còn thiếu (không bắt buộc lúc nộp bài gốc)
          <textarea value={answers[i]?.rationale ?? ''} onChange={(e) => { setAnswers(answers.map((a, j) => j === i ? { ...a, rationale: e.target.value } : a)); setDirty(true); setSubmissionKey(requestId()); }} />
        </label>
      </fieldset>)}
      <p aria-live="polite">{saved}</p>
      <button disabled={busy} onClick={() => run(async () => accept(await post<View>(`/api/learning/reading/${view.attempt_id}/submit`, { request_key: submissionKey, answers })))}>{view.submissions.length ? 'Gửi bản sửa' : 'Nộp bài'}</button>
      {view.submissions.at(-1)?.results.map((r) => <p key={r.question_id}>{r.question_id}: {r.item_result}</p>)}
      <p>{view.conclusion}</p>
      {view.hints.map((h) => <p key={h}>{h}</p>)}
      {view.explanation?.map((e) => <p key={e.question_id}>{e.question_id}: {e.accepted.join(' / ')} — {e.explanation}</p>)}
      {!!view.submissions.length && view.mode !== 'exam' && view.unlocked_level < 3 && <button disabled={busy} onClick={() => run(async () => {
        await post(`/api/learning/reading/${view.attempt_id}/autosave`, { content: JSON.stringify(answers) });
        accept(await post<View>(`/api/learning/reading/${view.attempt_id}/hints`, { level: view.unlocked_level + 1 }));
      })}>Mở nấc {view.unlocked_level + 1}</button>}
      <button disabled={busy} onClick={() => run(async () => {
        await post(`/api/learning/reading/${view.attempt_id}/autosave`, { content: JSON.stringify(answers) });
        setView(null);
      })}>Lưu và về danh sách Reading</button>
    </>}
  </article>;
}
