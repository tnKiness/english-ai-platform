// E-54 (D-05 N1, E-44): the learner side of AI-authored Listening parts. Released ai_authored parts only. The learner
// gets the context, the questions and the audio; the transcript (stimulus text) and the key stay on the server until
// the answers are submitted, and showing them afterwards records answer/explanation exposure. Answers are compared
// with the QC4-checked key deterministically (no AI call). Like Reading, a score is recorded per question but no
// competency conclusion is drawn from it (03 §3: item correctness is separate from diagnosis and measurement).
import { scopedReader } from '../context/scoped-reader.js';
import type { Mode } from '../../domain/evidence/types.js';
import { normalizeForQuote } from '../../domain/knowledge/framework-checks.js';
import { parseWav, wavDurationSeconds } from '../../infrastructure/audio/wav.js';
import { canonicalJson } from '../../infrastructure/files/paths.js';
import type { Store } from '../../infrastructure/sqlite/store.js';

interface ItemBody { stimulus: { text: string | null; media: string[] }; prompt: string; item_family_id: string; decisive_features: string[]; questions: { question_id: string; prompt: string; response_type: string; options: string[] }[] }
interface Key { item: { id: string; version: string }; answers: { question_id: string; accepted: string[]; explanation: string }[]; measurement_targets: string[] }
export interface ListeningAnswer { question_id: string; answer: string }
export type ListeningResult = { question_id: string; item_result: 'correct' | 'incorrect' | 'unanswered' };
type Session = { key_id: string; key_version: string; key_hash: string; plays: number };
const fail = (message: string, statusCode = 409): never => { throw Object.assign(new Error(message), { statusCode }); };
const norm = (s: string) => normalizeForQuote(s).replace(/[.,;:!?]+$/g, '');

/** Deterministic scoring against the accepted forms (case, spacing, quotes and final punctuation ignored). */
export function scoreListening(key: Key, answers: ListeningAnswer[]): ListeningResult[] {
  return key.answers.map((k) => {
    const a = answers.find((x) => x.question_id === k.question_id)?.answer ?? '';
    return { question_id: k.question_id, item_result: !a.trim() ? 'unanswered' : k.accepted.some((v) => norm(v) === norm(a)) ? 'correct' : 'incorrect' };
  });
}

export class ListeningWorkflow {
  constructor(private store: Store) {}

  private released(itemId: string, version: string) {
    const s = this.store.knowledge.servableItem(itemId, version, 'learner');
    if (!s.ok) return fail(`Listening unavailable: ${s.reason}`);
    const bundle = this.store.builder.bundle(s.package_id, s.package_version);
    if (!bundle || bundle.content_origin !== 'ai_authored') return fail('Listening requires released AI-authored content (E-54)');
    return s;
  }

  private item(itemId: string, version: string): { governance: { scope: { skills: string[]; task_types: string[] } }; body: ItemBody } {
    const permission = this.store.builder.unitPermission('item', itemId, version);
    if (!permission?.roles.includes('learner')) return fail('Learner access denied', 403);
    const item = scopedReader('assessor', this.store.builder, this.store.json).read('item', itemId, version).value as { governance: { scope: { skills: string[]; task_types: string[] } }; body: ItemBody };
    if (!item.governance.scope.skills.includes('listening') || item.body.stimulus.media.length !== 1) return fail('Unsupported Listening task');
    return item;
  }

  private keyUnit(s: { package_id: string; package_version: string }, itemId: string, version: string) {
    const keys = this.store.builder.packageUnits(s.package_id, s.package_version).filter((u) => u.unit_type === 'answer_key').filter((u) => {
      const k = (scopedReader('assessor', this.store.builder, this.store.json).read('knowledge', u.id, u.version).value as { body: Key }).body;
      return k.item.id === itemId && k.item.version === version;
    });
    if (keys.length !== 1) return fail('Listening key unavailable');
    return keys[0]!;
  }

  private minutes(sha: string): number {
    try { return Math.max(1, Math.round(wavDurationSeconds(parseWav(new Uint8Array(this.store.media.read(`media_${sha}`)))) / 60)); } catch { return 0; }
  }

  /** Released parts, metadata only (no transcript, no questions): listing is not an exposure. */
  catalog() {
    const exposures = this.store.learning.exposures();
    const items: { item_id: string; version: string; title: string; part: string; questions: number; audio_minutes: number; seen: boolean }[] = [];
    for (const b of this.store.builder.bundles()) {
      if (b.content_origin !== 'ai_authored' || this.store.knowledge.releaseState(b.package_id, b.version) !== 'active') continue;
      for (const u of this.store.builder.packageUnits(b.package_id, b.version).filter((x) => x.kind === 'item')) {
        try {
          this.released(u.id, u.version);
          const it = this.item(u.id, u.version);
          const [part = 'part?', topic = u.id] = it.body.decisive_features;
          items.push({ item_id: u.id, version: u.version, title: `Listening ${part.replace('part', 'Part ')} — ${topic}`, part, questions: it.body.questions.length,
            audio_minutes: this.minutes(it.body.stimulus.media[0]!), seen: exposures.some((e) => e.item_id === u.id) });
        } catch { /* not a servable Listening part */ }
      }
    }
    const attempts = this.store.db.prepare(`SELECT a.attempt_id, a.state, a.item_id, a.mode FROM attempts a JOIN listening_sessions l USING(attempt_id) WHERE a.scope = 'learner' ORDER BY a.created_at DESC LIMIT 20`).all();
    return { items: items.sort((a, b) => Number(a.seen) - Number(b.seen) || a.title.localeCompare(b.title)), attempts, band_reporting_enabled: false };
  }

