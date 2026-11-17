// E-23: Runtime self-check on every run, non-blocking CLI version/hash updates, and per-version model canary.
// Only node.exe + synthetic fixture scripts (fake-codex.mjs, fake-e21-cli.mjs) are spawned; no real CLI or network.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { EXTRA_USAGE_RECONFIRM_MS, type CliProvider, type ProviderEvidence } from '../../src/application/ai/subscription-guard.js';
import { submitForAssessment } from '../../src/application/learning/submit-for-assessment.js';
import {
  AGY_CANDIDATE_ARGV,
  AGY_DEFAULT_MODEL,
  CLAUDE_CANDIDATE_ARGV,
  CLAUDE_DEFAULT_MODEL,
  CLI_DESCRIPTORS,
  CODEX_CANDIDATE_ARGV,
  CODEX_DEFAULT_MODEL,
} from '../../src/infrastructure/ai/gateway/cli-adapters.js';
import { gatewayFor } from '../../src/infrastructure/ai/gateway/compose.js';
import type { EnvelopeSpec } from '../../src/infrastructure/ai/gateway/envelope.js';
import { verifyEntrypoint } from '../../src/infrastructure/ai/gateway/entrypoint.js';
import { AiExecutionGateway, GatewayAdapter } from '../../src/infrastructure/ai/gateway/gateway.js';
import {
  AGY_REQUIRED_DENY_RULES,
  probeAgyBoundary,
  probeClaudeBoundary,
} from '../../src/infrastructure/ai/gateway/probe-boundary.js';
import { processNextJob } from '../../src/worker/worker.js';
import { assessInput, fixture, tempDir, type Fixture } from './p1-helpers.js';

let f: Fixture | undefined;
const cleanups: (() => void)[] = [];
afterEach(() => { f?.cleanup(); f = undefined; cleanups.splice(0).forEach((c) => c()); });

const nodeSha = createHash('sha256').update(readFileSync(process.execPath)).digest('hex');
const FAKE_E21 = resolve('tests/fixtures/fake-e21-cli.mjs');
const FAKE_CODEX = resolve('tests/fixtures/fake-codex.mjs');

function writeAgySettings(profileDir: string, content: unknown = { permissions: { deny: [...AGY_REQUIRED_DENY_RULES] } }) {
  const dir = join(profileDir, '.gemini', 'antigravity-cli');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'settings.json'), JSON.stringify(content, null, 2));
}

function readCalls(profileDir: string): { model: string; long: boolean }[] {
  const file = join(profileDir, 'calls.jsonl');
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as { model: string; long: boolean });
}

