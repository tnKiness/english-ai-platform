import { describe, expect, it } from 'vitest';
import { classifyEvidence } from '../../src/domain/evidence/attribution.js';
import { concludeCompetency, markOverdue, summarizeEvidence, type ApprovedCompetencyPolicy } from '../../src/domain/evidence/inference.js';
import { limitBySignal } from '../../src/domain/evidence/signal.js';
import type { ObservationFacts } from '../../src/domain/evidence/types.js';
import { assessNovelty } from '../../src/domain/knowledge/novelty.js';
import { effectiveObservations } from '../../src/domain/knowledge/revocation.js';
import { checkPinned } from '../../src/domain/learning/pinning.js';
import { filterEligible, type TaskCandidate } from '../../src/domain/scheduling/eligibility.js';
import { decideAfterFailure } from '../../src/domain/jobs/budget.js';

const h = (c: string) => c.repeat(64);
const obs = (over: Partial<ObservationFacts> = {}): ObservationFacts => ({
  observation_id: 'o1', evidence_source_id: 'src1', submission_id: 'sub1', competency_id: 'c.synthetic',
  item: { id: 'item', version: 'v1', hash: h('a') }, rubric: { id: 'rubric', version: 'v1', hash: h('b') }, ai_run_id: 'run1', supersedes_id: null,
  processing: 'processed', outcome: 'met', measurement_quality: 'sufficient', opportunity: 'observed', support_impact: 'no_related_effect_detected', scope: 'learner', ...over,
});
const base = { submission: { kind: 'original' as const, created_at: '2026-10-20T00:10:00.000Z' }, attempt: { mode: 'self_practice' as const, purpose: '7A' as const }, assistance: [], novelty: 'novel' as const };

describe('signal quality limits (04 §2.C, 01 §5.2)', () => {
  it('passes a clean signal through and limits both directions otherwise', () => {
    const clean = { required_signal_present: true, processing: 'processed' as const, measurement_quality: 'sufficient' as const, opportunity: 'observed' as const };
    expect(limitBySignal('not_met', clean)).toEqual({ outcome: 'not_met', processing: 'processed', reasons: [] });
    expect(limitBySignal('met', { ...clean, measurement_quality: 'insufficient' }).outcome).toBe('inconclusive');
    expect(limitBySignal('not_met', { ...clean, measurement_quality: 'unknown' }).outcome).toBe('inconclusive');
    expect(limitBySignal('met', { ...clean, required_signal_present: false })).toMatchObject({ outcome: 'inconclusive', processing: 'missing_data', reasons: ['REQUIRED_SIGNAL_MISSING'] });
    expect(limitBySignal('not_met', { ...clean, processing: 'technical_error' }).reasons).toContain('TECHNICAL_ERROR');
    // Not seeing the structure is "no opportunity", not a failure (01 Bước 9).
    expect(limitBySignal('not_met', { ...clean, opportunity: 'absent' })).toMatchObject({ outcome: 'inconclusive', reasons: ['NO_OPPORTUNITY'] });
  });
});

