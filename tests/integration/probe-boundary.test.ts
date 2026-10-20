// E-13 enforced read-boundary collector. Only node.exe + tests/fixtures/fake-codex.mjs is spawned (no real Codex,
// no model, no network); all bait locations are temp directories except the read-only AGENTS.md readability case.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { subscriptionGuard, type GuardInput, type ProviderEvidence } from '../../src/application/ai/subscription-guard.js';
import { AiExecutionGateway } from '../../src/infrastructure/ai/gateway/gateway.js';
import { CODEX_CANDIDATE_ARGV, CODEX_DISABLED_FEATURES, codexToolDisableIssues } from '../../src/infrastructure/ai/gateway/cli-adapters.js';
import { boundaryReportIssues, classifyProbeOutput, inspectCodexConfig, probeBoundary, readScript, sandboxConfigFromArgv, type ProbeBoundaryOptions } from '../../src/infrastructure/ai/gateway/probe-boundary.js';
import { fixture, tempDir, type Fixture } from './p1-helpers.js';

let f: Fixture | undefined;
const cleanups: (() => void)[] = [];
afterEach(() => { f?.cleanup(); f = undefined; cleanups.splice(0).forEach((c) => c()); });

const NOW = new Date('2026-10-20T00:00:00.000Z');
const nodeSha = createHash('sha256').update(readFileSync(process.execPath)).digest('hex');
const ARGV = ['exec', '--json', '--sandbox', 'read-only', '--skip-git-repo-check', '--color', 'never', '-m', 'synthetic-model', '-'];
const DISABLE = CODEX_DISABLED_FEATURES.flatMap((f) => ['--disable', f]);
/** E-15 (2): the argv with every required tool disabled. */
const TOOLS_OFF_ARGV = [...ARGV.slice(0, 4), ...DISABLE, ...ARGV.slice(4)];
const CONFIG_CASES = { config_cases: ['inherited_config', 'plugins_hooks'], config_method: 'config_inspection' as const };

function setup(mode = 'contained', over: Partial<ProbeBoundaryOptions> = {}) {
  const t = tempDir('ielts-probe-'); cleanups.push(t.cleanup);
  const dirs = Object.fromEntries(['work', 'home', 'profile', 'local', 'data'].map((k) => { const d = join(t.dir, k); mkdirSync(d); return [k, d]; })) as Record<string, string>;
  writeFileSync(join(dirs.home!, 'fake-mode.txt'), mode);
  const opts: ProbeBoundaryOptions = {
    entrypoint: process.execPath, argvPrefix: [resolve('tests/fixtures/fake-codex.mjs')], profileDir: dirs.home!, workspace: dirs.work!,
    roots: { repo: resolve('.'), data: dirs.data! }, parentEnv: { SystemRoot: process.env.SystemRoot ?? 'C:\\Windows' }, reportPath: join(t.dir, 'out', 'probe.json'),
    gatewayArgv: TOOLS_OFF_ARGV, locations: { userProfile: dirs.profile!, localAppData: dirs.local! }, configAncestorStop: t.dir, now: () => NOW, timeoutMs: 20_000, ...over,
  };
  return { t, dirs, opts };
}

function evidence(report: { codex: { version: string }; report_path: string }, profileDir: string, over: Partial<ProviderEvidence['isolation']['file_scope_test']> = {}): ProviderEvidence {
  return {
    provider: 'codex', profile_id: 'syn-codex', cli_version: report.codex.version, entrypoint: { path: process.execPath, sha256: nodeSha, kind: 'native_executable' }, argv: TOOLS_OFF_ARGV,
    auth: { mode: 'subscription_login', observed: 'synthetic', checked_at: NOW.toISOString(), probe_argv: ['--version'], expect_pattern: 'v' },
    entitlement: { plan: 'synthetic', applies_to_cli: true, source: 'synthetic', checked_at: NOW.toISOString(), expect_pattern: 'v' },
    extra_usage: { disabled_confirmed: true, confirmed_at: NOW.toISOString(), next_confirmation_due: '' }, models_allowed: ['synthetic-model'],
    isolation: { mechanism: 'CODEX_HOME', plugins_disabled: true, file_scope_test: { passed: true, cases: ['absolute_path', 'dotdot', 'symlink_junction'], run_at: NOW.toISOString(),
      method: 'enforced_boundary', enforcement_evidence_ref: report.report_path, ...over } },
    process_control: { timeout_cancel_test_passed: true, run_at: NOW.toISOString() }, output_contract: { envelope_verified: true, test_passed: true, run_at: NOW.toISOString() },
    capabilities: ['text', 'structured_result'],
  };
}

