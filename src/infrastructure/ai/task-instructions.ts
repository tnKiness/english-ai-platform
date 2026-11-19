// Fixed, code-owned task instructions sent ahead of the data on stdin (06A §5.C.1). Only this text is instruction;
// everything after the DATA marker is reference data (DATA_POLICY). The required output is the business result
// contract for the task type, taken from the same JSON Schemas the parser validates against (result-contracts.ts).
import { createRequire } from 'node:module';
import type { TaskType } from '../../application/ai/provider-adapter.js';
import { DATA_POLICY } from '../../application/context/scoped-reader.js';

const require = createRequire(import.meta.url);
const knowledge = require('../../../contracts/knowledge.v1.schema.json') as { $defs: Record<string, unknown> };
const learning = require('../../../contracts/learning.v1.schema.json') as { $defs: Record<string, unknown> };
// The writing result schema refers to shared $defs; inline them so the schema sent to the CLI is self-contained.
const learningResult = JSON.parse(JSON.stringify(learning.$defs.writing_assessment_result).replace(/\{"\$ref":"#\/\$defs\/(\w+)"\}/g, (_m, name: string) => JSON.stringify(learning.$defs[name]))) as unknown;
const WRITING_RULES = [
  'Return one entry in "competencies" for every competency listed in DATA.context.competencies, using exactly its competency_id; judge each against its own criterion.',
  'Use "inconclusive" when the evidence is incomplete or insufficient; never guess a stronger conclusion. Use opportunity "absent" when the task gave no real chance to show the competency.',
  'Do not estimate a band score.',
  'Diagnosis: at most 3 "priority_issues", most important first; each names the competency_id, where it occurs, the symptom, a hypothesis about the cause (a hypothesis, not a verdict), how it should be verified, impact on the quality of this piece (0-3) and how certain the diagnosis is (0-3). Other issues go to "other_issues" briefly.',
  'Hints (null if every competency is met): level_1 points to the location and asks a guiding question; level_2 reminds the relevant rule or knowledge. Neither level_1 nor level_2 may contain the corrected sentence or any part of "model_rewrite". level_3_explanation explains directly; "model_rewrite" is one corrected example sentence; add one concept-check question and the short key idea of its expected answer.',
  'Write diagnosis and hints in Vietnamese; keep quoted English text from the submission as is.',
];

// E-42 (D-05 C2). DATA.context.sources are approved, rights-cleared reference texts; the official band descriptor table
// is given cell by cell. The application checks every quote against these texts, so quotes must be copied exactly.
const AUTHOR_RULES = [
  'Build the competency framework for IELTS Writing Task 2 (Academic and General Training share it) from DATA.context.sources only. Do not rely on memory of IELTS material that is not in DATA.',
  'Cover the four official criteria: task_response, coherence_cohesion, lexical_resource, grammatical_range_accuracy. Choose the granularity yourself: about 4-6 competencies per criterion, each narrow enough that one essay can show it or not, broad enough that it recurs across essays. DATA.context.requirements gives the limits.',
  'competency_id: "wt2.<tr|cc|lr|gra>.<snake_case_name>", unique, stable, English. title_vi: a short Vietnamese name for the learner.',
  'assessor_criterion: one or two English sentences an assessor applies to a single essay to decide met / not met / inconclusive for this competency. It must follow the official descriptors and must not mention band numbers, word counts or counts of errors or linking words.',
  'Evidence contract (05 Block 1): target_claim (what we conclude when it is shown), evidence_required (what must be observed), evidence_conditions (task conditions under which the evidence is valid), confounders (what can mimic or mask it), inference_limits (what may NOT be concluded).',
  'edges link to other competency_ids in this framework. Edge types: "component_of" = this competency is a narrower part of the target (structure only, no learning order); "supports" = showing this one tends to help show the target (no learning order, not required for it); "transferable_to" = the same ability applies in the target context; "confusable_with" = assessors or learners easily mistake one for the other; "prerequisite" = the target cannot be shown without this one. Only "prerequisite" needs a basis: a source statement, quoted in "basis"; the other types take basis null. Use edges sparingly; never use supports/component_of to imply an order of study.',
  'met / not met records whether the feature described in assessor_criterion is present in this essay; it is not a band level. Do not mix wording taken from different band levels inside one assessor_criterion.',
  'If DATA.context.revision is present, it holds your previous draft (previous_draft), the independent review of it (review_findings) and the automatic check findings (check_findings). Return a complete revised framework, not a diff: fix every finding of severity "error", address warnings where the sources support it, keep competency_ids stable unless you split, merge or remove a competency, and state in "limitations" any finding you did not follow and why.',
  'source_quotes: 1-3 quotes per competency, copied character for character from DATA.context.sources[].text or from a band table cell, with its source_ref. Short exact quotes (one clause or sentence) are better than long ones. Never paraphrase inside a quote. Line breaks, repeated spaces, letter case and curly vs straight quote marks are ignored when quotes are checked, so a sentence split across lines may be quoted as one string.',
  'observation_guide: for each competency, the signal to look for, counter-evidence, valid exceptions and when to answer inconclusive. Distinguish signals to consider from features the official descriptors say limit a rating.',
  'aggregation_notes: how an assessor combines observations across the whole essay, holistically per criterion; never mechanical counting.',
  'Do not set band thresholds, do not map competencies to band scores, and do not write descriptors for half bands.',
  'Write title_vi in Vietnamese; everything else in English. Put any doubt about the sources in "limitations".',
];
const REVIEW_RULES = [
  'You are reviewing a DRAFT framework in DATA.context.framework that another AI wrote from DATA.context.sources. Judge it only against those sources and DATA.context.requirements.',
  'Edge types are defined as follows and only "prerequisite" needs a source basis: component_of (narrower part, structure only), supports (tends to help, no learning order), transferable_to (same ability elsewhere), confusable_with (easily mistaken), prerequisite (cannot be shown without). Do not treat component_of / supports / transferable_to / confusable_with as prerequisite claims; flag them only if clearly wrong.',
  'Report as "error": a competency or assessor_criterion that contradicts or is not supported by the sources; a quote that does not support the competency it is attached to; a prerequisite edge without a source basis; a band threshold or band mapping; two competencies that measure the same thing.',
  'Report as "warning": unclear wording, gaps in coverage of the official descriptors, a competency too broad or too narrow to observe in one essay, a weak evidence contract.',
  'target is the competency_id concerned, or "framework" for issues of the whole draft. suggestion says concretely what to change. verdict "pass" only if there is no error.',
];

