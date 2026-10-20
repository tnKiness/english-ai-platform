import type { ExposureFact } from '../evidence/types.js';

export type Novelty = 'novel' | 'exposed' | 'needs_review';
export interface NoveltyCandidate { item_id: string; item_family_id: string; shared_stimulus_id: string | null; derived_from: string[] }

const REVEALING = new Set(['answer', 'explanation', 'sample_or_variant']);

/**
 * Novelty is a relation between task, exposure history and target (05 §6.B), not a static item flag.
 * Exposures from Builder and learner surfaces count alike (06 §4.1) — the builder is the only learner.
 * - The same item seen at any level is not new (04 §5.B.4: chưa từng làm hoặc xem đề/đáp án).
 * - A related item (family, shared stimulus, derived_from) with answer/explanation/sample revealed is not new.
 * - A related item seen only as prompt/hint depends on the measurement target; without an approved
 *   policy this returns needs_review instead of guessing.
 */
export function assessNovelty(candidate: NoveltyCandidate, exposures: readonly ExposureFact[]): { novelty: Novelty; reasons: string[] } {
  const reasons: string[] = [];
  let novelty: Novelty = 'novel';
  const related = new Set([candidate.item_id, ...candidate.derived_from]);
  for (const e of exposures) {
    if (e.item_id === candidate.item_id) { reasons.push(`SAME_ITEM_${e.level.toUpperCase()}`); novelty = 'exposed'; continue; }
    const relation = related.has(e.item_id) ? 'DERIVED' : e.item_family_id === candidate.item_family_id ? 'FAMILY'
      : candidate.shared_stimulus_id !== null && e.shared_stimulus_id === candidate.shared_stimulus_id ? 'STIMULUS' : null;
    if (!relation) continue;
    if (REVEALING.has(e.level)) { reasons.push(`${relation}_${e.level.toUpperCase()}`); novelty = 'exposed'; }
    else { reasons.push(`${relation}_${e.level.toUpperCase()}`); if (novelty === 'novel') novelty = 'needs_review'; }
  }
  return { novelty, reasons };
}
