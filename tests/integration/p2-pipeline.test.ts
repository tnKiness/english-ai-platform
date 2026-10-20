// P2-2: staging pipeline, QC1–4, blind solve vs verification, publish exact hash, suspend/retire/revoke propagation.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccessDeniedError, scopedReader } from '../../src/application/context/scoped-reader.js';
import { submitForAssessment } from '../../src/application/learning/submit-for-assessment.js';
import { effectiveObservations } from '../../src/domain/knowledge/revocation.js';
import { FakeAdapter } from '../../src/infrastructure/ai/fake-adapter.js';
import { loadQcSpec } from '../../src/infrastructure/contracts/knowledge-specs.js';
import { validateKnowledge } from '../../src/infrastructure/contracts/validate.js';
import { ImmutableVersionError } from '../../src/infrastructure/files/json-store.js';
import { ResultCache, type CacheKeyFields } from '../../src/infrastructure/sqlite/result-cache.js';
import { builderPipeline } from '../../src/infrastructure/sqlite/store.js';
import { processNextJob } from '../../src/worker/worker.js';
import { ITEM_ID, KEY_ID, REQUEST, RUBRIC_ID, SECRET_EXPLANATION, SYNTHETIC_SOURCE, UNCLEAR_SOURCE, UNITS, taskItem } from '../fixtures/knowledge/synthetic.js';
import { builderFixture, CORRECT, count, drain, PKG, qc, stage, type BuilderFixture } from './p2-helpers.js';

let fx: BuilderFixture | undefined;
afterEach(() => { fx?.cleanup(); fx = undefined; });

async function releasedV1() {
  fx = await builderFixture();
  const req = stage(fx);
  const frozen = fx.pipeline.freeze(req, 'v1');
  const run = await qc(fx, 'v1');
  return { req, frozen, run, released: fx.pipeline.release(PKG, 'v1', frozen.bundle_hash) };
}

