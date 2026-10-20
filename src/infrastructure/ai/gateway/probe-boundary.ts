// D-01 / E-13 enforced read-boundary collector for Codex. `codex sandbox -- <cmd>` runs a command inside the
// sandbox Codex applies to model commands, without calling a model. The same per-run layout, env allowlist,
// CODEX_HOME and sandbox config as the gateway's `codex exec` are used; each synthetic bait read is attempted by
// PowerShell inside that sandbox and only a status token comes back (never file content). The report is evidence
// for review, not an attestation: the gateway re-validates it against the recorded evidence before every run.
// E-15: the repo is readable by decision (repo_agents is information only); var/ stays blocked. inherited_config and
// plugins_hooks rest on a config inspection plus the tool-disable flags of the argv (`config_inspection`), never on
// the OS; the %LOCALAPPDATA% bait is an accepted risk only when every required tool is disabled and effective.
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, parse, resolve } from 'node:path';
import { CONFIG_INSPECTION_CASES, OS_BOUNDARY_CASES, type ProviderEvidence } from '../../../application/ai/subscription-guard.js';
import { runBoundedProcess } from '../bounded-process.js';
import { CODEX_CANDIDATE_ARGV, CODEX_DISABLED_FEATURES, codexToolDisableIssues } from './cli-adapters.js';
import { verifyEntrypoint } from './entrypoint.js';
import { buildChildEnv } from './env-allowlist.js';
import { CODEX_SANDBOX_GROUP, createRunSandbox, grantSandboxGroupRead, profileIsolationIssues, type SandboxGrant } from './isolation.js';

export const BOUNDARY_REPORT_KIND = 'study-english/probe-boundary/codex';
const BYPASS = /(dangerously|skip-permissions|bypass|--yolo|full-auto|no-sandbox|--bare\b)/i;

export type BoundaryCaseId = 'workspace_control' | 'user_profile' | 'local_app_data' | 'codex_home' | 'app_data' | 'repo_agents' | 'junction' | 'dotdot';
type OsCase = (typeof OS_BOUNDARY_CASES)[number];

/**
 * Which OS-level cases prove which guard case (each also needs the workspace control read to succeed).
 * local_app_data joins absolute_path only while it is required, i.e. when the tools are not all disabled (E-15 (2)).
 */
export function boundaryProof(localAppDataRequired: boolean): Record<OsCase, BoundaryCaseId[]> {
  return { absolute_path: ['user_profile', ...(localAppDataRequired ? ['local_app_data' as const] : []), 'codex_home', 'app_data'], dotdot: ['dotdot'], symlink_junction: ['junction'] };
}

export interface BoundaryCase {
  /** info: recorded, never fails the verdict (repo by E-15 (1); %LOCALAPPDATA% when tools are disabled, E-15 (2)). */
  id: BoundaryCaseId; expected: 'read' | 'blocked' | 'info'; target: string;
  outcome: 'READ' | 'BLOCKED' | 'ERROR'; error_kind: 'UnauthorizedAccess' | 'ItemNotFound' | 'Other' | null;
  detail: string; passed: boolean; command: string[]; fix?: string; note?: string;
}

/** E-15 (2): what `codex <--disable …> features list` reports for the argv's tool-disable flags (no model call). */
export interface ToolDisableCheck {
  required: string[]; argv_issues: string[]; command: string[]; exit_code: number | null;
  /** Effective state per required feature after the flags: false = disabled; null = not listed by this build. */
  effective: Record<string, boolean | null>; not_effective: string[]; ok: boolean;
}

/** E-15 (3): config the Codex process loads outside the sandbox. Names and section keys only, never values. */
export interface ConfigInspection {
  method: 'config_inspection'; codex_home: string; codex_home_entries: string[]; checked_ancestors: string[];
  findings: string[]; notes: string[]; ok: boolean;
}

