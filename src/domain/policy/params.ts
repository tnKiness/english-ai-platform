// D-02 v1 (E-33, user decision 18/11/2026): parameters of the competency, verification and dispatch policy.
// Values live in policies/competency-policy.v1.json; this file only names them. Approved, not empirically validated.

export interface CompetencyPolicyParams {
  schema_version: '1';
  policy_id: string;
  version: string;
  approved: true;
  approved_at: string;
  decision: string;
  source: string;
  validation_status: 'approved_not_empirically_validated';
  competency: {
    /** A3: a repair only counts when the learner had opened at most this hint level before submitting it. */
    repair_max_hint_level: number;
    stable_min_step9_sources: number;
    stable_min_gap_days: number;
    demote_after_consecutive_not_met: number;
  };
  confidence: {
    medium_min_sources: number;
    medium_min_study_days: number;
    medium_min_item_families: number;
    high_min_sources: number;
    high_min_item_families: number;
    high_min_conditions: number;
    high_recent_all_met: number;
  };
  schedule: {
    after_7a_days: number;
    retry_7b_days: number;
    step9_intervals_days: number[];
    step9_reset_days: number;
    absent_composites_before_direct_check: number;
    absent_wait_days_before_direct_check: number;
    recheck_overdue_factor: number;
  };
  priority: {
    dimension_max: number;
    missing_ai_dimension: number;
    weak_certainty_cap: number;
    frequency_window_days: number;
    due_today_bonus: number;
    overdue_bonus: number;
    wait_days_per_point: number;
    wait_max_points: number;
    starvation_skipped_sessions: number;
    starvation_overdue_days: number;
    focus_default_max: number;
    focus_complex_max: number;
  };
  hypothesis: { confirm_min_sources: number; reject_min_sources: number };
  replan: {
    lookahead_days: number;
    min_overdue_days: number;
    max_verification_per_day: number;
    underfunded_window_days: number;
    underfunded_ratio: number;
    proposal_ttl_hours: number;
    placement_horizon_days: number;
  };
}

/** Policy identity written next to every conclusion, schedule and proposal made with it. */
export interface PolicyRef { id: string; version: string; hash: string }
export interface LoadedPolicy { params: CompetencyPolicyParams; ref: PolicyRef }

export const DAY_MS = 86_400_000;
