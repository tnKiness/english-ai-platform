-- E-37 (D-05 N2, user decision 18/11/2026): pages found by the source crawler, waiting for the learner's review.
-- One row per normalised URL; QUEUED rows are the crawl frontier, so a run can stop and the next one continues.
-- Only APPROVED pages become Source Registry records (source_records); fetched content is untrusted data.
CREATE TABLE source_candidates (
  candidate_id TEXT PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  host TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('official', 'linguistic_research', 'teaching', 'community')),
  depth INTEGER NOT NULL CHECK (depth >= 0),
  discovered_from TEXT,
  fetch_state TEXT NOT NULL CHECK (fetch_state IN ('QUEUED', 'FETCHED', 'FAILED', 'SKIPPED')),
  http_status INTEGER,
  content_type TEXT,
  title TEXT,
  byte_size INTEGER,
  sha256 TEXT CHECK (sha256 IS NULL OR length(sha256) = 64),
  stored_path TEXT,
  text_chars INTEGER,
  kind TEXT NOT NULL DEFAULT 'other' CHECK (kind IN ('band_descriptors', 'sample_answers', 'test_format', 'practice_material', 'grammar', 'vocabulary', 'phonetics', 'other')),
  skill TEXT CHECK (skill IS NULL OR skill IN ('writing', 'speaking', 'reading', 'listening')),
  review_state TEXT NOT NULL DEFAULT 'PENDING' CHECK (review_state IN ('PENDING', 'APPROVED', 'REJECTED')),
  source_id TEXT,
  source_version TEXT,
  error TEXT,
  fetched_at TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX source_candidates_frontier ON source_candidates (fetch_state, depth, created_at);
CREATE INDEX source_candidates_review ON source_candidates (review_state, kind, host);
