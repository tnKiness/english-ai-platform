import { describe, expect, it } from 'vitest';
import {
  applyFailure, buildPrompt, classifyFailure, decideOutcome, earliestReset, emptyState, parseResetTime, pickProvider, subscriptionEnv,
} from '../../scripts/relay/core.js';

const now = new Date('2026-10-19T10:00:00Z');

describe('relay failure classification', () => {
  it.each([
    ["You've hit your usage limit. Upgrade your plan or add credits to continue, or try again at 8:01 PM.", 'QUOTA'],
    ['Claude AI usage limit reached|1760900000', 'QUOTA'],
    ['error: {"code":429,"status":"RESOURCE_EXHAUSTED","message":"Quota exceeded"}', 'QUOTA'],
    ['stream error: 429 Too Many Requests', 'RATE_LIMIT'],
    ['API Error: 529 overloaded_error', 'RATE_LIMIT'],
    ['Not logged in. Please run /login', 'AUTH'],
    // Observed verbatim on this machine, 19/10/2026 (relay --smoke).
    ['ERROR: You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/settings/usage to purchase more credits or try again at 8:01 PM.', 'QUOTA'],
    ['Failed to authenticate: OAuth session expired and could not be refreshed', 'AUTH'],
    ['TypeError: cannot read properties of undefined', 'ERROR'],
  ])('%s -> %s', (text, expected) => expect(classifyFailure(text)).toBe(expected));

  it('ignores quota words far before the tail', () => {
    expect(classifyFailure(`usage limit appears in source code\n${'x'.repeat(5000)}\nexit 1`)).toBe('ERROR');
  });
});

describe('relay outcome', () => {
  it('needs the DONE marker on a clean exit', () => {
    expect(decideOutcome({ exitCode: 0, timedOut: false, output: 'xong\nRELAY_STATUS: DONE' }, now)).toEqual({ kind: 'DONE' });
    expect(decideOutcome({ exitCode: 0, timedOut: false, output: 'đã sửa một phần' }, now).kind).toBe('STOP');
  });
  it('reports BLOCKED with its reason', () => {
    expect(decideOutcome({ exitCode: 0, timedOut: false, output: 'RELAY_STATUS: BLOCKED cần chốt D-02' }, now))
      .toEqual({ kind: 'BLOCKED', reason: 'cần chốt D-02' });
  });
  it('switches on quota even when the CLI exits 0 without a marker', () => {
    const out = decideOutcome({ exitCode: 0, timedOut: false, output: "You've hit your usage limit. Try again in 2h 30m." }, now);
    expect(out).toEqual({ kind: 'SWITCH', failure: 'QUOTA', resetAt: new Date('2026-10-19T12:30:00Z') });
  });
  it('turns the observed Codex quota error into a cooldown until the printed time', () => {
    const at = new Date(2026, 9, 19, 17, 14);
    const out = decideOutcome({ exitCode: 1, timedOut: false,
      output: 'ERROR: You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/settings/usage to purchase more credits or try again at 8:01 PM.' }, at);
    expect(out).toEqual({ kind: 'SWITCH', failure: 'QUOTA', resetAt: new Date(2026, 9, 19, 20, 1) });
  });
  it('switches on timeout and stops on unknown errors', () => {
    expect(decideOutcome({ exitCode: null, timedOut: true, output: '' }, now)).toEqual({ kind: 'SWITCH', failure: 'TIMEOUT', resetAt: null });
    expect(decideOutcome({ exitCode: 1, timedOut: false, output: 'SyntaxError' }, now)).toEqual({ kind: 'STOP', reason: 'Thoát mã 1' });
  });
});

describe('reset time parsing', () => {
  it('reads epoch, ISO, retryDelay and relative durations', () => {
    expect(parseResetTime('usage limit reached|1760900000', now)).toEqual(new Date(1760900000 * 1000));
    expect(parseResetTime('resets_at 2026-10-19T15:00:00Z', now)).toEqual(new Date('2026-10-19T15:00:00Z'));
    expect(parseResetTime('"retryDelay": "42s"', now)).toEqual(new Date('2026-10-19T10:00:42Z'));
    expect(parseResetTime('Try again in 1 day 2 hours 5 minutes', now)).toEqual(new Date('2026-10-20T12:05:00Z'));
  });
  it('reads a local clock time and rolls to tomorrow when past', () => {
    const local = new Date(2026, 9, 19, 21, 0); // 21:00 local
    const at = parseResetTime('try again at 8:01 PM', local) as Date;
    expect([at.getDate(), at.getHours(), at.getMinutes()]).toEqual([20, 20, 1]);
    const later = parseResetTime('Your limit resets 11pm', local) as Date;
    expect([later.getDate(), later.getHours()]).toEqual([19, 23]);
  });
  it('returns null for ambiguous text', () => {
    expect(parseResetTime('limit reached at 3', now)).toBeNull();
    expect(parseResetTime('quota exceeded', now)).toBeNull();
  });
});

describe('provider selection', () => {
  it('cools down a quota-hit provider and picks the next one', () => {
    const order = ['claude', 'codex', 'agy'] as const;
    let state = applyFailure(emptyState(), 'claude', { kind: 'SWITCH', failure: 'QUOTA', resetAt: null }, now);
    expect(state.claude.status).toBe('COOLDOWN');
    expect(state.claude.until).toBe('2026-10-19T11:00:00.000Z');
    expect(pickProvider(state, order, now)).toBe('codex');
    state = applyFailure(state, 'codex', { kind: 'SWITCH', failure: 'AUTH', resetAt: null }, now);
    expect(pickProvider(state, order, now)).toBe('agy');
    expect(pickProvider(state, order, now, new Set(['agy']))).toBeNull();
    expect(earliestReset(state, order)).toEqual(new Date('2026-10-19T11:00:00Z'));
    expect(pickProvider(state, order, new Date('2026-10-19T11:00:01Z'))).toBe('claude');
  });
  it('does not penalise a provider for a timeout', () => {
    expect(applyFailure(emptyState(), 'agy', { kind: 'SWITCH', failure: 'TIMEOUT', resetAt: null }, now).agy.status).toBe('READY');
  });
});

describe('subscription guard and prompt', () => {
  it('removes billing/API-key variables from the child environment', () => {
    const { env, removed } = subscriptionEnv({ PATH: 'x', ANTHROPIC_API_KEY: 'k', ANTHROPIC_BASE_URL: 'u', OPENAI_API_KEY: 'k', GEMINI_API_KEY: 'k', GOOGLE_GENAI_USE_VERTEXAI: '1' });
    expect(env).toEqual({ PATH: 'x' });
    expect(removed.sort()).toEqual(['ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'GEMINI_API_KEY', 'GOOGLE_GENAI_USE_VERTEXAI', 'OPENAI_API_KEY']);
  });
  it('embeds AGENTS rules, the handoff and the end marker', () => {
    const p = buildPrompt('Làm P1', [{ from: 'claude', reason: 'QUOTA', at: '2026-10-19T10:00:00Z', gitStatus: ' M PROGRESS.md', diffStat: '1 file changed' }]);
    expect(p).toContain('AGENTS.md');
    expect(p).toContain('lượt gần nhất là claude');
    expect(p).toContain(' M PROGRESS.md');
    expect(p).toContain('RELAY_STATUS: DONE');
    expect(buildPrompt('Làm P1', [])).not.toContain('Tiếp nối');
  });
});
