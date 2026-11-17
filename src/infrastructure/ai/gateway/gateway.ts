// aiExecutionGateway (06A §4): Router + subscriptionGuard in front of every CLI adapter. It issues a one-run permit
// only when every D-01 check passes on live observations; otherwise it blocks and nothing is spawned.
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { AdapterResult, Context, Job, ProviderAdapter, ProviderError, TaskType } from '../../../application/ai/provider-adapter.js';
import { PROVIDER_BOUNDARY_METHODS, subscriptionGuard, type AccountState, type Capability, type CliProvider, type DataClass, type GuardDecision, type GuardInput, type ProviderEvidence } from '../../../application/ai/subscription-guard.js';
import { runBoundedProcess } from '../bounded-process.js';
import { agyArgvIssues, argvMatchesTemplate, buildModelArgv, claudeArgvIssues, CLI_DESCRIPTORS, CliProviderAdapter, codexToolDisableIssues, isVerifiedModelConfiguration, stripModelAndEffortFromArgv, type ExecutionPermit } from './cli-adapters.js';
import { buildChildEnv } from './env-allowlist.js';
import type { EnvelopeSpec } from './envelope.js';
import { verifyEntrypoint } from './entrypoint.js';
import { CODEX_SANDBOX_GROUP, createRunSandbox, grantSandboxGroupRead, ISOLATION_MECHANISMS, profileEnvFor, profileIsolationIssues, type SandboxGrant } from './isolation.js';
import { boundaryReportIssues, inspectCodexTools, liveConfigIssuesForProvider, runtimeCodexToolsAcceptable, verifyAgyDenySettings } from './probe-boundary.js';

export interface GatewayJob { billing_policy: string; required_capabilities: Capability[]; data_classes: DataClass[]; model?: string | null; effort?: string | null }
export type Observation = GuardInput['observed'];

export interface GatewayDeps {
  backupAllowed?(provider: CliProvider, permit: ExecutionPermit): { allowed: boolean; reasons: string[] };
  /** resetAt (E-24): giờ mở lại hãng báo, nếu đọc được; null thì nơi lưu dùng khoảng chờ mặc định. */
  runtimeFailure?(provider: CliProvider, error: 'QUOTA_EXHAUSTED' | 'RATE_LIMIT' | 'AUTH_EXPIRED', resetAt: string | null): void;
  /** E-22: user-selected default model (and effort where supported) for a provider. */
  modelPreference?(provider: CliProvider): { model: string; effort: string | null } | undefined;
  /** E-23 (3)/(4): danh sách model người dùng cho phép (giữ qua các phiên bản CLI, không cần verify lại từng model). */
  allowedModels?(provider: CliProvider): string[];
  /** E-23 (3): tra cứu kết quả canary của (provider, cli_version, model, effort). */
  modelCanary?(provider: CliProvider, cliVersion: string, model: string, effort: string | null): { passed: boolean; reason: string | null } | undefined;
  /** E-23 (3): ghi lại kết quả canary của (provider, cli_version, model, effort). */
  recordModelCanary?(input: { provider: CliProvider; cli_version: string; model: string; effort: string | null; passed: boolean; reason: string | null }): void;
  /** E-23 (2): tra cứu trạng thái chặn ranh giới runtime hiện hành của provider. */
  runtimeBlock?(provider: CliProvider): { reason: string; detail: string } | undefined;
  /** E-23 (2): ghi lại sự kiện chặn ranh giới runtime khi phát hiện tools/deny/features vi phạm trong lượt chạy. */
  recordRuntimeBlock?(provider: CliProvider, reason: string, detail: string): void;
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
const PROBE_CACHE_TTL_MS = 5 * 60_000;

export class AiExecutionGateway {
  private unavailable = new Map<CliProvider, ProviderError>();
  private runtimeBlocks = new Map<CliProvider, { reason: string; detail: string }>();
  private memoryCanaries = new Map<string, { passed: boolean; reason: string | null }>();
  private lastObserved = new Map<CliProvider, Observation>();
  private defaultObserver: (provider: CliProvider, evidence: ProviderEvidence | undefined, runnerDir: string | undefined) => Promise<Observation>;
  readonly adapters: Record<CliProvider, CliProviderAdapter>;
  constructor(private d: GatewayDeps) {
    this.adapters = {
      codex: d.adapters?.codex ?? new CliProviderAdapter(CLI_DESCRIPTORS.codex),
      'claude-code': d.adapters?.['claude-code'] ?? new CliProviderAdapter(CLI_DESCRIPTORS['claude-code']),
      agy: d.adapters?.agy ?? new CliProviderAdapter(CLI_DESCRIPTORS.agy),
    };
    this.defaultObserver = defaultObserve(this.d);
  }

