// E-21: D-01 for claude-code (cli_tools_disabled) and agy (cli_permission_deny) using synthetic fake CLIs (node.exe).
// No real CLI is spawned; no network or real credentials are accessed.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PROVIDER_BOUNDARY_METHODS,
  subscriptionGuard,
  type CliProvider,
  type GuardInput,
  type ProviderEvidence,
  type ReadBoundaryMethod,
} from '../../src/application/ai/subscription-guard.js';
import {
  AGY_CANDIDATE_ARGV,
  AGY_DEFAULT_MODEL,
  agyArgvIssues,
  CLAUDE_CANDIDATE_ARGV,
  CLAUDE_DEFAULT_MODEL,
  claudeArgvIssues,
  CLI_DESCRIPTORS,
  CliProviderAdapter,
  formatAgyStreamInput,
} from '../../src/infrastructure/ai/gateway/cli-adapters.js';
import { parseEnvelope, type EnvelopeSpec } from '../../src/infrastructure/ai/gateway/envelope.js';
import { AiExecutionGateway } from '../../src/infrastructure/ai/gateway/gateway.js';
import { profileEnvFor } from '../../src/infrastructure/ai/gateway/isolation.js';
import {
  AGY_REQUIRED_DENY_RULES,
  boundaryReportIssues,
  inspectAgyConfig,
  inspectClaudeConfig,
  probeAgyBoundary,
  probeClaudeBoundary,
} from '../../src/infrastructure/ai/gateway/probe-boundary.js';
import { agyLimitMessage, classifyClaudeLogin, claudeLimitMessage, verifyClaudeOrAgy } from '../../src/infrastructure/ai/gateway/verify-codex.js';
import { fixture, tempDir, type Fixture } from './p1-helpers.js';

let f: Fixture | undefined;
const cleanups: (() => void)[] = [];
afterEach(() => { f?.cleanup(); f = undefined; cleanups.splice(0).forEach((c) => c()); });

const NOW = new Date('2026-10-21T00:00:00.000Z');
const nodeSha = createHash('sha256').update(readFileSync(process.execPath)).digest('hex');
const FAKE_SCRIPT = resolve('tests/fixtures/fake-e21-cli.mjs');

function makeDirs() {
  const t = tempDir('ielts-e21-');
  cleanups.push(t.cleanup);
  const dirs = Object.fromEntries(['work', 'claudeProfile', 'agyProfile', 'data'].map((k) => {
    const d = join(t.dir, k);
    mkdirSync(d, { recursive: true });
    return [k, d];
  })) as Record<string, string>;
  return { t, dirs };
}

function writeAgySettings(profileDir: string, content: unknown = { permissions: { deny: [...AGY_REQUIRED_DENY_RULES] } }) {
  const dir = join(profileDir, '.gemini', 'antigravity-cli');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'settings.json'), JSON.stringify(content, null, 2));
}

function baseEvidence(provider: CliProvider, method: ReadBoundaryMethod, ref: string, argv: string[], mechanism: string, model: string): ProviderEvidence {
  return {
    provider,
    profile_id: provider === 'claude-code' ? 'claude-main' : `${provider}-main`,
    cli_version: provider === 'claude-code' ? '2.1.288 (Claude Code synthetic)' : provider === 'agy' ? 'agy 1.4.2-synthetic' : 'codex-cli 0.0.0-synthetic',
    entrypoint: { path: process.execPath, sha256: nodeSha, kind: 'native_executable' },
    argv,
    auth: { mode: 'subscription_login', observed: 'synthetic', checked_at: NOW.toISOString(), probe_argv: ['--version'], expect_pattern: '.' },
    entitlement: { plan: 'synthetic', applies_to_cli: true, source: 'synthetic', checked_at: NOW.toISOString(), expect_pattern: '.' },
    extra_usage: { disabled_confirmed: true, confirmed_at: NOW.toISOString(), next_confirmation_due: '' },
    models_allowed: [model],
    isolation: {
      mechanism,
      plugins_disabled: true,
      file_scope_test: {
        passed: true,
        cases: ['absolute_path', 'dotdot', 'symlink_junction'],
        run_at: NOW.toISOString(),
        method,
        enforcement_evidence_ref: ref,
        config_cases: ['inherited_config', 'plugins_hooks'],
        config_method: 'config_inspection',
      },
    },
    process_control: { timeout_cancel_test_passed: true, run_at: NOW.toISOString() },
    output_contract: { envelope_verified: true, test_passed: true, run_at: NOW.toISOString() },
    capabilities: ['text', 'structured_result'],
  };
}

