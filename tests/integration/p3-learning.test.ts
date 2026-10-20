// Kiểm thử P3-1, P3-2, P3-3: Khung học trên web, một vòng Writing khép kín với FakeAdapter (synthetic)
// và gợi mở theo nấc chỉ lưu server / cắt quyền trước khi trả về HTTP payload.
import { afterEach, describe, expect, it } from 'vitest';
import {
  SYNTHETIC_COMPETENCY_ID,
  SYNTHETIC_KEY_SECRET,
  SYNTHETIC_SECRET_REWRITE,
  type AttemptWorkspaceView,
} from '../../src/application/learning/writing-workflow.js';
import { sliceUnlockedHints, verifyHintDisclosurePolicy } from '../../src/domain/learning/scaffold-hints.js';
import { dataPaths } from '../../src/infrastructure/files/paths.js';
import { openStore, type Store } from '../../src/infrastructure/sqlite/store.js';
import { createApp } from '../../src/server/app.js';
import { clock, tempDir, type Clock } from './p1-helpers.js';

let store: Store | undefined;
let app: ReturnType<typeof createApp> | undefined;
const cleanups: (() => void)[] = [];

afterEach(async () => {
  await app?.close();
  app = undefined;
  try { store?.close(); } catch { /* already closed */ }
  store = undefined;
  cleanups.splice(0).forEach((c) => c());
});

const HOST = '127.0.0.1:4317';
const ORIGIN = 'http://127.0.0.1:5173';

async function setupApp(): Promise<{ app: ReturnType<typeof createApp>; store: Store; clock: Clock; s: { cookie: string; csrf: string } }> {
  const t = tempDir('ielts-p3-');
  cleanups.push(t.cleanup);
  const c = clock();
  store = await openStore(dataPaths(t.dir), { now: c.now });
  app = createApp({ store, gatewayStatus: async () => [{ provider: 'codex', ready: false, error: 'BILLING_UNVERIFIED', reasons: ['NO_D01_EVIDENCE'] }] });
  const res = await app.inject({ url: '/api/session', headers: { host: HOST } });
  const cookie = String(res.headers['set-cookie']).split(';')[0]!;
  return { app, store, clock: c, s: { cookie, csrf: res.json().csrf_token as string } };
}

const get = (a: ReturnType<typeof createApp>, url: string, s: { cookie: string }) =>
  a.inject({ method: 'GET', url, headers: { host: HOST, cookie: s.cookie } });

const post = (a: ReturnType<typeof createApp>, url: string, s: { cookie: string; csrf: string }, payload: unknown = {}, extraHeaders: Record<string, string> = {}) =>
  a.inject({ method: 'POST', url, payload: payload as Record<string, unknown>, headers: { host: HOST, origin: ORIGIN, cookie: s.cookie, 'x-csrf-token': s.csrf, ...extraHeaders } });

