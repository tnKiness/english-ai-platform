import type { Novelty } from '../knowledge/novelty.js';
import type { AssistanceFact, Mode, ObservationFacts, Purpose } from './types.js';

/**
 * How one observation may be used for one competency (01 §1 three result levels, 02 §2.C.2, 02 §3 rules 3/5):
 * - independent_candidate: original work, no related support, not reduced load, non-guided, novel task.
 * - reduced_load: produced under reduced cognitive load — recorded under that condition only.
 * - scaffolded_repair: a Bước 5 self-repair — linked to the original source, never independent transfer.
 * - assisted: related support affected this competency — not usable to confirm independent use.
 * - needs_verification: support impact or novelty is unknown — kept, flagged for more checking.
 * - exposed_task: task or its revealing material was seen before — not independent evidence.
 * - inconclusive: outcome itself is inconclusive; stored, adds no direction.
 * - not_learner_evidence: dry-run data never reaches the learner profile (06 §4.3).
 */
export type EvidenceUse = 'independent_candidate' | 'reduced_load' | 'scaffolded_repair' | 'assisted' | 'needs_verification' | 'exposed_task' | 'inconclusive' | 'not_learner_evidence';

export interface AttributionInput {
  observation: ObservationFacts;
  submission: { kind: 'original' | 'repair'; created_at: string };
  attempt: { mode: Mode; purpose: Purpose };
  /** Assistance events of the same attempt; only those displayed before the submission can affect it. */
  assistance: readonly AssistanceFact[];
  novelty: Novelty;
}

export function classifyEvidence(input: AttributionInput): { use: EvidenceUse; reasons: string[] } {
  const { observation: o, submission, attempt } = input;
  if (o.scope !== 'learner') return { use: 'not_learner_evidence', reasons: ['DRY_RUN_SCOPE'] };
  if (o.outcome === 'inconclusive') return { use: 'inconclusive', reasons: ['OUTCOME_INCONCLUSIVE'] };
  if (submission.kind === 'repair') return { use: 'scaffolded_repair', reasons: ['REPAIR_SUBMISSION'] };

  const impacts = input.assistance
    .filter((a) => a.displayed_at < submission.created_at)
    .flatMap((a) => a.impacts.filter((i) => i.competency_id === o.competency_id));
  const affected = o.support_impact === 'affected' || impacts.some((i) => i.impact === 'affected');
  if (affected) return { use: 'assisted', reasons: ['SUPPORT_AFFECTED'] };
  if (impacts.some((i) => i.reduced_load)) return { use: 'reduced_load', reasons: ['REDUCED_LOAD'] };
  const unknownSupport = o.support_impact === 'unknown' || impacts.some((i) => i.impact === 'unknown');

  // Guided mode is normal learning (02 §3 rule 3) but not the "no hints" condition of 7A; keep, flag.
  if (attempt.mode === 'guided') return { use: 'needs_verification', reasons: ['GUIDED_MODE', ...(unknownSupport ? ['SUPPORT_UNKNOWN'] : [])] };
  if (input.novelty === 'exposed') return { use: 'exposed_task', reasons: ['TASK_EXPOSED'] };
  const reasons = [...(unknownSupport ? ['SUPPORT_UNKNOWN'] : []), ...(input.novelty === 'needs_review' ? ['NOVELTY_NEEDS_REVIEW'] : [])];
  if (reasons.length > 0) return { use: 'needs_verification', reasons };
  return { use: 'independent_candidate', reasons: [`ROLE_${attempt.purpose}`] };
}
