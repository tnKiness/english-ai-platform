import type { ExposureFact, Mode, Revocation } from '../evidence/types.js';
import { filterEligible, type SessionContext, type TaskCandidate } from './eligibility.js';

/** 04 §5.B: no arbitrary substitute after QC failure. Constraint metadata is mandatory here. */
export function selectFallback(candidates: readonly (TaskCandidate & { constraint: 'semantic' | 'explicit_form' })[],
  session: SessionContext & { mode: Mode; constraint: 'semantic' | 'explicit_form' }, exposures: readonly ExposureFact[], revocations: readonly Revocation[]) {
  const matched = candidates.filter((c) => c.mode === session.mode && c.constraint === session.constraint && c.meets_min_scope);
  const result = filterEligible(matched, session, exposures, revocations);
  return result.eligible.length ? { state: 'AVAILABLE' as const, task: result.eligible[0]! } : { state: 'WAITING_VERIFICATION' as const };
}