  private adapterStatus(provider: CliProvider, envelope: EnvelopeSpec | undefined): GuardInput['adapter_status'] {
    if (this.adapters[provider].descriptor.status === 'DISABLED') return 'DISABLED';
    return envelope?.status === 'VERIFIED' ? 'VERIFIED' : 'NEEDS_VERIFICATION';
  }

  private canaryKey(provider: CliProvider, cliVersion: string, model: string, effort: string | null): string {
    return `${provider}\0${cliVersion}\0${model}\0${effort ?? ''}`;
  }

  private getCanary(provider: CliProvider, cliVersion: string, model: string, effort: string | null): { passed: boolean; reason: string | null } | undefined {
    return this.d.modelCanary?.(provider, cliVersion, model, effort) ?? this.memoryCanaries.get(this.canaryKey(provider, cliVersion, model, effort));
  }

  private setCanary(input: { provider: CliProvider; cli_version: string; model: string; effort: string | null; passed: boolean; reason: string | null }): void {
    this.memoryCanaries.set(this.canaryKey(input.provider, input.cli_version, input.model, input.effort), { passed: input.passed, reason: input.reason });
    this.d.recordModelCanary?.(input);
  }

  private recordRuntimeBlock(provider: CliProvider, reason: string, detail: string): void {
    this.runtimeBlocks.set(provider, { reason, detail });
    this.d.recordRuntimeBlock?.(provider, reason, detail);
  }

