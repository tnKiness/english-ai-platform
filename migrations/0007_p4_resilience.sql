-- 0007_p4_resilience — P4 multi-provider quota/runtime tracking, D-05 benchmark suite & gate,
-- learner complaints / traced re-evaluation, and compare-and-set replan proposals (04 §6.B–C, 05 §7.A, 06 §6.A.4, 06A §6.B/§9.B.3/§10.B).
-- Applied migrations are immutable: change the schema with a new numbered file.

-- Append-only log of runtime quota/rate-limit/auth-expiry observations per provider profile (06A §6.B).
CREATE TABLE quota_events (
  event_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('codex', 'claude-code', 'agy')),
  profile_id TEXT NOT NULL REFERENCES ai_accounts (profile_id),
  event_kind TEXT NOT NULL CHECK (event_kind IN ('QUOTA_EXHAUSTED', 'RATE_LIMIT', 'AUTH_EXPIRED', 'RECOVERED')),
  detail TEXT NOT NULL,
  reset_at TEXT,
  recorded_at TEXT NOT NULL
);
CREATE INDEX quota_events_provider ON quota_events (provider, recorded_at);
CREATE TRIGGER quota_events_no_update BEFORE UPDATE ON quota_events BEGIN SELECT RAISE(ABORT, 'immutable: quota_events'); END;
CREATE TRIGGER quota_events_no_delete BEFORE DELETE ON quota_events BEGIN SELECT RAISE(ABORT, 'immutable: quota_events'); END;

-- D-05 Benchmark Suite Manifest (04 §6.B, 05 §8.D): separates dev vs holdout splits and tracks source rights.
CREATE TABLE benchmark_suites (
  suite_id TEXT NOT NULL,
  version TEXT NOT NULL,
  content_origin TEXT NOT NULL CHECK (content_origin IN ('synthetic_fixture', 'sourced')),
  usage_rights TEXT NOT NULL CHECK (usage_rights IN ('verified', 'unknown')),
  suite_hash TEXT NOT NULL CHECK (length(suite_hash) = 64),
  suite_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (suite_id, version)
);
CREATE TRIGGER benchmark_suites_no_update BEFORE UPDATE ON benchmark_suites BEGIN SELECT RAISE(ABORT, 'immutable: benchmark_suites'); END;
CREATE TRIGGER benchmark_suites_no_delete BEFORE DELETE ON benchmark_suites BEGIN SELECT RAISE(ABORT, 'immutable: benchmark_suites'); END;

-- D-05 Benchmark Run Reports: gate before enabling a backup provider for failover (04 §6.B.2, 06A §3.B.7).
CREATE TABLE benchmark_run_reports (
  report_id TEXT PRIMARY KEY,
  suite_id TEXT NOT NULL,
  suite_version TEXT NOT NULL,
  suite_hash TEXT NOT NULL CHECK (length(suite_hash) = 64),
  provider TEXT NOT NULL CHECK (provider IN ('codex', 'claude-code', 'agy')),
  cli_version TEXT NOT NULL,
  model TEXT NOT NULL,
  content_origin TEXT NOT NULL CHECK (content_origin IN ('synthetic_fixture', 'sourced')),
  holdout_cases_evaluated INTEGER NOT NULL CHECK (holdout_cases_evaluated >= 0),
  passed INTEGER NOT NULL CHECK (passed IN (0, 1)),
  findings_json TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  FOREIGN KEY (suite_id, suite_version) REFERENCES benchmark_suites (suite_id, version)
);
CREATE INDEX benchmark_reports_provider ON benchmark_run_reports (provider, recorded_at);
CREATE TRIGGER benchmark_run_reports_no_update BEFORE UPDATE ON benchmark_run_reports BEGIN SELECT RAISE(ABORT, 'immutable: benchmark_run_reports'); END;
CREATE TRIGGER benchmark_run_reports_no_delete BEFORE DELETE ON benchmark_run_reports BEGIN SELECT RAISE(ABORT, 'immutable: benchmark_run_reports'); END;

