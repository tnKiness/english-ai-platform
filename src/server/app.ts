import Fastify from 'fastify';
import { ConsoleService } from '../application/qc/console.js';
import type { BuilderPipeline } from '../application/qc/pipeline.js';
import { gatewayFor } from '../infrastructure/ai/gateway/compose.js';
import { ConsoleQueries } from '../infrastructure/sqlite/console-queries.js';
import { builderPipeline, type Store } from '../infrastructure/sqlite/store.js';
import { parseCookies, SESSION_COOKIE, SessionManager } from './session.js';

const HOSTS = ['127.0.0.1:4317', 'localhost:4317'];
const ORIGINS = ['http://127.0.0.1:4317', 'http://localhost:4317', 'http://127.0.0.1:5173'];
const SAFE = ['GET', 'HEAD'];

export interface AppDeps { store?: Store; pipeline?: BuilderPipeline; sessions?: SessionManager; gatewayStatus?: () => Promise<unknown> }

const str = { type: 'string', minLength: 1, maxLength: 200 } as const;
const hash = { type: 'string', pattern: '^[a-f0-9]{64}$' } as const;
const body = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ body: { type: 'object', additionalProperties: false, properties, required } });
type P = { id: string; version: string };

/**
 * Local backend. Host/Origin checks on every request; every /api route except health and session needs the session
 * cookie, and every mutation also needs an allowed Origin and the CSRF header (QUALITY_AND_DATA case 8).
 */