export interface BoundaryReport {
  kind: typeof BOUNDARY_REPORT_KIND; schema_version: '2'; run_at: string; report_path: string;
  verdict: 'PASS' | 'FAIL' | 'INCONCLUSIVE'; inconclusive_reasons: string[];
  codex: { path: string; sha256: string; version: string };
  config: {
    workspace: string; run_dir: string; cwd: string; codex_home: string; gateway_argv: string[];
    sandbox_mode: string | null; config_overrides: string[]; disabled_features: string[]; writable_roots: string[]; env_names: string[]; reproduces: string;
  };
  sandbox_identity: { whoami: string | null; groups: string[]; codex_sandbox_group: boolean };
  acl: Record<string, string>;
  cases: BoundaryCase[];
  tools: ToolDisableCheck | null;
  config_inspection: ConfigInspection | null;
  proves: Record<OsCase, BoundaryCaseId[]> & { config_inspection: string[] };
  file_scope_test: ProviderEvidence['isolation']['file_scope_test'] | null;
  notes: string[];
}

/**
 * The sandbox-relevant part of a `codex exec` argv. Flags that may change the sandbox but cannot be replayed on
 * `codex sandbox` are returned as unsupported, which makes the probe INCONCLUSIVE rather than a guess.
 * `--disable <feature>` is accepted by `codex sandbox` too and is replayed; `--enable` is not reproduced.
 */
export function sandboxConfigFromArgv(argv: string[]): { sandbox_mode: string | null; overrides: string[]; disabled: string[]; unsupported: string[] } {
  let mode: string | null = null;
  const overrides: string[] = [];
  const disabled: string[] = [];
  const unsupported: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (['exec', '--json', '--skip-git-repo-check', '-'].includes(a)) continue;
    if (['--color', '-m', '--model'].includes(a)) { i++; continue; }
    if (a === '--sandbox' || a === '-s') { mode = argv[++i] ?? null; continue; }
    if (a === '--disable') { disabled.push(argv[++i] ?? ''); continue; }
    if (a === '-c' || a === '--config') {
      const v = argv[++i] ?? '';
      const m = /^sandbox_mode\s*=\s*"?([^"]*)"?$/.exec(v);
      if (m) mode = m[1]!; else overrides.push(v);
      continue;
    }
    unsupported.push(a);
  }
  if (mode === null) unsupported.push('NO_SANDBOX_MODE');
  return { sandbox_mode: mode, overrides, disabled, unsupported };
}

type Exec = (args: string[]) => Promise<{ ok: boolean; stdout: string; code: number | null }>;

/**
 * E-15 (2): checks the argv carries every required `--disable` and that the CLI reports each one as disabled.
 * Unknown names make `features list` exit non-zero, so nothing is assumed from the flags alone.
 */
export async function inspectCodexTools(exec: Exec, prefix: string[], argv: string[]): Promise<ToolDisableCheck> {
  const { disabled } = sandboxConfigFromArgv(argv);
  const command = [...prefix, ...disabled.flatMap((f) => ['--disable', f]), 'features', 'list'];
  const r = await exec(command);
  const table = new Map(r.stdout.split(/\r?\n/).map((l) => l.trim().split(/\s+/)).filter((p) => p.length >= 3).map((p) => [p[0]!, p[p.length - 1]!]));
  const effective = Object.fromEntries(CODEX_DISABLED_FEATURES.map((f) => [f, table.has(f) ? table.get(f) === 'true' : null])) as Record<string, boolean | null>;
  const listed = r.ok && r.code === 0;
  const not_effective = listed ? CODEX_DISABLED_FEATURES.filter((f) => effective[f] !== false) : [...CODEX_DISABLED_FEATURES];
  const argv_issues = codexToolDisableIssues(argv);
  return { required: [...CODEX_DISABLED_FEATURES], argv_issues, command, exit_code: r.code, effective, not_effective, ok: listed && !argv_issues.length && !not_effective.length };
}

