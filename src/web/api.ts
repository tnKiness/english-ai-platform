// Browser API client: same-origin only, session cookie + CSRF header on every write.
let csrf: string | null = null;

async function session(): Promise<string> {
  if (csrf) return csrf;
  const r = await fetch('/api/session', { credentials: 'same-origin' });
  if (!r.ok) throw new Error(`session ${r.status}`);
  csrf = ((await r.json()) as { csrf_token: string }).csrf_token;
  return csrf;
}

async function parse<T>(r: Response): Promise<T> {
  const data: unknown = await r.json().catch(() => ({}));
  if (!r.ok && r.status !== 409) throw new Error((data as { message?: string; error?: string }).message ?? (data as { error?: string }).error ?? `HTTP ${r.status}`);
  return data as T;
}

export async function get<T>(url: string): Promise<T> {
  await session();
  return parse<T>(await fetch(url, { credentials: 'same-origin' }));
}

export async function post<T>(url: string, body: unknown = {}): Promise<T> {
  const token = await session();
  return parse<T>(await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-csrf-token': token }, body: JSON.stringify(body) }));
}

export const requestId = () => crypto.randomUUID();
