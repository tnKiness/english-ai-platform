import type { TaskType } from '../../application/ai/provider-adapter.js';
import { validateContract, validateKnowledge, validateLearning } from '../contracts/validate.js';

/** E-52: why a content-authoring result broke its contract — instance paths and validator messages only, no values. */
export function aiResultErrors(taskType: TaskType, value: unknown): string[] {
  const name = taskType === 'content.author' ? 'competency_framework_result' : taskType === 'content.review' ? 'framework_review_result'
    : taskType === 'content.item_author' ? 'wt2_item_set_result' : taskType === 'content.item_review' ? 'item_review_result'
    : taskType === 'content.listening_author' ? 'listening_item_set_result' : taskType === 'content.listening_solve' ? 'blind_solve_result' : null;
  return name ? validateKnowledge(name, value).errors.slice(0, 5) : [];
}

/** Business result contract per task type (inner layer of the envelope, 06A §5.C.5). */
export function validateAiResult(taskType: TaskType, value: unknown): boolean {
  if (taskType === 'reading.blind_solve') return validateKnowledge('blind_solve_result', value).ok;
  if (taskType === 'reading.verify') return validateKnowledge('verification_result', value).ok;
  if (taskType === 'content.author') return validateKnowledge('competency_framework_result', value).ok;
  if (taskType === 'content.review') return validateKnowledge('framework_review_result', value).ok;
  if (taskType === 'content.item_author') return validateKnowledge('wt2_item_set_result', value).ok;
  if (taskType === 'content.item_review') return validateKnowledge('item_review_result', value).ok;
  if (taskType === 'content.listening_author') return validateKnowledge('listening_item_set_result', value).ok;
  if (taskType === 'content.listening_solve') return validateKnowledge('blind_solve_result', value).ok;
  // Writing: the learning.v1 result (per-competency outcomes + diagnosis) or the P0 single-outcome result.
  if (typeof value === 'object' && value !== null && 'competencies' in value) return validateLearning('writing_assessment_result', value).ok;
  return validateContract('result', value);
}
