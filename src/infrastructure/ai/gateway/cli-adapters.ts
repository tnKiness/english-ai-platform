// Provider adapters for the three subscription CLIs (06A §3.A). P2 state: none verified. An adapter never spawns
// its CLI unless the gateway handed it a permit for that run after subscriptionGuard passed; without one,
// execute() returns BILLING_UNVERIFIED immediately. Candidate argv/envelopes below are NOT verified facts.
import type { AdapterResult, Context, Job, ProviderAdapter, ProviderError, TaskType } from '../../../application/ai/provider-adapter.js';
import type { CliProvider, ProviderEvidence } from '../../../application/ai/subscription-guard.js';
import { runBoundedProcess, type ProcessRequest } from '../bounded-process.js';
import { buildChildEnv } from './env-allowlist.js';
import { parseEnvelope, type EnvelopeSpec } from './envelope.js';
import { buildTaskInput } from '../task-instructions.js';
import { CODEX_SANDBOX_GROUP, createRunSandbox, grantSandboxGroupRead, type SandboxGrant } from './isolation.js';
import { verifyAgyDenySettings } from './probe-boundary.js';

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
 * E-21: proposed defaults for Claude Code and Antigravity (agy) — user confirms at verify time.
 * Claude Code 2.1.288: `-p --output-format stream-json --verbose --restricted --tools "" --strict-mcp-config --no-session-persistence --model <m> --effort <e>` (prompt on stdin).
 * agy 1.4.2: `-p --input-format stream-json --output-format stream-json --sandbox --mode plan --model <m>` (NDJSON message on stdin).
 */
export const CODEX_DEFAULT_MODEL = 'gpt-6-astra';
export const CODEX_DEFAULT_EFFORT = 'medium';
export const CLAUDE_DEFAULT_MODEL = 'claude-opus-5-5';
export const CLAUDE_DEFAULT_EFFORT = 'medium';
export const CLAUDE_CANDIDATE_ARGV = [
  '-p', '--output-format', 'stream-json', '--verbose',
  '--restricted', '--tools', '', '--strict-mcp-config', '--no-session-persistence',
  '--model', CLAUDE_DEFAULT_MODEL, '--effort', CLAUDE_DEFAULT_EFFORT,
];

export const AGY_DEFAULT_MODEL = 'gemini-4-argon-medium';
export const AGY_CANDIDATE_ARGV = [
  // agy's -p takes a value; a bare -p swallows the next flag as the prompt. `-p=` + --input-format stream-json reads stdin (21/10/2026).
  '-p=', '--input-format', 'stream-json', '--output-format', 'stream-json',
  '--sandbox', '--mode', 'plan', '--model', AGY_DEFAULT_MODEL,
];

/**
 * E-22: Known model aliases / documented identifiers per CLI (without inference).
 * - claude-code: aliases from `claude --help` ("Provide an alias for the latest model (e.g. 'sonnet' or 'opus') or a model's full name") plus observed subscription model.
 * - codex: `codex exec --help` ("-m, --model <MODEL>") + observed subscription model; Codex CLI has no offline subcommand to list models.
 * - agy: live list is queried via `agy models` (non-inference); fallback below is the observed subscription default.
 */
export const KNOWN_CLI_MODELS: Record<CliProvider, { source: string; supports_effort: boolean; effort_values: readonly string[]; models: readonly { id: string; note: string }[] }> = {
  'claude-code': {
    source: 'claude --help (--model <model>: alias "sonnet", "opus" hoặc tên đầy đủ; --effort <level>) + model đã xác nhận trên máy (21/10/2026)',
    supports_effort: true,
    effort_values: ['low', 'medium', 'high'],
    models: [
      { id: 'claude-opus-5-5', note: 'Tên đầy đủ đã xác minh trong D-01 (21/10/2026)' },
      { id: 'opus', note: 'Bí danh chính thức trong `claude --help` cho bản Opus mới nhất' },
      { id: 'sonnet', note: 'Bí danh chính thức trong `claude --help` cho bản Sonnet mới nhất' },
    ],
  },
  codex: {
    source: 'codex exec --help (-m/--model <MODEL>, -c model_reasoning_effort="<level>"; CLI không có lệnh liệt kê model offline) + model đã xác nhận trên máy (20/10/2026)',
    supports_effort: true,
    effort_values: ['low', 'medium', 'high'],
    models: [
      { id: 'gpt-6-astra', note: 'Model đã xác minh trong D-01 trên gói ChatGPT Plus (20/10/2026)' },
    ],
  },
  agy: {
    source: 'Lệnh `agy models` (không gọi inference, liệt kê trực tiếp từ Antigravity CLI; effort đã mã hóa trong tên model)',
    supports_effort: false,
    effort_values: [],
    models: [
      { id: 'gemini-4-argon-medium', note: 'Model mặc định đã xác minh trong D-01 (21/10/2026)' },
    ],
  },
};