describe('support, exposure and independence (01 §1, 02 §2.C)', () => {
  it('separates the three result levels and the support conditions', () => {
    expect(classifyEvidence({ ...base, observation: obs() }).use).toBe('independent_candidate');
    expect(classifyEvidence({ ...base, observation: obs(), submission: { ...base.submission, kind: 'repair' } }).use).toBe('scaffolded_repair');
    expect(classifyEvidence({ ...base, observation: obs({ support_impact: 'affected' }) }).use).toBe('assisted');
    expect(classifyEvidence({ ...base, observation: obs({ support_impact: 'unknown' }) }).use).toBe('needs_verification');
    expect(classifyEvidence({ ...base, observation: obs(), attempt: { mode: 'guided', purpose: 'lesson' } }).use).toBe('needs_verification');
    expect(classifyEvidence({ ...base, observation: obs(), novelty: 'exposed' }).use).toBe('exposed_task');
    expect(classifyEvidence({ ...base, observation: obs({ scope: 'dry_run' }) }).use).toBe('not_learner_evidence');
    expect(classifyEvidence({ ...base, observation: obs({ outcome: 'inconclusive' }) }).use).toBe('inconclusive');
  });

  it('applies assistance by content and timing: before the submission only, reduced load kept separate', () => {
    const affected = { displayed_at: '2026-10-20T00:05:00.000Z', impacts: [{ competency_id: 'c.synthetic', impact: 'affected' as const, reduced_load: false }] };
    const later = { ...affected, displayed_at: '2026-10-20T00:20:00.000Z' };
    const otherSkill = { ...affected, impacts: [{ competency_id: 'c.other', impact: 'affected' as const, reduced_load: false }] };
    const reduced = { displayed_at: affected.displayed_at, impacts: [{ competency_id: 'c.synthetic', impact: 'no_related_effect_detected' as const, reduced_load: true }] };
    expect(classifyEvidence({ ...base, observation: obs(), assistance: [affected] }).use).toBe('assisted');
    expect(classifyEvidence({ ...base, observation: obs(), assistance: [later] }).use).toBe('independent_candidate');
    expect(classifyEvidence({ ...base, observation: obs(), assistance: [otherSkill] }).use).toBe('independent_candidate');
    expect(classifyEvidence({ ...base, observation: obs(), assistance: [reduced] }).use).toBe('reduced_load');
  });

  it('treats novelty as task × exposure history, shared across builder and learner', () => {
    const cand = { item_id: 'i2', item_family_id: 'fam', shared_stimulus_id: 'stim', derived_from: ['i0'] };
    expect(assessNovelty(cand, []).novelty).toBe('novel');
    expect(assessNovelty(cand, [{ item_id: 'i2', item_family_id: 'fam', shared_stimulus_id: 'stim', level: 'prompt' }]).novelty).toBe('exposed');
    expect(assessNovelty(cand, [{ item_id: 'i1', item_family_id: 'fam', shared_stimulus_id: null, level: 'answer' }]).novelty).toBe('exposed');
    expect(assessNovelty(cand, [{ item_id: 'x', item_family_id: 'other', shared_stimulus_id: 'stim', level: 'explanation' }]).novelty).toBe('exposed');
    expect(assessNovelty(cand, [{ item_id: 'i0', item_family_id: 'other', shared_stimulus_id: null, level: 'sample_or_variant' }]).novelty).toBe('exposed');
    expect(assessNovelty(cand, [{ item_id: 'i1', item_family_id: 'fam', shared_stimulus_id: null, level: 'hint' }]).novelty).toBe('needs_review');
    expect(assessNovelty(cand, [{ item_id: 'z', item_family_id: 'other', shared_stimulus_id: null, level: 'answer' }]).novelty).toBe('novel');
  });
});

