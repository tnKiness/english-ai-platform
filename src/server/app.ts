import Fastify from 'fastify';

// P0 exposes no learner data or mutation endpoint. Session/CSRF is required before P1 writes.
export function createApp() {
  const app = Fastify({ logger: false, bodyLimit: 64 * 1024 });
  app.addHook('onRequest', async (request, reply) => {
    if (!['127.0.0.1:4317', 'localhost:4317'].includes(request.headers.host ?? '')) {
      return reply.code(403).send({ error: 'HOST_NOT_ALLOWED' });
    }
    const origin = request.headers.origin;
    if (origin && !['http://127.0.0.1:4317', 'http://localhost:4317', 'http://127.0.0.1:5173'].includes(origin)) {
      return reply.code(403).send({ error: 'ORIGIN_NOT_ALLOWED' });
    }
  });
  app.get('/api/health', async () => ({ status: 'ok', stage: 'P0', real_ai_enabled: false }));
  return app;
}