async function setupVerifiedStore() {
  f = await fixture();
  const fx = f;
  const t = tempDir('e23-');
  cleanups.push(t.cleanup);
  const dirs = Object.fromEntries(['work', 'codexHome', 'claudeProfile', 'agyProfile', 'userProfile', 'localAppData'].map((k) => {
    const d = join(t.dir, k);
    mkdirSync(d, { recursive: true });
    return [k, d];
  })) as Record<string, string>;

  writeAgySettings(dirs.agyProfile!);
  writeFileSync(join(dirs.codexHome!, 'fake-mode.txt'), 'contained');
  writeFileSync(join(dirs.claudeProfile!, 'fake-mode.txt'), 'contained');
  writeFileSync(join(dirs.agyProfile!, 'fake-mode.txt'), 'contained');

  const codexArgv = [FAKE_CODEX, ...CODEX_CANDIDATE_ARGV.slice(0, -1), '-m', CODEX_DEFAULT_MODEL, '-'];
  const claudeArgv = [FAKE_E21, ...CLAUDE_CANDIDATE_ARGV];
  const agyArgv = [FAKE_E21, ...AGY_CANDIDATE_ARGV];

  const codexReportPath = resolve(join(t.dir, 'probe-codex.json'));
  const codexVersion = 'codex-cli 0.0.0-synthetic';
  writeFileSync(codexReportPath, JSON.stringify({
    kind: 'study-english/probe-boundary/codex',
    schema_version: '2',
    verdict: 'PASS',
    report_path: codexReportPath,
    codex: { sha256: nodeSha, version: codexVersion },
    config: {
      codex_home: resolve(dirs.codexHome!),
      workspace: resolve(dirs.work!),
      gateway_argv: codexArgv,
      sandbox_mode: 'read-only',
      config_overrides: ['windows.sandbox="elevated"'],
      disabled_features: CODEX_CANDIDATE_ARGV.filter((_, i, a) => a[i - 1] === '--disable'),
    },
    cases: [
      { id: 'workspace_control', expected: 'read', outcome: 'READ', passed: true },
      { id: 'local_app_data', expected: 'blocked', outcome: 'BLOCKED', passed: true },
    ],
    file_scope_test: {
      passed: true,
      cases: ['absolute_path', 'dotdot', 'symlink_junction'],
      run_at: fx.store.now().toISOString(),
      method: 'enforced_boundary',
      enforcement_evidence_ref: codexReportPath,
      config_cases: ['inherited_config', 'plugins_hooks'],
      config_method: 'config_inspection',
    },
    tools: { ok: true, argv_issues: [], not_effective: [] },
    config_inspection: { ok: true, findings: [] },
  }, null, 2));
  const codexProbe = { codex: { version: codexVersion }, report_path: codexReportPath };

  const claudeProbe = await probeClaudeBoundary({
    entrypoint: process.execPath,
    argvPrefix: [FAKE_E21],
    profileDir: dirs.claudeProfile!,
    workspace: dirs.work!,
    roots: { repo: resolve('.'), data: fx.root },
    parentEnv: { SystemRoot: process.env.SystemRoot ?? 'C:\\Windows' },
    configAncestorStop: t.dir,
    gatewayArgv: claudeArgv,
    reportPath: join(t.dir, 'probe-claude.json'),
    now: fx.store.now,
  });
  const agyProbe = await probeAgyBoundary({
    entrypoint: process.execPath,
    argvPrefix: [FAKE_E21],
    profileDir: dirs.agyProfile!,
    workspace: dirs.work!,
    roots: { repo: resolve('.'), data: fx.root },
    parentEnv: { SystemRoot: process.env.SystemRoot ?? 'C:\\Windows' },
    configAncestorStop: t.dir,
    gatewayArgv: agyArgv,
    reportPath: join(t.dir, 'probe-agy.json'),
    now: fx.store.now,
  });

  fx.store.aiAccounts.upsertAccount({ profile_id: 'codex-main', provider: 'codex', label: 'Codex', runner_ref: dirs.codexHome!, state: 'READY' });
  fx.store.aiAccounts.upsertAccount({ profile_id: 'claude-main', provider: 'claude-code', label: 'Claude', runner_ref: dirs.claudeProfile!, state: 'READY' });
  fx.store.aiAccounts.upsertAccount({ profile_id: 'agy-main', provider: 'agy', label: 'Antigravity', runner_ref: dirs.agyProfile!, state: 'READY' });

  const makeEv = (provider: CliProvider, version: string, argv: string[], mechanism: string, model: string, reportPath: string, probeArgv: string[], expectPattern: string): ProviderEvidence => ({
    provider,
    profile_id: `${provider === 'claude-code' ? 'claude' : provider}-main`,
    cli_version: version,
    entrypoint: { path: process.execPath, sha256: nodeSha, kind: 'native_executable' },
    argv,
    auth: { mode: 'subscription_login', observed: 'synthetic', checked_at: fx.store.now().toISOString(), probe_argv: probeArgv, expect_pattern: expectPattern },
    entitlement: { plan: 'synthetic', applies_to_cli: true, source: 'synthetic', checked_at: fx.store.now().toISOString(), expect_pattern: expectPattern },
    extra_usage: { disabled_confirmed: true, confirmed_at: fx.store.now().toISOString(), next_confirmation_due: '' },
    models_allowed: [model],
    model_configurations: [{ model, effort: provider === 'agy' ? null : 'medium' }],
    isolation: {
      mechanism,
      plugins_disabled: true,
      file_scope_test: {
        passed: true,
        cases: ['absolute_path', 'dotdot', 'symlink_junction'],
        run_at: fx.store.now().toISOString(),
        method: provider === 'codex' ? 'enforced_boundary' : provider === 'claude-code' ? 'cli_tools_disabled' : 'cli_permission_deny',
        enforcement_evidence_ref: reportPath,
        config_cases: ['inherited_config', 'plugins_hooks'],
        config_method: 'config_inspection',
      },
    },
    process_control: { timeout_cancel_test_passed: true, run_at: fx.store.now().toISOString() },
    output_contract: { envelope_verified: true, test_passed: true, run_at: fx.store.now().toISOString() },
    capabilities: ['text', 'structured_result'],
  });

  const codexEnv: EnvelopeSpec = { ...CLI_DESCRIPTORS.codex.candidate_envelope, status: 'VERIFIED', error_patterns: [{ pattern: 'quota exhausted', error: 'QUOTA_EXHAUSTED' }] };
  const claudeEnv: EnvelopeSpec = { ...CLI_DESCRIPTORS['claude-code'].candidate_envelope, status: 'VERIFIED', error_patterns: [{ pattern: 'usage limit', error: 'QUOTA_EXHAUSTED' }] };
  const agyEnv: EnvelopeSpec = { ...CLI_DESCRIPTORS.agy.candidate_envelope, status: 'VERIFIED', error_patterns: [{ pattern: 'usage limit|quota exhausted|429', error: 'QUOTA_EXHAUSTED' }] };

  fx.store.aiAccounts.recordEvidence(
    makeEv('codex', codexProbe.codex.version, codexArgv, 'CODEX_HOME', CODEX_DEFAULT_MODEL, codexProbe.report_path, [FAKE_CODEX, 'login', 'status'], 'Logged in using ChatGPT'),
    codexEnv,
  );
  fx.store.aiAccounts.recordEvidence(
    makeEv('claude-code', claudeProbe.claude.version, claudeArgv, 'CLAUDE_CONFIG_DIR', CLAUDE_DEFAULT_MODEL, claudeProbe.report_path, [FAKE_E21, 'auth', 'status'], '"authMethod"\\s*:\\s*"claude\\.ai"'),
    claudeEnv,
  );
  fx.store.aiAccounts.recordEvidence(
    makeEv('agy', agyProbe.agy.version, agyArgv, 'USERPROFILE', AGY_DEFAULT_MODEL, agyProbe.report_path, [FAKE_E21, 'models'], 'gemini'),
    agyEnv,
  );

  for (const p of ['codex', 'claude-code', 'agy'] as const) {
    fx.store.aiAccounts.confirmExtraUsageOff(p, 'synthetic E-23 confirmation');
    fx.store.aiAccounts.grantUserApprovedDataClasses(p);
  }

  const makeGateway = (parentEnv: NodeJS.ProcessEnv = { SystemRoot: process.env.SystemRoot ?? 'C:\\Windows' }) =>
    new AiExecutionGateway({
      backupAllowed: (p, permit) => fx.store.aiAccounts.canEnableBackupProvider(p, { cli_version: permit.cli_version, model: permit.model }),
      runtimeFailure: (p, error) => fx.store.aiAccounts.recordRuntimeFailure(p, error, 'provider runtime failure'),
      modelPreference: (p) => fx.store.aiAccounts.modelPreference(p),
      allowedModels: (p) => fx.store.aiAccounts.allowedModels(p),
      modelCanary: (p, v, m, e) => fx.store.aiAccounts.modelCanary(p, v, m, e),
      recordModelCanary: (input) => { fx.store.aiAccounts.recordModelCanary(input); },
      runtimeBlock: (p) => fx.store.aiAccounts.activeRuntimeBlock(p),
      recordRuntimeBlock: (p, reason, detail) => fx.store.aiAccounts.recordRuntimeBoundaryBlock(p, reason, detail),
      sandboxGrant: () => {},
      evidence: (p) => fx.store.aiAccounts.latestEvidence(p),
      account: (p) => fx.store.aiAccounts.account(p),
      consents: (p) => fx.store.aiAccounts.consents(p),
      extraUsageConfirmedAt: (p) => fx.store.aiAccounts.latestExtraUsageConfirmation(p),
      parentEnv,
      roots: { repo: resolve('.'), data: fx.root, sandboxRoot: dirs.work! },
      now: fx.store.now,
    });

  return { fx, t, dirs, makeGateway };
}

