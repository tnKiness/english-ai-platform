-- 0009_runtime_canary — E-23: user-declared allowed models, per-CLI-version model canary records and
-- runtime boundary block events. Split out of 0008 after 0008 had already been applied (21/10/2026).

-- E-23 (3)/(4): user-declared models_allowed list per provider (persists across CLI versions without re-running verify).
CREATE TABLE provider_allowed_models (
  event_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('codex', 'claude-code', 'agy')),
  models_json TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);
CREATE INDEX provider_allowed_models_provider ON provider_allowed_models (provider, recorded_at);
CREATE TRIGGER provider_allowed_models_no_update BEFORE UPDATE ON provider_allowed_models
BEGIN SELECT RAISE(ABORT, 'immutable: provider_allowed_models'); END;
CREATE TRIGGER provider_allowed_models_no_delete BEFORE DELETE ON provider_allowed_models
BEGIN SELECT RAISE(ABORT, 'immutable: provider_allowed_models'); END;

-- E-23 (3): model canary outcome per (provider, cli_version, model, effort). Append-only.
CREATE TABLE provider_model_canaries (
  canary_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('codex', 'claude-code', 'agy')),
  cli_version TEXT NOT NULL,
  model TEXT NOT NULL,
  effort TEXT NOT NULL DEFAULT '',
  passed INTEGER NOT NULL CHECK (passed IN (0, 1)),
  reason TEXT,
  recorded_at TEXT NOT NULL
);
CREATE INDEX provider_model_canaries_lookup ON provider_model_canaries (provider, cli_version, model, effort, recorded_at);
CREATE TRIGGER provider_model_canaries_no_update BEFORE UPDATE ON provider_model_canaries
BEGIN SELECT RAISE(ABORT, 'immutable: provider_model_canaries'); END;
CREATE TRIGGER provider_model_canaries_no_delete BEFORE DELETE ON provider_model_canaries
BEGIN SELECT RAISE(ABORT, 'immutable: provider_model_canaries'); END;

-- E-23 (2): runtime self-check boundary blocks (e.g. RUNTIME_TOOLS_PRESENT, RUNTIME_DENY_RULES_CHANGED, RUNTIME_TOOL_EXECUTED).
CREATE TABLE provider_runtime_blocks (
  block_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('codex', 'claude-code', 'agy')),
  profile_id TEXT NOT NULL REFERENCES ai_accounts (profile_id),
  event_kind TEXT NOT NULL CHECK (event_kind IN ('BLOCKED', 'CLEARED')),
  reason TEXT NOT NULL,
  detail TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);
CREATE INDEX provider_runtime_blocks_provider ON provider_runtime_blocks (provider, recorded_at);
CREATE TRIGGER provider_runtime_blocks_no_update BEFORE UPDATE ON provider_runtime_blocks
BEGIN SELECT RAISE(ABORT, 'immutable: provider_runtime_blocks'); END;
CREATE TRIGGER provider_runtime_blocks_no_delete BEFORE DELETE ON provider_runtime_blocks
BEGIN SELECT RAISE(ABORT, 'immutable: provider_runtime_blocks'); END;
