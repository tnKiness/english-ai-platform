// E-11 (user decisions 20/10/2026): agy replaces gemini-cli, CODEX_HOME candidate isolation, the 5 approved data
// classes (never learner_audio), 30-day extra-usage reconfirmation, and the Codex D-01 verifier. No real CLI runs:
// the only processes are node.exe with synthetic fixture scripts.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { EXTRA_USAGE_RECONFIRM_MS, subscriptionGuard, USER_APPROVED_DATA_CLASSES, type GuardInput, type ProviderEvidence } from '../../src/application/ai/subscription-guard.js';
import { validateContract } from '../../src/infrastructure/contracts/validate.js';
import { parseEnvelope } from '../../src/infrastructure/ai/gateway/envelope.js';
import { AiExecutionGateway, type GatewayDeps } from '../../src/infrastructure/ai/gateway/gateway.js';
import { classifyCodexLogin, verifyCodex, type VerifyCodexOptions } from '../../src/infrastructure/ai/gateway/verify-codex.js';
import { migrate, openDatabase } from '../../src/infrastructure/sqlite/database.js';
import { submitForAssessment } from '../../src/application/learning/submit-for-assessment.js';
import { FakeAdapter } from '../../src/infrastructure/ai/fake-adapter.js';
import { processNextJob } from '../../src/worker/worker.js';
import { assessInput, fixture, tempDir, type Fixture } from './p1-helpers.js';

let f: Fixture | undefined;
const cleanups: (() => void)[] = [];
afterEach(() => { f?.cleanup(); f = undefined; cleanups.splice(0).forEach((c) => c()); });

const NOW = new Date('2026-10-20T00:00:00.000Z');
const nodeSha = createHash('sha256').update(readFileSync(process.execPath)).digest('hex');
const ALL_CASES = ['absolute_path', 'dotdot', 'symlink_junction', 'inherited_config', 'plugins_hooks'];
const VERIFIED = { status: 'VERIFIED' as const, source: 'synthetic', format: 'json_object' as const, result_path: ['result'], error_flag_path: ['is_error'], error_patterns: [] };

function evidence(over: Partial<ProviderEvidence> = {}): ProviderEvidence {
  return {
    provider: 'codex', profile_id: 'syn-codex', cli_version: 'synthetic-1.0', entrypoint: { path: process.execPath, sha256: nodeSha, kind: 'native_executable' },
    argv: [resolve('tests/fixtures/fake-cli.mjs')],
    auth: { mode: 'subscription_login', observed: 'synthetic', checked_at: NOW.toISOString(), probe_argv: ['--version'], expect_pattern: 'v' },
    entitlement: { plan: 'synthetic', applies_to_cli: true, source: 'synthetic', checked_at: NOW.toISOString(), expect_pattern: 'v' },
    extra_usage: { disabled_confirmed: true, confirmed_at: NOW.toISOString(), next_confirmation_due: '' }, models_allowed: ['synthetic-model'],
    isolation: { mechanism: 'CODEX_HOME', file_scope_test: { passed: true, cases: ALL_CASES, run_at: NOW.toISOString(),
      method: 'enforced_boundary', enforcement_evidence_ref: 'synthetic fixture only: not real CLI evidence' }, plugins_disabled: true },
    process_control: { timeout_cancel_test_passed: true, run_at: NOW.toISOString() }, output_contract: { envelope_verified: true, test_passed: true, run_at: NOW.toISOString() },
    capabilities: ['text', 'structured_result'], ...over,
  };
}
const observed: GuardInput['observed'] = { cli_version: 'synthetic-1.0', entrypoint_sha256: nodeSha, entrypoint_issues: [], auth_subscription: true, entitlement_verified: true, isolation_issues: [] };
const guardInput = (over: Partial<GuardInput> = {}): GuardInput => ({ provider: 'codex', adapter_status: 'VERIFIED', account: { state: 'READY' }, evidence: evidence(), observed,
  env: { leaked_billing_names: [] }, job: { billing_policy: 'subscription_only', required_capabilities: ['text'], data_classes: ['synthetic_fixture'], model: 'synthetic-model' },
  consents: new Set(['synthetic_fixture']), now: NOW, ...over });