const AGENTS_FILES = ['AGENTS.md', 'AGENTS.override.md'];
const CONFIG_KEYS = /^\s*\[\s*"?(mcp_servers|plugins|hooks|apps|skills|projects|profiles)\b|^\s*(notify|hooks|mcp_servers|experimental_instructions_file|model_instructions_file|developer_instructions|instructions)\s*=/;

/**
 * E-15 (3): what the unsandboxed Codex process could load besides the prompt. CODEX_HOME: AGENTS files, config.toml
 * sections for MCP/plugins/hooks/instructions, plugin/hook/skill directories. Workspace ancestors: AGENTS files and
 * project config directories. auth files are never opened; config.toml is scanned for section keys only.
 */
/**
 * E-15 (2) wants every model tool off. E-17 (user decision, 20/10/2026): `unified_exec` cannot be disabled on
 * codex-cli 0.163.0-alpha.10.2, so its risk is covered by the OS Deny on %LOCALAPPDATA% instead. Acceptable when every
 * other flag took effect, the argv is clean, and this very probe saw %LOCALAPPDATA% blocked (verdict PASS).
 */
export const OS_COVERED_TOOLS = ['unified_exec'] as const;
export function toolsAcceptable(r: Pick<BoundaryReport, 'tools' | 'cases' | 'verdict'>): boolean {
  const t = r.tools;
  if (!t) return false;
  if (t.ok) return true;
  const onlyOsCovered = t.argv_issues.length === 0 && t.not_effective.length > 0 && t.not_effective.every((f) => (OS_COVERED_TOOLS as readonly string[]).includes(f));
  const lad = r.cases.find((c) => c.id === 'local_app_data');
  return onlyOsCovered && r.verdict === 'PASS' && !!lad && lad.expected === 'blocked' && lad.passed;
}

export function inspectCodexConfig(codexHome: string, cwd: string, stopAt?: string): ConfigInspection {
  const findings: string[] = [];
  const notes: string[] = [];
  const entries = existsSync(codexHome) ? readdirSync(codexHome).sort() : [];
  for (const f of AGENTS_FILES) if (entries.includes(f)) findings.push(`CODEX_HOME_${f}`);
  for (const f of ['.mcp.json', 'hooks.json', 'plugins', 'hooks']) if (entries.includes(f)) findings.push(`CODEX_HOME_${f}`);
  if (entries.includes('config.toml')) {
    const keys = new Set(readFileSync(join(codexHome, 'config.toml'), 'utf8').split(/\r?\n/).map((l) => CONFIG_KEYS.exec(l)).filter((m) => m).map((m) => m![1] ?? m![2]!));
    for (const k of keys) findings.push(`CONFIG_TOML_${k}`);
    if (!keys.size) notes.push('config.toml present without MCP/plugin/hook/instruction keys');
  }
  if (entries.includes('skills')) {
    const skills = readdirSync(join(codexHome, 'skills'));
    for (const s of skills) if (s !== '.system') findings.push(`CODEX_HOME_skills/${s}`);
    if (skills.includes('.system')) notes.push('skills/.system: bundled by Codex; tools are disabled by argv');
  }
  const checked: string[] = [];
  for (let dir = resolve(cwd); ; dir = dirname(dir)) {
    checked.push(dir);
    for (const f of [...AGENTS_FILES, '.codex', '.agents']) if (existsSync(join(dir, f))) findings.push(`ANCESTOR_${f}:${join(dir, f)}`);
    if (dir === parse(dir).root || (stopAt && resolve(stopAt).toLowerCase() === dir.toLowerCase())) break;
  }
  return { method: 'config_inspection', codex_home: resolve(codexHome), codex_home_entries: entries, checked_ancestors: checked, findings, notes, ok: findings.length === 0 };
}

export interface ProbeBoundaryOptions {
  /** Test seam: how the sandbox group gets read access to the run dirs (default: icacls grant, E-17). */
  grant?: SandboxGrant;
  entrypoint: string;
  /** CODEX_HOME of the runner profile (never read here except for a dedicated bait subdirectory). */
  profileDir: string;
  /** Per-run sandbox root the gateway uses (default C:\se-runner\work); must already exist. */
  workspace: string;
  roots: { repo: string; data: string };
  parentEnv: NodeJS.ProcessEnv;
  /** Report path, decided before the run so file_scope_test can reference it. Never overwritten. */
  reportPath: string;
  /** The argv the gateway will record for `codex exec`; default CODEX_CANDIDATE_ARGV. */
  gatewayArgv?: string[];
  /** Tests only: arguments placed before every invocation (node.exe + fixture script). */
  argvPrefix?: string[];
  /** Real user folders for the bait files; default from parentEnv. */
  locations?: { userProfile: string; localAppData: string };
  /** Tests only: stop the ancestor walk of the config inspection here (temp dirs sit under the user profile). */
  configAncestorStop?: string;
  now?: () => Date;
  timeoutMs?: number;
}

const psQuote = (s: string) => `'${s.replace(/'/g, "''")}'`;
/** Runs under ConstrainedLanguage too (observed in the Codex sandbox): cmdlets and operators only. */
export function readScript(target: string, marker: string): string {
  return `$p=${psQuote(target)}; $m=${psQuote(marker)}; try { $c = Get-Content -LiteralPath $p -Raw -ErrorAction Stop; ` +
    `if ($m -eq '') { 'SE_PROBE READ' } elseif ($c -like ('*' + $m + '*')) { 'SE_PROBE READ_MATCH' } else { 'SE_PROBE READ_MISMATCH' } } ` +
    `catch { 'SE_PROBE BLOCKED ' + $_.CategoryInfo.Category + ' ' + $_.FullyQualifiedErrorId }`;
}

export function classifyProbeOutput(stdout: string, marker: string): Pick<BoundaryCase, 'outcome' | 'error_kind' | 'detail'> {
  if (marker && stdout.includes(marker)) return { outcome: 'READ', error_kind: null, detail: 'MARKER_IN_OUTPUT' };
  const line = stdout.split(/\r?\n/).map((l) => l.trim()).find((l) => l.startsWith('SE_PROBE '));
  if (!line) return { outcome: 'ERROR', error_kind: null, detail: 'NO_PROBE_OUTPUT' };
  if (/^SE_PROBE READ(_MATCH)?$/.test(line)) return { outcome: 'READ', error_kind: null, detail: line.slice(9) };
  if (line === 'SE_PROBE READ_MISMATCH') return { outcome: 'ERROR', error_kind: null, detail: 'READ_MISMATCH' };
  const detail = line.slice('SE_PROBE BLOCKED '.length).slice(0, 160);
  const kind = /UnauthorizedAccess|PermissionDenied/i.test(detail) ? 'UnauthorizedAccess' : /NotFound/i.test(detail) ? 'ItemNotFound' : 'Other';
  return { outcome: 'BLOCKED', error_kind: kind, detail };
}

function icacls(system: string, path: string): string {
  if (!existsSync(path)) return 'MISSING';
  const r = spawnSync(join(system, 'System32', 'icacls.exe'), [path], { encoding: 'utf8', shell: false, windowsHide: true, timeout: 30_000 });
  return r.error ? `ERROR ${r.error.message}` : `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().slice(0, 4000);
}

/** Suggestion only: the user decides and changes ACLs; `dir` is the protected location, not the bait subfolder. */
function fixHint(id: BoundaryCaseId, dir: string, sandboxGroup: boolean): string {
  if (!sandboxGroup) {
    return 'Sandbox chạy dưới chính tài khoản người dùng (không thấy nhóm CodexSandboxUsers), nên Deny cho CodexSandboxUsers không có tác dụng. ' +
      'Cần đổi cấu hình sandbox mà gateway ghi trong argv (ví dụ thử `-c windows.sandbox="elevated"`) rồi probe lại trước khi khóa ACL.';
  }
  if (id === 'local_app_data') return 'Chưa tắt đủ công cụ (xem tools.not_effective/argv_issues): chỉ khi đủ cờ --disable và CLI xác nhận đã tắt thì ca này mới là rủi ro được chấp nhận (E-15 (2)).';
  if (id === 'dotdot') return `Thư mục cha của cwd (${dir}) đọc được: Deny kế thừa trên thư mục gốc runner (D01_CODEX_READ_BOUNDARY, ví dụ C:\\se-runner) rồi probe lại; nếu ca đối chứng bị chặn theo thì hoàn tác.`;
  return `Gợi ý (người dùng tự chạy, kiểm tra trước): icacls "${dir}" /deny "CodexSandboxUsers:(OI)(CI)(R)"; hoàn tác: icacls "${dir}" /remove:d CodexSandboxUsers`;
}

export async function probeBoundary(o: ProbeBoundaryOptions): Promise<BoundaryReport> {
  const now = o.now ?? (() => new Date());
  const timeoutMs = o.timeoutMs ?? 60_000;
  const prefix = o.argvPrefix ?? [];
  const gatewayArgv = o.gatewayArgv ?? CODEX_CANDIDATE_ARGV;
  if (gatewayArgv.some((a) => BYPASS.test(a))) throw new Error('argv contains a flag that bypasses CLI safety controls');
  if (!existsSync(o.workspace)) {
    throw new Error(`Workspace ${o.workspace} does not exist. Create it yourself (outside the repo and your profile), e.g.:\n  New-Item -ItemType Directory -Force ${o.workspace} | Out-Null`);
  }
  const layout = profileIsolationIssues(o.profileDir, { repo: o.roots.repo, data: o.roots.data, sandboxRoot: o.workspace });
  if (layout.length) throw new Error(`Profile directory rejected: ${layout.join(', ')}`);
  if (!existsSync(o.profileDir)) throw new Error('Profile directory does not exist: log in first with CODEX_HOME set to it');
  const entry = verifyEntrypoint(o.entrypoint, { forbiddenRoots: [o.roots.repo, o.roots.data] });
  if (!entry.ok || !entry.sha256) throw new Error(`Entrypoint rejected: ${entry.issues.join(', ')}`);
  if (existsSync(o.reportPath)) throw new Error(`Report already exists (never overwritten): ${o.reportPath}`);

  const system = o.parentEnv.SystemRoot ?? o.parentEnv.SYSTEMROOT ?? 'C:\\Windows';
  const powershell = join(system, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const whoami = join(system, 'System32', 'whoami.exe');
  const locations = o.locations ?? { userProfile: o.parentEnv.USERPROFILE ?? '', localAppData: o.parentEnv.LOCALAPPDATA ?? '' };
  const cfg = sandboxConfigFromArgv(gatewayArgv);
  const nonce = randomUUID().replace(/-/g, '');
  const sandboxArgs = [...prefix, 'sandbox', ...(cfg.sandbox_mode ? ['-c', `sandbox_mode="${cfg.sandbox_mode}"`] : []), ...cfg.overrides.flatMap((v) => ['-c', v]),
    ...cfg.disabled.flatMap((f) => ['--disable', f]), '--'];
  // Same layout as the gateway run: <workspace>/<runId>/{work,tmp,home}, cwd = work.
  const sandbox = createRunSandbox(`probe-boundary-${nonce.slice(0, 16)}`, [], o.workspace, { grant: o.grant ?? grantSandboxGroupRead(CODEX_SANDBOX_GROUP, system) });
  const runDir = dirname(sandbox.dir);
  const env = buildChildEnv(o.parentEnv, sandbox, { CODEX_HOME: o.profileDir });
  const created: string[] = [];
  const link = join(sandbox.dir, 'linked');
  const exec = async (args: string[]) => {
    try { return { ok: true as const, ...(await runBoundedProcess({ executable: entry.real_path!, args, cwd: sandbox.dir, input: '', env: env.env, timeoutMs, maxOutputBytes: 200_000 })) }; }
    catch (error) { return { ok: false as const, stdout: '', stderr: error instanceof Error ? error.message : String(error), code: null }; }
  };

  const report: BoundaryReport = {
    kind: BOUNDARY_REPORT_KIND, schema_version: '2', run_at: now().toISOString(), report_path: resolve(o.reportPath), verdict: 'INCONCLUSIVE', inconclusive_reasons: [],
    codex: { path: entry.real_path!, sha256: entry.sha256, version: '' },
    config: { workspace: resolve(o.workspace), run_dir: runDir, cwd: sandbox.dir, codex_home: resolve(o.profileDir), gateway_argv: gatewayArgv,
      sandbox_mode: cfg.sandbox_mode, config_overrides: cfg.overrides, disabled_features: cfg.disabled, writable_roots: [], env_names: Object.keys(env.env).sort(),
      reproduces: 'gateway codex exec: same entrypoint, per-run layout under workspace, cwd, allowlisted env, CODEX_HOME, sandbox_mode, -c overrides and --disable flags from the recorded argv' },
    sandbox_identity: { whoami: null, groups: [], codex_sandbox_group: false }, acl: {}, cases: [], tools: null, config_inspection: null,
    proves: { ...boundaryProof(true), config_inspection: [] }, file_scope_test: null,
    notes: ['Assumes `codex exec` applies the same Windows sandbox as `codex sandbox` for the same CODEX_HOME/config (the purpose of `codex sandbox`).',
      'read-only sets no writable roots; workspace-write roots would come from -c overrides in the recorded argv.'],
  };
  if (cfg.unsupported.length) report.inconclusive_reasons.push(`ARGV_NOT_REPRODUCIBLE:${cfg.unsupported.join(',')}`);
  try {
    const version = await exec([...prefix, '--version']);
    report.codex.version = version.ok && version.code === 0 ? `${version.stdout}\n${version.stderr}`.trim().split(/\r?\n/)[0]!.trim().slice(0, 80) : '';
    if (!report.codex.version) report.inconclusive_reasons.push('VERSION_PROBE_FAILED');

    const who = await exec([...sandboxArgs, whoami]);
    const groups = await exec([...sandboxArgs, whoami, '/groups', '/fo', 'csv', '/nh']);
    report.sandbox_identity.whoami = who.ok && who.code === 0 ? who.stdout.trim().split(/\r?\n/)[0]!.trim() || null : null;
    report.sandbox_identity.groups = groups.ok ? [...groups.stdout.matchAll(/^"([^"]+)"/gm)].map((m) => m[1]!) : [];
    report.sandbox_identity.codex_sandbox_group = report.sandbox_identity.groups.some((g) => /CodexSandboxUsers/i.test(g));
    if (!report.sandbox_identity.whoami) report.inconclusive_reasons.push(`SANDBOX_NOT_RUNNING:${(who.stderr || who.stdout).trim().slice(0, 200)}`);

    // E-15 (2)/(3): tool-disable flags as the CLI resolves them, and the config the Codex process itself loads.
    report.tools = await inspectCodexTools(exec, prefix, gatewayArgv);
    report.config_inspection = inspectCodexConfig(o.profileDir, sandbox.dir, o.configAncestorStop);
    const localAppDataRequired = !report.tools.ok;

    // Synthetic bait files: random content per run, removed in finally.
    const marker = (k: string) => `SE-BOUNDARY-${k}-${nonce}`;
    const baitDir = (base: string) => { const d = join(base, `se-boundary-probe-${nonce.slice(0, 16)}`); mkdirSync(d); created.push(d); return d; };
    const bait = (dir: string, k: string) => { const p = join(dir, 'bait.txt'); writeFileSync(p, `${marker(k)}\n`, { flag: 'wx' }); return p; };
    const plan: { id: BoundaryCaseId; expected: BoundaryCase['expected']; target: string; marker: string; base: string; note?: string }[] = [];
    writeFileSync(join(sandbox.dir, 'control.txt'), `${marker('control')}\n`, { flag: 'wx' });
    plan.push({ id: 'workspace_control', expected: 'read', target: join(sandbox.dir, 'control.txt'), marker: marker('control'), base: sandbox.dir });
    const outside: [BoundaryCaseId, string][] = [['user_profile', locations.userProfile], ['local_app_data', locations.localAppData], ['codex_home', o.profileDir], ['app_data', o.roots.data]];
    let junctionTarget: string | null = null;
    for (const [id, base] of outside) {
      if (!base || !existsSync(base)) { report.inconclusive_reasons.push(`LOCATION_MISSING:${id}`); continue; }
      const dir = baitDir(base);
      const info = id === 'local_app_data' && !localAppDataRequired;
      plan.push({ id, expected: info ? 'info' : 'blocked', target: bait(dir, id), marker: marker(id), base,
        ...(info ? { note: 'E-15 (2): rủi ro được chấp nhận vì mọi công cụ đã tắt (tools.ok)' } : {}) });
      // The junction leads to the app data bait: a link into var/ must stay blocked whatever the tools are.
      if (id === 'app_data') junctionTarget = dir;
    }
    plan.push({ id: 'repo_agents', expected: 'info', target: join(o.roots.repo, 'AGENTS.md'), marker: '', base: o.roots.repo, note: 'E-15 (1): repo được phép đọc từ sandbox' });
    if (junctionTarget) {
      symlinkSync(junctionTarget, link, 'junction');
      plan.push({ id: 'junction', expected: 'blocked', target: 'linked\\bait.txt', marker: marker('app_data'), base: o.roots.data });
    }
    writeFileSync(join(runDir, 'dotdot-bait.txt'), `${marker('dotdot')}\n`, { flag: 'wx' });
    plan.push({ id: 'dotdot', expected: 'blocked', target: '..\\dotdot-bait.txt', marker: marker('dotdot'), base: runDir });

    for (const c of plan) {
      const command = [...sandboxArgs, powershell, '-NoProfile', '-NonInteractive', '-Command', readScript(c.target, c.marker)];
      const r = await exec(command);
      const seen = classifyProbeOutput(`${r.stdout}\n${r.stderr}`, c.marker);
      const result = r.ok ? seen : { outcome: 'ERROR' as const, error_kind: null, detail: r.stderr.slice(0, 200) };
      const passed = c.expected === 'info' || (c.expected === 'read' ? result.outcome === 'READ' : result.outcome === 'BLOCKED');
      // Markers are random per run and the files are deleted; the report keeps the command (with marker) for audit.
      report.cases.push({ id: c.id, expected: c.expected, target: c.target, ...result, passed, command: [entry.real_path!, ...command], ...(c.note ? { note: c.note } : {}),
        ...(c.expected === 'blocked' && result.outcome === 'READ' ? { fix: fixHint(c.id, c.base, report.sandbox_identity.codex_sandbox_group) } : {}) });
    }

    const acl: [string, string][] = [['workspace', o.workspace], ['run_dir', runDir], ['user_profile', locations.userProfile], ['local_app_data', locations.localAppData],
      ['codex_home', o.profileDir], ['app_data', o.roots.data], ['repo', o.roots.repo], ['repo_agents', join(o.roots.repo, 'AGENTS.md')]];
    for (const [k, p] of acl) report.acl[k] = p ? icacls(system, p) : 'MISSING';
  } finally {
    try { if (existsSync(link)) { try { unlinkSync(link); } catch { rmdirSync(link); } } } catch { /* reported below if it survives */ }
    for (const d of created) rmSync(d, { recursive: true, force: true });
    sandbox.dispose();
    rmSync(runDir, { recursive: true, force: true });
  }
  const leftovers = [...created, runDir].filter((p) => existsSync(p));
  if (leftovers.length) report.notes.push(`CLEANUP_INCOMPLETE: ${leftovers.join(', ')}`);

  const forbiddenRead = report.cases.some((c) => c.expected === 'blocked' && c.outcome === 'READ');
  const control = report.cases.find((c) => c.id === 'workspace_control');
  if (control && control.outcome !== 'READ') report.inconclusive_reasons.push(`CONTROL_NOT_READ:${control.outcome}`);
  for (const c of report.cases) if (c.outcome === 'ERROR' && c.expected !== 'info') report.inconclusive_reasons.push(`CASE_ERROR:${c.id}`);
  report.verdict = forbiddenRead ? 'FAIL' : report.inconclusive_reasons.length ? 'INCONCLUSIVE' : 'PASS';
  const proof = boundaryProof(!report.tools?.ok);
  const configCases = toolsAcceptable(report) && report.config_inspection?.ok ? [...CONFIG_INSPECTION_CASES] : [];
  report.proves = { ...proof, config_inspection: configCases };
  if (report.verdict === 'PASS') {
    const ok = (ids: BoundaryCaseId[]) => ids.every((id) => report.cases.some((c) => c.id === id && c.passed && c.expected !== 'info'));
    report.file_scope_test = { passed: true, cases: OS_BOUNDARY_CASES.filter((k) => ok(proof[k])), run_at: report.run_at,
      method: 'enforced_boundary', enforcement_evidence_ref: report.report_path, config_cases: configCases, config_method: 'config_inspection' };
  }
  mkdirSync(dirname(o.reportPath), { recursive: true });
  writeFileSync(o.reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  return report;
}

const samePath = (a: string, b: string) => resolve(a).toLowerCase() === resolve(b).toLowerCase();

/**
 * Re-validates a boundary report against what the gateway is about to run. Any mismatch keeps
 * READ_BOUNDARY_UNVERIFIED: a report for another binary, profile, workspace or sandbox config proves nothing here.
 */
export function boundaryReportIssues(path: string, expect: { evidence: ProviderEvidence; runnerDir: string | undefined; workspace: string }): string[] {
  let r: BoundaryReport;
  try { r = JSON.parse(readFileSync(path, 'utf8')) as BoundaryReport; } catch { return ['REPORT_UNREADABLE']; }
  // schema 1 predates E-15 (repo required blocked, no config inspection): it proves nothing for the current matrix.
  if (r?.kind !== BOUNDARY_REPORT_KIND || r.schema_version !== '2') return ['REPORT_KIND'];
  const issues: string[] = [];
  const e = expect.evidence;
  if (e.provider !== 'codex') issues.push('PROVIDER_MISMATCH');
  if (r.verdict !== 'PASS' || !r.file_scope_test || r.file_scope_test.method !== 'enforced_boundary') issues.push(`VERDICT_${r.verdict}`);
  if (!samePath(r.report_path ?? '', path)) issues.push('REPORT_PATH_MISMATCH');
  if (r.codex?.sha256 !== e.entrypoint.sha256) issues.push('ENTRYPOINT_MISMATCH');
  if (r.codex?.version !== e.cli_version) issues.push('CLI_VERSION_MISMATCH');
  if (!expect.runnerDir || !samePath(r.config?.codex_home ?? '', expect.runnerDir)) issues.push('PROFILE_MISMATCH');
  if (!samePath(r.config?.workspace ?? '', expect.workspace)) issues.push('WORKSPACE_MISMATCH');
  const cfg = sandboxConfigFromArgv(e.argv);
  const sorted = (a: string[] | undefined) => JSON.stringify([...(a ?? [])].sort());
  if (cfg.unsupported.length || cfg.sandbox_mode !== r.config?.sandbox_mode || JSON.stringify(cfg.overrides) !== JSON.stringify(r.config?.config_overrides ?? []) ||
    sorted(cfg.disabled) !== sorted(r.config?.disabled_features)) issues.push('SANDBOX_CONFIG_MISMATCH');
  const proven = r.file_scope_test?.cases ?? [];
  for (const c of e.isolation.file_scope_test.cases) if (!proven.includes(c)) issues.push(`CASE_NOT_PROVEN:${c}`);
  const configProven = r.file_scope_test?.config_method === 'config_inspection' && toolsAcceptable(r) && r.config_inspection?.ok ? r.file_scope_test.config_cases ?? [] : [];
  for (const c of e.isolation.file_scope_test.config_cases ?? []) if (!configProven.includes(c)) issues.push(`CASE_NOT_PROVEN:${c}`);
  return issues;
}
