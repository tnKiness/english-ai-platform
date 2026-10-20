// Pure logic for the dev-tooling relay. No process, file or network access here.
// The relay hands one coding task across subscription CLIs; it is NOT the app's AI gateway.

export type ProviderId = 'claude' | 'codex' | 'agy';
export const PROVIDERS: readonly ProviderId[] = ['claude', 'codex', 'agy'];

export type FailureClass = 'QUOTA' | 'RATE_LIMIT' | 'AUTH' | 'TIMEOUT' | 'ERROR';
export type Outcome =
  | { kind: 'DONE' }
  | { kind: 'BLOCKED'; reason: string }
  | { kind: 'SWITCH'; failure: Exclude<FailureClass, 'ERROR'>; resetAt: Date | null }
  | { kind: 'STOP'; reason: string };

export interface ProviderState {
  status: 'READY' | 'COOLDOWN' | 'NEEDS_LOGIN';
  until: string | null; // ISO UTC; only for COOLDOWN
  reason: string | null;
}
export type RelayState = Record<ProviderId, ProviderState>;

export const DONE_MARKER = 'RELAY_STATUS: DONE';
export const BLOCKED_MARKER = 'RELAY_STATUS: BLOCKED';

const QUOTA = [
  /hit your (usage )?limit/i, /usage limit/i, /limit (has been )?reached/i, /quota (exceeded|exhausted)/i,
  /resource[_ ]exhausted/i, /insufficient[_ ]quota/i, /exhausted your (capacity|quota)/i,
  /out of (credits|usage)/i, /upgrade your plan/i, /usage_limit_reached/i,
];
const RATE = [/\b429\b/, /rate[_ ]?limit/i, /too many requests/i, /\boverloaded\b/i, /\b529\b/, /model is (currently )?(busy|unavailable)/i];
const AUTH = [
  /not (logged|signed) in/i, /please (log|sign) ?in/i, /\blogin required/i, /\b401\b/, /unauthori[sz]ed/i,
  /authentication (failed|error|required)/i, /failed to authenticate/i, /invalid (api key|credentials|token)/i,
  /(token|session|credentials?) (has )?expired/i,
];

const tail = (text: string, chars: number) => text.slice(-chars);

export function classifyFailure(output: string): Exclude<FailureClass, 'TIMEOUT'> {
  // Only the tail decides: earlier output may quote error strings from the codebase itself.
  const t = tail(output, 4000);
  if (QUOTA.some((r) => r.test(t))) return 'QUOTA';
  if (AUTH.some((r) => r.test(t))) return 'AUTH';
  if (RATE.some((r) => r.test(t))) return 'RATE_LIMIT';
  return 'ERROR';
}

export function decideOutcome(run: { exitCode: number | null; timedOut: boolean; output: string }, now: Date): Outcome {
  const end = tail(run.output, 4000);
  if (run.timedOut) return { kind: 'SWITCH', failure: 'TIMEOUT', resetAt: null };
  const blocked = end.match(/RELAY_STATUS: BLOCKED\s*(.*)/);
  if (run.exitCode === 0 && end.includes(DONE_MARKER)) return { kind: 'DONE' };
  if (run.exitCode === 0 && blocked) return { kind: 'BLOCKED', reason: blocked[1]?.trim() || 'không rõ lý do' };
  const failure = classifyFailure(run.output);
  if (failure !== 'ERROR') return { kind: 'SWITCH', failure, resetAt: parseResetTime(end, now) };
  // Unknown failure or a turn that ended without a marker: stop instead of burning every quota on it.
  return { kind: 'STOP', reason: run.exitCode === 0 ? 'Kết thúc lượt nhưng thiếu RELAY_STATUS' : `Thoát mã ${run.exitCode}` };
}

const UNIT_MS: Record<string, number> = { d: 86_400_000, h: 3_600_000, m: 60_000, s: 1000 };
function unitKey(unit: string): string {
  const u = unit.toLowerCase();
  if (u.startsWith('d')) return 'd';
  if (u.startsWith('h')) return 'h';
  if (u.startsWith('s')) return 's';
  return 'm';
}

