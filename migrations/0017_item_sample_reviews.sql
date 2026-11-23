-- E-50 (D-05 N6, 20/11/2026): random sample review of AI-authored prompts released automatically. Drawing a sample
-- shows the prompt to the learner-builder, so the exposure is recorded in the same transaction (06 §4.1). The
-- decision is made once: keep, or revoke through the Builder pipeline (reverse provenance, cache invalidation).
CREATE TABLE item_sample_reviews (
  sample_id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  item_version TEXT NOT NULL,
  package_id TEXT NOT NULL,
  package_version TEXT NOT NULL,
  drawn_at TEXT NOT NULL,
  decision TEXT CHECK (decision IS NULL OR decision IN ('keep', 'revoke')),
  note TEXT,
  decided_at TEXT,
  UNIQUE (item_id, item_version)
);
CREATE TRIGGER item_sample_reviews_guard BEFORE UPDATE ON item_sample_reviews
WHEN OLD.decision IS NOT NULL OR NEW.decision IS NULL OR NEW.item_id <> OLD.item_id OR NEW.item_version <> OLD.item_version
  OR NEW.package_id <> OLD.package_id OR NEW.package_version <> OLD.package_version OR NEW.drawn_at <> OLD.drawn_at
BEGIN SELECT RAISE(ABORT, 'immutable: item_sample_reviews'); END;
CREATE TRIGGER item_sample_reviews_no_delete BEFORE DELETE ON item_sample_reviews BEGIN SELECT RAISE(ABORT, 'immutable: item_sample_reviews'); END;
