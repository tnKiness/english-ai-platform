import { randomUUID } from 'node:crypto';
import { CLI_PROVIDERS } from '../ai/subscription-guard.js';
import type { Assessment } from '../ai/provider-adapter.js';
import { FakeAdapter } from '../../infrastructure/ai/fake-adapter.js';
import { sha256 } from '../../infrastructure/files/paths.js';
import type { Store } from '../../infrastructure/sqlite/store.js';
import { processNextJob } from '../../worker/worker.js';
import { submitForAssessment } from './submit-for-assessment.js';

export const AUDIO_MAX_BYTES = 8 * 1024 * 1024;
export const SPEAKING_LIMITATION = 'Không có audio trực tiếp trong đánh giá. Chỉ xét nội dung/ngôn ngữ viết do người học nhập; chưa xác nhận lời đã nói, phát âm, độ trôi chảy hay phản xạ nói. Không báo Band Speaking.';
/** D-06: no ASR implementation is selected or invoked. */
export interface AsrPort { readonly status: 'unavailable'; readonly transcript: null }
export const ASR: AsrPort = { status: 'unavailable', transcript: null };
const fail = (message: string, statusCode = 409): never => { throw Object.assign(new Error(message), { statusCode }); };
type Recording = { recording_id: string; attempt_id: string; media_id: string; kind: string; created_at: string };
type Transcript = { transcript_id: string; recording_id: string; revision: number; content: string; source: string; created_at: string };

