// P2-3: gateway blocks execution whenever any D-01 basis is missing. No real CLI is spawned and no inference runs:
// the only process started is node.exe with a synthetic fixture script, behind synthetic evidence.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { subscriptionGuard, type GuardInput, type ProviderEvidence } from '../../src/application/ai/subscription-guard.js';
import { submitForAssessment } from '../../src/application/learning/submit-for-assessment.js';
import { CLI_DESCRIPTORS, CliProviderAdapter } from '../../src/infrastructure/ai/gateway/cli-adapters.js';
import { buildChildEnv } from '../../src/infrastructure/ai/gateway/env-allowlist.js';
import { parseEnvelope, type EnvelopeSpec } from '../../src/infrastructure/ai/gateway/envelope.js';
import { verifyEntrypoint } from '../../src/infrastructure/ai/gateway/entrypoint.js';
import { AiExecutionGateway, GatewayAdapter, type GatewayDeps } from '../../src/infrastructure/ai/gateway/gateway.js';
import { createRunSandbox, profileIsolationIssues, sandboxIssues } from '../../src/infrastructure/ai/gateway/isolation.js';
import { containsSecretLike, redact } from '../../src/infrastructure/ai/gateway/redaction.js';
import { processNextJob } from '../../src/worker/worker.js';
import { assessInput, fixture, tempDir, type Fixture } from './p1-helpers.js';

let f: Fixture | undefined;
const cleanups: (() => void)[] = [];
afterEach(() => { f?.cleanup(); f = undefined; cleanups.splice(0).forEach((c) => c()); });

const NOW = new Date('2026-10-20T00:00:00.000Z');
const nodeSha = createHash('sha256').update(readFileSync(process.execPath)).digest('hex');
const VERIFIED_ENVELOPE: EnvelopeSpec = { status: 'VERIFIED', source: 'synthetic test layout', format: 'json_object', result_path: ['result'], error_flag_path: ['is_error'],
  error_patterns: [{ pattern: 'usage limit', error: 'QUOTA_EXHAUSTED' }, { pattern: 'session expired', error: 'AUTH_EXPIRED' }] };

function evidence(over: Partial<ProviderEvidence> = {}): ProviderEvidence {
  return {
    provider: 'claude-code', profile_id: 'syn-profile', cli_version: 'synthetic-1.0',
    entrypoint: { path: process.execPath, sha256: nodeSha, kind: 'native_executable' }, argv: [resolve('tests/fixtures/fake-cli.mjs')],
    auth: { mode: 'subscription_login', observed: 'synthetic: subscription login', checked_at: NOW.toISOString(), probe_argv: ['--version'], expect_pattern: 'v' },
    entitlement: { plan: 'synthetic', applies_to_cli: true, source: 'synthetic', checked_at: NOW.toISOString(), expect_pattern: 'v' },
    extra_usage: { disabled_confirmed: true, confirmed_at: NOW.toISOString(), next_confirmation_due: '2026-11-20T00:00:00.000Z' },
    models_allowed: ['synthetic-model'],
    isolation: { mechanism: 'CLAUDE_CONFIG_DIR', file_scope_test: { passed: true, cases: ['absolute_path', 'dotdot', 'symlink_junction'], run_at: NOW.toISOString(),
      method: 'enforced_boundary', enforcement_evidence_ref: 'synthetic fixture only: not real CLI evidence',
      config_cases: ['inherited_config', 'plugins_hooks'], config_method: 'config_inspection' }, plugins_disabled: true },
    process_control: { timeout_cancel_test_passed: true, run_at: NOW.toISOString() },
    output_contract: { envelope_verified: true, test_passed: true, run_at: NOW.toISOString() },
    capabilities: ['text', 'structured_result'], ...over,
  };
}
const okObserved: GuardInput['observed'] = { cli_version: 'synthetic-1.0', entrypoint_sha256: nodeSha, entrypoint_issues: [], auth_subscription: true, entitlement_verified: true, isolation_issues: [], enforcement_issues: [] };
const guardInput = (over: Partial<GuardInput> = {}): GuardInput => ({
  provider: 'claude-code', adapter_status: 'VERIFIED', account: { state: 'READY' }, evidence: evidence(), observed: okObserved, env: { leaked_billing_names: [] },
  job: { billing_policy: 'subscription_only', required_capabilities: ['text'], data_classes: ['synthetic_fixture'], model: 'synthetic-model' },
  consents: new Set(['synthetic_fixture']), now: NOW, ...over,
});

