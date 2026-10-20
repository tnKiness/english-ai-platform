import { afterEach, expect, it, vi } from 'vitest';
import { AudioWorkflow, SPEAKING_LIMITATION } from '../../src/application/learning/audio-workflow.js';
import { ReadingWorkflow } from '../../src/application/learning/reading-workflow.js';
import { DATA_CLASSES, subscriptionGuard } from '../../src/application/ai/subscription-guard.js';
import { FakeAdapter } from '../../src/infrastructure/ai/fake-adapter.js';
import { sha256 } from '../../src/infrastructure/files/paths.js';
import { openStore } from '../../src/infrastructure/sqlite/store.js';
import { createApp } from '../../src/server/app.js';
import { ITEM_ID, SECRET_EXPLANATION } from '../fixtures/knowledge/synthetic.js';
import { readingUnits } from '../fixtures/knowledge/reading-p3.js';
import { builderFixture, qc, stage, PKG, type BuilderFixture } from './p2-helpers.js';

let f: BuilderFixture;
let app: ReturnType<typeof createApp>;
afterEach(async () => { await app?.close(); f?.store.close(); f?.cleanup(); });
async function setup() {
  f = await builderFixture();
  const frozen = f.pipeline.freeze(stage(f, { units: readingUnits() }), 'v1');
  const run = await qc(f, 'v1', new FakeAdapter('success', { blindAnswers: { q1: 'FALSE', q2: 'NOT GIVEN', q3: 'spring' } }));
  expect(run.qc4.status).toBe('PASS');
  expect(f.pipeline.release(PKG, 'v1', frozen.bundle_hash).allowed).toBe(true);
  app = createApp({ store: f.store });
  const session = await app.inject({ url: '/api/session', headers: { host: '127.0.0.1:4317' } });
  const headers = { host: '127.0.0.1:4317', origin: 'http://127.0.0.1:5173', cookie: String(session.headers['set-cookie']).split(';')[0]!, 'x-csrf-token': session.json().csrf_token as string };
  const post = (url: string, payload: object) => app.inject({ method: 'POST', url: `/api/learning/reading${url}`, headers, payload });
  const get = (url: string) => app.inject({ url: `/api/learning/reading${url}`, headers });
  return { post, get };
}
const answers = [
  { question_id: 'q1', answer: 'FALSE', rationale: 'Bài ghi đèn giấy, không phải thủy tinh.' },
  { question_id: 'q2', answer: 'NOT GIVEN', rationale: 'Không cho biết số thành viên; không xác nhận hay phủ định con số 12.' },
  { question_id: 'q3', answer: ' in   spring ', rationale: '' },
];
it('released Reading: blind HTTP, accepted alternative, NG, staged disclosure, retry and durable resume', async () => {
  const { post, get } = await setup();
  const readSpy = vi.spyOn(f.store.json, 'get');
  const started = await post('', { item_id: ITEM_ID, version: 'v1', mode: 'self_practice', request_key: 'start' });
  expect(started.statusCode).toBe(200);
  const id = started.json().attempt_id as string;
  for (const secret of [SECRET_EXPLANATION, 'accepted', 'measurement_targets', 'competing_answers', 'membership size']) expect(started.body).not.toContain(secret);
  readSpy.mockClear();
  await get(`/${id}`);
  expect(readSpy.mock.calls.some(([kind]) => kind === 'knowledge')).toBe(false);
  expect((await post(`/${id}/hints`, { level: 1 })).statusCode).toBe(403);
  expect((await post(`/${id}/autosave`, { content: JSON.stringify(answers) })).statusCode).toBe(200);
  const submitted = await post(`/${id}/submit`, { request_key: 'submit', answers });
  expect(submitted.json().submissions[0].results.map((r: { item_result: string }) => r.item_result)).toEqual(['correct', 'correct', 'correct']);
  expect(submitted.body).not.toContain(SECRET_EXPLANATION);
  expect(submitted.json().band_reporting_enabled).toBe(false);
  expect(submitted.json().submissions[0].results[1].diagnostic_value).toBe('inconclusive');
  await post(`/${id}/submit`, { request_key: 'submit', answers });
  expect((await get(`/${id}`)).json().submissions).toHaveLength(1);
  expect((await post(`/${id}/hints`, { level: 3 })).statusCode).toBe(403);
  for (const level of [1, 2]) {
    const hint = await post(`/${id}/hints`, { level });
    expect(hint.statusCode).toBe(200);
    expect(hint.body).not.toContain(SECRET_EXPLANATION);
  }
  await post(`/${id}/hints`, { level: 2 });
  const exposed = await post(`/${id}/hints`, { level: 3 });
  expect(exposed.body).toContain(SECRET_EXPLANATION);
  const revised = answers.map((a) => a.question_id === 'q2' ? { ...a, answer: 'FALSE' } : a);
  await post(`/${id}/submit`, { request_key: 'repair', answers: revised });
  expect(f.store.db.prepare('SELECT COUNT(*) AS n FROM assistance_events WHERE attempt_id=?').get(id)).toEqual({ n: 3 });
  expect(f.store.db.prepare('SELECT COUNT(*) AS n FROM evidence_sources WHERE attempt_id=?').get(id)).toEqual({ n: 1 });
  expect(f.store.db.prepare("SELECT COUNT(*) AS n FROM ai_jobs j JOIN attempts a USING(attempt_id) WHERE a.scope='learner'").get()).toEqual({ n: 0 });
  const paths = f.store.paths;
  await app.close();
  f.store.close();
  f.store = await openStore(paths);
  const resumed = new ReadingWorkflow(f.store).view(id);
  expect(resumed.unlocked_level).toBe(3);
  expect(resumed.submissions).toHaveLength(2);
  expect(JSON.parse(resumed.submissions[0]!.content)).toEqual(answers);
  expect(resumed.submissions[1]!.results[1]!.item_result).toBe('incorrect');
  expect(resumed.draft?.content).toBe(JSON.stringify(revised.map((a) => ({ answer: a.answer, question_id: a.question_id, rationale: a.rationale }))));
});