function deps(fx: Fixture, over: Partial<GatewayDeps> = {}): GatewayDeps {
  const t = tempDir('ielts-e11-'); cleanups.push(t.cleanup);
  mkdirSync(join(t.dir, 'sb'), { recursive: true });
  return { evidence: (p) => fx.store.aiAccounts.latestEvidence(p), account: (p) => fx.store.aiAccounts.account(p), consents: (p) => fx.store.aiAccounts.consents(p),
    extraUsageConfirmedAt: (p) => fx.store.aiAccounts.latestExtraUsageConfirmation(p), parentEnv: {}, roots: { repo: resolve('.'), data: fx.root, sandboxRoot: join(t.dir, 'sb') },
    now: fx.store.now, observe: async () => observed, ...over };
}

describe('E-11 (4) agy replaces gemini-cli with old data kept', () => {
  it('preserves completed historical runs, results and observation provenance across migration', async () => {
    const t = tempDir('ielts-history-'); cleanups.push(t.cleanup);
    const dir = join(t.dir, 'migrations'); mkdirSync(dir);
    for (const m of ['0001_core.sql', '0002_builder_qc.sql']) copyFileSync(join('migrations', m), join(dir, m));
    f = await fixture({ migrationsDir: dir });
    const fx = f;
    const attempt = fx.store.learning.createAttempt({ request_key: 'old', scope: 'learner', item: { id: fx.item.id, version: 'v1' }, rubric: { id: fx.rubric.id, version: 'v1' }, mode: 'self_practice', purpose: 'practice' });
    submitForAssessment(fx.store, assessInput(fx, attempt.attempt_id, 'old-submit'));
    expect(await processNextJob({ queue: fx.store.queue, adapter: new FakeAdapter('success'), loadContext: (id) => fx.store.learning.loadManifestPayload(id),
      interpret: () => [{ observation_key: 'old', competency_id: 'synthetic', processing: 'processed', outcome: 'met', measurement_quality: 'sufficient', opportunity: 'observed', support_impact: 'no_related_effect_detected' }],
      owner: 'synthetic', leaseMs: 60_000, heartbeatMs: 10_000 })).toMatchObject({ status: 'COMMITTED' });
    fx.store.db.prepare("UPDATE ai_runs SET provider = 'gemini-cli'").run();
    const tables = ['ai_runs', 'job_results', 'observations', 'submissions', 'evidence_sources'];
    const before = tables.map((table) => fx.store.db.prepare(`SELECT * FROM ${table}`).all());
    expect(before.every((rows) => rows.length > 0)).toBe(true);
    copyFileSync('migrations/0003_provider_agy.sql', join(dir, '0003_provider_agy.sql'));
    let backupHookCalled = false;
    await migrate(fx.store.db, { migrationsDir: dir, beforeMigrate: () => { backupHookCalled = true; } });
    expect(backupHookCalled).toBe(true);
    expect(tables.map((table) => fx.store.db.prepare(`SELECT * FROM ${table}`).all())).toEqual(before);
    expect(fx.store.db.pragma('foreign_key_check')).toEqual([]);
    expect(fx.store.db.prepare("SELECT name FROM sqlite_master WHERE sql LIKE '%pre_0003%'").all()).toEqual([]);
  });

  it('migration 0003 keeps pre-E-11 rows, accepts agy and keeps the append-only triggers', async () => {
    const t = tempDir('ielts-mig-'); cleanups.push(t.cleanup);
    const dir = join(t.dir, 'migrations'); mkdirSync(dir);
    for (const m of ['0001_core.sql', '0002_builder_qc.sql']) copyFileSync(join('migrations', m), join(dir, m));
    const path = join(t.dir, 'old.db');
    const old = await openDatabase(path, { migrationsDir: dir });
    old.prepare("INSERT INTO ai_accounts VALUES ('legacy', 'gemini-cli', 'Gemini cũ', 'D:\\runners\\g', 'DISABLED', '2026-10-19T00:00:00.000Z')").run();
    old.prepare(`INSERT INTO provider_verifications VALUES ('v1', 'gemini-cli', 'legacy', '0.1', '${'a'.repeat(64)}', '{}', '2026-10-19T00:00:00.000Z')`).run();
    old.prepare("INSERT INTO ai_data_consents VALUES ('c1', 'gemini-cli', 'synthetic_fixture', 1, '2026-10-19T00:00:00.000Z')").run();
    expect(() => old.prepare("INSERT INTO ai_accounts VALUES ('a', 'agy', 'x', 'D:\\r', 'NEEDS_VERIFICATION', 'now')").run()).toThrow(/CHECK/);
    old.close();
    copyFileSync('migrations/0003_provider_agy.sql', join(dir, '0003_provider_agy.sql'));
    const db = await openDatabase(path, { migrationsDir: dir });
    expect(db.prepare('SELECT profile_id, provider, state FROM ai_accounts').all()).toEqual([{ profile_id: 'legacy', provider: 'gemini-cli', state: 'DISABLED' }]);
    expect(db.prepare('SELECT verification_id, profile_id FROM provider_verifications').all()).toEqual([{ verification_id: 'v1', profile_id: 'legacy' }]);
    expect(db.prepare('SELECT event_id, provider FROM ai_data_consents').all()).toEqual([{ event_id: 'c1', provider: 'gemini-cli' }]);
    db.prepare("INSERT INTO ai_accounts VALUES ('agy-main', 'agy', 'Antigravity', 'D:\\runners\\agy', 'NEEDS_VERIFICATION', 'now')").run();
    expect(() => db.prepare("DELETE FROM ai_accounts WHERE profile_id = 'legacy'").run()).toThrow(/immutable/);
    expect(() => db.prepare("UPDATE provider_verifications SET cli_version = 'x'").run()).toThrow(/immutable/);
    expect(() => db.prepare("DELETE FROM ai_data_consents").run()).toThrow(/immutable/);
    expect(() => db.prepare("INSERT INTO provider_verifications VALUES ('v2', 'agy', 'missing-profile', '1', '" + 'b'.repeat(64) + "', '{}', 'now')").run()).toThrow(/FOREIGN KEY/);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name LIKE '%pre_0003%'").all()).toEqual([]);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE sql LIKE '%pre_0003%'").all()).toEqual([]);
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.pragma('foreign_key_check')).toEqual([]);
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(db.pragma('legacy_alter_table', { simple: true })).toBe(0);
    db.close();
  });

  it('contracts: version-1 documents keep the old enum, version 2 names agy', () => {
    const job = { schema_version: '1', job_id: 'j', idempotency_key: 'k', attempt_id: 'a', snapshot_version: 0, attempt_generation: 1, billing_policy: 'subscription_only',
      task_type: 'writing.assess', phase: 'assessment', context_manifest_id: 'c', rubric_version: 'v1', required_capabilities: ['text'], eligible_providers: ['codex', 'gemini-cli'],
      limits: { max_attempts_total: 3, timeout_seconds: 120 } };
    expect(validateContract('job', job)).toBe(true);
    expect(validateContract('job', { ...job, eligible_providers: ['agy'] })).toBe(false);
    expect(validateContract('job', { ...job, schema_version: '2', eligible_providers: ['codex', 'claude-code', 'agy'] })).toBe(true);
    expect(validateContract('job', { ...job, schema_version: '2', eligible_providers: ['gemini-cli'] })).toBe(false);
    expect(validateContract('job', { ...job, schema_version: '2', phase: 'repair' })).toBe(false);
    const profile = { schema_version: '2', profile_id: 'p', provider: 'agy', label: 'x', runner_ref: 'r', state: 'NEEDS_VERIFICATION' };
    expect(validateContract('profile', profile)).toBe(true);
    expect(validateContract('profile', { ...profile, token: 'synthetic' })).toBe(false);
  });

  it('agy is registered but blocked: no evidence and no recorded isolation mechanism', async () => {
    f = await fixture();
    f.store.aiAccounts.upsertAccount({ profile_id: 'agy-main', provider: 'agy', label: 'Antigravity', runner_ref: join(f.root, '..', 'runner-agy'), state: 'NEEDS_VERIFICATION' });
    const agy = (await new AiExecutionGateway(deps(f)).status()).find((s) => s.provider === 'agy')!;
    expect(agy).toMatchObject({ adapter: 'NEEDS_VERIFICATION', ready: false, error: 'BILLING_UNVERIFIED' });
    expect(agy.reasons).toEqual(expect.arrayContaining(['NO_D01_EVIDENCE', 'ISOLATION_NO_RECORDED_MECHANISM', 'PROFILE_NEEDS_VERIFICATION']));
    const legacyProviders = JSON.parse('["gemini-cli"]') as ['codex'];
    expect(await new AiExecutionGateway(deps(f)).select(legacyProviders, { billing_policy: 'subscription_only', required_capabilities: ['text'], data_classes: [] }))
      .toMatchObject({ blocked: [{ provider: 'gemini-cli', reasons: ['PROVIDER_NOT_ENABLED'] }] });
  });
});

