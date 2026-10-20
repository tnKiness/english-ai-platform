import type { ExposureFact, Mode, Purpose, Revocation } from '../evidence/types.js';
import { assessNovelty } from '../knowledge/novelty.js';
import { isRevoked } from '../knowledge/revocation.js';

export interface TaskCandidate {
  task_id: string;
  item: { id: string; version: string; item_family_id: string; shared_stimulus_id: string | null; derived_from: string[] };
  package: { id: string; version: string; release_state: 'draft' | 'active' | 'suspended' | 'retired' };
  competency_ids: string[];
  purpose: Purpose;
  mode: Mode;
  estimated_minutes: number;
  /** Content metadata: the task is wide enough to reveal the target skill (02 §5.A, 01 Bước 7A). */
  meets_min_scope: boolean;
  quality_gate_passed: boolean;
  resources_available: boolean;
}
export interface SessionContext { competency_ids: string[]; available_minutes: number }

export type IneligibleReason = 'NOT_SESSION_SKILL' | 'EXCEEDS_TIME' | 'BELOW_MIN_SCOPE' | 'QUALITY_GATE_NOT_PASSED' | 'NOT_ACTIVE'
  | 'REVOKED' | 'RESOURCES_UNAVAILABLE' | 'GUIDED_MODE_FOR_VERIFICATION' | 'NOT_NOVEL' | 'NOVELTY_NEEDS_REVIEW';

const VERIFICATION: ReadonlySet<Purpose> = new Set(['7A', '7B', '9']);

/**
 * Stage 1 of the two-stage dispatcher (02 §5.A) and the 5 fallback conditions (04 §5.B): filter before any
 * ranking. Ranking weights and anti-starvation thresholds are not approved (D-02) and are not implemented.
 * Missing a qualifying task is a valid result — callers must keep "chờ kiểm chứng", not pick a mismatch.
 */
export function filterEligible(candidates: readonly TaskCandidate[], session: SessionContext, exposures: readonly ExposureFact[], revocations: readonly Revocation[]) {
  const eligible: TaskCandidate[] = [];
  const rejected: { task_id: string; reasons: IneligibleReason[] }[] = [];
  for (const c of candidates) {
    const reasons: IneligibleReason[] = [];
    if (!c.competency_ids.some((id) => session.competency_ids.includes(id))) reasons.push('NOT_SESSION_SKILL');
    if (c.estimated_minutes > session.available_minutes) reasons.push('EXCEEDS_TIME');
    if (!c.quality_gate_passed) reasons.push('QUALITY_GATE_NOT_PASSED');
    if (c.package.release_state !== 'active') reasons.push('NOT_ACTIVE');
    if (isRevoked('item', c.item.id, c.item.version, revocations) || isRevoked('package', c.package.id, c.package.version, revocations)) reasons.push('REVOKED');
    if (!c.resources_available) reasons.push('RESOURCES_UNAVAILABLE');
    if (VERIFICATION.has(c.purpose)) {
      if (!c.meets_min_scope) reasons.push('BELOW_MIN_SCOPE');
      if (c.mode === 'guided') reasons.push('GUIDED_MODE_FOR_VERIFICATION');
      const { novelty } = assessNovelty({ item_id: c.item.id, item_family_id: c.item.item_family_id, shared_stimulus_id: c.item.shared_stimulus_id, derived_from: c.item.derived_from }, exposures);
      if (novelty === 'exposed') reasons.push('NOT_NOVEL');
      if (novelty === 'needs_review') reasons.push('NOVELTY_NEEDS_REVIEW');
    }
    if (reasons.length === 0) eligible.push(c); else rejected.push({ task_id: c.task_id, reasons });
  }
  return { eligible, rejected };
}
