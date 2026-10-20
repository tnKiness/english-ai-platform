// Synthetic Phần 5 fixtures. Every text below is invented for tests; nothing is copied from IELTS materials.
// The town "Velmora" and its festival do not exist. Not a calibration standard; never learner data.

type Block = 'foundation_language' | 'foundation_policy' | 'competency_spec' | 'rubric' | 'diagnostic_card' | 'generation_spec' | 'micro_lesson' | 'scaffold' | 'task_item' | 'answer_key';
type Role = 'learner' | 'blind_solver' | 'verifier' | 'assessor' | 'repair_tutor' | 'task_generator';
type Kind = 'item' | 'rubric' | 'knowledge' | 'policy';

export const SYNTHETIC_SOURCE = {
  schema_version: '1', source_id: 'synthetic-author-notes', version: 'v1', title: 'Synthetic author notes for fixtures',
  origin: 'synthetic', locator: { url: null, document: 'tests/fixtures/knowledge/synthetic.ts' }, scope_level: 'document',
  copyright_notice: 'Own synthetic test content', accessed_at: '2026-10-20T00:00:00.000Z', checksum: null,
  intended_purposes: ['internal_use', 'learner_display'],
  rights: { status: 'determined', store_copy: true, ai_processing: true, learner_display: true, basis: 'Authored by the project for tests' },
  registry_state: 'approved',
} as const;

export const UNCLEAR_SOURCE = {
  ...SYNTHETIC_SOURCE, source_id: 'unclear-third-party', title: 'Third-party page with unknown rights', origin: 'teaching',
  locator: { url: 'https://example.invalid/unknown-rights', document: null }, copyright_notice: 'Unknown',
  rights: { status: 'unclear', store_copy: false, ai_processing: false, learner_display: false, basis: 'Not yet determined' },
  registry_state: 'candidate',
} as const;

export function governance(unitType: Block, id: string, version: string, roles: Role[], opts: { disclosure?: string; deps?: { kind: Kind; id: string; version: string }[]; media?: string[]; authority?: string; derivation?: string; sources?: { source_id: string; source_version: string; locator: string }[] } = {}) {
  return {
    identity: { unit_id: id, unit_type: unitType, version },
    scope: { test_type: 'academic', skills: ['reading'], task_types: ['synthetic_tfng'], context: 'synthetic fixture' },
    basis: {
      sources: opts.sources ?? [{ source_id: SYNTHETIC_SOURCE.source_id, source_version: 'v1', locator: 'fixture' }],
      derivation: opts.derivation ?? 'synthetic_fixture', derived_from: [], knowledge_gaps: [],
    },
    authority: opts.authority ?? 'pedagogical_guidance',
    validity: { status: 'draft', effective_from: null, review_due: null },
    verification: { content: 'not_checked', resources: opts.media?.length ? 'not_checked' : 'not_applicable', usage_roles: [], empirical: 'untested', lifecycle: 'draft' },
    dependencies: { units: opts.deps ?? [], media: opts.media ?? [] },
    permissions: { roles, disclosure: opts.disclosure ?? 'prompt', copyright: 'own_synthetic' },
  };
}

export const ITEM_ID = 'syn-velmora-item';
export const KEY_ID = 'syn-velmora-key';
export const RUBRIC_ID = 'syn-reading-rubric';
export const SECRET_EXPLANATION = 'SYNTHETIC-KEY-EXPLANATION: paragraph two says lanterns are paper, not glass';

export function taskItem(version = 'v1', overrides: Partial<{ prompt: string; media: string[] }> = {}) {
  return {
    schema_version: '1',
    governance: governance('task_item', ITEM_ID, version, ['learner', 'blind_solver', 'verifier', 'assessor'], { media: overrides.media ?? [] }),
    body: {
      item_family_id: 'syn-velmora-family', derived_from: [], shared_stimulus_id: 'syn-velmora-passage', decisive_features: ['material of lanterns'],
      stimulus: { text: 'Velmora holds a winter festival. In the second week, residents hang paper lanterns along the river. The festival committee meets in spring.', media: overrides.media ?? [] },
      prompt: overrides.prompt ?? 'Do the statements agree with the information in the passage?',
      questions: [
        { question_id: 'q1', prompt: 'The lanterns are made of glass.', response_type: 'true_false_not_given', options: ['TRUE', 'FALSE', 'NOT GIVEN'] },
        { question_id: 'q2', prompt: 'The committee has twelve members.', response_type: 'true_false_not_given', options: ['TRUE', 'FALSE', 'NOT GIVEN'] },
      ],
      difficulty: { target_learner_level: null, initial_estimate: null, observed: null, calibration: 'estimated' },
    },
  };
}