describe('P2-2 pipeline happy path (synthetic package)', () => {
  it('QC1–QC4 on the frozen bundle, then release exactly that hash with a release manifest', async () => {
    const { req, frozen, run, released } = await releasedV1();
    const f = fx!;
    expect(run.checks.map((c) => c.status)).toEqual(['PASS', 'PASS', 'PASS']);
    expect(run.checks[0]!.findings.map((x) => x.code)).toEqual(['QC1_COVERAGE_GAP']); // function_blocking only
    expect(run.first.status).toBe('PENDING');
    expect(run.qc4).toEqual({ status: 'PASS', findings: [] });
    expect(f.pipeline.qcStatus(PKG, 'v1').stages.map((s) => s.status)).toEqual(['PASS', 'PASS', 'PASS', 'PASS']);
    expect(released.allowed).toBe(true);
    expect(f.store.knowledge.releaseState(PKG, 'v1')).toBe('active');
    const manifest = f.store.builder.releaseManifest(PKG, 'v1') as { grants: unknown; bundle_hash: string; qc: { method: string }[] };
    expect(validateKnowledge('release_manifest', manifest).ok).toBe(true);
    expect(manifest.bundle_hash).toBe(frozen.bundle_hash);
    expect(manifest.grants).toEqual([
      { usage_role: 'practice', granted: true, blocked_reasons: [] },
      { usage_role: 'independent_verification', granted: false, blocked_reasons: ['MISSING_VALID_EXCEPTION'] },
    ]);
    expect(manifest.qc.map((q) => q.method)).toEqual(['deterministic', 'composite', 'composite', 'synthetic_fake']);
    expect(f.store.builder.events(req).filter((e) => e.step === 6).map((e) => e.status)).toEqual(['passed']);
    // Dry-run QC never touched learner data.
    expect([count(f, "attempts WHERE scope = 'learner'"), count(f, 'observations'), count(f, 'exposure_events')]).toEqual([0, 0, 0]);
    expect(count(f, "attempts WHERE scope = 'dry_run'")).toBe(2);
    // A learner can now be assigned the released item.
    expect(f.store.knowledge.servableItem(ITEM_ID, 'v1', 'learner')).toMatchObject({ ok: true });
  });

  it('blind solve never sees the key; verification is a separate job and context that does', async () => {
    const { run } = await releasedV1();
    const f = fx!;
    const manifests = f.store.db.prepare('SELECT role, phase, payload_json FROM context_manifests ORDER BY role').all() as { role: string; phase: string; payload_json: string }[];
    const blind = manifests.find((m) => m.role === 'blind_solver')!;
    const verify = manifests.find((m) => m.role === 'verifier')!;
    for (const secret of [SECRET_EXPLANATION, 'SYNTHETIC-KEY', 'accepted', 'measurement_targets', 'syn.reading.tfng', 'item_family_id', 'decisive_features']) {
      expect(blind.payload_json).not.toContain(secret);
    }
    expect(verify.payload_json).toContain(SECRET_EXPLANATION);
    expect(verify.payload_json).toContain('blind_answers');
    const blindJobs = f.store.db.prepare("SELECT job_id FROM ai_jobs WHERE task_type = 'reading.blind_solve'").all();
    const verifyJobs = f.store.db.prepare("SELECT job_id FROM ai_jobs WHERE task_type = 'reading.verify'").all();
    expect([blindJobs.length, verifyJobs.length]).toEqual([1, 1]);
    // What the provider process actually received in the blind phase.
    const seen = [...run.adapter.contexts.values()].map((c) => JSON.stringify(c));
    expect(seen.filter((s) => s.includes(SECRET_EXPLANATION))).toHaveLength(1);
    expect(seen.filter((s) => s.includes('"questions"') && !s.includes('answer_key'))).toHaveLength(1);
  });

  it('cuts permission before retrieval: a blind reader never opens the key file', async () => {
    await releasedV1();
    const f = fx!;
    const content = { get: vi.fn((k: 'item' | 'rubric' | 'knowledge' | 'policy', id: string, v: string, h?: string) => f.store.json.get(k, id, v, h)) };
    const blind = scopedReader('blind_solver', f.store.builder, content);
    expect(() => blind.read('knowledge', KEY_ID, 'v1')).toThrow(AccessDeniedError);
    expect(() => blind.read('rubric', RUBRIC_ID, 'v1')).toThrow(AccessDeniedError);
    expect(content.get).not.toHaveBeenCalled();
    expect(blind.read('item', ITEM_ID, 'v1').value).toMatchObject({ body: { prompt: expect.any(String) } });
    expect(scopedReader('verifier', f.store.builder, content).read('knowledge', KEY_ID, 'v1').value).toMatchObject({ body: { answers: expect.any(Array) } });
  });
});