describe('inference limits and source counting (02 §2.C.1, 01 §5.1, D-02)', () => {
  it('counts one evidence source once however many observations, retries or re-evaluations it has', () => {
    const items = [
      { observation: obs({ observation_id: 'o1' }), use: 'independent_candidate' as const },
      { observation: obs({ observation_id: 'o2', ai_run_id: 'run2' }), use: 'independent_candidate' as const },
      { observation: obs({ observation_id: 'o3', supersedes_id: 'o1' }), use: 'independent_candidate' as const },
      { observation: obs({ observation_id: 'o4', evidence_source_id: 'src2', outcome: 'not_met' }), use: 'independent_candidate' as const },
      { observation: obs({ observation_id: 'o5', evidence_source_id: 'src3' }), use: 'scaffolded_repair' as const },
    ];
    const s = summarizeEvidence('c.synthetic', items);
    expect(s.observation_count).toBe(5);
    expect(s.independent_sources_met).toBe(1);
    expect(s.independent_sources_not_met).toBe(1);
    expect(s.sources_by_use).toEqual({ independent_candidate: 2, scaffolded_repair: 1 });
  });

  it('returns "chưa đủ kết luận" without an approved policy and never moves state for being overdue', () => {
    const s = summarizeEvidence('c.synthetic', [{ observation: obs(), use: 'independent_candidate' }]);
    expect(concludeCompetency(s, null)).toMatchObject({ status: 'inconclusive', reason: 'POLICY_NOT_APPROVED' });
    expect(concludeCompetency(summarizeEvidence('c.none', []), null)).toMatchObject({ status: 'inconclusive', reason: 'NO_EFFECTIVE_EVIDENCE' });
    const synthetic: ApprovedCompetencyPolicy = { policy_id: 'synthetic-test-policy', version: '0', approved: true, decide: () => ({ state: 'initial_short_task', rationale: ['synthetic test policy, not a real threshold'] }) };
    expect(concludeCompetency(s, synthetic)).toMatchObject({ status: 'decided', policy: { id: 'synthetic-test-policy', version: '0' } });
    expect(markOverdue({ state: 'integrated' as const, verification: 'not_due' as const })).toEqual({ state: 'integrated', verification: 'due' });
  });
});

describe('pinning and revocation (04 §4.B.1, 06 §5.B.5)', () => {
  const pins = { item: { id: 'item', version: 'v1', hash: h('a') }, rubric: { id: 'rubric', version: 'v1', hash: h('b') } };
  it('rejects a swapped rubric and blocks recognition from pinned revoked content', () => {
    expect(checkPinned(pins, pins, [])).toEqual({ ok: true });
    expect(checkPinned(pins, { ...pins, rubric: { id: 'rubric', version: 'v2', hash: h('c') } }, [])).toMatchObject({ ok: false, reason: 'PIN_MISMATCH' });
    expect(checkPinned(pins, pins, [{ target_kind: 'rubric', target_id: 'rubric', target_version: 'v1' }])).toMatchObject({ ok: false, reason: 'PINNED_DEPENDENCY_REVOKED' });
    expect(checkPinned(pins, pins, [{ target_kind: 'rubric', target_id: 'rubric', target_version: 'v9' }])).toEqual({ ok: true });
  });
  it('excludes superseded and revoked-dependency observations without deleting them', () => {
    const all = [obs({ observation_id: 'old' }), obs({ observation_id: 'new', supersedes_id: 'old' }), obs({ observation_id: 'bad', item: { id: 'faulty', version: 'v1', hash: h('d') } })];
    const r = effectiveObservations(all, [{ target_kind: 'item', target_id: 'faulty', target_version: null }]);
    expect(r.effective.map((o) => o.observation_id)).toEqual(['new']);
    expect(r.excluded).toEqual([{ observation_id: 'old', reason: 'SUPERSEDED', detail: [] }, { observation_id: 'bad', reason: 'REVOKED_DEPENDENCY', detail: ['item'] }]);
    expect(all).toHaveLength(3);
  });
});