it('exam denies hints; malformed submissions, CSRF and revocation cannot leak cached/pinned content', async () => {
  const { post, get } = await setup();
  const id = (await post('', { item_id: ITEM_ID, version: 'v1', mode: 'exam', request_key: 'exam' })).json().attempt_id as string;
  expect((await post(`/${id}/submit`, { request_key: 'bad', answers: [answers[0], answers[0]] })).statusCode).toBe(400);
  await post(`/${id}/submit`, { request_key: 'exam-submit', answers });
  expect((await post(`/${id}/hints`, { level: 1 })).statusCode).toBe(403);
  expect((await get(`/${id}`)).headers['cache-control']).toBe('no-store');
  expect((await app.inject({ method: 'POST', url: `/api/learning/reading/${id}/submit`, headers: { host: '127.0.0.1:4317' }, payload: {} })).statusCode).toBe(401);
  f.pipeline.revoke({ target_kind: 'item', target_id: ITEM_ID, target_version: 'v1' }, 'synthetic withdrawal');
  for (const res of [await get(`/${id}`), await post(`/${id}/submit`, { request_key: 'late', answers }), await post('', { item_id: ITEM_ID, version: 'v1', mode: 'exam', request_key: 'exam' })]) {
    expect(res.statusCode).toBe(409); expect(res.body).not.toContain('paper lanterns');
  }
  expect((await get('')).json().items).toEqual([]);
});

it('unresolved competing answer fails QC4 and is never offered to learners', async () => {
  f = await builderFixture();
  const frozen = f.pipeline.freeze(stage(f), 'v1');
  const run = await qc(f, 'v1', new FakeAdapter('success', { blindAnswers: { q1: 'FALSE', q2: 'NOT GIVEN' }, verdict: 'ambiguous', competing: [{ question_id: 'q2', answer: 'FALSE', rationale: 'unresolved synthetic probe' }] }));
  expect(run.qc4.status).toBe('FAIL');
  expect(f.pipeline.release(PKG, 'v1', frozen.bundle_hash).allowed).toBe(false);
  const svc = new ReadingWorkflow(f.store);
  expect(svc.catalog().items).toEqual([]);
  expect(() => svc.start(ITEM_ID, 'v1', 'guided', 'unreleased')).toThrow(/unavailable/);
});

// Tạo dữ liệu WAV RIFF/WAVE tối thiểu hợp lệ để kiểm thử lưu trữ media cục bộ có checksum.
function makeSyntheticWav(tag: string): Buffer {
  const payload = Buffer.from(tag, 'ascii');
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(payload.length + 4, 4);
  header.write('WAVE', 8, 'ascii');
  return Buffer.concat([header, payload]);
}

