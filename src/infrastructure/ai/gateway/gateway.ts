// aiExecutionGateway (06A §4): Router + subscriptionGuard in front of every CLI adapter. It issues a one-run permit
// only when every D-01 check passes on live observations; otherwise it blocks and nothing is spawned.
import type { AdapterResult, Context, Job, ProviderAdapter, ProviderError, TaskType } from '../../../application/ai/provider-adapter.js';
import { subscriptionGuard, type AccountState, type Capability, type CliProvider, type DataClass, type GuardDecision, type GuardInput, type ProviderEvidence } from '../../../application/ai/subscription-guard.js';
import { runBoundedProcess } from '../bounded-process.js';
import { CLI_DESCRIPTORS, CliProviderAdapter, codexToolDisableIssues, type ExecutionPermit } from './cli-adapters.js';
import { buildChildEnv } from './env-allowlist.js';
import type { EnvelopeSpec } from './envelope.js';
import { verifyEntrypoint } from './entrypoint.js';
import { CODEX_SANDBOX_GROUP, createRunSandbox, grantSandboxGroupRead, ISOLATION_MECHANISMS, profileIsolationIssues, type SandboxGrant } from './isolation.js';
import { boundaryReportIssues, inspectCodexConfig } from './probe-boundary.js';

export interface GatewayJob { billing_policy: string; required_capabilities: Capability[]; data_classes: DataClass[] }
export type Observation = GuardInput['observed'];

export interface GatewayDeps {
  backupAllowed?(provider: CliProvider, permit: ExecutionPermit): { allowed: boolean; reasons: string[] };
  runtimeFailure?(provider: CliProvider, error: 'QUOTA_EXHAUSTED' | 'RATE_LIMIT' | 'AUTH_EXPIRED'): void;
  /** Test seam for the Codex sandbox-group grant on per-run dirs (default: icacls, E-17). */
  sandboxGrant?: SandboxGrant;
  adapters?: Partial<Record<CliProvider, CliProviderAdapter>>;
  evidence(provider: CliProvider): { evidence: ProviderEvidence; envelope: EnvelopeSpec } | undefined;
  account(provider: CliProvider): { profile_id: string; runner_ref: string; state: AccountState } | undefined;
  consents(provider: CliProvider): ReadonlySet<DataClass>;
  /** Latest user confirmation that extra usage is off, recorded after the evidence (E-11 (5)). */
  extraUsageConfirmedAt?(provider: CliProvider): string | undefined;
  parentEnv: NodeJS.ProcessEnv;
  roots: { repo: string; data: string; sandboxRoot: string };
  /** Live observation; the default runs only recorded, non-inference probes and only when evidence exists. */
  observe?: (provider: CliProvider, evidence: ProviderEvidence | undefined, runnerDir: string | undefined) => Promise<Observation>;
  now(): Date;
  limits?: { timeoutMs: number; maxOutputBytes: number };
}

const NOTHING_OBSERVED: Observation = { cli_version: null, entrypoint_sha256: null, entrypoint_issues: [], auth_subscription: null, entitlement_verified: null, isolation_issues: [], enforcement_issues: null };

export class AiExecutionGateway {
  private unavailable = new Map<CliProvider, ProviderError>();
  readonly adapters: Record<CliProvider, CliProviderAdapter>;
  constructor(private d: GatewayDeps) {
    this.adapters = {
      codex: d.adapters?.codex ?? new CliProviderAdapter(CLI_DESCRIPTORS.codex),
      'claude-code': d.adapters?.['claude-code'] ?? new CliProviderAdapter(CLI_DESCRIPTORS['claude-code']),
      agy: d.adapters?.agy ?? new CliProviderAdapter(CLI_DESCRIPTORS.agy),
    };
  }

  private adapterStatus(provider: CliProvider, envelope: EnvelopeSpec | undefined): GuardInput['adapter_status'] {
    if (this.adapters[provider].descriptor.status === 'DISABLED') return 'DISABLED';
    return envelope?.status === 'VERIFIED' ? 'VERIFIED' : 'NEEDS_VERIFICATION';
  }