describe('P2-2 publish only the QC\'d hash', () => {
  it('rejects a wrong approved hash and blocks releasing before QC', async () => {
    fx = await builderFixture();
    const frozen = fx.pipeline.freeze(stage(fx), 'v1');
    expect(fx.pipeline.release(PKG, 'v1', frozen.bundle_hash)).toMatchObject({ allowed: false, reasons: expect.arrayContaining(['QC_MISSING_QC1_DETERMINISTIC', 'QC_MISSING_QC4_DETERMINISTIC']) });
    await qc(fx, 'v1');
    expect(fx.pipeline.release(PKG, 'v1', 'f'.repeat(64))).toEqual({ allowed: false, reasons: ['APPROVED_HASH_MISMATCH'] });
    expect(fx.store.knowledge.releaseState(PKG, 'v1')).toBe('draft');
  });

  it('editing staged content after QC cannot reuse the version; a new version needs its own QC', async () => {
    fx = await builderFixture();
    const req = stage(fx);
    const v1 = fx.pipeline.freeze(req, 'v1');
    await qc(fx, 'v1');
    // Edit the staged item in place and try to freeze the same version again.
    fx.pipeline.stageUnit(req, 'item', taskItem('v1', { prompt: 'Edited after QC' }));
    expect(() => fx!.pipeline.freeze(req, 'v1')).toThrow(ImmutableVersionError);
    // Bump every unit to v2 with the edit; v2 has no QC, and v1 cannot be released under v2's hash.
    const units = UNITS('v2').map((u) => (u.kind === 'item' ? { ...u, value: taskItem('v2', { prompt: 'Edited after QC' }) } : u));
    const req2 = stage(fx, { request: { ...REQUEST, request_id: 'req-syn-velmora-2' }, units });
    const v2 = fx.pipeline.freeze(req2, 'v2');
    expect(v2.bundle_hash).not.toBe(v1.bundle_hash);
    expect(fx.pipeline.release(PKG, 'v2', v2.bundle_hash).allowed).toBe(false);
    expect(fx.pipeline.release(PKG, 'v1', v2.bundle_hash)).toEqual({ allowed: false, reasons: ['APPROVED_HASH_MISMATCH'] });
    expect(fx.pipeline.release(PKG, 'v1', v1.bundle_hash).allowed).toBe(true);
  });

  it('a file changed on disk after QC fails integrity and cannot be released', async () => {
    fx = await builderFixture();
    const frozen = fx.pipeline.freeze(stage(fx), 'v1');
    await qc(fx, 'v1');
    const file = join(fx.store.paths.knowledge, 'item', ITEM_ID, 'v1.json');
    writeFileSync(file, readFileSync(file, 'utf8').replace('paper lanterns', 'glass lanterns'));
    const out = fx.pipeline.release(PKG, 'v1', frozen.bundle_hash);
    expect(out).toMatchObject({ allowed: false, reasons: ['CONTENT_INTEGRITY_FAILED'] });
    // The unreadable unit is reported first; its dependents then also lose their dependency.
    const recheck = fx.pipeline.runChecks(PKG, 'v1')[0]!;
    expect(recheck.status).toBe('FAIL');
    expect(recheck.findings.map((x) => x.code)).toEqual(['QC1_INTEGRITY', 'QC1_DEPENDENCY_MISSING', 'QC1_COVERAGE_GAP']);
  });

  it('a new QC spec version or withdrawn source rights invalidate earlier PASS results', async () => {
    fx = await builderFixture();
    const frozen = fx.pipeline.freeze(stage(fx), 'v1');
    await qc(fx, 'v1');
    const newer = builderPipeline(fx.store, { spec: { ...loadQcSpec(), qc_spec_version: 'qc-spec-2' } });
    expect(newer.release(PKG, 'v1', frozen.bundle_hash)).toMatchObject({ allowed: false, reasons: expect.arrayContaining(['QC_STALE_QC1_DETERMINISTIC', 'QC_STALE_QC4_DETERMINISTIC']) });
    fx.pipeline.registerSource({ ...SYNTHETIC_SOURCE, version: 'v2', rights: { ...UNCLEAR_SOURCE.rights }, registry_state: 'rejected' });
    expect(fx.pipeline.release(PKG, 'v1', frozen.bundle_hash)).toMatchObject({ allowed: false, reasons: expect.arrayContaining(['SOURCE_UNREGISTERED:synthetic-author-notes', 'SOURCE_RIGHTS_UNCLEAR:synthetic-author-notes']) });
  });
});

