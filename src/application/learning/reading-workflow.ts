import { blindTaskView, scopedReader } from '../context/scoped-reader.js';
import { scoreReading, READING_HINTS, type ReadingAnswer, type ReadingKey } from '../../domain/learning/reading.js';
import type { Mode } from '../../domain/evidence/types.js';
import type { Store } from '../../infrastructure/sqlite/store.js';
import { canonicalJson } from '../../infrastructure/files/paths.js';

type Item = { governance: { scope: { skills: string[] } }; body: Parameters<typeof blindTaskView>[0] };
type Session = { key_id: string; key_version: string; key_hash: string; unlocked_level: number };
const fail = (message: string, statusCode = 409): never => { throw Object.assign(new Error(message), { statusCode }); };

/** Released P2 content only. No AI call is needed to compare an answer with a QC4-approved key. */
export class ReadingWorkflow {
  constructor(private store: Store) {}

  private released(itemId: string, version: string) {
    const s = this.store.knowledge.servableItem(itemId, version, 'learner');
    if (!s.ok) return fail(`Reading unavailable: ${s.reason}`);
    const bundle = this.store.builder.bundle(s.package_id, s.package_version);
    const manifest = this.store.builder.releaseManifest(s.package_id, s.package_version) as {
      bundle_hash: string; qc: { stage: string; status: string }[]; grants: { usage_role: string; granted: boolean }[];
    } | undefined;
    if (!bundle || bundle.content_origin !== 'synthetic_fixture' || !manifest || manifest.bundle_hash !== bundle.bundle_hash
      || !manifest.qc.some((q) => q.stage === 'QC4' && q.status === 'PASS')
      || !manifest.grants.some((g) => g.usage_role === 'practice' && g.granted)) return fail('Reading requires released synthetic QC4 practice content');
    return s;
  }

  private item(id: string, version: string) {
    const permission = this.store.builder.unitPermission('item', id, version);
    if (!permission?.roles.includes('learner')) return fail('Learner access denied', 403);
    const item = scopedReader('blind_solver', this.store.builder, this.store.json).read('item', id, version).value as Item;
    if (!item.governance.scope.skills.includes('reading') || item.body.stimulus.media.length) return fail('Unsupported Reading task');
    return item;
  }

  catalog() {
    const items: { item_id: string; version: string; title: string }[] = [];
    for (const b of this.store.builder.bundles()) {
      for (const u of this.store.builder.packageUnits(b.package_id, b.version).filter((u) => u.kind === 'item')) {
        if (!this.store.knowledge.servableItem(u.id, u.version, 'learner').ok) continue;
        try {
          this.released(u.id, u.version);
          this.item(u.id, u.version);
          // Metadata only; viewing the catalog does not expose the prompt.
          items.push({ item_id: u.id, version: u.version, title: `Reading synthetic — ${u.id}` });
        } catch { /* unsupported/unqualified content is not offered */ }
      }
    }
    const attempts = this.store.db.prepare(`SELECT a.attempt_id, a.state FROM attempts a JOIN reading_sessions r USING(attempt_id) WHERE a.scope = 'learner' ORDER BY a.created_at DESC`).all();
    return { items, attempts, band_reporting_enabled: false };
  }

  start(itemId: string, version: string, mode: Mode, requestKey: string) {
    return this.store.uow.run(() => {
      const s = this.released(itemId, version);
      this.item(itemId, version);
      const units = this.store.builder.packageUnits(s.package_id, s.package_version);
      const keys = units.filter((u) => u.unit_type === 'answer_key').filter((u) => {
        const key = scopedReader('assessor', this.store.builder, this.store.json).read('knowledge', u.id, u.version).value as { body: ReadingKey };
        return key.body.item.id === itemId && key.body.item.version === version;
      });
      const rubric = units.find((u) => u.kind === 'rubric');
      if (keys.length !== 1 || !rubric) return fail('Reading key/rubric unavailable');
      const key = keys[0]!;
      if (!this.store.builder.isReleasedUnit('knowledge', key.id, key.version)) return fail('Key withdrawn');
      const a = this.store.learning.createAttempt({ request_key: requestKey, scope: 'learner', item: { id: itemId, version }, rubric, mode, purpose: 'practice' });
      this.store.db.prepare('INSERT OR IGNORE INTO reading_sessions(attempt_id,key_id,key_version,key_hash) VALUES (?,?,?,?)')
        .run(a.attempt_id, key.id, key.version, key.hash);
      this.store.learning.recordExposure({ idempotency_key: `reading:prompt:${a.attempt_id}`, item: a.item, item_family_id: s.item_family_id,
        shared_stimulus_id: s.shared_stimulus_id, scope: 'learner', surface: 'learner', level: 'prompt' });
      return this.view(a.attempt_id);
    });
  }

  private context(id: string) {
    const a = this.store.learning.getAttempt(id);
    const r = this.store.db.prepare('SELECT * FROM reading_sessions WHERE attempt_id=?').get(id) as Session | undefined;
    if (!a || a.scope !== 'learner' || !r) return fail('Unknown Reading attempt', 404);
    const s = this.released(a.item.id, a.item.version);
    if (s.hash !== a.item.hash || !this.store.builder.isReleasedUnit('knowledge', r.key_id, r.key_version)) return fail('Pinned Reading content unavailable');
    return { a, r, s };
  }

