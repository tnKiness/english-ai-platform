// P5-4 (E-29): serve the built web UI (dist/web) from the local backend, so the app runs with one command and no Vite.
// Read-only, GET/HEAD only, paths resolved inside the web root (no `..`, no absolute, no symlink escape), and every
// unknown non-file path falls back to index.html (single-page app). /api is never handled here.
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';
import type { FastifyInstance } from 'fastify';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.map': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
};

/** The file a request path maps to, or null when it is outside the root or not a regular file. */
export function resolveWebFile(webRoot: string, urlPath: string): string | null {
  let decoded: string;
  try { decoded = decodeURIComponent(urlPath.split('?')[0] ?? '/'); } catch { return null; }
  if (decoded.includes('\0')) return null;
  const root = realpathSync(webRoot);
  const target = resolve(root, `.${decoded.startsWith('/') ? decoded : `/${decoded}`}`);
  const rel = relative(root, target);
  if (rel.startsWith('..') || rel.includes(`..${sep}`) || resolve(root, rel) !== target) return null;
  if (!existsSync(target)) return null;
  const real = realpathSync(target);
  const realRel = relative(root, real);
  if (realRel.startsWith('..') || /^[A-Za-z]:/.test(realRel)) return null;
  return statSync(real).isFile() ? real : null;
}

export function registerStaticWeb(app: FastifyInstance, webRoot: string): void {
  const index = join(webRoot, 'index.html');
  if (!existsSync(index)) throw new Error(`Built web UI not found at ${webRoot}; run npm run build first`);
  app.setNotFoundHandler((request, reply) => {
    const path = request.url.split('?')[0] ?? '/';
    if (path.startsWith('/api/') || path === '/api' || (request.method !== 'GET' && request.method !== 'HEAD')) {
      return reply.code(404).send({ error: 'NOT_FOUND' });
    }
    const file = resolveWebFile(webRoot, path === '/' ? '/index.html' : path);
    // A path with a file extension that does not exist is a real 404; anything else is a client-side route.
    if (!file && extname(path)) return reply.code(404).type('text/plain; charset=utf-8').send('Not found');
    const target = file ?? index;
    const isIndex = target === resolve(index) || target === realpathSync(index);
    reply.header('x-content-type-options', 'nosniff');
    reply.header('x-frame-options', 'DENY');
    reply.header('referrer-policy', 'no-referrer');
    // Hashed asset names never change content; the page itself must always be revalidated.
    reply.header('cache-control', isIndex ? 'no-store' : 'public, max-age=31536000, immutable');
    return reply.type(TYPES[extname(target).toLowerCase()] ?? 'application/octet-stream').send(readFileSync(target));
  });
}
