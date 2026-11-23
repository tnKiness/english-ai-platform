-- E-51 (D-05 C4/N7, 20/11/2026): material the learner imported and owns is its own consent class,
-- 'learner_owned_content', instead of borrowing learner_submission (E-41). Consents stay append-only and
-- default-deny: the learner grants the new class per provider. ai_data_consents is rebuilt like in 0003 because
-- SQLite cannot change a CHECK constraint; every row is copied and the append-only triggers are recreated.
PRAGMA legacy_alter_table = ON;

ALTER TABLE ai_data_consents RENAME TO ai_data_consents_pre_0018;
CREATE TABLE ai_data_consents (
  event_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('codex', 'claude-code', 'agy', 'gemini-cli')),
  data_class TEXT NOT NULL CHECK (data_class IN ('synthetic_fixture', 'knowledge_content', 'answer_key', 'learner_submission', 'learner_audio', 'learner_profile', 'learner_owned_content')),
  granted INTEGER NOT NULL CHECK (granted IN (0, 1)),
  recorded_at TEXT NOT NULL
);
INSERT INTO ai_data_consents SELECT * FROM ai_data_consents_pre_0018;
DROP TABLE ai_data_consents_pre_0018;
CREATE TRIGGER ai_data_consents_no_update BEFORE UPDATE ON ai_data_consents BEGIN SELECT RAISE(ABORT, 'immutable: ai_data_consents'); END;
CREATE TRIGGER ai_data_consents_no_delete BEFORE DELETE ON ai_data_consents BEGIN SELECT RAISE(ABORT, 'immutable: ai_data_consents'); END;

PRAGMA legacy_alter_table = OFF;
