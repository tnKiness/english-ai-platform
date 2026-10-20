import type { EvidenceUse } from './attribution.js';
import type { ObservationFacts, Outcome } from './types.js';

export interface ClassifiedObservation { observation: ObservationFacts; use: EvidenceUse }

export interface SourceSummary { evidence_source_id: string; uses: EvidenceUse[]; outcomes: Outcome[] }
export interface EvidenceSummary {
  competency_id: string;
  observation_count: number;
  /** Distinct evidence sources per use; many observations, retries or re-evaluations of one source count once. */
  sources_by_use: Partial<Record<EvidenceUse, number>>;
  independent_sources_met: number;
  independent_sources_not_met: number;
  sources: SourceSummary[];
}

/** Single source, multiple observations (02 §2.C.1): independence is counted per evidence source, never per row. */
export function summarizeEvidence(competencyId: string, items: readonly ClassifiedObservation[]): EvidenceSummary {
  const relevant = items.filter((i) => i.observation.competency_id === competencyId);
  const bySource = new Map<string, SourceSummary>();
  for (const { observation: o, use } of relevant) {
    const s = bySource.get(o.evidence_source_id) ?? { evidence_source_id: o.evidence_source_id, uses: [], outcomes: [] };
    if (!s.uses.includes(use)) s.uses.push(use);
    if (!s.outcomes.includes(o.outcome)) s.outcomes.push(o.outcome);
    bySource.set(o.evidence_source_id, s);
  }
  const sources = [...bySource.values()];
  const sources_by_use: Partial<Record<EvidenceUse, number>> = {};
  for (const s of sources) for (const u of s.uses) sources_by_use[u] = (sources_by_use[u] ?? 0) + 1;
  const independentWith = (outcome: Outcome) => sources.filter((s) => relevant.some((i) => i.use === 'independent_candidate'
    && i.observation.evidence_source_id === s.evidence_source_id && i.observation.outcome === outcome)).length;
  return { competency_id: competencyId, observation_count: relevant.length, sources_by_use, independent_sources_met: independentWith('met'), independent_sources_not_met: independentWith('not_met'), sources };
}

export type CompetencyState = 'insufficient_data' | 'needs_support' | 'repairs_with_hints' | 'initial_short_task' | 'integrated' | 'stable';
export type VerificationStatus = 'not_due' | 'due' | 'awaiting_opportunity' | 'recheck';

/** A pedagogical policy approved by the user (D-02). There is deliberately no built-in default. */
export interface ApprovedCompetencyPolicy {
  policy_id: string;
  version: string;
  approved: true;
  decide(summary: EvidenceSummary): { state: CompetencyState; rationale: string[] };
}

export type Conclusion =
  | { status: 'inconclusive'; reason: 'POLICY_NOT_APPROVED' | 'NO_EFFECTIVE_EVIDENCE'; summary: EvidenceSummary }
  | { status: 'decided'; state: CompetencyState; policy: { id: string; version: string }; rationale: string[]; summary: EvidenceSummary };

/**
 * Inference limit (01 §5.1, 02 §2.A.5): the engine never invents thresholds. Without an approved policy the
 * answer is "chưa đủ kết luận"; observation-level results are never promoted to competency state or Band here.
 */
export function concludeCompetency(summary: EvidenceSummary, policy: ApprovedCompetencyPolicy | null): Conclusion {
  if (summary.observation_count === 0) return { status: 'inconclusive', reason: 'NO_EFFECTIVE_EVIDENCE', summary };
  if (!policy || policy.approved !== true) return { status: 'inconclusive', reason: 'POLICY_NOT_APPROVED', summary };
  const decision = policy.decide(summary);
  return { status: 'decided', state: decision.state, policy: { id: policy.policy_id, version: policy.version }, rationale: decision.rationale, summary };
}

/** 02 §3 rule 2: being overdue changes only the verification status, never the competency state. */
export function markOverdue<T extends { state: CompetencyState; verification: VerificationStatus }>(profile: T): T {
  return { ...profile, verification: profile.verification === 'recheck' ? 'recheck' : 'due' };
}