describe('E-21 subscriptionGuard provider-specific boundary methods', () => {
  const okObs: GuardInput['observed'] = {
    cli_version: '2.1.288 (Claude Code synthetic)',
    entrypoint_sha256: nodeSha,
    entrypoint_issues: [],
    auth_subscription: true,
    entitlement_verified: true,
    isolation_issues: [],
    enforcement_issues: [],
  };

  it('accepts only the exact boundary method assigned to each provider and rejects cross-provider methods', () => {
    const allMethods: Exclude<ReadBoundaryMethod, 'model_reply'>[] = ['enforced_boundary', 'cli_tools_disabled', 'cli_permission_deny'];
    const providers: CliProvider[] = ['codex', 'claude-code', 'agy'];
    for (const provider of providers) {
      for (const method of allMethods) {
        const ev = baseEvidence(provider, method, 'C:\\report.json', CLAUDE_CANDIDATE_ARGV, 'CLAUDE_CONFIG_DIR', 'm');
        const decision = subscriptionGuard({
          provider,
          adapter_status: 'VERIFIED',
          account: { state: 'READY' },
          evidence: ev,
          observed: { ...okObs, cli_version: ev.cli_version },
          env: { leaked_billing_names: [] },
          job: { billing_policy: 'subscription_only', required_capabilities: ['text'], data_classes: ['synthetic_fixture'], model: 'm' },
          consents: new Set(['synthetic_fixture']),
          now: NOW,
        });
        if (method === PROVIDER_BOUNDARY_METHODS[provider]) {
          expect(decision).toEqual({ allowed: true });
        } else {
          expect(decision).toMatchObject({ allowed: false, error: 'BILLING_UNVERIFIED' });
          expect((decision as { reasons: string[] }).reasons).toEqual(
            expect.arrayContaining(['READ_BOUNDARY_UNVERIFIED', `BOUNDARY_METHOD_NOT_ALLOWED_FOR_${provider}:${method}`]),
          );
        }
      }
    }
  });
});

