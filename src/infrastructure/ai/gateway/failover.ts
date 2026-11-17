// Cầu nối giữa lõi định tuyến của ai-router (../router-core, quyết định E-24) và gateway thuê bao của ứng dụng.
// Lõi quyết định "lượt này hỏng vì hạn mức / giới hạn tốc độ / đăng nhập / phía hãng lỗi, và bao giờ mở lại";
// việc được chạy hãng nào vẫn do subscriptionGuard + permit quyết định (06A §4, §8). Không có đường trả phí ở đây.
import type { ProviderError } from '../../../application/ai/provider-adapter.js';
import { decideOutcome, parseResetTime } from '../router-core/outcome.js';
import { DEFAULT_COOLDOWN_MS, healthAfterFailure, READY } from '../router-core/routing.js';
import type { SwitchFailure } from '../router-core/types.js';

const TO_PROVIDER_ERROR: Record<SwitchFailure, ProviderError> = { QUOTA: 'QUOTA_EXHAUSTED', RATE_LIMIT: 'RATE_LIMIT', AUTH: 'AUTH_EXPIRED', UNAVAILABLE: 'NETWORK', TIMEOUT: 'TIMEOUT' };

/** Giờ mở lại đọc từ văn bản của hãng là best-effort: giá trị đã qua hoặc xa hơn mức này bị bỏ, dùng khoảng chờ mặc định. */
export const MAX_RESET_AHEAD_MS = 8 * 86_400_000;
/** Khoảng chờ khi hãng báo giới hạn tốc độ mà không nêu thời điểm thử lại (cùng giá trị lõi dùng để khóa profile). */
export const DEFAULT_RATE_LIMIT_WAIT_MS = DEFAULT_COOLDOWN_MS.RATE_LIMIT;

const saneReset = (at: Date | null, now: Date): string | null =>
  at && !Number.isNaN(at.getTime()) && at > now && at.getTime() - now.getTime() <= MAX_RESET_AHEAD_MS ? at.toISOString() : null;

/** Giờ mở lại trong một đoạn văn bản lỗi của hãng ("try again at 6:49 PM", "retry-after: 30"…), hoặc null. */
export const resetTimeIn = (text: string, now: Date): string | null => saneReset(parseResetTime(text, now), now);

const one = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 400);

/**
 * Tách luồng đầu ra của CLI thành thứ lõi cần: lỗi do chính CLI báo (diagnostics), dòng không phải JSON và stderr
 * (noise), và tín hiệu hạn mức có cấu trúc. Không bao giờ đọc câu trả lời của model hay nội dung người học, nên văn
 * bản trong bài làm không thể kích hoạt chuyển hãng. Dạng sự kiện theo các parser của ai-router (claude/codex/agy).
 */
export function streamFacts(stdout: string, stderr = ''): { diagnostics: string; noise: string; quota: { rejected: boolean; warning: boolean; resetAt: Date | null } | null } {
  const diagnostics: string[] = []; const noise: string[] = [];
  let quota: { rejected: boolean; warning: boolean; resetAt: Date | null } | null = null;
  for (const line of stdout.split(/\r?\n/)) {
    const text = line.trim();
    if (!text) continue;
    let e: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(text);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) { noise.push(text); continue; }
      e = parsed as Record<string, unknown>;
    } catch { noise.push(text); continue; }
    const obj = (v: unknown) => (typeof v === 'object' && v !== null ? v as Record<string, unknown> : {});
    if (e.type === 'rate_limit_event') { // Claude Code
      const info = obj(e.rate_limit_info);
      const resetAt = typeof info.resetsAt === 'number' ? new Date(info.resetsAt * 1000) : null;
      const before = quota as { warning: boolean } | null;
      quota = { rejected: info.status === 'rejected', warning: Boolean(before?.warning) || info.status === 'allowed_warning', resetAt };
      if (info.status === 'rejected') diagnostics.push(`usage limit reached (${one(info.rateLimitType) || 'limit'})`);
    } else if (e.type === 'result' && e.is_error === true) diagnostics.push(one(`${one(e.subtype) || 'error'} ${one(e.api_error_status)} ${one(e.result)}`)); // Claude Code
    else if (e.type === 'error' || e.type === 'turn.failed') diagnostics.push(one(e.message ?? obj(e.error).message ?? text)); // Codex
    else if (e.type === 'item.completed' && obj(e.item).type === 'error') diagnostics.push(one(obj(e.item).message)); // Codex
    else if (e.event === 'result' && obj(e.result).status !== 'SUCCESS') diagnostics.push(one(`${one(obj(e.result).status)} ${one(obj(e.result).error ?? obj(e.result).response)}`)); // agy
    else if (e.event === 'error') diagnostics.push(one(obj(e.error).message ?? e.message ?? text)); // agy
  }
  for (const line of stderr.split(/\r?\n/)) if (line.trim()) noise.push(line.trim());
  return { diagnostics: diagnostics.join('\n'), noise: noise.join('\n'), quota };
}

/**
 * Lượt chạy không cho ra kết quả hợp lệ: lõi của ai-router có nhận ra đây là lỗi nên chuyển hãng/chờ không?
 * null = không nhận ra → nơi gọi giữ nguyên hành vi đóng (BILLING_UNVERIFIED, 06A §8 chốt 6).
 * Thoát mã 0 thì chỉ xét lỗi CLI tự báo: cảnh báo trên stderr của một lượt thành công không được tính là lỗi.
 */
export function classifyRunFailure(run: { stdout: string; stderr?: string; exitCode: number | null }, now: Date): { error: ProviderError; reset_at: string | null } | null {
  const facts = streamFacts(run.stdout, run.stderr);
  const outcome = decideOutcome({ exitCode: run.exitCode, timedOut: false, finalText: '', diagnostics: facts.diagnostics, noise: run.exitCode === 0 ? '' : facts.noise, quota: facts.quota }, now);
  if (outcome.kind !== 'SWITCH') return null;
  const error = TO_PROVIDER_ERROR[outcome.failure];
  return { error, reset_at: error === 'QUOTA_EXHAUSTED' || error === 'RATE_LIMIT' ? saneReset(outcome.resetAt, now) : null };
}

/** Thời điểm một profile bị khóa vì hạn mức/giới hạn tốc độ được dùng lại: giờ hãng báo nếu hợp lệ, nếu không thì khoảng chờ mặc định của lõi. */
export function cooldownUntil(kind: 'QUOTA_EXHAUSTED' | 'RATE_LIMIT', resetAt: string | null, recordedAt: Date): Date {
  const stated = resetAt ? new Date(resetAt) : null;
  const health = healthAfterFailure(READY, { kind: 'SWITCH', failure: kind === 'RATE_LIMIT' ? 'RATE_LIMIT' : 'QUOTA', resetAt: stated && !Number.isNaN(stated.getTime()) ? stated : null }, recordedAt);
  return new Date(health.until as string);
}
