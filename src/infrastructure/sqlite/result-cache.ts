import type { Revocation } from '../../domain/evidence/types.js';
import { isRevoked } from '../../domain/knowledge/revocation.js';
import { canonicalJson, sha256 } from '../files/paths.js';
import type { Db } from './database.js';

/** Every field that must match for reuse (06A §7.C.4, 05 §8.C.5). */
export interface CacheKeyFields {
  input_hash: string; role: string; phase: string; policy_version: string; rubric_version: string | null;
  knowledge: { kind: string; id: string; version: string; hash: string }[]; model: string; disclosure_level: number;
}
export interface CacheDep { kind: Revocation['target_kind']; id: string; version: string }

export type CacheLookup = { hit: true; result: unknown; counts_as_evidence: false } | { hit: false; reason: 'MISS' | 'INVALIDATED' | 'DEPENDENCY_REVOKED' };

/** Result cache. A hit never creates evidence; suspend/retire/revoke invalidates dependents in the same transaction. */
export class ResultCache {
  constructor(private db: Db, private now: () => Date = () => new Date()) {}

  static key(f: CacheKeyFields): string {
    return sha256(canonicalJson({ ...f, knowledge: [...f.knowledge].sort((a, b) => `${a.kind}/${a.id}@${a.version}`.localeCompare(`${b.kind}/${b.id}@${b.version}`)) }));
  }

  put(f: CacheKeyFields, result: unknown, deps: CacheDep[]): string {
    const key = ResultCache.key(f);
    this.db.transaction(() => {
      if (this.db.prepare('SELECT 1 FROM result_cache WHERE cache_key = ?').get(key)) return;
      this.db.prepare(`INSERT INTO result_cache (cache_key, input_hash, role, phase, policy_version, rubric_version, knowledge_fingerprint, model, disclosure_level, result_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(key, f.input_hash, f.role, f.phase, f.policy_version, f.rubric_version, sha256(canonicalJson(f.knowledge)), f.model, f.disclosure_level, canonicalJson(result), this.now().toISOString());
      const dep = this.db.prepare('INSERT OR IGNORE INTO result_cache_deps (cache_key, dep_kind, dep_id, dep_version) VALUES (?, ?, ?, ?)');
      for (const d of [...deps, ...f.knowledge.map((k) => ({ kind: k.kind as CacheDep['kind'], id: k.id, version: k.version }))]) dep.run(key, d.kind, d.id, d.version);
    }).immediate();
    return key;
  }

  /** Checks revocations again at read time, so a missed invalidation still cannot serve revoked content. */
  lookup(f: CacheKeyFields, revocations: readonly Revocation[]): CacheLookup {
    const row = this.db.prepare('SELECT cache_key, result_json, invalidated_at FROM result_cache WHERE cache_key = ?').get(ResultCache.key(f)) as { cache_key: string; result_json: string; invalidated_at: string | null } | undefined;
    if (!row) return { hit: false, reason: 'MISS' };
    if (row.invalidated_at) return { hit: false, reason: 'INVALIDATED' };
    const deps = this.db.prepare('SELECT dep_kind, dep_id, dep_version FROM result_cache_deps WHERE cache_key = ?').all(row.cache_key) as { dep_kind: CacheDep['kind']; dep_id: string; dep_version: string }[];
    if (deps.some((d) => isRevoked(d.dep_kind, d.dep_id, d.dep_version, revocations))) return { hit: false, reason: 'DEPENDENCY_REVOKED' };
    return { hit: true, result: JSON.parse(row.result_json), counts_as_evidence: false };
  }

  /** One-way invalidation of every entry depending on the target (version null = all versions). */
  invalidate(targets: { kind: string; id: string; version: string | null }[], reason: string): number {
    const at = this.now().toISOString();
    let n = 0;
    const find = this.db.prepare(`SELECT DISTINCT c.cache_key FROM result_cache_deps d JOIN result_cache c USING (cache_key)
      WHERE c.invalidated_at IS NULL AND d.dep_kind = ? AND d.dep_id = ? AND (? IS NULL OR d.dep_version = ?)`);
    const mark = this.db.prepare('UPDATE result_cache SET invalidated_at = ?, invalidated_reason = ? WHERE cache_key = ? AND invalidated_at IS NULL');
    for (const t of targets) {
      for (const r of find.all(t.kind, t.id, t.version, t.version) as { cache_key: string }[]) n += mark.run(at, reason, r.cache_key).changes;
    }
    return n;
  }
}
