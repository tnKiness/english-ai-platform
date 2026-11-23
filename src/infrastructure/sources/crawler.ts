// Source crawler (E-37, D-05 N2): fetches pages of the allowlisted source domains into var/sources and records each one
// as a candidate for the learner's review. Bounded (pages per run, depth, size, timeout), polite (robots.txt, one
// request per host per interval, redirects checked hop by hop before they are requested), resumable (the QUEUED rows are the frontier). Never follows links off the allowlist.
import { diskStatus, type DiskStatus } from '../files/disk-guard.js';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { DataPaths } from '../files/paths.js';
import { sha256 } from '../files/paths.js';
import type { Db } from '../sqlite/database.js';
import { audioFormat, classify, compileExcludes, htmlAudioLinks, htmlLinks, htmlText, htmlTitle, isAudioUrl, isExcluded, normalizeUrl, parseRobots, robotsAllows, ruleFor, type CompiledExclude, type DomainRule, type ExcludeRule } from './page.js';
import { extractPdfText } from './pdf-text.js';

/**
 * E-39: text + layout of a stored PDF, written next to it (`<sha>.txt`, `<sha>.layout.json`, and since E-46 the
 * table ruling lines `<sha>.rules.json`). Never throws: a PDF
 * that cannot be read keeps its copy and reports why.
 */
export async function extractStoredPdf(paths: DataPaths, rel: string): Promise<{ chars: number; pages: number } | { error: string }> {
  const file = join(sourcesDir(paths), rel);
  try {
    const r = await extractPdfText(new Uint8Array(readFileSync(file)));
    const base = file.replace(/\.pdf$/, '');
    writeFileSync(`${base}.txt`, r.text, 'utf8');
    writeFileSync(`${base}.layout.json`, JSON.stringify(r.items), 'utf8');
    writeFileSync(`${base}.rules.json`, JSON.stringify(r.rules), 'utf8');
    return { chars: r.text.length, pages: r.pages.length };
  } catch (e) { return { error: `PDF_TEXT_FAILED: ${(e instanceof Error ? e.message : String(e)).slice(0, 160)}` }; }
}

/** Backfill: extract fetched PDFs with no text yet (before E-39) or no ruling lines yet (before E-46). */
export async function extractPendingPdfs(db: Db, paths: DataPaths, now: () => Date = () => new Date()): Promise<{ extracted: number; failed: number }> {
  const rows = (db.prepare("SELECT candidate_id, stored_path, text_chars FROM source_candidates WHERE fetch_state = 'FETCHED' AND content_type = 'application/pdf' AND stored_path IS NOT NULL").all() as { candidate_id: string; stored_path: string; text_chars: number | null }[])
    .filter((r) => r.text_chars === null || !existsSync(join(sourcesDir(paths), r.stored_path.replace(/\.pdf$/, '.rules.json'))));
  const out = { extracted: 0, failed: 0 };
  for (const r of rows) {
    const x = await extractStoredPdf(paths, r.stored_path);
    const at = now().toISOString();
    if ('error' in x) { db.prepare('UPDATE source_candidates SET error = ?, updated_at = ? WHERE candidate_id = ?').run(x.error, at, r.candidate_id); out.failed += 1; }
    else { db.prepare('UPDATE source_candidates SET text_chars = ?, error = NULL, updated_at = ? WHERE candidate_id = ?').run(x.chars, at, r.candidate_id); out.extracted += 1; }
  }
  return out;
}

export interface SeedConfig {
  schema_version: '1'; version: string; decision: string; user_agent: string;
  limits: { max_depth: number; max_bytes: number; min_interval_ms: number; timeout_ms: number; max_audio_bytes?: number };
  domains: (DomainRule & { note?: string })[];
  /**
   * E-44: hosts outside the allowlist from which ONLY audio files linked from an allowlisted page may be fetched (a
   * publisher's CDN). Restricted to a path prefix; their pages are never crawled. Origin is that of the linking page.
   */
  media_hosts?: { host: string; path_prefix: string; note?: string }[];
  /** E-40: allowlisted URLs that are still not crawled. */
  exclude?: ExcludeRule[];
  seeds: string[];
}

export const SEED_FILE = 'policies/source-seeds.v1.json';
export function loadSeedConfig(file = resolve(SEED_FILE)): SeedConfig {
  const c = JSON.parse(readFileSync(file, 'utf8')) as SeedConfig;
  if (c.schema_version !== '1' || !Array.isArray(c.domains) || !Array.isArray(c.seeds) || !c.limits) throw new Error(`${file}: invalid seed config`);
  if (c.exclude !== undefined && !Array.isArray(c.exclude)) throw new Error(`${file}: exclude must be a list`);
  compileExcludes(c.exclude); // throws on an invalid pattern
  return c;
}

