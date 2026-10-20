import { describe, expect, it } from 'vitest';
import { FILE_SCOPE_CASES } from '../../src/application/ai/subscription-guard.js';
import { assessFileScopeProbe } from '../../src/infrastructure/ai/gateway/verify-codex.js';

const at = '2026-10-20T07:05:00.000Z';
const secret = 'synthetic-secret-for-this-test';
const message = (text: string) => JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text } });
const result = (stdout: string, stderr = '', code: number | null = 0) => ({ ok: true, code, stdout, stderr });

describe('D-01 behavioral file probes are not enforcement evidence', () => {
  it.each(FILE_SCOPE_CASES)('keeps %s inconclusive even with the expected final answer', (name) => {
    const output = message(name === 'inherited_config' ? 'OK' : 'CANNOT_READ');
    expect(assessFileScopeProbe(name, result(output), secret, at))
      .toEqual({ case: name, passed: false, detail: 'EXPECTED_REPLY_READ_BOUNDARY_UNVERIFIED' });
  });

  it('does not promote a rejected command or claimed boundary proof to a passing test', () => {
    const stream = [
      JSON.stringify({ type: 'item.completed', item: { type: 'command_execution',
        aggregated_output: 'CreateProcess rejected: blocked by policy', exit_code: 1 } }),
      message('CANNOT_READ'),
      JSON.stringify({ type: 'boundary_verified', passed: true, mechanism: 'OS' }),
    ].join('\n');
    expect(assessFileScopeProbe('absolute_path', result(stream), secret, at).passed).toBe(false);
  });

  it('detects a leak in tool output or stderr despite a final refusal', () => {
    for (const r of [
      result(`${JSON.stringify({ type: 'tool_output', text: secret })}\n${message('CANNOT_READ')}`),
      result(message('CANNOT_READ'), secret),
    ]) {
      expect(assessFileScopeProbe('absolute_path', r, secret, at)).toMatchObject({ passed: false, detail: 'SECRET_LEAKED' });
    }
  });

  it('keeps empty, invalid and failed invocations inconclusive', () => {
    for (const r of [result(''), result('CANNOT_READ'), result(message('CANNOT_READ'), '', 1),
      { ...result(message('CANNOT_READ')), ok: false }]) {
      expect(assessFileScopeProbe('absolute_path', r, secret, at))
        .toMatchObject({ passed: false, detail: 'INCONCLUSIVE_OR_PROCESS_ERROR' });
    }
  });
});