/**
 * E-22: Strip only `--model`/`-m`, `--effort`, and `-c model_reasoning_effort=...` from an argv so two argvs
 * can be compared by safety template (every sandbox, tool-disable, restricted and MCP flag must remain identical in order).
 */
export function stripModelAndEffortFromArgv(provider: CliProvider, argv: readonly string[]): {
  template: string[];
  model: string | null;
  effort: string | null;
} {
  const template: string[] = [];
  let model: string | null = null;
  let effort: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if ((a === '--model' || a === '-m') && i + 1 < argv.length) {
      if (model !== null) throw new Error('DUPLICATE_MODEL_FLAG');
      model = argv[++i] ?? null;
      if (!model || !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(model)) throw new Error('INVALID_MODEL');
      continue;
    }
    if (provider === 'claude-code' && a === '--effort' && i + 1 < argv.length) {
      if (effort !== null) throw new Error('DUPLICATE_EFFORT_FLAG');
      effort = argv[++i] ?? null;
      if (!effort || !/^[a-z]+$/.test(effort)) throw new Error('INVALID_EFFORT');
      continue;
    }
    if (provider === 'codex' && (a === '-c' || a === '--config') && i + 1 < argv.length && /^model_reasoning_effort\s*=/.test(argv[i + 1] ?? '')) {
      if (effort !== null) throw new Error('DUPLICATE_EFFORT_FLAG');
      const raw = argv[++i] ?? '';
      const m = /^model_reasoning_effort\s*=\s*"?([^"]*)"?$/.exec(raw);
      effort = m?.[1] ?? raw;
      if (!/^[a-z]+$/.test(effort)) throw new Error('INVALID_EFFORT');
      continue;
    }
    template.push(a);
  }
  return { template, model, effort };
}

/** E-22: Check whether two argvs for a provider have the exact same non-model/effort template. */
export function argvMatchesTemplate(provider: CliProvider, a: readonly string[], b: readonly string[]): boolean {
  try {
    const ta = stripModelAndEffortFromArgv(provider, a).template;
    const tb = stripModelAndEffortFromArgv(provider, b).template;
    return JSON.stringify(ta) === JSON.stringify(tb);
  } catch { return false; }
}

/**
 * E-22: Build the runtime argv from a verified evidence argv template by substituting only the selected model
 * (and optional effort if supported by the provider CLI), preserving every safety flag in place.
 */
export function buildModelArgv(provider: CliProvider, baseArgv: readonly string[], model: string, effort?: string | null): string[] {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(model)) throw new Error('INVALID_MODEL');
  if (effort && (!/^[a-z]+$/.test(effort) || provider === 'agy')) throw new Error('INVALID_EFFORT');
  const { template, effort: baseEffort } = stripModelAndEffortFromArgv(provider, baseArgv);
  const effectiveEffort = effort !== undefined && effort !== null && effort.trim() !== '' ? effort.trim() : baseEffort;
  if (provider === 'codex') {
    const extra: string[] = ['-m', model];
    if (effectiveEffort) extra.push('-c', `model_reasoning_effort="${effectiveEffort}"`);
    if (template.at(-1) === '-') {
      return [...template.slice(0, -1), ...extra, '-'];
    }
    return [...template, ...extra];
  }
  if (provider === 'claude-code') {
    const extra: string[] = ['--model', model];
    if (effectiveEffort) extra.push('--effort', effectiveEffort);
    return [...template, ...extra];
  }
  // agy: effort is part of the model id; only --model is substituted
  return [...template, '--model', model];
}

export function isVerifiedModelConfiguration(e: ProviderEvidence, model: string, effort: string | null): boolean {
  if (!e.models_allowed.includes(model) || (e.provider === 'agy' && effort !== null)) return false;
  if (e.model_configurations) return e.model_configurations.some((c) => c.model === model && c.effort === effort);
  // Legacy evidence grants only the recorded effort; it never grants a new effort implicitly.
  return effort === stripModelAndEffortFromArgv(e.provider, e.argv).effort;
}

