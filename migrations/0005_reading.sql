CREATE TABLE reading_sessions (
  attempt_id TEXT PRIMARY KEY REFERENCES attempts(attempt_id),
  key_id TEXT NOT NULL,
  key_version TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  unlocked_level INTEGER NOT NULL DEFAULT 0 CHECK(unlocked_level BETWEEN 0 AND 3)
);
CREATE TABLE reading_results (
  submission_id TEXT PRIMARY KEY REFERENCES submissions(submission_id),
  results_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TRIGGER reading_results_no_update BEFORE UPDATE ON reading_results BEGIN SELECT RAISE(ABORT, 'immutable'); END;
CREATE TRIGGER reading_results_no_delete BEFORE DELETE ON reading_results BEGIN SELECT RAISE(ABORT, 'immutable'); END;
