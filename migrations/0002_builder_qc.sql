-- 0002_builder_qc — P2 Builder/QC pipeline, result cache, review queue, AI gateway records (E-08, E-09).
-- Applied migrations are immutable: change the schema with a new numbered file.

-- Output 1 — Source Registry. A rights or registry change is a new version; old versions stay for provenance.
CREATE TABLE source_records (
  source_id TEXT NOT NULL,
  version TEXT NOT NULL,
  origin TEXT NOT NULL,
  rights_status TEXT NOT NULL CHECK (rights_status IN ('determined', 'unclear')),
  registry_state TEXT NOT NULL CHECK (registry_state IN ('candidate', 'approved', 'rejected')),
  record_hash TEXT NOT NULL CHECK (length(record_hash) = 64),
  record_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (source_id, version)
);

-- Package Request Spec (05 §5.A): the input contract of a pipeline run.
CREATE TABLE package_requests (
  request_id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL,
  content_origin TEXT NOT NULL CHECK (content_origin IN ('synthetic_fixture', 'sourced')),
  request_hash TEXT NOT NULL CHECK (length(request_hash) = 64),
  request_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Staging drafts are a mutable work area (05 §5.D: authoring AI only touches staging). Freezing copies them into
-- the immutable JSON store; QC binds to the frozen bundle hash, never to these rows.
CREATE TABLE staging_units (
  request_id TEXT NOT NULL REFERENCES package_requests (request_id),
  kind TEXT NOT NULL CHECK (kind IN ('item', 'rubric', 'knowledge', 'policy')),
  unit_id TEXT NOT NULL,
  version TEXT NOT NULL,
  content_json TEXT NOT NULL,
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (request_id, kind, unit_id, version)
);

CREATE TABLE staging_coverage (
  request_id TEXT PRIMARY KEY REFERENCES package_requests (request_id),
  coverage_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE pipeline_events (
  event_id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES package_requests (request_id),
  package_version TEXT,
  step INTEGER NOT NULL CHECK (step BETWEEN 1 AND 6),
  status TEXT NOT NULL CHECK (status IN ('started', 'passed', 'blocked', 'failed')),
  detail TEXT NOT NULL,
  bundle_hash TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX pipeline_events_request ON pipeline_events (request_id, created_at);

-- One frozen bundle per package version: what QC tested and what release must match.
CREATE TABLE package_bundles (
  package_id TEXT NOT NULL,
  version TEXT NOT NULL,
  request_id TEXT NOT NULL REFERENCES package_requests (request_id),
  bundle_hash TEXT NOT NULL CHECK (length(bundle_hash) = 64),
  content_origin TEXT NOT NULL CHECK (content_origin IN ('synthetic_fixture', 'sourced')),
  qc_spec_version TEXT NOT NULL,
  playbook_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (package_id, version),
  FOREIGN KEY (package_id, version) REFERENCES package_versions (package_id, version)
);

-- Permission index for pre-retrieval slicing (05 §6.A): roles are checked here before a JSON file is opened.
CREATE TABLE knowledge_units (
  kind TEXT NOT NULL,
  object_id TEXT NOT NULL,
  version TEXT NOT NULL,
  unit_type TEXT NOT NULL,
  package_id TEXT NOT NULL,
  package_version TEXT NOT NULL,
  roles_json TEXT NOT NULL,
  disclosure TEXT NOT NULL,
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
  PRIMARY KEY (kind, object_id, version),
  FOREIGN KEY (kind, object_id, version) REFERENCES json_objects (kind, object_id, version),
  FOREIGN KEY (package_id, package_version) REFERENCES package_bundles (package_id, version)
);

CREATE TABLE package_units (
  package_id TEXT NOT NULL,
  package_version TEXT NOT NULL,
  kind TEXT NOT NULL,
  object_id TEXT NOT NULL,
  version TEXT NOT NULL,
  PRIMARY KEY (package_id, package_version, kind, object_id, version),
  FOREIGN KEY (package_id, package_version) REFERENCES package_bundles (package_id, version),
  FOREIGN KEY (kind, object_id, version) REFERENCES knowledge_units (kind, object_id, version)
);
CREATE INDEX package_units_unit ON package_units (kind, object_id, version);

-- QC results are append-only and bound to bundle hash + QC spec version (06 §3: sửa sau QC → QC cũ hết hiệu lực).
CREATE TABLE qc_results (
  qc_id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL,
  version TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('QC1', 'QC2', 'QC3', 'QC4')),
  part TEXT NOT NULL CHECK (part IN ('deterministic', 'semantic')),
  status TEXT NOT NULL CHECK (status IN ('PASS', 'FAIL', 'NOT_RUN')),
  method TEXT NOT NULL CHECK (method IN ('deterministic', 'manual_attestation', 'ai_semantic', 'synthetic_fake')),
  bundle_hash TEXT NOT NULL CHECK (length(bundle_hash) = 64),
  qc_spec_version TEXT NOT NULL,
  findings_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (package_id, version) REFERENCES package_bundles (package_id, version)
);
CREATE INDEX qc_results_bundle ON qc_results (package_id, version, stage, part, created_at);

-- QC4 runs reuse dry-run attempts and the durable queue; blind solve and verification are separate jobs.
CREATE TABLE qc_jobs (
  package_id TEXT NOT NULL,
  version TEXT NOT NULL,
  bundle_hash TEXT NOT NULL CHECK (length(bundle_hash) = 64),
  case_id TEXT NOT NULL,
  step TEXT NOT NULL CHECK (step IN ('blind_solve', 'verification', 'assessment')),
  attempt_id TEXT NOT NULL REFERENCES attempts (attempt_id),
  job_id TEXT NOT NULL UNIQUE REFERENCES ai_jobs (job_id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (package_id, version, bundle_hash, case_id, step),
  FOREIGN KEY (package_id, version) REFERENCES package_bundles (package_id, version)
);
CREATE TRIGGER qc_jobs_dry_run BEFORE INSERT ON qc_jobs
WHEN (SELECT scope FROM attempts WHERE attempt_id = NEW.attempt_id) IS NOT 'dry_run'
BEGIN SELECT RAISE(ABORT, 'QC jobs must run on dry-run attempts'); END;

-- Output 6 — Release Manifest. SQLite owns release history (06 §5.B.1).
CREATE TABLE release_manifests (
  package_id TEXT NOT NULL,
  version TEXT NOT NULL,
  manifest_hash TEXT NOT NULL CHECK (length(manifest_hash) = 64),
  manifest_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (package_id, version),
  FOREIGN KEY (package_id, version) REFERENCES package_bundles (package_id, version)
);

-- Result cache (06A §7.C.4): key covers input hash, role, phase, versions, model and disclosure level.
-- A hit is never evidence; invalidation is one-way.
CREATE TABLE result_cache (
  cache_key TEXT PRIMARY KEY CHECK (length(cache_key) = 64),
  input_hash TEXT NOT NULL CHECK (length(input_hash) = 64),
  role TEXT NOT NULL,
  phase TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  rubric_version TEXT,
  knowledge_fingerprint TEXT NOT NULL,
  model TEXT NOT NULL,
  disclosure_level INTEGER NOT NULL CHECK (disclosure_level >= 0),
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  invalidated_at TEXT,
  invalidated_reason TEXT
);
CREATE TABLE result_cache_deps (
  cache_key TEXT NOT NULL REFERENCES result_cache (cache_key),
  dep_kind TEXT NOT NULL,
  dep_id TEXT NOT NULL,
  dep_version TEXT NOT NULL,
  PRIMARY KEY (cache_key, dep_kind, dep_id, dep_version)
);
CREATE INDEX result_cache_deps_target ON result_cache_deps (dep_kind, dep_id);
CREATE TRIGGER result_cache_one_way BEFORE UPDATE ON result_cache
WHEN OLD.invalidated_at IS NOT NULL OR NEW.result_json IS NOT OLD.result_json OR NEW.input_hash IS NOT OLD.input_hash
BEGIN SELECT RAISE(ABORT, 'cache entries are only invalidated, never revived or rewritten'); END;

-- "Cần xử lý" queue (06 §3 tab 2). Status may change; the evidence summary does not.
CREATE TABLE review_items (
  review_id TEXT PRIMARY KEY,
  dedupe_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('qc_failed', 'coverage_gap', 'revocation_impact', 'suspension_impact', 'job_needs_review', 'source_rights')),
  target_kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  target_version TEXT,
  severity TEXT NOT NULL CHECK (severity IN ('high', 'normal', 'low')),
  summary TEXT NOT NULL,
  detail_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'resolved')),
  resolution TEXT CHECK (resolution IS NULL OR resolution IN ('ai_fix_and_requalify', 'suspended_or_retired', 'manual_review_done', 'deferred')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TRIGGER review_items_frozen BEFORE UPDATE ON review_items
WHEN NEW.detail_json IS NOT OLD.detail_json OR NEW.summary IS NOT OLD.summary OR NEW.target_id IS NOT OLD.target_id OR NEW.kind IS NOT OLD.kind
BEGIN SELECT RAISE(ABORT, 'review evidence is immutable'); END;

-- AI accounts (06A §3.B.5): label, provider, profile, runner reference and state only — never a secret.
CREATE TABLE ai_accounts (
  profile_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('codex', 'claude-code', 'gemini-cli')),
  label TEXT NOT NULL,
  runner_ref TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('NEEDS_LOGIN', 'NEEDS_VERIFICATION', 'READY', 'BUSY', 'COOLDOWN', 'QUOTA_EXHAUSTED', 'DISABLED')),
  updated_at TEXT NOT NULL
);