describe('E-23 (1) & (4): CLI version/hash updates do not block and user confirmations persist', () => {
  it('stays READY when CLI version or entrypoint SHA-256 changes, and surfaces informational drift in status()', async () => {
    const { fx, dirs, makeGateway } = await setupVerifiedStore();
    // Simulate CLI auto-update (e.g. agy 1.4.2 -> 1.4.4, claude 2.1.288 -> 2.1.290, codex 0.0.0 -> 0.1.0)
    writeFileSync(join(dirs.agyProfile!, 'fake-version.txt'), 'agy 1.4.4-synthetic');
    writeFileSync(join(dirs.claudeProfile!, 'fake-version.txt'), '2.1.290 (Claude Code synthetic)');
    writeFileSync(join(dirs.codexHome!, 'fake-version.txt'), 'codex-cli 0.1.0-synthetic');

    // Also simulate a different recorded SHA-256 in evidence for agy
    const agyRec = fx.store.aiAccounts.latestEvidence('agy')!;
    fx.store.aiAccounts.recordEvidence(
      { ...agyRec.evidence, entrypoint: { ...agyRec.evidence.entrypoint, sha256: 'a'.repeat(64) } },
      agyRec.envelope,
    );

    const gw = makeGateway();
    const statuses = await gw.status();
    for (const s of statuses) {
      expect(s.ready, `${s.provider}: ${s.reasons.join(',')}`).toBe(true);
      expect(s.version_changed).toBe(true);
      expect(s.notes.some((n) => n.includes('INFO: CLI version changed since D-01 verification'))).toBe(true);
    }
    const agyStatus = statuses.find((s) => s.provider === 'agy')!;
    expect(agyStatus.verified_cli_version).toBe('agy 1.4.2-synthetic');
    expect(agyStatus.observed_cli_version).toBe('agy 1.4.4-synthetic');
    expect(agyStatus.entrypoint_hash_changed).toBe(true);
    expect(agyStatus.notes.some((n) => n.includes('INFO: entrypoint sha256 changed'))).toBe(true);

    // User confirmations (consents, extra usage, allowed models) remain intact across CLI version update
    const learnerDecision = await gw.decide('agy', {
      billing_policy: 'subscription_only',
      required_capabilities: ['text', 'structured_result'],
      data_classes: ['learner_submission', 'learner_profile', 'answer_key'],
    });
    expect(learnerDecision.decision).toEqual({ allowed: true });
    expect(learnerDecision.permit?.cli_version).toBe('agy 1.4.4-synthetic');

    // Native executable check still rejects shims and wrong provider binaries
    expect(verifyEntrypoint(process.execPath, { forbiddenRoots: [], provider: 'agy' }).ok).toBe(true);
    const fakeWrongExe = join(dirs.agyProfile!, 'claude.exe');
    writeFileSync(fakeWrongExe, 'MZ');
    expect(verifyEntrypoint(fakeWrongExe, { forbiddenRoots: [], provider: 'agy' }).issues).toContain('PROVIDER_MISMATCH');
  }, 45_000);
});