  async decide(provider: CliProvider, job: GatewayJob): Promise<{ decision: GuardDecision; permit?: ExecutionPermit }> {
    // Stored version-1 jobs can still name gemini-cli. Preserve their history and
    // fail closed rather than dereferencing an adapter that E-11 replaced.
    if (!Object.hasOwn(this.adapters, provider)) return { decision: { allowed: false, error: 'BILLING_UNVERIFIED', reasons: ['PROVIDER_NOT_ENABLED'] } };
    const recorded = this.d.evidence(provider);
    const account = this.d.account(provider);
    const status = this.adapterStatus(provider, recorded?.envelope);
    // Nothing is spawned for an adapter that is disabled or has no evidence at all.
    const observed = status === 'DISABLED' || !recorded ? NOTHING_OBSERVED : await (this.d.observe ?? defaultObserve(this.d))(provider, recorded.evidence, account?.runner_ref);
    const mechanism = ISOLATION_MECHANISMS[provider];
    // A candidate mechanism counts only when the recorded evidence was collected with that same mechanism.
    const mismatch = mechanism && recorded && recorded.evidence.isolation.mechanism !== mechanism.env ? ['EVIDENCE_MECHANISM_MISMATCH'] : [];
    // E-15 (2): a Codex run must disable every model tool; the recorded argv is what the adapter executes.
    const tools = provider === 'codex' && recorded ? codexToolDisableIssues(recorded.evidence.argv) : [];
    const isolation = [...observed.isolation_issues, ...tools, ...(mechanism ? mismatch : ['NO_RECORDED_MECHANISM']),
      ...(account ? profileIsolationIssues(account.runner_ref, { repo: this.d.roots.repo, data: this.d.roots.data, sandboxRoot: this.d.roots.sandboxRoot }) : [])];
    const probeEnv = buildChildEnv(this.d.parentEnv, { tempDir: this.d.roots.sandboxRoot, homeDir: this.d.roots.sandboxRoot });
    const model = recorded?.evidence.models_allowed[0] ?? null;
    const decision = subscriptionGuard({
      provider, adapter_status: status, account, evidence: recorded?.evidence, observed: { ...observed, isolation_issues: [...new Set(isolation)] },
      env: { leaked_billing_names: probeEnv.leaked_billing_names }, extra_usage_confirmed_at: this.d.extraUsageConfirmedAt?.(provider) ?? null,
      job: { ...job, model }, consents: this.d.consents(provider), now: this.d.now(),
    });
    if (!decision.allowed || !recorded || !account || !mechanism || !model) return { decision };
    const limits = this.d.limits ?? { timeoutMs: 180_000, maxOutputBytes: 1_000_000 };
    return { decision, permit: { provider, entrypoint: recorded.evidence.entrypoint.path, argv: recorded.evidence.argv, envelope: recorded.envelope,
      profileEnv: { [mechanism.env]: account.runner_ref }, sandboxRoot: this.d.roots.sandboxRoot, timeoutMs: limits.timeoutMs, maxOutputBytes: limits.maxOutputBytes, model, cli_version: recorded.evidence.cli_version } };
  }

