// Ports for the Builder/QC pipeline; infrastructure/sqlite and infrastructure/files implement them.
import type { Revocation, Scope } from '../../domain/evidence/types.js';
import type { ReleaseState } from '../../domain/knowledge/release-state.js';
import type { SourceFacts } from '../../domain/knowledge/source-rights.js';
import type { QcMethod, QcPart, QcStage } from '../../domain/knowledge/release-gate.js';
import type { AttemptRecord, JobRecord, NewAttempt, NewJob, NewManifest, NewSubmission, SubmissionRecord } from '../ports.js';

export type UnitKind = 'item' | 'rubric' | 'knowledge' | 'policy';
export interface Ref { kind: UnitKind | 'package'; id: string; version: string; hash: string; rel_path: string }
export interface StagedUnit { kind: UnitKind; id: string; version: string; hash: string; value: unknown }
export interface SourceRow { record: SourceFacts & { origin: string; [k: string]: unknown }; hash: string }
export interface UnitPermission { unit_type: string; roles: string[]; disclosure: string; hash: string }
export interface QcRow { qc_id: string; package_id: string; version: string; stage: QcStage; part: QcPart; status: 'PASS' | 'FAIL' | 'NOT_RUN'; method: QcMethod; bundle_hash: string; qc_spec_version: string; findings: unknown[]; created_at: string }
export interface ReviewInput {
  dedupe_key: string; kind: 'qc_failed' | 'coverage_gap' | 'revocation_impact' | 'suspension_impact' | 'job_needs_review' | 'source_rights';
  target_kind: string; target_id: string; target_version: string | null; severity: 'high' | 'normal' | 'low'; summary: string; detail: unknown;
}
export interface ReviewRow extends Omit<ReviewInput, 'detail'> { review_id: string; detail: unknown; status: 'open' | 'resolved'; resolution: 'ai_fix_and_requalify' | 'suspended_or_retired' | 'manual_review_done' | 'deferred' | null; created_at: string; updated_at: string }
export interface BundleRow { package_id: string; version: string; request_id: string; bundle_hash: string; content_origin: 'synthetic_fixture' | 'sourced'; qc_spec_version: string; playbook_version: string; created_at: string }
export interface QcJobRow { case_id: string; step: 'blind_solve' | 'verification' | 'assessment'; attempt_id: string; job_id: string; state: string; submission_id: string; snapshot_version: number; providers: string | null }
export interface Impact { items: { id: string; version: string }[]; attempts: { attempt_id: string; scope: string }[]; observations: { observation_id: string; scope: string; outcome: string; competency_id: string }[]; jobs: string[] }

export interface BuilderStore {
  transaction<T>(fn: () => T): T;
  registerSource(record: unknown): { source_id: string; version: string; hash: string };
  source(sourceId: string, version: string): SourceRow | undefined;
  latestSource(sourceId: string): SourceRow | undefined;
  createRequest(request: unknown): { request_id: string; package_id: string; content_origin: 'synthetic_fixture' | 'sourced' };
  request(requestId: string): { package_id: string; content_origin: 'synthetic_fixture' | 'sourced'; value: Record<string, unknown> } | undefined;
  stageUnit(requestId: string, kind: UnitKind, value: unknown): StagedUnit;
  stagedUnits(requestId: string): StagedUnit[];
  setCoverage(requestId: string, coverage: unknown): void;
  coverage(requestId: string): unknown;
  recordEvent(requestId: string, step: number, status: 'started' | 'passed' | 'blocked' | 'failed', detail: string, packageVersion?: string | null, bundleHash?: string | null): void;
  insertBundle(b: Omit<BundleRow, 'created_at'>): void;
  bundle(packageId: string, version: string): BundleRow | undefined;
  indexUnit(u: { kind: string; id: string; version: string; unit_type: string; package_id: string; package_version: string; roles: string[]; disclosure: string; hash: string }): void;
  unitPermission(kind: string, id: string, version: string): UnitPermission | undefined;
  packageUnits(packageId: string, version: string): { kind: UnitKind; id: string; version: string; unit_type: string; hash: string }[];
  isReleasedUnit(kind: string, id: string, version: string): boolean;
  packagesOf(kind: string, id: string, version: string | null): { id: string; version: string }[];
  insertQc(r: Omit<QcRow, 'qc_id' | 'created_at'>): QcRow;
  latestQc(packageId: string, version: string): QcRow[];
  insertQcJob(j: { package_id: string; version: string; bundle_hash: string; case_id: string; step: QcJobRow['step']; attempt_id: string; job_id: string }): void;
  qcJobs(packageId: string, version: string, bundleHash: string): QcJobRow[];
  insertReleaseManifest(packageId: string, version: string, manifest: unknown): string;
  releaseManifest(packageId: string, version: string): unknown;
  activeVersions(packageId: string): string[];
  openReview(r: ReviewInput): { review_id: string; created: boolean };
  impactOf(target: Revocation): Impact;
}

export interface JsonPort {
  put(kind: Ref['kind'], id: string, version: string, value: unknown): Ref;
  find(kind: Ref['kind'], id: string, version: string): Ref | undefined;
  get(kind: Ref['kind'], id: string, version: string, expectedHash?: string): unknown;
}
export interface MediaPort { read(mediaId: string): Buffer; exists(mediaId: string): boolean }
export interface KnowledgePort {
  registerPackage(pkg: Ref, usageRights: 'verified' | 'unknown', qcPolicyVersion: string, dependencies: Ref[], items: { ref: Ref; item_family_id: string; shared_stimulus_id: string | null; media_ids: string[] }[]): void;
  releaseState(packageId: string, version: string): ReleaseState | undefined;
  transition(packageId: string, version: string, to: ReleaseState, reason: string, approvedHash?: string): void;
  revoke(target: Revocation, reason: string): string;
  revocations(): Revocation[];
}
export interface LearningPort {
  createAttempt(input: NewAttempt): AttemptRecord;
  submit(input: NewSubmission): SubmissionRecord;
  createManifest(input: NewManifest): { manifest_id: string; input_hash: string };
}
export interface QueuePort { enqueue(job: NewJob): JobRecord; result(jobId: string): unknown }
export interface CachePort { invalidate(targets: { kind: string; id: string; version: string | null }[], reason: string): number }
export type { Scope };