describe('P3-1 Khung học trên web: Mục tiêu, Học hôm nay, Workspace 3 chế độ, Autosave thật & Tiến độ/Cài đặt', () => {
  it('lưu mục tiêu học tập, điều chỉnh phút khả dụng trong Học hôm nay, autosave lưu server và giữ đúng trạng thái sau khi tải lại', async () => {
    const { app: a, s } = await setupApp();

    // 1. Mục tiêu ban đầu & Cài đặt (06 §2.1, §2.5)
    expect((await get(a, '/api/learning/goals', s)).json()).toEqual({ goal: null });
    const savedGoal = await post(a, '/api/learning/goals', s, {
      target_band_overall: 7.0,
      target_listening: 7.5,
      target_reading: 7.5,
      target_writing: 6.5,
      target_speaking: 6.5,
      exam_type: 'academic',
      exam_date: '2026-12-15',
      daily_minutes: 30,
      weekly_minutes: 210,
    });
    expect(savedGoal.statusCode).toBe(200);
    expect(savedGoal.json().goal).toMatchObject({ target_band_overall: 7.0, target_writing: 6.5, daily_minutes: 30 });

    const settings = await get(a, '/api/learning/settings', s);
    expect(settings.statusCode).toBe(200);
    expect(settings.json().goal.target_band_overall).toBe(7.0);
    expect(settings.json().gateway[0]).toMatchObject({ provider: 'codex', ready: false });

    // 2. Học hôm nay lọc theo quỹ thời gian (06 §2.2, 02 §5.A)
    const todayTooShort = await get(a, '/api/learning/today?available_minutes=10', s);
    expect(todayTooShort.statusCode).toBe(200);
    expect(todayTooShort.json().recommended_tasks).toHaveLength(0);
    expect(todayTooShort.json().deferred_or_ineligible[0].reasons).toContain('EXCEEDS_TIME');

    const todayOk = await get(a, '/api/learning/today?available_minutes=30', s);
    expect(todayOk.statusCode).toBe(200);
    expect(todayOk.json().recommended_tasks).toHaveLength(1);
    const firstTask = todayOk.json().recommended_tasks[0];
    expect(firstTask).toMatchObject({ purpose: 'lesson', mode: 'guided', synthetic: true });

    // 3. Mở Workspace làm bài & Autosave qua API có session/CSRF, tải lại giữ đúng bản nháp
    const startRes = await post(a, '/api/learning/attempts', s, {
      request_key: 'start-guided-1',
      item_id: firstTask.item_id,
      item_version: firstTask.item_version,
      rubric_id: firstTask.rubric_id,
      rubric_version: firstTask.rubric_version,
      mode: 'guided',
      purpose: 'lesson',
      task_id: firstTask.task_id,
    });
    expect(startRes.statusCode).toBe(200);
    const attemptId = startRes.json().attempt.attempt_id as string;

    // Thiếu CSRF hoặc sai attempt_id phải báo lỗi thật, không giả báo thành công
    expect((await post(a, `/api/learning/attempts/${attemptId}/autosave`, s, { content: 'bad' }, { 'x-csrf-token': 'invalid' })).statusCode).toBe(403);
    expect((await post(a, '/api/learning/attempts/non-existent-attempt/autosave', s, { content: 'draft' })).statusCode).toBe(404);

    const save1 = await post(a, `/api/learning/attempts/${attemptId}/autosave`, s, { content: 'Bản nháp lần 1 đang viết dở...' });
    expect(save1.statusCode).toBe(200);
    expect(save1.json()).toMatchObject({ attempt_id: attemptId, snapshot_version: 0 });

    const save2 = await post(a, `/api/learning/attempts/${attemptId}/autosave`, s, { content: 'Bản nháp lần 2 đã bổ sung luận điểm.' });
    expect(save2.statusCode).toBe(200);
    expect(save2.json()).toMatchObject({ attempt_id: attemptId, snapshot_version: 1 });

    // Tải lại Workspace (reload) và kiểm tra Học hôm nay có mục "Bài đang làm dở"
    const reloaded = await get(a, `/api/learning/attempts/${attemptId}`, s);
    expect(reloaded.statusCode).toBe(200);
    expect(reloaded.json().draft).toMatchObject({
      latest_text: 'Bản nháp lần 2 đã bổ sung luận điểm.',
      snapshot_version: 1,
    });

    const todayWithInProgress = await get(a, '/api/learning/today', s);
    expect(todayWithInProgress.json().in_progress.map((x: { attempt_id: string }) => x.attempt_id)).toContain(attemptId);
  });

  it('ba chế độ làm bài (guided / self_practice / exam) tách biệt rõ quyền hỗ trợ đầu vào và bảng gợi mở', async () => {
    const { app: a, s } = await setupApp();

    // Guided mode: có input_support và cho phép gọi API mở gói hỗ trợ đầu vào (chụp pre_assistance snapshot)
    const guided = (await post(a, '/api/learning/attempts', s, { request_key: 'mode-guided', mode: 'guided', purpose: 'lesson' })).json() as AttemptWorkspaceView;
    expect(guided.task_prompt.input_support).not.toBeNull();
    const supportRes = await post(a, `/api/learning/attempts/${guided.attempt.attempt_id}/input-support`, s, {
      request_key: 'sup-1',
      current_draft_text: 'Nháp trước khi xem dàn ý',
    });
    expect(supportRes.statusCode).toBe(200);
    expect(supportRes.json().support.outline_suggestions.length).toBeGreaterThan(0);

    // Self-practice mode: không có input_support đầu vào
    const selfPractice = (await post(a, '/api/learning/attempts', s, { request_key: 'mode-self', mode: 'self_practice', purpose: 'practice' })).json() as AttemptWorkspaceView;
    expect(selfPractice.task_prompt.input_support).toBeNull();
    expect((await post(a, `/api/learning/attempts/${selfPractice.attempt.attempt_id}/input-support`, s, { request_key: 'sup-2', current_draft_text: '' })).statusCode).toBe(403);

    // Exam mode: ẩn criteria_summary, ẩn input_support và chặn mở gợi mở
    const exam = (await post(a, '/api/learning/attempts', s, { request_key: 'mode-exam', mode: 'exam', purpose: 'practice' })).json() as AttemptWorkspaceView;
    expect(exam.task_prompt.input_support).toBeNull();
    expect(exam.task_prompt.criteria_summary).toEqual([]);
    await post(a, `/api/learning/attempts/${exam.attempt.attempt_id}/submit`, s, {
      request_key: 'exam-sub-1',
      content: 'Bài thi thử [SYNTHETIC_NOT_MET]',
    });
    expect((await post(a, `/api/learning/attempts/${exam.attempt.attempt_id}/hints/unlock`, s, { level: 1, request_key: 'exam-h1' })).statusCode).toBe(403);
  });
});