  /** First eligible provider whose guard passes, in the job's order. Failover never reaches a paid route. */
  async select(eligible: CliProvider[], job: GatewayJob): Promise<{ provider: CliProvider; permit: ExecutionPermit } | { blocked: { provider: CliProvider; error: string; reasons: string[] }[] }> {
    const blocked: { provider: CliProvider; error: string; reasons: string[] }[] = [];
    for (const provider of eligible) {
      const unavailable = this.unavailable.get(provider);
      const state = this.d.account(provider)?.state;
      const runtime = unavailable ?? (state === 'QUOTA_EXHAUSTED' || state === 'COOLDOWN' ? 'QUOTA_EXHAUSTED' : state === 'NEEDS_LOGIN' ? 'AUTH_EXPIRED' : undefined);
      if (runtime) { blocked.push({ provider, error: runtime, reasons: ['RUNTIME_UNAVAILABLE'] }); continue; }
      const { decision, permit } = await this.decide(provider, job);
      if (decision.allowed && permit) {
        if (provider !== eligible[0]) {
          const benchmark = this.d.backupAllowed?.(provider, permit) ?? { allowed: false, reasons: ['D05_SOURCED_BENCHMARK_REQUIRED'] };
          if (!benchmark.allowed) { blocked.push({ provider, error: 'BILLING_UNVERIFIED', reasons: benchmark.reasons }); continue; }
        }
        return { provider, permit };
      }
      if (!decision.allowed) blocked.push({ provider, error: decision.error, reasons: decision.reasons });
    }
    return { blocked };
  }

  markFailure(provider: CliProvider, error: 'QUOTA_EXHAUSTED' | 'RATE_LIMIT' | 'AUTH_EXPIRED') {
    if (!this.d.runtimeFailure) this.unavailable.set(provider, error);
    this.d.runtimeFailure?.(provider, error);
  }

  /** Console/worker banner: why each provider is (not) usable for a minimal synthetic text job. */
  async status() {
    const probe: GatewayJob = { billing_policy: 'subscription_only', required_capabilities: ['text', 'structured_result'], data_classes: ['synthetic_fixture'] };
    return Promise.all((Object.keys(this.adapters) as CliProvider[]).map(async (provider) => {
      const { decision } = await this.decide(provider, probe);
      return { provider, adapter: this.adapters[provider].descriptor.status, ready: decision.allowed, error: decision.allowed ? null : decision.error,
        reasons: decision.allowed ? [] : decision.reasons, notes: this.adapters[provider].descriptor.notes };
    }));
  }
}

function defaultObserve(d: GatewayDeps) {
  return async (provider: CliProvider, e: ProviderEvidence | undefined, runnerDir: string | undefined): Promise<Observation> => {
    if (!e) return NOTHING_OBSERVED;
    const entry = verifyEntrypoint(e.entrypoint.path, { forbiddenRoots: [d.roots.repo, d.roots.data] });
    if (!entry.ok) return { ...NOTHING_OBSERVED, entrypoint_sha256: entry.sha256, entrypoint_issues: entry.issues };
    // E-13: only Codex has a boundary collector; other providers claiming enforced_boundary stay unverified.
    const scope = e.isolation.file_scope_test;
    const enforcement = scope.method !== 'enforced_boundary' || !scope.enforcement_evidence_ref?.trim() ? null
      : provider !== 'codex' ? ['NO_COLLECTOR_FOR_PROVIDER']
        : [...boundaryReportIssues(scope.enforcement_evidence_ref, { evidence: e, runnerDir, workspace: d.roots.sandboxRoot }),
          // E-15 (3): config added to CODEX_HOME or above the workspace after the probe also invalidates config_inspection.
          ...(scope.config_cases?.length && runnerDir ? inspectCodexConfig(runnerDir, d.roots.sandboxRoot).findings.map((f) => `CONFIG_${f}`) : [])];
    const mechanism = ISOLATION_MECHANISMS[provider];
    const probe = async (args: string[]) => {
      const sandbox = createRunSandbox(`probe-${provider}-${Date.now()}`, [], d.roots.sandboxRoot,
        provider === 'codex' ? { grant: d.sandboxGrant ?? grantSandboxGroupRead(CODEX_SANDBOX_GROUP) } : {});
      try {
        const env = buildChildEnv(d.parentEnv, sandbox, mechanism && runnerDir ? { [mechanism.env]: runnerDir } : {});
        // Some CLIs print status to stderr; both streams are matched against the recorded pattern, never stored.
        const out = await runBoundedProcess({ executable: entry.real_path!, args, cwd: sandbox.dir, input: '', env: env.env, timeoutMs: 30_000, maxOutputBytes: 64_000 });
        return `${out.stdout}\n${out.stderr}`;
      } catch { return null; } finally { sandbox.dispose(); }
    };
    const version = await probe(['--version']);
    const auth = await probe(e.auth.probe_argv);
    return {
      cli_version: version?.includes(e.cli_version) ? e.cli_version : version === null ? null : version.trim().slice(0, 80),
      entrypoint_sha256: entry.sha256, entrypoint_issues: [],
      auth_subscription: auth === null ? null : new RegExp(e.auth.expect_pattern).test(auth),
      entitlement_verified: auth === null ? null : new RegExp(e.entitlement.expect_pattern).test(auth),
      isolation_issues: runnerDir ? [] : ['NO_RUNNER_DIR'], enforcement_issues: enforcement,
    };
  };
}