const leftovers = (dirs: Record<string, string>) => ['profile', 'local', 'data', 'home'].flatMap((k) => readdirSync(dirs[k]!).filter((n) => n.startsWith('se-boundary-probe-')));

describe('probe-boundary codex (E-13 collector, fake CLI)', () => {
  it('passes when every forbidden bait is blocked and the control is read; maps only proven guard cases', async () => {
    const { dirs, opts } = setup('contained');
    const report = await probeBoundary(opts);
    expect(report.verdict).toBe('PASS');
    expect(report.cases.map((c) => [c.id, c.expected, c.outcome, c.passed])).toEqual([
      ['workspace_control', 'read', 'READ', true], ['user_profile', 'blocked', 'BLOCKED', true], ['local_app_data', 'info', 'BLOCKED', true], ['codex_home', 'blocked', 'BLOCKED', true],
      ['app_data', 'blocked', 'BLOCKED', true], ['repo_agents', 'info', 'BLOCKED', true], ['junction', 'blocked', 'BLOCKED', true], ['dotdot', 'blocked', 'BLOCKED', true]]);
    expect(report.cases.find((c) => c.id === 'app_data')!.error_kind).toBe('UnauthorizedAccess');
    // OS cases from the sandbox; inherited_config / plugins_hooks only from config inspection + disabled tools (E-15 (3)).
    expect(report.file_scope_test).toEqual({ passed: true, cases: ['absolute_path', 'dotdot', 'symlink_junction'], run_at: NOW.toISOString(), method: 'enforced_boundary',
      enforcement_evidence_ref: resolve(opts.reportPath), ...CONFIG_CASES });
    expect(report.proves.absolute_path).toEqual(['user_profile', 'codex_home', 'app_data']);
    expect(report.tools).toMatchObject({ argv_issues: [], not_effective: [], ok: true, exit_code: 0 });
    expect(report.config_inspection).toMatchObject({ method: 'config_inspection', findings: [], ok: true });
    expect(report.sandbox_identity).toMatchObject({ whoami: 'synthetic\\codexsandboxoffline', codex_sandbox_group: true });
    expect(report.config).toMatchObject({ workspace: resolve(dirs.work!), sandbox_mode: 'read-only', config_overrides: [], disabled_features: [...CODEX_DISABLED_FEATURES], codex_home: resolve(dirs.home!) });
    expect(report.config.env_names).toContain('CODEX_HOME');
    expect(report.config.env_names).not.toContain('OPENAI_API_KEY');
    expect(JSON.parse(readFileSync(join(dirs.home!, 'fake-sandbox-args.json'), 'utf8'))).toEqual(['sandbox', '-c', 'sandbox_mode="read-only"', ...DISABLE]);
    expect(Object.keys(report.acl)).toEqual(['workspace', 'run_dir', 'user_profile', 'local_app_data', 'codex_home', 'app_data', 'repo', 'repo_agents']);
    expect(JSON.parse(readFileSync(opts.reportPath, 'utf8'))).toMatchObject({ verdict: 'PASS', codex: { sha256: nodeSha } });
    // Bait, junction and run directory are removed; the target of the junction survived the cleanup of the link.
    expect(leftovers(dirs)).toEqual([]);
    expect(readdirSync(dirs.work!)).toEqual([]);
    expect(report.notes.some((n) => n.startsWith('CLEANUP_INCOMPLETE'))).toBe(false);
    await expect(probeBoundary(opts)).rejects.toThrow(/never overwritten/);
  });

  it('fails with a fix hint when a forbidden bait is readable, and exports no file_scope_test', async () => {
    const { dirs, opts } = setup('leaky');
    const report = await probeBoundary(opts);
    expect(report.verdict).toBe('FAIL');
    expect(report.file_scope_test).toBeNull();
    const data = report.cases.find((c) => c.id === 'app_data')!;
    expect(data).toMatchObject({ outcome: 'READ', passed: false });
    expect(data.fix).toContain(`icacls "${dirs.data}" /deny "CodexSandboxUsers:(OI)(CI)(R)"`);
    expect(report.cases.find((c) => c.id === 'repo_agents')).toMatchObject({ outcome: 'READ', detail: 'READ', passed: true });
    expect(report.cases.find((c) => c.id === 'junction')).toMatchObject({ outcome: 'READ', passed: false });
    expect(leftovers(dirs)).toEqual([]);
  });

  it('E-15: a readable repo and %LOCALAPPDATA% pass only while every tool is disabled and effective', async () => {
    const open = await probeBoundary(setup('open-repo-local').opts);
    expect(open.verdict).toBe('PASS');
    expect(open.cases.filter((c) => c.outcome === 'READ').map((c) => [c.id, c.expected])).toEqual([['workspace_control', 'read'], ['local_app_data', 'info'], ['repo_agents', 'info']]);
    expect(open.file_scope_test).toMatchObject({ cases: ['absolute_path', 'dotdot', 'symlink_junction'], ...CONFIG_CASES });
    // Missing --disable flags in the gateway argv: %LOCALAPPDATA% is required blocked again and no config case is proven.
    const partial = await probeBoundary(setup('open-repo-local', { gatewayArgv: ARGV }).opts);
    expect(partial.verdict).toBe('FAIL');
    expect(partial.tools!.argv_issues[0]).toMatch(/^TOOLS_NOT_DISABLED:shell_tool,unified_exec,/);
    expect(partial.cases.find((c) => c.id === 'local_app_data')).toMatchObject({ expected: 'blocked', outcome: 'READ', passed: false, fix: expect.stringMatching(/E-15/) });
    expect(partial.proves.config_inspection).toEqual([]);
    // A flag the CLI does not honour (unified_exec, as on 0.163.0-alpha.10.2) counts as not disabled.
    const pinned = await probeBoundary(setup('open-repo-local-pinned').opts);
    expect(pinned.tools).toMatchObject({ argv_issues: [], not_effective: ['unified_exec'], ok: false });
    expect(pinned.verdict).toBe('FAIL');
    const pinnedContained = await probeBoundary(setup('contained-pinned').opts);
    expect(pinnedContained.verdict).toBe('PASS');
    // E-17: with only unified_exec still on and %LOCALAPPDATA% blocked by the OS in this probe, the config cases count.
    expect(pinnedContained.file_scope_test).toMatchObject({ cases: ['absolute_path', 'dotdot', 'symlink_junction'], ...CONFIG_CASES });
    expect(pinnedContained.proves.absolute_path).toContain('local_app_data');
  });

  it('E-15 (3): config inspection lists AGENTS files, MCP/plugin/hook config and skills without values', async () => {
    const { t, dirs, opts } = setup('contained');
    writeFileSync(join(dirs.home!, 'AGENTS.md'), 'synthetic instructions');
    writeFileSync(join(dirs.home!, 'config.toml'), 'model = "x"\n[mcp_servers.syn]\ncommand = "secret-command-value"\n[hooks]\n');
    mkdirSync(join(dirs.home!, 'skills', '.system'), { recursive: true });
    mkdirSync(join(dirs.home!, 'skills', 'custom'));
    writeFileSync(join(t.dir, 'AGENTS.override.md'), 'ancestor');
    const report = await probeBoundary(opts);
    expect(report.config_inspection!.findings).toEqual(['CODEX_HOME_AGENTS.md', 'CONFIG_TOML_mcp_servers', 'CONFIG_TOML_hooks', 'CODEX_HOME_skills/custom',
      `ANCESTOR_AGENTS.override.md:${join(t.dir, 'AGENTS.override.md')}`]);
    expect(JSON.stringify(report)).not.toContain('secret-command-value');
    expect(report.verdict).toBe('PASS');
    expect(report.file_scope_test).toMatchObject({ config_cases: [] });
    const clean = inspectCodexConfig(dirs.local!, dirs.work!, dirs.work!);
    expect(clean).toMatchObject({ findings: [], ok: true, checked_ancestors: [resolve(dirs.work!)] });
  });

  it('says a CodexSandboxUsers deny would not help when the sandbox runs as the user', async () => {
    const confined = await probeBoundary(setup('user-token').opts);
    expect(confined.sandbox_identity).toMatchObject({ whoami: 'synthetic\\pc', codex_sandbox_group: false });
    expect(confined.verdict).toBe('PASS'); // identity alone does not decide: the OS reads do
    const leaky = await probeBoundary(setup('user-token-leaky').opts);
    expect(leaky.verdict).toBe('FAIL');
    expect(leaky.cases.find((c) => c.id === 'app_data')!.fix).toMatch(/Deny cho CodexSandboxUsers không có tác dụng/);
  });

  it('is INCONCLUSIVE when the sandbox cannot run or the gateway argv cannot be replayed', async () => {
    const broken = await probeBoundary(setup('sandbox-broken').opts);
    expect(broken.verdict).toBe('INCONCLUSIVE');
    expect(broken.inconclusive_reasons[0]).toMatch(/^SANDBOX_NOT_RUNNING/);
    expect(broken.file_scope_test).toBeNull();
    const extra = await probeBoundary(setup('contained', { gatewayArgv: ['exec', '--json', '--add-dir', 'C:\\x', '--enable', 'shell_tool', '-'] }).opts);
    expect(extra.verdict).toBe('INCONCLUSIVE');
    expect(extra.inconclusive_reasons).toContain('ARGV_NOT_REPRODUCIBLE:--add-dir,C:\\x,--enable,shell_tool,NO_SANDBOX_MODE');
  });

  it('replays -c overrides and --disable flags from the recorded argv and refuses bypass flags', async () => {
    const s = setup('contained', { gatewayArgv: ['exec', '--json', '-c', 'sandbox_mode="read-only"', '-c', 'windows.sandbox="elevated"', '--disable', 'shell_tool', '-'] });
    const report = await probeBoundary(s.opts);
    expect(report.config).toMatchObject({ sandbox_mode: 'read-only', config_overrides: ['windows.sandbox="elevated"'], disabled_features: ['shell_tool'] });
    expect(JSON.parse(readFileSync(join(s.dirs.home!, 'fake-sandbox-args.json'), 'utf8'))).toEqual(['sandbox', '-c', 'sandbox_mode="read-only"', '-c', 'windows.sandbox="elevated"', '--disable', 'shell_tool']);
    await expect(probeBoundary(setup('contained', { gatewayArgv: ['exec', '--dangerously-bypass-approvals-and-sandbox', '-'] }).opts)).rejects.toThrow(/bypass/);
  });

  it('stops with instructions when the workspace does not exist, and does not create it', async () => {
    const { t, opts } = setup();
    const missing = join(t.dir, 'se-runner', 'work');
    await expect(probeBoundary({ ...opts, workspace: missing })).rejects.toThrow(/New-Item -ItemType Directory -Force/);
    expect(existsSync(missing)).toBe(false);
    await expect(probeBoundary({ ...opts, profileDir: join(resolve('.'), 'var', 'codex-home') })).rejects.toThrow(/RUNNER_DIR_INSIDE_REPO/);
  });

  it('defaults to the gateway candidate argv (E-14 elevated sandbox, E-15 tools disabled)', async () => {
    const s = setup('contained', { gatewayArgv: undefined });
    const report = await probeBoundary(s.opts);
    expect(report.config).toMatchObject({ sandbox_mode: 'read-only', config_overrides: ['windows.sandbox="elevated"'], disabled_features: [...CODEX_DISABLED_FEATURES] });
    expect(codexToolDisableIssues(CODEX_CANDIDATE_ARGV)).toEqual([]);
    expect(codexToolDisableIssues([...TOOLS_OFF_ARGV, '-c', 'features.shell_tool=true'])).toEqual(['FEATURE_CONFIG_OVERRIDE:features.shell_tool=true']);
    expect(codexToolDisableIssues(TOOLS_OFF_ARGV.filter((a) => a !== 'hooks').concat('--enable', 'plugins')))
      .toEqual(['FEATURE_ENABLED:plugins', expect.stringMatching(/^TOOLS_NOT_DISABLED:/)]);
  });

  it('parses argv and probe output conservatively', () => {
    expect(sandboxConfigFromArgv(ARGV)).toEqual({ sandbox_mode: 'read-only', overrides: [], disabled: [], unsupported: [] });
    expect(sandboxConfigFromArgv(['exec', '-']).unsupported).toEqual(['NO_SANDBOX_MODE']);
    expect(classifyProbeOutput('SE_PROBE BLOCKED ObjectNotFound PathNotFound,x', 'm')).toMatchObject({ outcome: 'BLOCKED', error_kind: 'ItemNotFound' });
    expect(classifyProbeOutput('', 'm')).toMatchObject({ outcome: 'ERROR' });
    expect(classifyProbeOutput('SE_PROBE BLOCKED x\nleaked m-123', 'm-123')).toMatchObject({ outcome: 'READ', detail: 'MARKER_IN_OUTPUT' });
    expect(readScript("C:\\a'b", 'x')).toContain("$p='C:\\a''b'");
  });
});

