-- D-02 v1 (E-33, user decision 18/11/2026): verification-chain metadata on scheduled tasks and an append-only
-- history of competency conclusions. Old conclusions are never rewritten; a new policy version writes new rows.

ALTER TABLE scheduled_tasks ADD COLUMN policy_version TEXT;
ALTER TABLE scheduled_tasks ADD COLUMN schedule_reason TEXT;
ALTER TABLE scheduled_tasks ADD COLUMN interval_days INTEGER CHECK (interval_days IS NULL OR interval_days >= 0);
ALTER TABLE scheduled_tasks ADD COLUMN step9_index INTEGER CHECK (step9_index IS NULL OR step9_index >= 0);
ALTER TABLE scheduled_tasks ADD COLUMN absent_count INTEGER NOT NULL DEFAULT 0 CHECK (absent_count >= 0);
ALTER TABLE scheduled_tasks ADD COLUMN constraint_kind TEXT CHECK (constraint_kind IS NULL OR constraint_kind IN ('semantic', 'explicit_form'));

CREATE TABLE competency_conclusions (
  conclusion_id TEXT PRIMARY KEY,
  competency_id TEXT NOT NULL,
  policy_id TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  policy_hash TEXT NOT NULL CHECK (length(policy_hash) = 64),
  -- Hash of the evidence the conclusion was computed from (source ids, outcomes, uses): same evidence + same policy = same row.
  evidence_fingerprint TEXT NOT NULL CHECK (length(evidence_fingerprint) = 64),
  level TEXT NOT NULL CHECK (level IN ('A1', 'A2', 'A3', 'A4', 'A5', 'A6')),
  confidence TEXT NOT NULL CHECK (confidence IN ('B0', 'B1', 'B2', 'B3')),
  decision_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (competency_id, policy_hash, evidence_fingerprint)
);
CREATE INDEX competency_conclusions_latest ON competency_conclusions (competency_id, created_at);
CREATE TRIGGER competency_conclusions_no_update BEFORE UPDATE ON competency_conclusions BEGIN SELECT RAISE(ABORT, 'immutable: competency_conclusions'); END;
CREATE TRIGGER competency_conclusions_no_delete BEFORE DELETE ON competency_conclusions BEGIN SELECT RAISE(ABORT, 'immutable: competency_conclusions'); END;
