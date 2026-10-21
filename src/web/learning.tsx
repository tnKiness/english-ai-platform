// Giao diện học tập P3 (06 §2.1–2.5): Mục tiêu ban đầu, Học hôm nay, Workspace làm bài (3 chế độ + autosave thật +
// gợi mở từng nấc + bổ sung kiến thức + 7A sạch), Tiến độ & Hồ sơ năng lực (4 thành phần, không bịa số, nhãn synthetic,
// D-02 "chưa đủ kết luận") và Cài đặt.
import { useCallback, useEffect, useState } from 'react';
import { get, post, requestId } from './api.js';

type Mode = 'guided' | 'self_practice' | 'exam';
type Purpose = 'lesson' | 'practice' | '7A' | '7B' | '9';

interface LearnerGoal {
  goal_id: string;
  target_band_overall: number;
  target_listening: number;
  target_reading: number;
  target_writing: number;
  target_speaking: number;
  exam_type: 'academic' | 'general_training';
  exam_date: string | null;
  daily_minutes: number;
  weekly_minutes: number;
  updated_at: string;
}

interface RecommendedTask {
  task_id: string;
  title: string;
  item_id: string;
  item_version: string;
  rubric_id: string;
  rubric_version: string;
  competency_id: string;
  purpose: Purpose;
  mode: Mode;
  estimated_minutes: number;
  due_at: string;
  state: string;
  reason: string;
  synthetic: boolean;
}

interface TodayData {
  now: string;
  goal: LearnerGoal | null;
  available_minutes: number;
  speaking_mode_note: string;
  in_progress: { attempt_id: string; title: string; mode: Mode; purpose: Purpose; state: string; updated_at: string }[];
  recommended_tasks: RecommendedTask[];
  deferred_or_ineligible: { task_id: string; reasons: string[] }[];
  upcoming_scheduled: { task_id: string; title: string; purpose: Purpose; mode: Mode; estimated_minutes: number; due_at: string; competency_id: string; synthetic: boolean }[];
}

interface WorkspaceData {
  attempt: {
    attempt_id: string;
    mode: Mode;
    purpose: Purpose;
    state: string;
    item: { id: string; version: string; hash: string };
    rubric: { id: string; version: string; hash: string };
    created_at: string;
  };
  task_prompt: {
    title: string;
    prompt: string;
    skill: 'writing' | 'speaking_text';
    genre: string;
    min_words: number;
    recommended_minutes: number;
    criteria_summary: string[];
    input_support: { outline_suggestions: string[]; vocabulary_frame: string[] } | null;
  };
  draft: { latest_text: string; snapshot_version: number | null; saved_at: string | null };
  submissions: {
    submission_id: string;
    revision: number;
    kind: 'original' | 'repair';
    repair_attempt_index: number;
    content: string;
    created_at: string;
    outcome: 'met' | 'not_met' | 'inconclusive' | null;
    synthetic: boolean;
  }[];
  loop: {
    origin_attempt_id: string | null;
    competency_id: string;
    step: number;
    unlocked_hint_level: 0 | 1 | 2 | 3;
    learner_choice: 'try_more' | 'direct_explanation' | null;
    clarification_count: number;
    repair_attempts: number;
    max_guided_repairs: number;
    offer_direct_explanation: boolean;
    concept_check_passed: boolean | null;
    step6_branch: string | null;
    step6_completed: boolean;
    step6_lesson: { title: string; explanation: string; contrast_examples: string[]; concept_question: string } | null;
    linked_7a_attempt_id: string | null;
    synthetic: boolean;
  } | null;
  diagnosis: {
    diagnosis_id: string;
    submission_id: string;
    job_id: string;
    synthetic: boolean;
    priority_issues: {
      issue_id: string;
      competency_id: string;
      location: string;
      symptom: string;
      hypothesis: string;
      hypothesis_status: string;
      expected_verification: string;
    }[];
    other_issues_count: number;
    other_issues_summary: string[];
    scaffold: {
      unlocked_level: 0 | 1 | 2 | 3;
      hints: { level: 1 | 2 | 3; content: string }[];
      concept_check_question: string | null;
    };
  } | null;
}