  async decide(provider: CliProvider, job: GatewayJob): Promise<{ decision: GuardDecision; permit?: ExecutionPermit }> {
    // Stored version-1 jobs can still name gemini-cli. Preserve their history and
    // fail closed rather than dereferencing an adapter that E-11 replaced.
    if (!Object.hasOwn(this.adapters, provider)) return { decision: { allowed: false, error: 'BILLING_UNVERIFIED', reasons: ['PROVIDER_NOT_ENABLED'] } };
    const recorded = this.d.evidence(provider);
    const account = this.d.account(provider);
    const status = this.adapterStatus(provider, recorded?.envelope);
    // Nothing is spawned for an adapter that is disabled or has no evidence at all.
    const observed = status === 'DISABLED' || !recorded ? NOTHING_OBSERVED : await (this.d.observe ?? this.defaultObserver)(provider, recorded.evidence, account?.runner_ref);
    this.lastObserved.set(provider, observed);
    const mechanism = ISOLATION_MECHANISMS[provider];
    // A candidate mechanism counts only when the recorded evidence was collected with that same mechanism.
    const mismatch = mechanism && recorded && recorded.evidence.isolation.mechanism !== mechanism.env ? ['EVIDENCE_MECHANISM_MISMATCH'] : [];
    // E-15 (2) / E-21: a Codex run must disable every model tool; Claude/agy runs must match their E-21 argv rules when claiming CLI-enforced boundaries.
    const tools = !recorded ? []
      : provider === 'codex' ? codexToolDisableIssues(recorded.evidence.argv)
      : provider === 'claude-code' && recorded.evidence.isolation.file_scope_test.method === 'cli_tools_disabled' ? claudeArgvIssues(recorded.evidence.argv)
      : provider === 'agy' && recorded.evidence.isolation.file_scope_test.method === 'cli_permission_deny' ? agyArgvIssues(recorded.evidence.argv)
      : [];
    const activeBlock = this.d.runtimeBlock?.(provider) ?? this.runtimeBlocks.get(provider);
    const isolation = [
      ...observed.isolation_issues,
      ...(activeBlock ? [activeBlock.reason] : []),
      ...tools,
      ...(mechanism ? mismatch : ['NO_RECORDED_MECHANISM']),
      ...(account ? profileIsolationIssues(account.runner_ref, { repo: this.d.roots.repo, data: this.d.roots.data, sandboxRoot: this.d.roots.sandboxRoot }) : []),
    ];
    const probeEnv = buildChildEnv(this.d.parentEnv, { tempDir: this.d.roots.sandboxRoot, homeDir: this.d.roots.sandboxRoot });
    const allowedModels = this.d.allowedModels ? this.d.allowedModels(provider) : (recorded?.evidence.models_allowed ?? []);
    const pref = this.d.modelPreference?.(provider);
    const model = job.model ?? pref?.model ?? allowedModels[0] ?? recorded?.evidence.models_allowed[0] ?? null;
    const effort = job.effort !== undefined ? job.effort : (pref ? pref.effort : (recorded ? stripModelAndEffortFromArgv(provider, recorded.evidence.argv).effort : null));
    const effectiveCliVersion = observed.cli_version ?? recorded?.evidence.cli_version ?? '';
    if (recorded && model) {
      const validEffort = provider === 'agy' ? effort === null : (effort === null || ['low', 'medium', 'high'].includes(effort));
      if (!allowedModels.includes(model) || !validEffort) {
        return { decision: { allowed: false, error: 'MODEL_NOT_VERIFIED', reasons: ['MODEL_NOT_VERIFIED'] } };
      }
      const canary = this.getCanary(provider, effectiveCliVersion, model, effort);
      if (canary && !canary.passed) {
        return {
          decision: {
            allowed: false,
            error: 'MODEL_NOT_VERIFIED',
            reasons: ['MODEL_NOT_VERIFIED', 'MODEL_CANARY_FAILED', ...(canary.reason ? [`MODEL_CANARY_FAILED:${canary.reason}`] : [])],
          },
        };
      }
    }
    const runtimeArgv = recorded && model ? buildModelArgv(provider, recorded.evidence.argv, model, effort) : recorded?.evidence.argv ?? [];
    const templateMismatch = recorded && model && !argvMatchesTemplate(provider, recorded.evidence.argv, runtimeArgv)
      ? ['ARGV_TEMPLATE_MISMATCH']
      : [];
    const runtimeTools = !recorded ? []
      : provider === 'codex' ? codexToolDisableIssues(runtimeArgv)
      : provider === 'claude-code' && recorded.evidence.isolation.file_scope_test.method === 'cli_tools_disabled' ? claudeArgvIssues(runtimeArgv)
      : provider === 'agy' && recorded.evidence.isolation.file_scope_test.method === 'cli_permission_deny' ? agyArgvIssues(runtimeArgv)
      : [];
    const allIsolation = [...isolation, ...templateMismatch, ...runtimeTools];
    const effectiveEvidence = recorded ? { ...recorded.evidence, models_allowed: allowedModels } : undefined;
    const decision = subscriptionGuard({
      provider, adapter_status: status, account, evidence: effectiveEvidence, observed: { ...observed, isolation_issues: [...new Set(allIsolation)] },
      env: { leaked_billing_names: probeEnv.leaked_billing_names }, extra_usage_confirmed_at: this.d.extraUsageConfirmedAt?.(provider) ?? null,
      job: { ...job, model }, consents: this.d.consents(provider), now: this.d.now(),
    });
    if (!decision.allowed || !recorded || !account || !mechanism || !model) return { decision };
    const limits = this.d.limits ?? { timeoutMs: 180_000, maxOutputBytes: 1_000_000 };
    const permit: ExecutionPermit = {
      provider, entrypoint: recorded.evidence.entrypoint.path, argv: runtimeArgv, envelope: recorded.envelope,
      profileEnv: profileEnvFor(provider, account.runner_ref), sandboxRoot: this.d.roots.sandboxRoot,
      timeoutMs: limits.timeoutMs, maxOutputBytes: limits.maxOutputBytes, model, effort, cli_version: effectiveCliVersion,
      onRuntimeBlock: (reason, detail) => this.recordRuntimeBlock(provider, reason, detail),
      ensureCanary: async () => {
        const existing = this.getCanary(provider, effectiveCliVersion, model, effort);
        if (existing?.passed) return { ok: true };
        if (existing && !existing.passed) return { ok: false, error: 'BILLING_UNVERIFIED', reason: 'MODEL_CANARY_FAILED' };
        const alreadyVerifiedAtSameVersion = effectiveCliVersion === recorded.evidence.cli_version && isVerifiedModelConfiguration(recorded.evidence, model, effort);
        if (alreadyVerifiedAtSameVersion) {
          this.setCanary({ provider, cli_version: effectiveCliVersion, model, effort, passed: true, reason: 'verified_in_d01' });
          return { ok: true };
        }
        return this.runModelCanary(permit);
      },
    };
    return { decision, permit };
  }