describe('E-11 (1) CODEX_HOME candidate', () => {
  it('evidence must have been collected with the same mechanism', async () => {
    f = await fixture();
    const runner = join(f.root, '..', `runner-codex-${process.pid}`);
    f.store.aiAccounts.upsertAccount({ profile_id: 'syn-codex', provider: 'codex', label: 'Codex', runner_ref: runner, state: 'READY' });
    f.store.aiAccounts.recordEvidence(evidence({ isolation: { ...evidence().isolation, mechanism: 'CLAUDE_CONFIG_DIR' } }), VERIFIED);
    f.store.aiAccounts.setConsent('codex', 'synthetic_fixture', true);
    const gw = new AiExecutionGateway(deps(f));
    const status = await gw.status();
    expect(status[0]).toMatchObject({ provider: 'codex', ready: false });
    expect(status[0]!.reasons).toContain('ISOLATION_EVIDENCE_MECHANISM_MISMATCH');
    f.store.aiAccounts.recordEvidence(evidence(), VERIFIED);
    const { decision, permit } = await gw.decide('codex', { billing_policy: 'subscription_only', required_capabilities: ['text'], data_classes: ['synthetic_fixture'] });
    expect(decision).toEqual({ allowed: true });
    expect(permit?.profileEnv).toEqual({ CODEX_HOME: runner });
  });
});