/** Format a prompt string as a single NDJSON user message line for `agy -p --input-format stream-json`. */
export function formatAgyStreamInput(text: string): string {
  // agy NDJSON input (found by trial on agy 1.4.3, 21/10/2026): {"event":"user","message":{"content":…}}.
  return `${JSON.stringify({ event: 'user', message: { content: text } })}\n`;
}

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

/** E-21: Claude Code argv must disable all tools and strict MCP config (`--restricted --tools "" --strict-mcp-config --no-session-persistence`). */
export function claudeArgvIssues(argv: string[]): string[] {
  const issues: string[] = [];
  if (!argv.includes('-p')) issues.push('CLAUDE_ARGV_MISSING_-p');
  const outIdx = argv.indexOf('--output-format');
  if (outIdx < 0 || argv[outIdx + 1] !== 'stream-json') issues.push('CLAUDE_ARGV_MISSING_STREAM_JSON');
  if (!argv.includes('--verbose')) issues.push('CLAUDE_ARGV_MISSING_VERBOSE');
  if (!argv.includes('--restricted')) issues.push('CLAUDE_ARGV_MISSING_RESTRICTED');
  const toolsIdx = argv.indexOf('--tools');
  if (toolsIdx < 0 || argv[toolsIdx + 1] !== '') issues.push('CLAUDE_ARGV_TOOLS_NOT_EMPTY');
  if (!argv.includes('--strict-mcp-config')) issues.push('CLAUDE_ARGV_MISSING_STRICT_MCP');
  if (!argv.includes('--no-session-persistence')) issues.push('CLAUDE_ARGV_MISSING_NO_SESSION_PERSISTENCE');
  if (argv.includes('--allowedTools')) issues.push('CLAUDE_ARGV_HAS_ALLOWED_TOOLS');
  return issues;
}

/** E-21: agy argv must use `--input-format stream-json --output-format stream-json --sandbox --mode plan`. */
export function agyArgvIssues(argv: string[]): string[] {
  const issues: string[] = [];
  if (!argv.includes('-p=')) issues.push('AGY_ARGV_MISSING_-p');
  const inIdx = argv.indexOf('--input-format');
  if (inIdx < 0 || argv[inIdx + 1] !== 'stream-json') issues.push('AGY_ARGV_MISSING_INPUT_STREAM_JSON');
  const outIdx = argv.indexOf('--output-format');
  if (outIdx < 0 || argv[outIdx + 1] !== 'stream-json') issues.push('AGY_ARGV_MISSING_OUTPUT_STREAM_JSON');
  if (!argv.includes('--sandbox')) issues.push('AGY_ARGV_MISSING_SANDBOX');
  const modeIdx = argv.indexOf('--mode');
  if (modeIdx < 0 || argv[modeIdx + 1] !== 'plan') issues.push('AGY_ARGV_MODE_NOT_PLAN');
  return issues;
}

export const CLI_DESCRIPTORS: Record<CliProvider, CliDescriptor> = {
  'claude-code': {
    provider: 'claude-code', status: 'NEEDS_VERIFICATION', candidate_command: 'claude -p', candidate_argv: CLAUDE_CANDIDATE_ARGV,
    candidate_envelope: {
      ...unverified('E-21: claude -p --output-format stream-json --verbose; result line has type="result" and result string', 'jsonl_last_object', ['result'], ['is_error']),
      line_select: { path: ['type'], equals: 'result' },
    },
    notes: [
      'Native claude.exe behind the npm shim (relay inventory 19/10/2026).',
      'Never --bare (skips subscription login, 06A §3.A).',
      `Proposed model default: ${CLAUDE_DEFAULT_MODEL} (effort ${CLAUDE_DEFAULT_EFFORT}) — user confirms at verify time.`,
      'E-21 isolation: CLAUDE_CONFIG_DIR + --restricted --tools "" --strict-mcp-config --no-session-persistence (method cli_tools_disabled).',
    ],
  },
  codex: {
    provider: 'codex', status: 'NEEDS_VERIFICATION', candidate_command: 'codex exec', candidate_argv: CODEX_CANDIDATE_ARGV,
    candidate_envelope: { ...unverified('06A §3.A (codex exec --json); JSONL layout not observed — record it with `npm run ai -- verify codex`', 'jsonl_last_object', ['item', 'text'], null),
      line_select: { path: ['item', 'type'], equals: 'agent_message' } },
    notes: ['Native codex.exe under %LOCALAPPDATA%\\OpenAI\\Codex\\bin (relay inventory).', 'Isolation candidate: CODEX_HOME in a dedicated directory outside repo and var/ (E-11), unverified.',
      'Login probe candidate: `codex login status` with that CODEX_HOME.'],
  },
  agy: {
    provider: 'agy', status: 'NEEDS_VERIFICATION', candidate_command: 'agy -p', candidate_argv: AGY_CANDIDATE_ARGV,
    candidate_envelope: {
      ...unverified('E-21: agy -p --input-format stream-json --output-format stream-json --sandbox --mode plan; result event has event="result" and result.response', 'jsonl_last_object', ['result', 'response'], ['result', 'status']),
      line_select: { path: ['event'], equals: 'result' },
      error_flag_not_equals: 'SUCCESS',
    },
    notes: [
      'E-11 (4) / E-21: Antigravity CLI replaces gemini-cli. Native %LOCALAPPDATA%\\agy\\bin\\agy.exe (relay inventory 1.4.2).',
      `Proposed model default: ${AGY_DEFAULT_MODEL} — user confirms at verify time.`,
      '`agy models` only proves a Google login, not the plan: entitlement (Google AI Ultra) must be confirmed by the user.',
      'Data sent via stdin using `--input-format stream-json` (one NDJSON user message line).',
      'E-21 isolation: USERPROFILE and HOME point to dedicated profile dir with `<profile>\\.gemini\\antigravity-cli\\settings.json` denying command(*), read_file(*), write_file(*), read_url(*), mcp(*) (method cli_permission_deny).',
    ],
  },
};

