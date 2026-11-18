import Fastify from 'fastify';
import { ComplaintService } from '../application/learning/complaints.js';
import { DailyTracker, type ActivityInput } from '../application/learning/daily-tracker.js';
import { ReadingWorkflow } from '../application/learning/reading-workflow.js';
import type { ReadingAnswer } from '../domain/learning/reading.js';
import { AudioWorkflow, AUDIO_MAX_BYTES } from '../application/learning/audio-workflow.js';
import { LearningWorkflowService } from '../application/learning/writing-workflow.js';
import { ReplanPlanner } from '../application/learning/replan-planner.js';
import { ConsoleService } from '../application/qc/console.js';
import type { BuilderPipeline } from '../application/qc/pipeline.js';
import type { ContextRole } from '../application/context/scoped-reader.js';
import type { Mode, Opportunity, Purpose } from '../domain/evidence/types.js';
import { gatewayFor } from '../infrastructure/ai/gateway/compose.js';
import { autoBackupStatus } from '../infrastructure/backup/auto.js';
import { exportLearnerData, storageUsage } from '../infrastructure/export/learner-export.js';
import { ConsoleQueries } from '../infrastructure/sqlite/console-queries.js';
import { builderPipeline, type Store } from '../infrastructure/sqlite/store.js';
import { parseCookies, SESSION_COOKIE, SessionManager } from './session.js';
import { registerStaticWeb } from './static-web.js';

/** Default local port; another one only via STUDY_ENGLISH_PORT (the allowlists below follow it). */
export const DEFAULT_PORT = 4317;
const SAFE = ['GET', 'HEAD'];

