// ĐỒNG BỘ TỪ ai-router/src/core — KHÔNG sửa tay. Sửa ở ai-router rồi chạy `npm run router:sync` (E-24).
// Provider health and failover order. Pure.
import type { Outcome, ProviderHealth } from './types.js';

export const DEFAULT_COOLDOWN_MS: Record<'QUOTA' | 'RATE_LIMIT' | 'UNAVAILABLE', number> = { QUOTA: 60 * 60_000, RATE_LIMIT: 5 * 60_000, UNAVAILABLE: 60_000 };
export const READY: ProviderHealth = { status: 'READY', until: null, reason: null };

/** New health after a SWITCH outcome. TIMEOUT does not penalise the provider (the task may simply be long). */
export function healthAfterFailure(current: ProviderHealth, outcome: Extract<Outcome, { kind: 'SWITCH' }>, now: Date): ProviderHealth {
  if (outcome.failure === 'AUTH') return { status: 'NEEDS_LOGIN', until: null, reason: 'AUTH' };
  if (outcome.failure === 'QUOTA' || outcome.failure === 'RATE_LIMIT' || outcome.failure === 'UNAVAILABLE') {
    const until = outcome.resetAt && outcome.resetAt > now ? outcome.resetAt : new Date(now.getTime() + DEFAULT_COOLDOWN_MS[outcome.failure]);
    return { status: 'COOLDOWN', until: until.toISOString(), reason: outcome.failure };
  }
  return current;
}

export function isAvailable(h: ProviderHealth, now: Date): boolean {
  if (h.status === 'READY') return true;
  return h.status === 'COOLDOWN' && h.until !== null && new Date(h.until) <= now;
}

/** A subscription that reported it is close to its limit (Claude's "allowed_warning"); `until` is when the window resets. */
export const NEAR_LIMIT = 'NEAR_LIMIT';
export const isNearLimit = (h: ProviderHealth, now: Date) => h.status === 'READY' && h.reason === NEAR_LIMIT && h.until !== null && new Date(h.until) > now;
export const nearLimitHealth = (resetAt: Date | null, now: Date): ProviderHealth =>
  ({ status: 'READY', until: (resetAt && resetAt > now ? resetAt : new Date(now.getTime() + DEFAULT_COOLDOWN_MS.QUOTA)).toISOString(), reason: NEAR_LIMIT });

export interface Candidate { id: string; enabled: boolean; priority: number; health: ProviderHealth; /** Billed by subscription (a CLI), not per token. */ subscription?: boolean }

/**
 * Providers to try, in priority order; a preferred one goes first. Unavailable ones are left out.
 * A subscription that is close to its limit yields its place to the other subscriptions, so a new turn does not start
 * on an account likely to run out halfway. It never falls behind a paid API provider: that would spend money to save quota.
 */
export function failoverOrder(candidates: readonly Candidate[], now: Date, preferred?: string | null): string[] {
  const sorted = candidates.filter((c) => c.enabled && isAvailable(c.health, now)).sort((a, b) => a.priority - b.priority);
  const subs = sorted.filter((c) => c.subscription);
  const queue = [...subs.filter((c) => !isNearLimit(c.health, now)), ...subs.filter((c) => isNearLimit(c.health, now))];
  const usable = sorted.map((c) => (c.subscription ? (queue.shift() as Candidate) : c).id);
  if (preferred && usable.includes(preferred)) return [preferred, ...usable.filter((id) => id !== preferred)];
  return usable;
}

export function earliestReset(candidates: readonly Candidate[]): Date | null {
  const times = candidates.filter((c) => c.enabled && c.health.status === 'COOLDOWN' && c.health.until).map((c) => new Date(c.health.until as string).getTime());
  return times.length ? new Date(Math.min(...times)) : null;
}