describe('E-21 probe-boundary claude (cli_tools_disabled, fake CLI)', () => {
  it('passes when tools:[], mcp_servers:[], only builtin plugins and clean config; fails when tools or mcp are non-empty or config is dirty', async () => {
    const { t, dirs } = makeDirs();
    const baseOpts = {
      entrypoint: process.execPath,
      argvPrefix: [FAKE_SCRIPT],
      profileDir: dirs.claudeProfile!,
      workspace: dirs.work!,
      roots: { repo: resolve('.'), data: dirs.data! },
      parentEnv: { SystemRoot: process.env.SystemRoot ?? 'C:\\Windows' },
      configAncestorStop: t.dir,
      now: () => NOW,
    };

    // 1. Contained -> PASS
    writeFileSync(join(dirs.claudeProfile!, 'fake-mode.txt'), 'contained');
    const passPath = join(t.dir, 'claude-pass.json');
    const passReport = await probeClaudeBoundary({ ...baseOpts, reportPath: passPath });
    expect(passReport.verdict).toBe('PASS');
    expect(passReport.init_observation).toMatchObject({
      init_seen: true,
      tools: [],
      mcp_servers: [],
      unexpected_plugins: [],
      overage_status: 'rejected',
      overage_disabled_reason: 'org_level_disabled',
      ok: true,
    });
    expect(passReport.file_scope_test).toEqual({
      passed: true,
      cases: ['absolute_path', 'dotdot', 'symlink_junction'],
      run_at: NOW.toISOString(),
      method: 'cli_tools_disabled',
      enforcement_evidence_ref: resolve(passPath),
      config_cases: ['inherited_config', 'plugins_hooks'],
      config_method: 'config_inspection',
    });
    await expect(probeClaudeBoundary({ ...baseOpts, reportPath: passPath })).rejects.toThrow(/never overwritten/);

    // 2. Non-empty tools -> FAIL
    writeFileSync(join(dirs.claudeProfile!, 'fake-mode.txt'), 'tools-nonempty');
    const toolsFail = await probeClaudeBoundary({ ...baseOpts, reportPath: join(t.dir, 'claude-tools-fail.json') });
    expect(toolsFail.verdict).toBe('FAIL');
    expect(toolsFail.init_observation.tools).toEqual(['Bash', 'Read']);
    expect(toolsFail.file_scope_test).toBeNull();

    // 3. Non-empty mcp_servers -> FAIL
    writeFileSync(join(dirs.claudeProfile!, 'fake-mode.txt'), 'mcp-nonempty');
    const mcpFail = await probeClaudeBoundary({ ...baseOpts, reportPath: join(t.dir, 'claude-mcp-fail.json') });
    expect(mcpFail.verdict).toBe('FAIL');
    expect(mcpFail.init_observation.mcp_servers).toEqual(['paid-mcp-server']);
    expect(mcpFail.file_scope_test).toBeNull();

    // 4. Unexpected plugin -> FAIL
    writeFileSync(join(dirs.claudeProfile!, 'fake-mode.txt'), 'plugin-extra');
    const pluginFail = await probeClaudeBoundary({ ...baseOpts, reportPath: join(t.dir, 'claude-plugin-fail.json') });
    expect(pluginFail.verdict).toBe('FAIL');
    expect(pluginFail.init_observation.unexpected_plugins).toEqual(['custom-paid-plugin']);
    expect(pluginFail.file_scope_test).toBeNull();

    // 5. Dirty config (CLAUDE.md in profile or ancestor AGENTS.md) -> FAIL
    writeFileSync(join(dirs.claudeProfile!, 'fake-mode.txt'), 'contained');
    writeFileSync(join(dirs.claudeProfile!, 'CLAUDE.md'), 'custom instructions');
    const cfgFail = await probeClaudeBoundary({ ...baseOpts, reportPath: join(t.dir, 'claude-cfg-fail.json') });
    expect(cfgFail.verdict).toBe('FAIL');
    expect(cfgFail.config_inspection.findings).toContain('PROFILE_CLAUDE.md');
    expect(cfgFail.file_scope_test).toBeNull();
  });

  it('validates Claude argv and matches gateway evidence against the boundary report', async () => {
    expect(claudeArgvIssues(CLAUDE_CANDIDATE_ARGV)).toEqual([]);
    expect(claudeArgvIssues(['-p', '--output-format', 'stream-json', '--verbose'])).toEqual([
      'CLAUDE_ARGV_MISSING_RESTRICTED',
      'CLAUDE_ARGV_TOOLS_NOT_EMPTY',
      'CLAUDE_ARGV_MISSING_STRICT_MCP',
      'CLAUDE_ARGV_MISSING_NO_SESSION_PERSISTENCE',
    ]);
    const { t, dirs } = makeDirs();
    const passPath = join(t.dir, 'claude-ok.json');
    const report = await probeClaudeBoundary({
      entrypoint: process.execPath,
      argvPrefix: [FAKE_SCRIPT],
      profileDir: dirs.claudeProfile!,
      workspace: dirs.work!,
      roots: { repo: resolve('.'), data: dirs.data! },
      parentEnv: { SystemRoot: process.env.SystemRoot ?? 'C:\\Windows' },
      configAncestorStop: t.dir,
      reportPath: passPath,
      now: () => NOW,
    });
    expect(report.verdict).toBe('PASS');
    const ev = baseEvidence('claude-code', 'cli_tools_disabled', passPath, CLAUDE_CANDIDATE_ARGV, 'CLAUDE_CONFIG_DIR', CLAUDE_DEFAULT_MODEL);
    expect(boundaryReportIssues(passPath, { evidence: ev, runnerDir: dirs.claudeProfile!, workspace: dirs.work! })).toEqual([]);
    expect(boundaryReportIssues(passPath, { evidence: { ...ev, argv: [...CLAUDE_CANDIDATE_ARGV, '--extra'] }, runnerDir: dirs.claudeProfile!, workspace: dirs.work! }))
      .toEqual(['ARGV_MISMATCH']);
    expect(inspectClaudeConfig(dirs.claudeProfile!, dirs.work!, t.dir).ok).toBe(true);
  });
});

