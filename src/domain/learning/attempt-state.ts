// Attempt lifecycle from P0_DATA_AND_STATE. 7A/7B/9 are new attempts, never a continuation of a repair.
export type AttemptState = 'DRAFT' | 'SUBMITTED' | 'REPAIRING' | 'AWAITING_VERIFICATION' | 'CLOSED';
const transitions: Record<AttemptState, readonly AttemptState[]> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['REPAIRING', 'AWAITING_VERIFICATION', 'CLOSED'],
  REPAIRING: ['AWAITING_VERIFICATION', 'CLOSED'],
  AWAITING_VERIFICATION: ['CLOSED'],
  CLOSED: [],
};
export function canTransitionAttempt(from: AttemptState, to: AttemptState): boolean {
  return transitions[from].includes(to);
}
export function transitionAttempt(from: AttemptState, to: AttemptState): AttemptState {
  if (!canTransitionAttempt(from, to)) throw new Error(`Invalid attempt transition: ${from} -> ${to}`);
  return to;
}