/** Best-effort reset time from CLI text. Returns null when nothing trustworthy is found. */
export function parseResetTime(text: string, now: Date): Date | null {
  const epoch = text.match(/\|(\d{10})\b/); // Claude "usage limit reached|<unix seconds>"
  if (epoch?.[1]) return new Date(Number(epoch[1]) * 1000);

  const iso = text.match(/\b(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))/);
  if (iso?.[1] && !Number.isNaN(Date.parse(iso[1]))) return new Date(iso[1]);

  const delay = text.match(/retry[_ ]?delay"?\s*[:=]\s*"?(\d+(?:\.\d+)?)s/i);
  if (delay?.[1]) return new Date(now.getTime() + Math.ceil(Number(delay[1])) * 1000);

  const rel = text.match(/\b(?:in|after)\s+((?:\d+\s*(?:days?|d|hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\b(?:\s*,?\s*(?:and\s+)?)?)+)/i);
  if (rel?.[1]) {
    let ms = 0;
    for (const part of rel[1].matchAll(/(\d+)\s*([a-z]+)/gi)) ms += Number(part[1]) * (UNIT_MS[unitKey(part[2] ?? 'm')] ?? 60_000);
    if (ms > 0) return new Date(now.getTime() + ms);
  }

  const clock = text.match(/\b(?:at|lúc|resets?(?: at)?)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (clock?.[1]) {
    let hour = Number(clock[1]); const minute = Number(clock[2] ?? 0); const ampm = clock[3]?.toLowerCase();
    if (!clock[2] && !ampm) return null; // a bare number is too ambiguous
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    if (hour > 23 || minute > 59) return null;
    const at = new Date(now); at.setHours(hour, minute, 0, 0); // local machine time, as the CLI prints it
    if (at <= now) at.setDate(at.getDate() + 1);
    return at;
  }
  return null;
}

export const DEFAULT_COOLDOWN_MS: Record<'QUOTA' | 'RATE_LIMIT', number> = { QUOTA: 60 * 60_000, RATE_LIMIT: 5 * 60_000 };

export function emptyState(): RelayState {
  const ready = (): ProviderState => ({ status: 'READY', until: null, reason: null });
  return { claude: ready(), codex: ready(), agy: ready() };
}

/** Applies a SWITCH outcome to the provider's state. TIMEOUT does not penalise the provider. */
export function applyFailure(state: RelayState, id: ProviderId, outcome: Extract<Outcome, { kind: 'SWITCH' }>, now: Date): RelayState {
  const next = { ...state };
  if (outcome.failure === 'AUTH') next[id] = { status: 'NEEDS_LOGIN', until: null, reason: 'AUTH' };
  else if (outcome.failure === 'QUOTA' || outcome.failure === 'RATE_LIMIT') {
    const until = outcome.resetAt && outcome.resetAt > now ? outcome.resetAt : new Date(now.getTime() + DEFAULT_COOLDOWN_MS[outcome.failure]);
    next[id] = { status: 'COOLDOWN', until: until.toISOString(), reason: outcome.failure };
  }
  return next;
}

export function isAvailable(s: ProviderState, now: Date): boolean {
  if (s.status === 'READY') return true;
  return s.status === 'COOLDOWN' && s.until !== null && new Date(s.until) <= now;
}

/** Next provider in order after `after`, wrapping around; skips unavailable and `exclude`. */
export function pickProvider(state: RelayState, order: readonly ProviderId[], now: Date, exclude: ReadonlySet<ProviderId> = new Set()): ProviderId | null {
  return order.find((id) => !exclude.has(id) && isAvailable(state[id], now)) ?? null;
}

export function earliestReset(state: RelayState, order: readonly ProviderId[]): Date | null {
  const times = order.map((id) => state[id]).filter((s) => s.status === 'COOLDOWN' && s.until).map((s) => new Date(s.until as string));
  return times.length ? new Date(Math.min(...times.map((t) => t.getTime()))) : null;
}

// Variables that would route a CLI to paid API billing or a non-subscription endpoint.
const BILLING_ENV = /^(ANTHROPIC_(API_KEY|AUTH_TOKEN|BASE_URL)|CLAUDE_CODE_USE_(BEDROCK|VERTEX)|OPENAI_(API_KEY|BASE_URL)|CODEX_API_KEY|AZURE_OPENAI_\w+|GEMINI_API_KEY|GOOGLE_API_KEY|GOOGLE_GENAI_USE_VERTEXAI|GOOGLE_APPLICATION_CREDENTIALS|GOOGLE_CLOUD_PROJECT)$/i;
export function subscriptionEnv(env: NodeJS.ProcessEnv): { env: NodeJS.ProcessEnv; removed: string[] } {
  const out: NodeJS.ProcessEnv = {}; const removed: string[] = [];
  for (const [k, v] of Object.entries(env)) { if (BILLING_ENV.test(k)) removed.push(k); else out[k] = v; }
  return { env: out, removed };
}

export interface Handoff { from: ProviderId; reason: string; at: string; gitStatus: string; diffStat: string }

export function buildPrompt(task: string, handoffs: readonly Handoff[]): string {
  const lines = [
    'Bạn là AI lập trình trong repository hiện tại, được gọi qua relay tự động (không có người trả lời câu hỏi giữa chừng).',
    'Trước khi sửa: đọc AGENTS.md và làm đúng mọi quy định trong đó, đọc PROGRESS.md và tài liệu liên quan. Kiểm tra file thực tế.',
    'Không commit, không push, không dùng cờ bỏ qua sandbox/quyền, không đọc hoặc in credential.',
    '',
    '## Nhiệm vụ',
    task.trim(),
  ];
  if (handoffs.length) {
    const last = handoffs[handoffs.length - 1] as Handoff;
    lines.push('', '## Tiếp nối từ lượt trước',
      `Nhiệm vụ này đã được ${handoffs.length} lượt AI khác bắt đầu; lượt gần nhất là ${last.from}, dừng lúc ${last.at} vì ${last.reason}.`,
      'Phần việc có thể đã làm dở. Đọc thay đổi chưa commit và PROGRESS.md, tiếp tục phần còn thiếu; không làm lại phần đã xong, không xóa thay đổi đang có trừ khi chúng sai rõ ràng.',
      // trimEnd only: the leading column of `git status --short` carries meaning (" M" vs "M ").
      '', 'git status --short:', '```', last.gitStatus.trimEnd() || '(sạch)', '```',
      'git diff --stat:', '```', last.diffStat.trimEnd() || '(không có)', '```');
  }
  lines.push('', '## Kết thúc',
    'Khi xong, ghi kết quả thật và lệnh đã chạy vào PROGRESS.md theo mẫu bàn giao trong file đó.',
    `Dòng cuối cùng của câu trả lời phải là đúng một trong hai: "${DONE_MARKER}" hoặc "${BLOCKED_MARKER} <lý do cần người dùng quyết định>".`);
  return lines.join('\n');
}
