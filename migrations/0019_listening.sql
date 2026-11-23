-- E-54 (D-05 N1/N5, E-44, 20/11/2026): AI-authored Listening parts. Two authoring task types join the append-only
-- record of content AI calls: 'content.listening_author' (script + questions + key) and 'content.listening_solve'
-- (an independent blind solve on the transcript, no key: QC4). authoring_runs is rebuilt like in 0016 because
-- SQLite cannot change a CHECK constraint. Listening attempts pin their answer key like Reading (0005); results are
-- immutable.
PRAGMA legacy_alter_table = ON;

ALTER TABLE authoring_runs RENAME TO authoring_runs_pre_0019;
CREATE TABLE authoring_runs (
  run_id TEXT PRIMARY KEY,
  task_type TEXT NOT NULL CHECK (task_type IN ('content.author', 'content.review', 'content.item_author', 'content.item_review', 'content.listening_author', 'content.listening_solve')),
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
INSERT INTO authoring_runs SELECT * FROM authoring_runs_pre_0019;
DROP TABLE authoring_runs_pre_0019;
CREATE INDEX authoring_runs_target ON authoring_runs (target_id, started_at);
CREATE TRIGGER authoring_runs_no_update BEFORE UPDATE ON authoring_runs BEGIN SELECT RAISE(ABORT, 'immutable: authoring_runs'); END;
CREATE TRIGGER authoring_runs_no_delete BEFORE DELETE ON authoring_runs BEGIN SELECT RAISE(ABORT, 'immutable: authoring_runs'); END;

PRAGMA legacy_alter_table = OFF;

CREATE TABLE listening_sessions (
  attempt_id TEXT PRIMARY KEY REFERENCES attempts (attempt_id),
  key_id TEXT NOT NULL,
  key_version TEXT NOT NULL,
  key_hash TEXT NOT NULL CHECK (length(key_hash) = 64),
  plays INTEGER NOT NULL DEFAULT 0 CHECK (plays >= 0)
);
CREATE TABLE listening_results (
  submission_id TEXT PRIMARY KEY REFERENCES submissions (submission_id),
  results_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TRIGGER listening_results_no_update BEFORE UPDATE ON listening_results BEGIN SELECT RAISE(ABORT, 'immutable: listening_results'); END;
CREATE TRIGGER listening_results_no_delete BEFORE DELETE ON listening_results BEGIN SELECT RAISE(ABORT, 'immutable: listening_results'); END;