it('local audio sample (D-06/E-11): stores original & retake with checksum, playback nosniff, ASR unavailable, transcripts separated, and never sends learner_audio to AI jobs', async () => {
  const { get } = await setup();
  const session = await app.inject({ url: '/api/session', headers: { host: '127.0.0.1:4317' } });
  const headers = {
    host: '127.0.0.1:4317',
    origin: 'http://127.0.0.1:5173',
    cookie: String(session.headers['set-cookie']).split(';')[0]!,
    'x-csrf-token': session.json().csrf_token as string,
  };
  const postAudio = (url: string, payload: object) => app.inject({ method: 'POST', url: `/api/learning/audio${url}`, headers, payload });
  const getAudio = (url: string) => app.inject({ url: `/api/learning/audio${url}`, headers });

  // 1. Khởi tạo phiên mẫu audio cục bộ
  const started = await postAudio('', { request_key: 'audio-start-1' });
  expect(started.statusCode).toBe(200);
  const id = started.json().attempt_id as string;
  expect(started.json()).toMatchObject({
    attempt_id: id,
    asr: { status: 'unavailable', transcript: null },
    limitation: SPEAKING_LIMITATION,
    band_reporting_enabled: false,
    synthetic: true,
  });

  // Ranh giới route: attempt của audio không thể truy cập qua đường Writing (/api/learning/attempts/:id)
  expect((await app.inject({ url: `/api/learning/attempts/${id}`, headers })).statusCode).toBe(409);
  expect((await get(`/${id}`)).statusCode).toBe(404);

  // 2. Từ chối file giả dạng audio (ví dụ HTML/text không có magic bytes RIFF/WAVE, WebM, OggS)
  const fakeHtml = Buffer.from('<script>alert(1)</script>').toString('base64');
  expect((await postAudio(`/${id}/recordings`, { request_key: 'bad-wav', data: fakeHtml, media_type: 'audio/wav' })).statusCode).toBe(400);

  // 3. Tải lên bản thu gốc (original) và bản thu lại (retake), kiểm tra idempotency + checksum + playback
  const wav1 = makeSyntheticWav('SYNTHETIC_AUDIO_ORIGINAL_BYTES_DO_NOT_SEND_TO_AI');
  const wav2 = makeSyntheticWav('SYNTHETIC_AUDIO_RETAKE_BYTES_SECOND_SAMPLE');
  const up1 = await postAudio(`/${id}/recordings`, { request_key: 'rec-1', data: wav1.toString('base64'), media_type: 'audio/wav' });
  expect(up1.statusCode).toBe(200);
  // Gửi lặp cùng request_key trả về cùng trạng thái (idempotent), khác nội dung cùng key bị chặn 409
  expect((await postAudio(`/${id}/recordings`, { request_key: 'rec-1', data: wav1.toString('base64'), media_type: 'audio/wav' })).statusCode).toBe(200);
  expect((await postAudio(`/${id}/recordings`, { request_key: 'rec-1', data: wav2.toString('base64'), media_type: 'audio/wav' })).statusCode).toBe(409);

  const up2 = await postAudio(`/${id}/recordings`, { request_key: 'rec-2', data: wav2.toString('base64'), media_type: 'audio/wav' });
  expect(up2.statusCode).toBe(200);
  const recs = up2.json().recordings as { recording_id: string; kind: string; sha256: string; bytes: number; media_type: string }[];
  expect(recs.map((r) => [r.kind, r.sha256, r.bytes])).toEqual([
    ['original', sha256(wav1), wav1.length],
    ['retake', sha256(wav2), wav2.length],
  ]);

  // Phát lại audio từ kho media cục bộ: đúng byte gốc, header nosniff và no-store
  const play1 = await getAudio(`/${id}/recordings/${recs[0]!.recording_id}`);
  expect(play1.statusCode).toBe(200);
  expect(play1.headers['x-content-type-options']).toBe('nosniff');
  expect(play1.headers['cache-control']).toBe('no-store');
  expect(play1.rawPayload.equals(wav1)).toBe(true);

  // 4. Lưu nháp văn bản và lưu các phiên bản transcript của người học tách biệt với bản thu gốc
  expect((await postAudio(`/${id}/autosave`, { content: 'Nháp transcript đang gõ...' })).statusCode).toBe(200);
  const tr0 = await postAudio(`/${id}/transcripts`, {
    recording_id: recs[0]!.recording_id,
    request_key: 'tr-key-0',
    content: 'I would like to create a small reading garden near the canal.',
  });
  expect(tr0.statusCode).toBe(200);
  const tr1 = await postAudio(`/${id}/transcripts`, {
    recording_id: recs[0]!.recording_id,
    request_key: 'tr-key-1',
    content: 'I would like to create a quiet reading garden near the canal so residents can relax.',
  });
  expect(tr1.statusCode).toBe(200);
  const transcripts = tr1.json().transcripts as { transcript_id: string; recording_id: string; revision: number; source: string; content: string }[];
  expect(transcripts.map((t) => [t.revision, t.source])).toEqual([
    [0, 'learner_entered'],
    [1, 'learner_entered'],
  ]);
  // Bản thu gốc vẫn giữ nguyên bất biến sau khi người học sửa transcript
  expect((await getAudio(`/${id}/recordings/${recs[0]!.recording_id}`)).rawPayload.equals(wav1)).toBe(true);

  // 5. Đánh giá Speaking dạng văn bản (E-11): chỉ gửi văn bản, KHÔNG BAO GIỜ đưa learner_audio, media_id hay byte audio vào context/job AI
  const rev0 = await postAudio(`/${id}/review-text`, { transcript_id: transcripts[0]!.transcript_id });
  expect(rev0.statusCode).toBe(200);
  expect(rev0.json()).toMatchObject({
    processing: 'processed',
    outcome: 'inconclusive',
    synthetic: true,
    limitation: SPEAKING_LIMITATION,
    band_reporting_enabled: false,
    asr: { status: 'unavailable', transcript: null },
  });

  const rev1 = await postAudio(`/${id}/review-text`, { transcript_id: transcripts[1]!.transcript_id });
  expect(rev1.statusCode).toBe(200);

  // Kiểm tra trực tiếp DB: submissions không gắn media_id, context_manifests không có allowed_resource_ids hay dữ liệu audio,
  // job chỉ yêu cầu ['text', 'structured_result'] (không có 'direct_audio'), và chung 1 evidence_source cho attempt.
  const subs = f.store.db.prepare('SELECT kind, revision, media_id, evidence_source_id FROM submissions WHERE attempt_id=? ORDER BY revision').all(id) as {
    kind: string; revision: number; media_id: string | null; evidence_source_id: string;
  }[];
  expect(subs.map((s) => [s.kind, s.revision, s.media_id])).toEqual([
    ['original', 0, null],
    ['repair', 1, null],
  ]);
  expect(new Set(subs.map((s) => s.evidence_source_id)).size).toBe(1);

  const jobs = f.store.db.prepare('SELECT task_type, required_capabilities, context_manifest_id FROM ai_jobs WHERE attempt_id=? ORDER BY created_at, rowid').all(id) as {
    task_type: string; required_capabilities: string; context_manifest_id: string;
  }[];
  expect(jobs.map((j) => [j.task_type, JSON.parse(j.required_capabilities)])).toEqual([
    ['writing.assess', ['text', 'structured_result']],
    ['repair.assess', ['text', 'structured_result']],
  ]);
  for (const j of jobs) {
    const manifestRow = f.store.db.prepare('SELECT allowed_resource_ids, payload_json FROM context_manifests WHERE manifest_id=?').get(j.context_manifest_id) as {
      allowed_resource_ids: string; payload_json: string;
    };
    expect(JSON.parse(manifestRow.allowed_resource_ids)).toEqual([]);
    expect(manifestRow.payload_json).not.toContain('SYNTHETIC_AUDIO_ORIGINAL_BYTES');
    expect(manifestRow.payload_json).not.toContain(sha256(wav1));
    expect(manifestRow.payload_json).not.toContain('audio/wav');
  }

  // Guard E-11: ngay cả khi thử tạo GuardInput có learner_audio, subscriptionGuard luôn chặn bằng DATA_CLASS_NEVER_SENT_learner_audio
  const blockedAudioDecision = subscriptionGuard({
    provider: 'codex',
    adapter_status: 'VERIFIED',
    account: { state: 'READY' },
    evidence: undefined,
    observed: { cli_version: null, entrypoint_sha256: null, entrypoint_issues: [], auth_subscription: true, entitlement_verified: true, isolation_issues: [], enforcement_issues: [] },
    env: { leaked_billing_names: [] },
    job: { billing_policy: 'subscription_only', required_capabilities: ['text'], data_classes: ['learner_submission', 'learner_audio'], model: 'gpt-6-astra' },
    consents: new Set(DATA_CLASSES),
    now: new Date(),
  });
  expect(blockedAudioDecision.allowed).toBe(false);
  if (!blockedAudioDecision.allowed) {
    expect(blockedAudioDecision.reasons).toContain('DATA_CLASS_NEVER_SENT_learner_audio');
  }

  // 6. Khôi phục bền vững sau khi đóng và mở lại store
  const paths = f.store.paths;
  await app.close();
  f.store.close();
  f.store = await openStore(paths);
  const resumed = new AudioWorkflow(f.store).view(id);
  expect(resumed.recordings).toHaveLength(2);
  expect(resumed.transcripts).toHaveLength(2);
  expect(resumed.asr).toEqual({ status: 'unavailable', transcript: null });
  expect(resumed.band_reporting_enabled).toBe(false);
});
