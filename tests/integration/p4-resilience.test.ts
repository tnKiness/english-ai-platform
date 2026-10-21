import { afterEach, expect, it } from 'vitest';
import { ReplanRepository } from '../../src/infrastructure/sqlite/replan-repository.js';
import { selectFallback } from '../../src/domain/scheduling/fallback.js';
import { limitBySignal } from '../../src/domain/evidence/signal.js';
import { classifyEvidence } from '../../src/domain/evidence/attribution.js';
import { fixture, type Fixture } from './p1-helpers.js';
let f: Fixture | undefined;
afterEach(() => { f?.cleanup(); f = undefined; });

it('06A-10: rejects stale/expired proposals; acceptance is idempotent', async () => {
  f = await fixture();
  const db = f.store.db;
  const at = f.clock.now().toISOString();
  db.prepare("INSERT INTO plan_versions VALUES ('learner', 2, ?)").run(at);
  const add = (id: string, base: number, expires = '2027-01-01') => db.prepare("INSERT INTO replan_proposals VALUES (?, ?, '[]', '[]', 10, ?, 'PROPOSED', ?, ?)").run(id, base, expires, at, at);
  add('stale', 1); add('ok', 2); add('expired', 2, '2020-01-01');
  const repo = new ReplanRepository(db, f.clock.now);
  expect(repo.accept('stale')).toBe('STALE');
  expect(repo.accept('expired')).toBe('EXPIRED');
  expect(repo.accept('ok')).toBe('ACCEPTED');
  expect(repo.accept('ok')).toBe('ACCEPTED');
  expect(db.prepare('SELECT plan_version FROM plan_versions').pluck().get()).toBe(3);
});

it('04-C5: QC failure fallback requires all five compatibility conditions', () => {
  const c = { task_id: 'synthetic', item: { id: 'i', version: '1', item_family_id: 'f', shared_stimulus_id: null, derived_from: [] },
    package: { id: 'p', version: '1', release_state: 'active' as const }, competency_ids: ['c'], purpose: '7A' as const,
    mode: 'self_practice' as const, constraint: 'semantic' as const, estimated_minutes: 10, meets_min_scope: true, quality_gate_passed: true, resources_available: true };
  const session = { competency_ids: ['c'], available_minutes: 15, mode: 'self_practice' as const, constraint: 'semantic' as const };
  expect(selectFallback([c], session, [], []).state).toBe('AVAILABLE');
  for (const bad of [{ ...c, competency_ids: ['other'] }, { ...c, meets_min_scope: false }, { ...c, mode: 'exam' as const },
    { ...c, constraint: 'explicit_form' as const }, { ...c, estimated_minutes: 20 }, { ...c, resources_available: false }, { ...c, quality_gate_passed: false }]) {
    expect(selectFallback([bad], session, [], []).state).toBe('WAITING_VERIFICATION');
  }
  expect(selectFallback([c], session, [{ item_id: 'i', item_family_id: 'f', shared_stimulus_id: null, level: 'answer' }], []).state).toBe('WAITING_VERIFICATION');
});

it('04-C1: a noisy segment limits only its own judgement', () => {
  const clean = { required_signal_present: true, processing: 'processed' as const, measurement_quality: 'sufficient' as const, opportunity: 'observed' as const };
  expect([limitBySignal('not_met', { ...clean, measurement_quality: 'insufficient' }).outcome, limitBySignal('met', clean).outcome]).toEqual(['inconclusive', 'met']);
});

it('04-C2: missing pre-support snapshot uses displayed impacts; unknown impact remains inconclusive for independence', async () => {
  f = await fixture();
  const a = f.store.learning.createAttempt({ request_key: 'a', scope: 'learner', item: f.item, rubric: f.rubric, mode: 'self_practice', purpose: '7A' });
  const sub = f.store.learning.submit({ request_key: 's', attempt_id: a.attempt_id, content: 'Synthetic' });
  f.store.learning.recordAssistance({ idempotency_key: 'hint', attempt_id: a.attempt_id, submission_id: sub.submission_id, hint_level: 1, content: 'Synthetic hint',
    impacts: [{ competency_id: 'affected', impact: 'affected', reduced_load: false }, { competency_id: 'unknown', impact: 'unknown', reduced_load: false }], pre_snapshot_id: null, post_snapshot_id: null });
  const obs = { observation_id: 'o', evidence_source_id: a.evidence_source_id, submission_id: sub.submission_id, competency_id: 'affected', item: a.item, rubric: a.rubric,
    ai_run_id: 'r', supersedes_id: null, processing: 'processed' as const, outcome: 'met' as const, measurement_quality: 'sufficient' as const, opportunity: 'observed' as const,
    support_impact: 'no_related_effect_detected' as const, scope: 'learner' as const };
  f.clock.advance(1000);
  const facts = { submission: { kind: 'original' as const, created_at: f.clock.now().toISOString() }, attempt: a, assistance: f.store.learning.assistanceFor(a.attempt_id), novelty: 'novel' as const };
  expect(classifyEvidence({ ...facts, observation: obs }).use).toBe('assisted');
  expect(classifyEvidence({ ...facts, observation: { ...obs, competency_id: 'unknown' } }).use).toBe('needs_verification');
  expect(classifyEvidence({ ...facts, observation: { ...obs, competency_id: 'unaffected' } }).use).toBe('independent_candidate');
});
