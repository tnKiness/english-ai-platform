import { randomUUID } from 'node:crypto';
import type { BuilderStore, QcJobRow, QcRow, ReviewInput, ReviewRow, SourceRow, StagedUnit, UnitPermission } from '../../application/qc/ports.js';
import type { Revocation } from '../../domain/evidence/types.js';
import { validateKnowledge } from '../contracts/validate.js';
import type { JsonKind } from '../files/json-store.js';
import { canonicalJson, sha256 } from '../files/paths.js';
import type { Db } from './database.js';

const parse = <T>(json: string): T => JSON.parse(json) as T;

/** Builder/QC persistence (migration 0002). Staging is mutable; everything QC or release relies on is append-only. */
export class BuilderRepository implements BuilderStore {
  constructor(private db: Db, private now: () => Date = () => new Date()) {}
  private iso() { return this.now().toISOString(); }
  transaction<T>(fn: () => T): T { return this.db.transaction(fn).immediate(); }

  // ---- Output 1: Source Registry -------------------------------------------------------------
  registerSource(record: unknown): { source_id: string; version: string; hash: string } {
    const checked = validateKnowledge('source_record', record);
    if (!checked.ok) throw new Error(`source_record invalid: ${checked.errors.join('; ')}`);
    const r = record as { source_id: string; version: string; origin: string; rights: { status: string }; registry_state: string };
    const json = canonicalJson(record);
    const hash = sha256(json);
    const prior = this.db.prepare('SELECT record_hash FROM source_records WHERE source_id = ? AND version = ?').get(r.source_id, r.version) as { record_hash: string } | undefined;
    if (prior) {
      if (prior.record_hash !== hash) throw new Error(`Source ${r.source_id}@${r.version} already registered with different content; add a new version`);
      return { source_id: r.source_id, version: r.version, hash };
    }
    this.db.prepare('INSERT INTO source_records (source_id, version, origin, rights_status, registry_state, record_hash, record_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(r.source_id, r.version, r.origin, r.rights.status, r.registry_state, hash, json, this.iso());
    return { source_id: r.source_id, version: r.version, hash };
  }

  source(sourceId: string, version: string): SourceRow | undefined {
    const row = this.db.prepare('SELECT record_json, record_hash FROM source_records WHERE source_id = ? AND version = ?').get(sourceId, version) as { record_json: string; record_hash: string } | undefined;
    return row && { record: parse<SourceRow['record']>(row.record_json), hash: row.record_hash };
  }

  /** Newest version by insertion; a later record (e.g. rights withdrawn) overrides older approvals. */
  latestSource(sourceId: string): SourceRow | undefined {
    const row = this.db.prepare('SELECT record_json, record_hash FROM source_records WHERE source_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1').get(sourceId) as { record_json: string; record_hash: string } | undefined;
    return row && { record: parse<SourceRow['record']>(row.record_json), hash: row.record_hash };
  }

  // ---- Package request + staging (playbook steps 1–3) -----------------------------------------
  createRequest(request: unknown): { request_id: string; package_id: string; content_origin: 'synthetic_fixture' | 'sourced' } {
    const checked = validateKnowledge('package_request', request);
    if (!checked.ok) throw new Error(`package_request invalid: ${checked.errors.join('; ')}`);
    const r = request as { request_id: string; package_id: string; content_origin: 'synthetic_fixture' | 'sourced' };
    const json = canonicalJson(request);
    const prior = this.db.prepare('SELECT request_hash FROM package_requests WHERE request_id = ?').get(r.request_id) as { request_hash: string } | undefined;
    if (prior) {
      if (prior.request_hash !== sha256(json)) throw new Error('request_id reused with a different package request');
    } else {
      this.db.prepare('INSERT INTO package_requests (request_id, package_id, content_origin, request_hash, request_json, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(r.request_id, r.package_id, r.content_origin, sha256(json), json, this.iso());
    }
    return { request_id: r.request_id, package_id: r.package_id, content_origin: r.content_origin };
  }

  request(requestId: string): { package_id: string; content_origin: 'synthetic_fixture' | 'sourced'; value: Record<string, unknown> } | undefined {
    const row = this.db.prepare('SELECT package_id, content_origin, request_json FROM package_requests WHERE request_id = ?').get(requestId) as { package_id: string; content_origin: 'synthetic_fixture' | 'sourced'; request_json: string } | undefined;
    return row && { package_id: row.package_id, content_origin: row.content_origin, value: parse(row.request_json) };
  }

  stageUnit(requestId: string, kind: JsonKind, value: unknown): StagedUnit {
    if (kind === 'package') throw new Error('Packages are built by freeze, not staged');
    const checked = validateKnowledge('knowledge_unit', value);
    if (!checked.ok) throw new Error(`knowledge_unit invalid: ${checked.errors.join('; ')}`);
    const identity = (value as { governance: { identity: { unit_id: string; version: string } } }).governance.identity;
    const json = canonicalJson(value);
    this.db.prepare(`INSERT INTO staging_units (request_id, kind, unit_id, version, content_json, content_hash, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (request_id, kind, unit_id, version) DO UPDATE SET content_json = excluded.content_json, content_hash = excluded.content_hash, updated_at = excluded.updated_at`)
      .run(requestId, kind, identity.unit_id, identity.version, json, sha256(json), this.iso());
    return { kind: kind as StagedUnit['kind'], id: identity.unit_id, version: identity.version, hash: sha256(json), value };
  }

  stagedUnits(requestId: string): StagedUnit[] {
    return (this.db.prepare('SELECT kind, unit_id, version, content_json, content_hash FROM staging_units WHERE request_id = ? ORDER BY kind, unit_id, version').all(requestId) as
      { kind: StagedUnit['kind']; unit_id: string; version: string; content_json: string; content_hash: string }[])
      .map((r) => ({ kind: r.kind, id: r.unit_id, version: r.version, hash: r.content_hash, value: parse(r.content_json) }));
  }

  setCoverage(requestId: string, coverage: unknown): void {
    const checked = validateKnowledge('coverage_manifest', coverage);
    if (!checked.ok) throw new Error(`coverage_manifest invalid: ${checked.errors.join('; ')}`);
    this.db.prepare('INSERT INTO staging_coverage (request_id, coverage_json, updated_at) VALUES (?, ?, ?) ON CONFLICT (request_id) DO UPDATE SET coverage_json = excluded.coverage_json, updated_at = excluded.updated_at')
      .run(requestId, canonicalJson(coverage), this.iso());
  }

  coverage(requestId: string): unknown {
    const row = this.db.prepare('SELECT coverage_json FROM staging_coverage WHERE request_id = ?').get(requestId) as { coverage_json: string } | undefined;
    return row && parse(row.coverage_json);
  }

  recordEvent(requestId: string, step: number, status: 'started' | 'passed' | 'blocked' | 'failed', detail: string, packageVersion: string | null = null, bundleHash: string | null = null): void {
    this.db.prepare('INSERT INTO pipeline_events (event_id, request_id, package_version, step, status, detail, bundle_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(randomUUID(), requestId, packageVersion, step, status, detail, bundleHash, this.iso());
  }

  events(requestId: string) {
    return this.db.prepare('SELECT step, status, detail, package_version, bundle_hash, created_at FROM pipeline_events WHERE request_id = ? ORDER BY created_at, rowid').all(requestId) as
      { step: number; status: string; detail: string; package_version: string | null; bundle_hash: string | null; created_at: string }[];
  }

  // ---- Step 4: frozen bundle + permission index ---------------------------------------------
  insertBundle(b: { package_id: string; version: string; request_id: string; bundle_hash: string; content_origin: string; qc_spec_version: string; playbook_version: string }): void {
    this.db.prepare('INSERT INTO package_bundles (package_id, version, request_id, bundle_hash, content_origin, qc_spec_version, playbook_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(b.package_id, b.version, b.request_id, b.bundle_hash, b.content_origin, b.qc_spec_version, b.playbook_version, this.iso());
  }

  bundle(packageId: string, version: string) {
    return this.db.prepare('SELECT package_id, version, request_id, bundle_hash, content_origin, qc_spec_version, playbook_version, created_at FROM package_bundles WHERE package_id = ? AND version = ?').get(packageId, version) as
      { package_id: string; version: string; request_id: string; bundle_hash: string; content_origin: 'synthetic_fixture' | 'sourced'; qc_spec_version: string; playbook_version: string; created_at: string } | undefined;
  }

  bundles() {
    return this.db.prepare(`SELECT b.package_id, b.version, b.bundle_hash, b.content_origin, b.qc_spec_version, b.created_at, r.state, r.released_at, p.usage_rights
      FROM package_bundles b JOIN package_releases r USING (package_id, version) JOIN package_versions p USING (package_id, version) ORDER BY b.package_id, b.created_at`).all() as
      { package_id: string; version: string; bundle_hash: string; content_origin: string; qc_spec_version: string; created_at: string; state: string; released_at: string | null; usage_rights: string }[];
  }

  /** Index a unit for pre-retrieval permission checks; a unit frozen earlier keeps its first index row. */
  indexUnit(u: { kind: string; id: string; version: string; unit_type: string; package_id: string; package_version: string; roles: string[]; disclosure: string; hash: string }): void {
    const prior = this.db.prepare('SELECT content_hash FROM knowledge_units WHERE kind = ? AND object_id = ? AND version = ?').get(u.kind, u.id, u.version) as { content_hash: string } | undefined;
    if (prior && prior.content_hash !== u.hash) throw new Error(`Unit ${u.kind}/${u.id}@${u.version} already indexed with other content`);
    if (!prior) {
      this.db.prepare('INSERT INTO knowledge_units (kind, object_id, version, unit_type, package_id, package_version, roles_json, disclosure, content_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(u.kind, u.id, u.version, u.unit_type, u.package_id, u.package_version, JSON.stringify(u.roles), u.disclosure, u.hash);
    }
    this.db.prepare('INSERT INTO package_units (package_id, package_version, kind, object_id, version) VALUES (?, ?, ?, ?, ?)').run(u.package_id, u.package_version, u.kind, u.id, u.version);
  }

  unitPermission(kind: string, id: string, version: string): UnitPermission | undefined {
    const row = this.db.prepare('SELECT unit_type, roles_json, disclosure, content_hash FROM knowledge_units WHERE kind = ? AND object_id = ? AND version = ?').get(kind, id, version) as
      { unit_type: string; roles_json: string; disclosure: string; content_hash: string } | undefined;
    return row && { unit_type: row.unit_type, roles: parse<string[]>(row.roles_json), disclosure: row.disclosure, hash: row.content_hash };
  }

  packageUnits(packageId: string, version: string): { kind: StagedUnit['kind']; id: string; version: string; unit_type: string; hash: string }[] {
    return this.db.prepare(`SELECT u.kind, u.object_id AS id, u.version, k.unit_type, k.content_hash AS hash FROM package_units u JOIN knowledge_units k USING (kind, object_id, version)
      WHERE u.package_id = ? AND u.package_version = ? ORDER BY u.kind, u.object_id`).all(packageId, version) as { kind: StagedUnit['kind']; id: string; version: string; unit_type: string; hash: string }[];
  }

  /** Units of active releases, for dependency checks of later packages. */
  isReleasedUnit(kind: string, id: string, version: string): boolean {
    return !!this.db.prepare(`SELECT 1 FROM package_units u JOIN package_releases r ON r.package_id = u.package_id AND r.version = u.package_version
      WHERE u.kind = ? AND u.object_id = ? AND u.version = ? AND r.state = 'active' LIMIT 1`).get(kind, id, version);
  }

  // ---- Step 5: QC results -------------------------------------------------------------------
  insertQc(r: Omit<QcRow, 'qc_id' | 'created_at'>): QcRow {
    const row: QcRow = { ...r, qc_id: randomUUID(), created_at: this.iso() };
    this.db.prepare('INSERT INTO qc_results (qc_id, package_id, version, stage, part, status, method, bundle_hash, qc_spec_version, findings_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(row.qc_id, row.package_id, row.version, row.stage, row.part, row.status, row.method, row.bundle_hash, row.qc_spec_version, JSON.stringify(row.findings), row.created_at);
    return row;
  }

  /** Latest result per stage/part for one package version (any hash — the gate compares hashes itself). */
  latestQc(packageId: string, version: string): QcRow[] {
    const rows = this.db.prepare('SELECT * FROM qc_results WHERE package_id = ? AND version = ? ORDER BY created_at, rowid').all(packageId, version) as (Omit<QcRow, 'findings'> & { findings_json: string })[];
    const latest = new Map<string, QcRow>();
    for (const { findings_json, ...r } of rows) latest.set(`${r.stage}:${r.part}`, { ...r, findings: parse(findings_json) });
    return [...latest.values()];
  }

  insertQcJob(j: { package_id: string; version: string; bundle_hash: string; case_id: string; step: 'blind_solve' | 'verification' | 'assessment'; attempt_id: string; job_id: string }): void {
    this.db.prepare('INSERT OR IGNORE INTO qc_jobs (package_id, version, bundle_hash, case_id, step, attempt_id, job_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(j.package_id, j.version, j.bundle_hash, j.case_id, j.step, j.attempt_id, j.job_id, this.iso());
  }

  qcJobs(packageId: string, version: string, bundleHash: string) {
    return this.db.prepare(`SELECT q.case_id, q.step, q.attempt_id, q.job_id, j.state, j.submission_id, j.snapshot_version,
      (SELECT GROUP_CONCAT(DISTINCT provider) FROM ai_runs r WHERE r.job_id = q.job_id) AS providers
      FROM qc_jobs q JOIN ai_jobs j USING (job_id) WHERE q.package_id = ? AND q.version = ? AND q.bundle_hash = ? ORDER BY q.case_id, q.step`).all(packageId, version, bundleHash) as QcJobRow[];
  }

  /** Package versions whose bundle contains the unit (version null = any version). */
  packagesOf(kind: string, id: string, version: string | null): { id: string; version: string }[] {
    return this.db.prepare('SELECT DISTINCT package_id AS id, package_version AS version FROM package_units WHERE kind = ? AND object_id = ? AND (? IS NULL OR version = ?)')
      .all(kind, id, version, version) as { id: string; version: string }[];
  }

  // ---- Step 6: release manifest ---------------------------------------------------------------
  insertReleaseManifest(packageId: string, version: string, manifest: unknown): string {
    const json = canonicalJson(manifest);
    this.db.prepare('INSERT INTO release_manifests (package_id, version, manifest_hash, manifest_json, created_at) VALUES (?, ?, ?, ?, ?)').run(packageId, version, sha256(json), json, this.iso());
    return sha256(json);
  }

  releaseManifest(packageId: string, version: string): unknown {
    const row = this.db.prepare('SELECT manifest_json, manifest_hash FROM release_manifests WHERE package_id = ? AND version = ?').get(packageId, version) as { manifest_json: string; manifest_hash: string } | undefined;
    if (!row) return undefined;
    if (sha256(row.manifest_json) !== row.manifest_hash) throw new Error('Release manifest checksum mismatch');
    return parse(row.manifest_json);
  }

  activeVersions(packageId: string): string[] {
    return (this.db.prepare("SELECT version FROM package_releases WHERE package_id = ? AND state = 'active' ORDER BY released_at").all(packageId) as { version: string }[]).map((r) => r.version);
  }

  // ---- Review queue ("Cần xử lý") -------------------------------------------------------------
  openReview(r: ReviewInput): { review_id: string; created: boolean } {
    const prior = this.db.prepare('SELECT review_id FROM review_items WHERE dedupe_key = ?').get(r.dedupe_key) as { review_id: string } | undefined;
    if (prior) return { review_id: prior.review_id, created: false };
    const id = randomUUID();
    const at = this.iso();
    this.db.prepare(`INSERT INTO review_items (review_id, dedupe_key, kind, target_kind, target_id, target_version, severity, summary, detail_json, status, resolution, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', NULL, ?, ?)`).run(id, r.dedupe_key, r.kind, r.target_kind, r.target_id, r.target_version, r.severity, r.summary, canonicalJson(r.detail), at, at);
    return { review_id: id, created: true };
  }

  reviews(status: 'open' | 'resolved' | 'all' = 'open'): ReviewRow[] {
    const rows = this.db.prepare(`SELECT * FROM review_items WHERE (? = 'all' OR status = ?) ORDER BY CASE severity WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, created_at`).all(status, status) as
      (Omit<ReviewRow, 'detail'> & { detail_json: string })[];
    return rows.map(({ detail_json, ...r }) => ({ ...r, detail: parse(detail_json) }));
  }

  resolveReview(reviewId: string, resolution: NonNullable<ReviewRow['resolution']>): void {
    const changed = this.db.prepare("UPDATE review_items SET status = 'resolved', resolution = ?, updated_at = ? WHERE review_id = ? AND status = 'open'").run(resolution, this.iso(), reviewId).changes;
    if (changed !== 1) throw new Error('Review item not open');
  }

  // ---- Reverse provenance (05 §4.C, 06 §5.B.5) -----------------------------------------------
  /** Items, attempts, observations and jobs depending on a revoked/suspended target. History is only read. */
  impactOf(target: Revocation): { items: { id: string; version: string }[]; attempts: { attempt_id: string; scope: string }[]; observations: { observation_id: string; scope: string; outcome: string; competency_id: string }[]; jobs: string[] } {
    let items: { id: string; version: string }[] = [];
    if (target.target_kind === 'item') {
      items = this.db.prepare('SELECT item_id AS id, version FROM item_versions WHERE item_id = ? AND (? IS NULL OR version = ?)').all(target.target_id, target.target_version, target.target_version) as { id: string; version: string }[];
    } else if (target.target_kind === 'package') {
      items = this.db.prepare('SELECT item_id AS id, version FROM item_versions WHERE package_id = ? AND (? IS NULL OR package_version = ?)').all(target.target_id, target.target_version, target.target_version) as { id: string; version: string }[];
    }
    const attemptRows: { attempt_id: string; scope: string }[] = [];
    for (const i of items) attemptRows.push(...this.db.prepare('SELECT attempt_id, scope FROM attempts WHERE item_id = ? AND item_version = ?').all(i.id, i.version) as { attempt_id: string; scope: string }[]);
    if (target.target_kind === 'rubric') {
      attemptRows.push(...this.db.prepare('SELECT attempt_id, scope FROM attempts WHERE rubric_id = ? AND (? IS NULL OR rubric_version = ?)').all(target.target_id, target.target_version, target.target_version) as { attempt_id: string; scope: string }[]);
    }
    const observations: { observation_id: string; scope: string; outcome: string; competency_id: string }[] = [];
    const jobs: string[] = [];
    for (const a of attemptRows) {
      observations.push(...this.db.prepare('SELECT o.observation_id, o.scope, o.outcome, o.competency_id FROM observations o JOIN submissions s USING (submission_id) WHERE s.attempt_id = ?').all(a.attempt_id) as typeof observations);
      jobs.push(...(this.db.prepare('SELECT job_id FROM ai_jobs WHERE attempt_id = ?').all(a.attempt_id) as { job_id: string }[]).map((j) => j.job_id));
    }
    return { items, attempts: attemptRows, observations, jobs };
  }
}