describe('E-11 (2) data consent: 5 approved classes, learner_audio never', () => {
  it('learner_audio is blocked even for a VERIFIED provider with a consent row', async () => {
    f = await fixture();
    const fx = f;
    fx.store.aiAccounts.upsertAccount({ profile_id: 'syn-codex', provider: 'codex', label: 'Codex', runner_ref: join(fx.root, '..', `runner-${process.pid}`), state: 'NEEDS_VERIFICATION' });
    expect(() => fx.store.aiAccounts.grantUserApprovedDataClasses('codex')).toThrow(/not D-01 verified/);
    expect(fx.store.aiAccounts.consents('codex').size).toBe(0);
    fx.store.aiAccounts.recordEvidence(evidence(), VERIFIED);
    fx.store.aiAccounts.upsertAccount({ ...fx.store.aiAccounts.account('codex')!, provider: 'codex', state: 'READY' });
    expect(fx.store.aiAccounts.grantUserApprovedDataClasses('codex')).toEqual([...USER_APPROVED_DATA_CLASSES]);
    expect([...fx.store.aiAccounts.consents('codex')].sort()).toEqual([...USER_APPROVED_DATA_CLASSES].sort());
    expect(fx.store.aiAccounts.consents('claude-code').size).toBe(0);
    expect(() => fx.store.aiAccounts.setConsent('codex', 'learner_audio', true)).toThrow(/never sent/);
    // Even a row written around the repository does not open the audio path.
    fx.store.db.prepare("INSERT INTO ai_data_consents VALUES ('raw', 'codex', 'learner_audio', 1, '2026-10-20T00:00:01.000Z')").run();
    expect(fx.store.aiAccounts.consents('codex').has('learner_audio')).toBe(true);
    const gw = new AiExecutionGateway(deps(fx));
    const job = (data_classes: GatewayJobClasses) => ({ billing_policy: 'subscription_only', required_capabilities: ['text' as const], data_classes });
    expect((await gw.decide('codex', job(['learner_submission', 'learner_profile', 'answer_key']))).decision).toEqual({ allowed: true });
    const audio = await gw.decide('codex', job(['learner_submission', 'learner_audio']));
    expect(audio.decision).toEqual({ allowed: false, error: 'DATA_RECIPIENT_NOT_ALLOWED', reasons: ['DATA_CLASS_NEVER_SENT_learner_audio'] });
    expect(audio.permit).toBeUndefined();
  });
});
type GatewayJobClasses = Parameters<AiExecutionGateway['decide']>[1]['data_classes'];

