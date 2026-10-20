import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { runBoundedProcess } from '../../src/infrastructure/ai/bounded-process.js';
const base = { executable: process.execPath, cwd: process.cwd(), input: '', env: { SystemRoot: process.env.SystemRoot }, timeoutMs: 3000, maxOutputBytes: 4096 };
const fixture = resolve('tests/fixtures/process-child.mjs');
it('uses literal stdin and EOF without shell interpretation', async () => {
  const input = '$(echo unsafe) & | `quote` tiếng Việt';
  expect(await runBoundedProcess({ ...base, args: [fixture, 'echo'], input })).toEqual({ stdout: input, stderr: '', code: 0 });
});
it('times out even after stdin closes', async () => {
  await expect(runBoundedProcess({ ...base, timeoutMs: 300, args: [fixture, 'hang'] })).rejects.toThrow('TIMEOUT');
});
it('limits output and supports cancellation', async () => {
  await expect(runBoundedProcess({ ...base, args: [fixture, 'flood'] })).rejects.toThrow('OUTPUT_LIMIT');
  const controller = new AbortController();
  const pending = runBoundedProcess({ ...base, args: [fixture, 'hang'], signal: controller.signal });
  const timer = setTimeout(() => controller.abort(), 300);
  try { await expect(pending).rejects.toThrow('CANCELLED'); } finally { clearTimeout(timer); }
});
it('rejects Windows shell shims', async () => {
  await expect(runBoundedProcess({ ...base, executable: resolve('claude.cmd'), args: [] })).rejects.toThrow('NATIVE_ENTRYPOINT');
});
it.skipIf(process.platform !== 'win32')('terminates a Windows child process tree', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ielts-runner-'));
  try {
    const file = join(dir, 'child.pid');
    await expect(runBoundedProcess({ ...base, args: [fixture, 'tree', file], timeoutMs: 1500 })).rejects.toThrow('TIMEOUT');
    const pid = Number(readFileSync(file, 'utf8'));
    expect(() => process.kill(pid, 0)).toThrow();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