  private key(r: Session): ReadingKey {
    const read = scopedReader('assessor', this.store.builder, this.store.json).read('knowledge', r.key_id, r.key_version);
    if (read.hash !== r.key_hash) return fail('Pinned key changed');
    return (read.value as { body: ReadingKey }).body;
  }

  save(id: string, content: string) {
    this.context(id);
    return this.store.learning.saveSnapshot(id, 'autosave', content);
  }

  submit(id: string, requestKey: string, answers: ReadingAnswer[]) {
    return this.store.uow.run(() => {
      const { a, r } = this.context(id);
      const qs = this.item(a.item.id, a.item.version).body.questions;
      if (new Set(answers.map((x) => x.question_id)).size !== answers.length || answers.some((x) => !qs.some((q) => q.question_id === x.question_id))) return fail('Invalid question IDs', 400);
      const content = canonicalJson(answers);
      const latest = this.store.db.prepare('SELECT submission_id FROM submissions WHERE attempt_id=? ORDER BY revision DESC LIMIT 1').get(id) as { submission_id: string } | undefined;
      const sub = this.store.learning.submit({ attempt_id: id, request_key: requestKey, content,
        ...(latest ? { parent_submission_id: latest.submission_id } : {}) });
      this.store.db.prepare('INSERT OR IGNORE INTO reading_results VALUES (?,?,?)')
        .run(sub.submission_id, canonicalJson(scoreReading(this.key(r), answers)), this.store.now().toISOString());
      return this.view(id);
    });
  }

  unlock(id: string, level: number) {
    return this.store.uow.run(() => {
      const { a, r, s } = this.context(id);
      const sub = this.store.db.prepare('SELECT submission_id FROM submissions WHERE attempt_id=? ORDER BY revision DESC LIMIT 1').get(id) as { submission_id: string } | undefined;
      if (!sub || a.mode === 'exam' || a.purpose !== 'practice') return fail('Hints not permitted', 403);
      if (level < 1 || level > 3 || level > r.unlocked_level + 1) return fail('Unlock hints in order', 403);
      if (level > r.unlocked_level) {
        const snap = this.store.db.prepare('SELECT content FROM snapshots WHERE attempt_id=? ORDER BY snapshot_version DESC LIMIT 1').get(id) as { content: string };
        const pre = this.store.learning.saveSnapshot(id, 'pre_assistance', snap.content);
        const content = level === 3 ? canonicalJson(this.key(r).answers) : READING_HINTS[level - 1]!;
        this.store.learning.recordAssistance({ idempotency_key: `reading:hint:${id}:${level}`, attempt_id: id, submission_id: sub.submission_id,
          hint_level: level, content, impacts: this.key(r).measurement_targets.map((competency_id) => ({ competency_id, impact: 'affected', reduced_load: true })),
          pre_snapshot_id: pre.snapshot_id, post_snapshot_id: null });
        for (const exposure of level === 3 ? ['answer', 'explanation'] as const : ['hint'] as const) {
          this.store.learning.recordExposure({ idempotency_key: `reading:${exposure}:${id}:${level}`, item: a.item, item_family_id: s.item_family_id,
            shared_stimulus_id: s.shared_stimulus_id, surface: 'learner', scope: 'learner', level: exposure });
        }
        this.store.db.prepare('UPDATE reading_sessions SET unlocked_level=? WHERE attempt_id=?').run(level, id);
      }
      return this.view(id);
    });
  }

  view(id: string) {
    const { a, r } = this.context(id);
    const task = blindTaskView(this.item(a.item.id, a.item.version).body);
    const draft = this.store.db.prepare('SELECT content, snapshot_version FROM snapshots WHERE attempt_id=? ORDER BY snapshot_version DESC LIMIT 1').get(id) as { content: string; snapshot_version: number } | undefined;
    const submissions = this.store.db.prepare(`SELECT s.submission_id,s.revision,s.kind,s.content,r.results_json FROM submissions s
      JOIN reading_results r USING(submission_id) WHERE s.attempt_id=? ORDER BY s.revision`).all(id) as { submission_id: string; revision: number; kind: string; content: string; results_json: string }[];
    const level = a.mode === 'exam' ? 0 : r.unlocked_level;
    // No answer-key retrieval for a learner view until level 3 is authorized.
    return { attempt_id: id, mode: a.mode, state: a.state, task, draft: draft ?? null,
      submissions: submissions.map(({ results_json, ...s }) => ({ ...s, results: JSON.parse(results_json) as ReturnType<typeof scoreReading> })),
      unlocked_level: level, hints: READING_HINTS.slice(0, Math.min(level, 2)),
      ...(level === 3 ? { explanation: this.key(r).answers } : {}),
      synthetic: true, band_reporting_enabled: false, conclusion: 'Chỉ ghi kết quả câu hỏi; chưa đủ kết luận năng lực. Lý giải tự sửa chưa được thẩm định.' };
  }
}
