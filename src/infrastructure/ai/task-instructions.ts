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

const TASKS: Record<TaskType, { role: string; schema: unknown; rules: string[] }> = {
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
