// Builder pipeline (05 §5.B): request → sources → staging → freeze → QC1–4 → release, plus suspend/retire/revoke
// with reverse provenance and cache invalidation. The application decides every transition; AI output is input only.
import { CLI_PROVIDERS } from '../ai/subscription-guard.js';
import type { Revocation } from '../../domain/evidence/types.js';
import { evaluateCoverage, type CoverageInput, type Grant, type UsageRole } from '../../domain/knowledge/coverage.js';
import { evaluateQc4, type Qc4Case, type Qc4Finding, type Qc4Key } from '../../domain/knowledge/qc4.js';
import { releaseGate, type QcStage } from '../../domain/knowledge/release-gate.js';
import { isRevoked } from '../../domain/knowledge/revocation.js';
import { sourceUseDecision } from '../../domain/knowledge/source-rights.js';
import { blindTaskView, DATA_POLICY, scopedReader, type ScopedReader } from '../context/scoped-reader.js';
import type { NewJob } from '../ports.js';
import type { BuilderStore, CachePort, JsonPort, KnowledgePort, LearningPort, MediaPort, QueuePort, Ref, StagedUnit, UnitKind } from './ports.js';
import { deterministicFindings, requiredParts, stageOutcome, type BundleUnit, type Finding, type SpecRules } from './qc-checks.js';

export interface PipelineDeps {
  builder: BuilderStore; json: JsonPort; media: MediaPort; knowledge: KnowledgePort; learning: LearningPort; queue: QueuePort; cache: CachePort;
  hash(value: unknown): string;
  validate(contract: string, value: unknown): { ok: boolean; errors: string[] };
  spec: SpecRules & { qc_spec_version: string };
  playbookVersion: string;
  contextPolicyVersion: string;
  now(): Date;
}

interface TestCase { case_id: string; case_type: string; target: { kind: UnitKind; id: string; version: string }; run: 'blind_solve' | 'assessment'; input_text: string | null; expected_outcome: 'met' | 'not_met' | 'inconclusive' | null }
interface PackageManifest {
  package_id: string; version: string; request_id: string; content_origin: 'synthetic_fixture' | 'sourced';
  units: { kind: UnitKind; id: string; version: string; hash: string }[]; sources: { source_id: string; version: string; hash: string }[]; media: string[];
  coverage: Omit<CoverageInput, 'test_cases'> & { test_cases: TestCase[] }; knowledge_gaps: string[]; bundle_hash: string; qc_spec_version: string; playbook_version: string;
}
type LoadedBundle = { manifest: PackageManifest; units: BundleUnit[]; integrity_errors: string[]; recomputed: string | null; origin: 'synthetic_fixture' | 'sourced'; bundle_hash: string; usage: UsageRole[] };

const STAGES: QcStage[] = ['QC1', 'QC2', 'QC3', 'QC4'];
const byKey = (a: { kind: string; id: string; version: string }, b: { kind: string; id: string; version: string }) => `${a.kind}/${a.id}@${a.version}`.localeCompare(`${b.kind}/${b.id}@${b.version}`);
const unitType = (u: { value: unknown }) => (u.value as { governance: { identity: { unit_type: string } } }).governance.identity.unit_type;
const gov = (u: { value: unknown }) => (u.value as { governance: BundleUnit['value']['governance'] & { basis: { knowledge_gaps: string[] } } }).governance;

export class BuilderPipeline {
  constructor(private d: PipelineDeps) {}

  // ---- Steps 1–3 -----------------------------------------------------------------------------
  registerSource(record: unknown) { return this.d.builder.registerSource(record); }

  createRequest(request: unknown) {
    const r = this.d.builder.createRequest(request);
    this.d.builder.recordEvent(r.request_id, 1, 'started', 'package request recorded');
    return r;
  }

  stageUnit(requestId: string, kind: UnitKind, value: unknown): StagedUnit {
    if (!this.d.builder.request(requestId)) throw new Error('Unknown package request');
    const staged = this.d.builder.stageUnit(requestId, kind, value);
    this.d.builder.recordEvent(requestId, 3, 'started', `staged ${kind}/${staged.id}@${staged.version}`);
    return staged;
  }

