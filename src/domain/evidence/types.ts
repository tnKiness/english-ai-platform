// Pure evidence vocabulary shared by the Rule Engine (02 §2–3, 04 §2.C). No I/O.
export type Scope = 'learner' | 'dry_run';
export type Outcome = 'met' | 'not_met' | 'inconclusive';
export type Processing = 'processed' | 'missing_data' | 'technical_error';
export type MeasurementQuality = 'sufficient' | 'insufficient' | 'unknown';
export type Opportunity = 'observed' | 'absent' | 'unknown';
export type SupportImpact = 'affected' | 'no_related_effect_detected' | 'unknown';
export type Mode = 'guided' | 'self_practice' | 'exam';
export type Purpose = 'lesson' | 'practice' | '7A' | '7B' | '9';
export type ExposureLevel = 'prompt' | 'hint' | 'answer' | 'explanation' | 'sample_or_variant';

export interface VersionRef { id: string; version: string; hash: string }

export interface ObservationFacts {
  observation_id: string;
  evidence_source_id: string;
  submission_id: string;
  competency_id: string;
  item: VersionRef;
  rubric: VersionRef;
  ai_run_id: string;
  supersedes_id: string | null;
  processing: Processing;
  outcome: Outcome;
  measurement_quality: MeasurementQuality;
  opportunity: Opportunity;
  support_impact: SupportImpact;
  scope: Scope;
}

export interface AssistanceFact {
  displayed_at: string;
  impacts: { competency_id: string; impact: SupportImpact; reduced_load: boolean }[];
}

export interface ExposureFact {
  item_id: string;
  item_family_id: string;
  shared_stimulus_id: string | null;
  level: ExposureLevel;
}

export interface Revocation { target_kind: 'item' | 'rubric' | 'package' | 'knowledge' | 'media' | 'ai_run' | 'submission'; target_id: string; target_version: string | null }
