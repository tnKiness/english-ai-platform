import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { join } from 'node:path';

export interface RunResult { exitCode: number | null; timedOut: boolean; output: string }

const KEEP = 64 * 1024; // only the tail is needed to classify the outcome

/** Streams a CLI run to the console and a log file; on timeout/abort kills the whole process tree. */
export function runCli(bin: string, args: string[], opts: { cwd: string; env: NodeJS.ProcessEnv; stdin: string | null;
  timeoutMs: number; logFile: string; signal?: AbortSignal; echo: boolean }): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const log = createWriteStream(opts.logFile, { flags: 'a' });
    const child = spawn(bin, args, { cwd: opts.cwd, env: opts.env, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = ''; let timedOut = false; let killing: Promise<void> | undefined;
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
    const onData = (stream: NodeJS.WriteStream) => (chunk: Buffer) => {
      log.write(chunk);
      if (opts.echo) stream.write(chunk);
      output = (output + chunk.toString('utf8')).slice(-KEEP);
    };
    child.stdout.on('data', onData(process.stdout));
    child.stderr.on('data', onData(process.stderr));
    child.stdin.on('error', () => undefined); // a CLI may exit before reading stdin
    child.once('error', (error) => { clearTimeout(timer); log.end(); reject(error); });
    child.once('close', (code) => {
      clearTimeout(timer); opts.signal?.removeEventListener('abort', onAbort);
      void (killing ?? Promise.resolve()).then(() => log.end(() => resolve({ exitCode: code, timedOut, output })));
    });
    child.stdin.end(opts.stdin ?? '');
  });
}
