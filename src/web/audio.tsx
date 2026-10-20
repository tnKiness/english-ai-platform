import { useEffect, useRef, useState } from 'react';
import { get, post, requestId } from './api.js';
import type { AudioWorkflow } from '../application/learning/audio-workflow.js';

type View = ReturnType<AudioWorkflow['view']>;
export function AudioScreen() {
  const [view, setView] = useState<View | null>(null);
  const [sessions, setSessions] = useState<{ attempt_id: string }[]>([]);
  const [text, setText] = useState('');
  const [recordingId, setRecordingId] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [pendingAudio, setPendingAudio] = useState<{ blob: Blob; key: string } | null>(null);
  const [transcriptKey, setTranscriptKey] = useState(requestId);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const mounted = useRef(true);
  useEffect(() => () => {
    mounted.current = false;
    if (recorder.current?.state === 'recording') recorder.current.stop();
    stream.current?.getTracks().forEach((t) => t.stop());
  }, []);
  useEffect(() => { void get<{ attempt_id: string }[]>('/api/learning/audio').then(setSessions).catch((e: unknown) => setError(String(e))); }, [view?.attempt_id]);
  const accept = (v: View) => {
    setView(v); setText(v.draft); setDirty(false);
    setRecordingId(v.recordings.at(-1)?.recording_id ?? '');
  };
  const run = (fn: () => Promise<void>) => {
    setBusy(true); setError('');
    void fn().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e))).finally(() => setBusy(false));
  };
  useEffect(() => {
    if (!view || !dirty) return;
    const timer = setTimeout(() => {
      void post(`/api/learning/audio/${view.attempt_id}/autosave`, { content: text })
        .then(() => setStatus('Đã lưu nháp')).catch(() => setStatus('Chưa lưu được'));
    }, 500);
    return () => clearTimeout(timer);
  }, [text, dirty, view]);
  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('Trình duyệt chưa hỗ trợ thu âm.');
    const mime = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported(t));
    if (!mime) throw new Error('Chưa hỗ trợ định dạng thu âm của trình duyệt này.');
    const tracks = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (!mounted.current) { tracks.getTracks().forEach((t) => t.stop()); return; }
    stream.current = tracks;
    try {
      const rec = new MediaRecorder(tracks, { mimeType: mime });
      recorder.current = rec;
      const chunks: Blob[] = [];
      let size = 0;
      let failed = false;
      rec.ondataavailable = (event) => {
        size += event.data.size;
        if (size > 8 * 1024 * 1024) {
          failed = true;
          setError('Bản thu vượt giới hạn 8 MiB. Hãy thu một đoạn ngắn hơn.');
          if (rec.state === 'recording') rec.stop();
        } else chunks.push(event.data);
      };
      rec.onerror = () => { failed = true; setError('Thu âm thất bại.'); tracks.getTracks().forEach((t) => t.stop()); setRecording(false); };
      rec.onstop = () => {
        tracks.getTracks().forEach((t) => t.stop());
        if (!mounted.current) return;
        setRecording(false);
        if (!failed) setPendingAudio({ blob: new Blob(chunks, { type: mime.split(';')[0] }), key: requestId() });
      };
      rec.start(1000); setRecording(true);
    } catch (e) { tracks.getTracks().forEach((t) => t.stop()); throw e; }
  };
  return <article className="card">
    <h3>Speaking — mẫu thu/phát audio cục bộ</h3>
    <p>Describe a quiet place you would like to create in your neighbourhood. (Synthetic)</p>
    {error && <p role="alert">{error}</p>}
    {!view ? <>
      <button disabled={busy} onClick={() => run(async () => accept(await post<View>('/api/learning/audio', { request_key: requestId() })))}>Bắt đầu mẫu audio</button>
      {sessions.map((s) => <button disabled={busy} key={s.attempt_id} onClick={() => run(async () => accept(await get<View>(`/api/learning/audio/${s.attempt_id}`)))}>Tiếp tục mẫu {s.attempt_id.slice(0, 8)}</button>)}
    </> : <>
      <p>{view.limitation}</p>
      <p>Bản máy nhận diện (ASR): chưa có công cụ. Văn bản bên dưới do bạn tự nhập, chưa đối chiếu audio.</p>
      <button disabled={busy || recording || !!pendingAudio} onClick={() => run(startRecording)}>Thu âm</button>
      <button disabled={!recording} onClick={() => recorder.current?.stop()}>Dừng thu</button>
      {pendingAudio && <button disabled={busy} onClick={() => run(async () => {
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error('Không đọc được bản thu'));
          reader.onload = () => resolve(String(reader.result).split(',')[1]!);
          reader.readAsDataURL(pendingAudio.blob);
        });
        accept(await post<View>(`/api/learning/audio/${view.attempt_id}/recordings`, { request_key: pendingAudio.key, data, media_type: pendingAudio.blob.type }));
        setPendingAudio(null); setStatus('Đã lưu audio gốc vào kho cục bộ');
      })}>Lưu bản thu {Math.ceil(pendingAudio.blob.size / 1024)} KiB (có thể thử lại khi lỗi)</button>}
      {view.recordings.map((r) => <div key={r.recording_id}>
        <p>{r.kind === 'original' ? 'Audio gốc' : 'Bản thu lại'} · {r.bytes} bytes · SHA-256 {r.sha256.slice(0, 12)}…</p>
        <audio controls preload="none" src={`/api/learning/audio/${view.attempt_id}/recordings/${r.recording_id}`} />
      </div>)}
      <label>Bản thu được chép lời <select value={recordingId} onChange={(e) => { setRecordingId(e.target.value); setTranscriptKey(requestId()); }}>
        {view.recordings.map((r, i) => <option key={r.recording_id} value={r.recording_id}>Bản {i + 1} — {r.kind}</option>)}
      </select></label>
      <label>Transcript do người học nhập/chỉnh <textarea value={text} maxLength={20_000} onChange={(e) => { setText(e.target.value); setDirty(true); setTranscriptKey(requestId()); }} /></label>
      <button disabled={busy || !recordingId || !text.trim()} onClick={() => run(async () => accept(await post<View>(`/api/learning/audio/${view.attempt_id}/transcripts`, { request_key: transcriptKey, recording_id: recordingId, content: text })))}>Lưu phiên bản văn bản riêng</button>
      {view.transcripts.map((t) => <details key={t.transcript_id}><summary>Văn bản người học — phiên bản {t.revision + 1}</summary>
        <p>{t.content}</p>
        <button disabled={busy} onClick={() => run(async () => {
          const r = await post<{ limitation: string; processing: string }>(`/api/learning/audio/${view.attempt_id}/review-text`, { transcript_id: t.transcript_id });
          setStatus(`Đánh giá mẫu synthetic: ${r.processing}. ${r.limitation}`);
        })}>Kiểm tra luồng đánh giá văn bản (synthetic)</button>
      </details>)}
      <p aria-live="polite">{status}</p>
    </>}
  </article>;
}
