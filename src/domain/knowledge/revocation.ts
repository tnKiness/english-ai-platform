import type { ObservationFacts, Revocation } from '../evidence/types.js';

export function isRevoked(kind: Revocation['target_kind'], id: string, version: string | null, revocations: readonly Revocation[]): boolean {
  return revocations.some((r) => r.target_kind === kind && r.target_id === id && (r.target_version === null || r.target_version === version));
}

/** Dependencies an observation traces back to (06 §5.B.5): submission, item+version, rubric+version, ai_run. */
export function revokedDependencies(o: ObservationFacts, revocations: readonly Revocation[], packageOfItem?: { id: string; version: string }): Revocation['target_kind'][] {
  const hit: Revocation['target_kind'][] = [];
  if (isRevoked('item', o.item.id, o.item.version, revocations)) hit.push('item');
  if (isRevoked('rubric', o.rubric.id, o.rubric.version, revocations)) hit.push('rubric');
  if (isRevoked('ai_run', o.ai_run_id, null, revocations)) hit.push('ai_run');
  if (isRevoked('submission', o.submission_id, null, revocations)) hit.push('submission');
  if (packageOfItem && isRevoked('package', packageOfItem.id, packageOfItem.version, revocations)) hit.push('package');
  return hit;
}

export interface Exclusion { observation_id: string; reason: 'SUPERSEDED' | 'REVOKED_DEPENDENCY'; detail: string[] }

/**
 * Observations that still count. History is never deleted: superseded and revoked rows stay stored but are
 * excluded here. Version pinning does not keep recognising content later found faulty (06 §5.B.5).
 */
export function effectiveObservations<T extends ObservationFacts>(observations: readonly T[], revocations: readonly Revocation[], packageOf?: (o: T) => { id: string; version: string } | undefined) {
  const superseded = new Set(observations.map((o) => o.supersedes_id).filter((id): id is string => id !== null));
  const effective: T[] = [];
  const excluded: Exclusion[] = [];
  for (const o of observations) {
    if (superseded.has(o.observation_id)) { excluded.push({ observation_id: o.observation_id, reason: 'SUPERSEDED', detail: [] }); continue; }
    const deps = revokedDependencies(o, revocations, packageOf?.(o));
    if (deps.length > 0) { excluded.push({ observation_id: o.observation_id, reason: 'REVOKED_DEPENDENCY', detail: deps }); continue; }
    effective.push(o);
  }
  return { effective, excluded };
}
