// E-37 (D-05 N2): source crawler + review, against a local HTTP server (no Internet).
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { classify, compileExcludes, htmlLinks, isExcluded, normalizeUrl, parseRobots, robotsAllows } from '../../src/infrastructure/sources/page.js';
import { SourceCrawler, extractPendingPdfs, loadSeedConfig, sourcesDir, type SeedConfig } from '../../src/infrastructure/sources/crawler.js';
import { makePdf } from '../fixtures/make-pdf.js';
import { SourceReview } from '../../src/infrastructure/sources/review.js';
import { validateKnowledge } from '../../src/infrastructure/contracts/validate.js';
import { fixture } from './p1-helpers.js';

let server: Server;
let base = '';
const hits: string[] = [];
const PAGES: Record<string, { type: string; body: string | Buffer; status?: number }> = {
  '/robots.txt': { type: 'text/plain', body: 'User-agent: *\nDisallow: /private\nAllow: /private/ok\n' },
  '/': { type: 'text/html', body: '<html><head><title>IELTS Writing band descriptors &amp; more</title></head><body><a href="/a">A</a> <a href="/private/x">P</a> <a href="/private/ok">OK</a> <a href="https://elsewhere.example/x">ext</a> <a href="/doc.pdf">pdf</a> <a href="/img.png">img</a> <a href="/a#frag">dup</a> <a href="/big">big</a> <a href="/away">away</a> <a href="/writing-band-descriptors.pdf">bd</a></body></html>' },
  '/a': { type: 'text/html', body: '<title>Writing sample answer with examiner comments</title><script>evil()</script><p>Band 7 sample.</p><a href="/b">B</a>' },
  '/b': { type: 'text/html', body: '<title>B</title><a href="/c">C</a>' },
  '/c': { type: 'text/html', body: '<title>C deep</title>' },
  '/private/ok': { type: 'text/html', body: '<title>allowed under private</title>' },
  '/doc.pdf': { type: 'application/pdf', body: Buffer.from('%PDF-1.4 synthetic') },
  '/big': { type: 'text/html', body: 'x'.repeat(5000) },
  '/writing-band-descriptors.pdf': { type: 'application/pdf', body: Buffer.from(makePdf([[{ x: 50, y: 700, text: 'Band 7' }, { x: 200, y: 700, text: 'presents a clear position' }]])) },
};