  setCoverage(requestId: string, coverage: unknown) { this.d.builder.setCoverage(requestId, coverage); }

  /**
   * Step 4: copy staging into the immutable JSON store, build the package manifest and bundle hash, register the
   * package as draft and index unit permissions — all in one transaction. A changed unit needs a new version.
   */
  freeze(requestId: string, version: string): { package: Ref; bundle_hash: string } {
    const request = this.d.builder.request(requestId);
    if (!request) throw new Error('Unknown package request');
    const staged = this.d.builder.stagedUnits(requestId);
    const coverage = this.d.builder.coverage(requestId) as PackageManifest['coverage'] | undefined;
    if (staged.length === 0 || !coverage) throw new Error('Freeze needs staged units and a coverage manifest');
    const sourceKeys = [...new Map(staged.flatMap((u) => gov(u).basis.sources).map((s) => [`${s.source_id}@${s.source_version}`, s])).values()];
    const sourceBlocks = sourceKeys.map((s) => ({ s, row: this.d.builder.source(s.source_id, s.source_version) }))
      .filter(({ row }) => !row || !sourceUseDecision(row.record, { store_copy: true, ai_processing: false, learner_display: false }).allowed);
    this.d.builder.recordEvent(requestId, 1, sourceBlocks.length ? 'blocked' : 'passed',
      sourceBlocks.length ? `sources not usable: ${sourceBlocks.map(({ s }) => `${s.source_id}@${s.source_version}`).join(', ')}` : 'all sources approved with determined rights', version);

    return this.d.builder.transaction(() => {
      const refs = staged.map((u) => this.d.json.put(u.kind, u.id, u.version, u.value)).sort(byKey);
      const sources = sourceKeys.flatMap((s) => { const row = this.d.builder.source(s.source_id, s.source_version); return row ? [{ source_id: s.source_id, version: s.source_version, hash: row.hash }] : []; })
        .sort((a, b) => `${a.source_id}@${a.version}`.localeCompare(`${b.source_id}@${b.version}`));
      const media = [...new Set(staged.flatMap((u) => [...gov(u).dependencies.media, ...(unitType(u) === 'task_item' ? (u.value as { body: { stimulus: { media: string[] } } }).body.stimulus.media : [])]))].sort();
      const core = {
        package_id: request.package_id, version, request_id: requestId, content_origin: request.content_origin,
        units: refs.map(({ kind, id, version: v, hash }) => ({ kind: kind as UnitKind, id, version: v, hash })), sources, media, coverage,
        knowledge_gaps: [...new Set(staged.flatMap((u) => gov(u).basis.knowledge_gaps))].sort(), qc_spec_version: this.d.spec.qc_spec_version, playbook_version: this.d.playbookVersion,
      };
      const bundleHash = this.d.hash(core);
      const manifest: PackageManifest & { schema_version: '1' } = { schema_version: '1', ...core, bundle_hash: bundleHash };
      const checked = this.d.validate('package_manifest', manifest);
      if (!checked.ok) throw new Error(`package_manifest invalid: ${checked.errors.join('; ')}`);
      const pkg = this.d.json.put('package', request.package_id, version, manifest);
      const verified = sources.length === sourceKeys.length && sources.every((s) => {
        const row = this.d.builder.source(s.source_id, s.version);
        return row?.record.registry_state === 'approved' && row.record.rights.status === 'determined';
      });
      const items = refs.filter((r) => r.kind === 'item').map((ref) => {
        const body = (staged.find((u) => u.kind === 'item' && u.id === ref.id && u.version === ref.version)!.value as { body: { item_family_id: string; shared_stimulus_id: string | null; stimulus: { media: string[] } } }).body;
        // Only registered media can be linked; missing media is reported by QC1, not hidden by a failed freeze.
        return { ref, item_family_id: body.item_family_id, shared_stimulus_id: body.shared_stimulus_id, media_ids: body.stimulus.media.map((s) => `media_${s}`).filter((m) => this.d.media.exists(m)) };
      });
      this.d.knowledge.registerPackage(pkg, verified ? 'verified' : 'unknown', this.d.spec.qc_spec_version, refs.filter((r) => r.kind !== 'item'), items);
      this.d.builder.insertBundle({ package_id: request.package_id, version, request_id: requestId, bundle_hash: bundleHash, content_origin: request.content_origin,
        qc_spec_version: this.d.spec.qc_spec_version, playbook_version: this.d.playbookVersion });
      for (const r of refs) {
        const u = staged.find((s) => s.kind === r.kind && s.id === r.id && s.version === r.version)!;
        this.d.builder.indexUnit({ kind: r.kind, id: r.id, version: r.version, unit_type: unitType(u), package_id: request.package_id, package_version: version,
          roles: gov(u).permissions.roles, disclosure: gov(u).permissions.disclosure, hash: r.hash });
      }
      this.d.builder.recordEvent(requestId, 4, 'passed', `frozen ${refs.length} units`, version, bundleHash);
      return { package: pkg, bundle_hash: bundleHash };
    });
  }