/** Issued by the gateway per run after subscriptionGuard passed; carries only verified, recorded values. */
export interface ExecutionPermit {
  provider: CliProvider; entrypoint: string; argv: string[]; envelope: EnvelopeSpec; profileEnv: Record<string, string>;
  /** Per-run sandbox root; the enforced_boundary report was collected under this same root. */
  sandboxRoot: string;
  timeoutMs: number; maxOutputBytes: number; model: string; effort?: string | null; cli_version: string;
  /** E-23 (3): chạy canary 1 lần trước khi chạy job thật nếu (provider, cli_version, model, effort) chưa có canary đạt. */
  ensureCanary?: () => Promise<{ ok: true } | { ok: false; error: ProviderError; reason: string }>;
  /** E-23 (2): thông báo cho gateway/DB khi runtime self-check phát hiện vi phạm ranh giới trong lượt chạy. */
  onRuntimeBlock?: (reason: 'RUNTIME_TOOLS_PRESENT' | 'RUNTIME_DENY_RULES_CHANGED' | 'RUNTIME_TOOL_EXECUTED', detail: string) => void;
  /** Cho phép bỏ qua canary khi chính canary đang chạy. */
  skipCanary?: boolean;
}

/**
 * E-23 (2): Kiểm tra luồng stream-json của `claude-code` trong chính lượt chạy:
 * nếu sự kiện `system/init` có `tools` hoặc `mcp_servers` khác rỗng, hoặc xuất hiện `tool_use`, kết quả bị loại ngay.
 */
export function checkClaudeRuntimeStream(stdout: string): { ok: true } | { ok: false; reason: 'RUNTIME_TOOLS_PRESENT'; detail: string } {
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      if (obj.type === 'system' && obj.subtype === 'init') {
        const tools = Array.isArray(obj.tools) ? obj.tools : null;
        const mcp = Array.isArray(obj.mcp_servers) ? obj.mcp_servers : null;
        if (tools === null || tools.length > 0 || mcp === null || mcp.length > 0) {
          return { ok: false, reason: 'RUNTIME_TOOLS_PRESENT', detail: `init tools=${JSON.stringify(tools)} mcp_servers=${JSON.stringify(mcp)}` };
        }
      }
      if (obj.type === 'tool_use') {
        return { ok: false, reason: 'RUNTIME_TOOLS_PRESENT', detail: 'tool_use event in stream' };
      }
      if (obj.type === 'assistant' && typeof obj.message === 'object' && obj.message !== null) {
        const content = (obj.message as { content?: unknown }).content;
        if (Array.isArray(content) && content.some((c) => typeof c === 'object' && c !== null && (c as { type?: unknown }).type === 'tool_use')) {
          return { ok: false, reason: 'RUNTIME_TOOLS_PRESENT', detail: 'assistant tool_use content block in stream' };
        }
      }
    } catch { /* ignore non-JSON line */ }
  }
  return { ok: true };
}

