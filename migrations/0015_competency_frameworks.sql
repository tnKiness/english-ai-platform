-- E-42 (D-05 C2, 19/11/2026): AI-authored competency framework drafts and the record of every authoring run.
-- authoring_runs is append-only: one row per real (or test) AI call for content work, with the provider actually used,
-- the hash of what was sent and of what came back. The framework itself is an immutable JSON object
-- (knowledge/<framework_id>/<version>.json); this table only tracks its review state. A draft becomes APPROVED or
-- REJECTED once, by the learner; approving a newer version marks the previous approved one SUPERSEDED.
CREATE TABLE authoring_runs (
  run_id TEXT PRIMARY KEY,
  task_type TEXT NOT NULL CHECK (task_type IN ('content.author', 'content.review')),
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
CREATE INDEX authoring_runs_target ON authoring_runs (target_id, started_at);
CREATE TRIGGER authoring_runs_no_update BEFORE UPDATE ON authoring_runs BEGIN SELECT RAISE(ABORT, 'immutable: authoring_runs'); END;
CREATE TRIGGER authoring_runs_no_delete BEFORE DELETE ON authoring_runs BEGIN SELECT RAISE(ABORT, 'immutable: authoring_runs'); END;

CREATE TABLE competency_frameworks (
  framework_id TEXT NOT NULL,
  version TEXT NOT NULL,
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
  author_run_id TEXT NOT NULL REFERENCES authoring_runs (run_id),
  review_run_id TEXT REFERENCES authoring_runs (run_id),
  check_errors INTEGER NOT NULL CHECK (check_errors >= 0),
  check_warnings INTEGER NOT NULL CHECK (check_warnings >= 0),
  state TEXT NOT NULL CHECK (state IN ('DRAFT', 'APPROVED', 'REJECTED', 'SUPERSEDED')),
  decision_note TEXT,
  created_at TEXT NOT NULL,
  decided_at TEXT,
  PRIMARY KEY (framework_id, version)
);
CREATE UNIQUE INDEX competency_frameworks_one_approved ON competency_frameworks (framework_id) WHERE state = 'APPROVED';
-- Content and provenance never change; only DRAFT → APPROVED/REJECTED (once), attaching a review to a DRAFT, and
-- APPROVED → SUPERSEDED.
CREATE TRIGGER competency_frameworks_guard BEFORE UPDATE ON competency_frameworks
WHEN NEW.content_hash <> OLD.content_hash OR NEW.author_run_id <> OLD.author_run_id OR NEW.created_at <> OLD.created_at
  OR NEW.check_errors <> OLD.check_errors OR NEW.check_warnings <> OLD.check_warnings
  OR NOT (
    (OLD.state = 'DRAFT' AND NEW.state IN ('DRAFT', 'APPROVED', 'REJECTED'))
    OR (OLD.state = 'APPROVED' AND NEW.state = 'SUPERSEDED' AND NEW.review_run_id IS OLD.review_run_id)
  )
  OR (OLD.state <> 'DRAFT' AND NEW.review_run_id IS NOT OLD.review_run_id)
BEGIN SELECT RAISE(ABORT, 'immutable: competency_frameworks'); END;
CREATE TRIGGER competency_frameworks_no_delete BEFORE DELETE ON competency_frameworks BEGIN SELECT RAISE(ABORT, 'immutable: competency_frameworks'); END;
