// Loads the approved D-02 policy file (E-33). Validated on load, never trusted blindly: a missing, malformed or
// unapproved file means "no policy" and every caller falls back to "chưa đủ kết luận" (POLICY_NOT_APPROVED).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Ajv } from 'ajv';
import type { CompetencyPolicyParams, LoadedPolicy } from '../../domain/policy/params.js';
import { canonicalJson } from '../files/paths.js';

export const POLICY_FILE = 'policies/competency-policy.v1.json';

const num = (min: number, max = Number.MAX_SAFE_INTEGER) => ({ type: 'number', minimum: min, maximum: max });
const int = (min: number, max = 3650) => ({ type: 'integer', minimum: min, maximum: max });
const section = (props: Record<string, object>) => ({ type: 'object', additionalProperties: false, required: Object.keys(props), properties: props });

const schema = section({
  schema_version: { const: '1' },
  policy_id: { type: 'string', minLength: 1 },
  version: { type: 'string', pattern: '^v[0-9]+$' },
  approved: { const: true },
  approved_at: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
  decision: { type: 'string', minLength: 1 },
  source: { type: 'string', minLength: 1 },
  validation_status: { const: 'approved_not_empirically_validated' },
  competency: section({ repair_max_hint_level: int(0, 3), stable_min_step9_sources: int(1, 10), stable_min_gap_days: int(0), demote_after_consecutive_not_met: int(1, 10) }),
  confidence: section({ medium_min_sources: int(1, 20), medium_min_study_days: int(1, 20), medium_min_item_families: int(1, 20), high_min_sources: int(1, 20),
    high_min_item_families: int(1, 20), high_min_conditions: int(1, 20), high_recent_all_met: int(1, 20) }),
  schedule: section({ after_7a_days: int(0), retry_7b_days: int(0), step9_intervals_days: { type: 'array', minItems: 1, items: int(1) }, step9_reset_days: int(1),
    absent_composites_before_direct_check: int(1, 20), absent_wait_days_before_direct_check: int(1), recheck_overdue_factor: num(1, 100) }),
  priority: section({ dimension_max: int(1, 10), missing_ai_dimension: int(0, 10), weak_certainty_cap: int(0, 10), frequency_window_days: int(1), due_today_bonus: int(0, 100),
    overdue_bonus: int(0, 100), wait_days_per_point: int(1), wait_max_points: int(0, 100), starvation_skipped_sessions: int(1, 100), starvation_overdue_days: int(1),
    focus_default_max: int(1, 10), focus_complex_max: int(1, 10) }),
  hypothesis: section({ confirm_min_sources: int(1, 20), reject_min_sources: int(1, 20) }),
  replan: section({ lookahead_days: int(1, 60), min_overdue_days: int(0, 60), max_verification_per_day: int(1, 10), underfunded_window_days: int(1, 60),
    underfunded_ratio: num(0, 1), proposal_ttl_hours: int(1, 24 * 30), placement_horizon_days: int(1, 90) }),
});

const validate = new Ajv({ strict: true, allErrors: true }).compile(schema);

export function parsePolicy(value: unknown): LoadedPolicy {
  if (!validate(value)) throw new Error(`Competency policy is invalid: ${(validate.errors ?? []).map((e) => `${e.instancePath} ${e.message}`).join('; ')}`);
  const params = value as unknown as CompetencyPolicyParams;
  const ascending = params.schedule.step9_intervals_days.every((d, i, a) => i === 0 || d > a[i - 1]!);
  if (!ascending) throw new Error('Competency policy is invalid: step9_intervals_days must increase');
  const hash = createHash('sha256').update(canonicalJson(params)).digest('hex');
  return { params, ref: { id: params.policy_id, version: params.version, hash } };
}

/** null when the file does not exist (policy not approved yet); throws when it exists but is invalid. */
export function loadCompetencyPolicy(file = resolve(POLICY_FILE)): LoadedPolicy | null {
  if (!existsSync(file)) return null;
  return parsePolicy(JSON.parse(readFileSync(file, 'utf8')) as unknown);
}