export class AudioWorkflow {
  constructor(private store: Store) {}
  private attempt(id: string) {
    const a = this.store.learning.getAttempt(id);
    if (!a || a.scope !== 'learner' || !this.store.db.prepare('SELECT 1 FROM audio_sessions WHERE attempt_id=?').get(id)) return fail('Unknown audio session', 404);
    if (!this.store.knowledge.servableItem(a.item.id, a.item.version, 'learner').ok) return fail('Speaking item unavailable');
    return a;
  }
  list() {
    return this.store.db.prepare('SELECT attempt_id FROM audio_sessions').all() as { attempt_id: string }[];
  }
  start(requestKey: string) {
    return this.store.uow.run(() => {
      const pkgId = 'syn-local-audio-contract';
      const itemId = 'syn-speaking-text-sample';
      const rubricId = 'syn-speaking-text-only';
      if (!this.store.knowledge.releaseState(pkgId, 'v1')) {
        const item = this.store.json.put('item', itemId, 'v1', { synthetic: true, prompt: 'Describe a quiet place you would like to create in your neighbourhood.' });
        const rubric = this.store.json.put('rubric', rubricId, 'v1', { synthetic: true, scope: 'Written content only', limitation: SPEAKING_LIMITATION });
        const pkg = this.store.json.put('package', pkgId, 'v1', { synthetic: true, purpose: 'local media contract sample; not a calibrated learning package' });
        this.store.knowledge.registerPackage(pkg, 'verified', 'local-media-contract-v1', [rubric], [{ ref: item, item_family_id: itemId, shared_stimulus_id: null, media_ids: [] }]);
        this.store.knowledge.transition(pkgId, 'v1', 'active', 'Local synthetic media contract sample only', pkg.hash);
      }
      const a = this.store.learning.createAttempt({ request_key: requestKey, scope: 'learner', item: { id: itemId, version: 'v1' },
        rubric: { id: rubricId, version: 'v1' }, mode: 'guided', purpose: 'practice' });
      this.store.db.prepare('INSERT OR IGNORE INTO audio_sessions VALUES (?)').run(a.attempt_id);
      return this.view(a.attempt_id);
    });
  }
  upload(id: string, requestKey: string, encoded: string, mediaType: string) {
    this.attempt(id);
    const bytes = Buffer.from(encoded, 'base64');
    if (!bytes.length || bytes.length > AUDIO_MAX_BYTES || bytes.toString('base64') !== encoded) return fail('Invalid or oversized audio', 400);
    // Content sniffing rejects disguised HTML/files, but does not claim to decode or assess sound quality.
    const valid = mediaType === 'audio/wav' ? bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE'
      : mediaType === 'audio/webm' ? bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
      : mediaType === 'audio/ogg' ? bytes.toString('ascii', 0, 4) === 'OggS' : false;
    if (!valid) return fail('Unsupported audio container', 400);
    return this.store.uow.run(() => {
      const prior = this.store.db.prepare('SELECT attempt_id, media_id FROM audio_recordings WHERE request_key=?').get(requestKey) as Recording | undefined;
      if (prior) {
        if (prior.attempt_id !== id || sha256(this.store.media.read(prior.media_id)) !== sha256(bytes)) return fail('Audio request key conflict');
        return this.view(id);
      }
      const ref = this.store.media.put(bytes, mediaType);
      const original = this.store.db.prepare('SELECT 1 FROM audio_recordings WHERE attempt_id=?').get(id);
      this.store.db.prepare('INSERT INTO audio_recordings VALUES (?,?,?,?,?,?)').run(randomUUID(), id, requestKey, ref.media_id, original ? 'retake' : 'original', this.store.now().toISOString());
      return this.view(id);
    });
  }
  playback(id: string, recordingId: string) {
    this.attempt(id);
    const r = this.store.db.prepare(`SELECT r.media_id,m.media_type FROM audio_recordings r JOIN media_assets m USING(media_id) WHERE r.attempt_id=? AND r.recording_id=?`).get(id, recordingId) as { media_id: string; media_type: string } | undefined;
    if (!r) return fail('Unknown recording', 404);
    return { data: this.store.media.read(r.media_id), type: r.media_type };
  }
  saveDraft(id: string, content: string) {
    this.attempt(id);
    return this.store.learning.saveSnapshot(id, 'autosave', content);
  }
  transcript(id: string, recordingId: string, requestKey: string, content: string) {
    this.attempt(id);
    if (!content.trim()) return fail('Empty transcript', 400);
    return this.store.uow.run(() => {
      if (!this.store.db.prepare('SELECT 1 FROM audio_recordings WHERE recording_id=? AND attempt_id=?').get(recordingId, id)) return fail('Unknown recording', 404);
      const prior = this.store.db.prepare('SELECT recording_id,content FROM audio_transcripts WHERE request_key=?').get(requestKey) as Transcript | undefined;
      if (prior) {
        if (prior.recording_id !== recordingId || prior.content !== content) return fail('Transcript request key conflict');
        return this.view(id);
      }
      const next = (this.store.db.prepare('SELECT COALESCE(MAX(revision)+1,0) AS n FROM audio_transcripts WHERE recording_id=?').get(recordingId) as { n: number }).n;
      this.store.db.prepare("INSERT INTO audio_transcripts VALUES (?,?,?,?, 'learner_entered',?,?)").run(randomUUID(), recordingId, requestKey, next, content, this.store.now().toISOString());
      this.store.learning.saveSnapshot(id, 'autosave', content);
      return this.view(id);
    });
  }
  async review(id: string, transcriptId: string, adapter = new FakeAdapter('success', { writingOutcome: 'inconclusive', repairOutcome: 'inconclusive' })) {
    const a = this.attempt(id);
    const t = this.store.db.prepare(`SELECT t.* FROM audio_transcripts t JOIN audio_recordings r USING(recording_id) WHERE t.transcript_id=? AND r.attempt_id=?`).get(transcriptId, id) as Transcript | undefined;
    if (!t) return fail('Unknown transcript', 404);
    const latest = this.store.db.prepare('SELECT submission_id FROM submissions WHERE attempt_id=? ORDER BY revision DESC LIMIT 1').get(id) as { submission_id: string } | undefined;
    const prior = this.store.db.prepare('SELECT kind FROM submissions WHERE request_key=?').get(`audio-text:${transcriptId}`) as { kind: string } | undefined;
    const repair = prior ? prior.kind === 'repair' : !!latest;
    // Whitelist text only. No media IDs, file paths, encoded bytes, audio resources or ASR claims enter a job.
    const { job } = submitForAssessment(this.store, { request_key: `audio-text:${transcriptId}`, attempt_id: id, content: t.content,
      ...(repair && latest ? { parent_submission_id: latest.submission_id } : {}), rubric: a.rubric, task_type: repair ? 'repair.assess' : 'writing.assess',
      required_capabilities: ['text', 'structured_result'], eligible_providers: [...CLI_PROVIDERS], timeout_seconds: 60, policy_version: 'speaking-text-e11-v1' });
    await processNextJob({ queue: this.store.queue, adapter, loadContext: (ctx) => this.store.learning.loadManifestPayload(ctx), interpret: () => [],
      owner: 'p3-speaking-text-fake', provider: 'fake', leaseMs: 60_000, heartbeatMs: 10_000, claimOptions: { jobId: job.job_id } });
    const result = this.store.queue.result(job.job_id) as Assessment | undefined;
    return { job_id: job.job_id, processing: result?.processing ?? 'pending', outcome: 'inconclusive', synthetic: true,
      limitation: SPEAKING_LIMITATION, band_reporting_enabled: false, asr: ASR };
  }
  view(id: string) {
    this.attempt(id);
    const recordings = this.store.db.prepare(`SELECT r.recording_id,r.kind,r.created_at,m.sha256,m.bytes,m.media_type
      FROM audio_recordings r JOIN media_assets m USING(media_id) WHERE attempt_id=? ORDER BY r.created_at,r.rowid`).all(id) as {
        recording_id: string; kind: string; created_at: string; sha256: string; bytes: number; media_type: string;
      }[];
    const transcripts = this.store.db.prepare(`SELECT t.transcript_id,t.recording_id,t.revision,t.source,t.content,t.created_at
      FROM audio_transcripts t JOIN audio_recordings r USING(recording_id) WHERE r.attempt_id=? ORDER BY t.created_at,t.rowid`).all(id) as Transcript[];
    const draft = this.store.db.prepare('SELECT content FROM snapshots WHERE attempt_id=? ORDER BY snapshot_version DESC LIMIT 1').get(id) as { content: string } | undefined;
    return { attempt_id: id, recordings, transcripts, draft: draft?.content ?? '', asr: ASR, limitation: SPEAKING_LIMITATION,
      band_reporting_enabled: false, synthetic: true };
  }
}
