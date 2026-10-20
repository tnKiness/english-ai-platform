// P2-1: six Phần 5 outputs are versioned schemas/documents with validators. Synthetic fixtures only.
import { describe, expect, it } from 'vitest';
import { KNOWLEDGE_CONTRACTS, validateKnowledge } from '../../src/infrastructure/contracts/validate.js';
import { loadPlaybook, loadQcSpec } from '../../src/infrastructure/contracts/knowledge-specs.js';
import { sourceUseDecision } from '../../src/domain/knowledge/source-rights.js';
import { evaluateCoverage } from '../../src/domain/knowledge/coverage.js';
import { REQUEST, SYNTHETIC_SOURCE, UNCLEAR_SOURCE, UNITS, answerKey, coverage, governance, rubric, taskItem } from '../fixtures/knowledge/synthetic.js';

const ok = (name: string, v: unknown) => validateKnowledge(name, v).ok;

describe('Knowledge Schemas (output 2)', () => {
  it('declares the six outputs and every block body', () => {
    for (const name of ['source_record', 'knowledge_unit', 'governance', 'package_request', 'ingestion_playbook', 'qc_spec', 'coverage_manifest', 'package_manifest', 'release_manifest',
      'foundation_language', 'foundation_policy', 'competency_spec', 'rubric', 'diagnostic_card', 'generation_spec', 'micro_lesson', 'scaffold', 'task_item', 'answer_key']) {
      expect(KNOWLEDGE_CONTRACTS).toContain(name);
    }
  });

  it('accepts the synthetic units and rejects extra or missing governance', () => {
    for (const u of UNITS()) expect(validateKnowledge('knowledge_unit', u.value)).toEqual({ ok: true, errors: [] });
    const { permissions: _p, ...noPermissions } = taskItem().governance;
    expect(ok('knowledge_unit', { ...taskItem(), governance: noPermissions })).toBe(false);
    expect(ok('knowledge_unit', { ...taskItem(), extra: 'x' })).toBe(false);
  });

  it('keeps answers out of task items, so blind views never need to strip them', () => {
    const item = taskItem();
    expect(ok('knowledge_unit', { ...item, body: { ...item.body, answer: 'FALSE' } })).toBe(false);
    expect(ok('knowledge_unit', { ...item, body: { ...item.body, questions: [{ ...item.body.questions[0], accepted: ['FALSE'] }] } })).toBe(false);
  });

  it('checks body shape against the declared unit type', () => {
    const key = answerKey();
    expect(ok('knowledge_unit', { ...key, governance: { ...key.governance, identity: { ...key.governance.identity, unit_type: 'task_item' } } })).toBe(false);
    expect(ok('knowledge_unit', { ...key, body: { ...key.body, answers: [] } })).toBe(false);
  });

  it('cannot express half-band official descriptors or a prerequisite without basis', () => {
    const r = rubric();
    expect(ok('knowledge_unit', { ...r, body: { ...r.body, official_criteria: [{ criterion: 'synthetic', band: 6.5, descriptor_locator: 'x' }] } })).toBe(false);
    expect(ok('knowledge_unit', { ...r, body: { ...r.body, official_criteria: [{ criterion: 'synthetic', band: 6, descriptor_locator: 'x' }] } })).toBe(true);
    const spec = (basis: string | null) => ({ schema_version: '1', governance: governance('competency_spec', 'syn-c', 'v1', ['assessor']),
      body: { competency_id: 'syn.c', target_claim: 'c', evidence_required: ['e'], evidence_conditions: ['k'], confounders: [], inference_limits: ['l'], edges: [{ type: 'prerequisite', target: 'syn.d', basis }] } });
    expect(ok('knowledge_unit', spec(null))).toBe(false);
    expect(ok('knowledge_unit', spec('synthetic basis'))).toBe(true);
  });
});