  /** Re-reads the frozen bundle from disk with checksums; never trusts cached content. */
  private load(packageId: string, version: string): LoadedBundle {
    const bundle = this.d.builder.bundle(packageId, version);
    if (!bundle) throw new Error(`Unknown frozen package ${packageId}@${version}`);
    const integrity: string[] = [];
    let manifest: PackageManifest;
    try { manifest = this.d.json.get('package', packageId, version) as PackageManifest; } catch (e) { throw new Error(`Package manifest unreadable: ${(e as Error).message}`, { cause: e }); }
    const units: BundleUnit[] = [];
    for (const u of manifest.units) {
      try { units.push({ kind: u.kind, id: u.id, version: u.version, value: this.d.json.get(u.kind, u.id, u.version, u.hash) as BundleUnit['value'] }); } catch (e) { integrity.push(`${u.kind}/${u.id}@${u.version}: ${(e as Error).message}`); }
    }
    for (const sha of manifest.media) {
      try { this.d.media.read(`media_${sha}`); } catch (e) { integrity.push(`media ${sha}: ${(e as Error).message}`); }
    }
    const { bundle_hash: _h, ...core } = manifest as PackageManifest & { schema_version?: string };
    delete (core as { schema_version?: string }).schema_version;
    const recomputed = integrity.length ? null : this.d.hash(core);
    const usage = ((this.d.builder.request(bundle.request_id)?.value.usage_purposes ?? []) as UsageRole[]);
    return { manifest, units, integrity_errors: integrity, recomputed, origin: bundle.content_origin, bundle_hash: bundle.bundle_hash, usage };
  }

  private mediaOk(sha: string): boolean {
    try { this.d.media.read(`media_${sha}`); return true; } catch { return false; }
  }

  // ---- Step 5: QC -------------------------------------------------------------------------------
  /** Deterministic parts of QC1–QC3 on the frozen bundle; results are bound to its hash and the QC spec version. */
  runChecks(packageId: string, version: string): { stage: QcStage; status: 'PASS' | 'FAIL'; findings: Finding[] }[] {
    const b = this.load(packageId, version);
    const findings = deterministicFindings({
      units: b.units, coverage: b.manifest.coverage, usage_purposes: b.usage, integrity_errors: b.integrity_errors,
      sources: (id, v) => this.d.builder.source(id, v)?.record, media_ok: (sha) => this.mediaOk(sha),
      released: (k, id, v) => this.d.builder.isReleasedUnit(k, id, v), validate: this.d.validate,
    });
    if (b.recomputed !== null && b.recomputed !== b.bundle_hash) findings.push({ code: 'QC1_INTEGRITY', unit: null, detail: 'bundle hash differs from frozen record' });
    return this.d.builder.transaction(() => (['QC1', 'QC2', 'QC3'] as const).map((stage) => {
      const outcome = stageOutcome(this.d.spec, stage, findings);
      this.d.builder.insertQc({ package_id: packageId, version, stage, part: 'deterministic', status: outcome.status, method: 'deterministic', bundle_hash: b.bundle_hash, qc_spec_version: this.d.spec.qc_spec_version, findings: outcome.findings });
      const blocking = outcome.findings.filter((x) => x.severity !== 'warning');
      if (blocking.length > 0) {
        this.d.builder.openReview({ dedupe_key: `qc:${packageId}@${version}:${b.bundle_hash}:${stage}`, kind: outcome.status === 'FAIL' ? 'qc_failed' : 'coverage_gap', target_kind: 'package', target_id: packageId, target_version: version,
          severity: outcome.status === 'FAIL' ? 'high' : 'normal', summary: `${stage} ${outcome.status === 'FAIL' ? 'chưa đạt' : 'thiếu bao phủ'}: ${[...new Set(blocking.map((x) => x.code))].join(', ')}`, detail: { bundle_hash: b.bundle_hash, findings: blocking } });
      }
      return { stage, status: outcome.status, findings: outcome.findings };
    }));
  }

