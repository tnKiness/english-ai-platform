import { randomUUID } from 'node:crypto';
import type { AttemptRecord, LearningStore, NewAttempt, NewManifest, NewSubmission, SubmissionRecord } from '../../application/ports.js';
import type { AssistanceFact, ExposureFact, ExposureLevel, ObservationFacts, Scope, SupportImpact } from '../../domain/evidence/types.js';
import { transitionAttempt, type AttemptState } from '../../domain/learning/attempt-state.js';
import { isRevoked } from '../../domain/knowledge/revocation.js';
import { validateContract } from '../contracts/validate.js';
import { canonicalJson, sha256 } from '../files/paths.js';
import type { Db } from './database.js';
import type { KnowledgeRepository } from './knowledge-repository.js';

export class IdempotencyConflictError extends Error {}

interface AttemptRow {
  attempt_id: string; request_key: string; scope: Scope; item_id: string; item_version: string; item_hash: string;
  rubric_id: string; rubric_version: string; rubric_hash: string; mode: AttemptRecord['mode']; purpose: AttemptRecord['purpose'];
  state: AttemptState; created_at: string; evidence_source_id: string;
}
interface SubmissionRow extends Omit<SubmissionRecord, 'snapshot_version'> { request_key: string; snapshot_version: number }

const toAttempt = (r: AttemptRow): AttemptRecord => ({
  attempt_id: r.attempt_id, scope: r.scope, mode: r.mode, purpose: r.purpose, state: r.state,
  item: { id: r.item_id, version: r.item_version, hash: r.item_hash }, rubric: { id: r.rubric_id, version: r.rubric_version, hash: r.rubric_hash },
  evidence_source_id: r.evidence_source_id, created_at: r.created_at,
});

/** Learner data (SQLite is the source of truth): attempts, snapshots, immutable submissions, assistance, exposure. */
export class LearningRepository implements LearningStore {
  constructor(private db: Db, private knowledge: KnowledgeRepository, private now: () => Date = () => new Date()) {}

  private attemptRow(attemptId: string): AttemptRow | undefined {
    return this.db.prepare('SELECT a.*, e.evidence_source_id FROM attempts a JOIN evidence_sources e USING (attempt_id) WHERE a.attempt_id = ?').get(attemptId) as AttemptRow | undefined;
  }

  getAttempt(attemptId: string): AttemptRecord | undefined {
    const row = this.attemptRow(attemptId);
    return row && toAttempt(row);
  }

  /** Assigns a task: pins item + rubric version and hash at this moment (04 §4.B.1). Idempotent by request_key. */
  createAttempt(input: NewAttempt): AttemptRecord {
    return this.db.transaction(() => {
      const existing = this.db.prepare('SELECT attempt_id FROM attempts WHERE request_key = ?').get(input.request_key) as { attempt_id: string } | undefined;
      if (existing) {
        const row = this.attemptRow(existing.attempt_id)!;
        if (row.item_id !== input.item.id || row.item_version !== input.item.version || row.rubric_id !== input.rubric.id
          || row.rubric_version !== input.rubric.version || row.scope !== input.scope || row.mode !== input.mode || row.purpose !== input.purpose) {
          throw new IdempotencyConflictError('request_key reused with different attempt parameters');
        }
        return toAttempt(row);
      }
      const servable = this.knowledge.servableItem(input.item.id, input.item.version, input.scope);
      if (!servable.ok) throw new Error(`Item not assignable: ${servable.reason}`);
      const rubric = this.db.prepare("SELECT content_hash FROM json_objects WHERE kind = 'rubric' AND object_id = ? AND version = ?").get(input.rubric.id, input.rubric.version) as { content_hash: string } | undefined;
      if (!rubric) throw new Error('Unknown rubric version');
      if (isRevoked('rubric', input.rubric.id, input.rubric.version, this.knowledge.revocations())) throw new Error('Rubric not assignable: REVOKED');
      const at = this.now().toISOString();
      const attemptId = randomUUID();
      const record: AttemptRecord = {
        attempt_id: attemptId, scope: input.scope, mode: input.mode, purpose: input.purpose, state: 'DRAFT',
        item: { id: input.item.id, version: input.item.version, hash: servable.hash },
        rubric: { id: input.rubric.id, version: input.rubric.version, hash: rubric.content_hash },
        evidence_source_id: randomUUID(), created_at: at,
      };
      const { evidence_source_id: _source, ...contract } = record;
      if (!validateContract('attempt', { schema_version: '1', ...contract })) throw new Error('Attempt violates contract');
      this.db.prepare(`INSERT INTO attempts (attempt_id, request_key, scope, item_id, item_version, item_hash, rubric_id, rubric_version, rubric_hash, mode, purpose, state, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?)`).run(attemptId, input.request_key, input.scope, record.item.id, record.item.version, record.item.hash,
        record.rubric.id, record.rubric.version, record.rubric.hash, input.mode, input.purpose, at, at);
      this.db.prepare('INSERT INTO evidence_sources (evidence_source_id, attempt_id, scope, created_at) VALUES (?, ?, ?, ?)').run(record.evidence_source_id, attemptId, input.scope, at);
      return record;
    }).immediate();
  }

