-- 0001_core — P1 persistence for P0_DATA_AND_STATE ERD. Applied migrations are immutable:
-- change the schema with a new numbered file, never edit this one after it has been applied.
-- Times are UTC ISO-8601 strings with millisecond precision ("...Z"), so text comparison is chronological.

-- Immutable versioned JSON store index (files live under var/knowledge; DB only keeps path + hash).
CREATE TABLE json_objects (
  kind TEXT NOT NULL CHECK (kind IN ('item', 'rubric', 'package', 'knowledge', 'policy')),
  object_id TEXT NOT NULL,
  version TEXT NOT NULL,
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
  rel_path TEXT NOT NULL UNIQUE,
  bytes INTEGER NOT NULL CHECK (bytes >= 0),
  created_at TEXT NOT NULL,
  PRIMARY KEY (kind, object_id, version)
);

-- Content-addressed local media; SQLite keeps only id, relative path and checksum.
CREATE TABLE media_assets (
  media_id TEXT PRIMARY KEY,
  rel_path TEXT NOT NULL UNIQUE,
  sha256 TEXT NOT NULL UNIQUE CHECK (length(sha256) = 64),
  bytes INTEGER NOT NULL CHECK (bytes >= 0),
  media_type TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE package_versions (
  package_id TEXT NOT NULL,
  version TEXT NOT NULL,
  json_kind TEXT NOT NULL DEFAULT 'package' CHECK (json_kind = 'package'),
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
  usage_rights TEXT NOT NULL CHECK (usage_rights IN ('verified', 'unknown')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (package_id, version),
  FOREIGN KEY (json_kind, package_id, version) REFERENCES json_objects (kind, object_id, version)
);

CREATE TABLE package_dependencies (
  package_id TEXT NOT NULL,
  package_version TEXT NOT NULL,
  dep_kind TEXT NOT NULL,
  dep_id TEXT NOT NULL,
  dep_version TEXT NOT NULL,
  dep_hash TEXT NOT NULL CHECK (length(dep_hash) = 64),
  PRIMARY KEY (package_id, package_version, dep_kind, dep_id, dep_version),
  FOREIGN KEY (package_id, package_version) REFERENCES package_versions (package_id, version),
  FOREIGN KEY (dep_kind, dep_id, dep_version) REFERENCES json_objects (kind, object_id, version)
);

CREATE TABLE item_versions (
  item_id TEXT NOT NULL,
  version TEXT NOT NULL,
  json_kind TEXT NOT NULL DEFAULT 'item' CHECK (json_kind = 'item'),
  package_id TEXT NOT NULL,
  package_version TEXT NOT NULL,
  item_family_id TEXT NOT NULL,
  shared_stimulus_id TEXT,
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
  created_at TEXT NOT NULL,
  PRIMARY KEY (item_id, version),
  FOREIGN KEY (json_kind, item_id, version) REFERENCES json_objects (kind, object_id, version),
  FOREIGN KEY (package_id, package_version) REFERENCES package_versions (package_id, version)
);

CREATE TABLE item_media (
  item_id TEXT NOT NULL,
  item_version TEXT NOT NULL,
  media_id TEXT NOT NULL REFERENCES media_assets (media_id),
  PRIMARY KEY (item_id, item_version, media_id),
  FOREIGN KEY (item_id, item_version) REFERENCES item_versions (item_id, version)
);

-- Lifecycle is owned by SQLite (06 §5.B.1); history is append-only in release_events.
CREATE TABLE package_releases (
  package_id TEXT NOT NULL,
  version TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('draft', 'active', 'suspended', 'retired')),
  qc_policy_version TEXT NOT NULL,
  released_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (package_id, version),
  FOREIGN KEY (package_id, version) REFERENCES package_versions (package_id, version)
);

CREATE TABLE release_events (
  event_id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL,
  version TEXT NOT NULL,
  from_state TEXT,
  to_state TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (package_id, version) REFERENCES package_versions (package_id, version)
);

-- Append-only revocations; target_version NULL means every version of the target.
CREATE TABLE revocations (
  revocation_id TEXT PRIMARY KEY,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('item', 'rubric', 'package', 'knowledge', 'media', 'ai_run', 'submission')),
  target_id TEXT NOT NULL,
  target_version TEXT,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX revocations_target ON revocations (target_kind, target_id);

-- Learner attempts pin item/rubric version + hash at assignment (04 §4.B.1). Scope separates dry-run.
CREATE TABLE attempts (
  attempt_id TEXT PRIMARY KEY,
  request_key TEXT NOT NULL UNIQUE,
  scope TEXT NOT NULL CHECK (scope IN ('learner', 'dry_run')),
  item_kind TEXT NOT NULL DEFAULT 'item' CHECK (item_kind = 'item'),
  item_id TEXT NOT NULL,
  item_version TEXT NOT NULL,
  item_hash TEXT NOT NULL CHECK (length(item_hash) = 64),
  rubric_kind TEXT NOT NULL DEFAULT 'rubric' CHECK (rubric_kind = 'rubric'),
  rubric_id TEXT NOT NULL,
  rubric_version TEXT NOT NULL,
  rubric_hash TEXT NOT NULL CHECK (length(rubric_hash) = 64),
  mode TEXT NOT NULL CHECK (mode IN ('guided', 'self_practice', 'exam')),
  purpose TEXT NOT NULL CHECK (purpose IN ('lesson', 'practice', '7A', '7B', '9')),
  state TEXT NOT NULL CHECK (state IN ('DRAFT', 'SUBMITTED', 'REPAIRING', 'AWAITING_VERIFICATION', 'CLOSED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (item_kind, item_id, item_version) REFERENCES json_objects (kind, object_id, version),
  FOREIGN KEY (rubric_kind, rubric_id, rubric_version) REFERENCES json_objects (kind, object_id, version)
);

-- One evidence source per learner attempt: repairs and re-evaluations share it (02 §2.C.1).
CREATE TABLE evidence_sources (
  evidence_source_id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL UNIQUE REFERENCES attempts (attempt_id),
  scope TEXT NOT NULL CHECK (scope IN ('learner', 'dry_run')),
  created_at TEXT NOT NULL
);

CREATE TABLE snapshots (
  snapshot_id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES attempts (attempt_id),
  snapshot_version INTEGER NOT NULL CHECK (snapshot_version >= 0),
  kind TEXT NOT NULL CHECK (kind IN ('autosave', 'pre_assistance', 'post_assistance', 'submitted')),
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (attempt_id, snapshot_version)
);

CREATE TABLE submissions (
  submission_id TEXT PRIMARY KEY,
  request_key TEXT NOT NULL UNIQUE,
  attempt_id TEXT NOT NULL REFERENCES attempts (attempt_id),
  revision INTEGER NOT NULL CHECK (revision >= 0),
  kind TEXT NOT NULL CHECK (kind IN ('original', 'repair')),
  parent_submission_id TEXT REFERENCES submissions (submission_id),
  evidence_source_id TEXT NOT NULL REFERENCES evidence_sources (evidence_source_id),
  snapshot_id TEXT NOT NULL REFERENCES snapshots (snapshot_id),
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
  content TEXT NOT NULL,
  media_id TEXT REFERENCES media_assets (media_id),
  repair_attempt_index INTEGER NOT NULL CHECK (repair_attempt_index >= 0),
  created_at TEXT NOT NULL,
  UNIQUE (attempt_id, revision),
  CHECK ((kind = 'original' AND parent_submission_id IS NULL AND revision = 0 AND repair_attempt_index = 0)
      OR (kind = 'repair' AND parent_submission_id IS NOT NULL AND revision >= 1 AND repair_attempt_index >= 1))
);

CREATE TRIGGER submissions_same_attempt BEFORE INSERT ON submissions
WHEN (SELECT attempt_id FROM evidence_sources WHERE evidence_source_id = NEW.evidence_source_id) IS NOT NEW.attempt_id
  OR (SELECT attempt_id FROM snapshots WHERE snapshot_id = NEW.snapshot_id) IS NOT NEW.attempt_id
  OR (NEW.parent_submission_id IS NOT NULL
      AND (SELECT attempt_id FROM submissions WHERE submission_id = NEW.parent_submission_id) IS NOT NEW.attempt_id)
BEGIN SELECT RAISE(ABORT, 'submission links must stay within one attempt'); END;

CREATE TABLE assistance_events (
  event_id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  attempt_id TEXT NOT NULL REFERENCES attempts (attempt_id),
  submission_id TEXT NOT NULL REFERENCES submissions (submission_id),
  hint_level INTEGER NOT NULL CHECK (hint_level >= 0),
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
  pre_snapshot_id TEXT REFERENCES snapshots (snapshot_id),
  post_snapshot_id TEXT REFERENCES snapshots (snapshot_id),
  displayed_at TEXT NOT NULL
);

CREATE TABLE assistance_impacts (
  event_id TEXT NOT NULL REFERENCES assistance_events (event_id),
  competency_id TEXT NOT NULL,
  impact TEXT NOT NULL CHECK (impact IN ('affected', 'no_related_effect_detected', 'unknown')),
  reduced_load INTEGER NOT NULL CHECK (reduced_load IN (0, 1)),
  PRIMARY KEY (event_id, competency_id)
);

-- Shared exposure log for builder and learner surfaces (06 §4.1).
CREATE TABLE exposure_events (
  event_id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  item_id TEXT NOT NULL,
  item_version TEXT NOT NULL,
  item_hash TEXT NOT NULL CHECK (length(item_hash) = 64),
  item_family_id TEXT NOT NULL,
  shared_stimulus_id TEXT,
  surface TEXT NOT NULL CHECK (surface IN ('builder', 'learner')),
  scope TEXT NOT NULL CHECK (scope IN ('learner', 'dry_run')),
  level TEXT NOT NULL CHECK (level IN ('prompt', 'hint', 'answer', 'explanation', 'sample_or_variant')),
  seen_at TEXT NOT NULL
);
CREATE INDEX exposure_family ON exposure_events (item_family_id);
CREATE INDEX exposure_stimulus ON exposure_events (shared_stimulus_id);

CREATE TABLE context_manifests (
  manifest_id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('assessor', 'blind_solver', 'verifier', 'repair_tutor')),
  phase TEXT NOT NULL CHECK (phase IN ('assessment', 'blind_solve', 'verification', 'repair')),
  input_hash TEXT NOT NULL CHECK (length(input_hash) = 64),
  policy_version TEXT NOT NULL,
  rubric_id TEXT,
  rubric_version TEXT,
  rubric_hash TEXT,
  disclosure_level INTEGER NOT NULL CHECK (disclosure_level >= 0),
  allowed_resource_ids TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE manifest_knowledge (
  manifest_id TEXT NOT NULL REFERENCES context_manifests (manifest_id),
  kind TEXT NOT NULL,
  object_id TEXT NOT NULL,
  version TEXT NOT NULL,
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
  PRIMARY KEY (manifest_id, kind, object_id, version),
  FOREIGN KEY (kind, object_id, version) REFERENCES json_objects (kind, object_id, version)
);

-- Workflow-level budget: at most 2 fix/regenerate rounds (01 §4, 04 §5.A); never decreases.
CREATE TABLE workflows (
  workflow_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  attempt_id TEXT REFERENCES attempts (attempt_id),
  scope TEXT NOT NULL CHECK (scope IN ('learner', 'dry_run')),
  regen_rounds_used INTEGER NOT NULL DEFAULT 0 CHECK (regen_rounds_used BETWEEN 0 AND 2),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE ai_jobs (
  job_id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  workflow_id TEXT REFERENCES workflows (workflow_id),
  regen_round INTEGER NOT NULL DEFAULT 0 CHECK (regen_round BETWEEN 0 AND 2),
  attempt_id TEXT NOT NULL REFERENCES attempts (attempt_id),
  submission_id TEXT NOT NULL REFERENCES submissions (submission_id),
  scope TEXT NOT NULL CHECK (scope IN ('learner', 'dry_run')),
  snapshot_version INTEGER NOT NULL CHECK (snapshot_version >= 0),
  attempt_generation INTEGER NOT NULL CHECK (attempt_generation >= 1),
  task_type TEXT NOT NULL,
  phase TEXT NOT NULL,
  context_manifest_id TEXT NOT NULL REFERENCES context_manifests (manifest_id),
  rubric_version TEXT NOT NULL,
  required_capabilities TEXT NOT NULL,
  eligible_providers TEXT NOT NULL,
  max_attempts_total INTEGER NOT NULL CHECK (max_attempts_total BETWEEN 1 AND 3),
  timeout_seconds INTEGER NOT NULL CHECK (timeout_seconds BETWEEN 1 AND 180),
  state TEXT NOT NULL CHECK (state IN ('QUEUED', 'RUNNING', 'VALIDATING', 'COMPLETED', 'WAITING_QUOTA', 'NEEDS_REVIEW', 'FAILED', 'CANCELLED')),
  generation INTEGER NOT NULL DEFAULT 0 CHECK (generation >= 0),
  executions_used INTEGER NOT NULL DEFAULT 0 CHECK (executions_used BETWEEN 0 AND max_attempts_total),
  format_repairs_used INTEGER NOT NULL DEFAULT 0 CHECK (format_repairs_used BETWEEN 0 AND 1),
  pending_format_repair INTEGER NOT NULL DEFAULT 0 CHECK (pending_format_repair IN (0, 1)),
  lease_owner TEXT,
  lease_expires_at TEXT,
  current_run_id TEXT,
  available_at TEXT NOT NULL,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((state IN ('RUNNING', 'VALIDATING')) = (lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL AND current_run_id IS NOT NULL))
);
CREATE INDEX ai_jobs_ready ON ai_jobs (state, available_at, created_at);

CREATE TABLE ai_runs (
  run_id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES ai_jobs (job_id),
  generation INTEGER NOT NULL CHECK (generation >= 1),
  execution_index INTEGER NOT NULL CHECK (execution_index BETWEEN 1 AND 3),
  purpose TEXT NOT NULL CHECK (purpose IN ('execute', 'format_repair')),
  lease_owner TEXT NOT NULL,
  lease_expires_at TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('RUNNING', 'VALIDATING', 'COMPLETED', 'FAILED', 'CANCELLED', 'STALE')),
  provider TEXT NOT NULL CHECK (provider IN ('fake', 'codex', 'claude-code', 'gemini-cli')),
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

-- Exactly one committed result per job; a retried commit returns this row instead of writing again.
CREATE TABLE job_results (
  job_id TEXT PRIMARY KEY REFERENCES ai_jobs (job_id),
  run_id TEXT NOT NULL UNIQUE REFERENCES ai_runs (run_id),
  result_hash TEXT NOT NULL CHECK (length(result_hash) = 64),
  result_json TEXT NOT NULL,
  committed_at TEXT NOT NULL
);

CREATE TABLE observations (
  observation_id TEXT PRIMARY KEY,
  observation_key TEXT NOT NULL,
  submission_id TEXT NOT NULL REFERENCES submissions (submission_id),
  evidence_source_id TEXT NOT NULL REFERENCES evidence_sources (evidence_source_id),
  competency_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_version TEXT NOT NULL,
  item_hash TEXT NOT NULL CHECK (length(item_hash) = 64),
  rubric_id TEXT NOT NULL,
  rubric_version TEXT NOT NULL,
  rubric_hash TEXT NOT NULL CHECK (length(rubric_hash) = 64),
  ai_run_id TEXT NOT NULL REFERENCES ai_runs (run_id),
  job_id TEXT NOT NULL REFERENCES job_results (job_id),
  supersedes_id TEXT REFERENCES observations (observation_id),
  processing TEXT NOT NULL CHECK (processing IN ('processed', 'missing_data', 'technical_error')),
  outcome TEXT NOT NULL CHECK (outcome IN ('met', 'not_met', 'inconclusive')),
  measurement_quality TEXT NOT NULL CHECK (measurement_quality IN ('sufficient', 'insufficient', 'unknown')),
  opportunity TEXT NOT NULL CHECK (opportunity IN ('observed', 'absent', 'unknown')),
  support_impact TEXT NOT NULL CHECK (support_impact IN ('affected', 'no_related_effect_detected', 'unknown')),
  scope TEXT NOT NULL CHECK (scope IN ('learner', 'dry_run')),
  created_at TEXT NOT NULL,
  UNIQUE (ai_run_id, observation_key),
  CHECK (outcome = 'inconclusive' OR (measurement_quality = 'sufficient' AND processing = 'processed'))
);
CREATE INDEX observations_source ON observations (evidence_source_id);
CREATE INDEX observations_competency ON observations (competency_id, scope);

CREATE TRIGGER observations_provenance BEFORE INSERT ON observations
WHEN (SELECT evidence_source_id FROM submissions WHERE submission_id = NEW.submission_id) IS NOT NEW.evidence_source_id
  OR (SELECT scope FROM evidence_sources WHERE evidence_source_id = NEW.evidence_source_id) IS NOT NEW.scope
  OR (SELECT job_id FROM ai_runs WHERE run_id = NEW.ai_run_id) IS NOT NEW.job_id
BEGIN SELECT RAISE(ABORT, 'observation provenance or scope mismatch'); END;

CREATE TRIGGER evidence_sources_scope BEFORE INSERT ON evidence_sources
WHEN (SELECT scope FROM attempts WHERE attempt_id = NEW.attempt_id) IS NOT NEW.scope
BEGIN SELECT RAISE(ABORT, 'evidence source scope must match attempt'); END;

CREATE TRIGGER ai_jobs_scope BEFORE INSERT ON ai_jobs
WHEN (SELECT scope FROM attempts WHERE attempt_id = NEW.attempt_id) IS NOT NEW.scope
  OR (SELECT attempt_id FROM submissions WHERE submission_id = NEW.submission_id) IS NOT NEW.attempt_id
BEGIN SELECT RAISE(ABORT, 'job scope or submission mismatch'); END;

-- Budgets, fencing and terminal states never move backwards.
CREATE TRIGGER ai_jobs_monotonic BEFORE UPDATE ON ai_jobs
WHEN NEW.generation < OLD.generation
  OR NEW.executions_used < OLD.executions_used
  OR NEW.format_repairs_used < OLD.format_repairs_used
  OR (OLD.state IN ('COMPLETED', 'FAILED', 'CANCELLED', 'NEEDS_REVIEW') AND NEW.state IS NOT OLD.state)
  OR NEW.idempotency_key IS NOT OLD.idempotency_key OR NEW.attempt_id IS NOT OLD.attempt_id
  OR NEW.submission_id IS NOT OLD.submission_id OR NEW.context_manifest_id IS NOT OLD.context_manifest_id
  OR NEW.max_attempts_total IS NOT OLD.max_attempts_total OR NEW.scope IS NOT OLD.scope
BEGIN SELECT RAISE(ABORT, 'job budget, fencing or terminal state cannot move backwards'); END;

CREATE TRIGGER workflows_monotonic BEFORE UPDATE ON workflows
WHEN NEW.regen_rounds_used < OLD.regen_rounds_used OR NEW.scope IS NOT OLD.scope
BEGIN SELECT RAISE(ABORT, 'workflow regeneration budget cannot be reset'); END;

CREATE TRIGGER attempts_pinned BEFORE UPDATE ON attempts
WHEN NEW.scope IS NOT OLD.scope OR NEW.item_id IS NOT OLD.item_id OR NEW.item_version IS NOT OLD.item_version
  OR NEW.item_hash IS NOT OLD.item_hash OR NEW.rubric_id IS NOT OLD.rubric_id
  OR NEW.rubric_version IS NOT OLD.rubric_version OR NEW.rubric_hash IS NOT OLD.rubric_hash
  OR NEW.mode IS NOT OLD.mode OR NEW.purpose IS NOT OLD.purpose OR NEW.request_key IS NOT OLD.request_key
BEGIN SELECT RAISE(ABORT, 'attempt pins are immutable'); END;

CREATE TRIGGER attempts_no_delete BEFORE DELETE ON attempts BEGIN SELECT RAISE(ABORT, 'immutable: attempts'); END;
CREATE TRIGGER ai_jobs_no_delete BEFORE DELETE ON ai_jobs BEGIN SELECT RAISE(ABORT, 'immutable: ai_jobs'); END;
CREATE TRIGGER ai_runs_no_delete BEFORE DELETE ON ai_runs BEGIN SELECT RAISE(ABORT, 'immutable: ai_runs'); END;
CREATE TRIGGER workflows_no_delete BEFORE DELETE ON workflows BEGIN SELECT RAISE(ABORT, 'immutable: workflows'); END;
CREATE TRIGGER package_releases_no_delete BEFORE DELETE ON package_releases BEGIN SELECT RAISE(ABORT, 'immutable: package_releases'); END;

-- Append-only history tables.
CREATE TRIGGER json_objects_no_update BEFORE UPDATE ON json_objects BEGIN SELECT RAISE(ABORT, 'immutable: json_objects'); END;
CREATE TRIGGER json_objects_no_delete BEFORE DELETE ON json_objects BEGIN SELECT RAISE(ABORT, 'immutable: json_objects'); END;
CREATE TRIGGER media_assets_no_update BEFORE UPDATE ON media_assets BEGIN SELECT RAISE(ABORT, 'immutable: media_assets'); END;
CREATE TRIGGER media_assets_no_delete BEFORE DELETE ON media_assets BEGIN SELECT RAISE(ABORT, 'immutable: media_assets'); END;
CREATE TRIGGER package_versions_no_update BEFORE UPDATE ON package_versions BEGIN SELECT RAISE(ABORT, 'immutable: package_versions'); END;
CREATE TRIGGER package_versions_no_delete BEFORE DELETE ON package_versions BEGIN SELECT RAISE(ABORT, 'immutable: package_versions'); END;
CREATE TRIGGER package_dependencies_no_update BEFORE UPDATE ON package_dependencies BEGIN SELECT RAISE(ABORT, 'immutable: package_dependencies'); END;
CREATE TRIGGER package_dependencies_no_delete BEFORE DELETE ON package_dependencies BEGIN SELECT RAISE(ABORT, 'immutable: package_dependencies'); END;
CREATE TRIGGER item_versions_no_update BEFORE UPDATE ON item_versions BEGIN SELECT RAISE(ABORT, 'immutable: item_versions'); END;
CREATE TRIGGER item_versions_no_delete BEFORE DELETE ON item_versions BEGIN SELECT RAISE(ABORT, 'immutable: item_versions'); END;
CREATE TRIGGER item_media_no_update BEFORE UPDATE ON item_media BEGIN SELECT RAISE(ABORT, 'immutable: item_media'); END;
CREATE TRIGGER item_media_no_delete BEFORE DELETE ON item_media BEGIN SELECT RAISE(ABORT, 'immutable: item_media'); END;
CREATE TRIGGER release_events_no_update BEFORE UPDATE ON release_events BEGIN SELECT RAISE(ABORT, 'immutable: release_events'); END;
CREATE TRIGGER release_events_no_delete BEFORE DELETE ON release_events BEGIN SELECT RAISE(ABORT, 'immutable: release_events'); END;
CREATE TRIGGER revocations_no_update BEFORE UPDATE ON revocations BEGIN SELECT RAISE(ABORT, 'immutable: revocations'); END;
CREATE TRIGGER revocations_no_delete BEFORE DELETE ON revocations BEGIN SELECT RAISE(ABORT, 'immutable: revocations'); END;
CREATE TRIGGER evidence_sources_no_update BEFORE UPDATE ON evidence_sources BEGIN SELECT RAISE(ABORT, 'immutable: evidence_sources'); END;
CREATE TRIGGER evidence_sources_no_delete BEFORE DELETE ON evidence_sources BEGIN SELECT RAISE(ABORT, 'immutable: evidence_sources'); END;
CREATE TRIGGER snapshots_no_update BEFORE UPDATE ON snapshots BEGIN SELECT RAISE(ABORT, 'immutable: snapshots'); END;
CREATE TRIGGER snapshots_no_delete BEFORE DELETE ON snapshots BEGIN SELECT RAISE(ABORT, 'immutable: snapshots'); END;
CREATE TRIGGER submissions_no_update BEFORE UPDATE ON submissions BEGIN SELECT RAISE(ABORT, 'immutable: submissions'); END;
CREATE TRIGGER submissions_no_delete BEFORE DELETE ON submissions BEGIN SELECT RAISE(ABORT, 'immutable: submissions'); END;
CREATE TRIGGER assistance_events_no_update BEFORE UPDATE ON assistance_events BEGIN SELECT RAISE(ABORT, 'immutable: assistance_events'); END;
CREATE TRIGGER assistance_events_no_delete BEFORE DELETE ON assistance_events BEGIN SELECT RAISE(ABORT, 'immutable: assistance_events'); END;
CREATE TRIGGER assistance_impacts_no_update BEFORE UPDATE ON assistance_impacts BEGIN SELECT RAISE(ABORT, 'immutable: assistance_impacts'); END;
CREATE TRIGGER assistance_impacts_no_delete BEFORE DELETE ON assistance_impacts BEGIN SELECT RAISE(ABORT, 'immutable: assistance_impacts'); END;
CREATE TRIGGER exposure_events_no_update BEFORE UPDATE ON exposure_events BEGIN SELECT RAISE(ABORT, 'immutable: exposure_events'); END;
CREATE TRIGGER exposure_events_no_delete BEFORE DELETE ON exposure_events BEGIN SELECT RAISE(ABORT, 'immutable: exposure_events'); END;
CREATE TRIGGER context_manifests_no_update BEFORE UPDATE ON context_manifests BEGIN SELECT RAISE(ABORT, 'immutable: context_manifests'); END;
CREATE TRIGGER context_manifests_no_delete BEFORE DELETE ON context_manifests BEGIN SELECT RAISE(ABORT, 'immutable: context_manifests'); END;
CREATE TRIGGER manifest_knowledge_no_update BEFORE UPDATE ON manifest_knowledge BEGIN SELECT RAISE(ABORT, 'immutable: manifest_knowledge'); END;
CREATE TRIGGER manifest_knowledge_no_delete BEFORE DELETE ON manifest_knowledge BEGIN SELECT RAISE(ABORT, 'immutable: manifest_knowledge'); END;
CREATE TRIGGER job_results_no_update BEFORE UPDATE ON job_results BEGIN SELECT RAISE(ABORT, 'immutable: job_results'); END;
CREATE TRIGGER job_results_no_delete BEFORE DELETE ON job_results BEGIN SELECT RAISE(ABORT, 'immutable: job_results'); END;
CREATE TRIGGER observations_no_update BEFORE UPDATE ON observations BEGIN SELECT RAISE(ABORT, 'immutable: observations'); END;
CREATE TRIGGER observations_no_delete BEFORE DELETE ON observations BEGIN SELECT RAISE(ABORT, 'immutable: observations'); END;