describe('P2-2 QC gates block what they should', () => {
  it('a source with unclear rights fails QC1 and blocks release (D-05), with a review item', async () => {
    fx = await builderFixture();
    fx.pipeline.registerSource(UNCLEAR_SOURCE);
    const units = UNITS().map((u) => (u.kind === 'item'
      ? { ...u, value: { ...u.value, governance: { ...u.value.governance, basis: { ...u.value.governance.basis, sources: [{ source_id: UNCLEAR_SOURCE.source_id, source_version: 'v1', locator: 'p.1' }], derivation: 'interpreted' } } } }
      : u));
    const req = stage(fx, { units });
    const frozen = fx.pipeline.freeze(req, 'v1');
    expect(fx.store.builder.events(req).find((e) => e.step === 1 && e.status === 'blocked')?.detail).toContain(UNCLEAR_SOURCE.source_id);
    const { checks } = await qc(fx, 'v1');
    expect(checks[0]!.status).toBe('FAIL');
    expect(checks[0]!.findings.map((x) => x.code)).toEqual(expect.arrayContaining(['QC1_SOURCE_UNREGISTERED', 'QC1_SOURCE_RIGHTS_UNCLEAR', 'QC1_SOURCE_USE_NOT_PERMITTED']));
    expect(fx.store.db.prepare("SELECT usage_rights FROM package_versions WHERE package_id = ?").get(PKG)).toEqual({ usage_rights: 'unknown' });
    expect(fx.pipeline.release(PKG, 'v1', frozen.bundle_hash)).toEqual({ allowed: false, reasons: ['QC_FAIL_QC1_DETERMINISTIC',
      'SOURCE_UNREGISTERED:unclear-third-party', 'SOURCE_RIGHTS_UNCLEAR:unclear-third-party', 'SOURCE_USE_NOT_PERMITTED:unclear-third-party'] });
    expect(fx.store.builder.reviews().map((r) => r.kind)).toContain('qc_failed');
  });

  it('QC4 fails on a blind answer that differs from the key, or a competing answer found in audit', async () => {
    fx = await builderFixture();
    fx.pipeline.freeze(stage(fx), 'v1');
    const wrong = await qc(fx, 'v1', new FakeAdapter('success', { blindAnswers: { q1: 'TRUE', q2: 'NOT GIVEN' } }));
    expect(wrong.qc4.status).toBe('FAIL');
    expect(wrong.qc4.findings).toEqual([{ code: 'QC4_BLIND_SOLVE_MISMATCH', case_id: 'blind-1', detail: 'q1: blind answer differs from key' }]);
    fx.cleanup();
    fx = await builderFixture();
    fx.pipeline.freeze(stage(fx), 'v1');
    const competing = await qc(fx, 'v1', new FakeAdapter('success', { ...CORRECT, verdict: 'ambiguous', competing: [{ question_id: 'q2', answer: 'FALSE', rationale: 'synthetic' }] }));
    expect(competing.qc4.findings.map((x) => x.code)).toEqual(['QC4_COMPETING_ANSWER']);
  });

  it('FakeAdapter results never qualify sourced content', async () => {
    fx = await builderFixture();
    const frozen = fx.pipeline.freeze(stage(fx, { request: { ...REQUEST, request_id: 'req-sourced', content_origin: 'sourced' } }), 'v1');
    const { qc4 } = await qc(fx, 'v1');
    expect(qc4.findings.map((x) => x.code)).toEqual(['QC4_SYNTHETIC_ONLY']);
    expect(fx.pipeline.release(PKG, 'v1', frozen.bundle_hash).allowed).toBe(false);
  });

  it('a failed QC job leaves QC4 NOT_RUN instead of passing', async () => {
    fx = await builderFixture();
    fx.pipeline.freeze(stage(fx), 'v1');
    fx.pipeline.startQc4(PKG, 'v1');
    await drain(fx, new FakeAdapter('REFUSAL'));
    expect(fx.pipeline.advanceQc4(PKG, 'v1')).toMatchObject({ status: 'NOT_RUN' });
  });
});