-- Learner complaints and traced re-evaluations on the same evidence source (04 §4.B.2, 05 §7.A, 06 §5.B.5).
CREATE TABLE learner_complaints (
  complaint_id TEXT PRIMARY KEY,
  request_key TEXT NOT NULL UNIQUE,
  attempt_id TEXT NOT NULL REFERENCES attempts (attempt_id),
  submission_id TEXT NOT NULL REFERENCES submissions (submission_id),
  evidence_source_id TEXT NOT NULL REFERENCES evidence_sources (evidence_source_id),
  target_observation_id TEXT NOT NULL REFERENCES observations (observation_id),
  competency_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('OPEN', 'RE_EVALUATING', 'RESOLVED')),
  outcome_category TEXT CHECK (outcome_category IS NULL OR outcome_category IN (
    'faulty_item_or_key',
    'valid_answer_missed',
    'insufficient_signal',
    'unresolved_dispute',
    'technical_error'
  )),
  reeval_job_id TEXT REFERENCES ai_jobs (job_id),
  superseding_observation_id TEXT REFERENCES observations (observation_id),
  review_id TEXT REFERENCES review_items (review_id),
  resolution_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX learner_complaints_submission ON learner_complaints (submission_id, created_at);

CREATE TRIGGER learner_complaints_same_source BEFORE INSERT ON learner_complaints
WHEN (SELECT evidence_source_id FROM observations WHERE observation_id = NEW.target_observation_id) IS NOT NEW.evidence_source_id
  OR (SELECT submission_id FROM observations WHERE observation_id = NEW.target_observation_id) IS NOT NEW.submission_id
  OR (SELECT attempt_id FROM submissions WHERE submission_id = NEW.submission_id) IS NOT NEW.attempt_id
BEGIN SELECT RAISE(ABORT, 'complaint must reference observation of the same attempt, submission and evidence source'); END;

CREATE TRIGGER learner_complaints_provenance_frozen BEFORE UPDATE ON learner_complaints
WHEN NEW.attempt_id IS NOT OLD.attempt_id
  OR NEW.submission_id IS NOT OLD.submission_id
  OR NEW.evidence_source_id IS NOT OLD.evidence_source_id
  OR NEW.target_observation_id IS NOT OLD.target_observation_id
  OR NEW.request_key IS NOT OLD.request_key
BEGIN SELECT RAISE(ABORT, 'complaint provenance is immutable'); END;

CREATE TRIGGER learner_complaints_no_delete BEFORE DELETE ON learner_complaints BEGIN SELECT RAISE(ABORT, 'immutable: learner_complaints'); END;

-- Monotonic study plan version counter and compare-and-set replan proposals (06A §9.B.3, §10.B ca 10).
CREATE TABLE plan_versions (
  plan_id TEXT PRIMARY KEY,
  plan_version INTEGER NOT NULL CHECK (plan_version >= 1),
  updated_at TEXT NOT NULL
);
CREATE TRIGGER plan_versions_monotonic BEFORE UPDATE ON plan_versions
WHEN NEW.plan_version < OLD.plan_version
BEGIN SELECT RAISE(ABORT, 'plan_version cannot move backwards'); END;
CREATE TRIGGER plan_versions_no_delete BEFORE DELETE ON plan_versions BEGIN SELECT RAISE(ABORT, 'immutable: plan_versions'); END;

CREATE TABLE replan_proposals (
  proposal_id TEXT PRIMARY KEY,
  base_plan_version INTEGER NOT NULL CHECK (base_plan_version >= 1),
  changes_json TEXT NOT NULL,
  reasons_json TEXT NOT NULL,
  estimated_minutes INTEGER NOT NULL CHECK (estimated_minutes >= 0),
  expires_at TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('PROPOSED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'STALE')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TRIGGER replan_proposals_frozen BEFORE UPDATE ON replan_proposals
WHEN NEW.base_plan_version IS NOT OLD.base_plan_version
  OR NEW.changes_json IS NOT OLD.changes_json
  OR NEW.reasons_json IS NOT OLD.reasons_json
  OR (OLD.state IN ('ACCEPTED', 'REJECTED', 'EXPIRED', 'STALE') AND NEW.state IS NOT OLD.state)
BEGIN SELECT RAISE(ABORT, 'replan proposal base version, changes or terminal state cannot change'); END;
CREATE TRIGGER replan_proposals_no_delete BEFORE DELETE ON replan_proposals BEGIN SELECT RAISE(ABORT, 'immutable: replan_proposals'); END;