/**
 * E-23 (2): Kiểm tra luồng stream-json của `agy` sau lượt chạy:
 * bất kỳ bước `step_update` kiểu tool nào hoàn tất (`state: 'DONE'`) mà không phải lỗi permission đều bị loại.
 */
export function checkAgyRuntimeStream(stdout: string): { ok: true } | { ok: false; reason: 'RUNTIME_TOOL_EXECUTED'; detail: string } {
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      if (obj.event === 'step_update' || obj.step_update !== undefined) {
        const su = (typeof obj.step_update === 'object' && obj.step_update !== null ? obj.step_update : obj) as Record<string, unknown>;
        const isTool = su.step_type === 'tool' || typeof su.tool_name === 'string' || typeof su.tool === 'string';
        const isDone = su.state === 'DONE' || su.status === 'DONE' || su.status === 'SUCCESS';
        const errText = `${typeof su.error === 'string' ? su.error : ''} ${typeof su.output === 'string' ? su.output : ''}`;
        const permDenied = /permission check failed|denied by settings\.json|permission denied/i.test(errText);
        if (isTool && isDone && !permDenied) {
          return { ok: false, reason: 'RUNTIME_TOOL_EXECUTED', detail: `tool=${String(su.tool_name ?? su.tool ?? 'unknown')} state=${String(su.state ?? su.status)}` };
        }
      }
    } catch { /* ignore non-JSON line */ }
  }
  return { ok: true };
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
    // E-23 (2): agy phải có đúng 5 quy tắc deny trong `<profile>\.gemini\antigravity-cli\settings.json` ngay trước khi spawn.
    if (this.descriptor.provider === 'agy' && permit.profileEnv.USERPROFILE) {
      const agyCheck = verifyAgyDenySettings(permit.profileEnv.USERPROFILE);
      if (!agyCheck.ok) {
        permit.onRuntimeBlock?.('RUNTIME_DENY_RULES_CHANGED', agyCheck.detail);
        return { error: 'BILLING_UNVERIFIED' satisfies ProviderError, reason: 'RUNTIME_DENY_RULES_CHANGED' };
      }
    }
    // E-23 (3): chạy canary 1 lần cho (provider, cli_version, model, effort) chưa có canary đạt trước khi chạy job thật.
    if (permit.ensureCanary && !permit.skipCanary) {
      const canary = await permit.ensureCanary();
      if (!canary.ok) return { error: canary.error, reason: canary.reason };
    }
    const sandbox = createRunSandbox(runId.replace(/[^A-Za-z0-9_-]/g, ''), [], permit.sandboxRoot,
      this.descriptor.provider === 'codex' ? { grant: this.sandboxGrant ?? grantSandboxGroupRead(CODEX_SANDBOX_GROUP) } : {});
    const abort = new AbortController();
    this.aborts.set(runId, abort);
    try {
      const child = buildChildEnv(process.env, sandbox, permit.profileEnv);
      if (child.leaked_billing_names.length > 0) return { error: 'BILLING_UNVERIFIED' };
      // Instructions + data go through stdin; argv is the recorded, fixed list (06A §5.C.1). Without the instruction
      // block a real model got only raw JSON and no output contract (found before the first real QC4 run, 20/10/2026).
      const rawInput = buildTaskInput(job.task_type ?? 'writing.assess', job.job_id, context.manifest_id, context.payload);
      const input = permit.argv.includes('--input-format') && permit.argv[permit.argv.indexOf('--input-format') + 1] === 'stream-json'
        ? formatAgyStreamInput(rawInput)
        : rawInput;
      const out = await this.run({ executable: permit.entrypoint, args: permit.argv, cwd: sandbox.dir, input, env: child.env, timeoutMs: permit.timeoutMs,
        maxOutputBytes: permit.maxOutputBytes, signal: abort.signal });
      // E-23 (2): kiểm tra ranh giới trong chính luồng đầu ra của claude-code và agy trước khi chấp nhận kết quả.
      if (this.descriptor.provider === 'claude-code') {
        const check = checkClaudeRuntimeStream(out.stdout);
        if (!check.ok) {
          permit.onRuntimeBlock?.(check.reason, check.detail);
          return { error: 'BILLING_UNVERIFIED' satisfies ProviderError, reason: check.reason };
        }
      } else if (this.descriptor.provider === 'agy') {
        const check = checkAgyRuntimeStream(out.stdout);
        if (!check.ok) {
          permit.onRuntimeBlock?.(check.reason, check.detail);
          return { error: 'BILLING_UNVERIFIED' satisfies ProviderError, reason: check.reason };
        }
      }
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
