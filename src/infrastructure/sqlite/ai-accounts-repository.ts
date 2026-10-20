import { randomUUID } from 'node:crypto';
import { NEVER_SENT_DATA_CLASSES, USER_APPROVED_DATA_CLASSES, type AccountState, type CliProvider, type DataClass, type ProviderEvidence } from '../../application/ai/subscription-guard.js';
import type { EnvelopeSpec } from '../ai/gateway/envelope.js';
import { containsSecretLike } from '../ai/gateway/redaction.js';
import { canonicalJson } from '../files/paths.js';
import type { Db } from './database.js';

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
    return this.db.prepare('SELECT profile_id, label, runner_ref, state FROM ai_accounts WHERE provider = ? ORDER BY rowid LIMIT 1').get(provider) as
      { profile_id: string; label: string; runner_ref: string; state: AccountState } | undefined;
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
}
