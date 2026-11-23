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
  'If DATA.context.task.skill is "speaking_text", the submission is a written version of a spoken answer (E-43): judge it as spoken language (spoken register and contractions are fine, no essay structure is expected) and never judge pronunciation, speed or hesitation.',
];

// E-42 (D-05 C2). DATA.context.sources are approved, rights-cleared reference texts; the official band descriptor table
// is given cell by cell. The application checks every quote against these texts, so quotes must be copied exactly.
const AUTHOR_RULES = [
  'Build the competency framework for DATA.context.task from DATA.context.sources only. Do not rely on memory of IELTS material that is not in DATA.',
  'Cover exactly the official criteria listed in DATA.context.requirements.criteria (if absent: task_response, coherence_cohesion, lexical_resource, grammatical_range_accuracy for IELTS Writing Task 2). Choose the granularity yourself: about 4-6 competencies per criterion, each narrow enough that one response can show it or not, broad enough that it recurs across responses. DATA.context.requirements gives the limits. If DATA.context.requirements.excluded lists something (for example pronunciation or delivery), it is not observable in this framework: create no competency for it.',
  'competency_id: "<prefix>.<code>.<snake_case_name>", where prefix is DATA.context.requirements.id_prefix (default "wt2") and code is tr, cc, lr, gra or fc for task_response, coherence_cohesion, lexical_resource, grammatical_range_accuracy, fluency_coherence; unique, stable, English. title_vi: a short Vietnamese name for the learner.',
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

// E-47 (D-05 C3, N5). DATA.context.framework is the approved competency framework; DATA.context.avoid lists prompts
// already in the item bank. The application re-checks everything (competency ids, near-duplicates, forced structure).
const ITEM_AUTHOR_RULES = [
  'Write DATA.context.requirements.count new, original IELTS Writing Task 2 prompts. Never copy or lightly edit a published IELTS prompt (Cambridge, IDP, British Council, ielts.org or any book); invent the scenario and wording yourself.',
  'Each prompt is what the learner reads: a short statement of the issue (one to three sentences) followed by the task instruction of its genre. Genres: "opinion" (To what extent do you agree or disagree?), "discussion" (Discuss both views and give your own opinion.), "advantages_disadvantages" (Do the advantages outweigh the disadvantages? or discuss both), "problem_solution" (What are the causes/problems ... and what solutions ...?), "two_part" (two direct questions). End every prompt with: "Give reasons for your answer and include any relevant examples from your own knowledge or experience."',
  'Do not tell the learner how many paragraphs, sentences or linking words to use, and do not give ideas, arguments, an outline or a model answer.',
  'Spread the set over different genres from DATA.context.requirements.genres and over different everyday IELTS topic areas (education, work, technology, environment, health, cities, media, culture, government, family). topic is a short English label; item_family is a snake_case name of the topic family, reused only for prompts on the same narrow theme.',
  'Choose item_family and topic so that no prompt repeats the theme of a prompt in DATA.context.avoid.',
  'competencies: the competency_ids from DATA.context.framework.competencies that a full essay on this prompt gives a genuine opportunity to show. Use only ids that exist there. A whole Task 2 essay normally gives a chance to show most competencies; leave out one only when the prompt really gives no opportunity for it, and say why in rationale.',
  'test_type: "both" unless the topic only suits one module. difficulty_estimate is a rough guess (lower / middle / upper); it is labelled as an estimate.',
  'item_key: short snake_case, unique in the set. rationale: one or two English sentences on why the prompt is clear and which genre features it tests.',
  'Do not estimate band scores. Put any doubt in "limitations".',
  'DATA.context.requirements.task_scope says what to write. "essay": whole Task 2 prompts as above. "paragraph": short transfer tasks for a learner who must show ONE competency again in a new context: state an issue in one or two sentences, then ask for one paragraph (for example one body paragraph supporting or challenging a view); end with "Write one paragraph of at least N words." where N is requirements.paragraph_min_words; list exactly one competency_id in competencies, the one the paragraph genuinely needs; do not name the competency or hint at how to show it. Set task_scope on every item to the requested value.',
  'If DATA.context.requirements.focus_competencies is present, every item must give a genuine opportunity for at least one of them (for paragraph tasks: target one of them).',
  'If DATA.context.requirements.skill is "speaking", write IELTS Speaking tasks instead of Task 2 essays; the learner answers in writing, as they would speak (pronunciation and delivery are never judged). genre: "part1" = three or four short questions on one familiar everyday topic; "part2" = a cue card (Describe … You should say: three or four points, and explain …); "part3" = two or three discussion questions that develop the theme in a more abstract way. task_scope "paragraph" means part1 targeting one competency; task_scope "essay" means part2 or part3. Ignore the Task 2 closing sentence rule and end with the instruction "Answer in writing as you would speak." Competencies come from DATA.context.framework (prefix spk.).',
];
const ITEM_REVIEW_RULES = [
  'You are reviewing AI-written IELTS Writing Task 2 prompts in DATA.context.items before they are given to a learner. You did not write them. Judge each prompt as the learner will read it.',
  'Checks, one finding per problem, each with check, severity and issue: "clear_unambiguous" (a learner can tell exactly what to write about and what to do; no hidden double question unless the genre is two_part); "genre_match" (the instruction matches the declared genre); "originality" (not a copy or light edit of a published IELTS prompt you recognise, and not the same theme as a prompt in DATA.context.avoid); "no_forced_structure" (no imposed number of paragraphs, sentences or linking words); "no_model_answer_or_ideas" (no ready-made ideas, outline or answer); "competency_mapping" (every listed competency_id from DATA.context.framework can genuinely be shown in an essay on this prompt).',
  'Speaking items (genre part1/part2/part3) are answered in writing as if spoken: genre_match checks the IELTS Speaking part format, not an essay type; informal register is expected.',
  'Items with task_scope "paragraph" are short transfer tasks: asking for one paragraph is the role of the task, not a forced structure; they must target exactly the one listed competency and must not name it or hint at how to show it.',
  'severity "error" means the prompt must not be released as it is; "warning" is a minor issue. verdict "pass" only when the item has no error.',
  'Return one entry per item in DATA.context.items, with the same item_key. Do not rewrite the prompts. Do not estimate band scores.',
  'If DATA.context.note is present it describes where the prompts come from; follow it (for prompts the learner imported from material they own, do not report originality).',
];

// E-54 (D-05 N5, E-44). Listening parts: the transcript is the source of truth for every answer (QC4 solves it blind).
const LISTENING_AUTHOR_RULES = [
  'Write DATA.context.requirements.count original IELTS Listening parts (DATA.context.requirements.parts lists which part numbers to use). Never copy or lightly edit a published IELTS recording or question paper; invent the situation, names and details.',
  'Part 1: an everyday conversation between two speakers (e.g. booking, enquiry); Part 2: a monologue in an everyday social context; Part 3: a conversation of two or three speakers in an educational or training context; Part 4: a monologue on an academic subject. context: one or two sentences the learner reads before listening (no answers in it).',
  'speakers: ids A, B, C with a short role and voice "female" or "male". script: the spoken lines in order, natural spoken English, about 350-700 words in total; include the normal distractors of IELTS (a detail corrected later, a speaker changing their mind) without making any answer ambiguous.',
  'questions: 5 to 10, ids q1, q2 … in the order the answers occur in the script. Types: form_completion / note_completion / sentence_completion / short_answer (set word_limit 1-3 and options []), multiple_choice (3 or 4 options, word_limit null, each accepted answer is exactly one of the options). answers: every acceptable written form (e.g. "7.30", "7:30", "half past seven"); for completion answers each must appear word for word in the script and respect word_limit.',
  'evidence_quote: the exact words of the script (copied character for character) that give the answer. The prompt must not contain the answer.',
  'competencies: 1-3 competency_ids from DATA.context.framework.competencies that answering this question needs (prefix lis.). Do not estimate band scores. Put any doubt in "limitations".',
]
const LISTENING_SOLVE_RULES = [
  'You are an independent solver. You get only what the learner will hear (DATA.context.items[].transcript) and the questions; you never see an answer key.',
  'Answer every question of every item. question_id in your answers is "<item_key>:<question_id>" (for example "museum_tour:q3"). For completion questions write the words exactly as spoken, within the word limit; for multiple_choice write the option text exactly.',
  'List any question that has more than one defensible answer, or no answer in the transcript, in "ambiguities" as "<item_key>:<question_id>: reason".',
]

const TASKS: Record<TaskType, { role: string; schema: unknown; rules: string[] }> = {
  'content.author': {
    role: 'You are an assessment designer building an evidence-centred competency framework for an IELTS task (named in DATA.context.task) from official reference material.',
    schema: knowledge.$defs.competency_framework_result,
    rules: AUTHOR_RULES,
  },
  'content.review': {
    role: 'You are an independent reviewer of an assessment framework draft. You did not write it.',
    schema: knowledge.$defs.framework_review_result,
    rules: REVIEW_RULES,
  },
  'content.item_author': {
    role: 'You are an IELTS Writing Task 2 item writer creating original practice and verification prompts for one learner.',
    schema: knowledge.$defs.wt2_item_set_result,
    rules: ITEM_AUTHOR_RULES,
  },
  'content.item_review': {
    role: 'You are an independent reviewer of IELTS Writing Task 2 prompts written by another AI.',
    schema: knowledge.$defs.item_review_result,
    rules: ITEM_REVIEW_RULES,
  },
  'content.listening_author': {
    role: 'You are an IELTS Listening item writer creating original practice and verification parts for one learner.',
    schema: knowledge.$defs.listening_item_set_result,
    rules: LISTENING_AUTHOR_RULES,
  },
  'content.listening_solve': {
    role: 'You are an independent blind solver for IELTS Listening parts, working from the transcript only.',
    schema: knowledge.$defs.blind_solve_result,
    rules: LISTENING_SOLVE_RULES,
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