interface ProgressData {
  policy_status: string;
  band_reporting_enabled: boolean;
  disclaimer: string;
  competencies: {
    competency_id: string;
    title: string;
    skill: string;
    description: string;
    current_state_label: string;
    conclusion: { status: string; reason?: string };
    evidence_summary: {
      observation_count: number;
      independent_sources_met: number;
      independent_sources_not_met: number;
      sources_by_use: Record<string, number>;
    };
    excluded_observations_count: number;
    observations: {
      observation_id: string;
      evidence_source_id: string;
      submission_id: string;
      outcome: string;
      opportunity: string;
      support_impact: string;
      use: string;
      provider: string;
      synthetic: boolean;
    }[];
    error_hypotheses: {
      hypothesis_id: string;
      symptom: string;
      hypothesis: string;
      status: string;
      verification_note: string;
      synthetic: boolean;
      updated_at: string;
    }[];
    verification_schedule: {
      status: string;
      tasks: { task_id: string; purpose: Purpose; mode: Mode; due_at: string; state: string; is_due: boolean; synthetic: boolean }[];
    };
    all_synthetic: boolean;
  }[];
}

const MODE_LABELS: Record<Mode, string> = {
  guided: 'Có hướng dẫn (Guided)',
  self_practice: 'Tự luyện (Self-practice)',
  exam: 'Mô phỏng thi (Exam)',
};

const PURPOSE_LABELS: Record<Purpose, string> = {
  lesson: 'Bài học & thực hành',
  practice: 'Luyện tập',
  '7A': 'Bước 7A — Kiểm chứng chuyển giao (không gợi ý)',
  '7B': 'Bước 7B — Kiểm chứng tích hợp',
  '9': 'Bước 9 — Ôn tập giãn cách',
};

export function GoalForm({ initial, onSaved }: { initial: LearnerGoal | null; onSaved: (g: LearnerGoal) => void }) {
  const [overall, setOverall] = useState(initial?.target_band_overall ?? 7.0);
  const [listening, setListening] = useState(initial?.target_listening ?? 7.0);
  const [reading, setReading] = useState(initial?.target_reading ?? 7.0);
  const [writing, setWriting] = useState(initial?.target_writing ?? 6.5);
  const [speaking, setSpeaking] = useState(initial?.target_speaking ?? 6.5);
  const [examType, setExamType] = useState<'academic' | 'general_training'>(initial?.exam_type ?? 'academic');
  const [examDate, setExamDate] = useState(initial?.exam_date ?? '');
  const [daily, setDaily] = useState(initial?.daily_minutes ?? 45);
  const [weekly, setWeekly] = useState(initial?.weekly_minutes ?? 270);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = () => {
    setSaving(true);
    setError(null);
    post<{ goal: LearnerGoal }>('/api/learning/goals', {
      target_band_overall: Number(overall),
      target_listening: Number(listening),
      target_reading: Number(reading),
      target_writing: Number(writing),
      target_speaking: Number(speaking),
      exam_type: examType,
      exam_date: examDate.trim() ? examDate.trim() : null,
      daily_minutes: Number(daily),
      weekly_minutes: Number(weekly),
    }).then((r) => onSaved(r.goal)).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e))).finally(() => setSaving(false));
  };

  return <article className="card">
    <h3>Mục tiêu ban đầu &amp; Quỹ thời gian (01 Bước 1, 06 §2.1)</h3>
    <p>Thiết lập mục tiêu để bộ điều phối lọc nhiệm vụ phù hợp quỹ thời gian mỗi phiên. Không tạo bài thi xếp lớp giả lập khi chưa có gói đầu vào đã kiểm định.</p>
    {error && <p role="alert" className="error">{error}</p>}
    <div className="actions">
      <label>Hình thức thi:{' '}
        <select value={examType} onChange={(e) => setExamType(e.target.value as 'academic' | 'general_training')}>
          <option value="academic">IELTS Academic</option>
          <option value="general_training">IELTS General Training</option>
        </select>
      </label>
      <label>Band tổng mục tiêu: <input type="number" step="0.5" min="0" max="9" value={overall} onChange={(e) => setOverall(Number(e.target.value))} /></label>
      <label>Listening: <input type="number" step="0.5" min="0" max="9" value={listening} onChange={(e) => setListening(Number(e.target.value))} /></label>
      <label>Reading: <input type="number" step="0.5" min="0" max="9" value={reading} onChange={(e) => setReading(Number(e.target.value))} /></label>
      <label>Writing: <input type="number" step="0.5" min="0" max="9" value={writing} onChange={(e) => setWriting(Number(e.target.value))} /></label>
      <label>Speaking: <input type="number" step="0.5" min="0" max="9" value={speaking} onChange={(e) => setSpeaking(Number(e.target.value))} /></label>
      <label>Phút/ngày: <input type="number" min="5" max="480" value={daily} onChange={(e) => setDaily(Number(e.target.value))} /></label>
      <label>Phút/tuần: <input type="number" min="15" max="3360" value={weekly} onChange={(e) => setWeekly(Number(e.target.value))} /></label>
      <label>Ngày thi dự kiến: <input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} /></label>
    </div>
    <button disabled={saving} onClick={submit}>{saving ? 'Đang lưu…' : 'Lưu mục tiêu học tập'}</button>
  </article>;
}

