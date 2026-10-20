import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createRunSandbox } from '../../src/infrastructure/ai/gateway/isolation.js';

const root = mkdtempSync(join(tmpdir(), 'run-sandbox-grant-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('per-run sandbox grant (E-17)', () => {
  it('grants the sandbox group on work/tmp/home only, never on the run dir itself', () => {
    const granted: string[] = [];
    const sb = createRunSandbox('grant-ok', [], root, { grant: (dirs) => granted.push(...dirs) });
    const runDir = dirname(sb.dir);
    expect(granted.sort()).toEqual([sb.dir, sb.homeDir, sb.tempDir].sort());
    expect(granted).not.toContain(runDir); // `..` from cwd must stay under the runner-root Deny
    sb.dispose();
  });

  it('removes the run dir and fails when the grant fails, so no half-prepared sandbox is used', () => {
    expect(() => createRunSandbox('grant-fail', [], root, { grant: () => { throw new Error('SANDBOX_GRANT_FAILED: x'); } }))
      .toThrow('SANDBOX_GRANT_FAILED');
    expect(existsSync(join(root, 'grant-fail'))).toBe(false);
  });

  it('does nothing extra without a grant (non-Codex providers)', () => {
    const sb = createRunSandbox('no-grant', [], root);
    expect(existsSync(sb.dir)).toBe(true);
    sb.dispose();
  });
});
