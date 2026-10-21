import { randomUUID } from 'node:crypto';
import { NEVER_SENT_DATA_CLASSES, USER_APPROVED_DATA_CLASSES, type AccountState, type CliProvider, type DataClass, type ProviderEvidence } from '../../application/ai/subscription-guard.js';
import { evaluateBackupProviderBenchmarkGate, validateBenchmarkSuite, type BackupBenchmarkGateDecision, type BenchmarkRunReport, type BenchmarkSuiteManifest } from '../../domain/knowledge/benchmark-suite.js';
import type { EnvelopeSpec } from '../ai/gateway/envelope.js';
import { containsSecretLike } from '../ai/gateway/redaction.js';
import { canonicalJson, sha256 } from '../files/paths.js';
import type { Db } from './database.js';
import { validateBenchmarkManifest } from '../contracts/validate.js';

/** Pause without a provider-stated reset time (same defaults as the dev relay). */
export const DEFAULT_QUOTA_COOLDOWN_MS = 60 * 60_000;
export const DEFAULT_RATE_LIMIT_MS = 5 * 60_000;

const REQUIRED: (keyof ProviderEvidence)[] = ['provider', 'profile_id', 'cli_version', 'entrypoint', 'argv', 'auth', 'entitlement', 'extra_usage', 'models_allowed', 'isolation', 'process_control', 'output_contract', 'capabilities'];

/** AI accounts, D-01 evidence and data-recipient consent (06A §3.B.5, §1.4). Never stores a password, token or cookie. */
export class AiAccountsRepository {
  constructor(private db: Db, private now: () => Date = () => new Date()) {}

  upsertAccount(a: { profile_id: string; provider: CliProvider; label: string; runner_ref: string; state: AccountState }): void {
    this.db.prepare(`INSERT INTO ai_accounts (profile_id, provider, label, runner_ref, state, updated_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (profile_id) DO UPDATE SET label = excluded.label, runner_ref = excluded.runner_ref, state = excluded.state, updated_at = excluded.updated_at`)
      .run(a.profile_id, a.provider, a.label, a.runner_ref, a.state, this.now().toISOString());
  }

  /** Same-provider account rotation is off (06A §1.5): the gateway uses the first profile only. */
  account(provider: CliProvider): { profile_id: string; label: string; runner_ref: string; state: AccountState } | undefined {
    this.expireRuntimeCooldown(provider);
    return this.db.prepare('SELECT profile_id, label, runner_ref, state FROM ai_accounts WHERE provider = ? ORDER BY rowid LIMIT 1').get(provider) as
      { profile_id: string; label: string; runner_ref: string; state: AccountState } | undefined;
  }

  /**
   * A quota/rate-limit pause ends on its own: once the recorded reset time (or, without one, a default cooldown) has
   * passed, the profile returns to READY. Quota does not invalidate D-01 evidence — the guard still re-checks hash,
   * version and login on every run. NEEDS_LOGIN never auto-recovers (a person must sign in again).
   */
  private expireRuntimeCooldown(provider: CliProvider): void {
    const acc = this.db.prepare('SELECT profile_id, state FROM ai_accounts WHERE provider = ? ORDER BY rowid LIMIT 1').get(provider) as { profile_id: string; state: AccountState } | undefined;
    if (!acc || (acc.state !== 'QUOTA_EXHAUSTED' && acc.state !== 'COOLDOWN')) return;
    const ev = this.db.prepare("SELECT event_kind, reset_at, recorded_at FROM quota_events WHERE profile_id = ? AND event_kind IN ('QUOTA_EXHAUSTED', 'RATE_LIMIT') ORDER BY recorded_at DESC, rowid DESC LIMIT 1")
      .get(acc.profile_id) as { event_kind: string; reset_at: string | null; recorded_at: string } | undefined;
    if (!ev) return;
    const until = ev.reset_at ? Date.parse(ev.reset_at) : Date.parse(ev.recorded_at) + (ev.event_kind === 'RATE_LIMIT' ? DEFAULT_RATE_LIMIT_MS : DEFAULT_QUOTA_COOLDOWN_MS);
    const now = this.now();
    if (Number.isNaN(until) || now.getTime() < until) return;
    const at = now.toISOString();
    this.db.transaction(() => {
      this.db.prepare("UPDATE ai_accounts SET state = 'READY', updated_at = ? WHERE profile_id = ? AND state = ?").run(at, acc.profile_id, acc.state);
      this.db.prepare("INSERT INTO quota_events (event_id, provider, profile_id, event_kind, detail, reset_at, recorded_at) VALUES (?, ?, ?, 'RECOVERED', ?, NULL, ?)")
        .run(randomUUID(), provider, acc.profile_id, `auto: ${acc.state} ended (reset ${ev.reset_at ?? 'default cooldown'})`, at);
    }).immediate();
  }

