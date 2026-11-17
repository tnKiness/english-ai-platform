import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { tempDir, fixture } from './p1-helpers.js';
import { CLI_DESCRIPTORS, argvMatchesTemplate, buildModelArgv, isVerifiedModelConfiguration } from '../../src/infrastructure/ai/gateway/cli-adapters.js';
import { listProviderModels, verifyClaudeOrAgy, verifyCodex } from '../../src/infrastructure/ai/gateway/verify-codex.js';
import { boundaryReportIssues, sandboxConfigFromArgv } from '../../src/infrastructure/ai/gateway/probe-boundary.js';
import { AiExecutionGateway } from '../../src/infrastructure/ai/gateway/gateway.js';
import type { CliProvider, ProviderEvidence } from '../../src/application/ai/subscription-guard.js';

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
const providers: CliProvider[] = ['codex', 'claude-code', 'agy'];
function setup(provider: CliProvider) {
  const t = tempDir('e22-'); cleanups.push(t.cleanup);
  const profileDir = join(t.dir, 'profile'); mkdirSync(profileDir);
  const options = {
    entrypoint: process.execPath, profileId: 'synthetic', profileDir,
    argvPrefix: [resolve(`tests/fixtures/${provider === 'codex' ? 'fake-codex' : 'fake-e21-cli'}.mjs`)],
    roots: { repo: join(t.dir, 'synthetic-repo'), data: join(t.dir, 'data') },
    scratchParent: join(t.dir, 'scratch'), parentEnv: { SystemRoot: process.env.SystemRoot },
    timeouts: { probeMs: 10000, runMs: 10000, longTaskMs: 1500 },
    listProcesses: () => {
      const file = join(profileDir, 'synthetic-child.json');
      if (!existsSync(file)) return [];
      const c = JSON.parse(readFileSync(file, 'utf8')) as { pid: number; ppid: number };
      return [c, { pid: c.ppid, ppid: 0 }].filter((r) => { try { process.kill(r.pid, 0); return true; } catch { return false; } });
    },
  };
  return { options, calls: () => readFileSync(join(profileDir, 'calls.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { model: string; long: boolean }) };
}

it.each(providers)('%s verifies each model, persists only successes, timeout/cancel once', async (provider) => {
  const { options, calls } = setup(provider);
  const models = ['first-model', 'invalid-model', 'second-model'];
  const r = provider === 'codex' ? await verifyCodex({ ...options, models, grant: () => {} })
    : await verifyClaudeOrAgy({ ...options, provider, models });
  expect(r.aborted).toBeNull();
  expect(r.evidence?.models_allowed).toEqual(['first-model', 'second-model']);
  expect(r.observations.models_unverified).toEqual(['invalid-model']);
  expect(r.observations.models?.map((m) => m.status)).toEqual(['verified', 'failed', 'verified']);
  expect(r.observations.process_control).toHaveLength(2);
  expect(r.observations.process_control.every((c) => c.passed)).toBe(true);
  expect(calls().filter((c) => !c.long).map((c) => c.model)).toEqual(models);
  expect(calls().filter((c) => c.long)).toHaveLength(2);
  // Synthetic reviewed evidence seam: changing a saved default reaches the permit with the same safety template.
  const e = r.evidence!;
  const at = new Date().toISOString();
  e.extra_usage = { disabled_confirmed: true, confirmed_at: at, next_confirmation_due: '' };
  e.entitlement.applies_to_cli = true;
  e.capabilities = ['text', 'structured_result'];
  e.isolation.plugins_disabled = true;
  e.isolation.file_scope_test = { passed: true, cases: ['absolute_path', 'dotdot', 'symlink_junction'], run_at: at,
    method: provider === 'codex' ? 'enforced_boundary' : provider === 'agy' ? 'cli_permission_deny' : 'cli_tools_disabled',
    enforcement_evidence_ref: 'synthetic-reviewed-report', config_method: 'config_inspection', config_cases: ['inherited_config', 'plugins_hooks'] };
  e.output_contract = { envelope_verified: true, test_passed: true, run_at: at };
  const gw = new AiExecutionGateway({
    evidence: () => ({ evidence: e, envelope: { ...r.envelope!, status: 'VERIFIED' } }),
    modelPreference: () => ({ model: 'second-model', effort: e.model_configurations![0]!.effort }),
    account: () => ({ profile_id: e.profile_id, runner_ref: options.profileDir, state: 'READY' }),
    consents: () => new Set(), parentEnv: {}, roots: { ...options.roots, sandboxRoot: options.scratchParent }, now: () => new Date(),
    observe: async () => ({ cli_version: e.cli_version, entrypoint_sha256: e.entrypoint.sha256, entrypoint_issues: [], auth_subscription: true,
      entitlement_verified: true, isolation_issues: [], enforcement_issues: [] }),
  });
  const result = await gw.decide(provider, { billing_policy: 'subscription_only', required_capabilities: ['text'], data_classes: [] });
  expect(result.decision).toEqual({ allowed: true });
  expect(result.permit?.model).toBe('second-model');
  expect(argvMatchesTemplate(provider, e.argv, result.permit!.argv)).toBe(true);
  if (provider === 'codex') {
    // Report fixture only: proves the matcher, not an OS boundary. Legacy reports included effort in config_overrides.
    const path = join(options.profileDir, 'synthetic-boundary.json');
    const cfg = sandboxConfigFromArgv(e.argv.slice(1));
    writeFileSync(path, JSON.stringify({ kind: 'study-english/probe-boundary/codex', schema_version: '2', verdict: 'PASS', report_path: path,
      codex: { sha256: e.entrypoint.sha256, version: e.cli_version },
      config: { codex_home: options.profileDir, workspace: options.scratchParent, gateway_argv: e.argv,
        sandbox_mode: cfg.sandbox_mode, config_overrides: [...cfg.overrides, 'model_reasoning_effort="medium"'], disabled_features: cfg.disabled },
      file_scope_test: e.isolation.file_scope_test, tools: { ok: true }, config_inspection: { ok: true } }));
    const changedEvidence = { ...e, argv: buildModelArgv(provider, e.argv, 'second-model', 'high') };
    // argvPrefix is a test-only node script and not part of the real native CLI template.
    changedEvidence.argv = changedEvidence.argv.slice(1);
    const report = JSON.parse(readFileSync(path, 'utf8'));
    report.config.gateway_argv = report.config.gateway_argv.slice(1);
    writeFileSync(path, JSON.stringify(report));
    expect(boundaryReportIssues(path, { evidence: changedEvidence, runnerDir: options.profileDir, workspace: options.scratchParent })).toEqual([]);
    changedEvidence.argv.push('--color', 'always');
    expect(boundaryReportIssues(path, { evidence: changedEvidence, runnerDir: options.profileDir, workspace: options.scratchParent })).toContain('ARGV_MISMATCH');
  }
  // A safety flag cannot be removed even with otherwise valid synthetic evidence.
  const safety = provider === 'codex' ? '--disable' : provider === 'agy' ? '--sandbox' : '--restricted';
  e.argv = e.argv.filter((a) => a !== safety);
  expect((await gw.decide(provider, { billing_policy: 'subscription_only', required_capabilities: [], data_classes: [] })).decision.allowed).toBe(false);

}, 45000);

it.each(providers)('%s stops immediately at quota and records every unfinished model', async (provider) => {
  const { options, calls } = setup(provider);
  const models = ['invalid-model', 'first-model', 'quota-model', 'never-model'];
  const r = provider === 'codex' ? await verifyCodex({ ...options, models, grant: () => {} })
    : await verifyClaudeOrAgy({ ...options, provider, models });
  expect(r.aborted).toMatch(/QUOTA_OR_RATE_LIMIT/);
  expect(r.observations.models_verified).toEqual(['first-model']);
  expect(r.observations.models_unverified).toEqual(['invalid-model', 'quota-model', 'never-model']);
  expect(r.observations.models?.at(-1)).toMatchObject({ model: 'never-model', status: 'not_run' });
  expect(r.observations.process_control).toEqual([]);
  expect(calls().map((c) => c.model)).toEqual(models.slice(0, 3));
}, 30000);

it.each(providers)('%s template preserves every safety token and refuses unverified effort/model', async (provider) => {
  const base = CLI_DESCRIPTORS[provider].candidate_argv;
  const argv = buildModelArgv(provider, base, 'first-model', provider === 'agy' ? null : 'medium');
  const changed = buildModelArgv(provider, argv, 'second-model', provider === 'agy' ? null : 'high');
  expect(argvMatchesTemplate(provider, argv, changed)).toBe(true);
  for (const flag of ['--sandbox', '--restricted', '--tools', '--strict-mcp-config', '--disable']) {
    if (argv.includes(flag)) expect(argvMatchesTemplate(provider, argv, argv.filter((v) => v !== flag))).toBe(false);
  }
  expect(argvMatchesTemplate(provider, argv, [...argv, '--model', 'override'])).toBe(false);
  const e = { provider, argv, models_allowed: ['first-model', 'second-model'], model_configurations: [
    { model: 'first-model', effort: provider === 'agy' ? null : 'medium' },
    { model: 'second-model', effort: provider === 'agy' ? null : 'high' },
  ] } as ProviderEvidence;
  expect(isVerifiedModelConfiguration(e, 'unknown', null)).toBe(false);
  expect(isVerifiedModelConfiguration(e, 'first-model', 'high')).toBe(false);
  const t = setup(provider);
  const gw = new AiExecutionGateway({
    evidence: () => ({ evidence: e, envelope: { ...CLI_DESCRIPTORS[provider].candidate_envelope, status: 'VERIFIED' } }),
    account: () => ({ profile_id: 'synthetic', runner_ref: t.options.profileDir, state: 'READY' }),
    consents: () => new Set(), parentEnv: {}, roots: { ...t.options.roots, sandboxRoot: t.options.scratchParent }, now: () => new Date(),
    observe: async () => ({ cli_version: null, entrypoint_sha256: null, entrypoint_issues: [], auth_subscription: null, entitlement_verified: null, isolation_issues: [], enforcement_issues: [] }),
  });
  e.isolation = { mechanism: '', file_scope_test: { method: 'model_reply', passed: false, cases: [], run_at: '' }, plugins_disabled: false };
  const result = await gw.decide(provider, { model: 'unknown', billing_policy: 'subscription_only', required_capabilities: [], data_classes: [] });
  expect(result.permit).toBeUndefined();
  expect(result.decision).toMatchObject({ allowed: false, reasons: ['MODEL_NOT_VERIFIED'] });
});

it('lists agy models without inference and stores preferences durably', async () => {
  const { options } = setup('agy');
  const report = await listProviderModels('agy', { ...options, verifiedModels: ['gemini-4-argon-medium'] });
  expect(report.available_models).toContainEqual(expect.objectContaining({ id: 'gemini-4-argon-low', verified: false }));
  expect(existsSync(join(options.profileDir, 'calls.jsonl'))).toBe(false);
  const f = await fixture(); cleanups.push(f.cleanup);
  f.store.aiAccounts.setModelPreference('agy', 'gemini-4-argon-medium');
  expect(f.store.aiAccounts.modelPreference('agy')).toMatchObject({ model: 'gemini-4-argon-medium', effort: null });
});
it('requires a fresh boundary review if a Claude model exposes tools', async () => {
  const { options } = setup('claude-code');
  writeFileSync(join(options.profileDir, 'fake-mode.txt'), 'tools-nonempty');
  const report = await verifyClaudeOrAgy({ ...options, provider: 'claude-code', models: ['first-model'] });
  expect(report.evidence?.models_allowed).toEqual([]);
  expect(report.evidence?.model_configurations).toEqual([]);
  expect(report.observations.synthetic_run?.format).toBe('BOUNDARY_REPROBE_REQUIRED');
  expect(report.evidence?.output_contract.test_passed).toBe(false);
}, 30000);