-- D-01 evidence per provider/profile/CLI build. Append-only; the gateway reads the latest row.
CREATE TABLE provider_verifications (
  verification_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('codex', 'claude-code', 'gemini-cli')),
  profile_id TEXT NOT NULL REFERENCES ai_accounts (profile_id),
  cli_version TEXT NOT NULL,
  entrypoint_sha256 TEXT NOT NULL CHECK (length(entrypoint_sha256) = 64),
  evidence_json TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);

-- Which provider may receive which data class (06A §1.4). Append-only; latest event per pair wins; default deny.
CREATE TABLE ai_data_consents (
  event_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('codex', 'claude-code', 'gemini-cli')),
  data_class TEXT NOT NULL CHECK (data_class IN ('synthetic_fixture', 'knowledge_content', 'answer_key', 'learner_submission', 'learner_audio', 'learner_profile')),
  granted INTEGER NOT NULL CHECK (granted IN (0, 1)),
  recorded_at TEXT NOT NULL
);

CREATE TRIGGER source_records_no_update BEFORE UPDATE ON source_records BEGIN SELECT RAISE(ABORT, 'immutable: source_records'); END;
CREATE TRIGGER source_records_no_delete BEFORE DELETE ON source_records BEGIN SELECT RAISE(ABORT, 'immutable: source_records'); END;
CREATE TRIGGER package_requests_no_update BEFORE UPDATE ON package_requests BEGIN SELECT RAISE(ABORT, 'immutable: package_requests'); END;
CREATE TRIGGER package_requests_no_delete BEFORE DELETE ON package_requests BEGIN SELECT RAISE(ABORT, 'immutable: package_requests'); END;
CREATE TRIGGER pipeline_events_no_update BEFORE UPDATE ON pipeline_events BEGIN SELECT RAISE(ABORT, 'immutable: pipeline_events'); END;
CREATE TRIGGER pipeline_events_no_delete BEFORE DELETE ON pipeline_events BEGIN SELECT RAISE(ABORT, 'immutable: pipeline_events'); END;
CREATE TRIGGER package_bundles_no_update BEFORE UPDATE ON package_bundles BEGIN SELECT RAISE(ABORT, 'immutable: package_bundles'); END;
CREATE TRIGGER package_bundles_no_delete BEFORE DELETE ON package_bundles BEGIN SELECT RAISE(ABORT, 'immutable: package_bundles'); END;
CREATE TRIGGER knowledge_units_no_update BEFORE UPDATE ON knowledge_units BEGIN SELECT RAISE(ABORT, 'immutable: knowledge_units'); END;
CREATE TRIGGER knowledge_units_no_delete BEFORE DELETE ON knowledge_units BEGIN SELECT RAISE(ABORT, 'immutable: knowledge_units'); END;
CREATE TRIGGER package_units_no_update BEFORE UPDATE ON package_units BEGIN SELECT RAISE(ABORT, 'immutable: package_units'); END;
CREATE TRIGGER package_units_no_delete BEFORE DELETE ON package_units BEGIN SELECT RAISE(ABORT, 'immutable: package_units'); END;
CREATE TRIGGER qc_results_no_update BEFORE UPDATE ON qc_results BEGIN SELECT RAISE(ABORT, 'immutable: qc_results'); END;
CREATE TRIGGER qc_results_no_delete BEFORE DELETE ON qc_results BEGIN SELECT RAISE(ABORT, 'immutable: qc_results'); END;
CREATE TRIGGER qc_jobs_no_update BEFORE UPDATE ON qc_jobs BEGIN SELECT RAISE(ABORT, 'immutable: qc_jobs'); END;
CREATE TRIGGER qc_jobs_no_delete BEFORE DELETE ON qc_jobs BEGIN SELECT RAISE(ABORT, 'immutable: qc_jobs'); END;
CREATE TRIGGER release_manifests_no_update BEFORE UPDATE ON release_manifests BEGIN SELECT RAISE(ABORT, 'immutable: release_manifests'); END;
CREATE TRIGGER release_manifests_no_delete BEFORE DELETE ON release_manifests BEGIN SELECT RAISE(ABORT, 'immutable: release_manifests'); END;
CREATE TRIGGER review_items_no_delete BEFORE DELETE ON review_items BEGIN SELECT RAISE(ABORT, 'immutable: review_items'); END;
CREATE TRIGGER provider_verifications_no_update BEFORE UPDATE ON provider_verifications BEGIN SELECT RAISE(ABORT, 'immutable: provider_verifications'); END;
CREATE TRIGGER provider_verifications_no_delete BEFORE DELETE ON provider_verifications BEGIN SELECT RAISE(ABORT, 'immutable: provider_verifications'); END;
CREATE TRIGGER ai_data_consents_no_update BEFORE UPDATE ON ai_data_consents BEGIN SELECT RAISE(ABORT, 'immutable: ai_data_consents'); END;
CREATE TRIGGER ai_data_consents_no_delete BEFORE DELETE ON ai_data_consents BEGIN SELECT RAISE(ABORT, 'immutable: ai_data_consents'); END;
CREATE TRIGGER ai_accounts_no_delete BEFORE DELETE ON ai_accounts BEGIN SELECT RAISE(ABORT, 'immutable: ai_accounts'); END;
