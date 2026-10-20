// Fixed, code-owned task instructions sent ahead of the data on stdin (06A §5.C.1). Only this text is instruction;
// everything after the DATA marker is reference data (DATA_POLICY). The required output is the business result
// contract for the task type, taken from the same JSON Schemas the parser validates against (result-contracts.ts).
import { createRequire } from 'node:module';
import type { TaskType } from '../../application/ai/provider-adapter.js';
import { DATA_POLICY } from '../../application/context/scoped-reader.js';

const require = createRequire(import.meta.url);
const core = require('../../../contracts/core.v1.schema.json') as { $defs: Record<string, unknown> };
const knowledge = require('../../../contracts/knowledge.v1.schema.json') as { $defs: Record<string, unknown> };

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
    role: 'You are an assessor judging whether the submission in DATA meets the rubric criterion in DATA.',
    schema: core.$defs.result,
    rules: ['Use "inconclusive" when the evidence is incomplete or insufficient; never guess a stronger conclusion.',
      'Do not estimate a band score.'],
  },
  'repair.assess': {
    role: 'You are an assessor judging whether the revised submission in DATA meets the rubric criterion in DATA.',
    schema: core.$defs.result,
    rules: ['Use "inconclusive" when the evidence is incomplete or insufficient; never guess a stronger conclusion.',
      'Do not estimate a band score.'],
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
