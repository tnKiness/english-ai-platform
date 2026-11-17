-- 0008_provider_model_preferences — E-22: per-provider default model & effort preferences.
-- Applied to the user's DB on 21/10/2026; never edit (E-23 additions live in 0009).

CREATE TABLE provider_model_preferences (
  provider TEXT PRIMARY KEY CHECK (provider IN ('codex', 'claude-code', 'agy')),
  model TEXT NOT NULL,
  effort TEXT,
  updated_at TEXT NOT NULL
);

CREATE TRIGGER provider_model_preferences_no_delete BEFORE DELETE ON provider_model_preferences
BEGIN SELECT RAISE(ABORT, 'immutable: provider_model_preferences cannot be deleted'); END;
