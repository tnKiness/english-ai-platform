import { UNITS, taskItem, answerKey } from './synthetic.js';

// An accepted alternative is recorded BEFORE QC, not inferred from the audit's unresolved competitors.
export function readingUnits(version = 'v1') {
  const item = taskItem(version);
  item.body.questions.push({ question_id: 'q3', prompt: 'Name the season when the committee meets.', response_type: 'short_text', options: [] });
  const key = answerKey(version, version);
  key.body.answers.push({ question_id: 'q3', accepted: ['spring', 'in spring'], explanation: 'Both forms name the same season explicitly stated in the passage.', evidence_locator: 'stimulus sentence 3' });
  const value = { ...key, body: { ...key.body, competing_answers_considered: ['q3: spring / in spring are both accepted; the question imposes no word limit.'] } };
  return UNITS(version).map((u) => u.kind === 'item' ? { ...u, value: item } : u.kind === 'knowledge' ? { ...u, value } : u);
}