  recordEvidence(evidence: ProviderEvidence, envelope: EnvelopeSpec): string {
    const missing = REQUIRED.filter((k) => evidence[k] === undefined);
    if (missing.length) throw new Error(`Evidence missing fields: ${missing.join(', ')}`);
    const json = canonicalJson({ evidence, envelope });
    if (containsSecretLike(json)) throw new Error('Evidence looks like it contains a credential; remove it and record only non-secret observations');
    if (!this.account(evidence.provider)) throw new Error('Register the account profile before recording evidence');
    const id = randomUUID();
    this.db.prepare('INSERT INTO provider_verifications (verification_id, provider, profile_id, cli_version, entrypoint_sha256, evidence_json, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, evidence.provider, evidence.profile_id, evidence.cli_version, evidence.entrypoint.sha256, json, this.now().toISOString());
    return id;
  }

  latestEvidence(provider: CliProvider): { evidence: ProviderEvidence; envelope: EnvelopeSpec } | undefined {
    const row = this.db.prepare('SELECT evidence_json FROM provider_verifications WHERE provider = ? ORDER BY recorded_at DESC, rowid DESC LIMIT 1').get(provider) as { evidence_json: string } | undefined;
    return row && JSON.parse(row.evidence_json);
  }

  setConsent(provider: CliProvider, dataClass: DataClass, granted: boolean): void {
    if (granted && NEVER_SENT_DATA_CLASSES.includes(dataClass)) throw new Error(`${dataClass} is never sent to any provider (E-11); it cannot be granted`);
    this.db.prepare('INSERT INTO ai_data_consents (event_id, provider, data_class, granted, recorded_at) VALUES (?, ?, ?, ?, ?)').run(randomUUID(), provider, dataClass, granted ? 1 : 0, this.now().toISOString());
  }

  /**
   * E-11 (2): grant exactly the user-approved classes to one provider whose profile passed D-01 (state READY, set
   * only by `npm run ai -- evidence` when the guard passes). Never extends to other providers or to learner_audio.
   */
  grantUserApprovedDataClasses(provider: CliProvider): DataClass[] {
    const account = this.account(provider);
    if (account?.state !== 'READY') throw new Error(`${provider} is not D-01 verified (profile state ${account?.state ?? 'missing'}); consent is not granted`);
    this.db.transaction(() => { for (const d of USER_APPROVED_DATA_CLASSES) this.setConsent(provider, d, true); }).immediate();
    return [...USER_APPROVED_DATA_CLASSES];
  }

  /** E-11 (5): the user states, now, that extra usage / auto-recharge is off for this provider's account. */
  confirmExtraUsageOff(provider: CliProvider, note: string): string {
    if (containsSecretLike(note)) throw new Error('Note looks like it contains a credential');
    const at = this.now().toISOString();
    this.db.prepare('INSERT INTO extra_usage_confirmations (event_id, provider, confirmed_at, note) VALUES (?, ?, ?, ?)').run(randomUUID(), provider, at, note);
    return at;
  }

  latestExtraUsageConfirmation(provider: CliProvider): string | undefined {
    const row = this.db.prepare('SELECT confirmed_at FROM extra_usage_confirmations WHERE provider = ? ORDER BY confirmed_at DESC, rowid DESC LIMIT 1').get(provider) as { confirmed_at: string } | undefined;
    return row?.confirmed_at;
  }

  /** Latest event per data class wins; no event means not allowed. */
  consents(provider: CliProvider): Set<DataClass> {
    const rows = this.db.prepare('SELECT data_class, granted FROM ai_data_consents WHERE provider = ? ORDER BY recorded_at, rowid').all(provider) as { data_class: DataClass; granted: number }[];
    const latest = new Map<DataClass, boolean>();
    for (const r of rows) latest.set(r.data_class, r.granted === 1);
    return new Set([...latest].filter(([, g]) => g).map(([d]) => d));
  }

  /** P4 (06A §6.B): cập nhật trạng thái runtime của tài khoản khi hết quota, bị rate-limit hoặc hết hạn phiên đăng nhập. */
  recordRuntimeFailure(provider: CliProvider, error: 'QUOTA_EXHAUSTED' | 'RATE_LIMIT' | 'AUTH_EXPIRED', detail: string, resetAt: string | null = null): void {
    const acc = this.account(provider);
    if (!acc) return;
    const nextState: AccountState = error === 'QUOTA_EXHAUSTED' ? 'QUOTA_EXHAUSTED' : error === 'RATE_LIMIT' ? 'COOLDOWN' : 'NEEDS_LOGIN';
    const at = this.now().toISOString();
    this.db.transaction(() => {
      this.db.prepare('UPDATE ai_accounts SET state = ?, updated_at = ? WHERE profile_id = ?').run(nextState, at, acc.profile_id);
      this.db.prepare('INSERT INTO quota_events (event_id, provider, profile_id, event_kind, detail, reset_at, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(randomUUID(), provider, acc.profile_id, error, detail, resetAt, at);
    }).immediate();
  }

  /** P4: khôi phục trạng thái READY cho provider đã có bằng chứng D-01 sau khi hạn mức mở lại hoặc đăng nhập lại. */
  recoverAccount(provider: CliProvider, detail = 'quota or login recovered'): void {
    const acc = this.account(provider);
    if (!acc) throw new Error(`No account registered for ${provider}`);
    if (!this.latestEvidence(provider)) throw new Error(`Cannot recover ${provider} to READY without D-01 evidence`);
    const at = this.now().toISOString();
    this.db.transaction(() => {
      // Recovery is not verification: normal onboarding must recheck D-01 before READY.
      this.db.prepare("UPDATE ai_accounts SET state = 'NEEDS_VERIFICATION', updated_at = ? WHERE profile_id = ?").run(at, acc.profile_id);
      this.db.prepare("INSERT INTO quota_events (event_id, provider, profile_id, event_kind, detail, reset_at, recorded_at) VALUES (?, ?, ?, 'RECOVERED', ?, NULL, ?)")
        .run(randomUUID(), provider, acc.profile_id, detail, at);
    }).immediate();
  }

  quotaEvents(provider?: CliProvider): { event_id: string; provider: CliProvider; profile_id: string; event_kind: string; detail: string; reset_at: string | null; recorded_at: string }[] {
    if (provider) {
      return this.db.prepare('SELECT * FROM quota_events WHERE provider = ? ORDER BY recorded_at, rowid').all(provider) as ReturnType<AiAccountsRepository['quotaEvents']>;
    }
    return this.db.prepare('SELECT * FROM quota_events ORDER BY recorded_at, rowid').all() as ReturnType<AiAccountsRepository['quotaEvents']>;
  }

  // ---- P4 Item 4: D-05 Benchmark Suite & Backup Provider Gate (04 §6.B, 05 §8.D) -----------------
  registerBenchmarkSuite(suite: BenchmarkSuiteManifest): { suite_id: string; version: string; hash: string } {
    if (!validateBenchmarkManifest(suite)) throw new Error('benchmark_suite schema invalid');
    const checked = validateBenchmarkSuite(suite);
    if (!checked.ok) throw new Error(`benchmark_suite invalid: ${checked.errors.join(', ')}`);
    const json = canonicalJson(suite);
    const hash = sha256(json);
    const prior = this.db.prepare('SELECT suite_hash FROM benchmark_suites WHERE suite_id = ? AND version = ?')
      .get(suite.suite_id, suite.version) as { suite_hash: string } | undefined;
    if (prior) {
      if (prior.suite_hash !== hash) throw new Error(`Benchmark suite ${suite.suite_id}@${suite.version} already registered with different content`);
      return { suite_id: suite.suite_id, version: suite.version, hash };
    }
    this.db.prepare('INSERT INTO benchmark_suites (suite_id, version, content_origin, usage_rights, suite_hash, suite_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(suite.suite_id, suite.version, suite.content_origin, suite.usage_rights, hash, json, this.now().toISOString());
    return { suite_id: suite.suite_id, version: suite.version, hash };
  }

  benchmarkSuite(suiteId: string, version: string): { suite: BenchmarkSuiteManifest; hash: string } | undefined {
    const row = this.db.prepare('SELECT suite_json, suite_hash FROM benchmark_suites WHERE suite_id = ? AND version = ?')
      .get(suiteId, version) as { suite_json: string; suite_hash: string } | undefined;
    return row && { suite: JSON.parse(row.suite_json) as BenchmarkSuiteManifest, hash: row.suite_hash };
  }

  recordBenchmarkReport(input: Omit<BenchmarkRunReport, 'schema_version' | 'report_id' | 'recorded_at'> & { report_id?: string }): BenchmarkRunReport {
    const suiteRow = this.benchmarkSuite(input.suite_id, input.suite_version);
    if (!suiteRow) throw new Error(`Unknown benchmark suite ${input.suite_id}@${input.suite_version}`);
    if (suiteRow.hash !== input.suite_hash) throw new Error('Benchmark report suite_hash does not match registered benchmark suite');
    if (input.content_origin !== suiteRow.suite.content_origin || !Number.isSafeInteger(input.holdout_cases_evaluated) || input.holdout_cases_evaluated < 0) throw new Error('Invalid benchmark report origin/count');
    const jsonFindings = canonicalJson(input.findings);
    if (containsSecretLike(jsonFindings)) throw new Error('Benchmark findings look like they contain a credential');
    const report: BenchmarkRunReport = {
      schema_version: '1',
      report_id: input.report_id ?? randomUUID(),
      suite_id: input.suite_id,
      suite_version: input.suite_version,
      suite_hash: input.suite_hash,
      provider: input.provider,
      cli_version: input.cli_version,
      model: input.model,
      content_origin: input.content_origin,
      holdout_cases_evaluated: input.holdout_cases_evaluated,
      passed: input.passed,
      findings: input.findings,
      recorded_at: this.now().toISOString(),
    };
    this.db.prepare(`INSERT INTO benchmark_run_reports (report_id, suite_id, suite_version, suite_hash, provider, cli_version, model, content_origin, holdout_cases_evaluated, passed, findings_json, recorded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      report.report_id, report.suite_id, report.suite_version, report.suite_hash, report.provider, report.cli_version,
      report.model, report.content_origin, report.holdout_cases_evaluated, report.passed ? 1 : 0, jsonFindings, report.recorded_at,
    );
    return report;
  }

  latestBenchmarkFor(provider: CliProvider): { suite: BenchmarkSuiteManifest | undefined; suite_hash: string | undefined; report: BenchmarkRunReport | undefined } {
    const row = this.db.prepare('SELECT * FROM benchmark_run_reports WHERE provider = ? ORDER BY recorded_at DESC, rowid DESC LIMIT 1').get(provider) as {
      report_id: string; suite_id: string; suite_version: string; suite_hash: string; provider: CliProvider; cli_version: string;
      model: string; content_origin: 'synthetic_fixture' | 'sourced'; holdout_cases_evaluated: number; passed: number; findings_json: string; recorded_at: string;
    } | undefined;
    if (!row) return { suite: undefined, suite_hash: undefined, report: undefined };
    const suiteRow = this.benchmarkSuite(row.suite_id, row.suite_version);
    const report: BenchmarkRunReport = {
      schema_version: '1',
      report_id: row.report_id,
      suite_id: row.suite_id,
      suite_version: row.suite_version,
      suite_hash: row.suite_hash,
      provider: row.provider,
      cli_version: row.cli_version,
      model: row.model,
      content_origin: row.content_origin,
      holdout_cases_evaluated: row.holdout_cases_evaluated,
      passed: row.passed === 1,
      findings: JSON.parse(row.findings_json) as string[],
      recorded_at: row.recorded_at,
    };
    return { suite: suiteRow?.suite, suite_hash: suiteRow?.hash, report };
  }

  /** Cổng D-05 kiểm tra điều kiện bật provider dự phòng trước khi cho phép failover. */
  canEnableBackupProvider(provider: CliProvider, options: { cli_version: string; model: string; require_sourced?: boolean }): BackupBenchmarkGateDecision {
    const latest = this.latestBenchmarkFor(provider);
    return evaluateBackupProviderBenchmarkGate({
      target: {
        provider,
        cli_version: options.cli_version,
        model: options.model,
        require_sourced: options.require_sourced ?? true,
      },
      ...latest,
    });
  }
}