export function WorkspaceScreen({ attemptId, onSwitchAttempt, onBack }: { attemptId: string; onSwitchAttempt: (id: string) => void; onBack: () => void }) {
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [text, setText] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conceptAnswer, setConceptAnswer] = useState('');
  const [inputSupportOpened, setInputSupportOpened] = useState<{ outline_suggestions: string[]; vocabulary_frame: string[] } | null>(null);

  const load = useCallback(() => {
    setError(null);
    get<WorkspaceData>(`/api/learning/attempts/${encodeURIComponent(attemptId)}`).then((d) => {
      setData(d);
      const latestSub = d.submissions.at(-1);
      setText(d.draft.latest_text || latestSub?.content || '');
      setSavedAt(d.draft.saved_at);
      setSaveState(d.draft.saved_at ? 'saved' : 'idle');
    }).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [attemptId]);

  useEffect(load, [load]);

  const triggerAutosave = (nextText: string) => {
    setSaveState('saving');
    setSaveError(null);
    post<{ saved_at: string; snapshot_version: number }>(`/api/learning/attempts/${encodeURIComponent(attemptId)}/autosave`, { content: nextText })
      .then((r) => {
        setSaveState('saved');
        setSavedAt(r.saved_at);
      })
      .catch((e: unknown) => {
        // Báo lỗi thật khi lưu thất bại, tuyệt đối không giả báo thành công (06 §2.3, §6.A.3).
        setSaveState('error');
        setSaveError(e instanceof Error ? e.message : String(e));
      });
  };

  if (error) return <section><p role="alert" className="error">{error}</p><button onClick={onBack}>Quay lại Học hôm nay</button></section>;
  if (!data) return <section><p>Đang tải Workspace làm bài…</p></section>;

  const isExam = data.attempt.mode === 'exam';
  const isVerification = data.attempt.purpose === '7A' || data.attempt.purpose === '7B' || data.attempt.purpose === '9';
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const hasOriginal = data.submissions.some((s) => s.kind === 'original');

  return <section className="workspace">
    <div className="actions">
      <button onClick={onBack}>← Quay lại Học hôm nay</button>
      <span className="tag active">{MODE_LABELS[data.attempt.mode]}</span>
      <span className="tag">{PURPOSE_LABELS[data.attempt.purpose]}</span>
      <span className="tag">Trạng thái: {data.attempt.state}</span>
      {data.loop?.synthetic && <span className="tag">synthetic (FakeAdapter)</span>}
    </div>

    <h2>{data.task_prompt.title}</h2>
    <p className="mono">
      Đề ghim: {data.attempt.item.id}@{data.attempt.item.version} ({data.attempt.item.hash.slice(0, 12)}…) ·
      Rubric ghim: {data.attempt.rubric.id}@{data.attempt.rubric.version} ·
      Tối thiểu {data.task_prompt.min_words} từ · Khuyến nghị {data.task_prompt.recommended_minutes} phút
    </p>

    <div className="workspace-grid">
      {/* Cột trái: Đề bài & tiêu chí (ẩn bảng hỗ trợ khi ở chế độ thi hoặc bài kiểm chứng 7A/7B/9) */}
      <article className="card">
        <h3>1. Đề bài ({data.task_prompt.genre})</h3>
        <p>{data.task_prompt.prompt}</p>
        {!isExam && data.task_prompt.criteria_summary.length > 0 && <>
          <h4>Tiêu chí trọng tâm</h4>
          <ul>{data.task_prompt.criteria_summary.map((c, idx) => <li key={idx}>{c}</li>)}</ul>
        </>}
        {data.attempt.mode === 'guided' && !isVerification && (
          <div>
            <button onClick={() => post<{ support: { outline_suggestions: string[]; vocabulary_frame: string[] } }>(
              `/api/learning/attempts/${encodeURIComponent(attemptId)}/input-support`,
              { request_key: requestId(), current_draft_text: text },
            ).then((r) => setInputSupportOpened(r.support)).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))}>
              Mở gợi ý dàn ý &amp; từ vựng đầu vào (ghi nhận hỗ trợ)
            </button>
            {inputSupportOpened && <div className="card">
              <p><b>Dàn ý gợi ý:</b></p>
              <ul>{inputSupportOpened.outline_suggestions.map((o, i) => <li key={i}>{o}</li>)}</ul>
              <p><b>Khung từ vựng:</b> {inputSupportOpened.vocabulary_frame.join(' · ')}</p>
            </div>}
          </div>
        )}
      </article>

      {/* Cột giữa: Khu làm bài, trạng thái autosave thật & lịch sử bản nộp */}
      <article className="card">
        <h3>2. Khu làm bài ({wordCount} từ)</h3>
        <textarea
          rows={10}
          style={{ width: '100%', fontFamily: 'inherit', padding: '8px', boxSizing: 'border-box' }}
          value={text}
          placeholder="Nhập bài viết của bạn tại đây… (Gợi ý kiểm thử synthetic: thêm [SYNTHETIC_NOT_MET] để giả lập bài cần sửa, hoặc [SYNTHETIC_MET] để giả lập bài đạt)"
          onChange={(e) => setText(e.target.value)}
        />
        <div className="actions">
          <button onClick={() => triggerAutosave(text)}>Lưu nháp ngay (Autosave)</button>
          <span role="status" aria-live="polite" className={saveState === 'error' ? 'FAIL' : saveState === 'saved' ? 'PASS' : 'mono'}>
            {saveState === 'saving' && 'Đang lưu lên máy chủ…'}
            {saveState === 'saved' && `Đã lưu trên máy chủ (${savedAt})`}
            {saveState === 'error' && `Chưa lưu được: ${saveError}`}
            {saveState === 'idle' && 'Chưa có bản lưu nháp mới'}
          </span>
        </div>

        <div className="actions">
          {!hasOriginal ? (
            <button disabled={!text.trim()} onClick={() => post<WorkspaceData>(
              `/api/learning/attempts/${encodeURIComponent(attemptId)}/submit`,
              { request_key: requestId(), content: text },
            ).then(setData).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))}>
              Nộp bài gốc để chẩn đoán (Bước 3 → Bước 4)
            </button>
          ) : !isVerification && (
            <button disabled={!text.trim()} onClick={() => post<WorkspaceData>(
              `/api/learning/attempts/${encodeURIComponent(attemptId)}/submit`,
              { request_key: requestId(), content: text, is_repair: true },
            ).then(setData).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))}>
              Nộp bản tự sửa mới (Bước 5 — kích hoạt chấm lại)
            </button>
          )}
        </div>

        {data.submissions.length > 0 && (
          <details open>
            <summary>Lịch sử phiên bản bài nộp ({data.submissions.length} bản — lưu bất biến)</summary>
            <ul>
              {data.submissions.map((s) => (
                <li key={s.submission_id}>
                  <b>Rev #{s.revision} ({s.kind === 'original' ? 'Bài nộp gốc' : `Bản tự sửa lần ${s.repair_attempt_index}`}):</b>{' '}
                  kết quả <code>{s.outcome ?? 'inconclusive'}</code> {s.synthetic && <span className="tag">synthetic</span>} — {s.content}
                </li>
              ))}
            </ul>
          </details>
        )}
      </article>

      {/* Cột phải: Bảng phản hồi, gợi mở theo nấc (P3-3) & Bước 6–7A (ẩn hoàn toàn ở chế độ thi) */}
      {!isExam && !isVerification && (
        <article className="card">
          <h3>3. Chẩn đoán &amp; Gợi mở theo nấc (Bước 4–6)</h3>
          {!data.diagnosis ? (
            <p>Nộp bài gốc để nhận chẩn đoán ưu tiên và gợi mở từng nấc từ máy chủ.</p>
          ) : (
            <div>
              <p className="mono">Chẩn đoán từ job {data.diagnosis.job_id.slice(0, 8)}… <span className="tag">synthetic</span></p>
              {data.diagnosis.priority_issues.length === 0 ? (
                <p className="PASS">Không phát hiện vấn đề trọng tâm cần sửa lại ở lượt này.</p>
              ) : (
                data.diagnosis.priority_issues.map((iss) => (
                  <div key={iss.issue_id} className="card">
                    <p><b>Vị trí:</b> {iss.location}</p>
                    <p><b>Biểu hiện (Lớp 1):</b> {iss.symptom}</p>
                    <p><b>Giả thuyết nguyên nhân (Lớp 2 — {iss.hypothesis_status}):</b> {iss.hypothesis}</p>
                    <p><b>Hướng kiểm chứng (Lớp 3):</b> {iss.expected_verification}</p>
                  </div>
                ))
              )}
              {data.diagnosis.other_issues_count > 0 && (
                <details>
                  <summary>Còn {data.diagnosis.other_issues_count} lỗi nhỏ khác tạm gác lại (tránh quá tải)</summary>
                  <ul>{data.diagnosis.other_issues_summary.map((o, i) => <li key={i}>{o}</li>)}</ul>
                </details>
              )}

              <h4>Gợi mở theo nấc (chỉ tải nấc đã mở từ server — đã mở {data.diagnosis.scaffold.unlocked_level}/3)</h4>
              {data.diagnosis.scaffold.hints.map((h) => (
                <div key={h.level} className="card">
                  <p>{h.content}</p>
                </div>
              ))}

              <div className="actions">
                {data.diagnosis.scaffold.unlocked_level < 3 && (
                  <button onClick={() => post<WorkspaceData>(
                    `/api/learning/attempts/${encodeURIComponent(attemptId)}/hints/unlock`,
                    { level: (data.diagnosis!.scaffold.unlocked_level + 1) as 1 | 2 | 3, request_key: requestId(), current_draft_text: text },
                  ).then(setData).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))}>
                    Mở gợi mở Nấc {data.diagnosis.scaffold.unlocked_level + 1} (ghi nhận assistance event)
                  </button>
                )}
                <button onClick={() => post<WorkspaceData>(
                  `/api/learning/attempts/${encodeURIComponent(attemptId)}/step5/action`,
                  { action: 'clarify', request_key: requestId(), current_draft_text: text },
                ).then(setData).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))}>
                  Hỏi làm rõ gợi ý ({data.loop?.clarification_count ?? 0} — không tính lần sửa thất bại)
                </button>
              </div>

              {data.loop?.offer_direct_explanation && (
                <div className="card">
                  <p>Bạn đã thử tự sửa {data.loop.repair_attempts}/{data.loop.max_guided_repairs} lần. Bạn muốn tiếp tục thử hay xem giải thích trực tiếp?</p>
                  <div className="actions">
                    <button onClick={() => post<WorkspaceData>(
                      `/api/learning/attempts/${encodeURIComponent(attemptId)}/step5/action`,
                      { action: 'try_more', request_key: requestId(), current_draft_text: text },
                    ).then(setData).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))}>
                      Để mình thử thêm
                    </button>
                    <button onClick={() => post<WorkspaceData>(
                      `/api/learning/attempts/${encodeURIComponent(attemptId)}/step5/action`,
                      { action: 'direct_explanation', request_key: requestId(), current_draft_text: text },
                    ).then(setData).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))}>
                      Giải thích trực tiếp + Câu hỏi kiểm tra hiểu
                    </button>
                  </div>
                </div>
              )}

              {data.loop?.step6_lesson && (
                <div className="card">
                  <h4>Bước 6 ({data.loop.step6_branch}): {data.loop.step6_lesson.title}</h4>
                  <p>{data.loop.step6_lesson.explanation}</p>
                  <ul>{data.loop.step6_lesson.contrast_examples.map((ex, i) => <li key={i}>{ex}</li>)}</ul>
                  <p><b>Câu hỏi kiểm tra hiểu (Concept-Check):</b> {data.loop.step6_lesson.concept_question}</p>
                  <div className="actions">
                    <input
                      style={{ flex: 1 }}
                      placeholder="Nhập câu trả lời kiểm tra hiểu (ví dụ: tránh mâu thuẫn lập trường bằng mệnh đề nhượng bộ)…"
                      value={conceptAnswer}
                      onChange={(e) => setConceptAnswer(e.target.value)}
                    />
                    <button disabled={!conceptAnswer.trim()} onClick={() => post<WorkspaceData>(
                      `/api/learning/attempts/${encodeURIComponent(attemptId)}/step6/complete`,
                      { concept_check_answer: conceptAnswer },
                    ).then(setData).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))}>
                      Xác nhận hiểu &amp; Hoàn tất Bước 6
                    </button>
                  </div>
                  {data.loop.concept_check_passed === false && <p className="FAIL">Câu trả lời chưa nêu đúng trọng tâm (mâu thuẫn lập trường / nhượng bộ). Hãy thử lại.</p>}
                  {data.loop.step6_completed && (
                    <div className="actions">
                      <span className="PASS">✓ Đã hoàn tất Bước 6. Sẵn sàng chuyển sang Bước 7A (kiểm chứng chuyển giao).</span>
                      <button onClick={() => post<WorkspaceData>(
                        `/api/learning/attempts/${encodeURIComponent(attemptId)}/start-7a`,
                        { request_key: requestId() },
                      ).then((nextView) => onSwitchAttempt(nextView.attempt.attempt_id)).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))}>
                        Chuyển sang Nhiệm vụ 7A mới (ngữ cảnh sạch, không gợi ý) →
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </article>
      )}
    </div>
  </section>;
}

