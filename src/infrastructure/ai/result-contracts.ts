import type { TaskType } from '../../application/ai/provider-adapter.js';
import { validateContract, validateKnowledge } from '../contracts/validate.js';

/** Business result contract per task type (inner layer of the envelope, 06A §5.C.5). */
export function validateAiResult(taskType: TaskType, value: unknown): boolean {
  if (taskType === 'reading.blind_solve') return validateKnowledge('blind_solve_result', value).ok;
  if (taskType === 'reading.verify') return validateKnowledge('verification_result', value).ok;
  return validateContract('result', value);
}
