-- E-47 (D-05 C3, 20/11/2026): AI-authored Writing Task 2 prompts add two authoring task types, 'content.item_author'
-- and 'content.item_review', to the append-only record of content AI calls. SQLite cannot change a CHECK
-- constraint, so authoring_runs is rebuilt with the technique of 0003/0014: legacy_alter_table keeps the
-- competency_frameworks foreign keys pointing at the table name; every row is copied; index and triggers are recreated.
PRAGMA legacy_alter_table = ON;

ALTER TABLE authoring_runs RENAME TO authoring_runs_pre_0016;
CREATE TABLE authoring_runs (
  run_id TEXT PRIMARY KEY,
  task_type TEXT NOT NULL CHECK (task_type IN ('content.author', 'content.review', 'content.item_author', 'content.item_review')),
  target_id TEXT NOT NULL,
  target_version TEXT,
  provider TEXT NOT NULL,
  cli_version TEXT,
  model TEXT,
  input_hash TEXT NOT NULL CHECK (length(input_hash) = 64),
  output_hash TEXT CHECK (output_hash IS NULL OR length(output_hash) = 64),
  ok INTEGER NOT NULL CHECK (ok IN (0, 1)),
  error TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL
);
INSERT INTO authoring_runs SELECT * FROM authoring_runs_pre_0016;
DROP TABLE authoring_runs_pre_0016;
CREATE INDEX authoring_runs_target ON authoring_runs (target_id, started_at);
CREATE TRIGGER authoring_runs_no_update BEFORE UPDATE ON authoring_runs BEGIN SELECT RAISE(ABORT, 'immutable: authoring_runs'); END;
CREATE TRIGGER authoring_runs_no_delete BEFORE DELETE ON authoring_runs BEGIN SELECT RAISE(ABORT, 'immutable: authoring_runs'); END;
