import { describe, expect, it } from 'vitest';
import { BLOCKED_MARKER, DONE_MARKER, blockedReason, buildPrompt, continuePrompt, relayOutcome, type RouterResult } from '../../scripts/relay/core.js';

const result = (extra: Partial<RouterResult> = {}): RouterResult => ({ status: 'DONE', threadId: 't1', providerId: 'claude', finalText: `Xong.\n${DONE_MARKER}`, reason: null, nextResetAt: null, ...extra });

describe('relay prompt', () => {
  it('carries the project rules, the task and the closing markers', () => {
    const p = buildPrompt('  Sửa lỗi A  ');
    expect(p).toContain('đọc AGENTS.md');
    expect(p).toContain('Không commit, không push');
    expect(p).toContain('## Nhiệm vụ\nSửa lỗi A\n');
    expect(p).toContain(DONE_MARKER);
    expect(p).toContain(BLOCKED_MARKER);
  });

  it('the continue prompt keeps the rules but does not repeat a task', () => {
    const p = continuePrompt();
    expect(p).toContain('Tiếp tục nhiệm vụ đang dở');
    expect(p).toContain('Không commit, không push');
    expect(p).not.toContain('## Nhiệm vụ');
    expect(p).toContain(DONE_MARKER);
  });
});

describe('relay outcome', () => {
  it('maps the router result and the closing line to the relay exit codes', () => {
    expect(relayOutcome(result())).toMatchObject({ status: 'DONE', exitCode: 0 });
    expect(relayOutcome(result({ finalText: `Cần chọn.\n${BLOCKED_MARKER} chọn phương án A hay B` }))).toMatchObject({ status: 'BLOCKED', exitCode: 2, note: expect.stringContaining('phương án A hay B') });
    expect(relayOutcome(result({ status: 'EXHAUSTED', finalText: '', nextResetAt: '2026-11-17T12:00:00Z' }))).toMatchObject({ status: 'EXHAUSTED', exitCode: 75 });
    expect(relayOutcome(result({ status: 'FAILED', finalText: '', reason: 'Thoát mã 1' }))).toMatchObject({ status: 'STOPPED', exitCode: 1, note: expect.stringContaining('Thoát mã 1') });
    expect(relayOutcome(result({ status: 'STOPPED', finalText: '' }))).toMatchObject({ status: 'STOPPED', exitCode: 130 });
  });

  it('reads BLOCKED only from the last line', () => {
    expect(blockedReason(`${BLOCKED_MARKER} cũ\nĐã xử lý.\n${DONE_MARKER}`)).toBeNull();
    expect(blockedReason(`x\n${BLOCKED_MARKER}\n\n`)).toBe('(không nêu lý do)');
  });
});
