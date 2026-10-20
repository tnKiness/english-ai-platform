// Release lifecycle (P0_DATA_AND_STATE). Content fixes create a new version; a bad version is never re-activated.
export type ReleaseState = 'draft' | 'active' | 'suspended' | 'retired';
const transitions: Record<ReleaseState, readonly ReleaseState[]> = {
  draft: ['active'],
  active: ['suspended', 'retired'],
  suspended: ['retired'],
  retired: [],
};
export function transitionRelease(from: ReleaseState, to: ReleaseState): ReleaseState {
  if (!transitions[from].includes(to)) throw new Error(`Invalid release transition: ${from} -> ${to}`);
  return to;
}