  /** Semantic part (QC2_SOURCE_SUPPORT, QC3_POLICY_COMPLIANCE) by the builder; must name the exact bundle hash. */
  attest(packageId: string, version: string, stage: QcStage, status: 'PASS' | 'FAIL', bundleHash: string, note: string) {
    const bundle = this.d.builder.bundle(packageId, version);
    if (!bundle) throw new Error('Unknown frozen package');
    if (!this.d.spec.stages.find((s) => s.stage === stage)?.rules.some((r) => r.method === 'semantic')) throw new Error(`${stage} has no semantic rule to attest`);
    if (bundleHash !== bundle.bundle_hash) throw new Error('Attestation must name the frozen bundle hash');
    if (!note.trim()) throw new Error('Attestation needs a note');
    return this.d.builder.insertQc({ package_id: packageId, version, stage, part: 'semantic', status, method: 'manual_attestation', bundle_hash: bundleHash, qc_spec_version: this.d.spec.qc_spec_version, findings: [{ note }] });
  }

  private reader(role: 'blind_solver' | 'verifier' | 'assessor'): ScopedReader {
    return scopedReader(role, this.d.builder, { get: (k, id, v, h) => this.d.json.get(k, id, v, h) });
  }

  private qcAttempt(b: LoadedBundle, packageId: string, version: string, c: TestCase, itemRef: { id: string; version: string }, content: string) {
    const rubric = b.manifest.units.find((u) => u.kind === 'rubric');
    if (!rubric) throw new Error('QC4 needs a rubric unit in the package to pin dry-run attempts');
    const attempt = this.d.learning.createAttempt({ request_key: `qc4:${packageId}@${version}:${b.bundle_hash}:${c.case_id}`, scope: 'dry_run',
      item: itemRef, rubric: { id: rubric.id, version: rubric.version }, mode: 'exam', purpose: 'practice' });
    const submission = this.d.learning.submit({ request_key: `qc4-sub:${packageId}@${version}:${b.bundle_hash}:${c.case_id}`, attempt_id: attempt.attempt_id, content });
    return { attempt, submission, rubric };
  }

  private enqueue(b: LoadedBundle, packageId: string, version: string, caseId: string, step: 'blind_solve' | 'verification' | 'assessment',
    q: { attempt_id: string; submission_id: string; snapshot_version: number; rubric_version: string }, manifest: Parameters<LearningPort['createManifest']>[0]) {
    const m = this.d.learning.createManifest(manifest);
    const task: NewJob['task_type'] = step === 'blind_solve' ? 'reading.blind_solve' : step === 'verification' ? 'reading.verify' : 'writing.assess';
    const job = this.d.queue.enqueue({ idempotency_key: `qc4:${packageId}@${version}:${b.bundle_hash}:${caseId}:${step}`, attempt_id: q.attempt_id, submission_id: q.submission_id,
      snapshot_version: q.snapshot_version, attempt_generation: 1, task_type: task, phase: manifest.phase, context_manifest_id: m.manifest_id, rubric_version: q.rubric_version,
      required_capabilities: ['text', 'structured_result'], eligible_providers: [...CLI_PROVIDERS], limits: { max_attempts_total: 3, timeout_seconds: 120 } });
    this.d.builder.insertQcJob({ package_id: packageId, version, bundle_hash: b.bundle_hash, case_id: caseId, step, attempt_id: q.attempt_id, job_id: job.job_id });
    return job;
  }

