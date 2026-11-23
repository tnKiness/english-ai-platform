// E-54 (D-05 N5): deterministic checks on AI-written Listening parts before they are voiced and packaged. The
// transcript is the source of truth: every completion answer must be spoken word for word, every evidence quote must
// be in the script, a multiple-choice key must be one of its options, and no prompt may contain its answer.
import { normalizeForQuote } from './framework-checks.js';
import { promptSimilarity, type ItemFinding } from './item-checks.js';

export interface ListeningQuestion {
  question_id: string; type: 'form_completion' | 'note_completion' | 'sentence_completion' | 'short_answer' | 'multiple_choice';
  prompt: string; options: string[]; word_limit: number | null; answers: string[]; evidence_quote: string; competencies: string[];
}
export interface ListeningDraft {
  item_key: string; part: 1 | 2 | 3 | 4; topic: string; item_family: string; context: string;
  speakers: { id: string; role: string; voice: 'female' | 'male' }[]; script: { speaker: string; text: string }[];
  questions: ListeningQuestion[]; difficulty_estimate: 'lower' | 'middle' | 'upper'; rationale: string;
}
export interface ListeningSetResult { schema_version: '1'; job_id: string; context_manifest_id: string; synthetic: boolean; items: ListeningDraft[]; limitations: string[] }

/** The learner-hidden transcript as stored in the item (speaker roles first, then the lines). */
export function transcriptText(d: Pick<ListeningDraft, 'speakers' | 'script'>): string {
  const roles = d.speakers.map((s) => `${s.id} = ${s.role}`).join('; ');
  return `SPEAKERS: ${roles}\n\n${d.script.map((l) => `${l.speaker}: ${l.text}`).join('\n')}`;
}

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const norm = (s: string) => normalizeForQuote(s).replace(/[.,;:!?]+$/g, '');

export function checkListening(items: ListeningDraft[], opts: { competencies: ReadonlySet<string>; existing: { item_id: string; text: string }[]; similarity_threshold: number }): ItemFinding[] {
  const f: ItemFinding[] = [];
  const add = (code: string, severity: 'error' | 'warning', item_key: string, detail: string) => f.push({ code, severity, item_key, detail });
  const keys = new Map<string, number>();
  for (const it of items) keys.set(it.item_key, (keys.get(it.item_key) ?? 0) + 1);
  items.forEach((it, idx) => {
    if ((keys.get(it.item_key) ?? 0) > 1) add('ITEM_KEY_DUPLICATE', 'error', it.item_key, 'item_key is not unique in the set');
    const ids = new Set(it.speakers.map((s) => s.id));
    if (ids.size !== it.speakers.length) add('SPEAKER_DUPLICATE', 'error', it.item_key, 'speaker id repeated');
    const unknownSpeakers = [...new Set(it.script.map((l) => l.speaker).filter((s) => !ids.has(s)))];
    if (unknownSpeakers.length) add('SPEAKER_UNKNOWN', 'error', it.item_key, `script uses undeclared speakers ${unknownSpeakers.join(',')}`);
    const script = norm(it.script.map((l) => l.text).join(' '));
    const scriptWords = words(it.script.map((l) => l.text).join(' '));
    if (scriptWords < 250 || scriptWords > 900) add('SCRIPT_LENGTH', scriptWords < 150 ? 'error' : 'warning', it.item_key, `${scriptWords} words`);
    const qids = it.questions.map((q) => q.question_id);
    if (new Set(qids).size !== qids.length || qids.some((q, i) => q !== `q${i + 1}`)) add('QUESTION_IDS', 'error', it.item_key, `ids must be q1..q${qids.length} in order`);
    let lastPos = -1;
    for (const q of it.questions) {
      const target = `${it.item_key}:${q.question_id}`;
      const unknown = q.competencies.filter((c) => !opts.competencies.has(c));
      if (unknown.length) add('COMPETENCY_UNKNOWN', 'error', target, unknown.join(', '));
      const quote = norm(q.evidence_quote);
      const pos = script.indexOf(quote);
      if (quote.length < 3 || pos < 0) add('EVIDENCE_NOT_IN_SCRIPT', 'error', target, `"${q.evidence_quote.slice(0, 120)}"`);
      else { if (pos < lastPos) add('ORDER', 'warning', target, 'answers should follow the order of the recording'); lastPos = pos; }
      if (q.type === 'multiple_choice') {
        if (q.options.length < 3 || q.options.length > 4) add('MCQ_OPTIONS', 'error', target, `${q.options.length} options`);
        if (q.word_limit !== null) add('MCQ_WORD_LIMIT', 'error', target, 'multiple choice has no word limit');
        if (q.answers.length !== 1 || !q.options.some((o) => norm(o) === norm(q.answers[0] ?? ''))) add('MCQ_KEY_NOT_OPTION', 'error', target, 'the key must be exactly one option');
      } else {
        if (q.options.length) add('COMPLETION_OPTIONS', 'error', target, 'completion questions have no options');
        if (q.word_limit === null) add('WORD_LIMIT_MISSING', 'error', target, 'completion questions need a word limit');
        for (const a of q.answers) {
          if (q.word_limit !== null && words(a) > q.word_limit) add('ANSWER_OVER_LIMIT', 'error', target, `"${a}" has ${words(a)} words, limit ${q.word_limit}`);
        }
        if (!q.answers.some((a) => script.includes(norm(a)))) add('ANSWER_NOT_SPOKEN', 'error', target, 'no accepted answer appears word for word in the script');
        if (q.answers.some((a) => norm(a).length >= 3 && norm(q.prompt).includes(norm(a)))) add('ANSWER_IN_PROMPT', 'error', target, 'the prompt contains its answer');
      }
    }
    const text = transcriptText(it);
    for (const e of opts.existing) {
      const s = promptSimilarity(text, e.text);
      if (s >= opts.similarity_threshold) add('NEAR_DUPLICATE', 'error', it.item_key, `similar to ${e.item_id} (${s.toFixed(2)})`);
    }
    for (const other of items.slice(0, idx)) {
      const s = promptSimilarity(text, transcriptText(other));
      if (s >= opts.similarity_threshold) add('NEAR_DUPLICATE', 'error', it.item_key, `similar to ${other.item_key} in the same set (${s.toFixed(2)})`);
    }
  });
  return f;
}

/** QC4 comparison: the blind answer must equal one accepted form (case/spacing/punctuation-insensitive). */
export function compareBlind(items: { item_key: string; questions: Pick<ListeningQuestion, 'question_id' | 'answers'>[] }[], blind: { answers: { question_id: string; answer: string }[]; ambiguities: string[] }) {
  return items.map((it) => {
    const mismatches = it.questions.filter((q) => {
      const given = blind.answers.find((a) => a.question_id === `${it.item_key}:${q.question_id}`)?.answer;
      return given === undefined || !q.answers.some((a) => norm(a) === norm(given));
    }).map((q) => q.question_id);
    const ambiguous = blind.ambiguities.filter((a) => a.startsWith(`${it.item_key}:`));
    return { item_key: it.item_key, mismatches, ambiguous, pass: mismatches.length === 0 && ambiguous.length === 0 };
  });
}
