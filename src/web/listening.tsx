// E-54 (D-05 N1, E-44): Listening parts written by AI and voiced locally. The transcript and the key arrive only in the
// response to submission. Exam mode: the player offers one play and no seeking; practice: replay freely.
import { useEffect, useRef, useState } from 'react';
import { get, post, requestId } from './api.js';
import { useStudyHeartbeat } from './tracking.js';
import type { ListeningWorkflow, ListeningAnswer } from '../application/learning/listening-workflow.js';

type View = ReturnType<ListeningWorkflow['view']>;
type Catalog = ReturnType<ListeningWorkflow['catalog']>;

export function ListeningScreen() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [answers, setAnswers] = useState<ListeningAnswer[]>([]);
  const [mode, setMode] = useState<'self_practice' | 'exam'>('self_practice');
  const [played, setPlayed] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  useStudyHeartbeat('audio', 'listening', view?.attempt_id ?? null); // surface 'audio' (0010 CHECK); activity listening

  useEffect(() => { void get<Catalog>('/api/learning/listening').then(setCatalog).catch((e: unknown) => setError(String(e))); }, [view?.attempt_id, view?.submitted]);
  const open = (v: View) => { setView(v); setPlayed(false); setAnswers(v.questions.map((q) => ({ question_id: q.question_id, answer: '' }))); };
  const run = (fn: () => Promise<void>) => { setBusy(true); setError(''); void fn().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e))).finally(() => setBusy(false)); };

  if (!catalog) return <section><p className="muted">Đang tải…</p>{error && <p className="error">{error}</p>}</section>;
  if (!view) {
    if (catalog.items.length === 0) return <p className="muted">Chưa có Part Listening nào được phát hành.</p>;
    return <section>
      <div className="actions" style={{ justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>Kho đề Listening</h3>
        <label className="muted">Chế độ <select value={mode} onChange={(e) => setMode(e.target.value as 'self_practice' | 'exam')}><option value="self_practice">Tự luyện (nghe lại được)</option><option value="exam">Mô phỏng thi (nghe một lần)</option></select></label>
      </div>
      <p className="muted">Transcript và đáp án chỉ hiện sau khi nộp. Kết quả là số câu đúng, chưa kết luận năng lực.</p>
      <ul className="item-list">{catalog.items.map((i) => <li key={i.item_id}>
        <span><b>{i.title}</b>{i.seen && <span className="chip">đã làm</span>}<br /><span className="meta">{i.questions} câu · khoảng {i.audio_minutes} phút audio</span></span>
        <button className="primary" disabled={busy} onClick={() => run(async () => open(await post<View>('/api/learning/listening', { item_id: i.item_id, version: i.version, mode, request_key: requestId() })))}>Làm Part này</button>
      </li>)}</ul>
      {error && <p className="error">{error}</p>}
    </section>;
  }

  const exam = view.mode === 'exam';
  const submitted = view.submitted;
  return <section>
    <div className="actions" style={{ justifyContent: 'space-between' }}><h3 style={{ margin: 0 }}>{view.title}</h3><button onClick={() => setView(null)}>Đóng</button></div>
    <p>{view.instructions}</p>
    <audio ref={audio} src={view.audio_url} preload="auto" controls={!exam || submitted}
      onEnded={() => setPlayed(true)} />
    {exam && !submitted && <div className="actions">
      <button disabled={played} onClick={() => { void audio.current?.play(); setPlayed(true); }}>{played ? 'Đã nghe (chế độ thi chỉ nghe một lần)' : 'Bắt đầu nghe'}</button>
    </div>}
    <ol>{view.questions.map((q, i) => {
      const result = submitted ? view.results.find((r) => r.question_id === q.question_id) : undefined;
      const key = submitted ? view.review.key.find((k) => k.question_id === q.question_id) : undefined;
      return <li key={q.question_id}>
        <p>{q.prompt}</p>
        {q.response_type === 'choice'
          ? q.options.map((o) => <label key={o} style={{ display: 'block' }}><input type="radio" name={q.question_id} disabled={submitted} checked={answers[i]?.answer === o}
              onChange={() => setAnswers(answers.map((a, k) => (k === i ? { ...a, answer: o } : a)))} /> {o}</label>)
          : <input disabled={submitted} value={answers[i]?.answer ?? ''} onChange={(e) => setAnswers(answers.map((a, k) => (k === i ? { ...a, answer: e.target.value } : a)))} />}
        {result && <p className={result.item_result === 'correct' ? 'PASS' : 'FAIL'}>{result.item_result === 'correct' ? 'Đúng' : result.item_result === 'unanswered' ? 'Chưa trả lời' : 'Sai'} — đáp án: {key?.accepted.join(' / ')} · {key?.evidence}</p>}
      </li>;
    })}</ol>
    {!submitted && <button className="primary" disabled={busy} onClick={() => run(async () => { const v = await post<View>(`/api/learning/listening/${encodeURIComponent(view.attempt_id)}/submit`, { request_key: requestId(), answers }); setView(v); })}>Nộp bài</button>}
    {submitted && <>
      <h3>Kết quả: {view.score.correct}/{view.score.total}</h3>
      <p className="mono">{view.conclusion}</p>
      <details><summary>Transcript</summary><pre style={{ whiteSpace: 'pre-wrap' }}>{view.review.transcript}</pre></details>
    </>}
    {error && <p className="error">{error}</p>}
  </section>;
}
