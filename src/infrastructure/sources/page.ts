// Helpers for fetched source pages (E-37). Fetched content is untrusted data: it is parsed for metadata and links only,
// never executed and never treated as instructions.

export interface DomainRule { host: string; origin: 'official' | 'linguistic_research' | 'teaching' | 'community' }

const bare = (h: string) => h.toLowerCase().replace(/^www\./, '');

/**
 * E-40: a URL the policy chooses not to crawl although its domain is allowlisted (per-country copies, search, sign-in,
 * directories). `host` matches exactly (www. ignored); `path` is a regular expression tested on pathname + search.
 */
export interface ExcludeRule { host: string; path: string; note?: string }
export type CompiledExclude = { host: string; re: RegExp }[];
export function compileExcludes(rules: readonly ExcludeRule[] = []): CompiledExclude {
  return rules.map((r) => ({ host: bare(r.host), re: new RegExp(r.path) }));
}
export function isExcluded(url: URL, rules: CompiledExclude): boolean {
  const h = bare(url.host);
  return rules.some((r) => r.host === h && r.re.test(`${url.pathname}${url.search}`));
}

/** The allowlist rule for a URL: same host (www. ignored) or a subdomain of it; http(s) only. */
export function ruleFor(url: URL, domains: readonly DomainRule[]): DomainRule | null {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const h = bare(url.host);
  return domains.find((d) => h === bare(d.host) || h.endsWith(`.${bare(d.host)}`)) ?? null;
}

const SKIP_EXT = /\.(png|jpe?g|gif|svg|webp|ico|css|js|mjs|json|xml|zip|rar|7z|mp3|mp4|m4a|wav|ogg|webm|woff2?|ttf|eot|docx?|xlsx?|pptx?)$/i;
const TRACKING = /^(utm_|fbclid$|gclid$|mc_|_ga$|ref$)/i;

/** Normalised URL key: no fragment, no tracking parameters, lower-case host, no trailing slash except root. */
export function normalizeUrl(raw: string, base?: string, opts: { audio?: boolean } = {}): string | null {
  let u: URL;
  try { u = new URL(raw, base); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  u.hash = '';
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
  u.host = u.host.toLowerCase();
  if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.replace(/\/+$/, '');
  if (opts.audio ? !AUDIO_EXT.test(u.pathname) : SKIP_EXT.test(u.pathname)) return null;
  return u.toString();
}

/** E-44: audio files of Listening practice (recorded audio, D-06). Only these media types are ever fetched. */
export const AUDIO_EXT = /\.(mp3|m4a|wav|ogg)$/i;
export const isAudioUrl = (url: string) => { try { return AUDIO_EXT.test(new URL(url).pathname); } catch { return false; } };

/** Audio links of a page: <a href>, <audio src>, <source src>. Normalised like page links. */
export function htmlAudioLinks(html: string, base: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/<(?:a|audio|source)\b[^>]*?\b(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    const n = normalizeUrl(decode(m[1] ?? m[2] ?? m[3] ?? ''), base, { audio: true });
    if (n) out.add(n);
  }
  return [...out];
}

/** Container recognised from magic bytes, never from the server's Content-Type or the file name. */
export function audioFormat(b: Uint8Array): { ext: 'mp3' | 'wav' | 'ogg' | 'm4a'; mime: string } | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b.length < 12) return null;
  if (ascii(0, 3) === 'ID3' || (b[0] === 0xff && ((b[1] ?? 0) & 0xe0) === 0xe0)) return { ext: 'mp3', mime: 'audio/mpeg' };
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return { ext: 'wav', mime: 'audio/wav' };
  if (ascii(0, 4) === 'OggS') return { ext: 'ogg', mime: 'audio/ogg' };
  if (ascii(4, 8) === 'ftyp') return { ext: 'm4a', mime: 'audio/mp4' };
  return null;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
const decode = (s: string) => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
  if (e[0] === '#') { const n = e[1]?.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
  return ENTITIES[e.toLowerCase()] ?? m;
});

export function htmlTitle(html: string): string | null {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const t = m ? decode(m[1]!).replace(/\s+/g, ' ').trim() : '';
  return t ? t.slice(0, 300) : null;
}

/** Readable text of an HTML page (scripts, styles and tags removed). */
export function htmlText(html: string): string {
  return decode(html.replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr)>/gi, '\n').replace(/<[^>]+>/g, ' '))
    .replace(/[ \t\f\v\r]+/g, ' ').replace(/\n\s*/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function htmlLinks(html: string, base: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    const n = normalizeUrl(decode(m[1] ?? m[2] ?? m[3] ?? ''), base);
    if (n) out.add(n);
  }
  return [...out];
}

export type Kind = 'band_descriptors' | 'sample_answers' | 'test_format' | 'practice_material' | 'grammar' | 'vocabulary' | 'phonetics' | 'other';
export type Skill = 'writing' | 'speaking' | 'reading' | 'listening';

/** Rough label from URL and title, only to help the reviewer filter; the reviewer decides. */
export function classify(url: string, title: string | null): { kind: Kind; skill: Skill | null } {
  const t = `${url} ${title ?? ''}`.toLowerCase();
  const kind: Kind = /band[-_ ]?descriptor|assessment criteria|marking criteria/.test(t) ? 'band_descriptors'
    : /sample[-_ ]?(answer|script|response)|model answer|examiner comment|band \d(\.5)? (answer|script|sample)/.test(t) ? 'sample_answers'
      : /test[-_ ]?format|question[-_ ]?types?|test-types|about the test|scoring|how .* scored|results/.test(t) ? 'test_format'
        : /practice|sample[-_ ]?(test|question)|prepar|lesson|tips|exercise/.test(t) ? 'practice_material'
          : /grammar/.test(t) ? 'grammar'
            : /vocabulary|word list|evp|english profile|cefr/.test(t) ? 'vocabulary'
              : /phonetic|ipa|pronunciation/.test(t) ? 'phonetics' : 'other';
  const skill: Skill | null = /writing|essay|task[-_ ]?[12]/.test(t) ? 'writing' : /speaking|pronunciation/.test(t) ? 'speaking'
    : /reading/.test(t) ? 'reading' : /listening/.test(t) ? 'listening' : null;
  return { kind, skill };
}

/** robots.txt rules for user-agent * (longest match wins; Allow beats Disallow on a tie). */
export function parseRobots(text: string): { allow: string[]; disallow: string[] } {
  const allow: string[] = []; const disallow: string[] = [];
  let applies = false; let seenRule = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = m[1]!.toLowerCase(); const value = m[2]!.trim();
    if (key === 'user-agent') { if (seenRule) { applies = false; seenRule = false; } applies = applies || value === '*'; continue; }
    if (key !== 'allow' && key !== 'disallow') continue;
    seenRule = true;
    if (!applies || value === '') continue;
    (key === 'allow' ? allow : disallow).push(value);
  }
  return { allow, disallow };
}

export function robotsAllows(rules: { allow: string[]; disallow: string[] }, pathAndQuery: string): boolean {
  const match = (p: string) => {
    const re = new RegExp(`^${p.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*').replace(/\\\$$/, '$')}`);
    return re.test(pathAndQuery) ? p.length : -1;
  };
  const a = Math.max(-1, ...rules.allow.map(match));
  const d = Math.max(-1, ...rules.disallow.map(match));
  return d < 0 || a >= d;
}