describe('P3-3 Gợi mở theo nấc: chỉ lưu server, cắt quyền trên HTTP payload, idempotent assistance event, chỉ bản sửa mới mới chấm lại', () => {
  it('kiểm duyệt tiết lộ chặn gói gợi mở lộ đáp án ở nấc sớm', () => {
    const bad = {
      level_1: 'Hãy viết câu: While public libraries preserve equal access...',
      level_2: 'Nhắc kiến thức',
      level_3: 'While public libraries preserve equal access...',
      concept_check_question: 'Câu hỏi?',
      concept_check_expected: 'nhượng bộ',
      forbidden_in_early_levels: ['While public libraries preserve equal access'],
    };
    expect(verifyHintDisclosurePolicy(bad)).toMatchObject({ ok: false });
    expect(sliceUnlockedHints(bad, 0).hints).toEqual([]);
    expect(sliceUnlockedHints(bad, 1).hints).toHaveLength(1);
  });

  it('HTTP payload chỉ trả đúng nấc người học đã mở; mở lặp không nhân đôi assistance_event; mở gợi mở hay hỏi làm rõ không kích hoạt AI job mới', async () => {
    const { app: a, store: st, s } = await setupApp();
    const created = (await post(a, '/api/learning/attempts', s, { request_key: 'p3-3-attempt', mode: 'self_practice', purpose: 'practice' })).json() as AttemptWorkspaceView;
    const id = created.attempt.attempt_id;

    // Nộp bài gốc (chưa đạt để sinh chẩn đoán + 3 nấc gợi mở lưu trong DB server)
    const afterOriginal = await post(a, `/api/learning/attempts/${id}/submit`, s, {
      request_key: 'p3-3-orig',
      content: 'Public libraries should be closed completely. However, physical libraries are essential for everyone. [SYNTHETIC_NOT_MET]',
    });
    expect(afterOriginal.statusCode).toBe(200);

    // Kiểm tra khi unlocked_level = 0: HTTP body hoàn toàn KHÔNG chứa nội dung Nấc 1, Nấc 2, Nấc 3 hay đáp án mẫu
    expect(afterOriginal.json().diagnosis.scaffold).toEqual({ unlocked_level: 0, hints: [], concept_check_question: null });
    expect(afterOriginal.body).not.toContain('Nấc 1');
    expect(afterOriginal.body).not.toContain('Nấc 2');
    expect(afterOriginal.body).not.toContain(SYNTHETIC_SECRET_REWRITE);
    expect(afterOriginal.body).not.toContain(SYNTHETIC_KEY_SECRET);

    const jobsBeforeHints = (st.db.prepare('SELECT COUNT(*) AS n FROM ai_jobs').get() as { n: number }).n;
    expect(jobsBeforeHints).toBe(1);

    // Không cho nhảy cóc mở Nấc 2 khi chưa mở Nấc 1
    expect((await post(a, `/api/learning/attempts/${id}/hints/unlock`, s, { level: 2, request_key: 'h2-early' })).statusCode).toBe(400);

    // Mở Nấc 1: trả về đúng Nấc 1, KHÔNG lộ Nấc 2 hay Nấc 3 trong HTTP body
    const unlock1 = await post(a, `/api/learning/attempts/${id}/hints/unlock`, s, {
      level: 1,
      request_key: 'h1-key',
      current_draft_text: 'Đang chuẩn bị sửa lần 1',
    });
    expect(unlock1.statusCode).toBe(200);
    expect(unlock1.json().diagnosis.scaffold.unlocked_level).toBe(1);
    expect(unlock1.json().diagnosis.scaffold.hints).toHaveLength(1);
    expect(unlock1.body).toContain('Nấc 1');
    expect(unlock1.body).not.toContain('Nấc 2');
    expect(unlock1.body).not.toContain(SYNTHETIC_SECRET_REWRITE);

    // Gửi lặp cùng request_key mở Nấc 1: idempotent, vẫn chỉ có 1 assistance_event trong DB
    await post(a, `/api/learning/attempts/${id}/hints/unlock`, s, { level: 1, request_key: 'h1-key' });
    expect((st.db.prepare('SELECT COUNT(*) AS n FROM assistance_events WHERE attempt_id = ?').get(id) as { n: number }).n).toBe(1);

    // Hỏi làm rõ gợi ý (clarify): không tăng repair_attempt_index và không tạo AI job mới
    const clarify = await post(a, `/api/learning/attempts/${id}/step5/action`, s, { action: 'clarify', request_key: 'clarify-1' });
    expect(clarify.json().loop.clarification_count).toBe(1);
    expect(clarify.json().loop.repair_attempts).toBe(0);

    // Mở tiếp Nấc 2: có Nấc 1 và Nấc 2, vẫn KHÔNG lộ Nấc 3 (mẫu câu viết lại)
    const unlock2 = await post(a, `/api/learning/attempts/${id}/hints/unlock`, s, { level: 2, request_key: 'h2-key' });
    expect(unlock2.statusCode).toBe(200);
    expect(unlock2.json().diagnosis.scaffold.unlocked_level).toBe(2);
    expect(unlock2.json().diagnosis.scaffold.hints).toHaveLength(2);
    expect(unlock2.body).toContain('Nấc 2');
    expect(unlock2.body).not.toContain(SYNTHETIC_SECRET_REWRITE);

    // Số lượng AI job vẫn giữ nguyên là 1 (mở gợi mở và hỏi làm rõ không gọi AI chấm lại)
    expect((st.db.prepare('SELECT COUNT(*) AS n FROM ai_jobs').get() as { n: number }).n).toBe(1);

    // Chỉ khi nộp bản tự sửa mới (Bước 5) mới tạo job `repair.assess` thứ 2
    const repairSub = await post(a, `/api/learning/attempts/${id}/submit`, s, {
      request_key: 'p3-3-repair-1',
      content: 'While digital archives expand remote access, physical libraries remain vital community spaces. [SYNTHETIC_MET]',
      is_repair: true,
    });
    expect(repairSub.statusCode).toBe(200);
    expect((st.db.prepare('SELECT COUNT(*) AS n FROM ai_jobs').get() as { n: number }).n).toBe(2);
    expect(repairSub.json().submissions).toHaveLength(2);
    expect(repairSub.json().submissions[1]).toMatchObject({ kind: 'repair', revision: 1, repair_attempt_index: 1, outcome: 'met', synthetic: true });
  });
});

