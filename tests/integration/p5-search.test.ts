// P5-2 knowledge search (06A §7.A.2, 05 §C.5, 06 §5.B.1; E-27): permission, release state and revocation are applied
// in the same query; results are refs only; the index is a rebuildable projection of the JSON files.
import { afterEach, describe, expect, it } from 'vitest';
import { foldVietnamese, toMatchQuery, unitText } from '../../src/infrastructure/sqlite/knowledge-search.js';
import { createApp } from '../../src/server/app.js';
import { ITEM_ID, KEY_ID, RUBRIC_ID, SECRET_EXPLANATION } from '../fixtures/knowledge/synthetic.js';
import { builderFixture, PKG, qc, stage, type BuilderFixture } from './p2-helpers.js';

let fx: BuilderFixture | undefined;
afterEach(() => { fx?.cleanup(); fx = undefined; });

async function frozen(release: boolean) {
  fx = await builderFixture();
  const f = fx.pipeline.freeze(stage(fx), 'v1');
  if (release) {
    await qc(fx, 'v1');
    expect(fx.pipeline.release(PKG, 'v1', f.bundle_hash).allowed).toBe(true);
  }
  return fx;
}
const ids = (hits: { object_id: string }[]) => hits.map((h) => h.object_id).sort();

describe('permission before retrieval', () => {
  it('a blind solver never finds the answer key; a verifier does', async () => {
    const f = await frozen(true);
    expect(ids(f.store.search.search({ query: 'membership', role: 'verifier' }))).toEqual([KEY_ID]);
    expect(f.store.search.search({ query: 'membership', role: 'blind_solver' })).toEqual([]);
    expect(ids(f.store.search.search({ query: 'lanterns', role: 'blind_solver' }))).toEqual([ITEM_ID]);
    expect(ids(f.store.search.search({ query: 'lanterns', role: 'verifier' }))).toEqual([ITEM_ID, KEY_ID]);
    expect(ids(f.store.search.search({ query: 'contradiction absence', role: 'assessor' }))).toEqual([RUBRIC_ID]);
    // The governance block (roles such as "blind_solver", sources, copyright) is metadata and is not indexed.
    expect(f.store.search.search({ query: 'solver', role: 'verifier' })).toEqual([]);
    expect(f.store.search.search({ query: 'own_synthetic', role: 'verifier' })).toEqual([]);
    const hit = f.store.search.search({ query: 'lanterns', role: 'verifier' })[0]!;
    expect(Object.keys(hit).sort()).toEqual(['kind', 'object_id', 'package_id', 'package_version', 'release_state', 'score', 'title', 'unit_type', 'version']);
  });

  it('only active releases for AI roles; builder scope also sees drafts', async () => {
    const f = await frozen(false);
    expect(f.store.search.search({ query: 'lanterns', role: 'verifier' })).toEqual([]);
    expect(ids(f.store.search.search({ query: 'lanterns', role: 'verifier', scope: 'builder' }))).toEqual([ITEM_ID, KEY_ID]);
  });

  it('a revocation applies on the next query, for a unit and for a whole package', async () => {
    const f = await frozen(true);
    f.store.knowledge.revoke({ target_kind: 'knowledge', target_id: KEY_ID, target_version: 'v1' }, 'synthetic fault');
    expect(f.store.search.search({ query: 'membership', role: 'verifier' })).toEqual([]);
    expect(ids(f.store.search.search({ query: 'lanterns', role: 'verifier' }))).toEqual([ITEM_ID]);
    f.store.knowledge.revoke({ target_kind: 'package', target_id: PKG, target_version: null }, 'synthetic fault');
    expect(f.store.search.search({ query: 'lanterns', role: 'verifier', scope: 'builder' })).toEqual([]);
  });
});

describe('projection', () => {
  it('sync is idempotent and rebuild restores the same results', async () => {
    const f = await frozen(true);
    const before = f.store.search.search({ query: 'lanterns', role: 'verifier' });
    expect(f.store.search.sync()).toEqual({ indexed: 0 });
    expect(f.store.search.rebuild().indexed).toBeGreaterThan(0);
    expect(f.store.search.search({ query: 'lanterns', role: 'verifier' })).toEqual(before);
    f.store.db.prepare('DELETE FROM knowledge_search_units').run();
    f.store.db.prepare('DELETE FROM knowledge_search').run();
    expect(ids(f.store.search.search({ query: 'lanterns', role: 'verifier' }))).toEqual([ITEM_ID, KEY_ID]);
  });

  it('a Vietnamese unit is found by a query typed without diacritics', async () => {
    const f = await frozen(false);
    const text = unitText({ body: { note: 'Câu điều kiện loại hai dùng cho tình huống giả định' } });
    f.store.db.prepare('INSERT INTO knowledge_search (rowid, title, body) VALUES (999999, ?, ?)').run('vi', text.body);
    const q = (query: string) => f.store.db.prepare('SELECT rowid FROM knowledge_search WHERE knowledge_search MATCH ?').pluck().all(toMatchQuery(query));
    expect(q('dieu kien gia dinh')).toEqual([999999]);
    expect(q('Điều Kiện')).toEqual([999999]);
  });

  it('caller text never reaches FTS syntax; Vietnamese works without diacritics', () => {
    expect(toMatchQuery('body: lanterns OR NEAR(x y) "*')).toBe('"body" "lanterns" "OR" "NEAR"');
    expect(toMatchQuery('a !')).toBeNull();
    // Only đ/Đ are folded here; the unicode61 tokenizer removes the other diacritics.
    expect(foldVietnamese('Điều kiện đơn giản')).toBe('Diều kiện dơn giản');
    expect(unitText({ governance: { identity: { unit_id: 'u1', unit_type: 'rubric' } }, body: { note: 'Câu điều kiện' } })).toEqual({ title: 'rubric u1', body: 'Câu diều kiện' });
  });
});

it('console search is session-protected and returns no unit content', async () => {
  const f = await frozen(true);
  const app = createApp({ store: f.store, pipeline: f.pipeline, gatewayStatus: async () => [] });
  try {
    const host = { host: '127.0.0.1:4317' };
    expect((await app.inject({ url: '/api/console/search?q=lanterns', headers: host })).statusCode).toBe(401);
    const s = await app.inject({ url: '/api/session', headers: host });
    const cookie = String(s.headers['set-cookie']).split(';')[0]!;
    const res = await app.inject({ url: '/api/console/search?q=lanterns%20paper&role=verifier', headers: { ...host, cookie } });
    expect(res.statusCode).toBe(200);
    expect(ids(res.json().hits)).toEqual([ITEM_ID, KEY_ID]);
    expect(res.body).not.toContain(SECRET_EXPLANATION);
    expect(res.body).not.toContain('paper lanterns');
    expect((await app.inject({ url: '/api/console/search?q=x&role=learner', headers: { ...host, cookie } })).statusCode).toBe(400);
  } finally { await app.close(); }
});