describe('E-23 (2): Runtime self-check per run for claude-code, agy, and codex', () => {
  it('claude-code: rejects output, commits no observation, and transitions provider to blocked (RUNTIME_TOOLS_PRESENT) when init has tools or mcp_servers', async () => {
    const { fx, dirs, makeGateway } = await setupVerifiedStore();
    const gw = makeGateway();

    // Flip live claude-code stream to emit non-empty tools in system/init after verification
    writeFileSync(join(dirs.claudeProfile!, 'fake-mode.txt'), 'tools-nonempty');

    const attempt = fx.store.learning.createAttempt({
      request_key: 'e23-claude-tools',
      scope: 'learner',
      item: { id: fx.item.id, version: 'v1' },
      rubric: { id: fx.rubric.id, version: 'v1' },
      mode: 'self_practice',
      purpose: 'practice',
    });
    const { job } = submitForAssessment(fx.store, assessInput(fx, attempt.attempt_id, 'sub-claude-tools'));
    const adapter = new GatewayAdapter(gw, () => ({
      eligible: ['claude-code'],
      job: { billing_policy: 'subscription_only', required_capabilities: ['text', 'structured_result'], data_classes: ['learner_submission'] },
    }));

    const out = await processNextJob({
      queue: fx.store.queue,
      adapter,
      loadContext: (id) => fx.store.learning.loadManifestPayload(id),
      interpret: () => [{ observation_key: 'obs1', competency_id: 'c1', processing: 'processed', outcome: 'met', measurement_quality: 'sufficient', opportunity: 'observed', support_impact: 'no_related_effect_detected' }],
      owner: 'w-e23',
      leaseMs: 60_000,
      heartbeatMs: 10_000,
      provider: 'claude-code',
    });

    expect(out).toMatchObject({ status: 'STOPPED', detail: 'BILLING_UNVERIFIED -> FAILED' });
    expect(fx.store.queue.get(job.job_id)).toMatchObject({ state: 'FAILED' });
    expect(fx.store.db.prepare('SELECT COUNT(*) AS n FROM observations').get()).toEqual({ n: 0 });
    expect(fx.store.aiAccounts.account('claude-code')?.state).toBe('NEEDS_VERIFICATION');
    expect(fx.store.aiAccounts.activeRuntimeBlock('claude-code')?.reason).toBe('RUNTIME_TOOLS_PRESENT');

    // Subsequent decide() is blocked with RUNTIME_TOOLS_PRESENT
    const nextDec = await gw.decide('claude-code', {
      billing_policy: 'subscription_only',
      required_capabilities: ['text'],
      data_classes: ['synthetic_fixture'],
    });
    expect(nextDec.decision.allowed).toBe(false);
    if (!nextDec.decision.allowed) {
      expect(nextDec.decision.reasons).toContain('RUNTIME_TOOLS_PRESENT');
    }
  }, 45_000);

  it('agy: refuses to spawn when settings.json deny rules are modified (RUNTIME_DENY_RULES_CHANGED), and rejects result if a tool step executes (RUNTIME_TOOL_EXECUTED)', async () => {
    const { fx, dirs, makeGateway } = await setupVerifiedStore();
    const gw = makeGateway();

    // 1. Issue a permit while settings.json is valid, then tamper with settings.json right before execute()
    const dec = await gw.decide('agy', {
      billing_policy: 'subscription_only',
      required_capabilities: ['text', 'structured_result'],
      data_classes: ['synthetic_fixture'],
    });
    expect(dec.decision).toEqual({ allowed: true });

    // Tamper: remove mcp(*) from settings.json
    writeAgySettings(dirs.agyProfile!, { permissions: { deny: ['command(*)', 'read_file(*)', 'write_file(*)', 'read_url(*)'] } });
    const callsBefore = readCalls(dirs.agyProfile!).length;

    gw.adapters.agy.authorize('run-tampered', dec.permit!);
    const rawTampered = await gw.adapters.agy.execute(
      'run-tampered',
      { job_id: 'j1', context_manifest_id: 'm1', billing_policy: 'subscription_only', required_capabilities: ['text'], task_type: 'writing.assess' },
      { manifest_id: 'm1', payload: {} },
    );
    expect(rawTampered).toMatchObject({ error: 'BILLING_UNVERIFIED', reason: 'RUNTIME_DENY_RULES_CHANGED' });
    // agy was NOT spawned at all
    expect(readCalls(dirs.agyProfile!).length).toBe(callsBefore);
    expect(fx.store.aiAccounts.activeRuntimeBlock('agy')?.reason).toBe('RUNTIME_DENY_RULES_CHANGED');

    // Restore settings.json and re-record evidence to clear block, then test RUNTIME_TOOL_EXECUTED
    writeAgySettings(dirs.agyProfile!);
    const agyRec = fx.store.aiAccounts.latestEvidence('agy')!;
    fx.store.aiAccounts.recordEvidence(agyRec.evidence, agyRec.envelope);
    fx.store.aiAccounts.upsertAccount({ ...fx.store.aiAccounts.account('agy')!, provider: 'agy', state: 'READY' });

    const gw2 = makeGateway();
    writeFileSync(join(dirs.agyProfile!, 'fake-mode.txt'), 'tool-executed');
    const dec2 = await gw2.decide('agy', {
      billing_policy: 'subscription_only',
      required_capabilities: ['text', 'structured_result'],
      data_classes: ['synthetic_fixture'],
    });
    expect(dec2.decision).toEqual({ allowed: true });
    gw2.adapters.agy.authorize('run-tool-done', dec2.permit!);
    const rawToolDone = await gw2.adapters.agy.execute(
      'run-tool-done',
      { job_id: 'j2', context_manifest_id: 'm2', billing_policy: 'subscription_only', required_capabilities: ['text'], task_type: 'writing.assess' },
      { manifest_id: 'm2', payload: {} },
    );
    expect(rawToolDone).toMatchObject({ error: 'BILLING_UNVERIFIED', reason: 'RUNTIME_TOOL_EXECUTED' });
    expect(fx.store.aiAccounts.account('agy')?.state).toBe('NEEDS_VERIFICATION');
    expect(fx.store.aiAccounts.activeRuntimeBlock('agy')?.reason).toBe('RUNTIME_TOOL_EXECUTED');
  }, 45_000);

  it('codex: checks codex features list before runs (allows unified_exec when covered by probed ACL, blocks when another feature is re-enabled)', async () => {
    const { dirs, makeGateway } = await setupVerifiedStore();
    const gw = makeGateway();

    // 1. Normal contained mode -> allowed
    expect((await gw.decide('codex', { billing_policy: 'subscription_only', required_capabilities: ['text'], data_classes: ['synthetic_fixture'] })).decision)
      .toEqual({ allowed: true });

    // 2. unified_exec pinned on, but boundary report has local_app_data blocked -> still allowed (E-17)
    writeFileSync(join(dirs.codexHome!, 'fake-mode.txt'), 'contained-pinned');
    expect((await gw.decide('codex', { billing_policy: 'subscription_only', required_capabilities: ['text'], data_classes: ['synthetic_fixture'] })).decision)
      .toEqual({ allowed: true });

    // 3. Another feature (shell_tool) stays enabled under --disable -> blocked with RUNTIME_CODEX_FEATURES_CHANGED
    writeFileSync(join(dirs.codexHome!, 'fake-mode.txt'), 'feature-reenabled');
    const reenabled = await gw.decide('codex', { billing_policy: 'subscription_only', required_capabilities: ['text'], data_classes: ['synthetic_fixture'] });
    expect(reenabled.decision.allowed).toBe(false);
    if (!reenabled.decision.allowed) {
      expect(reenabled.decision.reasons).toContain('RUNTIME_CODEX_FEATURES_CHANGED');
    }
  }, 45_000);
});