export const sourcesDir = (paths: DataPaths) => join(paths.root, 'sources');

type Fetch = (url: string, init: { headers: Record<string, string>; signal: AbortSignal; redirect: 'manual' }) => Promise<Response>;
export interface CrawlOptions {
  maxPages: number;
  /** E-53: disk check before each download (tests inject one). */
  disk?: () => DiskStatus;
  now?: () => Date;
  fetchImpl?: Fetch;
  sleep?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
}
export interface CrawlReport { processed: number; fetched: number; skipped: number; failed: number; discovered: number; queued_left: number; excluded_from_queue: number; stopped?: 'DISK_LOW' }
const DEFAULT_MAX_AUDIO_BYTES = 60 * 1024 * 1024;

export class SourceCrawler {
  private robots = new Map<string, { allow: string[]; disallow: string[] } | 'blocked'>();
  private lastHit = new Map<string, number>();
  private excludes: CompiledExclude;
  constructor(private db: Db, private paths: DataPaths, private cfg: SeedConfig) { this.excludes = compileExcludes(cfg.exclude); }

  /** Queued rows that the (possibly newer) exclusion policy covers become SKIPPED, so they are never fetched. */
  applyExclusions(now: () => Date): number {
    if (this.excludes.length === 0) return 0;
    const at = now().toISOString();
    const rows = this.db.prepare("SELECT candidate_id, url FROM source_candidates WHERE fetch_state = 'QUEUED'").all() as { candidate_id: string; url: string }[];
    const skip = this.db.prepare("UPDATE source_candidates SET fetch_state = 'SKIPPED', error = 'EXCLUDED_BY_POLICY', updated_at = ? WHERE candidate_id = ? AND fetch_state = 'QUEUED'");
    let n = 0;
    this.db.transaction(() => { for (const r of rows) if (isExcluded(new URL(r.url), this.excludes)) n += skip.run(at, r.candidate_id).changes; })();
    return n;
  }

  /** Adds seeds once (depth 0). Seeds outside the allowlist are refused, not crawled. */
  seed(now: () => Date): number {
    let added = 0;
    for (const s of this.cfg.seeds) {
      const n = normalizeUrl(s);
      if (!n) continue;
      const rule = ruleFor(new URL(n), this.cfg.domains);
      if (rule) added += this.enqueue(n, rule, 0, null, now);
    }
    return added;
  }

  /** Rule for a link found on a page: the allowlist, or (audio only) a media host under its path prefix. */
  private linkRule(u: URL, pageOrigin: DomainRule['origin'], audio: boolean): DomainRule | null {
    const rule = ruleFor(u, this.cfg.domains);
    if (rule) return rule;
    if (!audio) return null;
    const m = (this.cfg.media_hosts ?? []).find((h) => u.host.toLowerCase() === h.host.toLowerCase() && u.pathname.startsWith(h.path_prefix));
    return m ? { host: m.host, origin: pageOrigin } : null;
  }

  /** E-44 backfill: audio links on pages fetched before audio support existed. Returns how many were queued. */
  discoverAudio(now: () => Date = () => new Date()): number {
    const rows = this.db.prepare("SELECT url, origin, depth, stored_path FROM source_candidates WHERE fetch_state = 'FETCHED' AND content_type IN ('text/html', 'application/xhtml+xml') AND stored_path IS NOT NULL")
      .all() as { url: string; origin: DomainRule['origin']; depth: number; stored_path: string }[];
    let n = 0;
    for (const r of rows) {
      const file = join(sourcesDir(this.paths), r.stored_path);
      if (!existsSync(file)) continue;
      for (const link of htmlAudioLinks(readFileSync(file, 'utf8'), r.url)) {
        const rule = this.linkRule(new URL(link), r.origin, true);
        if (rule) n += this.enqueue(link, rule, r.depth + 1, r.url, now);
      }
    }
    return n;
  }

  private enqueue(url: string, rule: DomainRule, depth: number, from: string | null, now: () => Date): number {
    if (isExcluded(new URL(url), this.excludes)) return 0;
    const at = now().toISOString();
    return this.db.prepare(`INSERT INTO source_candidates (candidate_id, url, host, origin, depth, discovered_from, fetch_state, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'QUEUED', ?, ?) ON CONFLICT (url) DO NOTHING`).run(randomUUID(), url, new URL(url).host, rule.origin, depth, from, at, at).changes;
  }

  private async pace(host: string, sleep: (ms: number) => Promise<void>) {
    const wait = (this.lastHit.get(host) ?? 0) + this.cfg.limits.min_interval_ms - Date.now();
    if (wait > 0) await sleep(wait);
    this.lastHit.set(host, Date.now());
  }