  /**
   * QC4: enqueue dry-run jobs. Blind solve gets the learner view only, read through the blind_solver reader, in its
   * own manifest; the answer key is not loaded for it at all. Idempotent per bundle hash.
   */
  startQc4(packageId: string, version: string): string[] {
    const b = this.load(packageId, version);
    if (b.integrity_errors.length) throw new Error('Frozen bundle failed integrity; re-freeze a new version');
    const firstItem = b.manifest.units.find((u) => u.kind === 'item');
    return this.d.builder.transaction(() => b.manifest.coverage.test_cases.map((c) => {
      if (c.run === 'blind_solve') {
        if (c.target.kind !== 'item') throw new Error(`Case ${c.case_id}: blind solve targets an item`);
        const view = blindTaskView((this.reader('blind_solver').read('item', c.target.id, c.target.version).value as { body: Parameters<typeof blindTaskView>[0] }).body);
        const { submission, rubric } = this.qcAttempt(b, packageId, version, c, c.target, `[QC4 blind solve ${c.case_id}: no learner content]`);
        const itemHash = b.manifest.units.find((u) => u.kind === 'item' && u.id === c.target.id && u.version === c.target.version)!.hash;
        return this.enqueue(b, packageId, version, c.case_id, 'blind_solve', { ...submission, rubric_version: rubric.version }, {
          manifest_id: `qc4:${b.bundle_hash.slice(0, 16)}:${c.case_id}:blind`, role: 'blind_solver', phase: 'blind_solve', policy_version: this.d.contextPolicyVersion, rubric: null,
          knowledge: [{ kind: 'item', id: c.target.id, version: c.target.version, hash: itemHash }], disclosure_level: 0, allowed_resource_ids: view.media_ids,
          payload: { data_policy: DATA_POLICY, task: view } }).job_id;
      }
      if (!firstItem) throw new Error('Assessment cases need an item to pin the dry-run attempt');
      const rubricRead = this.reader('assessor').read(c.target.kind, c.target.id, c.target.version);
      const { submission, rubric } = this.qcAttempt(b, packageId, version, c, { id: firstItem.id, version: firstItem.version }, c.input_text ?? '');
      return this.enqueue(b, packageId, version, c.case_id, 'assessment', { ...submission, rubric_version: rubric.version }, {
        manifest_id: `qc4:${b.bundle_hash.slice(0, 16)}:${c.case_id}:assess`, role: 'assessor', phase: 'assessment', policy_version: this.d.contextPolicyVersion,
        rubric: { id: rubric.id, version: rubric.version, hash: rubric.hash }, knowledge: [{ kind: c.target.kind, id: c.target.id, version: c.target.version, hash: rubricRead.hash }],
        disclosure_level: 0, allowed_resource_ids: [], payload: { data_policy: DATA_POLICY, submission_text: c.input_text, rubric: (rubricRead.value as { body: unknown }).body } }).job_id;
    }));
  }

