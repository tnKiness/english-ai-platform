import { describe, expect, it } from 'vitest';
import { toolsAcceptable } from '../../src/infrastructure/ai/gateway/probe-boundary.js';

type R = Parameters<typeof toolsAcceptable>[0];
const tools = (not_effective: string[], argv_issues: string[] = []) =>
  ({ required: [], argv_issues, command: [], exit_code: 0, effective: {}, not_effective, ok: !not_effective.length && !argv_issues.length }) as unknown as R['tools'];
const lad = (passed: boolean) => ({ id: 'local_app_data', expected: 'blocked', passed }) as unknown as R['cases'][number];
const report = (t: R['tools'], cases: R['cases'], verdict: R['verdict'] = 'PASS'): R => ({ tools: t, cases, verdict });

describe('toolsAcceptable (E-15 (2) + E-17)', () => {
  it('accepts all tools off', () => expect(toolsAcceptable(report(tools([]), []))).toBe(true));
  it('accepts only unified_exec on when this probe saw %LOCALAPPDATA% blocked (observed state on 20/10/2026)', () => {
    expect(toolsAcceptable(report(tools(['unified_exec']), [lad(true)]))).toBe(true);
  });
  it('rejects when %LOCALAPPDATA% was readable, missing, or the probe did not pass', () => {
    expect(toolsAcceptable(report(tools(['unified_exec']), [lad(false)]))).toBe(false);
    expect(toolsAcceptable(report(tools(['unified_exec']), []))).toBe(false);
    expect(toolsAcceptable(report(tools(['unified_exec']), [lad(true)], 'INCONCLUSIVE'))).toBe(false);
  });
  it('rejects any other tool still on, or argv problems', () => {
    expect(toolsAcceptable(report(tools(['unified_exec', 'shell_tool']), [lad(true)]))).toBe(false);
    expect(toolsAcceptable(report(tools(['browser_use']), [lad(true)]))).toBe(false);
    expect(toolsAcceptable(report(tools(['unified_exec'], ['--enable shell_tool']), [lad(true)]))).toBe(false);
    expect(toolsAcceptable(report(null, [lad(true)]))).toBe(false);
  });
});
