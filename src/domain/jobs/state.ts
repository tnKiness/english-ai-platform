export type JobState = 'QUEUED' | 'RUNNING' | 'VALIDATING' | 'COMPLETED' | 'WAITING_QUOTA' | 'NEEDS_REVIEW' | 'FAILED' | 'CANCELLED';
const transitions: Record<JobState, readonly JobState[]> = {
  QUEUED: ['RUNNING', 'WAITING_QUOTA', 'FAILED', 'CANCELLED'],
  RUNNING: ['VALIDATING', 'QUEUED', 'WAITING_QUOTA', 'NEEDS_REVIEW', 'FAILED', 'CANCELLED'],
  VALIDATING: ['COMPLETED', 'QUEUED', 'NEEDS_REVIEW', 'FAILED', 'CANCELLED'],
  WAITING_QUOTA: ['QUEUED', 'CANCELLED'],
  NEEDS_REVIEW: [], COMPLETED: [], FAILED: [], CANCELLED: [],
};
export function transitionJob(from: JobState, to: JobState): JobState {
  if (!transitions[from].includes(to)) throw new Error(`Invalid job transition: ${from} -> ${to}`);
  return to;
}
// P0 contract helper, not a replacement for a transactional compare-and-set in P1.
export function canCommit(state: JobState, generation: number, runGeneration: number, leaseExpiresAt: number, now: number) {
  return state === 'VALIDATING' && generation === runGeneration && leaseExpiresAt > now;
}
