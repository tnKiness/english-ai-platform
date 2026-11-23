// E-47 (D-05 C3, N5): deterministic checks the application runs on AI-authored Writing Task 2 prompts before they are
// packaged. The AI proposes items; these checks, the independent AI review and the release gate decide. An item with
// any error here is recorded as rejected and never packaged. Text similarity is a preliminary filter only.

/** knowledge.v1 wt2_item_set_result. */
/** Writing Task 2 genres, and (E-52) Speaking parts answered in writing. */
export type Wt2Genre = 'opinion' | 'discussion' | 'advantages_disadvantages' | 'problem_solution' | 'two_part' | 'part1' | 'part2' | 'part3';
export interface Wt2ItemDraft {
  item_key: string; genre: Wt2Genre; topic: string; item_family: string; prompt: string;
  test_type: 'academic' | 'general_training' | 'both'; competencies: string[]; difficulty_estimate: 'lower' | 'middle' | 'upper'; rationale: string;
  /** E-50: 'paragraph' = a short 7A transfer task aimed at exactly one competency (N5); absent = a whole essay. */
  task_scope?: 'essay' | 'paragraph';
}
export interface Wt2ItemSetResult { schema_version: '1'; job_id: string; context_manifest_id: string; synthetic: boolean; items: Wt2ItemDraft[]; limitations: string[] }

/** knowledge.v1 item_review_result. Each check maps to one QC stage (REVIEW_STAGE). */
export type ItemReviewCheck = 'clear_unambiguous' | 'genre_match' | 'originality' | 'no_forced_structure' | 'no_model_answer_or_ideas' | 'competency_mapping';
export interface ItemReviewResult {
  schema_version: '1'; job_id: string; context_manifest_id: string; synthetic: boolean;
  items: { item_key: string; verdict: 'pass' | 'fail'; findings: { check: ItemReviewCheck; severity: 'error' | 'warning'; issue: string }[] }[];
  limitations: string[];
}

/**
 * Which QC stage each review check belongs to (05 §5.C):
 * - QC2 (faithful to the basis): the measured competencies really are what the prompt gives a chance to show.
 * - QC3 (policy Parts 1–4): no imposed structure unless the role needs it; no answer or ready-made ideas (N5).
 * - QC4 (independent test of the task): clear and unambiguous, the declared genre, not a copy of an existing prompt.
 */
export const REVIEW_STAGE: Record<ItemReviewCheck, 'QC2' | 'QC3' | 'QC4'> = {
  competency_mapping: 'QC2', no_forced_structure: 'QC3', no_model_answer_or_ideas: 'QC3', clear_unambiguous: 'QC4', genre_match: 'QC4', originality: 'QC4',
};

export interface ItemFinding { code: string; severity: 'error' | 'warning'; item_key: string; detail: string }
export interface ExistingPrompt { item_id: string; prompt: string; item_family: string | null }

const STOP = new Set(('the a an and or of to in on for with by at as is are be been was were it its this that these those some many people other others more most '
  + 'than such into from about should would could can may might do does did not no your you their they them there what which who whom whose why how '
  + 'discuss both views give own opinion extent agree disagree reasons answer include any relevant examples knowledge experience write least words '
  + 'advantages disadvantages outweigh problems solutions causes').split(/\s+/));

/** Content words of a prompt (lowercase, ≥3 letters, without the shared task instructions). */
export function contentWords(text: string): Set<string> {
  return new Set(text.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w)));
}

/** Jaccard overlap of content words: 1 = same vocabulary. A preliminary filter, never a semantic verdict. */
export function promptSimilarity(a: string, b: string): number {
  const x = contentWords(a); const y = contentWords(b);
  if (x.size === 0 || y.size === 0) return 0;
  let inter = 0;
  for (const w of x) if (y.has(w)) inter++;
  return inter / (x.size + y.size - inter);
}

// Explicit structure or counting instructions inside a prompt (N5: the prompt must not force a structure).
const FORCED_STRUCTURE = /\b(write|use|include)\b[^.]{0,30}\b(\d+|two|three|four|five)\s+(paragraphs?|body paragraphs?|sentences?|linking words?|examples?)\b|\b(in|with)\s+(\d+|two|three|four|five)\s+paragraphs?\b|\buse (the following|these) (words|phrases|linking)/i;
// Ready-made ideas or a model answer given to the learner (N5: no answer or suggested ideas).
const GIVEN_IDEAS = /\b(for example,? you (could|might|can)|you (could|might|may) (mention|argue|say|write about)|ideas?:|model answer|sample answer|outline:)/i;

export function checkItems(items: Wt2ItemDraft[], opts: {
  competencies: ReadonlySet<string>; existing: ExistingPrompt[]; similarity_threshold: number; min_prompt_words: number; task_scope?: 'essay' | 'paragraph';
}): ItemFinding[] {
  const f: ItemFinding[] = [];
  const add = (code: string, severity: 'error' | 'warning', item_key: string, detail: string) => f.push({ code, severity, item_key, detail });
  const keys = new Map<string, number>();
  for (const it of items) keys.set(it.item_key, (keys.get(it.item_key) ?? 0) + 1);
  items.forEach((it, i) => {
    if ((keys.get(it.item_key) ?? 0) > 1) add('ITEM_KEY_DUPLICATE', 'error', it.item_key, 'item_key is not unique in the set');
    const unknown = it.competencies.filter((c) => !opts.competencies.has(c));
    if (unknown.length) add('COMPETENCY_UNKNOWN', 'error', it.item_key, `not in the approved framework: ${unknown.join(', ')}`);
    if (new Set(it.competencies).size !== it.competencies.length) add('COMPETENCY_REPEATED', 'warning', it.item_key, 'a competency is listed twice');
    if (it.task_scope === 'paragraph' && it.competencies.length !== 1) add('PARAGRAPH_TARGET', 'error', it.item_key, `a paragraph task targets exactly one competency (${it.competencies.length} given)`);
    if (opts.task_scope && (it.task_scope ?? 'essay') !== opts.task_scope) add('TASK_SCOPE_MISMATCH', 'error', it.item_key, `asked for ${opts.task_scope}, got ${it.task_scope ?? 'essay'}`);
    const words = it.prompt.trim().split(/\s+/).length;
    if (words < opts.min_prompt_words) add('PROMPT_TOO_SHORT', 'error', it.item_key, `${words} words`);
    if (FORCED_STRUCTURE.test(it.prompt)) add('FORCED_STRUCTURE', 'error', it.item_key, 'prompt imposes a structure or a count');
    if (GIVEN_IDEAS.test(it.prompt)) add('GIVEN_IDEAS', 'error', it.item_key, 'prompt hands the learner ideas or a model answer');
    for (const e of opts.existing) {
      const s = promptSimilarity(it.prompt, e.prompt);
      if (s >= opts.similarity_threshold) add('NEAR_DUPLICATE', 'error', it.item_key, `similar to ${e.item_id} (${s.toFixed(2)})`);
      else if (e.item_family !== null && e.item_family === it.item_family) add('FAMILY_REUSED', 'warning', it.item_key, `same family as ${e.item_id}`);
    }
    for (const other of items.slice(0, i)) {
      const s = promptSimilarity(it.prompt, other.prompt);
      if (s >= opts.similarity_threshold) add('NEAR_DUPLICATE', 'error', it.item_key, `similar to ${other.item_key} in the same set (${s.toFixed(2)})`);
    }
  });
  return f;
}