describe('eligibility filter (02 §5.A, 04 §5.B)', () => {
  const cand = (over: Partial<TaskCandidate> = {}): TaskCandidate => ({
    task_id: 't', item: { id: 'i2', version: 'v1', item_family_id: 'fam', shared_stimulus_id: null, derived_from: [] }, package: { id: 'p', version: 'v1', release_state: 'active' },
    competency_ids: ['c.synthetic'], purpose: '7A', mode: 'self_practice', estimated_minutes: 10, meets_min_scope: true, quality_gate_passed: true, resources_available: true, ...over,
  });
  const session = { competency_ids: ['c.synthetic'], available_minutes: 15 };
  it('keeps a fully qualifying task and explains every rejection', () => {
    expect(filterEligible([cand()], session, [], []).eligible).toHaveLength(1);
    const r = filterEligible([
      cand({ task_id: 'skill', competency_ids: ['c.other'] }), cand({ task_id: 'time', estimated_minutes: 30 }), cand({ task_id: 'qc', quality_gate_passed: false }),
      cand({ task_id: 'draft', package: { id: 'p', version: 'v1', release_state: 'suspended' } }), cand({ task_id: 'scope', meets_min_scope: false }),
      cand({ task_id: 'guided', mode: 'guided' }), cand({ task_id: 'media', resources_available: false }),
    ], session, [], [{ target_kind: 'item', target_id: 'i2', target_version: 'v1' }]);
    expect(r.eligible).toEqual([]);
    expect(Object.fromEntries(r.rejected.map((x) => [x.task_id, x.reasons]))).toMatchObject({
      skill: ['NOT_SESSION_SKILL', 'REVOKED'], time: ['EXCEEDS_TIME', 'REVOKED'], qc: ['QUALITY_GATE_NOT_PASSED', 'REVOKED'], draft: ['NOT_ACTIVE', 'REVOKED'],
      scope: ['REVOKED', 'BELOW_MIN_SCOPE'], guided: ['REVOKED', 'GUIDED_MODE_FOR_VERIFICATION'], media: ['REVOKED', 'RESOURCES_UNAVAILABLE'],
    });
  });
  it('blocks exposed verification tasks but lets them be used for practice', () => {
    const seen = [{ item_id: 'i1', item_family_id: 'fam', shared_stimulus_id: null, level: 'answer' as const }];
    expect(filterEligible([cand()], session, seen, []).rejected[0]!.reasons).toEqual(['NOT_NOVEL']);
    expect(filterEligible([cand({ purpose: 'practice', meets_min_scope: false })], session, seen, []).eligible).toHaveLength(1);
  });
});

describe('Rule Engine purity (PROJECT_STRUCTURE)', () => {
  it('domain modules import no I/O, infrastructure, application or server code', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const files = readdirSync('src/domain', { recursive: true }).map(String).filter((f) => f.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(5);
    for (const f of files) {
      const src = readFileSync(`src/domain/${f}`, 'utf8');
      expect(src, f).not.toMatch(/from '(node:|better-sqlite3|fastify)|\/(infrastructure|application|server|worker|web)\//);
    }
  });
});

describe('job retry budget (06A §6.B)', () => {
  it('retries transient errors within 3 executions and allows one format repair', () => {
    expect(decideAfterFailure('TIMEOUT', { executions_used: 1, max_attempts_total: 3, format_repairs_used: 0 })).toMatchObject({ next: 'QUEUED', format_repair: false });
    expect(decideAfterFailure('NETWORK', { executions_used: 3, max_attempts_total: 3, format_repairs_used: 0 })).toMatchObject({ next: 'FAILED' });
    expect(decideAfterFailure('INVALID_SCHEMA', { executions_used: 1, max_attempts_total: 3, format_repairs_used: 0 })).toMatchObject({ next: 'QUEUED', format_repair: true });
    expect(decideAfterFailure('INVALID_SCHEMA', { executions_used: 2, max_attempts_total: 3, format_repairs_used: 1 })).toMatchObject({ next: 'NEEDS_REVIEW' });
    expect(decideAfterFailure('RATE_LIMIT', { executions_used: 1, max_attempts_total: 3, format_repairs_used: 0 }, 5000)).toEqual({ next: 'QUEUED', format_repair: false, delay_ms: 5000 });
    expect(decideAfterFailure('QUOTA_EXHAUSTED', { executions_used: 1, max_attempts_total: 3, format_repairs_used: 0 })).toEqual({ next: 'WAITING_QUOTA' });
    expect(decideAfterFailure('REFUSAL', { executions_used: 1, max_attempts_total: 3, format_repairs_used: 0 })).toMatchObject({ next: 'NEEDS_REVIEW' });
    expect(decideAfterFailure('BILLING_UNVERIFIED', { executions_used: 1, max_attempts_total: 3, format_repairs_used: 0 })).toMatchObject({ next: 'FAILED' });
  });
});
