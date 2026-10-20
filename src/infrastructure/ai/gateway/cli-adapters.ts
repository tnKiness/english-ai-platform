// Provider adapters for the three subscription CLIs (06A §3.A). P2 state: none verified. An adapter never spawns
// its CLI unless the gateway handed it a permit for that run after subscriptionGuard passed; without one,
// execute() returns BILLING_UNVERIFIED immediately. Candidate argv/envelopes below are NOT verified facts.
import type { AdapterResult, Context, Job, ProviderAdapter, ProviderError, TaskType } from '../../../application/ai/provider-adapter.js';
import type { CliProvider } from '../../../application/ai/subscription-guard.js';
import { runBoundedProcess, type ProcessRequest } from '../bounded-process.js';
import { buildChildEnv } from './env-allowlist.js';
import { parseEnvelope, type EnvelopeSpec } from './envelope.js';
import { buildTaskInput } from '../task-instructions.js';
import { CODEX_SANDBOX_GROUP, createRunSandbox, grantSandboxGroupRead, type SandboxGrant } from './isolation.js';

export interface CliDescriptor {
  provider: CliProvider;
  status: 'DISABLED' | 'NEEDS_VERIFICATION';
  /** What 06A names; argv and envelope must be replaced by the recorded, observed values before use. */
  candidate_command: string;
  candidate_argv: string[];
  candidate_envelope: EnvelopeSpec;
  notes: string[];
}

const unverified = (source: string, format: EnvelopeSpec['format'], result: string[], flag: string[] | null): EnvelopeSpec =>
  ({ status: 'NEEDS_VERIFICATION', source, format, result_path: result, error_flag_path: flag, error_patterns: [] });

/**
 * Codex candidate argv used by `npm run ai -- verify codex` (flags from the relay's codex exec call plus --json;
 * --skip-git-repo-check only lets exec start in the non-git sandbox — it is not a permission bypass). Unverified.
 * E-14: windows.sandbox="elevated" — probe-boundary 20/10/2026 showed the default sandbox runs model commands under the
 * user's own token (no ACL can separate it); elevated runs them as CodexSandboxOffline, which ACLs can restrict.
 * E-15 (2): every model tool that can read, write or reach the network is disabled; data goes through stdin.
 */
/**
 * E-15 (2): names taken from `codex features list` of codex-cli 0.163.0-alpha.10.2 (20/10/2026); each was checked with
 * `codex --disable <name> features list` (unknown names exit 1). Only features that are not "removed" are listed.
 * `unified_exec` stays enabled under --disable on this build: the probe reports it as NOT_EFFECTIVE and keeps blocking.
 */
export const CODEX_DISABLED_FEATURES = [
  'shell_tool', 'unified_exec', 'unified_exec_tty', 'shell_snapshot', 'code_mode_host',
  'browser_use', 'browser_use_external', 'browser_use_full_cdp_access', 'browser_annotation_api', 'computer_use', 'in_app_browser', 'in_app_local_automation',
  'apps', 'plugins', 'remote_plugin', 'plugin_sharing', 'hooks', 'skill_mcp_dependency_install', 'skill_search', 'tool_suggest', 'tool_call_mcp_elicitation',
  'multi_agent', 'image_generation', 'view_image', 'workspace_dependencies', 'worktrees', 'memories', 'standalone_web_search',
] as const;

export const CODEX_CANDIDATE_ARGV = ['exec', '--json', '--sandbox', 'read-only', '-c', 'windows.sandbox="elevated"',
  ...CODEX_DISABLED_FEATURES.flatMap((f) => ['--disable', f]), '--skip-git-repo-check', '--color', 'never', '-'];

/**
 * E-15 (2): problems with the tool-disable part of a recorded Codex argv. Every required feature needs its own
 * `--disable`; anything that re-enables a feature (--enable, -c features.*=true) is refused.
 */
export function codexToolDisableIssues(argv: string[]): string[] {
  const disabled = new Set<string>();
  const issues: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--disable') disabled.add(argv[++i] ?? '');
    else if (argv[i] === '--enable') issues.push(`FEATURE_ENABLED:${argv[++i] ?? ''}`);
    else if ((argv[i] === '-c' || argv[i] === '--config') && /^features\./.test(argv[i + 1] ?? '')) issues.push(`FEATURE_CONFIG_OVERRIDE:${argv[++i]}`);
  }
  const missing = CODEX_DISABLED_FEATURES.filter((f) => !disabled.has(f));
  if (missing.length) issues.push(`TOOLS_NOT_DISABLED:${missing.join(',')}`);
  return issues;
}