export function answerKey(version = 'v1', itemVersion = 'v1') {
  return {
    schema_version: '1',
    governance: governance('answer_key', KEY_ID, version, ['verifier', 'assessor'], { disclosure: 'answer', deps: [{ kind: 'item', id: ITEM_ID, version: itemVersion }] }),
    body: {
      item: { kind: 'item', id: ITEM_ID, version: itemVersion },
      answers: [
        { question_id: 'q1', accepted: ['FALSE'], explanation: SECRET_EXPLANATION, evidence_locator: 'stimulus sentence 2' },
        { question_id: 'q2', accepted: ['NOT GIVEN'], explanation: 'SYNTHETIC-KEY: membership size is never stated', evidence_locator: 'stimulus sentence 3' },
      ],
      measurement_targets: ['syn.reading.tfng.contradiction'],
      competing_answers_considered: [] as string[],
    },
  };
}

export function rubric(version = 'v1', overrides: Partial<{ notes: string[] }> = {}) {
  return {
    schema_version: '1',
    governance: governance('rubric', RUBRIC_ID, version, ['assessor', 'verifier']),
    body: {
      official_criteria: [],
      observation_guide: [{ signal: 'Learner distinguishes contradiction from absence', counter_evidence: ['Guessing pattern'], valid_exceptions: [], inconclusive_when: ['Answer sheet incomplete'] }],
      aggregation: { method: 'holistic_by_criterion', notes: overrides.notes ?? ['Synthetic; no band mapping'] },
    },
  };
}

export function policyUnit(version = 'v1') {
  return {
    schema_version: '1',
    governance: governance('foundation_policy', 'syn-policy-blind-first', version, ['assessor', 'verifier', 'task_generator'], { authority: 'product_policy', derivation: 'product_policy_mapping', sources: [] }),
    body: { policy_ref: '04 §2.B', statement: 'Blind solve receives no answer, explanation or hidden target.', rule_engine_ref: null },
  };
}

export const UNITS = (v = 'v1') => [
  { kind: 'item' as const, id: ITEM_ID, version: v, value: taskItem(v) },
  { kind: 'knowledge' as const, id: KEY_ID, version: v, value: answerKey(v, v) },
  { kind: 'rubric' as const, id: RUBRIC_ID, version: v, value: rubric(v) },
  { kind: 'policy' as const, id: 'syn-policy-blind-first', version: v, value: policyUnit(v) },
];

export function coverage(v = 'v1', opts: { withNotGivenCase?: boolean } = {}) {
  const item = { kind: 'item' as const, id: ITEM_ID, version: v };
  return {
    schema_version: '1',
    functions: [
      { usage_role: 'practice' as const, required_categories: ['pass' as const, 'fail' as const, 'test_case' as const] },
      { usage_role: 'independent_verification' as const, required_categories: ['pass' as const, 'fail' as const, 'valid_exception' as const, 'inconclusive' as const, 'test_case' as const] },
    ],
    entries: [
      { category: 'pass' as const, units: [item], note: 'q1 FALSE correct' },
      { category: 'fail' as const, units: [item], note: 'q1 TRUE wrong' },
      ...(opts.withNotGivenCase === false ? [] : [{ category: 'inconclusive' as const, units: [item], note: 'blank answer sheet' }]),
    ],
    test_cases: [
      { case_id: 'blind-1', case_type: 'synthetic_probe', target: item, run: 'blind_solve', input_text: null, expected_outcome: null, expectation_basis: 'answer key', synthetic: true },
      { case_id: 'policy-1', case_type: 'policy', target: { kind: 'rubric' as const, id: RUBRIC_ID, version: v }, run: 'assessment', input_text: 'Synthetic learner answers: q1 FALSE; q2 blank.', expected_outcome: 'inconclusive', expectation_basis: '04 §2.C: incomplete signal stays inconclusive', synthetic: true },
    ],
  };
}

export const REQUEST = {
  schema_version: '1', request_id: 'req-syn-velmora', package_id: 'syn-velmora-pkg',
  competencies: ['syn.reading.tfng.contradiction'], task_roles: ['practice'], blocks: ['task_item', 'answer_key', 'rubric', 'foundation_policy'],
  usage_purposes: ['practice', 'independent_verification'], scope: { test_type: 'academic', skills: ['reading'] },
  out_of_scope: ['Band estimation'], acceptance_criteria: ['QC1–QC4 PASS on bundle hash'],
  limits: { max_sources: 1, max_revision_rounds: 2, max_ai_runs: 6 }, content_origin: 'synthetic_fixture',
} as const;