describe('P2-2 suspend / retire / revoke with propagation', () => {
  const cacheFields: CacheKeyFields = { input_hash: 'c'.repeat(64), role: 'assessor', phase: 'assessment', policy_version: 'p', rubric_version: 'v1', knowledge: [], model: 'fake', disclosure_level: 0 };

  it('revoking an item stops serving, suspends the release, invalidates cache and traces both met and not-met results', async () => {
    await releasedV1();
    const f = fx!;
    const attempt = f.store.learning.createAttempt({ request_key: 'learner-1', scope: 'learner', item: { id: ITEM_ID, version: 'v1' }, rubric: { id: RUBRIC_ID, version: 'v1' }, mode: 'self_practice', purpose: 'practice' });
    submitForAssessment(f.store, { request_key: 'learner-1-sub', attempt_id: attempt.attempt_id, content: 'Synthetic learner answers', rubric: attempt.rubric,
      task_type: 'writing.assess', required_capabilities: ['text', 'structured_result'], eligible_providers: ['codex'], timeout_seconds: 60, policy_version: 'p' });
    const out = await processNextJob({ queue: f.store.queue, adapter: new FakeAdapter(), loadContext: (id) => f.store.learning.loadManifestPayload(id), owner: 'w', leaseMs: 60_000, heartbeatMs: 10_000,
      interpret: () => [
        { observation_key: 'a', competency_id: 'syn.c1', processing: 'processed', outcome: 'met', measurement_quality: 'sufficient', opportunity: 'observed', support_impact: 'no_related_effect_detected' },
        { observation_key: 'b', competency_id: 'syn.c2', processing: 'processed', outcome: 'not_met', measurement_quality: 'sufficient', opportunity: 'observed', support_impact: 'no_related_effect_detected' },
      ] });
    expect(out.status).toBe('COMMITTED');
    f.store.cache.put(cacheFields, { synthetic: true }, [{ kind: 'item', id: ITEM_ID, version: 'v1' }]);
    expect(f.store.cache.lookup(cacheFields, f.store.knowledge.revocations())).toMatchObject({ hit: true, counts_as_evidence: false });

    const revoked = f.pipeline.revoke({ target_kind: 'item', target_id: ITEM_ID, target_version: 'v1' }, 'synthetic answer key error');
    expect(f.store.knowledge.releaseState(PKG, 'v1')).toBe('suspended');
    expect(f.store.knowledge.servableItem(ITEM_ID, 'v1', 'learner')).toEqual({ ok: false, reason: 'REVOKED' });
    expect(() => f.store.learning.createAttempt({ request_key: 'learner-2', scope: 'learner', item: { id: ITEM_ID, version: 'v1' }, rubric: { id: RUBRIC_ID, version: 'v1' }, mode: 'exam', purpose: '7A' })).toThrow(/REVOKED/);
    expect(revoked.cache_invalidated).toBe(1);
    expect(f.store.cache.lookup(cacheFields, f.store.knowledge.revocations())).toEqual({ hit: false, reason: 'INVALIDATED' });
    expect(revoked.impact.observations.filter((o) => o.scope === 'learner').map((o) => o.outcome).sort()).toEqual(['met', 'not_met']);
    const review = f.store.builder.reviews().find((r) => r.review_id === revoked.review_id)!;
    expect(review).toMatchObject({ kind: 'revocation_impact', severity: 'high', status: 'open' });
    expect(review.summary).toContain('1 lượt học, 2 nhận định');
    // History stays; recognition does not (two-way protection).
    const stored = [...f.store.learning.observations('syn.c1', 'learner'), ...f.store.learning.observations('syn.c2', 'learner')];
    expect(stored).toHaveLength(2);
    expect(effectiveObservations(stored, f.store.knowledge.revocations()).effective).toHaveLength(0);
    expect(() => f.store.knowledge.transition(PKG, 'v1', 'active', 'again', 'x')).toThrow();
  });

  it('suspend then retire keeps history, invalidates cache and never re-activates', async () => {
    await releasedV1();
    const f = fx!;
    f.store.cache.put(cacheFields, { synthetic: true }, [{ kind: 'package', id: PKG, version: 'v1' }]);
    const s = f.pipeline.withdraw(PKG, 'v1', 'suspended', 'synthetic complaint');
    expect(s.cache_invalidated).toBe(1);
    expect(f.store.knowledge.servableItem(ITEM_ID, 'v1', 'learner')).toEqual({ ok: false, reason: 'RELEASE_SUSPENDED' });
    f.pipeline.withdraw(PKG, 'v1', 'retired', 'not worth fixing');
    expect(f.store.knowledge.releaseState(PKG, 'v1')).toBe('retired');
    expect(f.store.db.prepare('SELECT to_state FROM release_events WHERE package_id = ? ORDER BY created_at, rowid').all(PKG).map((r) => (r as { to_state: string }).to_state))
      .toEqual(['draft', 'active', 'suspended', 'retired']);
    expect(f.store.builder.releaseManifest(PKG, 'v1')).toBeDefined();
    expect(() => f.store.db.prepare('DELETE FROM qc_results').run()).toThrow(/immutable/);
    expect(() => f.store.db.prepare("UPDATE result_cache SET invalidated_at = NULL").run()).toThrow(/never revived/);
    expect(ResultCache.key(cacheFields)).toHaveLength(64);
  });
});
