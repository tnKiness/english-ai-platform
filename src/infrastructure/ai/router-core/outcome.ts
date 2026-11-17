// ĐỒNG BỘ TỪ ai-router/src/core — KHÔNG sửa tay. Sửa ở ai-router rồi chạy `npm run router:sync` (E-24).
// Ported from study-english scripts/relay/core.ts: decides, from a finished run, whether to stop or switch provider.
// Pure logic, no I/O. Only CLI diagnostics and the final answer are inspected, never tool output, so error strings
// quoted from the codebase being worked on cannot trigger a switch.
import type { FailureClass, Outcome } from './types.js';

const QUOTA = [
  /hit your (usage )?limit/i, /usage limit/i, /limit (has been )?reached/i, /quota (exceeded|exhausted)/i,
  /resource[_ ]exhausted/i, /insufficient[_ ]quota/i, /exhausted your (capacity|quota)/i,
  /out of (credits|usage)/i, /upgrade your plan/i, /usage_limit_reached/i, /credit balance is too low/i,
];
const RATE = [/\b429\b/, /rate[_ ]?limit/i, /too many requests/i, /\boverloaded\b/i, /\b529\b/, /model is (currently )?(busy|unavailable)/i];
const AUTH = [
  /not (logged|signed) in/i, /please (log|sign) ?in/i, /\blogin required/i, /\b401\b/, /unauthori[sz]ed/i,
  /authentication (failed|error|required)/i, /failed to authenticate/i, /invalid (api key|x-api-key|credentials|token)/i,
  /(token|session|credentials?) (has )?expired/i,
];

// The provider's side failing (not the request): another provider can take the turn.
const UNAVAILABLE = [
  /\bHTTP 5\d\d\b/i, /\b(500|502|503|504) (internal server error|bad gateway|service unavailable|gateway time-?out)/i,
  /internal server error/i, /bad gateway/i, /service (is )?(temporarily )?unavailable/i, /gateway time-?out/i,
  /\b(ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EPIPE)\b/, /socket hang up/i, /fetch failed/i,
  /connection (error|reset|refused|closed)/i, /network (error|timeout|is unreachable)/i,
];

const tail = (text: string, chars: number) => text.slice(-chars);

export function classifyFailure(output: string): Exclude<FailureClass, 'TIMEOUT'> {
  const t = tail(output, 4000);
  if (QUOTA.some((r) => r.test(t))) return 'QUOTA';
  if (AUTH.some((r) => r.test(t))) return 'AUTH';
  if (RATE.some((r) => r.test(t))) return 'RATE_LIMIT';
  if (UNAVAILABLE.some((r) => r.test(t))) return 'UNAVAILABLE';
  return 'ERROR';
}

/** The agent itself may say it is out of quota mid-turn; it is told to end with this line so the router hands over. */
export const QUOTA_MARKER = 'ROUTER_STATUS: QUOTA';

export interface RunFacts {
  exitCode: number | null; timedOut: boolean; aborted?: boolean;
  /** The agent's final answer only. */
  finalText: string;
  /** Errors the CLI or API reported as such (error events, HTTP errors), never tool output. */
  diagnostics: string;
  /** stderr and non-JSON output: warnings, progress, retries the CLI recovered from. Only consulted when the run failed. */
  noise?: string;
  /** Structured quota signal when the provider reports one (Claude rate_limit_event, HTTP 429 headers). */
  quota?: { rejected: boolean; warning?: boolean; resetAt: Date | null } | null;
}

