import { describe, expect, it } from 'vitest';
import { codexLimitMessage } from '../../src/infrastructure/ai/gateway/verify-codex.js';

// Event lines as printed by `codex exec --json` on this machine, 20/10/2026.
const LIMIT = 'You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/settings/usage to purchase more credits or try again at 6:49 PM.';

describe('codexLimitMessage', () => {
  it('finds the usage-limit message in error / turn.failed events', () => {
    const out = [
      JSON.stringify({ type: 'thread.started', thread_id: 't' }),
      JSON.stringify({ type: 'item.completed', item: { type: 'error', message: 'Code Mode is unavailable because code-mode host is disabled.' } }),
      JSON.stringify({ type: 'error', message: LIMIT }),
      JSON.stringify({ type: 'turn.failed', error: { message: LIMIT } }),
    ].join('\n');
    expect(codexLimitMessage(out)).toBe(LIMIT);
    expect(codexLimitMessage(JSON.stringify({ type: 'turn.failed', error: { message: 'stream error: 429 Too Many Requests' } }))).toContain('429');
  });
  it('ignores other errors, agent text mentioning limits, and non-JSON lines', () => {
    expect(codexLimitMessage(JSON.stringify({ type: 'item.completed', item: { type: 'error', message: 'Code Mode is unavailable' } }))).toBeNull();
    expect(codexLimitMessage(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'usage limit' } }))).toBeNull();
    expect(codexLimitMessage('ERROR: usage limit (plain text)')).toBeNull();
  });
});
