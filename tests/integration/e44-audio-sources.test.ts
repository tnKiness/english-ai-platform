// E-44 (D-06, Listening): recorded audio from allowlisted pages — magic-byte check, separate size limit, media hosts
// limited to a path prefix, backfill from stored pages, and the reviewer's player route. Local HTTP server only.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { audioFormat, htmlAudioLinks, normalizeUrl } from '../../src/infrastructure/sources/page.js';
import { SourceCrawler, loadSeedConfig, sourcesDir, type SeedConfig } from '../../src/infrastructure/sources/crawler.js';
import { SourceReview } from '../../src/infrastructure/sources/review.js';
import { createApp } from '../../src/server/app.js';
import { fixture } from './p1-helpers.js';

const MP3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(64, 1)]);
const WAV = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.alloc(32)]);
let server: Server; let base = '';
const hits: string[] = [];
const PAGES: Record<string, { type: string; body: string | Buffer }> = {
  '/robots.txt': { type: 'text/plain', body: 'User-agent: *\nDisallow: /private\n' },
  '/': { type: 'text/html', body: '<title>Listening practice</title><a href="/listen">L</a>' },
  '/listen': { type: 'text/html', body: '<title>Listening test 1</title><audio src="/l1.mp3"></audio><source src=\'/l2.wav\'><a href="/fake.mp3">x</a><a href="/private/p.mp3">p</a><a href="https://cdn.example/space/x.mp3">cdn</a><a href="/big.mp3">big</a>' },
  '/l1.mp3': { type: 'audio/mpeg', body: MP3 },
  '/l2.wav': { type: 'application/octet-stream', body: WAV },
  '/fake.mp3': { type: 'audio/mpeg', body: '<html>not audio</html>' },
  '/big.mp3': { type: 'audio/mpeg', body: Buffer.concat([MP3, Buffer.alloc(3000)]) },
};
beforeAll(async () => {
  server = createServer((req, res) => {
    hits.push(req.url ?? '');
    const p = PAGES[req.url ?? ''];
    if (!p) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': p.type }); res.end(p.body);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const cfg = (): SeedConfig => ({
  schema_version: '1', version: 'test', decision: 'test', user_agent: 'test-crawler',
  limits: { max_depth: 1, max_bytes: 100_000, min_interval_ms: 0, timeout_ms: 5000, max_audio_bytes: 1000 },
  domains: [{ host: new URL(base).host, origin: 'official' }], media_hosts: [{ host: 'cdn.example', path_prefix: '/space/' }], seeds: [`${base}/`],
});

describe('E-44 audio helpers', () => {
  it('recognises audio by magic bytes and finds audio links only', () => {
    expect([audioFormat(MP3)?.ext, audioFormat(WAV)?.ext, audioFormat(Buffer.from('OggS........'))?.ext, audioFormat(Buffer.from('<html>not audio</html>'))]).toEqual(['mp3', 'wav', 'ogg', null]);
    expect(htmlAudioLinks('<a href="/a.mp3#t">a</a><a href="/b">b</a><audio src="c.ogg"></audio>', 'https://ex.org/d/')).toEqual(['https://ex.org/a.mp3', 'https://ex.org/d/c.ogg']);
    expect(normalizeUrl('/a.mp3', 'https://ex.org/')).toBeNull(); // ordinary page links still skip audio
    const shipped = loadSeedConfig();
    expect(shipped.limits.max_audio_bytes).toBeGreaterThan(shipped.limits.max_bytes);
    expect(shipped.media_hosts?.every((h) => h.path_prefix.startsWith('/') && h.path_prefix.length > 1)).toBe(true);
  });
});

describe('E-44 crawler + review + player', () => {
  it('fetches real audio as Listening material, refuses fakes, oversize, robots, and CDNs outside the prefix', async () => {
    const f = await fixture();
    try {
      const r = await new SourceCrawler(f.store.db, f.store.paths, cfg()).crawl({ maxPages: 50, now: f.clock.now });
      expect(r.queued_left).toBe(0);
      const row = (p: string) => f.store.db.prepare('SELECT candidate_id, fetch_state, error, content_type, kind, skill, stored_path, depth FROM source_candidates WHERE url = ?').get(p.startsWith('http') ? p : `${base}${p}`) as
        { candidate_id: string; fetch_state: string; error: string | null; content_type: string | null; kind: string; skill: string | null; stored_path: string | null; depth: number } | undefined;
      // Audio is a leaf: queued from /listen although /listen is at max_depth.
      expect(row('/l1.mp3')).toMatchObject({ fetch_state: 'FETCHED', content_type: 'audio/mpeg', kind: 'practice_material', skill: 'listening', depth: 2 });
      expect(row('/l1.mp3')!.stored_path).toMatch(/^[a-f0-9]{64}\.mp3$/);
      expect(row('/l2.wav')).toMatchObject({ fetch_state: 'FETCHED', content_type: 'audio/wav' }); // octet-stream, recognised by bytes
      expect(row('/fake.mp3')).toMatchObject({ fetch_state: 'SKIPPED', error: 'AUDIO_UNRECOGNISED' });
      expect(row('/big.mp3')).toMatchObject({ fetch_state: 'SKIPPED', error: 'TOO_LARGE' });
      expect(row('/private/p.mp3')).toMatchObject({ fetch_state: 'SKIPPED', error: 'ROBOTS_DISALLOW' });
      expect(hits).not.toContain('/private/p.mp3');
      // Queued because it is under the media-host prefix; cdn.example does not exist, so its robots.txt is unavailable.
      expect(row('https://cdn.example/space/x.mp3')).toMatchObject({ fetch_state: 'SKIPPED', error: 'ROBOTS_UNAVAILABLE' });

      // Backfill: a page stored before E-44 links audio; a media-host link outside the prefix is never queued.
      writeFileSync(join(sourcesDir(f.store.paths), 'old.html'), '<a href="/old.mp3">o</a><a href="https://cdn.example/other/y.mp3">y</a>');
      f.store.db.prepare(`INSERT INTO source_candidates (candidate_id, url, host, origin, depth, fetch_state, content_type, stored_path, kind, review_state, created_at, updated_at)
        VALUES ('old', ?, ?, 'teaching', 1, 'FETCHED', 'text/html', 'old.html', 'other', 'PENDING', 't', 't')`).run(`${base}/old-page`, new URL(base).host);
      const crawler = new SourceCrawler(f.store.db, f.store.paths, cfg());
      expect(crawler.discoverAudio(f.clock.now)).toBe(1);
      expect(row('/old.mp3')).toMatchObject({ fetch_state: 'QUEUED', depth: 2 });
      expect(row('https://cdn.example/other/y.mp3')).toBeUndefined();

      // Review: filter by media, approve, and play through the Console route (session required, nosniff, exact bytes).
      const review = new SourceReview(f.store.db, f.store.paths, f.store.builder, f.clock.now);
      expect(review.list({ media: 'audio', fetch: 'FETCHED' }).rows.map((x) => x.url).sort()).toEqual([`${base}/l1.mp3`, `${base}/l2.wav`]);
      expect(review.review([row('/l1.mp3')!.candidate_id], 'approve').approved).toBe(1);
      mkdirSync(sourcesDir(f.store.paths), { recursive: true });
      const app = createApp({ store: f.store, gatewayStatus: async () => [] });
      try {
        const HOST = '127.0.0.1:4317';
        const s = await app.inject({ url: '/api/session', headers: { host: HOST } });
        const cookie = String(s.headers['set-cookie']).split(';')[0]!;
        expect((await app.inject({ url: `/api/console/sources/${row('/l1.mp3')!.candidate_id}/audio`, headers: { host: HOST } })).statusCode).toBe(401);
        const ok = await app.inject({ url: `/api/console/sources/${row('/l1.mp3')!.candidate_id}/audio`, headers: { host: HOST, cookie } });
        expect([ok.statusCode, ok.headers['content-type'], ok.headers['x-content-type-options']]).toEqual([200, 'audio/mpeg', 'nosniff']);
        expect(Buffer.compare(ok.rawPayload, MP3)).toBe(0);
        expect((await app.inject({ url: `/api/console/sources/${row('/listen')!.candidate_id}/audio`, headers: { host: HOST, cookie } })).statusCode).toBe(404);
      } finally { await app.close(); }
    } finally { f.cleanup(); }
  });
});