export const CLI_DESCRIPTORS: Record<CliProvider, CliDescriptor> = {
  'claude-code': {
    provider: 'claude-code', status: 'NEEDS_VERIFICATION', candidate_command: 'claude -p', candidate_argv: ['-p', '--output-format', 'json'],
    candidate_envelope: unverified('06A §3.A, §5.C.5 (--output-format json); field names not observed on this machine', 'json_object', ['result'], ['is_error']),
    notes: ['Native claude.exe behind the npm shim (relay inventory 19/10/2026).', 'Never --bare (skips subscription login, 06A §3.A).', 'Isolation candidate: CLAUDE_CONFIG_DIR [S3], unverified.'],
  },
  codex: {
    provider: 'codex', status: 'NEEDS_VERIFICATION', candidate_command: 'codex exec', candidate_argv: CODEX_CANDIDATE_ARGV,
    candidate_envelope: { ...unverified('06A §3.A (codex exec --json); JSONL layout not observed — record it with `npm run ai -- verify codex`', 'jsonl_last_object', ['item', 'text'], null),
      line_select: { path: ['item', 'type'], equals: 'agent_message' } },
    notes: ['Native codex.exe under %LOCALAPPDATA%\\OpenAI\\Codex\\bin (relay inventory).', 'Isolation candidate: CODEX_HOME in a dedicated directory outside repo and var/ (E-11), unverified.',
      'Login probe candidate: `codex login status` with that CODEX_HOME.'],
  },
  agy: {
    provider: 'agy', status: 'NEEDS_VERIFICATION', candidate_command: 'agy -p', candidate_argv: ['-p', '--output-format', 'json', '--sandbox', '--mode', 'plan'],
    candidate_envelope: unverified('E-11 (4): agy -p --output-format json; layout not observed on this machine', 'json_object', [], null),
    notes: ['E-11 (4): Antigravity CLI replaces gemini-cli. Native %LOCALAPPDATA%\\agy\\bin\\agy.exe (relay inventory 1.4.2).',
      'Select the verified model with --model <model> in the recorded argv; --mode must also be recorded and tested.',
      '`agy models` only proves a Google login, not the plan: entitlement must be verified separately.',
      'Unverified whether -p reads the prompt from stdin (the relay passes it in argv; 06A §5.C.1 requires data via stdin).', 'No recorded config-dir isolation mechanism.'],
  },
};

/** Issued by the gateway per run after subscriptionGuard passed; carries only verified, recorded values. */
export interface ExecutionPermit {
  provider: CliProvider; entrypoint: string; argv: string[]; envelope: EnvelopeSpec; profileEnv: Record<string, string>;
  /** Per-run sandbox root; the enforced_boundary report was collected under this same root. */
  sandboxRoot: string;
  timeoutMs: number; maxOutputBytes: number; model: string; cli_version: string;
}

export class CliProviderAdapter implements ProviderAdapter {
  private permits = new Map<string, ExecutionPermit>();
  private envelopes = new Map<string, EnvelopeSpec>();
  private aborts = new Map<string, AbortController>();
  constructor(readonly descriptor: CliDescriptor, private run: (r: ProcessRequest) => Promise<{ stdout: string; code: number | null }> = runBoundedProcess,
    /** Test seam for the Codex sandbox-group grant on per-run dirs (default: icacls, E-17). */
    private sandboxGrant?: SandboxGrant) {}

  /** Gateway-only: allow exactly one execution of runId with these verified parameters. */
  authorize(runId: string, permit: ExecutionPermit): void { this.permits.set(runId, permit); }

  // Status probes do not spawn the CLI while unverified; the gateway runs recorded probes itself.
  async inspectAuth() { return { authenticated: false, synthetic: false }; }
  async inspectEntitlement() { return { verified: false, billing: 'unverified' as const, synthetic: false }; }
  async readQuotaIfSupported() { return { remaining: null, observed_at: new Date().toISOString(), source: `${this.descriptor.provider}:not-observed` }; }
  async cancel(runId: string) { this.aborts.get(runId)?.abort(); }

  async execute(runId: string, job: Job, context: Context): Promise<unknown> {
    const permit = this.permits.get(runId);
    this.permits.delete(runId);
    if (!permit || permit.provider !== this.descriptor.provider) return { error: 'BILLING_UNVERIFIED' satisfies ProviderError };
    const sandbox = createRunSandbox(runId.replace(/[^A-Za-z0-9_-]/g, ''), [], permit.sandboxRoot,
      this.descriptor.provider === 'codex' ? { grant: this.sandboxGrant ?? grantSandboxGroupRead(CODEX_SANDBOX_GROUP) } : {});
    const abort = new AbortController();
    this.aborts.set(runId, abort);
    try {
      const child = buildChildEnv(process.env, sandbox, permit.profileEnv);
      if (child.leaked_billing_names.length > 0) return { error: 'BILLING_UNVERIFIED' };
      // Instructions + data go through stdin; argv is the recorded, fixed list (06A §5.C.1). Without the instruction
      // block a real model got only raw JSON and no output contract (found before the first real QC4 run, 20/10/2026).
      const input = buildTaskInput(job.task_type ?? 'writing.assess', job.job_id, context.manifest_id, context.payload);
      const out = await this.run({ executable: permit.entrypoint, args: permit.argv, cwd: sandbox.dir, input, env: child.env, timeoutMs: permit.timeoutMs,
        maxOutputBytes: permit.maxOutputBytes, signal: abort.signal });
      this.envelopes.set(runId, permit.envelope);
      return { transport: 'cli', run_id: runId, stdout: out.stdout, code: out.code };
    } catch (error) {
      const m = error instanceof Error ? error.message : '';
      return { error: m === 'TIMEOUT' ? 'TIMEOUT' : m === 'CANCELLED' ? 'CANCELLED' : m === 'OUTPUT_LIMIT' ? 'INVALID_SCHEMA' : 'NETWORK' };
    } finally {
      this.aborts.delete(runId);
      sandbox.dispose();
    }
  }

  normalizeResult(raw: unknown, taskType: TaskType = 'writing.assess'): AdapterResult {
    if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'INVALID_SCHEMA' };
    if ('error' in raw) return { ok: false, error: raw.error as ProviderError };
    const r = raw as { run_id?: string; stdout?: unknown; code?: number | null };
    const envelope = r.run_id ? this.envelopes.get(r.run_id) : undefined;
    if (r.run_id) this.envelopes.delete(r.run_id);
    if (!envelope || typeof r.stdout !== 'string') return { ok: false, error: 'BILLING_UNVERIFIED' };
    const parsed = parseEnvelope(r.stdout, r.code ?? null, envelope, taskType);
    return parsed.ok ? { ok: true, result: parsed.result } : { ok: false, error: parsed.error };
  }
}