  private async get(url: string, fetchImpl: Fetch, sleep: (ms: number) => Promise<void>) {
    await this.pace(new URL(url).host, sleep);
    return fetchImpl(url, { headers: { 'user-agent': this.cfg.user_agent, accept: 'text/html,application/pdf;q=0.9,*/*;q=0.1' }, signal: AbortSignal.timeout(this.cfg.limits.timeout_ms), redirect: 'manual' });
  }

  /**
   * Follows redirects by hand (at most 5) so that a hop off the allowlist is refused BEFORE it is requested.
   * Returns the final response and URL, or the reason it stopped.
   */
  private async follow(url: string, fetchImpl: Fetch, sleep: (ms: number) => Promise<void>, origin: DomainRule['origin'] = 'official'): Promise<{ res: Response; url: string } | { stop: string; status: number }> {
    let current = url;
    for (let hop = 0; hop <= 5; hop += 1) {
      const res = await this.get(current, fetchImpl, sleep);
      if (res.status < 300 || res.status >= 400) return { res, url: current };
      const location = res.headers.get('location');
      const next = location ? normalizeUrl(location, current) : null;
      if (!next) return { stop: 'REDIRECT_INVALID', status: res.status };
      const u = new URL(next);
      if (!this.linkRule(u, origin, isAudioUrl(url))) return { stop: 'REDIRECT_OFF_ALLOWLIST', status: res.status };
      if (isExcluded(u, this.excludes)) return { stop: 'EXCLUDED_BY_POLICY', status: res.status };
      const robots = await this.robotsFor(u, fetchImpl, sleep);
      if (robots === 'blocked' || !robotsAllows(robots, `${u.pathname}${u.search}`)) return { stop: 'ROBOTS_DISALLOW', status: res.status };
      current = next;
    }
    return { stop: 'TOO_MANY_REDIRECTS', status: 0 };
  }

  private async robotsFor(u: URL, fetchImpl: Fetch, sleep: (ms: number) => Promise<void>) {
    const key = `${u.protocol}//${u.host}`;
    if (!this.robots.has(key)) {
      try {
        const r = await this.get(`${key}/robots.txt`, fetchImpl, sleep);
        this.robots.set(key, r.ok ? parseRobots(await r.text()) : r.status === 404 || r.status === 410 ? { allow: [], disallow: [] } : 'blocked');
      } catch { this.robots.set(key, 'blocked'); }
    }
    return this.robots.get(key)!;
  }