  start(itemId: string, version: string, mode: Mode, requestKey: string) {
    if (mode === 'guided') return fail('Listening chỉ có chế độ tự luyện hoặc mô phỏng thi', 400);
    return this.store.uow.run(() => {
      const s = this.released(itemId, version);
      this.item(itemId, version);
      const key = this.keyUnit(s, itemId, version);
      const rubric = this.store.builder.packageUnits(s.package_id, s.package_version).find((u) => u.kind === 'rubric');
      if (!rubric) return fail('Listening rubric unavailable');
      const a = this.store.learning.createAttempt({ request_key: requestKey, scope: 'learner', item: { id: itemId, version }, rubric, mode, purpose: 'practice' });
      this.store.db.prepare('INSERT OR IGNORE INTO listening_sessions (attempt_id, key_id, key_version, key_hash) VALUES (?, ?, ?, ?)').run(a.attempt_id, key.id, key.version, key.hash);
      this.store.learning.recordExposure({ idempotency_key: `listening:prompt:${a.attempt_id}`, item: a.item, item_family_id: s.item_family_id, shared_stimulus_id: s.shared_stimulus_id,
        scope: 'learner', surface: 'learner', level: 'prompt' });
      return this.view(a.attempt_id);
    });
  }

  private context(id: string) {
    const a = this.store.learning.getAttempt(id);
    const r = this.store.db.prepare('SELECT * FROM listening_sessions WHERE attempt_id = ?').get(id) as Session | undefined;
    if (!a || a.scope !== 'learner' || !r) return fail('Unknown Listening attempt', 404);
    const s = this.released(a.item.id, a.item.version);
    if (s.hash !== a.item.hash || !this.store.builder.isReleasedUnit('knowledge', r.key_id, r.key_version)) return fail('Pinned Listening content unavailable');
    return { a, r, s };
  }

  private key(r: Session): Key {
    const read = scopedReader('assessor', this.store.builder, this.store.json).read('knowledge', r.key_id, r.key_version);
    if (read.hash !== r.key_hash) return fail('Pinned key changed');
    return (read.value as { body: Key }).body;
  }

  /**
   * The recording. Requests are counted (`plays`), not refused: browsers re-request audio for seeking and buffering,
   * so the one-play rule of exam mode is applied by the player (no replay control), not by failing a request.
   */
  audio(id: string): { bytes: Buffer; type: string } {
    const { a } = this.context(id);
    const body = this.item(a.item.id, a.item.version).body;
    this.store.db.prepare('UPDATE listening_sessions SET plays = plays + 1 WHERE attempt_id = ?').run(id);
    return { bytes: this.store.media.read(`media_${body.stimulus.media[0]}`), type: 'audio/wav' };
  }

  submit(id: string, requestKey: string, answers: ListeningAnswer[]) {
    return this.store.uow.run(() => {
      const { a, r, s } = this.context(id);
      const qs = this.item(a.item.id, a.item.version).body.questions;
      if (new Set(answers.map((x) => x.question_id)).size !== answers.length || answers.some((x) => !qs.some((q) => q.question_id === x.question_id))) return fail('Invalid question IDs', 400);
      const latest = this.store.db.prepare('SELECT submission_id FROM submissions WHERE attempt_id = ? ORDER BY revision DESC LIMIT 1').get(id) as { submission_id: string } | undefined;
      if (latest) return this.view(id); // one scored submission per attempt; start a new attempt to try again
      const sub = this.store.learning.submit({ attempt_id: id, request_key: requestKey, content: canonicalJson(answers) });
      this.store.db.prepare('INSERT OR IGNORE INTO listening_results VALUES (?, ?, ?)').run(sub.submission_id, canonicalJson(scoreListening(this.key(r), answers)), this.store.now().toISOString());
      // The review that follows shows the transcript and the key: record that exposure now, before it is read.
      for (const level of ['answer', 'explanation'] as const) {
        this.store.learning.recordExposure({ idempotency_key: `listening:${level}:${id}`, item: a.item, item_family_id: s.item_family_id, shared_stimulus_id: s.shared_stimulus_id,
          surface: 'learner', scope: 'learner', level });
      }
      return this.view(id);
    });
  }

  view(id: string) {
    const { a, r } = this.context(id);
    const item = this.item(a.item.id, a.item.version);
    const sub = this.store.db.prepare(`SELECT s.submission_id, s.content, l.results_json FROM submissions s JOIN listening_results l USING(submission_id) WHERE s.attempt_id = ? ORDER BY s.revision DESC LIMIT 1`)
      .get(id) as { submission_id: string; content: string; results_json: string } | undefined;
    const [part = 'part?', topic = a.item.id] = item.body.decisive_features;
    const base = {
      attempt_id: id, mode: a.mode, state: a.state, title: `Listening ${part.replace('part', 'Part ')} — ${topic}`, instructions: item.body.prompt,
      questions: item.body.questions.map((q) => ({ question_id: q.question_id, prompt: q.prompt, response_type: q.response_type, options: q.options })),
      audio_url: `/api/learning/listening/${encodeURIComponent(id)}/audio`, plays: r.plays, band_reporting_enabled: false,
      conclusion: 'Chỉ ghi đúng/sai từng câu; chưa kết luận năng lực Listening (03 §3).',
    };
    if (!sub) return { ...base, submitted: false as const };
    const results = JSON.parse(sub.results_json) as ListeningResult[];
    const key = this.key(r);
    return {
      ...base, submitted: true as const, answers: JSON.parse(sub.content) as ListeningAnswer[], results,
      score: { correct: results.filter((x) => x.item_result === 'correct').length, total: results.length },
      // After submission only: transcript and key with the quoted evidence (exposure recorded at submit).
      review: { transcript: item.body.stimulus.text, key: key.answers.map((k) => ({ question_id: k.question_id, accepted: k.accepted, evidence: k.explanation })) },
    };
  }
}
