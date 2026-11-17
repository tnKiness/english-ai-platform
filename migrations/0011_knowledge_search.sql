-- P5-2 Knowledge search (06A §7.A.2 "lọc quyền trước khi tra cứu bằng SQLite FTS/BM25", 05 §C.5, 06 §5.B.1; E-27).
-- A rebuildable projection of the immutable JSON units: never a source of truth, safe to drop and rebuild.
-- Permissions, release state and revocations are NOT copied here; they are joined from their source tables on every
-- query, so a revocation takes effect on the next search with nothing to invalidate.

CREATE VIRTUAL TABLE knowledge_search USING fts5(
  title,
  body,
  tokenize = 'unicode61 remove_diacritics 2'
);

-- Which unit each FTS row holds, and the content hash it was built from (stale rows are rebuilt).
CREATE TABLE knowledge_search_units (
  search_rowid INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  object_id TEXT NOT NULL,
  version TEXT NOT NULL,
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
  indexed_at TEXT NOT NULL,
  UNIQUE (kind, object_id, version),
  FOREIGN KEY (kind, object_id, version) REFERENCES knowledge_units (kind, object_id, version)
);
