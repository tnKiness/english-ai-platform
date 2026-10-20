// Redaction for anything CLI-originated that is stored or logged (QUALITY_AND_DATA: IDs/hashes, no secrets).
// Best-effort pattern filter, not a guarantee: the primary control is never putting secrets into contexts or logs.
const SECRETS: [RegExp, string][] = [
  [/sk-ant-[A-Za-z0-9_-]{8,}/g, '[redacted-key]'],
  [/sk-(proj-)?[A-Za-z0-9_-]{16,}/g, '[redacted-key]'],
  [/AIza[0-9A-Za-z_-]{20,}/g, '[redacted-key]'],
  [/ya29\.[0-9A-Za-z._-]+/g, '[redacted-token]'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '[redacted-jwt]'],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 [redacted]'],
  [/\b(api[_-]?key|token|secret|password|cookie|authorization)(["']?\s*[:=]\s*["']?)[^\s"',;]{4,}/gi, '$1$2[redacted]'],
];
const PRIVACY: [RegExp, string][] = [
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]'],
  [/([A-Za-z]:\\Users\\)[^\\\s"']+/gi, '$1[user]'],
  [/(\/(?:home|Users)\/)[^/\s"']+/g, '$1[user]'],
];

export function redact(text: string, maxLength = 2000): string {
  let out = text;
  for (const [pattern, replacement] of [...SECRETS, ...PRIVACY]) out = out.replace(pattern, replacement);
  return out.length > maxLength ? `${out.slice(0, maxLength)}…[truncated ${out.length - maxLength} chars]` : out;
}

/** True when text looks like it carries a credential — used to refuse storing evidence that has one. */
export function containsSecretLike(text: string): boolean {
  return SECRETS.some(([pattern]) => new RegExp(pattern.source, pattern.flags.replace('g', '')).test(text));
}