  saveSnapshot(attemptId: string, kind: 'autosave' | 'pre_assistance' | 'post_assistance' | 'submitted', content: string): { snapshot_id: string; snapshot_version: number } {
    return this.db.transaction(() => {
      const next = (this.db.prepare('SELECT COALESCE(MAX(snapshot_version) + 1, 0) AS v FROM snapshots WHERE attempt_id = ?').get(attemptId) as { v: number }).v;
      const id = randomUUID();
      this.db.prepare('INSERT INTO snapshots (snapshot_id, attempt_id, snapshot_version, kind, content_hash, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(id, attemptId, next, kind, sha256(content), content, this.now().toISOString());
      return { snapshot_id: id, snapshot_version: next };
    })();
  }

  private submissionRow(where: string, value: string): SubmissionRow | undefined {
    return this.db.prepare(`SELECT s.submission_id, s.request_key, s.attempt_id, s.revision, s.kind, s.parent_submission_id, s.evidence_source_id, s.snapshot_id,
      n.snapshot_version, s.content_hash, s.repair_attempt_index, s.created_at FROM submissions s JOIN snapshots n USING (snapshot_id) WHERE s.${where} = ?`).get(value) as SubmissionRow | undefined;
  }

  getSubmission(submissionId: string): SubmissionRecord | undefined {
    const row = this.submissionRow('submission_id', submissionId);
    if (!row) return undefined;
    const { request_key: _key, ...rest } = row;
    return rest;
  }

  /**
   * Stores an immutable revision. A repair is linked to the same evidence source as the original and only an
   * actual repair submission increments repair_attempt_index (04 §2.D). Idempotent by request_key.
   */
  submit(input: NewSubmission): SubmissionRecord {
    return this.db.transaction(() => {
      const prior = this.submissionRow('request_key', input.request_key);
      if (prior) {
        if (prior.attempt_id !== input.attempt_id || prior.content_hash !== sha256(input.content)) throw new IdempotencyConflictError('request_key reused with different submission');
        const { request_key: _key, ...rest } = prior;
        return rest;
      }
      const attempt = this.attemptRow(input.attempt_id);
      if (!attempt) throw new Error('Unknown attempt');
      const isRepair = input.parent_submission_id !== undefined;
      const counts = this.db.prepare("SELECT COALESCE(MAX(revision), -1) AS max_rev, SUM(kind = 'repair') AS repairs FROM submissions WHERE attempt_id = ?").get(input.attempt_id) as { max_rev: number; repairs: number | null };
      if (!isRepair && counts.max_rev >= 0) throw new Error('Attempt already has an original submission');
      if (isRepair && counts.max_rev < 0) throw new Error('Repair needs an original submission');
      const nextState: AttemptState = isRepair ? 'REPAIRING' : 'SUBMITTED';
      if (attempt.state !== nextState) transitionAttempt(attempt.state, nextState);
      const snapshot = this.saveSnapshot(input.attempt_id, 'submitted', input.content);
      const at = this.now().toISOString();
      const record: SubmissionRecord = {
        submission_id: randomUUID(), attempt_id: input.attempt_id, revision: counts.max_rev + 1, kind: isRepair ? 'repair' : 'original',
        parent_submission_id: input.parent_submission_id ?? null, evidence_source_id: attempt.evidence_source_id, snapshot_id: snapshot.snapshot_id,
        snapshot_version: snapshot.snapshot_version, content_hash: sha256(input.content), repair_attempt_index: isRepair ? (counts.repairs ?? 0) + 1 : 0, created_at: at,
      };
      const { snapshot_id: _s, snapshot_version: _v, ...contract } = record;
      if (!validateContract('submission', { schema_version: '1', ...contract })) throw new Error('Submission violates contract');
      this.db.prepare(`INSERT INTO submissions (submission_id, request_key, attempt_id, revision, kind, parent_submission_id, evidence_source_id, snapshot_id, content_hash, content, media_id, repair_attempt_index, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(record.submission_id, input.request_key, record.attempt_id, record.revision, record.kind, record.parent_submission_id,
        record.evidence_source_id, record.snapshot_id, record.content_hash, input.content, input.media_id ?? null, record.repair_attempt_index, at);
      if (attempt.state !== nextState) this.db.prepare('UPDATE attempts SET state = ?, updated_at = ? WHERE attempt_id = ?').run(nextState, at, input.attempt_id);
      return record;
    }).immediate();
  }

  submissionContent(submissionId: string): string {
    const row = this.db.prepare('SELECT content, content_hash FROM submissions WHERE submission_id = ?').get(submissionId) as { content: string; content_hash: string } | undefined;
    if (!row) throw new Error('Unknown submission');
    if (sha256(row.content) !== row.content_hash) throw new Error('Submission content checksum mismatch');
    return row.content;
  }

  setAttemptState(attemptId: string, to: AttemptState): void {
    this.db.transaction(() => {
      const row = this.attemptRow(attemptId);
      if (!row) throw new Error('Unknown attempt');
      transitionAttempt(row.state, to);
      this.db.prepare('UPDATE attempts SET state = ?, updated_at = ? WHERE attempt_id = ?').run(to, this.now().toISOString(), attemptId);
    }).immediate();
  }

  /** Idempotent: a repeated request returns the first event, so a hint shown twice is recorded once. */
  recordAssistance(e: { idempotency_key: string; attempt_id: string; submission_id: string; hint_level: number; content: string; impacts: { competency_id: string; impact: SupportImpact; reduced_load: boolean }[]; pre_snapshot_id: string | null; post_snapshot_id: string | null }): { event_id: string; created: boolean } {
    return this.db.transaction(() => {
      const prior = this.db.prepare('SELECT event_id FROM assistance_events WHERE idempotency_key = ?').get(e.idempotency_key) as { event_id: string } | undefined;
      if (prior) return { event_id: prior.event_id, created: false };
      const event = { schema_version: '1', event_id: randomUUID(), idempotency_key: e.idempotency_key, attempt_id: e.attempt_id, submission_id: e.submission_id, hint_level: e.hint_level,
        content_hash: sha256(e.content), competency_impacts: e.impacts, pre_snapshot_id: e.pre_snapshot_id, post_snapshot_id: e.post_snapshot_id, displayed_at: this.now().toISOString() };
      if (!validateContract('assistance', event)) throw new Error('Assistance event violates contract');
      this.db.prepare('INSERT INTO assistance_events (event_id, idempotency_key, attempt_id, submission_id, hint_level, content_hash, pre_snapshot_id, post_snapshot_id, displayed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(event.event_id, event.idempotency_key, event.attempt_id, event.submission_id, event.hint_level, event.content_hash, event.pre_snapshot_id, event.post_snapshot_id, event.displayed_at);
      const impact = this.db.prepare('INSERT INTO assistance_impacts (event_id, competency_id, impact, reduced_load) VALUES (?, ?, ?, ?)');
      for (const i of e.impacts) impact.run(event.event_id, i.competency_id, i.impact, i.reduced_load ? 1 : 0);
      return { event_id: event.event_id, created: true };
    }).immediate();
  }

  assistanceFor(attemptId: string): AssistanceFact[] {
    const events = this.db.prepare('SELECT event_id, displayed_at FROM assistance_events WHERE attempt_id = ? ORDER BY displayed_at').all(attemptId) as { event_id: string; displayed_at: string }[];
    const impacts = this.db.prepare('SELECT competency_id, impact, reduced_load FROM assistance_impacts WHERE event_id = ?');
    return events.map((ev) => ({ displayed_at: ev.displayed_at,
      impacts: (impacts.all(ev.event_id) as { competency_id: string; impact: SupportImpact; reduced_load: number }[]).map((i) => ({ ...i, reduced_load: i.reduced_load === 1 })) }));
  }

  /** Shared exposure log (06 §4.1). Must be written before or with the content being served. */
  recordExposure(e: { idempotency_key: string; item: { id: string; version: string; hash: string }; item_family_id: string; shared_stimulus_id: string | null; surface: 'builder' | 'learner'; scope: Scope; level: ExposureLevel }): { event_id: string; created: boolean } {
    return this.db.transaction(() => {
      const prior = this.db.prepare('SELECT event_id FROM exposure_events WHERE idempotency_key = ?').get(e.idempotency_key) as { event_id: string } | undefined;
      if (prior) return { event_id: prior.event_id, created: false };
      const event = { schema_version: '1', event_id: randomUUID(), ...e, seen_at: this.now().toISOString() };
      if (!validateContract('exposure', event)) throw new Error('Exposure event violates contract');
      this.db.prepare('INSERT INTO exposure_events (event_id, idempotency_key, item_id, item_version, item_hash, item_family_id, shared_stimulus_id, surface, scope, level, seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(event.event_id, e.idempotency_key, e.item.id, e.item.version, e.item.hash, e.item_family_id, e.shared_stimulus_id, e.surface, e.scope, e.level, event.seen_at);
      return { event_id: event.event_id, created: true };
    }).immediate();
  }

  /** Every exposure of the single human user, from either surface (dry-run viewing still exposes the person). */
  exposures(): ExposureFact[] {
    return this.db.prepare('SELECT item_id, item_family_id, shared_stimulus_id, level FROM exposure_events').all() as ExposureFact[];
  }

  createManifest(m: NewManifest): { manifest_id: string; input_hash: string } {
    const inputHash = sha256(canonicalJson(m.payload));
    return this.db.transaction(() => {
      const prior = this.db.prepare('SELECT input_hash FROM context_manifests WHERE manifest_id = ?').get(m.manifest_id) as { input_hash: string } | undefined;
      if (prior) {
        if (prior.input_hash !== inputHash) throw new IdempotencyConflictError('Manifest id reused with different payload');
        return { manifest_id: m.manifest_id, input_hash: inputHash };
      }
      const contract = { schema_version: '1', manifest_id: m.manifest_id, role: m.role, phase: m.phase, input_hash: inputHash, policy_version: m.policy_version,
        rubric: m.rubric, knowledge: m.knowledge.map(({ id, version, hash }) => ({ id, version, hash })), disclosure_level: m.disclosure_level, allowed_resource_ids: m.allowed_resource_ids };
      if (!validateContract('manifest', contract)) throw new Error('Manifest violates contract');
      this.db.prepare('INSERT INTO context_manifests (manifest_id, role, phase, input_hash, policy_version, rubric_id, rubric_version, rubric_hash, disclosure_level, allowed_resource_ids, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(m.manifest_id, m.role, m.phase, inputHash, m.policy_version, m.rubric?.id ?? null, m.rubric?.version ?? null, m.rubric?.hash ?? null, m.disclosure_level,
          JSON.stringify(m.allowed_resource_ids), canonicalJson(m.payload), this.now().toISOString());
      const k = this.db.prepare('INSERT INTO manifest_knowledge (manifest_id, kind, object_id, version, content_hash) VALUES (?, ?, ?, ?, ?)');
      for (const ref of m.knowledge) k.run(m.manifest_id, ref.kind, ref.id, ref.version, ref.hash);
      return { manifest_id: m.manifest_id, input_hash: inputHash };
    }).immediate();
  }

  loadManifestPayload(manifestId: string): Readonly<Record<string, unknown>> {
    const row = this.db.prepare('SELECT payload_json, input_hash FROM context_manifests WHERE manifest_id = ?').get(manifestId) as { payload_json: string; input_hash: string } | undefined;
    if (!row) throw new Error('Unknown manifest');
    if (sha256(row.payload_json) !== row.input_hash) throw new Error('Manifest payload checksum mismatch');
    return Object.freeze(JSON.parse(row.payload_json) as Record<string, unknown>);
  }

  /** Stored observations for one competency in one scope — learner queries never see dry-run rows. */
  observations(competencyId: string, scope: Scope): ObservationFacts[] {
    const rows = this.db.prepare(`SELECT observation_id, evidence_source_id, submission_id, competency_id, item_id, item_version, item_hash, rubric_id, rubric_version, rubric_hash,
      ai_run_id, supersedes_id, processing, outcome, measurement_quality, opportunity, support_impact, scope FROM observations WHERE competency_id = ? AND scope = ? ORDER BY created_at, observation_id`)
      .all(competencyId, scope) as (Omit<ObservationFacts, 'item' | 'rubric'> & { item_id: string; item_version: string; item_hash: string; rubric_id: string; rubric_version: string; rubric_hash: string })[];
    return rows.map(({ item_id, item_version, item_hash, rubric_id, rubric_version, rubric_hash, ...o }) => ({
      ...o, item: { id: item_id, version: item_version, hash: item_hash }, rubric: { id: rubric_id, version: rubric_version, hash: rubric_hash } }));
  }
}