  /** Enqueues verification after each completed blind solve (new context, with key), then decides QC4 when all finished. */
  advanceQc4(packageId: string, version: string): { status: 'PENDING' | 'PASS' | 'FAIL' | 'NOT_RUN'; findings: Qc4Finding[] } {
    const b = this.load(packageId, version);
    const cases = b.manifest.coverage.test_cases;
    return this.d.builder.transaction(() => {
      let jobs = this.d.builder.qcJobs(packageId, version, b.bundle_hash);
      const keys: Qc4Key[] = [];
      type KeyBody = { item: { id: string; version: string }; answers: { question_id: string; accepted: string[]; explanation: string }[]; measurement_targets: string[] };
      // Keys are read only through the verifier reader, never for blind-solve contexts.
      const answerKeys = b.manifest.units.filter((u) => u.kind === 'knowledge' && this.d.builder.unitPermission(u.kind, u.id, u.version)?.unit_type === 'answer_key')
        .map((ref) => ({ ref, body: (this.reader('verifier').read(ref.kind, ref.id, ref.version).value as { body: KeyBody }).body }));
      const rubric = b.manifest.units.find((u) => u.kind === 'rubric');
      for (const c of cases.filter((x) => x.run === 'blind_solve')) {
        const key = answerKeys.find((k) => k.body.item.id === c.target.id && k.body.item.version === c.target.version);
        if (key) keys.push({ item: c.target.id, answers: key.body.answers });
        const blind = jobs.find((j) => j.case_id === c.case_id && j.step === 'blind_solve');
        if (!blind || blind.state !== 'COMPLETED' || jobs.some((j) => j.case_id === c.case_id && j.step === 'verification') || !key || !rubric) continue;
        const blindResult = this.d.queue.result(blind.job_id) as { answers: unknown[] };
        const view = blindTaskView((this.reader('verifier').read('item', c.target.id, c.target.version).value as { body: Parameters<typeof blindTaskView>[0] }).body);
        const itemHash = b.manifest.units.find((u) => u.kind === 'item' && u.id === c.target.id && u.version === c.target.version)!.hash;
        // Same dry-run attempt and submission as the blind solve; a fresh manifest that adds the key.
        this.enqueue(b, packageId, version, c.case_id, 'verification', { attempt_id: blind.attempt_id, submission_id: blind.submission_id, snapshot_version: blind.snapshot_version, rubric_version: rubric.version }, {
          manifest_id: `qc4:${b.bundle_hash.slice(0, 16)}:${c.case_id}:verify`, role: 'verifier', phase: 'verification', policy_version: this.d.contextPolicyVersion, rubric: null,
          knowledge: [{ kind: 'item', id: c.target.id, version: c.target.version, hash: itemHash }, { kind: key.ref.kind, id: key.ref.id, version: key.ref.version, hash: key.ref.hash }],
          disclosure_level: 2, allowed_resource_ids: view.media_ids,
          payload: { data_policy: DATA_POLICY, task: view, answer_key: key.body.answers, measurement_targets: key.body.measurement_targets, blind_answers: blindResult.answers } });
      }
      jobs = this.d.builder.qcJobs(packageId, version, b.bundle_hash);
      const terminal = ['COMPLETED', 'FAILED', 'CANCELLED', 'NEEDS_REVIEW'];
      // Not started yet, or something still queued/running (including a verification just enqueued): wait.
      if (jobs.length === 0 || jobs.some((j) => !terminal.includes(j.state))) return { status: 'PENDING' as const, findings: [] };
      const qcCases: Qc4Case[] = cases.map((c) => ({ case_id: c.case_id, run: c.run, target_item: c.run === 'blind_solve' ? c.target.id : null, expected_outcome: c.expected_outcome }));
      const outcome = evaluateQc4(qcCases, jobs.map((j) => ({ case_id: j.case_id, step: j.step, state: j.state, providers: (j.providers ?? '').split(',').filter(Boolean), result: j.state === 'COMPLETED' ? this.d.queue.result(j.job_id) : undefined })), keys, b.origin);
      this.d.builder.insertQc({ package_id: packageId, version, stage: 'QC4', part: 'deterministic', status: outcome.status, method: outcome.method, bundle_hash: b.bundle_hash, qc_spec_version: this.d.spec.qc_spec_version, findings: outcome.findings });
      if (outcome.status !== 'PASS') {
        this.d.builder.openReview({ dedupe_key: `qc:${packageId}@${version}:${b.bundle_hash}:QC4`, kind: 'qc_failed', target_kind: 'package', target_id: packageId, target_version: version, severity: 'high',
          summary: `QC4 ${outcome.status}: ${[...new Set(outcome.findings.map((x) => x.code))].join(', ')}`, detail: { bundle_hash: b.bundle_hash, findings: outcome.findings } });
      }
      return { status: outcome.status, findings: outcome.findings };
    });
  }

