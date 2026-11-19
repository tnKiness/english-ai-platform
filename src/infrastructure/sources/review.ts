// Review of crawled source candidates (E-37). Approving a page registers it in the Source Registry (output 1) with the
// rights the user decided (E-36: personal use, copy stored locally, may be given to AI). Rejecting keeps the row so the
// crawler never queues it again. Excerpts are plain text, never the page's HTML.
import { existsSync, readFileSync } from 'node:fs';
import type { DataPaths } from '../files/paths.js';
import { resolveContained, sha256 } from '../files/paths.js';
import type { BuilderRepository } from '../sqlite/builder-repository.js';
import type { Db } from '../sqlite/database.js';
import { sourcesDir } from './crawler.js';
import { htmlText } from './page.js';

export interface CandidateRow {
  candidate_id: string; url: string; host: string; origin: string; depth: number; fetch_state: string; http_status: number | null; content_type: string | null;
  title: string | null; byte_size: number | null; sha256: string | null; stored_path: string | null; text_chars: number | null; kind: string; skill: string | null;
  review_state: 'PENDING' | 'APPROVED' | 'REJECTED'; source_id: string | null; source_version: string | null; error: string | null; fetched_at: string | null; reviewed_at: string | null;
}

export const RIGHTS_BASIS = 'Người dùng chốt E-36 (18/11/2026): dùng cá nhân, lưu bản sao cục bộ, cho phép xử lý bằng AI; người dùng chấp nhận rủi ro bản quyền.';

export class SourceReview {
  constructor(private db: Db, private paths: DataPaths, private builder: BuilderRepository, private now: () => Date) {}