describe('E-11 (5) extra usage reconfirmed at most every 30 days', () => {
  it('blocks one millisecond after 30 days, not at exactly 30 days', () => {
    const at = (ms: number) => new Date(NOW.getTime() + ms);
    expect(subscriptionGuard(guardInput({ now: at(EXTRA_USAGE_RECONFIRM_MS) }))).toEqual({ allowed: true });
    const late = subscriptionGuard(guardInput({ now: at(EXTRA_USAGE_RECONFIRM_MS + 1) }));
    expect(late).toMatchObject({ allowed: false, error: 'BILLING_UNVERIFIED' });
    expect((late as { reasons: string[] }).reasons).toContain('EXTRA_USAGE_CONFIRMATION_OVERDUE');
    // A later recorded confirmation restarts the 30 days; a far next_confirmation_due in evidence does not extend them.
    expect(subscriptionGuard(guardInput({ now: at(EXTRA_USAGE_RECONFIRM_MS + 1), extra_usage_confirmed_at: at(1).toISOString() }))).toEqual({ allowed: true });
    const far = evidence({ extra_usage: { disabled_confirmed: true, confirmed_at: NOW.toISOString(), next_confirmation_due: '2030-01-01T00:00:00.000Z' } });
    expect((subscriptionGuard(guardInput({ evidence: far, now: at(EXTRA_USAGE_RECONFIRM_MS + 1) })) as { reasons: string[] }).reasons).toContain('EXTRA_USAGE_CONFIRMATION_OVERDUE');
    // Evidence without a confirmation needs a recorded one; a confirmation dated in the future does not count.
    const none = evidence({ extra_usage: { disabled_confirmed: false, confirmed_at: '', next_confirmation_due: '' } });
    expect((subscriptionGuard(guardInput({ evidence: none })) as { reasons: string[] }).reasons).toContain('EXTRA_USAGE_NOT_CONFIRMED_OFF');
    expect((subscriptionGuard(guardInput({ evidence: none, extra_usage_confirmed_at: at(1).toISOString() })) as { reasons: string[] }).reasons).toContain('EXTRA_USAGE_NOT_CONFIRMED_OFF');
    expect(subscriptionGuard(guardInput({ evidence: none, extra_usage_confirmed_at: NOW.toISOString() }))).toEqual({ allowed: true });
  });

  it('the recorded confirmation is append-only and drives the gateway', async () => {
    f = await fixture();
    const fx = f;
    fx.store.aiAccounts.upsertAccount({ profile_id: 'syn-codex', provider: 'codex', label: 'Codex', runner_ref: join(fx.root, '..', `runner-x-${process.pid}`), state: 'READY' });
    fx.store.aiAccounts.recordEvidence(evidence({ extra_usage: { disabled_confirmed: false, confirmed_at: '', next_confirmation_due: '' } }), VERIFIED);
    fx.store.aiAccounts.setConsent('codex', 'synthetic_fixture', true);
    const gw = new AiExecutionGateway(deps(fx));
    const probe = { billing_policy: 'subscription_only', required_capabilities: ['text' as const], data_classes: ['synthetic_fixture' as const] };
    expect((await gw.decide('codex', probe)).decision).toMatchObject({ allowed: false, reasons: ['EXTRA_USAGE_NOT_CONFIRMED_OFF'] });
    fx.store.aiAccounts.confirmExtraUsageOff('codex', 'synthetic');
    expect((await gw.decide('codex', probe)).decision).toEqual({ allowed: true });
    fx.clock.advance(EXTRA_USAGE_RECONFIRM_MS + 1);
    expect((await gw.decide('codex', probe)).decision).toMatchObject({ allowed: false, reasons: ['EXTRA_USAGE_CONFIRMATION_OVERDUE'] });
    expect(() => fx.store.db.prepare('DELETE FROM extra_usage_confirmations').run()).toThrow(/immutable/);
    expect(() => fx.store.aiAccounts.confirmExtraUsageOff('codex', 'token=abcd1234efgh')).toThrow(/credential/);
  });
});