  /** Effective status per stage for the console: a result counts only on the frozen hash and current QC spec. */
  qcStatus(packageId: string, version: string): { bundle_hash: string; stages: { stage: QcStage; status: 'PASS' | 'FAIL' | 'NOT_RUN'; parts: { part: string; status: string; method: string; stale: boolean }[] }[] } {
    const bundle = this.d.builder.bundle(packageId, version);
    if (!bundle) throw new Error('Unknown frozen package');
    const rows = this.d.builder.latestQc(packageId, version);
    const required = requiredParts(this.d.spec);
    return { bundle_hash: bundle.bundle_hash, stages: STAGES.map((stage) => {
      const parts = required.filter((r) => r.stage === stage).map((r) => {
        const row = rows.find((x) => x.stage === stage && x.part === r.part);
        const stale = !!row && (row.bundle_hash !== bundle.bundle_hash || row.qc_spec_version !== this.d.spec.qc_spec_version);
        return { part: r.part, status: !row || stale ? 'NOT_RUN' : row.status, method: row?.method ?? '-', stale };
      });
      const status = parts.some((p) => p.status === 'FAIL') ? 'FAIL' as const : parts.every((p) => p.status === 'PASS') ? 'PASS' as const : 'NOT_RUN' as const;
      return { stage, status, parts };
    }) };
  }

  // ---- Step 6: release --------------------------------------------------------------------------
  /**
   * Publish exactly the QC'd bundle. The caller names the bundle hash it approved; the gate re-reads content from
   * disk, recomputes the hash, checks every required QC part on that hash, current source rights and revocations.
   */
  release(packageId: string, version: string, approvedBundleHash: string, reason = 'release'): { allowed: true; manifest: unknown } | { allowed: false; reasons: string[] } {
    const b = this.load(packageId, version);
    return this.d.builder.transaction(() => {
      const rows = this.d.builder.latestQc(packageId, version);
      const sourceBlocks = b.manifest.sources.flatMap((s) => {
        const latest = this.d.builder.latestSource(s.source_id);
        const decision = sourceUseDecision(latest?.record, { store_copy: true, ai_processing: false, learner_display: false });
        return decision.allowed ? [] : decision.blocks.map((x) => `${x}:${s.source_id}`);
      });
      const revs = this.d.knowledge.revocations();
      const revoked = isRevoked('package', packageId, version, revs) || b.manifest.units.some((u) => isRevoked(u.kind as Revocation['target_kind'], u.id, u.version, revs));
      const grants: Grant[] = evaluateCoverage(b.manifest.coverage, b.usage);
      const gate = releaseGate({ state: this.d.knowledge.releaseState(packageId, version), approved_bundle_hash: approvedBundleHash, frozen_bundle_hash: b.bundle_hash,
        recomputed_bundle_hash: b.recomputed, integrity_errors: b.integrity_errors, qc_spec_version: this.d.spec.qc_spec_version, required: requiredParts(this.d.spec),
        qc: rows, content_origin: b.origin, source_blocks: sourceBlocks, revoked, grants });
      if (!gate.allowed) {
        this.d.builder.recordEvent(b.manifest.request_id, 6, 'blocked', gate.reasons.join(', '), version, b.bundle_hash);
        return { allowed: false as const, reasons: gate.reasons };
      }
      const previous = this.d.builder.activeVersions(packageId).filter((v) => v !== version).at(-1);
      const manifest = {
        schema_version: '1', package: { id: packageId, version, hash: this.packageHash(packageId, version) }, bundle_hash: b.bundle_hash, qc_spec_version: this.d.spec.qc_spec_version,
        dependency_graph: b.units.flatMap((u) => u.value.governance.dependencies.units.map((to) => ({ from: { kind: u.kind, id: u.id, version: u.version }, to }))),
        units: b.manifest.units, media: b.manifest.media, sources: b.manifest.sources, grants,
        qc: STAGES.map((stage) => {
          const parts = rows.filter((r) => r.stage === stage);
          const methods = [...new Set(parts.map((p) => p.method))];
          return { stage, status: 'PASS', method: methods.length === 1 ? methods[0]! : 'composite', qc_id: parts.map((p) => p.qc_id).join('+'), bundle_hash: b.bundle_hash };
        }),
        rollback_point: previous ? { package_id: packageId, version: previous } : null, content_origin: b.origin, released_at: this.d.now().toISOString(),
      };
      const checked = this.d.validate('release_manifest', manifest);
      if (!checked.ok) throw new Error(`release_manifest invalid: ${checked.errors.join('; ')}`);
      this.d.builder.insertReleaseManifest(packageId, version, manifest);
      this.d.knowledge.transition(packageId, version, 'active', reason, manifest.package.hash);
      this.d.builder.recordEvent(b.manifest.request_id, 6, 'passed', 'released', version, b.bundle_hash);
      return { allowed: true as const, manifest };
    });
  }