  /** E-23 (3): Chạy 1 prompt synthetic ngắn qua đúng đường adapter để kiểm envelope + hợp đồng đầu ra cho (provider, cli_version, model, effort) mới. */
  private async runModelCanary(permit: ExecutionPermit): Promise<{ ok: true } | { ok: false; error: ProviderError; reason: string }> {
    const canaryRunId = `canary-${permit.provider}-${this.d.now().getTime()}`;
    const canaryPermit: ExecutionPermit = { ...permit, skipCanary: true };
    const adapter = this.adapters[permit.provider];
    adapter.authorize(canaryRunId, canaryPermit);
    const canaryJob: Job = {
      job_id: 'canary-job',
      context_manifest_id: 'canary-manifest',
      billing_policy: 'subscription_only',
      required_capabilities: ['text', 'structured_result'],
      task_type: 'writing.assess',
    };
    const canaryContext: Context = { manifest_id: 'canary-manifest', payload: { synthetic: true, canary: true } };
    const raw = await adapter.execute(canaryRunId, canaryJob, canaryContext);
    if (typeof raw === 'object' && raw !== null && 'error' in raw) {
      const r = raw as { error: ProviderError; reason?: string };
      if (r.reason?.startsWith('RUNTIME_')) {
        return { ok: false, error: r.error, reason: r.reason };
      }
      this.setCanary({ provider: permit.provider, cli_version: permit.cli_version, model: permit.model, effort: permit.effort ?? null, passed: false, reason: r.reason ?? r.error });
      return { ok: false, error: 'BILLING_UNVERIFIED', reason: 'MODEL_CANARY_FAILED' };
    }
    const normalized = adapter.normalizeResult(raw, 'writing.assess');
    if (normalized.ok) {
      this.setCanary({ provider: permit.provider, cli_version: permit.cli_version, model: permit.model, effort: permit.effort ?? null, passed: true, reason: null });
      return { ok: true };
    }
    if (normalized.error === 'QUOTA_EXHAUSTED' || normalized.error === 'RATE_LIMIT' || normalized.error === 'AUTH_EXPIRED') {
      this.markFailure(permit.provider, normalized.error, normalized.reset_at ?? null);
      return { ok: false, error: normalized.error, reason: normalized.error };
    }
    this.setCanary({ provider: permit.provider, cli_version: permit.cli_version, model: permit.model, effort: permit.effort ?? null, passed: false, reason: normalized.error });
    return { ok: false, error: 'BILLING_UNVERIFIED', reason: 'MODEL_CANARY_FAILED' };
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

  markFailure(provider: CliProvider, error: 'QUOTA_EXHAUSTED' | 'RATE_LIMIT' | 'AUTH_EXPIRED', resetAt: string | null = null) {
    if (!this.d.runtimeFailure) this.unavailable.set(provider, error);
    this.d.runtimeFailure?.(provider, error, resetAt);
  }

  /** Console/worker banner: why each provider is (not) usable for a minimal synthetic text job. */
  async status() {
    const probe: GatewayJob = { billing_policy: 'subscription_only', required_capabilities: ['text', 'structured_result'], data_classes: ['synthetic_fixture'] };
    return Promise.all((Object.keys(this.adapters) as CliProvider[]).map(async (provider) => {
      const recorded = this.d.evidence(provider);
      const pref = this.d.modelPreference?.(provider);
      const modelsAllowed = this.d.allowedModels ? this.d.allowedModels(provider) : (recorded?.evidence.models_allowed ?? []);
      const selectedModel = pref?.model ?? modelsAllowed[0] ?? recorded?.evidence.models_allowed[0] ?? null;
      const selectedEffort = pref?.effort ?? (recorded ? stripModelAndEffortFromArgv(provider, recorded.evidence.argv).effort : null);
      const { decision } = await this.decide(provider, probe);
      const obs = this.lastObserved.get(provider) ?? NOTHING_OBSERVED;
      const verifiedVersion = recorded?.evidence.cli_version ?? null;
      const observedVersion = obs.cli_version;
      const verifiedSha = recorded?.evidence.entrypoint.sha256 ?? null;
      const observedSha = obs.entrypoint_sha256;
      const versionChanged = Boolean(verifiedVersion && observedVersion && verifiedVersion !== observedVersion);
      const shaChanged = Boolean(verifiedSha && observedSha && verifiedSha !== observedSha);
      const driftNotes: string[] = [];
      if (versionChanged) driftNotes.push(`INFO: CLI version changed since D-01 verification (${verifiedVersion} -> ${observedVersion})`);
      if (shaChanged) driftNotes.push(`INFO: entrypoint sha256 changed since D-01 verification (${verifiedSha!.slice(0, 12)}… -> ${observedSha!.slice(0, 12)}…)`);
      return {
        provider, adapter: this.adapters[provider].descriptor.status, ready: decision.allowed, error: decision.allowed ? null : decision.error,
        reasons: decision.allowed ? [] : decision.reasons, notes: [...this.adapters[provider].descriptor.notes, ...driftNotes],
        selected_model: selectedModel, selected_effort: selectedEffort, models_allowed: modelsAllowed,
        verified_cli_version: verifiedVersion, observed_cli_version: observedVersion,
        verified_entrypoint_sha256: verifiedSha, observed_entrypoint_sha256: observedSha,
        version_changed: versionChanged, entrypoint_hash_changed: shaChanged,
      };
    }));
  }
}

function defaultObserve(d: GatewayDeps) {
  const cache = new Map<string, { at: number; cli_version: string | null; auth_subscription: boolean | null; entitlement_verified: boolean | null; codex_features_ok: boolean }>();
  return async (provider: CliProvider, e: ProviderEvidence | undefined, runnerDir: string | undefined): Promise<Observation> => {
    if (!e) return NOTHING_OBSERVED;
    const entry = verifyEntrypoint(e.entrypoint.path, { forbiddenRoots: [d.roots.repo, d.roots.data], provider });
    if (!entry.ok) return { ...NOTHING_OBSERVED, entrypoint_sha256: entry.sha256, entrypoint_issues: entry.issues };
    // E-13 / E-21: each provider has a dedicated boundary collector and report format.
    const scope = e.isolation.file_scope_test;
    const expectedMethod = PROVIDER_BOUNDARY_METHODS[provider];
    const enforcement = scope.method !== expectedMethod || !scope.enforcement_evidence_ref?.trim() ? null
      : [...boundaryReportIssues(scope.enforcement_evidence_ref, { evidence: e, runnerDir, workspace: d.roots.sandboxRoot }),
        // E-15 (3) / E-21: config added to the profile or above the workspace after the probe invalidates config_inspection.
        ...(scope.config_cases?.length && runnerDir ? liveConfigIssuesForProvider(provider, runnerDir, d.roots.sandboxRoot) : [])];
    const isolationIssues: string[] = runnerDir ? [] : ['NO_RUNNER_DIR'];
    if (provider === 'agy' && runnerDir) {
      const agyCheck = verifyAgyDenySettings(runnerDir);
      if (!agyCheck.ok) isolationIssues.push('RUNTIME_DENY_RULES_CHANGED');
    }
    const modeStamp = runnerDir
      ? ['fake-mode.txt', 'fake-version.txt'].map((f) => { const p = join(runnerDir, f); return existsSync(p) ? readFileSync(p, 'utf8').trim() : ''; }).join('|')
      : '';
    const cacheKey = JSON.stringify([provider, entry.real_path, entry.sha256, runnerDir ?? '', e.cli_version, e.auth.probe_argv, e.auth.expect_pattern, e.entitlement.expect_pattern, e.argv, scope.enforcement_evidence_ref ?? '', modeStamp]);
    const nowMs = d.now().getTime();
    let cached = cache.get(cacheKey);
    if (!cached || nowMs - cached.at > PROBE_CACHE_TTL_MS) {
      const probeRaw = async (args: string[]) => {
        const sandbox = createRunSandbox(`probe-${provider}-${Date.now()}`, [], d.roots.sandboxRoot,
          provider === 'codex' ? { grant: d.sandboxGrant ?? grantSandboxGroupRead(CODEX_SANDBOX_GROUP) } : {});
        try {
          const env = buildChildEnv(d.parentEnv, sandbox, runnerDir ? profileEnvFor(provider, runnerDir) : {});
          // Some CLIs print status to stderr; both streams are matched against the recorded pattern, never stored.
          const out = await runBoundedProcess({ executable: entry.real_path!, args, cwd: sandbox.dir, input: '', env: env.env, timeoutMs: 30_000, maxOutputBytes: 64_000 });
          return { ok: true, stdout: out.stdout, stderr: out.stderr, code: out.code };
        } catch {
          return { ok: false, stdout: '', stderr: '', code: null };
        } finally { sandbox.dispose(); }
      };
      const probe = async (args: string[]) => {
        const r = await probeRaw(args);
        return r.ok ? `${r.stdout}\n${r.stderr}` : null;
      };
      const argvPrefix = /\.(?:m?js|cjs)$/i.test(e.argv[0] ?? '') ? [e.argv[0]!] : [];
      const versionArgs = argvPrefix.length && !/\.(?:m?js|cjs)$/i.test(e.auth.probe_argv[0] ?? '') ? ['--version'] : [...argvPrefix, '--version'];
      const version = await probe(versionArgs);
      const auth = await probe(e.auth.probe_argv);
      let codexFeaturesOk = true;
      const shouldCheckCodexFeatures = provider === 'codex' && (!/^node(?:\.exe)?$/i.test(basename(entry.real_path!)) || /fake-codex\.mjs$/i.test(e.argv[0] ?? ''));
      if (shouldCheckCodexFeatures) {
        const gatewayArgv = argvPrefix.length ? e.argv.slice(1) : e.argv;
        const tools = await inspectCodexTools(probeRaw, argvPrefix, gatewayArgv);
        codexFeaturesOk = runtimeCodexToolsAcceptable(tools, scope.enforcement_evidence_ref);
      }
      const firstLine = version === null ? null : (version.trim().split(/\r?\n/)[0]?.trim().slice(0, 80) ?? null);
      cached = {
        at: nowMs,
        cli_version: version?.includes(e.cli_version) ? e.cli_version : firstLine,
        auth_subscription: auth === null ? null : new RegExp(e.auth.expect_pattern).test(auth),
        entitlement_verified: auth === null ? null : new RegExp(e.entitlement.expect_pattern).test(auth),
        codex_features_ok: codexFeaturesOk,
      };
      cache.set(cacheKey, cached);
    }
    if (!cached.codex_features_ok) isolationIssues.push('RUNTIME_CODEX_FEATURES_CHANGED');
    return {
      cli_version: cached.cli_version,
      entrypoint_sha256: entry.sha256, entrypoint_issues: [],
      auth_subscription: cached.auth_subscription,
      entitlement_verified: cached.entitlement_verified,
      isolation_issues: isolationIssues, enforcement_issues: enforcement,
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
    if (!result.ok && (result.error === 'QUOTA_EXHAUSTED' || result.error === 'RATE_LIMIT' || result.error === 'AUTH_EXPIRED')) this.gateway.markFailure(r.provider, result.error, result.reset_at ?? null);
    return result;
  }
}