export function TodayScreen({ onOpenAttempt }: { onOpenAttempt: (attemptId: string) => void }) {
  const [data, setData] = useState<TodayData | null>(null);
  const [minutesInput, setMinutesInput] = useState<string>('');
  const [selectedMode, setSelectedMode] = useState<Mode>('guided');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((mins?: number) => {
    setError(null);
    const q = mins !== undefined ? `?available_minutes=${encodeURIComponent(String(mins))}` : '';
    get<TodayData>(`/api/learning/today${q}`).then((d) => {
      setData(d);
      setMinutesInput(String(d.available_minutes));
    }).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) return <section><p role="alert" className="error">{error}</p></section>;
  if (!data) return <section><p>Đang tải nhiệm vụ Học hôm nay…</p></section>;

  return <section>
    <h2>Học hôm nay (06 §2.2)</h2>
    <p className="mono">{data.speaking_mode_note}</p>

    {!data.goal && <GoalForm initial={null} onSaved={() => load()} />}

    <article className="card">
      <h3>Quỹ thời gian phiên này</h3>
      <div className="actions">
        <label>Số phút hiện có:{' '}
          <input type="number" min="5" max="480" value={minutesInput} onChange={(e) => setMinutesInput(e.target.value)} />
        </label>
        <button onClick={() => load(Number(minutesInput))}>Cập nhật danh sách nhiệm vụ</button>
        <label>Chế độ làm bài khi mở bài học mới:{' '}
          <select value={selectedMode} onChange={(e) => setSelectedMode(e.target.value as Mode)}>
            <option value="guided">Có hướng dẫn (Guided)</option>
            <option value="self_practice">Tự luyện (Self-practice)</option>
            <option value="exam">Mô phỏng thi (Exam)</option>
          </select>
        </label>
      </div>
    </article>

    {data.in_progress.length > 0 && (
      <article className="card">
        <h3>Bài đang làm dở (tiếp tục ngay đúng trạng thái đã lưu)</h3>
        <ul>
          {data.in_progress.map((a) => (
            <li key={a.attempt_id}>
              <b>{a.title}</b> — {MODE_LABELS[a.mode]} · {PURPOSE_LABELS[a.purpose]} · Trạng thái: <code>{a.state}</code>{' '}
              <button onClick={() => onOpenAttempt(a.attempt_id)}>Tiếp tục làm bài</button>
            </li>
          ))}
        </ul>
      </article>
    )}

    <article className="card">
      <h3>Nhiệm vụ ưu tiên hôm nay (tối đa 3 nhiệm vụ đủ điều kiện)</h3>
      {data.recommended_tasks.length === 0 ? (
        <p>Không có nhiệm vụ nào vừa quỹ thời gian hiện tại hoặc đang chờ kiểm chứng.</p>
      ) : (
        data.recommended_tasks.map((t) => (
          <div key={t.task_id} className="card">
            <h4>{t.title} {t.synthetic && <span className="tag">synthetic</span>}</h4>
            <p>{t.reason}</p>
            <p className="mono">Mục đích: {PURPOSE_LABELS[t.purpose]} · Chế độ: {MODE_LABELS[t.mode]} · Ước tính: {t.estimated_minutes} phút</p>
            <button onClick={() => {
              const modeToUse = t.purpose === '7A' || t.purpose === '7B' || t.purpose === '9' ? t.mode : selectedMode;
              post<WorkspaceData>('/api/learning/attempts', {
                request_key: requestId(),
                item_id: t.item_id,
                item_version: t.item_version,
                rubric_id: t.rubric_id,
                rubric_version: t.rubric_version,
                mode: modeToUse,
                purpose: t.purpose,
                task_id: t.task_id,
                competency_id: t.competency_id,
              }).then((w) => onOpenAttempt(w.attempt.attempt_id)).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
            }}>
              Bắt đầu nhiệm vụ này
            </button>
          </div>
        ))
      )}
    </article>

    {data.upcoming_scheduled.length > 0 && (
      <article className="card">
        <h3>Lịch kiểm chứng / ôn tập giãn cách sắp tới (Bước 7B &amp; Bước 9)</h3>
        <ul>
          {data.upcoming_scheduled.map((u) => (
            <li key={u.task_id}>
              <b>{u.title}</b> — {PURPOSE_LABELS[u.purpose]} · Đến hạn: <span className="mono">{u.due_at}</span> ({u.estimated_minutes} phút)
              {u.synthetic && <span className="tag">synthetic</span>}
            </li>
          ))}
        </ul>
      </article>
    )}
  </section>;
}

export function ProgressScreen() {
  const [data, setData] = useState<ProgressData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [complaintStatus, setComplaintStatus] = useState('');
  const [reason, setReason] = useState('');
  const requestReview = async (observationId: string) => {
    try {
      await post('/api/learning/complaints', { request_key: crypto.randomUUID(), observation_id: observationId, reason });
      setComplaintStatus('Đã gửi yêu cầu xem xét lại. Nhận định chưa tự động thay đổi.');
    } catch (e) { setComplaintStatus(e instanceof Error ? e.message : String(e)); }
  };

  useEffect(() => {
    get<ProgressData>('/api/learning/progress').then(setData).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) return <section><p role="alert" className="error">{error}</p></section>;
  if (!data) return <section><p>Đang tải Tiến độ &amp; Hồ sơ năng lực…</p></section>;

  return <section>
    <h2>Tiến độ &amp; Hồ sơ năng lực (02 §2, 06 §2.4)</h2>
    <article className="card">
      <p><b>Giới hạn suy luận (D-02):</b> {data.disclaimer}</p>
      <p className="mono">Trạng thái chính sách: {data.policy_status} · Báo điểm Band: {data.band_reporting_enabled ? 'Bật' : 'Tắt (chưa có bộ đối chứng & chính sách được duyệt)'}</p>
    </article>

      <label>Lý do yêu cầu xem xét lại <input value={reason} maxLength={2000} onChange={(e) => setReason(e.target.value)} /></label>
      <p role="status">{complaintStatus}</p>
      {data.competencies.map((c) => (
      <article key={c.competency_id} className="card">
          <h3>{c.title} {c.all_synthetic && <span className="tag">synthetic</span>}</h3>
          <ul>{c.observations.map((o) => <li key={o.observation_id}>{o.outcome} <button disabled={!reason.trim()} onClick={() => void requestReview(o.observation_id)}>Yêu cầu xem xét lại</button></li>)}</ul>
        <p>{c.description}</p>
        <table>
          <tbody>
            <tr>
              <th>1. Nhận định hiện tại</th>
              <td>{c.current_state_label} (<code>{c.conclusion.status}</code>{c.conclusion.reason ? ` — ${c.conclusion.reason}` : ''})</td>
            </tr>
            <tr>
              <th>2. Bằng chứng tính đến nay</th>
              <td>
                Tổng số quan sát (observations): <b>{c.evidence_summary.observation_count}</b> ·
                Nguồn độc lập đạt (independent met): <b>{c.evidence_summary.independent_sources_met}</b> ·
                Nguồn độc lập chưa đạt: <b>{c.evidence_summary.independent_sources_not_met}</b> ·
                Đã loại trừ (thu hồi/thay thế): <b>{c.excluded_observations_count}</b>
                {Object.keys(c.evidence_summary.sources_by_use).length > 0 && (
                  <div className="mono">Phân loại theo mức hỗ trợ: {JSON.stringify(c.evidence_summary.sources_by_use)}</div>
                )}
              </td>
            </tr>
            <tr>
              <th>3. Giả thuyết lỗi đang theo dõi</th>
              <td>
                {c.error_hypotheses.length === 0 ? 'Chưa có giả thuyết lỗi nào được ghi nhận.' : (
                  <ul>
                    {c.error_hypotheses.map((h) => (
                      <li key={h.hypothesis_id}>
                        <b>[{h.status}]</b> Biểu hiện: {h.symptom} → Giả thuyết: {h.hypothesis} (<i>{h.verification_note}</i>)
                        {h.synthetic && <span className="tag">synthetic</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </td>
            </tr>
            <tr>
              <th>4. Lịch kiểm chứng tiếp theo</th>
              <td>
                Trạng thái: <code>{c.verification_schedule.status}</code>
                {c.verification_schedule.tasks.length > 0 && (
                  <ul>
                    {c.verification_schedule.tasks.map((t) => (
                      <li key={t.task_id}>
                        {PURPOSE_LABELS[t.purpose]} — trạng thái <code>{t.state}</code> — hạn <span className="mono">{t.due_at}</span>
                        {t.synthetic && <span className="tag">synthetic</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </article>
    ))}
  </section>;
}

export function SettingsScreen() {
  const [data, setData] = useState<{ goal: LearnerGoal | null; gateway: { provider: string; ready: boolean; error: string | null; reasons: string[] }[]; privacy_and_rights_note: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    get<NonNullable<typeof data>>('/api/learning/settings').then(setData).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(load, [load]);

  if (error) return <section><p role="alert" className="error">{error}</p></section>;
  if (!data) return <section><p>Đang tải Cài đặt…</p></section>;

  return <section>
    <h2>Cài đặt &amp; Trạng thái hệ thống (06 §2.5)</h2>
    <GoalForm initial={data.goal} onSaved={() => load()} />
    <article className="card">
      <h3>Trạng thái AI thuê bao (chỉ đọc — quản lý chi tiết tại Builder &amp; QC)</h3>
      <p>{data.privacy_and_rights_note}</p>
      <ul>
        {data.gateway.map((g) => (
          <li key={g.provider}>
            <b>{g.provider}</b>: {g.ready ? 'Sẵn sàng' : `Đang khóa (${g.error})`}
            {!g.ready && <span className="mono"> — {g.reasons.join(', ')}</span>}
          </li>
        ))}
      </ul>
    </article>
  </section>;
}
