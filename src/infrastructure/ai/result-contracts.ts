import type { TaskType } from '../../application/ai/provider-adapter.js';
import { validateContract, validateKnowledge, validateLearning } from '../contracts/validate.js';

/** Business result contract per task type (inner layer of the envelope, 06A §5.C.5). */
export function validateAiResult(taskType: TaskType, value: unknown): boolean {
  if (taskType === 'reading.blind_solve') return validateKnowledge('blind_solve_result', value).ok;
  if (taskType === 'reading.verify') return validateKnowledge('verification_result', value).ok;
  if (taskType === 'content.author') return validateKnowledge('competency_framework_result', value).ok;
  if (taskType === 'content.review') return validateKnowledge('framework_review_result', value).ok;
  if (taskType === 'content.item_author') return validateKnowledge('wt2_item_set_result', value).ok;
  if (taskType === 'content.item_review') return validateKnowledge('item_review_result', value).ok;
  // Writing: the learning.v1 result (per-competency outcomes + diagnosis) or the P0 single-outcome result.
  if (typeof value === 'object' && value !== null && 'competencies' in value) return validateLearning('writing_assessment_result', value).ok;
  return validateContract('result', value);
}