describe('E-21 probe-boundary agy (cli_permission_deny, fake CLI)', () => {
  it('passes when settings.json has all 5 deny rules and both bait probes fail permission check without leaking', async () => {
    const { t, dirs } = makeDirs();
    const baseOpts = {
      entrypoint: process.execPath,
      argvPrefix: [FAKE_SCRIPT],
      profileDir: dirs.agyProfile!,
      workspace: dirs.work!,
      roots: { repo: resolve('.'), data: dirs.data! },
      parentEnv: { SystemRoot: process.env.SystemRoot ?? 'C:\\Windows' },
      configAncestorStop: t.dir,
      now: () => NOW,
    };

    // 1. Missing settings.json -> FAIL and does NOT auto-create settings.json
    const missingReport = await probeAgyBoundary({ ...baseOpts, reportPath: join(t.dir, 'agy-missing.json') });
    expect(missingReport.verdict).toBe('FAIL');
    expect(missingReport.config_inspection.settings_status).toBe('missing');
    expect(existsSync(join(dirs.agyProfile!, '.gemini', 'antigravity-cli', 'settings.json'))).toBe(false);

    // 2. Missing one deny rule (e.g. mcp(*) missing) -> FAIL and does NOT overwrite user settings.json
    const partialSettings = { permissions: { deny: ['command(*)', 'read_file(*)', 'write_file(*)', 'read_url(*)'] } };
    writeAgySettings(dirs.agyProfile!, partialSettings);
    const denyMissingReport = await probeAgyBoundary({ ...baseOpts, reportPath: join(t.dir, 'agy-deny-missing.json') });
    expect(denyMissingReport.verdict).toBe('FAIL');
    expect(denyMissingReport.config_inspection.missing_deny_rules).toEqual(['mcp(*)']);
    expect(JSON.parse(readFileSync(join(dirs.agyProfile!, '.gemini', 'antigravity-cli', 'settings.json'), 'utf8'))).toEqual(partialSettings);

    // 3. All 5 deny rules present, but agy leaks bait -> FAIL
    writeAgySettings(dirs.agyProfile!);
    writeFileSync(join(dirs.agyProfile!, 'fake-mode.txt'), 'leaky');
    const leakyReport = await probeAgyBoundary({ ...baseOpts, reportPath: join(t.dir, 'agy-leaky.json') });
    expect(leakyReport.verdict).toBe('FAIL');
    expect(leakyReport.cases.every((c) => c.leaked && !c.passed)).toBe(true);
    expect(leakyReport.file_scope_test).toBeNull();
    expect(readdirSync(dirs.work!)).toEqual([]); // bait cleaned up

    // 4. All 5 deny rules present and agy denies read_file without leaking -> PASS
    writeFileSync(join(dirs.agyProfile!, 'fake-mode.txt'), 'contained');
    const passPath = join(t.dir, 'agy-pass.json');
    const passReport = await probeAgyBoundary({ ...baseOpts, reportPath: passPath });
    expect(passReport.verdict).toBe('PASS');
    expect(passReport.cases.map((c) => [c.id, c.leaked, c.permission_denied_seen, c.passed])).toEqual([
      ['inside_cwd', false, true, true],
      ['outside_cwd', false, true, true],
    ]);
    expect(passReport.file_scope_test).toEqual({
      passed: true,
      cases: ['absolute_path', 'dotdot', 'symlink_junction'],
      run_at: NOW.toISOString(),
      method: 'cli_permission_deny',
      enforcement_evidence_ref: resolve(passPath),
      config_cases: ['inherited_config', 'plugins_hooks'],
      config_method: 'config_inspection',
    });
    expect(readdirSync(dirs.work!)).toEqual([]);

    // 5. Gateway boundaryReportIssues checks argv, settings and cases
    const ev = baseEvidence('agy', 'cli_permission_deny', passPath, AGY_CANDIDATE_ARGV, 'USERPROFILE', AGY_DEFAULT_MODEL);
    expect(boundaryReportIssues(passPath, { evidence: ev, runnerDir: dirs.agyProfile!, workspace: dirs.work! })).toEqual([]);
    expect(boundaryReportIssues(passPath, { evidence: { ...ev, argv: ['-p', '--output-format', 'stream-json'] }, runnerDir: dirs.agyProfile!, workspace: dirs.work! }))
      .toEqual(['ARGV_MISMATCH', 'ARGV_INVALID']);
    expect(agyArgvIssues(AGY_CANDIDATE_ARGV)).toEqual([]);
    expect(inspectAgyConfig(dirs.agyProfile!, dirs.work!, t.dir).ok).toBe(true);
  });
});

