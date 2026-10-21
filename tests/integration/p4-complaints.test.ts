import { afterEach, expect, it } from 'vitest';
import { ComplaintService } from '../../src/application/learning/complaints.js';
import { LearningWorkflowService } from '../../src/application/learning/writing-workflow.js';
import { submitForAssessment } from '../../src/application/learning/submit-for-assessment.js';
import { FakeAdapter } from '../../src/infrastructure/ai/fake-adapter.js';
import { builderPipeline } from '../../src/infrastructure/sqlite/store.js';
import { processNextJob, type WorkerDeps } from '../../src/worker/worker.js';
import { createApp } from '../../src/server/app.js';
import { fixture, assessInput, type Fixture } from './p1-helpers.js';
let f: Fixture | undefined;
afterEach(() => { f?.cleanup(); f = undefined; });
async function setup() {
  f = await fixture(); const fx = f;
  const attempt = f.store.learning.createAttempt({ request_key: 'a', scope: 'learner', item: f.item, rubric: f.rubric, mode: 'self_practice', purpose: '7A' });
  const { job } = submitForAssessment(f.store, assessInput(f, attempt.attempt_id, 's'));
  const deps: WorkerDeps = { queue: f.store.queue, adapter: new FakeAdapter(), owner: 'w', leaseMs: 60000, heartbeatMs: 10000,
    loadContext: (id) => fx.store.learning.loadManifestPayload(id), interpret: () => ['met', 'not_met'].map((outcome, i) => ({ observation_key: `c${i}`, competency_id: `c${i}`,
      processing: 'processed', outcome: outcome as 'met' | 'not_met', measurement_quality: 'sufficient', opportunity: 'observed', support_impact: 'no_related_effect_detected' })) };
  await processNextJob(deps);
  return { fx, deps, job, service: new ComplaintService(f.store) };
}
it('learner HTTP complaint creates one new job on the same source; fenced reassessment supersedes without deleting', async () => {
  const { fx, deps, service } = await setup();
  const old = fx.store.learning.observations('c1', 'learner')[0]!;
  const app = createApp({ store: fx.store });
  try {
    const session = await app.inject({ url: '/api/session', headers: { host: '127.0.0.1:4317' } });
    const headers = { host: '127.0.0.1:4317', origin: 'http://127.0.0.1:5173', cookie: String(session.headers['set-cookie']).split(';')[0]!, 'x-csrf-token': session.json().csrf_token as string };
    const payload = { request_key: 'complaint', observation_id: old.observation_id, reason: 'Synthetic disputed judgement' };
    const response = await app.inject({ method: 'POST', url: '/api/learning/complaints', headers, payload });
    expect(response.statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/learning/complaints', headers, payload })).json()).toEqual(response.json());
    expect(() => service.request({ ...payload, reason: 'different' })).toThrow(/CONFLICT/);
    expect((await processNextJob({ ...deps, claimOptions: { complaintsOnly: true }, interpret: (r, c) => service.interpret(r, c) })).status).toBe('COMMITTED');
    const all = fx.store.learning.observations('c1', 'learner');
    expect(all).toHaveLength(2);
    expect(all.find((o) => o.supersedes_id === old.observation_id)?.evidence_source_id).toBe(old.evidence_source_id);
    expect(fx.store.db.prepare('SELECT COUNT(*) FROM evidence_sources').pluck().get()).toBe(1);
    expect(fx.store.db.prepare('SELECT state FROM learner_complaints').pluck().get()).toBe('RESOLVED');
    expect(() => service.request({ ...payload, request_key: 'again' })).toThrow(/SUPERSEDED/);
  } finally { await app.close(); }
});

it('revocation propagates to positive/negative profile evidence and keeps review/history', async () => {
  const { fx } = await setup();
  const profiles = new LearningWorkflowService(fx.store);
  expect(profiles.competencyDetail('c0').evidence_summary.independent_sources_met).toBe(1);
  expect(profiles.competencyDetail('c1').evidence_summary.independent_sources_not_met).toBe(1);
  const revoked = builderPipeline(fx.store).revoke({ target_kind: 'item', target_id: fx.item.id, target_version: 'v1' }, 'synthetic error');
  expect(revoked.impact.observations.map((o) => o.outcome).sort()).toEqual(['met', 'not_met']);
  for (const c of ['c0', 'c1']) {
    const p = profiles.competencyDetail(c);
    expect(p.evidence_summary.observation_count).toBe(0);
    expect(p.verification_schedule.status).toBe('needs_recheck');
  }
  expect(fx.store.db.prepare('SELECT COUNT(*) FROM observations').pluck().get()).toBe(2);
  expect(fx.store.builder.reviews().some((r) => r.review_id === revoked.review_id)).toBe(true);
});

it('rejects replacement of an unrelated competency and rejects late complaint result after revocation', async () => {
  const { fx, deps, service } = await setup();
  const old = fx.store.learning.observations('c1', 'learner')[0]!;
  service.request({ request_key: 'c', observation_id: old.observation_id, reason: 'Synthetic' });
  const claim = fx.store.queue.claim('w', 60000, 'fake', { complaintsOnly: true })!;
  fx.store.queue.recordOutput(claim, {});
  const draft = service.interpret({ schema_version: '1', job_id: claim.job_id, context_manifest_id: claim.job.context_manifest_id, processing: 'processed', outcome: 'met', evidence_refs: [], limitations: [], synthetic: true }, claim)[0]!;
  expect(fx.store.queue.complete(claim, {}, [{ ...draft, competency_id: 'unrelated' }])).toMatchObject({ status: 'REJECTED', reason: 'INVALID_OBSERVATION' });
  fx.store.knowledge.revoke({ target_kind: 'item', target_id: fx.item.id, target_version: 'v1' }, 'synthetic error');
  expect(fx.store.queue.complete(claim, {}, [draft])).toMatchObject({ status: 'REJECTED', reason: 'DEPENDENCY_REVOKED' });
  expect((await processNextJob(deps)).status).toBe('IDLE');
  expect(fx.store.learning.observations('c1', 'learner')).toHaveLength(1);
});

it('04-C4: a corrected rubric creates a linked reassessment with new pins, leaving the original attempt unchanged', async () => {
  const { fx, job, deps } = await setup();
  const old = fx.store.learning.observations('c1', 'learner')[0]!;
  const rubric = fx.store.json.put('rubric', fx.rubric.id, 'v2', { synthetic: true, criteria: ['corrected synthetic criterion'] });
  const newJob = { ...job, idempotency_key: 'corrected-rubric', rubric_version: 'v2' };
  expect(() => fx.store.queue.enqueue(newJob, 0, { allowUpdatedRubric: true })).toThrow(/context rubric mismatch/);
  const manifest = fx.store.learning.createManifest({ manifest_id: 'corrected', role: 'assessor', phase: 'assessment', policy_version: 'synthetic', rubric: { id: rubric.id, version: rubric.version, hash: rubric.hash },
    knowledge: [], disclosure_level: 0, allowed_resource_ids: [], payload: { ...fx.store.learning.loadManifestPayload(job.context_manifest_id), rubric } });
  fx.store.queue.enqueue({ ...newJob, context_manifest_id: manifest.manifest_id }, 0, { allowUpdatedRubric: true });
  const drafts = deps.interpret;
  expect((await processNextJob({ ...deps, interpret: (r, c) => [{ ...drafts(r, c)[1]!, outcome: 'met', supersedes_id: old.observation_id }] })).status).toBe('COMMITTED');
  expect(fx.store.learning.getAttempt(job.attempt_id)?.rubric.version).toBe('v1');
  expect(fx.store.learning.observations('c1', 'learner').find((o) => o.supersedes_id === old.observation_id)?.rubric.version).toBe('v2');
  expect(fx.store.db.prepare('SELECT COUNT(*) FROM evidence_sources').pluck().get()).toBe(1);
});
