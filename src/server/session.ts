// Local single-user session + CSRF (QUALITY_AND_DATA "Bảo vệ local"): an HttpOnly SameSite=Strict cookie plus a
// per-session token that only same-origin script can read from GET /api/session. In memory: a restart starts over.
import { randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'sid';
const MAX_SESSIONS = 20;

export class SessionManager {
  private sessions = new Map<string, { csrf: string; expires: number }>();
  constructor(private ttlMs = 12 * 60 * 60 * 1000, private now: () => number = Date.now) {}

  issue(existing?: string): { sid: string; csrf: string; reused: boolean } {
    const current = existing ? this.live(existing) : undefined;
    if (existing && current) { current.expires = this.now() + this.ttlMs; return { sid: existing, csrf: current.csrf, reused: true }; }
    if (this.sessions.size >= MAX_SESSIONS) this.sessions.delete(this.sessions.keys().next().value!);
    const sid = randomBytes(32).toString('base64url');
    const csrf = randomBytes(32).toString('base64url');
    this.sessions.set(sid, { csrf, expires: this.now() + this.ttlMs });
    return { sid, csrf, reused: false };
  }

  private live(sid: string) {
    const s = this.sessions.get(sid);
    if (s && s.expires <= this.now()) { this.sessions.delete(sid); return undefined; }
    return s;
  }

  valid(sid: string | undefined): boolean { return !!sid && !!this.live(sid); }

  csrfMatches(sid: string | undefined, token: string | undefined): boolean {
    const s = sid ? this.live(sid) : undefined;
    if (!s || !token) return false;
    const a = Buffer.from(s.csrf);
    const b = Buffer.from(token);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  cookie(sid: string): string {
    return `${SESSION_COOKIE}=${sid}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${Math.floor(this.ttlMs / 1000)}`;
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}
