-- E-11 (20/10/2026, user decision): the Google-side CLI is Antigravity `agy`, replacing `gemini-cli`.
-- SQLite cannot change a CHECK constraint, so each table whose provider CHECK lists the CLIs is rebuilt with
-- 'agy' added. 'gemini-cli' stays accepted so rows written before E-11 are kept unchanged; new code never
-- writes it. legacy_alter_table keeps child foreign keys and trigger bodies pointing at the table *name*
-- while the old copy is renamed away; every row is copied and the append-only triggers are recreated.
PRAGMA legacy_alter_table = ON;

ALTER TABLE ai_runs RENAME TO ai_runs_pre_0003;
CREATE TABLE ai_runs (
  run_id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES ai_jobs (job_id),
  generation INTEGER NOT NULL CHECK (generation >= 1),
  execution_index INTEGER NOT NULL CHECK (execution_index BETWEEN 1 AND 3),
  purpose TEXT NOT NULL CHECK (purpose IN ('execute', 'format_repair')),
  lease_owner TEXT NOT NULL,
  lease_expires_at TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('RUNNING', 'VALIDATING', 'COMPLETED', 'FAILED', 'CANCELLED', 'STALE')),
  provider TEXT NOT NULL CHECK (provider IN ('fake', 'codex', 'claude-code', 'agy', 'gemini-cli')),
  cli_version TEXT,
  model TEXT,
  error TEXT,
  output_hash TEXT,
  output_json TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  UNIQUE (job_id, generation),
  UNIQUE (job_id, execution_index)
);
INSERT INTO ai_runs SELECT * FROM ai_runs_pre_0003;
DROP TABLE ai_runs_pre_0003;
CREATE TRIGGER ai_runs_no_delete BEFORE DELETE ON ai_runs BEGIN SELECT RAISE(ABORT, 'immutable: ai_runs'); END;

ALTER TABLE ai_accounts RENAME TO ai_accounts_pre_0003;
CREATE TABLE ai_accounts (
  profile_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('codex', 'claude-code', 'agy', 'gemini-cli')),
  label TEXT NOT NULL,
  runner_ref TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('NEEDS_LOGIN', 'NEEDS_VERIFICATION', 'READY', 'BUSY', 'COOLDOWN', 'QUOTA_EXHAUSTED', 'DISABLED')),
  updated_at TEXT NOT NULL
);
INSERT INTO ai_accounts SELECT * FROM ai_accounts_pre_0003;

ALTER TABLE provider_verifications RENAME TO provider_verifications_pre_0003;
CREATE TABLE provider_verifications (
  verification_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('codex', 'claude-code', 'agy', 'gemini-cli')),
  profile_id TEXT NOT NULL REFERENCES ai_accounts (profile_id),
  cli_version TEXT NOT NULL,
  entrypoint_sha256 TEXT NOT NULL CHECK (length(entrypoint_sha256) = 64),
  evidence_json TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);
INSERT INTO provider_verifications SELECT * FROM provider_verifications_pre_0003;
DROP TABLE provider_verifications_pre_0003;
DROP TABLE ai_accounts_pre_0003;
CREATE TRIGGER provider_verifications_no_update BEFORE UPDATE ON provider_verifications BEGIN SELECT RAISE(ABORT, 'immutable: provider_verifications'); END;
CREATE TRIGGER provider_verifications_no_delete BEFORE DELETE ON provider_verifications BEGIN SELECT RAISE(ABORT, 'immutable: provider_verifications'); END;
CREATE TRIGGER ai_accounts_no_delete BEFORE DELETE ON ai_accounts BEGIN SELECT RAISE(ABORT, 'immutable: ai_accounts'); END;

ALTER TABLE ai_data_consents RENAME TO ai_data_consents_pre_0003;
CREATE TABLE ai_data_consents (
  event_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('codex', 'claude-code', 'agy', 'gemini-cli')),
  data_class TEXT NOT NULL CHECK (data_class IN ('synthetic_fixture', 'knowledge_content', 'answer_key', 'learner_submission', 'learner_audio', 'learner_profile')),
  granted INTEGER NOT NULL CHECK (granted IN (0, 1)),
  recorded_at TEXT NOT NULL
);
INSERT INTO ai_data_consents SELECT * FROM ai_data_consents_pre_0003;
DROP TABLE ai_data_consents_pre_0003;
CREATE TRIGGER ai_data_consents_no_update BEFORE UPDATE ON ai_data_consents BEGIN SELECT RAISE(ABORT, 'immutable: ai_data_consents'); END;
CREATE TRIGGER ai_data_consents_no_delete BEFORE DELETE ON ai_data_consents BEGIN SELECT RAISE(ABORT, 'immutable: ai_data_consents'); END;

PRAGMA legacy_alter_table = OFF;

-- E-11 (5): the user re-confirms "extra usage / auto-recharge is off" at least every 30 days. Append-only; the
-- guard uses the latest confirmation per provider. A confirmation is the user's statement, never inferred.
CREATE TABLE extra_usage_confirmations (
  event_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('codex', 'claude-code', 'agy')),
  confirmed_at TEXT NOT NULL,
  note TEXT NOT NULL
);
CREATE INDEX extra_usage_confirmations_latest ON extra_usage_confirmations (provider, confirmed_at);
CREATE TRIGGER extra_usage_confirmations_no_update BEFORE UPDATE ON extra_usage_confirmations BEGIN SELECT RAISE(ABORT, 'immutable: extra_usage_confirmations'); END;
CREATE TRIGGER extra_usage_confirmations_no_delete BEFORE DELETE ON extra_usage_confirmations BEGIN SELECT RAISE(ABORT, 'immutable: extra_usage_confirmations'); END;