describe('Source Registry (output 1) and D-05', () => {
  it('accepts determined rights; unclear rights cannot store, process or display, nor be approved', () => {
    expect(ok('source_record', SYNTHETIC_SOURCE)).toBe(true);
    expect(ok('source_record', UNCLEAR_SOURCE)).toBe(true);
    expect(ok('source_record', { ...UNCLEAR_SOURCE, rights: { ...UNCLEAR_SOURCE.rights, ai_processing: true } })).toBe(false);
    expect(ok('source_record', { ...UNCLEAR_SOURCE, registry_state: 'approved' })).toBe(false);
  });

  it('blocks release use of unregistered, unclear or over-scoped sources', () => {
    const use = { store_copy: true, ai_processing: true, learner_display: true };
    expect(sourceUseDecision(SYNTHETIC_SOURCE, use)).toEqual({ allowed: true, blocks: [], detail: [] });
    expect(sourceUseDecision(undefined, use).blocks).toEqual(['SOURCE_UNREGISTERED']);
    expect(sourceUseDecision(UNCLEAR_SOURCE, use).blocks).toEqual(['SOURCE_UNREGISTERED', 'SOURCE_RIGHTS_UNCLEAR', 'SOURCE_USE_NOT_PERMITTED']);
    const noDisplay = { ...SYNTHETIC_SOURCE, rights: { ...SYNTHETIC_SOURCE.rights, learner_display: false } };
    expect(sourceUseDecision(noDisplay, use)).toMatchObject({ allowed: false, blocks: ['SOURCE_USE_NOT_PERMITTED'], detail: ['learner_display not permitted'] });
    expect(sourceUseDecision(noDisplay, { ...use, learner_display: false }).allowed).toBe(true);
  });
});

describe('Ingestion Playbook (3), QC Specification (4), package request', () => {
  it('loads versioned documents that pass their own schemas', () => {
    const spec = loadQcSpec();
    expect(spec.qc_spec_version).toBe('qc-spec-1');
    expect(spec.stages.map((s) => s.stage)).toEqual(['QC1', 'QC2', 'QC3', 'QC4']);
    expect(spec.stages.flatMap((s) => s.rules).filter((r) => r.method === 'semantic').map((r) => r.code)).toEqual(['QC2_SOURCE_SUPPORT', 'QC3_POLICY_COMPLIANCE']);
    expect(loadPlaybook().steps).toHaveLength(6);
  });

  it('rejects malformed QC rules and over-budget requests', () => {
    expect(ok('qc_spec', { schema_version: '1', qc_spec_version: 'x', stages: [] })).toBe(false);
    const spec = loadQcSpec();
    expect(ok('qc_spec', { ...spec, stages: [{ ...spec.stages[0], rules: [{ ...spec.stages[0]!.rules[0], code: 'bad code' }] }, ...spec.stages.slice(1)] })).toBe(false);
    expect(ok('package_request', REQUEST)).toBe(true);
    expect(ok('package_request', { ...REQUEST, limits: { ...REQUEST.limits, max_revision_rounds: 3 } })).toBe(false);
  });
});

describe('Test & Coverage Manifest (5) and Release Manifest (6)', () => {
  it('validates coverage; synthetic cases are never an external reference standard', () => {
    const c = coverage();
    expect(ok('coverage_manifest', c)).toBe(true);
    expect(ok('coverage_manifest', { ...c, test_cases: [{ ...c.test_cases[0], case_type: 'external_reference' }] })).toBe(false);
    expect(ok('coverage_manifest', { ...c, test_cases: [{ ...c.test_cases[1], expected_outcome: null }] })).toBe(false);
  });

  it('a missing category blocks only the usage role that needs it', () => {
    const grants = evaluateCoverage(coverage(), ['practice', 'independent_verification', 'teach']);
    expect(grants).toEqual([
      { usage_role: 'practice', granted: true, blocked_reasons: [] },
      { usage_role: 'independent_verification', granted: false, blocked_reasons: ['MISSING_VALID_EXCEPTION'] },
      { usage_role: 'teach', granted: false, blocked_reasons: ['NO_COVERAGE_REQUIREMENT_DECLARED'] },
    ]);
  });

  it('a release manifest needs four PASS stages bound to a bundle hash', () => {
    const h = 'a'.repeat(64);
    const qc = (['QC1', 'QC2', 'QC3', 'QC4'] as const).map((stage) => ({ stage, status: 'PASS', method: 'deterministic', qc_id: `qc-${stage}`, bundle_hash: h }));
    const release = { schema_version: '1', package: { id: 'p', version: 'v1', hash: h }, bundle_hash: h, qc_spec_version: 'qc-spec-1', dependency_graph: [],
      units: [{ kind: 'item', id: 'i', version: 'v1', hash: h }], media: [], sources: [], grants: [{ usage_role: 'practice', granted: true, blocked_reasons: [] }],
      qc, rollback_point: null, content_origin: 'synthetic_fixture', released_at: '2026-10-20T00:00:00.000Z' };
    expect(ok('release_manifest', release)).toBe(true);
    expect(ok('release_manifest', { ...release, qc: qc.slice(0, 3) })).toBe(false);
    expect(ok('release_manifest', { ...release, qc: [{ ...qc[0], status: 'FAIL' }, ...qc.slice(1)] })).toBe(false);
  });
});