beforeAll(async () => {
  server = createServer((req, res) => {
    hits.push(req.url ?? '');
    if (req.url === '/stall') { res.writeHead(200, { 'content-type': 'text/html' }); res.write('<title>stall</title>'); return; } // body never ends
    if (req.url === '/redir') { res.writeHead(302, { location: '/away2' }); res.end(); return; }
    if (req.url === '/away') { res.writeHead(302, { location: 'http://localhost:1/elsewhere' }); res.end(); return; }
    const p = PAGES[req.url ?? ''];
    if (!p) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('nope'); return; }
    res.writeHead(p.status ?? 200, { 'content-type': `${p.type}; charset=utf-8` }); res.end(p.body);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const cfg = (over: Partial<SeedConfig['limits']> = {}): SeedConfig => ({
  schema_version: '1', version: 'test', decision: 'test', user_agent: 'test-crawler',
  limits: { max_depth: 2, max_bytes: 4000, min_interval_ms: 0, timeout_ms: 5000, ...over },
  domains: [{ host: new URL(base).host, origin: 'official' }], seeds: [`${base}/`, 'https://not-allowlisted.example/'],
});

describe('page helpers', () => {
  it('normalises URLs, follows robots longest-match, extracts links and labels pages', () => {
    expect(normalizeUrl('https://Ex.org/a/?utm_source=x&id=1#top')).toBe('https://ex.org/a?id=1');
    expect(normalizeUrl('/x.png', 'https://ex.org/')).toBeNull();
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
    const r = parseRobots('User-agent: bot\nDisallow: /\n\nUser-agent: *\nDisallow: /p\nAllow: /p/ok\n');
    expect([robotsAllows(r, '/p/x'), robotsAllows(r, '/p/ok'), robotsAllows(r, '/q')]).toEqual([false, true, true]);
    expect(htmlLinks('<a href="/a#x">1</a><a href=\'b\'>2</a>', 'https://ex.org/d/')).toEqual(['https://ex.org/a', 'https://ex.org/d/b']);
    expect(classify('https://ielts.org/cdn/ielts-writing-band-descriptors.pdf', null)).toEqual({ kind: 'band_descriptors', skill: 'writing' });
  });
  it('E-40: exclusion rules match host exactly and path by pattern; the shipped policy drops IDP country copies only', () => {
    const shipped = compileExcludes(loadSeedConfig().exclude);
    const ex = (u: string) => isExcluded(new URL(u), shipped);
    expect(ex('https://ielts.idp.com/vietnam/prepare/writing')).toBe(true);
    expect(ex('https://ielts.idp.com/prepare/writing')).toBe(false);
    expect(ex('https://ielts.idp.com/prepare')).toBe(false);
    expect(ex('https://ielts.idp.com/news-ielts-test-dates')).toBe(false);
    expect(ex('https://bxsearch.ielts.idp.com/wizard')).toBe(true);
    expect(ex('https://learnenglish.britishcouncil.org/user/login')).toBe(true);
    expect(ex('https://learnenglish.britishcouncil.org/free-resources/writing/x')).toBe(false);
    expect(ex('https://ielts.org/receiving-organisations/aalto-university')).toBe(true);
    expect(ex('https://ielts.org/cdn/ielts-guides/ielts-writing-band-descriptors.pdf')).toBe(false);
    expect(ex('https://learnenglish.britishcouncil.org/free-resources/grammar/x?page=3')).toBe(true);
    expect(ex('https://ielts.idp.com/prepare/life-skills?filter=a')).toBe(true);
    expect(() => compileExcludes([{ host: 'x', path: '(' }])).toThrow();
  });
  it('the shipped seed file is valid and only seeds allowlisted hosts', () => {
    const c = loadSeedConfig();
    expect(c.domains.length).toBeGreaterThan(0);
    for (const s of c.seeds) expect(c.domains.some((d) => new URL(s).host.replace(/^www\./, '').endsWith(d.host.replace(/^www\./, '')))).toBe(true);
  });
});

describe('crawler + review', () => {
  it('stays on the allowlist, respects robots/depth/size/type, stores copies, resumes, and approval registers a valid source record', async () => {
    const f = await fixture();
    try {
      const crawler = new SourceCrawler(f.store.db, f.store.paths, cfg());
      const first = await crawler.crawl({ maxPages: 2, now: f.clock.now });
      expect(first.processed).toBe(2);
      expect(first.queued_left).toBeGreaterThan(0);
      const rest = await new SourceCrawler(f.store.db, f.store.paths, cfg()).crawl({ maxPages: 100, now: f.clock.now });
      expect(rest.queued_left).toBe(0);
      const rows = f.store.db.prepare('SELECT url, fetch_state, error, depth, kind, content_type, stored_path FROM source_candidates ORDER BY url').all() as
        { url: string; fetch_state: string; error: string | null; depth: number; kind: string; content_type: string | null; stored_path: string | null }[];
      const by = (p: string) => rows.find((r) => r.url === `${base}${p}`);
      expect(rows.some((r) => r.url.includes('not-allowlisted') || r.url.includes('elsewhere.example'))).toBe(false);
      expect(by('/private/x')).toMatchObject({ fetch_state: 'SKIPPED', error: 'ROBOTS_DISALLOW' });
      expect(by('/private/ok')).toMatchObject({ fetch_state: 'FETCHED' });
      expect(hits).not.toContain('/private/x');
      expect(by('/big')).toMatchObject({ fetch_state: 'SKIPPED', error: 'TOO_LARGE' });
      expect(by('/away')).toMatchObject({ fetch_state: 'SKIPPED', error: 'REDIRECT_OFF_ALLOWLIST' });
      expect(by('/doc.pdf')).toMatchObject({ fetch_state: 'FETCHED', content_type: 'application/pdf' });
      // E-39: a broken PDF keeps its copy and says why; a real one gets text + layout next to it.
      expect(by('/doc.pdf')!.error).toMatch(/^PDF_TEXT_FAILED/);
      const bd = by('/writing-band-descriptors.pdf')!;
      expect(bd).toMatchObject({ fetch_state: 'FETCHED', kind: 'band_descriptors', error: null });
      expect(existsSync(join(sourcesDir(f.store.paths), bd.stored_path!.replace(/\.pdf$/, '.layout.json')))).toBe(true);
      expect(by('/a')).toMatchObject({ kind: 'sample_answers', depth: 1 });
      expect(by('/c')).toBeUndefined(); // depth 3 > max_depth 2: /b (depth 2) is fetched but its links are not queued
      expect(rows.filter((r) => r.url === `${base}/a`)).toHaveLength(1); // fragment duplicate collapsed
      expect(existsSync(join(sourcesDir(f.store.paths), by('/a')!.stored_path!))).toBe(true);

      const review = new SourceReview(f.store.db, f.store.paths, f.store.builder, f.clock.now);
      const list = review.list({ review: 'PENDING', fetch: 'FETCHED' });
      expect(list.total).toBeGreaterThan(3);
      const a = list.rows.find((r) => r.url === `${base}/a`)!;
      const ex = review.excerpt(a.candidate_id);
      expect(ex.text).toContain('Band 7 sample.');
      expect(ex.text).not.toMatch(/evil|<script/);
      const skippedId = (f.store.db.prepare('SELECT candidate_id FROM source_candidates WHERE url = ?').get(`${base}/big`) as { candidate_id: string }).candidate_id;
      const bdRow = list.rows.find((r) => r.url === `${base}/writing-band-descriptors.pdf`)!;
      expect(review.excerpt(bdRow.candidate_id).text).toContain('Band 7\tpresents a clear position');
      // Backfill: a PDF stored before E-39 (no text yet) is extracted by `sources -- extract`.
      f.store.db.prepare('UPDATE source_candidates SET text_chars = NULL WHERE candidate_id = ?').run(bdRow.candidate_id);
      expect(await extractPendingPdfs(f.store.db, f.store.paths, f.clock.now)).toEqual({ extracted: 1, failed: 1 });
      const res = review.review([a.candidate_id, skippedId], 'approve');
      expect(res).toMatchObject({ approved: 1, skipped: [{ candidate_id: skippedId, reason: 'NOT_FETCHED' }] });
      const src = f.store.db.prepare("SELECT record_json, registry_state, rights_status FROM source_records WHERE source_id LIKE 'web-%'").get() as { record_json: string; registry_state: string; rights_status: string };
      expect(src).toMatchObject({ registry_state: 'approved', rights_status: 'determined' });
      expect(validateKnowledge('source_record', JSON.parse(src.record_json)).ok).toBe(true);
      // Approving again is idempotent (same content → same record); rejecting keeps the row so it is never re-queued.
      expect(review.review([a.candidate_id], 'approve').approved).toBe(1);
      expect(review.review([by('/b') ? (f.store.db.prepare('SELECT candidate_id FROM source_candidates WHERE url = ?').get(`${base}/b`) as { candidate_id: string }).candidate_id : 'x'], 'reject').rejected).toBe(1);
      const again = await new SourceCrawler(f.store.db, f.store.paths, cfg()).crawl({ maxPages: 10, now: f.clock.now });
      expect(again.processed).toBe(0);
    } finally { f.cleanup(); }
  });
  it('a body that stalls past the timeout fails that page and the run continues', async () => {
    const f = await fixture();
    try {
      const c = { ...cfg({ timeout_ms: 300 }), seeds: [`${base}/stall`, `${base}/c`] };
      const r = await new SourceCrawler(f.store.db, f.store.paths, c).crawl({ maxPages: 10, now: f.clock.now });
      expect(r).toMatchObject({ processed: 2, failed: 1, fetched: 1, queued_left: 0 });
      expect(f.store.db.prepare('SELECT fetch_state, error FROM source_candidates WHERE url = ?').get(`${base}/stall`)).toEqual({ fetch_state: 'FAILED', error: 'TIMEOUT' });
    } finally { f.cleanup(); }
  });
  it('E-40: excluded links are never queued, already-queued ones become SKIPPED, excluded redirect hops are refused', async () => {
    const f = await fixture();
    try {
      const host = new URL(base).host;
      const c: SeedConfig = { ...cfg(), exclude: [{ host, path: '^/(b|private/ok|away2)$' }], seeds: [`${base}/a`, `${base}/redir`] };
      // Simulate a row queued before the rule existed.
      new SourceCrawler(f.store.db, f.store.paths, { ...c, exclude: [] }).seed(f.clock.now);
      f.store.db.prepare("INSERT INTO source_candidates (candidate_id, url, host, origin, depth, fetch_state, created_at, updated_at) VALUES ('old', ?, ?, 'official', 1, 'QUEUED', 't', 't')").run(`${base}/private/ok`, host);
      const r = await new SourceCrawler(f.store.db, f.store.paths, c).crawl({ maxPages: 10, now: f.clock.now });
      expect(r.excluded_from_queue).toBe(1);
      const row = (u: string) => f.store.db.prepare('SELECT fetch_state, error FROM source_candidates WHERE url = ?').get(`${base}${u}`);
      expect(row('/private/ok')).toEqual({ fetch_state: 'SKIPPED', error: 'EXCLUDED_BY_POLICY' });
      expect(row('/b')).toBeUndefined(); // link on /a, excluded at enqueue
      expect(row('/redir')).toMatchObject({ fetch_state: 'SKIPPED', error: 'EXCLUDED_BY_POLICY' });
      expect(hits).not.toContain('/away2');
    } finally { f.cleanup(); }
  });
});
