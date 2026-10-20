// subscriptionGuard (06A §8) + D-01 evidence gate. Pure: every input is an observation made before the call.
// Missing or unclear evidence never means "probably fine": it blocks, and no trial paid call is made to find out.
/** E-11 (4): Antigravity `agy` replaces gemini-cli on the Google side; old 'gemini-cli' rows stay readable in SQLite. */
export type CliProvider = 'codex' | 'claude-code' | 'agy';
export const CLI_PROVIDERS: readonly CliProvider[] = ['codex', 'claude-code', 'agy'];
export type Capability = 'text' | 'structured_result' | 'direct_audio';
export type DataClass = 'synthetic_fixture' | 'knowledge_content' | 'answer_key' | 'learner_submission' | 'learner_audio' | 'learner_profile';
export const DATA_CLASSES: readonly DataClass[] = ['synthetic_fixture', 'knowledge_content', 'answer_key', 'learner_submission', 'learner_audio', 'learner_profile'];
/** E-11 (2), user decision: what a D-01-verified provider may be granted. Still recorded per provider (ai_data_consents). */
export const USER_APPROVED_DATA_CLASSES: readonly DataClass[] = ['synthetic_fixture', 'knowledge_content', 'answer_key', 'learner_submission', 'learner_profile'];
/** E-11 (2): never sent to any provider, whatever the consent table says. */
export const NEVER_SENT_DATA_CLASSES: readonly DataClass[] = ['learner_audio'];
/** E-11 (5): "extra usage / auto-recharge is off" must be re-confirmed by the user at least this often. */
export const EXTRA_USAGE_RECONFIRM_MS = 30 * 24 * 60 * 60 * 1000;
export type AccountState = 'NEEDS_LOGIN' | 'NEEDS_VERIFICATION' | 'READY' | 'BUSY' | 'COOLDOWN' | 'QUOTA_EXHAUSTED' | 'DISABLED';

/** Evidence the user collects to close D-01 for one provider/profile/CLI build (P2_ACCEPTANCE). No secrets. */
export interface ProviderEvidence {
  provider: CliProvider;
  profile_id: string;
  cli_version: string;
  entrypoint: { path: string; sha256: string; kind: 'native_executable' };
  argv: string[];
  /** probe_argv: a non-inference status command observed to report the login method; expect_*: regexes on its output. */
  auth: { mode: 'subscription_login'; observed: string; checked_at: string; probe_argv: string[]; expect_pattern: string };
  entitlement: { plan: string; applies_to_cli: boolean; source: string; checked_at: string; expect_pattern: string };
  /** next_confirmation_due is informational; the guard enforces EXTRA_USAGE_RECONFIRM_MS from the latest confirmation. */
  extra_usage: { disabled_confirmed: boolean; confirmed_at: string; next_confirmation_due: string };
  models_allowed: string[];
  isolation: {
    mechanism: string;
    file_scope_test: {
      passed: boolean; cases: string[]; run_at: string;
      /** Missing in legacy reports. Model replies cannot establish an enforced read boundary. */
      method?: 'model_reply' | 'enforced_boundary';
      /** Reference to independently reviewed enforcement evidence, not model output. */
      enforcement_evidence_ref?: string;
    };
    plugins_disabled: boolean;
  };
  process_control: { timeout_cancel_test_passed: boolean; run_at: string };
  output_contract: { envelope_verified: boolean; test_passed: boolean; run_at: string };
  capabilities: Capability[];
}

export interface GuardInput {
  provider: CliProvider;
  adapter_status: 'DISABLED' | 'NEEDS_VERIFICATION' | 'VERIFIED';
  account: { state: AccountState } | undefined;
  evidence: ProviderEvidence | undefined;
  /** Live observations right before execution (not copied from evidence). */
  observed: { cli_version: string | null; entrypoint_sha256: string | null; entrypoint_issues: string[]; auth_subscription: boolean | null; entitlement_verified: boolean | null; isolation_issues: string[] };
  env: { leaked_billing_names: string[] };
  /** Latest "extra usage is off" confirmation recorded after the evidence (extra_usage_confirmations), if any. */
  extra_usage_confirmed_at?: string | null;
  job: { billing_policy: string; required_capabilities: Capability[]; data_classes: DataClass[]; model: string | null };
  consents: ReadonlySet<DataClass>;
  now: Date;
}