  list(f: { review?: string; kind?: string; skill?: string; host?: string; fetch?: string; q?: string; media?: string; limit?: number; offset?: number } = {}) {
    const where: string[] = []; const args: (string | number)[] = [];
    const eq = (col: string, v?: string) => { if (v) { where.push(`${col} = ?`); args.push(v); } };
    eq('review_state', f.review); eq('kind', f.kind); eq('skill', f.skill); eq('host', f.host); eq('fetch_state', f.fetch);
    if (f.media === 'audio') where.push("content_type LIKE 'audio/%'");
    else if (f.media === 'pdf') where.push("content_type = 'application/pdf'");
    else if (f.media === 'html') where.push("content_type IN ('text/html', 'application/xhtml+xml')");
    if (f.q) { where.push("(url LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\')"); const like = `%${f.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`; args.push(like, like); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limit = Math.max(1, Math.min(500, f.limit ?? 100)); const offset = Math.max(0, f.offset ?? 0);
    const rows = this.db.prepare(`SELECT * FROM source_candidates ${w} ORDER BY CASE kind WHEN 'band_descriptors' THEN 0 WHEN 'sample_answers' THEN 1 WHEN 'test_format' THEN 2 ELSE 3 END, depth, url LIMIT ? OFFSET ?`)
      .all(...args, limit, offset) as CandidateRow[];
    const total = (this.db.prepare(`SELECT COUNT(*) AS n FROM source_candidates ${w}`).get(...args) as { n: number }).n;
    const group = (col: string) => Object.fromEntries((this.db.prepare(`SELECT ${col} AS k, COUNT(*) AS n FROM source_candidates GROUP BY ${col}`).all() as { k: string | null; n: number }[]).map((r) => [r.k ?? '—', r.n]));
    return { total, rows, counts: { review: group('review_state'), fetch: group('fetch_state'), kind: group('kind'), host: group('host'), skill: group('skill') } };
  }

  /** Plain-text excerpt of a stored page: HTML with tags removed, or the extracted text of a PDF (E-39). */
  excerpt(id: string, max = 8000): { candidate_id: string; text: string | null; truncated: boolean } {
    const r = this.db.prepare('SELECT stored_path, content_type FROM source_candidates WHERE candidate_id = ?').get(id) as { stored_path: string | null; content_type: string | null } | undefined;
    if (!r) throw Object.assign(new Error('Unknown candidate'), { statusCode: 404, code: 'NOT_FOUND' });
    if (!r.stored_path) return { candidate_id: id, text: null, truncated: false };
    const isPdf = r.content_type === 'application/pdf';
    const file = resolveContained(sourcesDir(this.paths), isPdf ? r.stored_path.replace(/\.pdf$/, '.txt') : r.stored_path);
    if (!existsSync(file)) return { candidate_id: id, text: null, truncated: false };
    const text = isPdf ? readFileSync(file, 'utf8') : htmlText(readFileSync(file, 'utf8'));
    return { candidate_id: id, text: text.slice(0, max), truncated: text.length > max };
  }

  /** E-44: a stored audio file for the reviewer's player. Only audio/* rows; the type comes from the magic-byte check. */
  audio(id: string): { file: string; type: string; size: number } {
    const r = this.db.prepare('SELECT stored_path, content_type, byte_size FROM source_candidates WHERE candidate_id = ?').get(id) as { stored_path: string | null; content_type: string | null; byte_size: number | null } | undefined;
    if (!r || !r.stored_path || !r.content_type?.startsWith('audio/')) throw Object.assign(new Error('Not an audio source'), { statusCode: 404, code: 'NOT_FOUND' });
    const file = resolveContained(sourcesDir(this.paths), r.stored_path);
    if (!existsSync(file)) throw Object.assign(new Error('Audio file missing'), { statusCode: 404, code: 'NOT_FOUND' });
    return { file, type: r.content_type, size: r.byte_size ?? 0 };
  }

  /** Approve or reject candidates. Only fetched pages can be approved; each approval is one Source Registry record. */
  review(ids: readonly string[], decision: 'approve' | 'reject'): { approved: number; rejected: number; skipped: { candidate_id: string; reason: string }[] } {
    const out = { approved: 0, rejected: 0, skipped: [] as { candidate_id: string; reason: string }[] };
    this.builder.transaction(() => {
      const at = this.now().toISOString();
      for (const id of ids) {
        const r = this.db.prepare('SELECT * FROM source_candidates WHERE candidate_id = ?').get(id) as CandidateRow | undefined;
        if (!r) { out.skipped.push({ candidate_id: id, reason: 'NOT_FOUND' }); continue; }
        if (decision === 'reject') {
          this.db.prepare("UPDATE source_candidates SET review_state = 'REJECTED', reviewed_at = ?, updated_at = ? WHERE candidate_id = ?").run(at, at, id);
          out.rejected += 1; continue;
        }
        if (r.fetch_state !== 'FETCHED' || !r.sha256 || !r.stored_path) { out.skipped.push({ candidate_id: id, reason: 'NOT_FETCHED' }); continue; }
        const sourceId = `web-${sha256(r.url).slice(0, 20)}`;
        const version = r.sha256.slice(0, 16);
        this.builder.registerSource({
          schema_version: '1', source_id: sourceId, version, title: r.title ?? r.url, origin: r.origin,
          locator: { url: r.url, document: `sources/${r.stored_path}` }, scope_level: 'document',
          copyright_notice: `Bản quyền thuộc chủ sở hữu ${r.host}; bản sao chỉ lưu cục bộ để dùng cá nhân.`,
          accessed_at: r.fetched_at ?? at, checksum: r.sha256, intended_purposes: ['internal_use', 'learner_display'],
          rights: { status: 'determined', store_copy: true, ai_processing: true, learner_display: true, basis: RIGHTS_BASIS },
          registry_state: 'approved',
        });
        this.db.prepare("UPDATE source_candidates SET review_state = 'APPROVED', source_id = ?, source_version = ?, reviewed_at = ?, updated_at = ? WHERE candidate_id = ?")
          .run(sourceId, version, at, at, id);
        out.approved += 1;
      }
    });
    return out;
  }
}