describe('P3-2 Một vòng Writing khép kín với FakeAdapter: bài nộp gốc → chẩn đoán → tự sửa → bổ sung kiến thức → 7A mới → cập nhật có điều kiện → 7B/9 đồng hồ giả', () => {
  it('chạy trọn vòng học Writing, chuyển sang 7A không lộ lời giải/mục tiêu ẩn trong HTTP payload, xếp lịch 7B/9 với đồng hồ giả và giữ giới hạn suy luận D-02 + synthetic', async () => {
    const { app: a, store: st, clock: clk, s } = await setupApp();

    // Bước 3: Bắt đầu bài học Writing
    const start = (await post(a, '/api/learning/attempts', s, { request_key: 'loop-orig', mode: 'guided', purpose: 'lesson' })).json() as AttemptWorkspaceView;
    const origId = start.attempt.attempt_id;

    // Bước 4: Nộp bài gốc (chưa đạt) -> nhận chẩn đoán ưu tiên
    const step4 = (await post(a, `/api/learning/attempts/${origId}/submit`, s, {
      request_key: 'loop-sub-0',
      content: 'Bài nộp gốc có lập trường mâu thuẫn giữa hai đoạn. [SYNTHETIC_NOT_MET]',
    })).json() as AttemptWorkspaceView;
    expect(step4.loop?.step).toBe(5);
    expect(step4.diagnosis?.priority_issues).toHaveLength(1);
    expect(step4.diagnosis?.other_issues_count).toBe(1);

    // Bước 5: Mở Nấc 1, nộp bản sửa lần 1 (vẫn chưa đạt), nộp bản sửa lần 2 (chạm trần 2 lần sửa hướng dẫn -> hiện lựa chọn giải thích trực tiếp)
    await post(a, `/api/learning/attempts/${origId}/hints/unlock`, s, { level: 1, request_key: 'loop-h1' });
    await post(a, `/api/learning/attempts/${origId}/submit`, s, {
      request_key: 'loop-sub-1',
      content: 'Bản tự sửa lần 1 vẫn chưa rõ nhượng bộ. [SYNTHETIC_NOT_MET]',
      is_repair: true,
    });
    const afterRepair2 = (await post(a, `/api/learning/attempts/${origId}/submit`, s, {
      request_key: 'loop-sub-2',
      content: 'Bản tự sửa lần 2 vẫn còn mâu thuẫn. [SYNTHETIC_NOT_MET]',
      is_repair: true,
    })).json() as AttemptWorkspaceView;
    expect(afterRepair2.loop?.repair_attempts).toBe(2);
    expect(afterRepair2.loop?.offer_direct_explanation).toBe(true);

    // Người học chọn "Giải thích trực tiếp" -> mở Nấc 3 kèm câu hỏi kiểm tra hiểu (Concept-Check)
    const directExp = await post(a, `/api/learning/attempts/${origId}/step5/action`, s, {
      action: 'direct_explanation',
      request_key: 'loop-direct',
    });
    expect(directExp.json().diagnosis.scaffold.unlocked_level).toBe(3);
    expect(directExp.body).toContain(SYNTHETIC_SECRET_REWRITE);

    // Chưa hoàn tất Bước 6 thì chưa được mở 7A
    expect((await post(a, `/api/learning/attempts/${origId}/start-7a`, s, { request_key: 'early-7a' })).statusCode).toBe(409);

    // Bước 6: Trả lời Concept-Check và hoàn tất Micro-lesson
    const step6Done = (await post(a, `/api/learning/attempts/${origId}/step6/complete`, s, {
      concept_check_answer: 'Cần dùng mệnh đề nhượng bộ để không tự mâu thuẫn lập trường giữa các đoạn.',
    })).json() as AttemptWorkspaceView;
    expect(step6Done.loop?.concept_check_passed).toBe(true);
    expect(step6Done.loop?.step6_completed).toBe(true);

    // Bước 7A: Chuyển sang nhiệm vụ mới trong ngữ cảnh sạch (self_practice, purpose 7A)
    const res7A = await post(a, `/api/learning/attempts/${origId}/start-7a`, s, { request_key: 'start-7a-1' });
    expect(res7A.statusCode).toBe(200);
    const view7A = res7A.json() as AttemptWorkspaceView;
    expect(view7A.attempt.attempt_id).not.toBe(origId);
    expect(view7A.attempt.mode).toBe('self_practice');
    expect(view7A.attempt.purpose).toBe('7A');
    expect(view7A.task_prompt.input_support).toBeNull();
    expect(view7A.diagnosis).toBeNull();
    expect(view7A.loop?.step6_lesson).toBeNull();

    // Chứng minh HTTP payload của 7A và GET /api/learning/attempts/:id7A tuyệt đối KHÔNG lộ lời giải mẫu hay mục tiêu ẩn
    expect(res7A.body).not.toContain(SYNTHETIC_SECRET_REWRITE);
    expect(res7A.body).not.toContain(SYNTHETIC_KEY_SECRET);
    expect(res7A.body).not.toContain('Nấc 1');
    expect(res7A.body).not.toContain('Nấc 2');
    const get7A = await get(a, `/api/learning/attempts/${view7A.attempt.attempt_id}`, s);
    expect(get7A.body).not.toContain(SYNTHETIC_SECRET_REWRITE);
    expect(get7A.body).not.toContain(SYNTHETIC_KEY_SECRET);

    // Trong bài 7A, thử mở gợi mở phải bị chặn 403
    expect((await post(a, `/api/learning/attempts/${view7A.attempt.attempt_id}/hints/unlock`, s, { level: 1, request_key: '7a-hint' })).statusCode).toBe(403);

    // Nộp bài 7A đạt (không có hỗ trợ trong attempt 7A) -> Bước 8 cập nhật có điều kiện và xếp lịch 7B (+1 ngày) & Bước 9 (+3 ngày)
    const submit7A = await post(a, `/api/learning/attempts/${view7A.attempt.attempt_id}/submit`, s, {
      request_key: 'sub-7a-1',
      content: 'While free public transport requires municipal funding, it significantly reduces congestion and emissions. [SYNTHETIC_MET]',
    });
    expect(submit7A.statusCode).toBe(200);
    expect(submit7A.json().loop.step).toBe(8);

    // Kiểm tra bằng đồng hồ giả: ngay lúc này (t = 0), 7B và Bước 9 nằm trong upcoming_scheduled (chưa đến hạn)
    const todayAtT0 = (await get(a, '/api/learning/today?available_minutes=60', s)).json();
    expect(todayAtT0.upcoming_scheduled.map((u: { purpose: string }) => u.purpose)).toEqual(['7B', '9']);
    expect(todayAtT0.recommended_tasks.some((t: { purpose: string }) => t.purpose === '7B' || t.purpose === '9')).toBe(false);

    // Tua đồng hồ giả +1 ngày: 7B đến hạn và xuất hiện trong recommended_tasks, Bước 9 vẫn chưa đến hạn
    clk.advance(24 * 60 * 60 * 1000 + 1000);
    const todayAtDay1 = (await get(a, '/api/learning/today?available_minutes=60', s)).json();
    expect(todayAtDay1.recommended_tasks.map((t: { purpose: string }) => t.purpose)).toContain('7B');
    expect(todayAtDay1.upcoming_scheduled.map((u: { purpose: string }) => u.purpose)).toEqual(['9']);

    // Tua đồng hồ giả thêm +2 ngày (tổng +3 ngày): Bước 9 đến hạn
    clk.advance(2 * 24 * 60 * 60 * 1000);
    const todayAtDay3 = (await get(a, '/api/learning/today?available_minutes=60', s)).json();
    const task9 = todayAtDay3.recommended_tasks.find((t: { purpose: string }) => t.purpose === '9');
    expect(task9).toBeDefined();

    // Kiểm tra Bước 9 Opportunity-to-Use: nộp bài không có cơ hội bộc lộ cấu trúc (opportunity = absent)
    // -> không bị kết luận là thất bại, nhiệm vụ chuyển sang trạng thái AWAITING_OPPORTUNITY
    const attempt9 = (await post(a, '/api/learning/attempts', s, {
      request_key: 'start-step9',
      item_id: task9.item_id,
      item_version: task9.item_version,
      rubric_id: task9.rubric_id,
      rubric_version: task9.rubric_version,
      mode: 'exam',
      purpose: '9',
      task_id: task9.task_id,
    })).json() as AttemptWorkspaceView;

    await post(a, `/api/learning/attempts/${attempt9.attempt.attempt_id}/submit`, s, {
      request_key: 'sub-step9-absent',
      content: 'Bài viết chọn hướng tiếp cận khác nên không xuất hiện cấu trúc cần kiểm tra. [SYNTHETIC_NO_OPPORTUNITY]',
      opportunity_override: 'absent',
    });

    // Kiểm tra màn Tiến độ & Hồ sơ năng lực:
    // - Bài nộp gốc + 2 bản sửa dùng chung 1 evidence_source_id; bài 7A và bài 9 là nguồn riêng.
    // - Mọi nhận định từ FakeAdapter đều mang nhãn synthetic: true.
    // - Kết luận năng lực trả về POLICY_NOT_APPROVED ("chưa đủ kết luận") và band_reporting_enabled = false (D-02).
    const progress = (await get(a, '/api/learning/progress', s)).json();
    expect(progress.policy_status).toBe('POLICY_NOT_APPROVED');
    expect(progress.band_reporting_enabled).toBe(false);

    const trProfile = progress.competencies.find((c: { competency_id: string }) => c.competency_id === SYNTHETIC_COMPETENCY_ID);
    expect(trProfile).toBeDefined();
    expect(trProfile.all_synthetic).toBe(true);
    expect(trProfile.conclusion).toMatchObject({ status: 'inconclusive', reason: 'POLICY_NOT_APPROVED' });
    // Chỉ có đúng 1 nguồn độc lập đạt (từ bài 7A); 2 bản tự sửa ở Bước 5 là scaffolded_repair trên nguồn gốc; bài 9 không có cơ hội là inconclusive
    expect(trProfile.evidence_summary.independent_sources_met).toBe(1);
    expect(trProfile.evidence_summary.sources_by_use).toMatchObject({
      scaffolded_repair: 1,
      independent_candidate: 1,
      inconclusive: 1,
    });
    expect(trProfile.verification_schedule.status).toBe('awaiting_opportunity');
    expect((st.db.prepare("SELECT COUNT(*) AS n FROM ai_runs WHERE provider != 'fake'").get() as { n: number }).n).toBe(0);
  });
});