export type GuardError = 'BILLING_UNVERIFIED' | 'AUTH_EXPIRED' | 'CAPABILITY_MISSING' | 'DATA_RECIPIENT_NOT_ALLOWED';
export type GuardDecision = { allowed: true } | { allowed: false; error: GuardError; reasons: string[] };

/** Files a run may not be denied for: case names the file-scope test must cover (QUALITY_AND_DATA case 3, 06A ca 11). */
export const FILE_SCOPE_CASES = ['absolute_path', 'dotdot', 'symlink_junction', 'inherited_config', 'plugins_hooks'] as const;
/** Flags that bypass the CLI's own safety controls are never acceptable (AGENTS.md, 06A §5.C.4). */
const BYPASS = /(dangerously|skip-permissions|bypass|--yolo|full-auto|no-sandbox|--bare\b)/i;

export function subscriptionGuard(g: GuardInput): GuardDecision {
  const billing: string[] = [];
  const auth: string[] = [];
  const capability: string[] = [];
  const consent: string[] = [];
  if (g.job.billing_policy !== 'subscription_only') billing.push('JOB_NOT_SUBSCRIPTION_ONLY');
  if (g.adapter_status !== 'VERIFIED') billing.push(`ADAPTER_${g.adapter_status}`);
  // Chốt 1: allowlisted env, no billing variables survived.
  if (g.env.leaked_billing_names.length > 0) billing.push(`BILLING_ENV_PRESENT:${g.env.leaked_billing_names.join(',')}`);
  const e = g.evidence;
  if (!e) billing.push('NO_D01_EVIDENCE');
  else {
    if (e.provider !== g.provider) billing.push('EVIDENCE_FOR_OTHER_PROVIDER');
    if (e.entrypoint.kind !== 'native_executable') billing.push('ENTRYPOINT_NOT_NATIVE');
    if (g.observed.entrypoint_issues.length > 0) billing.push(...g.observed.entrypoint_issues.map((i) => `ENTRYPOINT_${i}`));
    if (g.observed.entrypoint_sha256 !== e.entrypoint.sha256) billing.push('ENTRYPOINT_CHANGED_SINCE_VERIFICATION');
    if (g.observed.cli_version === null || g.observed.cli_version !== e.cli_version) billing.push('CLI_VERSION_CHANGED_SINCE_VERIFICATION');
    if (e.argv.some((a) => BYPASS.test(a))) billing.push('ARGV_HAS_BYPASS_FLAG');
    // Chốt 2: live auth/entitlement inspection, not only env stripping.
    if (e.auth.mode !== 'subscription_login') billing.push('AUTH_MODE_NOT_SUBSCRIPTION');
    if (g.observed.auth_subscription === false) auth.push('AUTH_NOT_SUBSCRIPTION_NOW');
    if (g.observed.auth_subscription === null) billing.push('AUTH_NOT_OBSERVED');
    if (!e.entitlement.applies_to_cli || g.observed.entitlement_verified !== true) billing.push('ENTITLEMENT_UNVERIFIED');
    // Chốt 3: only models inside the verified entitlement.
    if (g.job.model === null || !e.models_allowed.includes(g.job.model)) billing.push('MODEL_NOT_IN_VERIFIED_ENTITLEMENT');
    // Chốt 4: extra usage / auto-recharge confirmed off, and the latest confirmation is at most 30 days old (E-11).
    const latest = latestExtraUsageConfirmation(e, g.extra_usage_confirmed_at ?? null, g.now);
    if (latest === null) billing.push('EXTRA_USAGE_NOT_CONFIRMED_OFF');
    else if (g.now.getTime() - latest > EXTRA_USAGE_RECONFIRM_MS) billing.push('EXTRA_USAGE_CONFIRMATION_OVERDUE');
    // Chốt 5: plugins/extensions that could call paid services are off.
    if (!e.isolation.plugins_disabled) billing.push('PLUGINS_NOT_DISABLED');
    // D-01 isolation, process control and output contract.
    const missingCases = FILE_SCOPE_CASES.filter((c) => !e.isolation.file_scope_test.cases.includes(c));
    if (!e.isolation.file_scope_test.passed || missingCases.length > 0) billing.push(`FILE_SCOPE_TEST_INCOMPLETE${missingCases.length ? `:${missingCases.join(',')}` : ''}`);
    if (e.isolation.file_scope_test.method !== 'enforced_boundary' ||
      typeof e.isolation.file_scope_test.enforcement_evidence_ref !== 'string' ||
      !e.isolation.file_scope_test.enforcement_evidence_ref.trim()) billing.push('READ_BOUNDARY_UNVERIFIED');
    if (!e.process_control.timeout_cancel_test_passed) billing.push('TIMEOUT_CANCEL_UNVERIFIED');
    if (!e.output_contract.envelope_verified || !e.output_contract.test_passed) billing.push('OUTPUT_CONTRACT_UNVERIFIED');
    for (const c of g.job.required_capabilities) if (!e.capabilities.includes(c)) capability.push(`CAPABILITY_${c}`);
  }
  // Layout/mechanism problems are reported even before evidence exists, so the user sees every missing basis.
  if (g.observed.isolation_issues.length > 0) billing.push(...g.observed.isolation_issues.map((i) => `ISOLATION_${i}`));
  if (!g.account) billing.push('NO_ACCOUNT_PROFILE');
  else if (g.account.state === 'NEEDS_LOGIN') auth.push('PROFILE_NEEDS_LOGIN');
  else if (g.account.state !== 'READY') billing.push(`PROFILE_${g.account.state}`);
  // Which provider may receive which data (06A §1.4): default deny; some classes are never sent (E-11).
  for (const d of g.job.data_classes) {
    if (NEVER_SENT_DATA_CLASSES.includes(d)) consent.push(`DATA_CLASS_NEVER_SENT_${d}`);
    else if (!g.consents.has(d)) consent.push(`NO_CONSENT_${d}`);
  }
  // Chốt 6: any billing doubt stops immediately; it outranks every other reason.
  if (billing.length) return { allowed: false, error: 'BILLING_UNVERIFIED', reasons: [...billing, ...auth, ...capability, ...consent] };
  if (auth.length) return { allowed: false, error: 'AUTH_EXPIRED', reasons: [...auth, ...capability, ...consent] };
  if (capability.length) return { allowed: false, error: 'CAPABILITY_MISSING', reasons: [...capability, ...consent] };
  if (consent.length) return { allowed: false, error: 'DATA_RECIPIENT_NOT_ALLOWED', reasons: consent };
  return { allowed: true };
}

/** Epoch ms of the latest valid confirmation (evidence or later record); future or unparsable timestamps do not count. */
export function latestExtraUsageConfirmation(e: Pick<ProviderEvidence, 'extra_usage'>, recorded: string | null, now: Date): number | null {
  const times = [e.extra_usage.disabled_confirmed ? e.extra_usage.confirmed_at : null, recorded]
    .map((t) => (t ? Date.parse(t) : NaN)).filter((t) => Number.isFinite(t) && t <= now.getTime());
  return times.length ? Math.max(...times) : null;
}

/** Data classes a context sends, derived from role, scope and content origin — never from what the AI says. */
export function dataClassesFor(m: { role: string; scope: 'learner' | 'dry_run'; content_origin: 'synthetic_fixture' | 'sourced' | null }): DataClass[] {
  const content: DataClass = m.content_origin === 'synthetic_fixture' ? 'synthetic_fixture' : 'knowledge_content';
  const classes = new Set<DataClass>([content]);
  if (m.role === 'verifier') classes.add(m.content_origin === 'synthetic_fixture' ? 'synthetic_fixture' : 'answer_key');
  if (m.scope === 'learner') classes.add('learner_submission');
  return [...classes];
}