export interface AppDeps { store?: Store; pipeline?: BuilderPipeline; sessions?: SessionManager; gatewayStatus?: () => Promise<unknown>;
  /** P5-4: serve the built web UI from this folder (dist/web) on the same origin. */
  webRoot?: string;
  /** Port the server listens on; Host/Origin allowlists are derived from it (default 4317). */
  port?: number }

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
  const port = deps.port ?? DEFAULT_PORT;
  const HOSTS = [`127.0.0.1:${port}`, `localhost:${port}`];
  // The Vite dev server (5173) proxies to the default port only.
  const ORIGINS = [`http://127.0.0.1:${port}`, `http://localhost:${port}`, 'http://127.0.0.1:5173'];
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
    const path = request.url.split('?')[0] ?? '/';
    // The built web UI (static, read-only) needs no session; every /api route below still does.
    if (!path.startsWith('/api/') && path !== '/api' && SAFE.includes(request.method)) return;
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
  if (deps.webRoot) registerStaticWeb(app, deps.webRoot);
  if (!store) return app;
  const pipeline = deps.pipeline ?? builderPipeline(store);
  const complaints = new ComplaintService(store);
  app.post<{ Body: { request_key: string; observation_id: string; reason: string } }>('/api/learning/complaints', {
    schema: body({ request_key: str, observation_id: str, reason: { type: 'string', minLength: 1, maxLength: 2000 } }),
  }, async (r) => complaints.request(r.body));
  const queries = new ConsoleQueries(store.db);
  const consoleService = new ConsoleService({ units: store.builder, json: store.json, items: queries, learning: store.learning, queue: store.queue,
    transaction: (fn) => store.builder.transaction(fn), contextPolicyVersion: 'context-policy-1' });
  const learningWorkflow = new LearningWorkflowService(store);
  const reading = new ReadingWorkflow(store);
  const audio = new AudioWorkflow(store);
  app.addHook('preHandler', async (request, reply) => {
    const match = /^\/api\/learning\/attempts\/([^/?]+)/.exec(request.url);
    if (match && store.db.prepare('SELECT attempt_id FROM reading_sessions WHERE attempt_id=? UNION SELECT attempt_id FROM audio_sessions WHERE attempt_id=?')
      .get(decodeURIComponent(match[1]!), decodeURIComponent(match[1]!))) {
      return reply.code(409).send({ error: 'USE_SKILL_WORKFLOW' });
    }
  });
  app.addHook('onSend', async (request, reply) => {
    if (request.url.startsWith('/api/learning/')) reply.header('cache-control', 'no-store');
  });
  app.get('/api/learning/reading', async () => reading.catalog());
  app.get('/api/learning/audio', async () => audio.list());
  app.post<{ Body: { request_key: string } }>('/api/learning/audio', { schema: body({ request_key: str }) }, async (r) => audio.start(r.body.request_key));
  app.get<{ Params: { id: string } }>('/api/learning/audio/:id', async (r) => audio.view(r.params.id));
  app.post<{ Params: { id: string }; Body: { request_key: string; data: string; media_type: string } }>('/api/learning/audio/:id/recordings', {
    bodyLimit: Math.ceil(AUDIO_MAX_BYTES * 4 / 3) + 1024,
    schema: body({ request_key: str, data: { type: 'string', maxLength: Math.ceil(AUDIO_MAX_BYTES * 4 / 3) }, media_type: { enum: ['audio/wav', 'audio/webm', 'audio/ogg'] } }),
  }, async (r) => audio.upload(r.params.id, r.body.request_key, r.body.data, r.body.media_type));
  app.get<{ Params: { id: string; recording: string } }>('/api/learning/audio/:id/recordings/:recording', async (r, reply) => {
    const out = audio.playback(r.params.id, r.params.recording);
    return reply.header('x-content-type-options', 'nosniff').type(out.type).send(out.data);
  });
  app.post<{ Params: { id: string }; Body: { content: string } }>('/api/learning/audio/:id/autosave', {
    schema: body({ content: { type: 'string', maxLength: 20_000 } }),
  }, async (r) => audio.saveDraft(r.params.id, r.body.content));
  app.post<{ Params: { id: string }; Body: { recording_id: string; request_key: string; content: string } }>('/api/learning/audio/:id/transcripts', {
    schema: body({ recording_id: str, request_key: str, content: { type: 'string', minLength: 1, maxLength: 20_000 } }),
  }, async (r) => audio.transcript(r.params.id, r.body.recording_id, r.body.request_key, r.body.content));
  app.post<{ Params: { id: string }; Body: { transcript_id: string } }>('/api/learning/audio/:id/review-text', {
    schema: body({ transcript_id: str }),
  }, async (r) => audio.review(r.params.id, r.body.transcript_id));
  app.post<{ Body: { item_id: string; version: string; mode: Mode; request_key: string } }>('/api/learning/reading', {
    schema: body({ item_id: str, version: str, mode: { enum: ['guided', 'self_practice', 'exam'] }, request_key: str }),
  }, async (r) => reading.start(r.body.item_id, r.body.version, r.body.mode, r.body.request_key));
  app.get<{ Params: { id: string } }>('/api/learning/reading/:id', async (r) => reading.view(r.params.id));
  app.post<{ Params: { id: string }; Body: { content: string } }>('/api/learning/reading/:id/autosave', {
    schema: body({ content: { type: 'string', maxLength: 50_000 } }),
  }, async (r) => reading.save(r.params.id, r.body.content));
  app.post<{ Params: { id: string }; Body: { request_key: string; answers: ReadingAnswer[] } }>('/api/learning/reading/:id/submit', {
    schema: body({ request_key: str, answers: { type: 'array', maxItems: 100, items: {
      type: 'object', additionalProperties: false, required: ['question_id', 'answer', 'rationale'],
      properties: { question_id: str, answer: { type: 'string', maxLength: 500 }, rationale: { type: 'string', maxLength: 2000 } },
    } } }),
  }, async (r) => reading.submit(r.params.id, r.body.request_key, r.body.answers));
  app.post<{ Params: { id: string }; Body: { level: number } }>('/api/learning/reading/:id/hints', {
    schema: body({ level: { type: 'integer', minimum: 1, maximum: 3 } }),
  }, async (r) => reading.unlock(r.params.id, r.body.level));
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
  // P5-2 (E-27): BM25 search filtered by role, release state and revocations in the same query; refs only, no content.
  app.get<{ Querystring: { q?: string; role?: string; limit?: string } }>('/api/console/search', async (r) => {
    const role = r.query.role ?? 'verifier';
    if (!['blind_solver', 'verifier', 'assessor', 'repair_tutor', 'task_generator'].includes(role)) throw Object.assign(new Error('Unknown role'), { statusCode: 400 });
    return { hits: store.search.search({ query: r.query.q ?? '', role: role as ContextRole, scope: 'builder', limit: r.query.limit ? Number(r.query.limit) : 20 }) };
  });
  app.post('/api/console/search/rebuild', { schema: body({}, []) }, async () => store.search.rebuild());
  app.get('/api/console/issues', async () => ({ reviews: store.builder.reviews('open'), jobs: queries.stoppedJobs() }));
  app.post<{ Params: { reviewId: string }; Body: { resolution: 'ai_fix_and_requalify' | 'suspended_or_retired' | 'manual_review_done' | 'deferred' } }>('/api/console/issues/:reviewId/resolve', {
    schema: body({ resolution: { enum: ['ai_fix_and_requalify', 'suspended_or_retired', 'manual_review_done', 'deferred'] } }),
  }, async (r) => { store.builder.resolveReview(r.params.reviewId, r.body.resolution); return { ok: true }; });

  // Tab 3 "Lần chạy": technical log; gateway shows why real providers are blocked.
  app.get('/api/console/runs', async () => queries.runs());
  app.get('/api/console/gateway', async () => gatewayStatus());

  // ---- P3 Khung học, Vòng Writing & Gợi mở theo nấc (01, 02, 03, 06) -------------------------
  const bandNum = { type: 'number', minimum: 0, maximum: 9 } as const;
  app.get('/api/learning/goals', async () => ({ goal: learningWorkflow.getGoal() }));
  app.post<{ Body: { target_band_overall: number; target_listening: number; target_reading: number; target_writing: number; target_speaking: number; exam_type: 'academic' | 'general_training'; exam_date: string | null; daily_minutes: number; weekly_minutes: number } }>('/api/learning/goals', {
    schema: body({
      target_band_overall: bandNum, target_listening: bandNum, target_reading: bandNum, target_writing: bandNum, target_speaking: bandNum,
      exam_type: { enum: ['academic', 'general_training'] }, exam_date: { anyOf: [str, { type: 'null' }] },
      daily_minutes: { type: 'integer', minimum: 5, maximum: 480 }, weekly_minutes: { type: 'integer', minimum: 15, maximum: 3360 },
    }),
  }, async (r) => ({ goal: learningWorkflow.saveGoal(r.body) }));

  app.get<{ Querystring: { available_minutes?: string } }>('/api/learning/today', async (r) => {
    const mins = r.query.available_minutes !== undefined ? Number(r.query.available_minutes) : undefined;
    if (mins !== undefined && (!Number.isFinite(mins) || mins < 1 || mins > 480)) {
      throw Object.assign(new Error('Invalid available_minutes'), { statusCode: 400 });
    }
    return learningWorkflow.todayView(mins);
  });

  app.post<{ Body: { request_key: string; item_id?: string; item_version?: string; rubric_id?: string; rubric_version?: string; mode: Mode; purpose: Purpose; task_id?: string; competency_id?: string } }>('/api/learning/attempts', {
    schema: body({
      request_key: str, item_id: str, item_version: str, rubric_id: str, rubric_version: str,
      mode: { enum: ['guided', 'self_practice', 'exam'] }, purpose: { enum: ['lesson', 'practice', '7A', '7B', '9'] },
      task_id: str, competency_id: str,
    }, ['request_key', 'mode', 'purpose']),
  }, async (r) => learningWorkflow.startAttempt(r.body));

  app.get<{ Params: { id: string } }>('/api/learning/attempts/:id', async (r) => learningWorkflow.getWorkspaceView(r.params.id));

  app.post<{ Params: { id: string }; Body: { content: string } }>('/api/learning/attempts/:id/autosave', {
    schema: body({ content: { type: 'string', maxLength: 50_000 } }),
  }, async (r) => learningWorkflow.autosave(r.params.id, r.body.content));

  app.post<{ Params: { id: string }; Body: { request_key: string; current_draft_text: string } }>('/api/learning/attempts/:id/input-support', {
    schema: body({ request_key: str, current_draft_text: { type: 'string', maxLength: 50_000 } }),
  }, async (r) => learningWorkflow.requestInputSupport(r.params.id, r.body.request_key, r.body.current_draft_text));

  app.post<{ Params: { id: string }; Body: { request_key: string; content: string; is_repair?: boolean; opportunity_override?: Opportunity } }>('/api/learning/attempts/:id/submit', {
    schema: body({
      request_key: str,
      content: { type: 'string', minLength: 1, maxLength: 50_000 },
      is_repair: { type: 'boolean' },
      opportunity_override: { enum: ['observed', 'absent', 'unknown'] },
    }, ['request_key', 'content']),
  }, async (r) => learningWorkflow.submitWriting({ attempt_id: r.params.id, ...r.body }));

  app.post<{ Params: { id: string }; Body: { level: 1 | 2 | 3; request_key: string; current_draft_text?: string } }>('/api/learning/attempts/:id/hints/unlock', {
    schema: body({ level: { type: 'integer', enum: [1, 2, 3] }, request_key: str, current_draft_text: { type: 'string', maxLength: 50_000 } }, ['level', 'request_key']),
  }, async (r) => learningWorkflow.unlockHint(r.params.id, r.body.level, r.body.request_key, r.body.current_draft_text ?? ''));

  app.post<{ Params: { id: string }; Body: { action: 'try_more' | 'direct_explanation' | 'clarify'; request_key: string; current_draft_text?: string } }>('/api/learning/attempts/:id/step5/action', {
    schema: body({ action: { enum: ['try_more', 'direct_explanation', 'clarify'] }, request_key: str, current_draft_text: { type: 'string', maxLength: 50_000 } }, ['action', 'request_key']),
  }, async (r) => learningWorkflow.recordStep5Interaction(r.params.id, r.body.action, r.body.request_key, r.body.current_draft_text ?? ''));

  app.post<{ Params: { id: string }; Body: { concept_check_answer: string } }>('/api/learning/attempts/:id/step6/complete', {
    schema: body({ concept_check_answer: { type: 'string', minLength: 1, maxLength: 2000 } }),
  }, async (r) => learningWorkflow.completeStep6(r.params.id, r.body.concept_check_answer));

  app.post<{ Params: { id: string }; Body: { request_key: string } }>('/api/learning/attempts/:id/start-7a', {
    schema: body({ request_key: str }),
  }, async (r) => learningWorkflow.startStep7A(r.params.id, r.body.request_key));

  // ---- P5-1 Daily tracking & in-app reminders (06A §9, 02 §5.C.2; E-25) ----------------------------
  const tracker = new DailyTracker(store);
  const dayStr = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } as const;
  app.post<{ Body: { events: ActivityInput[] } }>('/api/learning/tracking/activity', {
    schema: body({ events: { type: 'array', minItems: 1, maxItems: 200, items: { type: 'object', additionalProperties: false,
      required: ['client_event_id', 'activity', 'surface', 'span_seconds', 'occurred_at'],
      properties: { client_event_id: str, activity: { enum: ['writing', 'reading', 'listening', 'speaking', 'thinking', 'review'] },
        surface: { enum: ['workspace', 'reading', 'audio', 'today', 'progress'] }, attempt_id: { anyOf: [str, { type: 'null' }] },
        span_seconds: { type: 'integer', minimum: 1, maximum: 120 }, occurred_at: { type: 'string', minLength: 10, maxLength: 40 }, offline: { type: 'boolean' } } } } }),
  }, async (r) => tracker.recordActivity(r.body.events));
  app.post<{ Body: { request_key: string; study_day: string; kind: 'planned_rest' | 'offline' | 'budget'; active: boolean; minutes?: number | null; note?: string } }>('/api/learning/tracking/day', {
    schema: body({ request_key: str, study_day: dayStr, kind: { enum: ['planned_rest', 'offline', 'budget'] }, active: { type: 'boolean' },
      minutes: { anyOf: [{ type: 'integer', minimum: 0, maximum: 480 }, { type: 'null' }] }, note: { type: 'string', maxLength: 500 } }, ['request_key', 'study_day', 'kind', 'active']),
  }, async (r) => tracker.declare(r.body));
  app.get<{ Querystring: { days?: string } }>('/api/learning/tracking', async (r) => tracker.overview(r.query.days !== undefined ? Number(r.query.days) : 7));
  app.get('/api/learning/notifications', async () => tracker.notifications());
  app.post<{ Params: { id: string } }>('/api/learning/notifications/:id/dismiss', { schema: body({}, []) }, async (r) => tracker.dismiss(r.params.id));

  // ---- P5-3 Export & storage report (D-07 independent part; E-28): read-only, nothing is deleted -------------
  app.post('/api/learning/export', { schema: body({}, []) }, async () => {
    const { dir, manifest } = exportLearnerData(store.db, store.paths, { now: store.now });
    return { dir, created_at: manifest.created_at, tables: Object.fromEntries(Object.entries(manifest.tables).map(([k, v]) => [k, v.rows])), media: manifest.media.length, excluded: manifest.excluded };
  });
  app.get('/api/learning/storage', async () => ({ ...storageUsage(store.db, store.paths), backups: autoBackupStatus(store) }));

  app.get('/api/learning/progress', async () => learningWorkflow.progressView());

  // ---- D-02 v1 F: catch-up schedule proposals (E-33). Nothing changes until the learner accepts. ----------------
  const replan = new ReplanPlanner(store, learningWorkflow.policy, () => learningWorkflow.openTaskPriorities());
  app.get('/api/learning/replan', async () => replan.current());
  app.post<{ Params: { id: string } }>('/api/learning/replan/:id/accept', { schema: body({}, []) }, async (r) => replan.accept(r.params.id));
  app.post<{ Params: { id: string } }>('/api/learning/replan/:id/reject', { schema: body({}, []) }, async (r) => replan.reject(r.params.id));
  app.get('/api/learning/settings', async () => ({
    goal: learningWorkflow.getGoal(),
    gateway: await gatewayStatus(),
    privacy_and_rights_note: 'Mọi dữ liệu học tập được lưu cục bộ trong SQLite + kho JSON bất biến. AI thật chỉ chạy qua Gateway khi provider bên dưới Sẵn sàng (đủ bằng chứng D-01 và đã đồng ý loại dữ liệu); không bao giờ gửi âm thanh.',
  }));
  return app;
}