describe('E-21 verify claude|agy and envelope/adapter integration', () => {
  it('verifies claude-code and agy without self-certifying VERIFIED, and stops early on quota/login failures', async () => {
    const { t, dirs } = makeDirs();
    writeAgySettings(dirs.agyProfile!);

    const listFakeTree = (profDir: string) => () => {
      const file = join(profDir, 'synthetic-child.json');
      if (!existsSync(file)) return [];
      const child = JSON.parse(readFileSync(file, 'utf8')) as { pid: number; ppid: number };
      return [child, { pid: child.ppid, ppid: 0 }].filter((r) => {
        try { process.kill(r.pid, 0); return true; } catch { return false; }
      });
    };

    // Claude verify
    writeFileSync(join(dirs.claudeProfile!, 'fake-mode.txt'), 'contained');
    const claudeRep = await verifyClaudeOrAgy({
      provider: 'claude-code',
      entrypoint: process.execPath,
      argvPrefix: [FAKE_SCRIPT],
      profileId: 'claude-main',
      profileDir: dirs.claudeProfile!,
      roots: { repo: resolve('.'), data: dirs.data! },
      scratchParent: join(t.dir, 'scratch'),
      parentEnv: { SystemRoot: process.env.SystemRoot ?? 'C:\\Windows', ANTHROPIC_API_KEY: 'sk-ant-should-be-stripped' },
      now: () => NOW,
      timeouts: { probeMs: 15_000, runMs: 15_000, longTaskMs: 2_500 },
      listProcesses: listFakeTree(dirs.claudeProfile!),
    });
    expect(claudeRep.aborted).toBeNull();
    expect(claudeRep.observations).toMatchObject({
      login_method: 'claude.ai',
      subscription_type: 'pro',
      overage_status: 'rejected',
      overage_disabled_reason: 'org_level_disabled',
      synthetic_run: { inner_json_ok: true, format: 'jsonl_last_object' },
    });
    expect(claudeRep.observations.process_control.every((c) => c.passed)).toBe(true);
    expect(claudeRep.evidence!.output_contract.envelope_verified).toBe(false);
    expect(claudeRep.evidence!.extra_usage.disabled_confirmed).toBe(false);
    expect(claudeRep.evidence!.entitlement.applies_to_cli).toBe(false);
    expect(claudeRep.envelope!.status).toBe('NEEDS_VERIFICATION');

    // Claude quota early abort
    writeFileSync(join(dirs.claudeProfile!, 'fake-mode.txt'), 'quota');
    const claudeQuota = await verifyClaudeOrAgy({
      provider: 'claude-code',
      entrypoint: process.execPath,
      argvPrefix: [FAKE_SCRIPT],
      profileId: 'claude-main',
      profileDir: dirs.claudeProfile!,
      roots: { repo: resolve('.'), data: dirs.data! },
      scratchParent: join(t.dir, 'scratch'),
      parentEnv: { SystemRoot: process.env.SystemRoot ?? 'C:\\Windows' },
      now: () => NOW,
    });
    expect(claudeQuota.aborted).toMatch(/^QUOTA_OR_RATE_LIMIT:/);

    // Claude API key login rejected before synthetic prompt
    writeFileSync(join(dirs.claudeProfile!, 'fake-mode.txt'), 'apikey');
    const claudeApi = await verifyClaudeOrAgy({
      provider: 'claude-code',
      entrypoint: process.execPath,
      argvPrefix: [FAKE_SCRIPT],
      profileId: 'claude-main',
      profileDir: dirs.claudeProfile!,
      roots: { repo: resolve('.'), data: dirs.data! },
      scratchParent: join(t.dir, 'scratch'),
      parentEnv: { SystemRoot: process.env.SystemRoot ?? 'C:\\Windows' },
      now: () => NOW,
    });
    expect(claudeApi.aborted).toBe('LOGIN_NOT_CLAUDE_AI:api_key');

    // agy verify
    writeFileSync(join(dirs.agyProfile!, 'fake-mode.txt'), 'contained');
    const agyRep = await verifyClaudeOrAgy({
      provider: 'agy',
      entrypoint: process.execPath,
      argvPrefix: [FAKE_SCRIPT],
      profileId: 'agy-main',
      profileDir: dirs.agyProfile!,
      roots: { repo: resolve('.'), data: dirs.data! },
      scratchParent: join(t.dir, 'scratch'),
      parentEnv: { SystemRoot: process.env.SystemRoot ?? 'C:\\Windows' },
      now: () => NOW,
      timeouts: { probeMs: 15_000, runMs: 15_000, longTaskMs: 2_500 },
      listProcesses: listFakeTree(dirs.agyProfile!),
    });
    expect(agyRep.aborted).toBeNull();
    expect(agyRep.observations.login_method).toBe('google_models_listed');
    expect(agyRep.observations.synthetic_run?.inner_json_ok).toBe(true);
    expect(agyRep.observations.process_control.every((c) => c.passed)).toBe(true);
    expect(agyRep.evidence!.isolation.mechanism).toBe('USERPROFILE');
    expect(agyRep.envelope).toMatchObject({
      status: 'NEEDS_VERIFICATION',
      format: 'jsonl_last_object',
      line_select: { path: ['event'], equals: 'result' },
      result_path: ['result', 'response'],
      error_flag_path: ['result', 'status'],
      error_flag_not_equals: 'SUCCESS',
    });

    // agy quota early abort
    writeFileSync(join(dirs.agyProfile!, 'fake-mode.txt'), 'quota');
    const agyQuota = await verifyClaudeOrAgy({
      provider: 'agy',
      entrypoint: process.execPath,
      argvPrefix: [FAKE_SCRIPT],
      profileId: 'agy-main',
      profileDir: dirs.agyProfile!,
      roots: { repo: resolve('.'), data: dirs.data! },
      scratchParent: join(t.dir, 'scratch'),
      parentEnv: { SystemRoot: process.env.SystemRoot ?? 'C:\\Windows' },
      now: () => NOW,
    });
    expect(agyQuota.aborted).toMatch(/^QUOTA_OR_RATE_LIMIT:/);
  }, 90_000);

  it('parses claude and agy stream-json envelopes and executes through the gateway with matching probe reports', async () => {
    f = await fixture();
    const fx = f;
    const { t, dirs } = makeDirs();
    writeAgySettings(dirs.agyProfile!);
    writeFileSync(join(dirs.claudeProfile!, 'fake-mode.txt'), 'contained');
    writeFileSync(join(dirs.agyProfile!, 'fake-mode.txt'), 'contained');

    const claudeArgv = [FAKE_SCRIPT, ...CLAUDE_CANDIDATE_ARGV];
    const agyArgv = [FAKE_SCRIPT, ...AGY_CANDIDATE_ARGV];

    const claudeProbe = await probeClaudeBoundary({
      entrypoint: process.execPath,
      argvPrefix: [FAKE_SCRIPT],
      profileDir: dirs.claudeProfile!,
      workspace: dirs.work!,
      roots: { repo: resolve('.'), data: fx.root },
      parentEnv: { SystemRoot: process.env.SystemRoot ?? 'C:\\Windows' },
      configAncestorStop: t.dir,
      gatewayArgv: claudeArgv,
      reportPath: join(t.dir, 'probe-claude.json'),
      now: () => NOW,
    });
    const agyProbe = await probeAgyBoundary({
      entrypoint: process.execPath,
      argvPrefix: [FAKE_SCRIPT],
      profileDir: dirs.agyProfile!,
      workspace: dirs.work!,
      roots: { repo: resolve('.'), data: fx.root },
      parentEnv: { SystemRoot: process.env.SystemRoot ?? 'C:\\Windows' },
      configAncestorStop: t.dir,
      gatewayArgv: agyArgv,
      reportPath: join(t.dir, 'probe-agy.json'),
      now: () => NOW,
    });
    expect(claudeProbe.verdict).toBe('PASS');
    expect(agyProbe.verdict).toBe('PASS');

    fx.store.aiAccounts.upsertAccount({ profile_id: 'claude-main', provider: 'claude-code', label: 'Claude', runner_ref: dirs.claudeProfile!, state: 'READY' });
    fx.store.aiAccounts.upsertAccount({ profile_id: 'agy-main', provider: 'agy', label: 'Antigravity', runner_ref: dirs.agyProfile!, state: 'READY' });

    const claudeEnvSpec: EnvelopeSpec = { ...CLI_DESCRIPTORS['claude-code'].candidate_envelope, status: 'VERIFIED', error_patterns: [{ pattern: 'usage limit', error: 'QUOTA_EXHAUSTED' }] };
    const agyEnvSpec: EnvelopeSpec = { ...CLI_DESCRIPTORS.agy.candidate_envelope, status: 'VERIFIED', error_patterns: [{ pattern: 'usage limit|429', error: 'QUOTA_EXHAUSTED' }] };

    const claudeEv: ProviderEvidence = {
      ...baseEvidence('claude-code', 'cli_tools_disabled', claudeProbe.report_path, claudeArgv, 'CLAUDE_CONFIG_DIR', CLAUDE_DEFAULT_MODEL),
      cli_version: claudeProbe.claude.version,
      auth: { mode: 'subscription_login', observed: 'claude.ai', checked_at: NOW.toISOString(), probe_argv: [FAKE_SCRIPT, 'auth', 'status'], expect_pattern: '"authMethod"\\s*:\\s*"claude\\.ai"' },
      entitlement: { plan: 'pro', applies_to_cli: true, source: 'synthetic', checked_at: NOW.toISOString(), expect_pattern: '"loggedIn"\\s*:\\s*true' },
    };
    const agyEv: ProviderEvidence = {
      ...baseEvidence('agy', 'cli_permission_deny', agyProbe.report_path, agyArgv, 'USERPROFILE', AGY_DEFAULT_MODEL),
      cli_version: agyProbe.agy.version,
      auth: { mode: 'subscription_login', observed: 'models', checked_at: NOW.toISOString(), probe_argv: [FAKE_SCRIPT, 'models'], expect_pattern: 'gemini' },
      entitlement: { plan: 'Google AI Ultra', applies_to_cli: true, source: 'synthetic', checked_at: NOW.toISOString(), expect_pattern: 'gemini' },
    };

    fx.store.aiAccounts.recordEvidence(claudeEv, claudeEnvSpec);
    fx.store.aiAccounts.recordEvidence(agyEv, agyEnvSpec);
    fx.store.aiAccounts.grantUserApprovedDataClasses('claude-code');
    fx.store.aiAccounts.grantUserApprovedDataClasses('agy');

    expect(profileEnvFor('claude-code', dirs.claudeProfile!)).toEqual({ CLAUDE_CONFIG_DIR: dirs.claudeProfile! });
    expect(profileEnvFor('agy', dirs.agyProfile!)).toEqual({ USERPROFILE: dirs.agyProfile!, HOME: dirs.agyProfile! });
    // Format observed on agy 1.4.3 (21/10/2026); the earlier {type:"user",…} shape was rejected with 'missing the "event" field'.
    expect(JSON.parse(formatAgyStreamInput('hello'))).toEqual({ event: 'user', message: { content: 'hello' } });

    // Check boundary report validation directly (as defaultObserve calls it) and execute through adapters
    expect(boundaryReportIssues(claudeProbe.report_path, { evidence: claudeEv, runnerDir: dirs.claudeProfile!, workspace: dirs.work! })).toEqual([]);
    expect(boundaryReportIssues(agyProbe.report_path, { evidence: agyEv, runnerDir: dirs.agyProfile!, workspace: dirs.work! })).toEqual([]);

    const gw = new AiExecutionGateway({
      evidence: (p) => fx.store.aiAccounts.latestEvidence(p),
      account: (p) => fx.store.aiAccounts.account(p),
      consents: (p) => fx.store.aiAccounts.consents(p),
      observe: async (p, e, runnerDir) => ({
        cli_version: e?.cli_version ?? null,
        entrypoint_sha256: nodeSha,
        entrypoint_issues: [],
        auth_subscription: true,
        entitlement_verified: true,
        isolation_issues: [],
        enforcement_issues: e ? boundaryReportIssues(e.isolation.file_scope_test.enforcement_evidence_ref!, { evidence: e, runnerDir, workspace: dirs.work! }) : null,
      }),
      parentEnv: { SystemRoot: process.env.SystemRoot ?? 'C:\\Windows' },
      roots: { repo: resolve('.'), data: fx.root, sandboxRoot: dirs.work! },
      now: () => NOW,
    });

    for (const provider of ['claude-code', 'agy'] as const) {
      const dec = await gw.decide(provider, { billing_policy: 'subscription_only', required_capabilities: ['text', 'structured_result'], data_classes: ['synthetic_fixture'] });
      expect(dec.decision).toEqual({ allowed: true });
      const adapter = new CliProviderAdapter(CLI_DESCRIPTORS[provider]);
      adapter.authorize('run-1', dec.permit!);
      const raw = await adapter.execute('run-1', { job_id: 'j1', context_manifest_id: 'm1', billing_policy: 'subscription_only', required_capabilities: ['text'], task_type: 'writing.assess' }, { manifest_id: 'm1', payload: {} });
      const norm = adapter.normalizeResult(raw, 'writing.assess');
      expect(norm).toMatchObject({ ok: true, result: { job_id: 'j1', context_manifest_id: 'm1' } });
    }

    // Error envelope parsing for agy status !== SUCCESS
    const errStream = JSON.stringify({ event: 'result', result: { status: 'ERROR', error: 'usage limit reached (429)' } });
    expect(parseEnvelope(errStream, 1, agyEnvSpec, 'writing.assess')).toMatchObject({ ok: false, error: 'QUOTA_EXHAUSTED' });
    expect(classifyClaudeLogin('{"loggedIn":true,"authMethod":"claude.ai","subscriptionType":"pro"}')).toEqual({ method: 'claude.ai', subscriptionType: 'pro' });
    expect(claudeLimitMessage(JSON.stringify({ type: 'rate_limit_event', rate_limit_info: { status: 'rejected', rateLimitType: 'five_hour' } }))).toContain('usage limit');
    expect(agyLimitMessage(JSON.stringify({ event: 'error', error: { message: 'RESOURCE_EXHAUSTED: 429' } }))).toContain('429');
  });
});
