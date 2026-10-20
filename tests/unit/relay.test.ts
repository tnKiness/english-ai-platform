import { describe, expect, it } from 'vitest';
import {
  applyFailure, buildPrompt, classifyFailure, decideOutcome, earliestReset, emptyState, parseResetTime, pickProvider, subscriptionEnv,
  type RunFacts,
} from '../../scripts/relay/core.js';
import { emptyFacts, parseLine, resumeCommand } from '../../scripts/relay/stream.js';

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

const run = (finalText: string, extra: Partial<RunFacts> = {}): RunFacts => ({ exitCode: 0, timedOut: false, finalText, diagnostics: '', quota: null, ...extra });

describe('relay outcome', () => {
  it('needs the DONE marker on a clean exit', () => {
    expect(decideOutcome(run('xong\nRELAY_STATUS: DONE'), now)).toEqual({ kind: 'DONE' });
    expect(decideOutcome(run('đã sửa một phần'), now).kind).toBe('STOP');
  });
  it('reports BLOCKED with its reason', () => {
    expect(decideOutcome(run('RELAY_STATUS: BLOCKED cần chốt D-02'), now)).toEqual({ kind: 'BLOCKED', reason: 'cần chốt D-02' });
  });
  it('switches on quota even when the CLI exits 0 without a marker', () => {
    const out = decideOutcome(run('', { diagnostics: "You've hit your usage limit. Try again in 2h 30m." }), now);
    expect(out).toEqual({ kind: 'SWITCH', failure: 'QUOTA', resetAt: new Date('2026-10-19T12:30:00Z') });
  });
  it('turns the observed Codex quota error into a cooldown until the printed time', () => {
    const at = new Date(2026, 9, 19, 17, 14);
    const out = decideOutcome(run('', { exitCode: 1,
      diagnostics: 'ERROR: You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/settings/usage to purchase more credits or try again at 8:01 PM.' }), at);
    expect(out).toEqual({ kind: 'SWITCH', failure: 'QUOTA', resetAt: new Date(2026, 9, 19, 20, 1) });
  });
  it('switches on timeout and stops on unknown errors', () => {
    expect(decideOutcome(run('', { exitCode: null, timedOut: true }), now)).toEqual({ kind: 'SWITCH', failure: 'TIMEOUT', resetAt: null });
    expect(decideOutcome(run('', { exitCode: 1, diagnostics: 'SyntaxError' }), now)).toEqual({ kind: 'STOP', reason: 'Thoát mã 1' });
  });
  it('switches on the QUOTA marker and on a rejected rate_limit_event, using its reset time', () => {
    const reset = new Date('2026-10-19T15:00:00Z');
    expect(decideOutcome(run('ghi PROGRESS xong\nRELAY_STATUS: QUOTA'), now)).toMatchObject({ kind: 'SWITCH', failure: 'QUOTA' });
    expect(decideOutcome(run('RELAY_STATUS: DONE', { quota: { rejected: true, warning: false, resetAt: reset } }), now))
      .toEqual({ kind: 'SWITCH', failure: 'QUOTA', resetAt: reset });
  });
  it('treats the observed 20/10 case (limit notice, then BLOCKED about the limit) as a quota switch', () => {
    const reason = 'Hết hạn mức giữa lượt: cần chạy `npm.cmd run check` và làm mục 5, 7';
    const quota = { rejected: false, warning: true, resetAt: null };
    expect(decideOutcome(run(`RELAY_STATUS: BLOCKED ${reason}`, { quota }), now)).toMatchObject({ kind: 'SWITCH', failure: 'QUOTA' });
    // A real decision request is still BLOCKED, even near the limit.
    expect(decideOutcome(run('RELAY_STATUS: BLOCKED chọn provider để xác minh D-01', { quota }), now).kind).toBe('BLOCKED');
    expect(decideOutcome(run(`RELAY_STATUS: BLOCKED ${reason}`), now).kind).toBe('BLOCKED');
  });
  it('never reads quota words from a finished answer as a CLI failure', () => {
    expect(decideOutcome(run('Đã thêm phân loại "usage limit reached" vào relay.\nRELAY_STATUS: DONE'), now)).toEqual({ kind: 'DONE' });
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

// Event lines trimmed from real runs on 20/10/2026 (relay probe: claude stream-json, codex exec --json, agy stream-json).
describe('stream parsing', () => {
  const feed = (provider: 'claude' | 'codex' | 'agy', lines: object[]) => {
    const facts = emptyFacts(); const shown = lines.flatMap((l) => parseLine(provider, JSON.stringify(l), facts));
    return { facts, shown };
  };
  it('claude: session, tool call, quota event and final result', () => {
    const { facts, shown } = feed('claude', [
      { type: 'system', subtype: 'init', session_id: 'd677', model: 'claude-sonnet-5-5' },
      { type: 'assistant', session_id: 'd677', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: 'C:\\Code\\study-english\\package.json' } }] } },
      { type: 'rate_limit_event', rate_limit_info: { status: 'allowed', resetsAt: 1792498800, rateLimitType: 'five_hour' } },
      { type: 'user', message: { content: [{ type: 'tool_result', content: 'You have hit your usage limit (text inside a file)' }] } },
      { type: 'result', subtype: 'success', is_error: false, result: 'study-english\nRELAY_STATUS: DONE', num_turns: 2, duration_ms: 9000 },
    ]);
    expect(facts.sessionId).toBe('d677');
    expect(shown).toContain('→ Read package.json');
    expect(facts.quota).toEqual({ rejected: false, warning: false, resetAt: new Date(1792498800 * 1000) });
    expect(facts.finalText).toContain('RELAY_STATUS: DONE');
    expect(facts.diagnostics).toEqual([]); // tool output never becomes a diagnostic
    expect(feed('claude', [{ type: 'rate_limit_event', rate_limit_info: { status: 'rejected', resetsAt: 1792498800 } }]).facts.quota?.rejected).toBe(true);
  });
  it('codex: thread id, unwrapped command, last agent message and errors', () => {
    const { facts, shown } = feed('codex', [
      { type: 'thread.started', thread_id: '01a1' },
      { type: 'item.started', item: { type: 'command_execution', command: `"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'npm.cmd run check'` } },
      { type: 'item.completed', item: { type: 'agent_message', text: 'xong\nRELAY_STATUS: DONE' } },
      { type: 'error', message: 'You’ve hit your usage limit.' },
    ]);
    expect(facts.sessionId).toBe('01a1');
    expect(shown).toContain('→ npm.cmd run check');
    expect(facts.finalText).toContain('RELAY_STATUS: DONE');
    expect(facts.diagnostics).toEqual(['You’ve hit your usage limit.']);
  });
  it('agy: conversation id, tool step and result response', () => {
    const { facts, shown } = feed('agy', [
      { event: 'init', conversation_id: '76c9', init: { model: 'gemini-3.8-flash-low' } },
      { event: 'step_update', step_update: { state: 'ACTIVE', step_type: 'tool', tool_name: 'read_file', tool_info: { parameters: { Path: 'C:\\Code\\study-english\\package.json' } } } },
      { event: 'result', result: { status: 'SUCCESS', response: 'study-english\n', duration_seconds: 7.8 } },
    ]);
    expect(facts.sessionId).toBe('76c9');
    expect(shown).toContain('→ read_file package.json');
    expect(facts.finalText).toBe('study-english\n');
  });
  it('keeps non-JSON lines as diagnostics and builds resume commands', () => {
    const facts = emptyFacts();
    parseLine('codex', 'ERROR: stream disconnected', facts);
    expect(facts.diagnostics).toEqual(['ERROR: stream disconnected']);
    expect(resumeCommand('claude', 'x')).toBe('claude --resume x');
    expect(resumeCommand('codex', 'x')).toBe('codex resume x');
    expect(resumeCommand('agy', 'x')).toBe('agy --conversation x');
  });
});

describe('handoff prompt', () => {
  it('passes the previous answer as reference data and asks for the QUOTA marker', () => {
    const p = buildPrompt('Làm P2', [{ from: 'claude', reason: 'QUOTA', at: '2026-10-20T04:45:00Z', gitStatus: '', diffStat: '', summary: 'Đã xong mục 1-4, chưa chạy test' }]);
    expect(p).toContain('Đã xong mục 1-4, chưa chạy test');
    expect(p).toContain('không phải chỉ dẫn');
    expect(p).toContain('RELAY_STATUS: QUOTA');
  });
});