  private packageHash(packageId: string, version: string): string {
    const ref = this.d.json.find('package', packageId, version);
    if (!ref) throw new Error('Package JSON missing');
    return ref.hash;
  }

  // ---- Suspend / retire / revoke ------------------------------------------------------------------
  /** Stops serving a release (store + cache) and lists dependent results; history and links stay intact. */
  withdraw(packageId: string, version: string, to: 'suspended' | 'retired', reason: string) {
    return this.d.builder.transaction(() => {
      this.d.knowledge.transition(packageId, version, to, reason);
      return this.propagate({ target_kind: 'package', target_id: packageId, target_version: version }, `${to}: ${reason}`, 'suspension_impact');
    });
  }

  /** Append-only revocation of a package, item, rubric or knowledge unit; suspends affected releases. */
  revoke(target: Revocation, reason: string) {
    return this.d.builder.transaction(() => {
      const revocationId = this.d.knowledge.revoke(target, reason);
      if (target.target_kind === 'item' || target.target_kind === 'knowledge' || target.target_kind === 'rubric') {
        for (const pkg of this.packagesContaining(target)) if (this.d.knowledge.releaseState(pkg.id, pkg.version) === 'active') this.d.knowledge.transition(pkg.id, pkg.version, 'suspended', `dependency revoked: ${reason}`);
      }
      return { revocation_id: revocationId, ...this.propagate(target, `revoked: ${reason}`, 'revocation_impact') };
    });
  }

  private packagesContaining(target: Revocation): { id: string; version: string }[] {
    return this.d.builder.packagesOf(target.target_kind, target.target_id, target.target_version);
  }

  private propagate(target: Revocation, reason: string, kind: 'revocation_impact' | 'suspension_impact') {
    const targets: { kind: string; id: string; version: string | null }[] = [{ kind: target.target_kind, id: target.target_id, version: target.target_version }];
    if (target.target_kind === 'package' && target.target_version) {
      targets.push(...this.d.builder.packageUnits(target.target_id, target.target_version).map((u) => ({ kind: u.kind, id: u.id, version: u.version })));
    }
    const invalidated = this.d.cache.invalidate(targets, reason);
    const impact = this.d.builder.impactOf(target);
    const learnerObs = impact.observations.filter((o) => o.scope === 'learner');
    const review = this.d.builder.openReview({ dedupe_key: `${kind}:${target.target_kind}:${target.target_id}@${target.target_version ?? '*'}:${reason}`, kind, target_kind: target.target_kind,
      target_id: target.target_id, target_version: target.target_version, severity: learnerObs.length > 0 ? 'high' : 'normal',
      summary: `${reason} — ${impact.attempts.filter((a) => a.scope === 'learner').length} lượt học, ${learnerObs.length} nhận định cần xem lại (gồm cả đạt và chưa đạt)`,
      detail: { attempts: impact.attempts, observations: impact.observations, jobs: impact.jobs, cache_invalidated: invalidated } });
    return { cache_invalidated: invalidated, impact, review_id: review.review_id };
  }
}