describe('E-23 (3) & (5): Per-version model canary and hard billing guard', () => {
  it('declares allowed models without verify, runs 1 synthetic canary on first use per CLI version, caches passing canary, and blocks failing canary models', async () => {
    const { fx, dirs, makeGateway } = await setupVerifiedStore();

    // User declares allowed models for claude-code without running verify
    const allowed = fx.store.aiAccounts.setAllowedModels('claude-code', [CLAUDE_DEFAULT_MODEL, 'sonnet', 'invalid-model']);
    expect(allowed).toEqual([CLAUDE_DEFAULT_MODEL, 'sonnet', 'invalid-model']);

    // Simulate CLI version update to 2.1.290 so no model has a canary yet at 2.1.290
    writeFileSync(join(dirs.claudeProfile!, 'fake-version.txt'), '2.1.290 (Claude Code synthetic)');
    fx.store.aiAccounts.setModelPreference('claude-code', 'sonnet', 'high');

    const gw = makeGateway();
    const callsBefore = readCalls(dirs.claudeProfile!).length;

    // First execution of (claude-code, 2.1.290, sonnet, high): runs 1 canary + 1 real job = 2 CLI calls
    const dec1 = await gw.decide('claude-code', {
      billing_policy: 'subscription_only',
      required_capabilities: ['text', 'structured_result'],
      data_classes: ['synthetic_fixture'],
    });
    expect(dec1.decision).toEqual({ allowed: true });
    expect(dec1.permit?.model).toBe('sonnet');
    gw.adapters['claude-code'].authorize('run-sonnet-1', dec1.permit!);
    const raw1 = await gw.adapters['claude-code'].execute(
      'run-sonnet-1',
      { job_id: 'job-real-1', context_manifest_id: 'manifest-1', billing_policy: 'subscription_only', required_capabilities: ['text'], task_type: 'writing.assess' },
      { manifest_id: 'manifest-1', payload: {} },
    );
    expect(gw.adapters['claude-code'].normalizeResult(raw1, 'writing.assess')).toMatchObject({ ok: true, result: { job_id: 'job-real-1' } });
    expect(readCalls(dirs.claudeProfile!).length - callsBefore).toBe(2);
    expect(fx.store.aiAccounts.modelCanary('claude-code', '2.1.290 (Claude Code synthetic)', 'sonnet', 'high')).toMatchObject({
      passed: true,
      reason: null,
    });

    // Second execution of the same (claude-code, 2.1.290, sonnet, high): canary already passed -> only 1 CLI call
    const dec2 = await gw.decide('claude-code', {
      billing_policy: 'subscription_only',
      required_capabilities: ['text', 'structured_result'],
      data_classes: ['synthetic_fixture'],
    });
    gw.adapters['claude-code'].authorize('run-sonnet-2', dec2.permit!);
    const raw2 = await gw.adapters['claude-code'].execute(
      'run-sonnet-2',
      { job_id: 'job-real-2', context_manifest_id: 'manifest-2', billing_policy: 'subscription_only', required_capabilities: ['text'], task_type: 'writing.assess' },
      { manifest_id: 'manifest-2', payload: {} },
    );
    expect(gw.adapters['claude-code'].normalizeResult(raw2, 'writing.assess')).toMatchObject({ ok: true, result: { job_id: 'job-real-2' } });
    expect(readCalls(dirs.claudeProfile!).length - callsBefore).toBe(3);

    // Failing canary model ('invalid-model' returns '{}' which fails envelope/contract):
    const decBad = await gw.decide('claude-code', {
      model: 'invalid-model',
      effort: 'medium',
      billing_policy: 'subscription_only',
      required_capabilities: ['text', 'structured_result'],
      data_classes: ['synthetic_fixture'],
    });
    expect(decBad.decision).toEqual({ allowed: true });
    gw.adapters['claude-code'].authorize('run-bad-1', decBad.permit!);
    const rawBad = await gw.adapters['claude-code'].execute(
      'run-bad-1',
      { job_id: 'job-bad', context_manifest_id: 'manifest-bad', billing_policy: 'subscription_only', required_capabilities: ['text'], task_type: 'writing.assess' },
      { manifest_id: 'manifest-bad', payload: {} },
    );
    expect(rawBad).toMatchObject({ error: 'BILLING_UNVERIFIED', reason: 'MODEL_CANARY_FAILED' });
    expect(fx.store.aiAccounts.modelCanary('claude-code', '2.1.290 (Claude Code synthetic)', 'invalid-model', 'medium')).toMatchObject({
      passed: false,
      reason: 'INVALID_SCHEMA',
    });

    // Subsequent decide() for 'invalid-model' is immediately blocked with MODEL_CANARY_FAILED, while 'sonnet' remains usable!
    const decBadAgain = await gw.decide('claude-code', {
      model: 'invalid-model',
      effort: 'medium',
      billing_policy: 'subscription_only',
      required_capabilities: ['text'],
      data_classes: ['synthetic_fixture'],
    });
    expect(decBadAgain.decision).toEqual({
      allowed: false,
      error: 'MODEL_NOT_VERIFIED',
      reasons: ['MODEL_NOT_VERIFIED', 'MODEL_CANARY_FAILED', 'MODEL_CANARY_FAILED:INVALID_SCHEMA'],
    });
    expect((await gw.decide('claude-code', {
      model: 'sonnet',
      effort: 'high',
      billing_policy: 'subscription_only',
      required_capabilities: ['text'],
      data_classes: ['synthetic_fixture'],
    })).decision).toEqual({ allowed: true });
  }, 45_000);

  it('keeps hard billing guards intact (API key login, overdue extra usage, and gatewayFor composition)', async () => {
    const { fx, dirs, makeGateway } = await setupVerifiedStore();

    // 1. Switching login mode to API key blocks immediately
    writeFileSync(join(dirs.claudeProfile!, 'fake-mode.txt'), 'apikey');
    const apiDec = await makeGateway().decide('claude-code', {
      billing_policy: 'subscription_only',
      required_capabilities: ['text'],
      data_classes: ['synthetic_fixture'],
    });
    expect(apiDec.decision.allowed).toBe(false);
    if (!apiDec.decision.allowed) {
      expect(apiDec.decision.reasons).toContain('AUTH_NOT_SUBSCRIPTION_NOW');
    }

    // 2. Restore subscription login, advance clock past 30 days -> blocks with EXTRA_USAGE_CONFIRMATION_OVERDUE
    writeFileSync(join(dirs.claudeProfile!, 'fake-mode.txt'), 'contained');
    fx.clock.advance(EXTRA_USAGE_RECONFIRM_MS + 1000);
    const overdueDec = await makeGateway().decide('claude-code', {
      billing_policy: 'subscription_only',
      required_capabilities: ['text'],
      data_classes: ['synthetic_fixture'],
    });
    expect(overdueDec.decision.allowed).toBe(false);
    if (!overdueDec.decision.allowed) {
      expect(overdueDec.decision.reasons).toContain('EXTRA_USAGE_CONFIRMATION_OVERDUE');
    }
    // Reconfirming extra usage restores READY
    fx.store.aiAccounts.confirmExtraUsageOff('claude-code', 'reconfirmed');
    expect((await makeGateway().decide('claude-code', {
      billing_policy: 'subscription_only',
      required_capabilities: ['text'],
      data_classes: ['synthetic_fixture'],
    })).decision).toEqual({ allowed: true });
    expect(typeof gatewayFor(fx.store).status).toBe('function');
  }, 45_000);
});