export function decideOutcome(run: RunFacts, now: Date): Outcome {
  const end = tail(run.finalText, 4000);
  const diag = tail(run.diagnostics, 4000);
  const noise = tail(run.noise ?? '', 4000);
  const reset = () => run.quota?.resetAt ?? parseResetTime(`${noise}\n${diag}\n${end}`, now);
  if (run.aborted) return { kind: 'STOP', reason: 'Người dùng dừng' };
  if (run.timedOut) return { kind: 'SWITCH', failure: 'TIMEOUT', resetAt: null };
  if (run.quota?.rejected) return { kind: 'SWITCH', failure: 'QUOTA', resetAt: reset() };
  if (end.includes(QUOTA_MARKER)) return { kind: 'SWITCH', failure: 'QUOTA', resetAt: reset() };
  const cliFailure = classifyFailure(diag);
  if (cliFailure !== 'ERROR') return { kind: 'SWITCH', failure: cliFailure, resetAt: reset() };
  if (run.exitCode === 0 && end.trim()) return { kind: 'DONE' };
  // Only now is stderr noise read: a run that exited 0 with an answer is done even if a warning mentioned "429" or "rate limit".
  const failure = classifyFailure(`${noise}\n${diag}\n${end}`);
  if (failure !== 'ERROR') return { kind: 'SWITCH', failure, resetAt: reset() };
  // Unknown failure: stop instead of burning every quota on the same error.
  return { kind: 'STOP', reason: run.exitCode === 0 ? 'Kết thúc lượt nhưng không có câu trả lời' : `Thoát mã ${run.exitCode}: ${(diag || noise).slice(-300)}` };
}

const UNIT_MS: Record<string, number> = { d: 86_400_000, h: 3_600_000, m: 60_000, s: 1000 };
function unitKey(unit: string): string {
  const u = unit.toLowerCase();
  if (u.startsWith('d')) return 'd';
  if (u.startsWith('h')) return 'h';
  if (u.startsWith('s')) return 's';
  return 'm';
}

/** Best-effort reset time from provider text. Returns null when nothing trustworthy is found. */
export function parseResetTime(text: string, now: Date): Date | null {
  const epoch = text.match(/\|(\d{10})\b/); // Claude "usage limit reached|<unix seconds>"
  if (epoch?.[1]) return new Date(Number(epoch[1]) * 1000);

  const iso = text.match(/\b(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))/);
  if (iso?.[1] && !Number.isNaN(Date.parse(iso[1]))) return new Date(iso[1]);

  const delay = text.match(/retry[_ -]?(?:delay|after)"?\s*[:=]\s*"?(\d+(?:\.\d+)?)s?/i);
  if (delay?.[1]) return new Date(now.getTime() + Math.ceil(Number(delay[1])) * 1000);

  const rel = text.match(/\b(?:in|after)\s+((?:\d+\s*(?:days?|d|hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\b(?:\s*,?\s*(?:and\s+)?)?)+)/i);
  if (rel?.[1]) {
    let ms = 0;
    for (const part of rel[1].matchAll(/(\d+)\s*([a-z]+)/gi)) ms += Number(part[1]) * (UNIT_MS[unitKey(part[2] ?? 'm')] ?? 60_000);
    if (ms > 0) return new Date(now.getTime() + ms);
  }

  // Codex, once the reset is a day away: "try again at Oct 21st, 2026 3:26 AM". Local machine time.
  const dated = text.match(/\b(?:at|after)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4}),?\s+(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  if (dated) {
    const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf((dated[1] ?? '').slice(0, 3).toLowerCase());
    let hour = Number(dated[4]); const ampm = dated[6]?.toLowerCase();
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    const at = new Date(Number(dated[3]), month, Number(dated[2]), hour, Number(dated[5]), 0, 0);
    if (month >= 0 && hour <= 23 && !Number.isNaN(at.getTime())) return at;
  }

  const clock = text.match(/\b(?:at|lúc|resets?(?: at)?)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (clock?.[1]) {
    let hour = Number(clock[1]); const minute = Number(clock[2] ?? 0); const ampm = clock[3]?.toLowerCase();
    if (!clock[2] && !ampm) return null; // a bare number is too ambiguous
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    if (hour > 23 || minute > 59) return null;
    const at = new Date(now); at.setHours(hour, minute, 0, 0);
    if (at <= now) at.setDate(at.getDate() + 1);
    return at;
  }
  return null;
}