/**
 * Worker-facing adapter: asks the gateway per run, authorizes exactly that run, and maps a blocked decision to a
 * stopping provider error (BILLING_UNVERIFIED/AUTH_EXPIRED/CAPABILITY_MISSING) so the queue never retries it.
 */
export class GatewayAdapter implements ProviderAdapter {
  private chosen = new Map<string, CliProvider>();
  private permits = new Map<string, ExecutionPermit>();
  constructor(private gateway: AiExecutionGateway, private facts: (job: Job) => { eligible: CliProvider[]; job: GatewayJob }) {}
  async inspectAuth() { return { authenticated: false, synthetic: false }; }
  async inspectEntitlement() { return { verified: false, billing: 'unverified' as const, synthetic: false }; }
  async readQuotaIfSupported() { return { remaining: null, observed_at: new Date().toISOString(), source: 'gateway:not-observed' }; }
  chosenProvider(runId: string) {
    const p = this.permits.get(runId);
    return p && { provider: p.provider, cli_version: p.cli_version, model: p.model };
  }
  async canFailover(job: Job) {
    const f = this.facts(job);
    return !('blocked' in await this.gateway.select(f.eligible, f.job));
  }
  async cancel(runId: string) { const p = this.chosen.get(runId); if (p) await this.gateway.adapters[p].cancel(runId); }
  async execute(runId: string, job: Job, context: Context): Promise<unknown> {
    const f = this.facts(job);
    const selected = await this.gateway.select(f.eligible, f.job);
    if ('blocked' in selected) {
      const first = selected.blocked[0];
      const error: ProviderError = selected.blocked.some((b) => b.error === 'QUOTA_EXHAUSTED' || b.error === 'RATE_LIMIT') ? 'QUOTA_EXHAUSTED'
        : first?.error === 'AUTH_EXPIRED' || first?.error === 'CAPABILITY_MISSING' ? first.error : 'BILLING_UNVERIFIED';
      return { error, blocked: selected.blocked.map((b) => `${b.provider}:${b.error}`) };
    }
    this.chosen.set(runId, selected.provider);
    this.permits.set(runId, selected.permit);
    this.gateway.adapters[selected.provider].authorize(runId, selected.permit);
    return { provider: selected.provider, raw: await this.gateway.adapters[selected.provider].execute(runId, job, context) };
  }
  normalizeResult(raw: unknown, taskType?: TaskType): AdapterResult {
    if (typeof raw === 'object' && raw !== null && 'error' in raw) return { ok: false, error: (raw as { error: ProviderError }).error };
    const r = raw as { provider?: CliProvider; raw?: unknown };
    if (!r?.provider) return { ok: false, error: 'BILLING_UNVERIFIED' };
    const result = this.gateway.adapters[r.provider].normalizeResult(r.raw, taskType);
    if (!result.ok && (result.error === 'QUOTA_EXHAUSTED' || result.error === 'RATE_LIMIT' || result.error === 'AUTH_EXPIRED')) this.gateway.markFailure(r.provider, result.error);
    return result;
  }
}