export function createApp(deps: AppDeps = {}) {
  // Reject unknown fields instead of Fastify's default of silently stripping them.
  const app = Fastify({ logger: false, bodyLimit: 64 * 1024, ajv: { customOptions: { removeAdditional: false, coerceTypes: false } } });
  const sessions = deps.sessions ?? new SessionManager();
  app.setErrorHandler((error: { statusCode?: number; code?: string; message: string }, _request, reply) => {
    const status = error.statusCode && error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 400;
    // Domain/validation errors only; no stack traces or file paths are sent.
    return reply.code(status).send({ error: error.code ?? 'BAD_REQUEST', message: error.message.replace(/[A-Za-z]:\\[^\s'"]+/g, '[path]') });
  });
  app.addHook('onRequest', async (request, reply) => {
    if (!HOSTS.includes(request.headers.host ?? '')) return reply.code(403).send({ error: 'HOST_NOT_ALLOWED' });
    const origin = request.headers.origin;
    if (origin && !ORIGINS.includes(origin)) return reply.code(403).send({ error: 'ORIGIN_NOT_ALLOWED' });
    if (request.headers['sec-fetch-site'] === 'cross-site') return reply.code(403).send({ error: 'CROSS_SITE' });
    const path = request.url.split('?')[0];
    if (path === '/api/health' || (path === '/api/session' && request.method === 'GET')) return;
    const sid = parseCookies(request.headers.cookie)[SESSION_COOKIE];
    if (!sessions.valid(sid)) return reply.code(401).send({ error: 'SESSION_REQUIRED' });
    if (!SAFE.includes(request.method)) {
      if (!origin) return reply.code(403).send({ error: 'ORIGIN_REQUIRED' });
      const token = request.headers['x-csrf-token'];
      if (!sessions.csrfMatches(sid, typeof token === 'string' ? token : undefined)) return reply.code(403).send({ error: 'CSRF_INVALID' });
    }
  });

  app.get('/api/health', async () => ({ status: 'ok', stage: 'P2', real_ai_enabled: false }));
  app.get('/api/session', async (request, reply) => {
    const s = sessions.issue(parseCookies(request.headers.cookie)[SESSION_COOKIE]);
    if (!s.reused) reply.header('set-cookie', sessions.cookie(s.sid));
    reply.header('cache-control', 'no-store');
    return { csrf_token: s.csrf };
  });

  const store = deps.store;
  if (!store) return app;
  const pipeline = deps.pipeline ?? builderPipeline(store);
  const queries = new ConsoleQueries(store.db);
  const consoleService = new ConsoleService({ units: store.builder, json: store.json, items: queries, learning: store.learning, queue: store.queue,
    transaction: (fn) => store.builder.transaction(fn), contextPolicyVersion: 'context-policy-1' });
  const gatewayStatus = deps.gatewayStatus ?? (() => gatewayFor(store).status());

  // Tab 1 "Gói tri thức": metadata, QC status and grants only — no unit content in list responses.
  app.get('/api/console/packages', async () => store.builder.bundles().map((b) => {
    const qc = pipeline.qcStatus(b.package_id, b.version);
    const manifest = store.builder.releaseManifest(b.package_id, b.version) as { grants?: unknown } | undefined;
    return { ...b, qc: qc.stages, units: store.builder.packageUnits(b.package_id, b.version).map(({ kind, id, version, unit_type }) => ({ kind, id, version, unit_type })),
      grants: manifest?.grants ?? null, release_ready: qc.stages.every((s) => s.status === 'PASS') && b.state === 'draft' };
  }));
  app.get<{ Params: P }>('/api/console/packages/:id/:version/events', async (r) => {
    const b = store.builder.bundle(r.params.id, r.params.version);
    if (!b) throw Object.assign(new Error('Unknown package version'), { statusCode: 404 });
    return store.builder.events(b.request_id);
  });
  app.post<{ Params: P; Body: { unit: { kind: 'item' | 'rubric' | 'knowledge' | 'policy'; id: string; version: string }; request_id: string } }>('/api/console/packages/:id/:version/content', {
    schema: body({ unit: { type: 'object', additionalProperties: false, required: ['kind', 'id', 'version'], properties: { kind: { enum: ['item', 'rubric', 'knowledge', 'policy'] }, id: str, version: str } }, request_id: str }),
  }, async (r) => consoleService.openContent(r.params.id, r.params.version, r.body.unit, r.body.request_id));
  app.post<{ Params: P }>('/api/console/packages/:id/:version/qc/checks', { schema: body({}, []) }, async (r) => pipeline.runChecks(r.params.id, r.params.version));
  app.post<{ Params: P; Body: { stage: 'QC2' | 'QC3'; status: 'PASS' | 'FAIL'; bundle_hash: string; note: string } }>('/api/console/packages/:id/:version/qc/attest', {
    schema: body({ stage: { enum: ['QC2', 'QC3'] }, status: { enum: ['PASS', 'FAIL'] }, bundle_hash: hash, note: { type: 'string', minLength: 3, maxLength: 2000 } }),
  }, async (r) => pipeline.attest(r.params.id, r.params.version, r.body.stage, r.body.status, r.body.bundle_hash, r.body.note));
  app.post<{ Params: P }>('/api/console/packages/:id/:version/qc/qc4/start', { schema: body({}, []) }, async (r) => ({ job_ids: pipeline.startQc4(r.params.id, r.params.version) }));
  app.post<{ Params: P }>('/api/console/packages/:id/:version/qc/qc4/advance', { schema: body({}, []) }, async (r) => pipeline.advanceQc4(r.params.id, r.params.version));
  app.post<{ Params: P; Body: { bundle_hash: string } }>('/api/console/packages/:id/:version/release', { schema: body({ bundle_hash: hash }) },
    async (r, reply) => { const out = pipeline.release(r.params.id, r.params.version, r.body.bundle_hash); if (!out.allowed) reply.code(409); return out; });
  app.post<{ Params: P; Body: { to: 'suspended' | 'retired'; reason: string } }>('/api/console/packages/:id/:version/withdraw', {
    schema: body({ to: { enum: ['suspended', 'retired'] }, reason: { type: 'string', minLength: 3, maxLength: 500 } }),
  }, async (r) => pipeline.withdraw(r.params.id, r.params.version, r.body.to, r.body.reason));
  app.post<{ Params: P; Body: { input_text: string; request_id: string } }>('/api/console/packages/:id/:version/dry-run', {
    schema: body({ input_text: { type: 'string', minLength: 1, maxLength: 20_000 }, request_id: str }),
  }, async (r) => consoleService.dryRun(r.params.id, r.params.version, r.body.input_text, r.body.request_id));
  app.post<{ Body: { target_kind: 'item' | 'rubric' | 'package' | 'knowledge'; target_id: string; target_version: string | null; reason: string } }>('/api/console/revoke', {
    schema: body({ target_kind: { enum: ['item', 'rubric', 'package', 'knowledge'] }, target_id: str, target_version: { anyOf: [str, { type: 'null' }] }, reason: { type: 'string', minLength: 3, maxLength: 500 } }),
  }, async (r) => pipeline.revoke({ target_kind: r.body.target_kind, target_id: r.body.target_id, target_version: r.body.target_version }, r.body.reason));

  // Tab 2 "Cần xử lý": review items with impact, plus jobs parked for review.
  app.get('/api/console/issues', async () => ({ reviews: store.builder.reviews('open'), jobs: queries.stoppedJobs() }));
  app.post<{ Params: { reviewId: string }; Body: { resolution: 'ai_fix_and_requalify' | 'suspended_or_retired' | 'manual_review_done' | 'deferred' } }>('/api/console/issues/:reviewId/resolve', {
    schema: body({ resolution: { enum: ['ai_fix_and_requalify', 'suspended_or_retired', 'manual_review_done', 'deferred'] } }),
  }, async (r) => { store.builder.resolveReview(r.params.reviewId, r.body.resolution); return { ok: true }; });

  // Tab 3 "Lần chạy": technical log; gateway shows why real providers are blocked.
  app.get('/api/console/runs', async () => queries.runs());
  app.get('/api/console/gateway', async () => gatewayStatus());
  return app;
}