  async crawl(opts: CrawlOptions): Promise<CrawlReport> {
    const now = opts.now ?? (() => new Date());
    const fetchImpl = opts.fetchImpl ?? ((url, init) => fetch(url, init));
    const sleep = opts.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
    const log = opts.log ?? (() => undefined);
    mkdirSync(sourcesDir(this.paths), { recursive: true });
    this.seed(now);
    const report: CrawlReport = { processed: 0, fetched: 0, skipped: 0, failed: 0, discovered: 0, queued_left: 0, excluded_from_queue: this.applyExclusions(now) };
    const next = this.db.prepare("SELECT candidate_id, url, depth, origin FROM source_candidates WHERE fetch_state = 'QUEUED' ORDER BY depth, created_at, url LIMIT 1");
    const finish = this.db.prepare(`UPDATE source_candidates SET fetch_state = ?, http_status = ?, content_type = ?, title = ?, byte_size = ?, sha256 = ?, stored_path = ?, text_chars = ?,
      kind = ?, skill = ?, error = ?, fetched_at = ?, updated_at = ? WHERE candidate_id = ?`);
    while (report.processed < opts.maxPages) {
      // E-53 (D-07): stop before the next download when the disk is in the block zone; the queue stays for later.
      const disk = (opts.disk ?? (() => diskStatus(this.paths.root)))();
      if (disk.level === 'block') { report.stopped = 'DISK_LOW'; log(`DỪNG  ${disk.message ?? 'DISK_LOW'}`); break; }
      const row = next.get() as { candidate_id: string; url: string; depth: number; origin: DomainRule['origin'] } | undefined;
      if (!row) break;
      report.processed += 1;
      const at = now().toISOString();
      const audioRow = isAudioUrl(row.url);
      const done = (state: 'FETCHED' | 'FAILED' | 'SKIPPED', f: { status?: number | null; type?: string | null; title?: string | null; size?: number | null; sha?: string | null; path?: string | null; chars?: number | null; error?: string | null }) => {
        // Audio is Listening practice material; the reviewer still decides what it is worth.
        const c = audioRow ? { kind: 'practice_material' as const, skill: 'listening' as const } : classify(row.url, f.title ?? null);
        finish.run(state, f.status ?? null, f.type ?? null, f.title ?? null, f.size ?? null, f.sha ?? null, f.path ?? null, f.chars ?? null, c.kind, c.skill, f.error ?? null, at, at, row.candidate_id);
        report[state === 'FETCHED' ? 'fetched' : state === 'FAILED' ? 'failed' : 'skipped'] += 1;
        log(`${state.padEnd(7)} ${row.url}${f.error ? ` — ${f.error}` : ''}`);
      };
      const u = new URL(row.url);
      const robots = await this.robotsFor(u, fetchImpl, sleep);
      if (robots === 'blocked') { done('SKIPPED', { error: 'ROBOTS_UNAVAILABLE' }); continue; }
      if (!robotsAllows(robots, `${u.pathname}${u.search}`)) { done('SKIPPED', { error: 'ROBOTS_DISALLOW' }); continue; }
      let got: Awaited<ReturnType<SourceCrawler['follow']>>;
      try { got = await this.follow(row.url, fetchImpl, sleep, row.origin); } catch (e) { done('FAILED', { error: e instanceof Error ? e.name === 'TimeoutError' ? 'TIMEOUT' : e.message.slice(0, 200) : 'FETCH_ERROR' }); continue; }
      if ('stop' in got) { done('SKIPPED', { status: got.status, error: got.stop }); continue; }
      const { res } = got;
      const finalUrl = got.url;
      if (!res.ok) { done('FAILED', { status: res.status, error: `HTTP_${res.status}` }); continue; }
      const type = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
      const isHtml = type === 'text/html' || type === 'application/xhtml+xml';
      const isPdf = type === 'application/pdf';
      const isAudio = audioRow && (type.startsWith('audio/') || type === 'application/octet-stream' || type === 'binary/octet-stream');
      if (!isHtml && !isPdf && !isAudio) { done('SKIPPED', { status: res.status, type, error: 'UNSUPPORTED_TYPE' }); continue; }
      const maxBytes = isAudio ? this.cfg.limits.max_audio_bytes ?? DEFAULT_MAX_AUDIO_BYTES : this.cfg.limits.max_bytes;
      const declared = Number(res.headers.get('content-length') ?? '0');
      if (declared > maxBytes) { done('SKIPPED', { status: res.status, type, size: declared, error: 'TOO_LARGE' }); continue; }
      // The timeout signal also covers reading the body: a stalled body must fail this page, not end the whole run.
      let bytes: Uint8Array;
      try { bytes = new Uint8Array(await res.arrayBuffer()); } catch (e) { done('FAILED', { status: res.status, type, error: e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError') ? 'TIMEOUT' : 'BODY_READ_ERROR' }); continue; }
      if (bytes.byteLength > maxBytes) { done('SKIPPED', { status: res.status, type, size: bytes.byteLength, error: 'TOO_LARGE' }); continue; }
      const sha = sha256(bytes);
      if (isAudio) {
        const fmt = audioFormat(bytes);
        if (!fmt) { done('SKIPPED', { status: res.status, type, size: bytes.byteLength, error: 'AUDIO_UNRECOGNISED' }); continue; }
        const relAudio = `${sha}.${fmt.ext}`;
        const fileAudio = join(sourcesDir(this.paths), relAudio);
        if (!existsSync(fileAudio)) writeFileSync(fileAudio, bytes);
        done('FETCHED', { status: res.status, type: fmt.mime, size: bytes.byteLength, sha, path: relAudio, title: decodeURIComponent(u.pathname.split('/').pop() ?? '') || null, chars: null });
        continue;
      }
      const rel = `${sha}.${isPdf ? 'pdf' : 'html'}`;
      const file = join(sourcesDir(this.paths), rel);
      if (!existsSync(file)) writeFileSync(file, bytes);
      if (isPdf) {
        const x = await extractStoredPdf(this.paths, rel);
        done('FETCHED', { status: res.status, type, size: bytes.byteLength, sha, path: rel, title: decodeURIComponent(u.pathname.split('/').pop() ?? '') || null,
          chars: 'error' in x ? null : x.chars, error: 'error' in x ? x.error : null });
        continue;
      }
      const html = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      const title = htmlTitle(html);
      done('FETCHED', { status: res.status, type, size: bytes.byteLength, sha, path: rel, title, chars: htmlText(html).length });
      // Audio files are leaves: queued from any fetched page, whatever its depth.
      for (const link of htmlAudioLinks(html, finalUrl)) {
        const rule = this.linkRule(new URL(link), row.origin, true);
        if (rule) report.discovered += this.enqueue(link, rule, row.depth + 1, row.url, now);
      }
      if (row.depth < this.cfg.limits.max_depth) {
        for (const link of htmlLinks(html, finalUrl)) {
          const rule = ruleFor(new URL(link), this.cfg.domains);
          if (rule) report.discovered += this.enqueue(link, rule, row.depth + 1, row.url, now);
        }
      }
    }
    report.queued_left = (this.db.prepare("SELECT COUNT(*) AS n FROM source_candidates WHERE fetch_state = 'QUEUED'").get() as { n: number }).n;
    return report;
  }
}