const TASKS: Record<TaskType, { role: string; schema: unknown; rules: string[] }> = {
  'content.author': {
    role: 'You are an assessment designer building an evidence-centred competency framework for IELTS Writing Task 2 from official reference material.',
    schema: knowledge.$defs.competency_framework_result,
    rules: AUTHOR_RULES,
  },
  'content.review': {
    role: 'You are an independent reviewer of an assessment framework draft. You did not write it.',
    schema: knowledge.$defs.framework_review_result,
    rules: REVIEW_RULES,
  },
  'reading.blind_solve': {
    role: 'You are an independent blind solver for one IELTS-style reading task. You see only what a learner sees.',
    schema: knowledge.$defs.blind_solve_result,
    rules: ['Answer every question in DATA.context.task using only the task text.',
      'Use the exact option wording for each answer (for TRUE/FALSE/NOT GIVEN tasks: TRUE, FALSE or NOT GIVEN).',
      'List any genuine ambiguity in "ambiguities" (empty array if none).'],
  },
  'reading.verify': {
    role: 'You are a verifier comparing an answer key with an independent blind solution for one reading task.',
    schema: knowledge.$defs.verification_result,
    rules: ['"consistent" only if the key is the single defensible answer for every question; "conflict" if the key is wrong; "ambiguous" if another answer is also defensible.',
      'Put each defensible alternative in "competing_answers" with a short rationale; put other observations in "findings".'],
  },
  'writing.assess': {
    role: 'You are an IELTS Writing assessor and tutor. Judge the learner submission in DATA against each competency criterion in DATA, for the task in DATA.context.task.',
    schema: learningResult,
    rules: WRITING_RULES,
  },
  'repair.assess': {
    role: 'You are an IELTS Writing assessor and tutor. DATA holds a revised submission (a self-repair). Judge the revised text against each competency criterion in DATA, for the task in DATA.context.task.',
    schema: learningResult,
    rules: WRITING_RULES,
  },
};

export function buildTaskInput(taskType: TaskType, jobId: string, manifestId: string, payload: unknown): string {
  const t = TASKS[taskType];
  return [
    t.role,
    'Do not use any tools, commands or files. Work only from DATA below.',
    ...t.rules.map((r) => `- ${r}`),
    `Reply with exactly one JSON object and nothing else (no prose, no code fence), valid against this JSON Schema. Set "schema_version" to "1", "job_id" to "${jobId}", "context_manifest_id" to "${manifestId}", "synthetic" to false.`,
    JSON.stringify(t.schema),
    '',
    `DATA (${DATA_POLICY})`,
    JSON.stringify({ data_policy: DATA_POLICY, job_id: jobId, context_manifest_id: manifestId, task_type: taskType, result_schema_version: '1', context: payload }),
  ].join('\n');
}
