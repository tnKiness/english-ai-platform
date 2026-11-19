-- E-41 (D-05 N10, 19/11/2026): content origins 'ai_authored' and 'learner_owned' join 'synthetic_fixture' and 'sourced'.
--   'ai_authored'   content an AI wrote through the pipeline and QC1–QC4; counts toward the learner profile.
--   'learner_owned' material the learner imported and owns; counts toward the profile, never exported publicly.
-- Only 'synthetic_fixture' stays excluded by G0. SQLite cannot change a CHECK constraint, so the two package tables
-- whose CHECK lists the origins are rebuilt (same technique as 0003): legacy_alter_table keeps child foreign keys
-- and trigger bodies pointing at the table *name*; every row is copied; the append-only triggers are recreated.
-- Benchmark tables keep their own CHECK on purpose: a benchmark must stay 'sourced' (05 §5.C QC4, N9).
PRAGMA legacy_alter_table = ON;

ALTER TABLE package_requests RENAME TO package_requests_pre_0014;
CREATE TABLE package_requests (
  request_id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL,
  content_origin TEXT NOT NULL CHECK (content_origin IN ('synthetic_fixture', 'sourced', 'ai_authored', 'learner_owned')),
  request_hash TEXT NOT NULL CHECK (length(request_hash) = 64),
  request_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
INSERT INTO package_requests SELECT * FROM package_requests_pre_0014;
DROP TABLE package_requests_pre_0014;
CREATE TRIGGER package_requests_no_update BEFORE UPDATE ON package_requests BEGIN SELECT RAISE(ABORT, 'immutable: package_requests'); END;
CREATE TRIGGER package_requests_no_delete BEFORE DELETE ON package_requests BEGIN SELECT RAISE(ABORT, 'immutable: package_requests'); END;

ALTER TABLE package_bundles RENAME TO package_bundles_pre_0014;
CREATE TABLE package_bundles (
  package_id TEXT NOT NULL,
  version TEXT NOT NULL,
  request_id TEXT NOT NULL REFERENCES package_requests (request_id),
  bundle_hash TEXT NOT NULL CHECK (length(bundle_hash) = 64),
  content_origin TEXT NOT NULL CHECK (content_origin IN ('synthetic_fixture', 'sourced', 'ai_authored', 'learner_owned')),
  qc_spec_version TEXT NOT NULL,
  playbook_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (package_id, version),
  FOREIGN KEY (package_id, version) REFERENCES package_versions (package_id, version)
);
INSERT INTO package_bundles SELECT * FROM package_bundles_pre_0014;
DROP TABLE package_bundles_pre_0014;
CREATE TRIGGER package_bundles_no_update BEFORE UPDATE ON package_bundles BEGIN SELECT RAISE(ABORT, 'immutable: package_bundles'); END;
CREATE TRIGGER package_bundles_no_delete BEFORE DELETE ON package_bundles BEGIN SELECT RAISE(ABORT, 'immutable: package_bundles'); END;
