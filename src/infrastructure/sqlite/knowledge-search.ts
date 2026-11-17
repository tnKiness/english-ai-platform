// P5-2 Knowledge search over released units (06A §7.A.2; 05 §C.5; 06 §5.B.1; E-27).
// FTS5/BM25 is a rebuildable projection of the immutable JSON files. Every query joins the permission index
// (roles), release state and revocations from their source tables in the same statement, so a unit the caller may
// not see is never returned, and a revocation counts on the very next query. Results carry references and titles
// only, never content: the caller must still read through scopedReader, which checks the role again.
import type { ContextRole } from '../../application/context/scoped-reader.js';
import type { JsonStore } from '../files/json-store.js';
import type { Db } from './database.js';

export type SearchScope = 'released' | 'builder';
export interface SearchHit { kind: string; object_id: string; version: string; unit_type: string; title: string; package_id: string; package_version: string; release_state: string; score: number }

const MAX_QUERY_TERMS = 12;
const MAX_LIMIT = 50;

/** đ/Đ are separate letters, not accents: fold them so "dieu kien" finds "điều kiện". */
export const foldVietnamese = (text: string) => text.replace(/[đĐ]/g, (c) => (c === 'đ' ? 'd' : 'D'));

/**
 * Searchable text of a unit: every string leaf outside `governance` (ids, hashes, sources and roles are metadata,
 * not content). Field names are not indexed.
 */
export function unitText(value: unknown): { title: string; body: string } {
  const parts: string[] = [];
  const walk = (v: unknown, depth: number) => {
    if (depth > 12) return;
    if (typeof v === 'string') { if (v.trim()) parts.push(v.trim()); return; }
    if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== 'governance') walk(x, depth + 1);
  };
  walk(value, 0);
  const obj = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const gov = (obj.governance ?? {}) as { identity?: { unit_id?: string; unit_type?: string } };
  const title = typeof obj.title === 'string' ? obj.title : `${gov.identity?.unit_type ?? 'unit'} ${gov.identity?.unit_id ?? ''}`.trim();
  return { title: foldVietnamese(title), body: foldVietnamese(parts.join('\n')) };
}

/**
 * User text → FTS5 query of quoted terms (AND). No FTS syntax from the caller reaches MATCH, so a query can neither
 * error nor use column filters / NEAR to probe fields. Returns null when nothing searchable is left.
 */
export function toMatchQuery(input: string): string | null {
  const terms = foldVietnamese(input).normalize('NFC').split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 2).slice(0, MAX_QUERY_TERMS);
  return terms.length ? terms.map((t) => `"${t}"`).join(' ') : null;
}

export class KnowledgeSearch {
  constructor(private db: Db, private json: JsonStore, private now: () => Date) {}

  /** Indexes units that are new or whose content hash changed. Idempotent; called before every search. */
  sync(): { indexed: number } {
    const missing = this.db.prepare(`SELECT k.kind, k.object_id, k.version, k.content_hash FROM knowledge_units k
      LEFT JOIN knowledge_search_units s ON s.kind = k.kind AND s.object_id = k.object_id AND s.version = k.version
      WHERE s.search_rowid IS NULL OR s.content_hash != k.content_hash`).all() as { kind: string; object_id: string; version: string; content_hash: string }[];
    if (!missing.length) return { indexed: 0 };
    const at = this.now().toISOString();
    this.db.transaction(() => {
      for (const u of missing) {
        // Read with the recorded hash: a file changed on disk fails here instead of being indexed.
        const text = unitText(this.json.get(u.kind as Parameters<JsonStore['get']>[0], u.object_id, u.version, u.content_hash));
        const prior = this.db.prepare('SELECT search_rowid FROM knowledge_search_units WHERE kind = ? AND object_id = ? AND version = ?').get(u.kind, u.object_id, u.version) as { search_rowid: number } | undefined;
        if (prior) {
          this.db.prepare('DELETE FROM knowledge_search WHERE rowid = ?').run(prior.search_rowid);
          this.db.prepare('DELETE FROM knowledge_search_units WHERE search_rowid = ?').run(prior.search_rowid);
        }
        const rowid = Number(this.db.prepare('INSERT INTO knowledge_search (title, body) VALUES (?, ?)').run(text.title, text.body).lastInsertRowid);
        this.db.prepare('INSERT INTO knowledge_search_units (search_rowid, kind, object_id, version, content_hash, indexed_at) VALUES (?, ?, ?, ?, ?, ?)')
          .run(rowid, u.kind, u.object_id, u.version, u.content_hash, at);
      }
    }).immediate();
    return { indexed: missing.length };
  }

  /** Drops and rebuilds the projection from the JSON files (06 §5.B.1). */
  rebuild(): { indexed: number } {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM knowledge_search_units').run();
      this.db.prepare('DELETE FROM knowledge_search').run();
    }).immediate();
    return this.sync();
  }

  /**
   * BM25-ranked units the role may read. `released`: only active releases (what AI roles and the learner flow may use).
   * `builder`: also draft/suspended releases, for the Builder & QC console; retired and revoked units never appear.
   * Limitation: BM25 term statistics cover the whole index, so hidden units can shift scores; they are never returned.
   */
  search(input: { query: string; role: ContextRole; scope?: SearchScope; limit?: number }): SearchHit[] {
    const match = toMatchQuery(input.query);
    if (!match) return [];
    this.sync();
    const limit = Math.min(Math.max(Math.trunc(input.limit ?? 10), 1), MAX_LIMIT);
    const states = input.scope === 'builder' ? ['active', 'draft', 'suspended'] : ['active'];
    return this.db.prepare(`
      WITH allowed AS (
        SELECT s.search_rowid, k.kind, k.object_id, k.version, k.unit_type, k.package_id, k.package_version, r.state
        FROM knowledge_units k
        JOIN knowledge_search_units s ON s.kind = k.kind AND s.object_id = k.object_id AND s.version = k.version AND s.content_hash = k.content_hash
        JOIN package_releases r ON r.package_id = k.package_id AND r.version = k.package_version
        WHERE r.state IN (${states.map(() => '?').join(', ')})
          AND EXISTS (SELECT 1 FROM json_each(k.roles_json) WHERE json_each.value = ?)
          AND NOT EXISTS (SELECT 1 FROM revocations v WHERE
            (v.target_kind = k.kind AND v.target_id = k.object_id AND (v.target_version IS NULL OR v.target_version = k.version))
            OR (v.target_kind = 'package' AND v.target_id = k.package_id AND (v.target_version IS NULL OR v.target_version = k.package_version)))
      )
      SELECT a.kind, a.object_id, a.version, a.unit_type, f.title, a.package_id, a.package_version, a.state AS release_state, bm25(knowledge_search, 5.0, 1.0) AS score
      FROM knowledge_search f JOIN allowed a ON a.search_rowid = f.rowid
      WHERE knowledge_search MATCH ?
      ORDER BY score, a.kind, a.object_id, a.version
      LIMIT ?`).all(...states, input.role, match, limit) as SearchHit[];
  }
}
