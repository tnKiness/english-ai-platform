// E-53 (D-07, user decision): warn below 5 GB free, block new downloads/TTS below 2 GB, never delete automatically;
// the learner-run prune removes only re-downloadable copies nobody uses (rejected pages, unreferenced files).
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assertCanStoreNew, diskStatus, pruneSourceCopies, type DiskStatus } from '../../src/infrastructure/files/disk-guard.js';
import { loadSeedConfig, SourceCrawler, sourcesDir } from '../../src/infrastructure/sources/crawler.js';
import { fixture, type Fixture } from './p1-helpers.js';

const GiB = 1024 ** 3;
const fs = (freeGiB: number) => () => ({ bavail: Math.round(freeGiB * 1024), bsize: 1024 ** 2, blocks: 100 * 1024 });
let f: Fixture | undefined;
afterEach(() => { f?.cleanup(); f = undefined; });

describe('E-53 disk guard (D-07)', () => {
  it('levels: ok ≥ 5 GB, warn < 5 GB, block < 2 GB; only block refuses new stored media', () => {
    expect(diskStatus('.', undefined, fs(10)).level).toBe('ok');
    const warn = diskStatus('.', undefined, fs(4));
    expect(warn).toMatchObject({ level: 'warn', message: expect.stringContaining('prune-copies') });
    expect(() => assertCanStoreNew('.', 'tải', warn)).not.toThrow();
    const block = diskStatus('.', undefined, fs(1.5));
    expect(block.level).toBe('block');
    expect(() => assertCanStoreNew('.', 'tạo audio TTS mới', block)).toThrow(expect.objectContaining({ code: 'DISK_LOW', statusCode: 507 }));
    expect(block.free_bytes).toBeCloseTo(1.5 * GiB, -6);
  });

  it('the crawler stops before downloading when the disk is in the block zone and keeps its queue', async () => {
    f = await fixture();
    let fetched = 0;
    const blocked: DiskStatus = { ...diskStatus('.', undefined, fs(1)) };
    const r = await new SourceCrawler(f.store.db, f.store.paths, loadSeedConfig()).crawl({ maxPages: 5, disk: () => blocked, fetchImpl: async () => { fetched += 1; throw new Error('must not fetch'); }, sleep: async () => undefined });
    expect(r).toMatchObject({ stopped: 'DISK_LOW', processed: 0 });
    expect(fetched).toBe(0);
    expect((f.store.db.prepare("SELECT COUNT(*) AS n FROM source_candidates WHERE fetch_state = 'QUEUED'").get() as { n: number }).n).toBeGreaterThan(0);
  });

  it('prune removes only rejected copies and unreferenced files; dry run by default; approved/pending copies stay', async () => {
    f = await fixture();
    const dir = sourcesDir(f.store.paths); mkdirSync(dir, { recursive: true });
    for (const n of ['a.pdf', 'a.txt', 'a.layout.json', 'b.html', 'c.html', 'orphan.html', 'shared.html']) writeFileSync(join(dir, n), 'x'.repeat(10));
    const ins = f.store.db.prepare(`INSERT INTO source_candidates (candidate_id, url, host, origin, depth, fetch_state, http_status, content_type, title, byte_size, sha256, stored_path, text_chars, kind, skill, review_state, created_at, updated_at, fetched_at)
      VALUES (?, ?, 'h', 'official', 0, 'FETCHED', 200, 'text/html', 't', 10, ?, ?, 10, 'other', NULL, ?, 't', 't', '2026-11-20T00:00:00.000Z')`);
    ins.run('c1', 'https://h/a', 'a'.repeat(64), 'a.pdf', 'APPROVED');
    ins.run('c2', 'https://h/b', 'b'.repeat(64), 'b.html', 'PENDING');
    ins.run('c3', 'https://h/c', 'c'.repeat(64), 'c.html', 'REJECTED');
    ins.run('c4', 'https://h/s1', 'd'.repeat(64), 'shared.html', 'REJECTED');
    ins.run('c5', 'https://h/s2', 'e'.repeat(64), 'shared.html', 'APPROVED'); // same content kept by an approved page
    const dry = pruneSourceCopies(f.store.db, f.store.paths);
    expect(dry).toEqual({ files: 2, bytes: 20, rejected: 1, orphans: 1, deleted: false });
    expect(existsSync(join(dir, 'c.html'))).toBe(true);
    expect(pruneSourceCopies(f.store.db, f.store.paths, true)).toMatchObject({ files: 2, deleted: true });
    expect(['a.pdf', 'a.txt', 'a.layout.json', 'b.html', 'shared.html'].every((n) => existsSync(join(dir, n)))).toBe(true);
    expect(['c.html', 'orphan.html'].some((n) => existsSync(join(dir, n)))).toBe(false);
    expect((f.store.db.prepare("SELECT COUNT(*) AS n FROM source_candidates WHERE candidate_id = 'c3'").get() as { n: number }).n).toBe(1); // row kept: never re-queued
  });
});