describe('gateway accepts enforced_boundary only with a matching PASS report', () => {
  it('validates binary, version, profile, workspace, sandbox config and claimed cases', async () => {
    const { dirs, opts } = setup('contained');
    const report = await probeBoundary(opts);
    const expectOk = { runnerDir: dirs.home!, workspace: dirs.work! };
    expect(boundaryReportIssues(opts.reportPath, { evidence: evidence(report, dirs.home!), ...expectOk })).toEqual([]);
    expect(boundaryReportIssues(opts.reportPath, { evidence: evidence(report, dirs.home!), ...expectOk, workspace: 'C:\\se-runner\\work' })).toEqual(['WORKSPACE_MISMATCH']);
    expect(boundaryReportIssues(opts.reportPath, { evidence: evidence(report, dirs.home!), ...expectOk, runnerDir: dirs.local! })).toEqual(['PROFILE_MISMATCH']);
    expect(boundaryReportIssues(opts.reportPath, { evidence: { ...evidence(report, dirs.home!), cli_version: 'other' }, ...expectOk })).toEqual(['CLI_VERSION_MISMATCH']);
    expect(boundaryReportIssues(opts.reportPath, { evidence: { ...evidence(report, dirs.home!), entrypoint: { path: 'x', sha256: 'a'.repeat(64), kind: 'native_executable' } }, ...expectOk })).toEqual(['ENTRYPOINT_MISMATCH']);
    expect(boundaryReportIssues(opts.reportPath, { evidence: { ...evidence(report, dirs.home!), argv: ['exec', '--sandbox', 'workspace-write', '-'] }, ...expectOk })).toEqual(['SANDBOX_CONFIG_MISMATCH']);
    expect(boundaryReportIssues(opts.reportPath, { evidence: evidence(report, dirs.home!, { cases: ['absolute_path', 'inherited_config', 'plugins_hooks'] }), ...expectOk }))
      .toEqual(['CASE_NOT_PROVEN:inherited_config', 'CASE_NOT_PROVEN:plugins_hooks']);
    // E-15 (3): config cases are accepted from config_inspection when the report proved them…
    expect(boundaryReportIssues(opts.reportPath, { evidence: evidence(report, dirs.home!, CONFIG_CASES), ...expectOk })).toEqual([]);
    expect(boundaryReportIssues(opts.reportPath, { evidence: { ...evidence(report, dirs.home!, CONFIG_CASES), argv: TOOLS_OFF_ARGV.filter((a, i, all) => a !== 'hooks' && all[i + 1] !== 'hooks') }, ...expectOk }))
      .toEqual(['SANDBOX_CONFIG_MISMATCH']);
    // E-17: unified_exec pinned on but %LOCALAPPDATA% blocked by the OS in this probe → config cases accepted too…
    const pinned = setup('contained-pinned');
    const pinnedReport = await probeBoundary(pinned.opts);
    expect(boundaryReportIssues(pinned.opts.reportPath, { evidence: evidence(pinnedReport, pinned.dirs.home!, CONFIG_CASES), runnerDir: pinned.dirs.home!, workspace: pinned.dirs.work! }))
      .toEqual([]);
    expect(boundaryReportIssues(join(dirs.work!, 'nope.json'), { evidence: evidence(report, dirs.home!), ...expectOk })).toEqual(['REPORT_UNREADABLE']);
    const failed = await probeBoundary(setup('leaky').opts);
    expect(boundaryReportIssues(failed.report_path, { evidence: evidence(failed, dirs.home!), ...expectOk })).toEqual(expect.arrayContaining(['VERDICT_FAIL']));
  });

  it('subscriptionGuard keeps READ_BOUNDARY_UNVERIFIED until the report was checked and matched', () => {
    const e = evidence({ codex: { version: 'synthetic-1.0' }, report_path: 'C:\\r.json' }, 'C:\\p', CONFIG_CASES);
    const observed: GuardInput['observed'] = { cli_version: 'synthetic-1.0', entrypoint_sha256: nodeSha, entrypoint_issues: [], auth_subscription: true, entitlement_verified: true, isolation_issues: [], enforcement_issues: [] };
    const input = (o: GuardInput['observed']): GuardInput => ({ provider: 'codex', adapter_status: 'VERIFIED', account: { state: 'READY' }, evidence: e, observed: o, env: { leaked_billing_names: [] },
      job: { billing_policy: 'subscription_only', required_capabilities: ['text'], data_classes: ['synthetic_fixture'], model: 'synthetic-model' }, consents: new Set(['synthetic_fixture']), now: NOW });
    expect(subscriptionGuard(input(observed))).toEqual({ allowed: true });
    expect(subscriptionGuard(input({ ...observed, enforcement_issues: null }))).toEqual({ allowed: false, error: 'BILLING_UNVERIFIED', reasons: ['READ_BOUNDARY_UNVERIFIED', 'BOUNDARY_NOT_CHECKED'] });
    expect(subscriptionGuard(input({ ...observed, enforcement_issues: ['WORKSPACE_MISMATCH'] }))).toEqual({ allowed: false, error: 'BILLING_UNVERIFIED', reasons: ['READ_BOUNDARY_UNVERIFIED', 'BOUNDARY_WORKSPACE_MISMATCH'] });
  });

  it('the gateway re-validates the referenced report on its default observation path', async () => {
    f = await fixture();
    const fx = f;
    const { dirs, opts } = setup('contained', { roots: { repo: resolve('.'), data: fx.root } });
    const report = await probeBoundary(opts);
    fx.store.aiAccounts.upsertAccount({ profile_id: 'syn-codex', provider: 'codex', label: 'Codex', runner_ref: dirs.home!, state: 'READY' });
    const gw = (workspace: string) => new AiExecutionGateway({ evidence: (p) => fx.store.aiAccounts.latestEvidence(p), account: (p) => fx.store.aiAccounts.account(p),
      consents: () => new Set(['synthetic_fixture']), parentEnv: {}, roots: { repo: resolve('.'), data: fx.root, sandboxRoot: workspace }, now: () => NOW });
    const envelope = { status: 'VERIFIED' as const, source: 'synthetic', format: 'json_object' as const, result_path: ['result'], error_flag_path: null, error_patterns: [] };
    fx.store.aiAccounts.recordEvidence(evidence(report, dirs.home!), envelope);
    const reasons = async (ws: string) => { const { decision } = await gw(ws).decide('codex', { billing_policy: 'subscription_only', required_capabilities: ['text'], data_classes: ['synthetic_fixture'] });
      return decision.allowed ? [] : decision.reasons; };
    // Other gaps remain (node --version is not the fake's version, missing cases); the boundary itself is accepted.
    expect(await reasons(dirs.work!)).not.toContain('READ_BOUNDARY_UNVERIFIED');
    expect(await reasons(join(dirs.work!, '..', 'other'))).toEqual(expect.arrayContaining(['READ_BOUNDARY_UNVERIFIED', 'BOUNDARY_WORKSPACE_MISMATCH']));
    fx.store.aiAccounts.recordEvidence(evidence({ ...report, report_path: join(dirs.work!, 'missing.json') }, dirs.home!), envelope);
    expect(await reasons(dirs.work!)).toEqual(expect.arrayContaining(['READ_BOUNDARY_UNVERIFIED', 'BOUNDARY_REPORT_UNREADABLE']));
    // E-15: an argv without the tool-disable flags is blocked; config added to CODEX_HOME after the probe invalidates config_inspection.
    fx.store.aiAccounts.recordEvidence({ ...evidence(report, dirs.home!), argv: ARGV }, envelope);
    expect((await reasons(dirs.work!)).some((r) => r.startsWith('ISOLATION_TOOLS_NOT_DISABLED:shell_tool,'))).toBe(true);
    fx.store.aiAccounts.recordEvidence(evidence(report, dirs.home!, CONFIG_CASES), envelope);
    writeFileSync(join(dirs.home!, 'AGENTS.md'), 'synthetic');
    expect(await reasons(dirs.work!)).toEqual(expect.arrayContaining(['READ_BOUNDARY_UNVERIFIED', 'BOUNDARY_CONFIG_CODEX_HOME_AGENTS.md']));
  });
});