describe('npm run ai -- verify codex (fake codex via node.exe; no inference)', () => {
  const setup = (mode: string): VerifyCodexOptions => {
    const t = tempDir('ielts-verify-'); cleanups.push(t.cleanup);
    const profileDir = join(t.dir, 'codex-home'); mkdirSync(profileDir);
    writeFileSync(join(profileDir, 'fake-mode.txt'), mode);
    return { entrypoint: process.execPath, argvPrefix: [resolve('tests/fixtures/fake-codex.mjs')], profileId: 'codex-main', profileDir, model: 'synthetic-model',
      roots: { repo: resolve('.'), data: join(t.dir, 'var') }, scratchParent: join(t.dir, 'scratch'), parentEnv: { ...process.env, OPENAI_API_KEY: 'synthetic-never-passed' },
      now: () => NOW, timeouts: { probeMs: 20_000, runMs: 20_000, longTaskMs: 3_000 } };
  };

  it('classifies the login method without keeping the output', () => {
    expect(classifyCodexLogin('Logged in using ChatGPT')).toBe('chatgpt');
    expect(classifyCodexLogin('Logged in using an API key - sk-...')).toBe('api_key');
    expect(classifyCodexLogin('Not logged in')).toBe('not_logged_in');
  });

  it.each(['contained', 'policy-blocked'])('does not certify confinement from %s replies or command rejection', async (mode) => {
    const opts = setup(mode);
    // Observe actual fixture PIDs without CIM permissions. This checks real taskkill
    // behavior; production CIM availability is a separate D-01 precondition.
    opts.listProcesses = () => {
      const file = join(opts.profileDir, 'synthetic-child.json');
      if (!existsSync(file)) return [];
      const child = JSON.parse(readFileSync(file, 'utf8')) as { pid: number; ppid: number };
      return [child, { pid: child.ppid, ppid: 0 }].filter((r) => {
        try { process.kill(r.pid, 0); return true; } catch { return false; }
      });
    };
    const report = await verifyCodex(opts);
    expect(report.aborted).toBeNull();
    expect(report.observations.login_method).toBe('chatgpt');
    expect(report.observations.file_scope.map((c) => [c.case, c.passed, c.detail]))
      .toEqual(ALL_CASES.map((c) => [c, false, 'EXPECTED_REPLY_READ_BOUNDARY_UNVERIFIED']));
    expect(report.observations.process_control.map((c) => [c.case, c.passed, c.detail])).toEqual([
      ['timeout', true, expect.stringMatching(/^tree of [2-9]\d* ended$/)], ['cancel', true, expect.stringMatching(/^tree of [2-9]\d* ended$/)]]);
    const e = report.evidence!;
    expect(e).toMatchObject({ provider: 'codex', cli_version: 'codex-cli 0.0.0-synthetic', entrypoint: { sha256: nodeSha, kind: 'native_executable' }, models_allowed: ['synthetic-model'],
      isolation: { mechanism: 'CODEX_HOME', file_scope_test: { passed: false, cases: [], method: 'model_reply' }, plugins_disabled: false },
      process_control: { timeout_cancel_test_passed: true }, output_contract: { envelope_verified: false, test_passed: true },
      extra_usage: { disabled_confirmed: false }, entitlement: { applies_to_cli: false }, auth: { expect_pattern: 'Logged in using ChatGPT' } });
    expect(e.argv.slice(1)).toEqual(['exec', '--json', '--sandbox', 'read-only', '--skip-git-repo-check', '--color', 'never', '-m', 'synthetic-model', '-']);
    expect(report.envelope).toMatchObject({ status: 'NEEDS_VERIFICATION', format: 'jsonl_last_object', result_path: ['item', 'text'], line_select: { path: ['item', 'type'], equals: 'agent_message' } });
    expect(report.pending_user_confirmation.join('\n')).toMatch(/confirm-extra-usage codex off/);
    expect(JSON.stringify(report)).not.toMatch(/SYNTHETIC-SECRET|synthetic-never-passed/);
    // The derived layout parses a real-shaped stream once the user marks it VERIFIED.
    const inner = { schema_version: '1', job_id: 'j', context_manifest_id: 'c', processing: 'processed', outcome: 'inconclusive', evidence_refs: [], limitations: [], synthetic: true };
    const stream = [{ type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify(inner) } }, { type: 'turn.completed', usage: {} }].map((x) => JSON.stringify(x)).join('\n');
    expect(parseEnvelope(stream, 0, { ...report.envelope!, status: 'VERIFIED' }, 'writing.assess')).toMatchObject({ ok: true });

    // Recorded as-is, the evidence still cannot unlock the gateway.
    f = await fixture();
    f.store.aiAccounts.upsertAccount({ profile_id: 'codex-main', provider: 'codex', label: 'Codex', runner_ref: join(f.root, '..', `runner-v-${process.pid}`), state: 'READY' });
    f.store.aiAccounts.recordEvidence(e, report.envelope!);
    f.store.aiAccounts.setConsent('codex', 'synthetic_fixture', true);
    const codex = (await new AiExecutionGateway(deps(f)).status())[0]!;
    expect(codex.ready).toBe(false);
    expect(codex.reasons).toEqual(expect.arrayContaining(['ADAPTER_NEEDS_VERIFICATION', 'EXTRA_USAGE_NOT_CONFIRMED_OFF', 'PLUGINS_NOT_DISABLED', 'ENTITLEMENT_UNVERIFIED', 'OUTPUT_CONTRACT_UNVERIFIED', 'READ_BOUNDARY_UNVERIFIED']));
  }, 90_000);

  it('reports every file-scope case a leaky CLI fails', async () => {
    const report = await verifyCodex({ ...setup('leaky'), timeouts: { probeMs: 20_000, runMs: 20_000, longTaskMs: 1_500 } });
    expect(report.observations.file_scope.map((c) => [c.case, c.passed, c.detail])).toEqual([
      ['absolute_path', false, 'SECRET_LEAKED'], ['dotdot', false, 'SECRET_LEAKED'], ['symlink_junction', false, 'SECRET_LEAKED'], ['inherited_config', false, 'SECRET_LEAKED'], ['plugins_hooks', false, 'SECRET_LEAKED']]);
    expect(report.evidence!.isolation.file_scope_test).toMatchObject({ passed: false, cases: [] });
    expect(report.pending_user_confirmation.join('\n')).toMatch(/file-scope/);
    expect(JSON.stringify(report)).not.toContain('SYNTHETIC-SECRET');
  }, 90_000);

  it.each(['empty', 'failed'])('does not treat %s output or an unobserved process tree as proof of isolation', async (mode) => {
    const report = await verifyCodex({ ...setup(mode), listProcesses: () => [], timeouts: { probeMs: 20_000, runMs: 20_000, longTaskMs: 600 } });
    expect(report.observations.file_scope).toHaveLength(5);
    expect(report.observations.file_scope.every((c) => !c.passed)).toBe(true);
    expect(report.observations.process_control.every((c) => !c.passed)).toBe(true);
    expect(report.evidence!.output_contract.test_passed).toBe(false);
    expect(report.evidence!.isolation.file_scope_test.passed).toBe(false);
  }, 60_000);

  it('stops before any prompt when the profile is not a ChatGPT login, and refuses bad layouts', async () => {
    const report = await verifyCodex(setup('apikey'));
    expect(report).toMatchObject({ aborted: 'LOGIN_NOT_CHATGPT:api_key', evidence: null, observations: { synthetic_run: null, file_scope: [] } });
    const o = setup('contained');
    await expect(verifyCodex({ ...o, profileDir: join(resolve('.'), 'var', 'codex-home') })).rejects.toThrow(/RUNNER_DIR_INSIDE_REPO/);
    await expect(verifyCodex({ ...o, argv: ['exec', '--dangerously-bypass-approvals-and-sandbox', '-'] })).rejects.toThrow(/bypass/);
    await expect(verifyCodex({ ...o, argv: ['exec', 'prompt-in-argv'] })).rejects.toThrow(/stdin/);
  }, 60_000);
});