describe('subscriptionGuard (06A §8, D-01)', () => {
  it('passes only with complete evidence, live observations, consent and capability', () => {
    expect(subscriptionGuard(guardInput())).toEqual({ allowed: true });
  });

  it.each(['legacy', 'model_reply', 'missing_reference', 'blank_reference'] as const)(
    'rejects %s read-boundary evidence even with all cases passed and a VERIFIED adapter', (mode) => {
      const e = evidence();
      const scope = e.isolation.file_scope_test;
      if (mode === 'legacy') {
        delete scope.method;
        delete scope.enforcement_evidence_ref;
      } else if (mode === 'model_reply') scope.method = 'model_reply';
      else if (mode === 'missing_reference') delete scope.enforcement_evidence_ref;
      else scope.enforcement_evidence_ref = '  ';
      expect(subscriptionGuard(guardInput({ evidence: e }))).toEqual({
        allowed: false, error: 'BILLING_UNVERIFIED', reasons: ['READ_BOUNDARY_UNVERIFIED'],
      });
    },
  );

  it('blocks as BILLING_UNVERIFIED when any billing/isolation basis is missing (06A ca 5)', () => {
    const cases: [string, Partial<GuardInput>][] = [
      ['NO_D01_EVIDENCE', { evidence: undefined }],
      ['ADAPTER_NEEDS_VERIFICATION', { adapter_status: 'NEEDS_VERIFICATION' }],
      ['BILLING_ENV_PRESENT:OPENAI_API_KEY', { env: { leaked_billing_names: ['OPENAI_API_KEY'] } }],
      ['EXTRA_USAGE_NOT_CONFIRMED_OFF', { evidence: evidence({ extra_usage: { disabled_confirmed: false, confirmed_at: NOW.toISOString(), next_confirmation_due: '2027-01-01T00:00:00.000Z' } }) }],
      ['EXTRA_USAGE_CONFIRMATION_OVERDUE', { now: new Date('2026-12-01T00:00:00.000Z') }],
      ['PLUGINS_NOT_DISABLED', { evidence: evidence({ isolation: { ...evidence().isolation, plugins_disabled: false } }) }],
      ['FILE_SCOPE_TEST_INCOMPLETE:symlink_junction', { evidence: evidence({ isolation: { ...evidence().isolation, file_scope_test: { ...evidence().isolation.file_scope_test, cases: ['absolute_path', 'dotdot'] } } }) }],
      // E-15 (3): config cases never count as an OS boundary, and need the config_inspection method.
      ['FILE_SCOPE_TEST_INCOMPLETE:inherited_config,plugins_hooks', { evidence: evidence({ isolation: { ...evidence().isolation, file_scope_test: { ...evidence().isolation.file_scope_test,
        cases: ['absolute_path', 'dotdot', 'symlink_junction', 'inherited_config', 'plugins_hooks'], config_cases: undefined } } }) }],
      ['FILE_SCOPE_TEST_INCOMPLETE:inherited_config,plugins_hooks', { evidence: evidence({ isolation: { ...evidence().isolation, file_scope_test: { ...evidence().isolation.file_scope_test, config_method: undefined } } }) }],
      ['CLI_VERSION_CHANGED_SINCE_VERIFICATION', { observed: { ...okObserved, cli_version: 'synthetic-2.0' } }],
      ['ENTRYPOINT_CHANGED_SINCE_VERIFICATION', { observed: { ...okObserved, entrypoint_sha256: 'b'.repeat(64) } }],
      ['ENTRYPOINT_SHIM_OR_SCRIPT', { observed: { ...okObserved, entrypoint_issues: ['SHIM_OR_SCRIPT'] } }],
      ['ARGV_HAS_BYPASS_FLAG', { evidence: evidence({ argv: ['-p', '--dangerously-skip-permissions'] }) }],
      ['ARGV_HAS_BYPASS_FLAG', { evidence: evidence({ argv: ['-p', '--bare'] }) }],
      ['MODEL_NOT_IN_VERIFIED_ENTITLEMENT', { job: { ...guardInput().job, model: 'other-model' } }],
      ['ENTITLEMENT_UNVERIFIED', { observed: { ...okObserved, entitlement_verified: null } }],
      ['AUTH_NOT_OBSERVED', { observed: { ...okObserved, auth_subscription: null } }],
      ['ISOLATION_NO_RECORDED_MECHANISM', { observed: { ...okObserved, isolation_issues: ['NO_RECORDED_MECHANISM'] } }],
      ['TIMEOUT_CANCEL_UNVERIFIED', { evidence: evidence({ process_control: { timeout_cancel_test_passed: false, run_at: NOW.toISOString() } }) }],
      ['OUTPUT_CONTRACT_UNVERIFIED', { evidence: evidence({ output_contract: { envelope_verified: false, test_passed: true, run_at: NOW.toISOString() } }) }],
      ['NO_ACCOUNT_PROFILE', { account: undefined }],
      ['JOB_NOT_SUBSCRIPTION_ONLY', { job: { ...guardInput().job, billing_policy: 'per_token' } }],
    ];
    for (const [reason, over] of cases) {
      const d = subscriptionGuard(guardInput(over));
      expect(d, reason).toMatchObject({ allowed: false, error: 'BILLING_UNVERIFIED' });
      expect((d as { reasons: string[] }).reasons, reason).toContain(reason);
    }
  });

  it('maps login, capability and data-recipient gaps to their own stops', () => {
    expect(subscriptionGuard(guardInput({ account: { state: 'NEEDS_LOGIN' } }))).toEqual({ allowed: false, error: 'AUTH_EXPIRED', reasons: ['PROFILE_NEEDS_LOGIN'] });
    expect(subscriptionGuard(guardInput({ job: { ...guardInput().job, required_capabilities: ['direct_audio'] } }))).toEqual({ allowed: false, error: 'CAPABILITY_MISSING', reasons: ['CAPABILITY_direct_audio'] });
    expect(subscriptionGuard(guardInput({ job: { ...guardInput().job, data_classes: ['learner_submission'] } }))).toEqual({ allowed: false, error: 'DATA_RECIPIENT_NOT_ALLOWED', reasons: ['NO_CONSENT_learner_submission'] });
  });
});

