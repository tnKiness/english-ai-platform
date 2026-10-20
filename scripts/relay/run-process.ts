import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { join } from 'node:path';

export interface RunResult { exitCode: number | null; timedOut: boolean }

/**
 * Runs a CLI, logs raw output to `logFile`, and hands every complete stdout/stderr line to `onLine`.
 * On timeout/abort kills the whole process tree.
 */
export function runCli(bin: string, args: string[], opts: { cwd: string; env: NodeJS.ProcessEnv; stdin: string | null;
  timeoutMs: number; logFile: string; signal?: AbortSignal; onLine: (line: string, stream: 'stdout' | 'stderr') => void }): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const log = createWriteStream(opts.logFile, { flags: 'a' });
    const child = spawn(bin, args, { cwd: opts.cwd, env: opts.env, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let timedOut = false; let killing: Promise<void> | undefined;
    const kill = () => {
      if (killing || !child.pid) return;
      killing = process.platform === 'win32'
        ? new Promise((done) => {
          const tk = spawn(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'],
            { shell: false, windowsHide: true, stdio: 'ignore' });
          tk.once('error', () => { child.kill(); done(); });
          tk.once('close', () => done());
        })
        : Promise.resolve(void child.kill('SIGKILL'));
    };
    const timer = setTimeout(() => { timedOut = true; kill(); }, opts.timeoutMs);
    const onAbort = () => kill();
    opts.signal?.addEventListener('abort', onAbort, { once: true });
    const pending = { stdout: '', stderr: '' };
    const onData = (stream: 'stdout' | 'stderr') => (chunk: Buffer) => {
      log.write(chunk);
      const lines = (pending[stream] + chunk.toString('utf8')).split(/\r?\n/);
      pending[stream] = lines.pop() ?? '';
      for (const line of lines) opts.onLine(line, stream);
    };
    child.stdout.on('data', onData('stdout'));
    child.stderr.on('data', onData('stderr'));
    child.stdin.on('error', () => undefined); // a CLI may exit before reading stdin
    child.once('error', (error) => { clearTimeout(timer); log.end(); reject(error); });
    child.once('close', (code) => {
      clearTimeout(timer); opts.signal?.removeEventListener('abort', onAbort);
      for (const stream of ['stdout', 'stderr'] as const) if (pending[stream]) opts.onLine(pending[stream], stream);
      void (killing ?? Promise.resolve()).then(() => log.end(() => resolve({ exitCode: code, timedOut })));
    });
    child.stdin.end(opts.stdin ?? '');
  });
}