describe('gateway building blocks', () => {
  it('builds the child env from an allowlist and strips every billing route (06A ca 4)', () => {
    const parent = { SystemRoot: 'C:\\Windows', PATH: 'C:\\x', OPENAI_API_KEY: 'synthetic', ANTHROPIC_API_KEY: 'synthetic', GEMINI_API_KEY: 'synthetic', GOOGLE_API_KEY: 'synthetic',
      ANTHROPIC_BASE_URL: 'http://synthetic', CLAUDE_CODE_USE_BEDROCK: '1', CLAUDE_CODE_USE_VERTEX: '1', HTTPS_PROXY: 'http://synthetic', AWS_ACCESS_KEY_ID: 'synthetic',
      GOOGLE_APPLICATION_CREDENTIALS: 'c:\\synthetic.json', CODEX_HOME: 'c:\\real-home', USERPROFILE: 'C:\\Users\\real' };
    const child = buildChildEnv(parent, { tempDir: 'C:\\sb\\tmp', homeDir: 'C:\\sb\\home' }, { CLAUDE_CONFIG_DIR: 'D:\\runners\\p1' });
    expect(Object.keys(child.env).sort()).toEqual(['APPDATA', 'CI', 'CLAUDE_CONFIG_DIR', 'HOME', 'LOCALAPPDATA', 'NO_COLOR', 'PATH', 'SystemRoot', 'TEMP', 'TERM', 'TMP', 'USERPROFILE']);
    expect(child.env.USERPROFILE).toBe('C:\\sb\\home');
    expect(child.leaked_billing_names).toEqual([]);
    expect(child.removed).toEqual(expect.arrayContaining(['OPENAI_API_KEY', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_USE_BEDROCK', 'HTTPS_PROXY', 'CODEX_HOME']));
    expect(JSON.stringify(child.removed)).not.toContain('synthetic');
    expect(() => buildChildEnv(parent, { tempDir: 't', homeDir: 'h' }, { OPENAI_API_KEY: 'x' })).toThrow(/billing/);
  });

  it('redacts credentials, emails and user paths before anything is stored', () => {
    const raw = 'Authorization: Bearer abcdefghijklmnop sk-ant-synthetic123456 AIzaSyntheticSyntheticSynthetic12 user@example.com C:\\Users\\someone\\x token=abcd1234';
    const out = redact(raw);
    expect(out).not.toMatch(/abcdefghijklmnop|sk-ant-synthetic|AIzaSynthetic|user@example|someone|abcd1234/);
    expect(containsSecretLike(raw)).toBe(true);
    expect(containsSecretLike('cli 1.0; authMethod=claude.ai; sha ' + 'a'.repeat(64))).toBe(false);
  });

  it('parses the envelope in two layers and refuses unverified layouts (06A ca 6)', () => {
    const inner = { schema_version: '1', job_id: 'j', context_manifest_id: 'c', processing: 'processed', outcome: 'inconclusive', evidence_refs: [], limitations: [], synthetic: true };
    const env = (result: string, isError = false) => JSON.stringify({ type: 'result', is_error: isError, result });
    expect(parseEnvelope(env(JSON.stringify(inner)), 0, VERIFIED_ENVELOPE, 'writing.assess')).toMatchObject({ ok: true });
    expect(parseEnvelope(env(`\`\`\`json\n${JSON.stringify(inner)}\n\`\`\``), 0, VERIFIED_ENVELOPE, 'writing.assess')).toMatchObject({ ok: true });
    expect(parseEnvelope(env(JSON.stringify(inner)), 0, { ...VERIFIED_ENVELOPE, status: 'NEEDS_VERIFICATION' }, 'writing.assess')).toMatchObject({ ok: false, error: 'BILLING_UNVERIFIED' });
    expect(parseEnvelope(env(`Here you go: ${JSON.stringify(inner)}`), 0, VERIFIED_ENVELOPE, 'writing.assess')).toMatchObject({ ok: false, error: 'INVALID_SCHEMA' });
    expect(parseEnvelope(env(JSON.stringify({ ...inner, schema_version: '2' })), 0, VERIFIED_ENVELOPE, 'writing.assess')).toMatchObject({ ok: false, error: 'INVALID_SCHEMA' });
    expect(parseEnvelope(env(JSON.stringify({ ...inner, outcome: 'met', processing: 'technical_error' })), 0, VERIFIED_ENVELOPE, 'reading.blind_solve')).toMatchObject({ ok: false, error: 'INVALID_SCHEMA' });
    expect(parseEnvelope(env('You have hit your usage limit', true), 1, VERIFIED_ENVELOPE, 'writing.assess')).toMatchObject({ ok: false, error: 'QUOTA_EXHAUSTED' });
    expect(parseEnvelope(env('something odd about credits', true), 1, VERIFIED_ENVELOPE, 'writing.assess')).toMatchObject({ ok: false, error: 'BILLING_UNVERIFIED' });
    expect(parseEnvelope('Do you want to continue? [Y/n]', 1, VERIFIED_ENVELOPE, 'writing.assess')).toMatchObject({ ok: false, error: 'BILLING_UNVERIFIED' });
  });

  it('accepts only an absolute native executable outside workspace and data; shims are refused', () => {
    const t = tempDir('ielts-entry-'); cleanups.push(t.cleanup);
    const shim = join(t.dir, 'claude.cmd'); writeFileSync(shim, '@echo synthetic');
    expect(verifyEntrypoint(shim, { forbiddenRoots: [] }).issues).toContain('SHIM_OR_SCRIPT');
    expect(verifyEntrypoint('claude.exe', { forbiddenRoots: [] }).issues).toEqual(['NOT_ABSOLUTE']);
    expect(verifyEntrypoint(process.execPath, { forbiddenRoots: [resolve('.')] })).toMatchObject({ ok: true, sha256: nodeSha });
    expect(verifyEntrypoint(process.execPath, { forbiddenRoots: [resolve(process.execPath, '..')] }).issues).toEqual(['INSIDE_WORKSPACE_OR_DATA']);
  });

  it('keeps credential profiles outside repo/data/sandbox and runs in an empty sandbox', () => {
    const t = tempDir('ielts-iso-'); cleanups.push(t.cleanup);
    const roots = { repo: resolve('.'), data: join(t.dir, 'var'), sandboxRoot: join(t.dir, 'sb') };
    expect(profileIsolationIssues(join(t.dir, 'runners', 'p1'), roots)).toEqual([]);
    expect(profileIsolationIssues(join(roots.data, 'runners'), roots)).toEqual(['RUNNER_DIR_INSIDE_DATA']);
    expect(profileIsolationIssues(join(resolve('.'), 'var', 'p'), roots)).toEqual(['RUNNER_DIR_INSIDE_REPO']);
    expect(() => createRunSandbox('r1', [{ name: 'AGENTS.md', content: 'x' }], roots.sandboxRoot)).toThrow(/not allowed/);
    const sb = createRunSandbox('r2', [{ name: 'prompt.txt', content: 'synthetic' }], roots.sandboxRoot);
    expect(sandboxIssues(sb.dir, ['prompt.txt'])).toEqual([]);
    writeFileSync(join(sb.dir, 'study.db'), '');
    expect(sandboxIssues(sb.dir, ['prompt.txt'])).toEqual(['UNEXPECTED_FILE:study.db']);
    sb.dispose();
  });
});

function gatewayDeps(fx: Fixture, over: Partial<GatewayDeps> = {}): GatewayDeps {
  const t = tempDir('ielts-gw-'); cleanups.push(t.cleanup);
  mkdirSync(join(t.dir, 'sb'), { recursive: true });
  return { evidence: (p) => fx.store.aiAccounts.latestEvidence(p), account: (p) => fx.store.aiAccounts.account(p), consents: (p) => fx.store.aiAccounts.consents(p),
    parentEnv: { ...process.env, OPENAI_API_KEY: 'synthetic-should-never-pass' }, roots: { repo: resolve('.'), data: fx.root, sandboxRoot: join(t.dir, 'sb') }, now: () => NOW, ...over };
}

describe('aiExecutionGateway with the real (unverified) adapters', () => {
  it('reports every provider blocked and spawns nothing', async () => {
    f = await fixture();
    const observe = vi.fn();
    const gw = new AiExecutionGateway(gatewayDeps(f, { observe }));
    const status = await gw.status();
    expect(status.map((s) => [s.provider, s.adapter, s.ready, s.error])).toEqual([
      ['codex', 'NEEDS_VERIFICATION', false, 'BILLING_UNVERIFIED'], ['claude-code', 'NEEDS_VERIFICATION', false, 'BILLING_UNVERIFIED'], ['agy', 'NEEDS_VERIFICATION', false, 'BILLING_UNVERIFIED']]);
    expect(status[1]!.reasons).toEqual(expect.arrayContaining(['ADAPTER_NEEDS_VERIFICATION', 'NO_D01_EVIDENCE', 'NO_ACCOUNT_PROFILE', 'NO_CONSENT_synthetic_fixture']));
    // E-11: codex has a candidate mechanism (CODEX_HOME), so missing evidence — not the mechanism — blocks it; agy has none.
    expect(status[0]!.reasons).not.toContain('ISOLATION_NO_RECORDED_MECHANISM');
    expect(status[0]!.reasons).toEqual(expect.arrayContaining(['NO_D01_EVIDENCE', 'ADAPTER_NEEDS_VERIFICATION']));
    expect(status[2]!.reasons).toContain('ISOLATION_NO_RECORDED_MECHANISM');
    expect(observe).not.toHaveBeenCalled();
    for (const c of Object.values(CLI_DESCRIPTORS)) expect(c.candidate_envelope.status).toBe('NEEDS_VERIFICATION');
  });

  it('an adapter without a gateway permit never spawns its CLI', async () => {
    const run = vi.fn();
    const adapter = new CliProviderAdapter(CLI_DESCRIPTORS['claude-code'], run);
    expect(await adapter.execute('r', { job_id: 'j', context_manifest_id: 'c', billing_policy: 'subscription_only', required_capabilities: ['text'] }, { manifest_id: 'c', payload: {} }))
      .toEqual({ error: 'BILLING_UNVERIFIED' });
    expect(run).not.toHaveBeenCalled();
  });

  it('the worker behind the gateway stops a learner job with BILLING_UNVERIFIED and writes no evidence', async () => {
    f = await fixture();
    const fx = f;
    const attempt = fx.store.learning.createAttempt({ request_key: 'a', scope: 'learner', item: { id: fx.item.id, version: 'v1' }, rubric: { id: fx.rubric.id, version: 'v1' }, mode: 'self_practice', purpose: 'practice' });
    const { job } = submitForAssessment(fx.store, assessInput(fx, attempt.attempt_id, 's'));
    const gw = new AiExecutionGateway(gatewayDeps(fx));
    const adapter = new GatewayAdapter(gw, () => ({ eligible: ['claude-code', 'codex', 'agy'], job: { billing_policy: 'subscription_only', required_capabilities: ['text'], data_classes: ['learner_submission'] } }));
    const out = await processNextJob({ queue: fx.store.queue, adapter, loadContext: (id) => fx.store.learning.loadManifestPayload(id), interpret: () => [], owner: 'w', leaseMs: 60_000, heartbeatMs: 10_000, provider: 'claude-code' });
    expect(out).toMatchObject({ status: 'STOPPED', detail: 'BILLING_UNVERIFIED -> FAILED' });
    expect(fx.store.queue.get(job.job_id)).toMatchObject({ state: 'FAILED', executions_used: 1 });
    expect(fx.store.db.prepare('SELECT COUNT(*) AS n FROM observations').get()).toEqual({ n: 0 });
  });
});

describe('gateway mechanism end-to-end with a synthetic CLI (node.exe + fixture; not a provider)', () => {
  it('with complete synthetic evidence it runs once in a sandbox with allowlisted env and parses the envelope', async () => {
    f = await fixture();
    const fx = f;
    const runner = join(tmpdir(), `ielts-runner-${process.pid}`);
    fx.store.aiAccounts.upsertAccount({ profile_id: 'syn-profile', provider: 'claude-code', label: 'synthetic', runner_ref: runner, state: 'READY' });
    fx.store.aiAccounts.recordEvidence(evidence(), VERIFIED_ENVELOPE);
    expect(() => fx.store.aiAccounts.recordEvidence(evidence({ cli_version: 'sk-ant-synthetic1234567890' }), VERIFIED_ENVELOPE)).toThrow(/credential/);
    fx.store.aiAccounts.setConsent('claude-code', 'synthetic_fixture', true);
    const deps = gatewayDeps(fx, { observe: async () => okObserved });
    const gw = new AiExecutionGateway(deps);
    expect((await gw.status())[1]).toMatchObject({ provider: 'claude-code', ready: true });
    // Without the learner-data consent the same provider is still blocked for a learner job.
    expect((await gw.decide('claude-code', { billing_policy: 'subscription_only', required_capabilities: ['text'], data_classes: ['learner_submission'] })).decision)
      .toEqual({ allowed: false, error: 'DATA_RECIPIENT_NOT_ALLOWED', reasons: ['NO_CONSENT_learner_submission'] });

    const attempt = fx.store.learning.createAttempt({ request_key: 'dry', scope: 'dry_run', item: { id: fx.item.id, version: 'v1' }, rubric: { id: fx.rubric.id, version: 'v1' }, mode: 'exam', purpose: 'practice' });
    const { job } = submitForAssessment(fx.store, assessInput(fx, attempt.attempt_id, 'dry-s'));
    const adapter = new GatewayAdapter(gw, () => ({ eligible: ['claude-code'], job: { billing_policy: 'subscription_only', required_capabilities: ['text', 'structured_result'], data_classes: ['synthetic_fixture'] } }));
    const out = await processNextJob({ queue: fx.store.queue, adapter, loadContext: (id) => fx.store.learning.loadManifestPayload(id), interpret: () => [], owner: 'w', leaseMs: 60_000, heartbeatMs: 10_000,
      provider: 'claude-code', claimOptions: { scopes: ['dry_run'], cli_version: 'synthetic-1.0', model: 'synthetic-model' } });
    expect(out.status).toBe('COMMITTED');
    const result = fx.store.queue.result(job.job_id) as { limitations: string[] };
    expect(result.limitations).toEqual(['billing_vars=0', 'cwd_entries=0', 'ci=true', 'config_dir_set=true']);
    expect(fx.store.db.prepare('SELECT provider, cli_version, model FROM ai_runs').get()).toEqual({ provider: 'claude-code', cli_version: 'synthetic-1.0', model: 'synthetic-model' });
  });
});
