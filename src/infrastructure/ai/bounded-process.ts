import { spawn } from 'node:child_process';
import { isAbsolute, join } from 'node:path';

export interface ProcessRequest {
  executable: string; args: string[]; cwd: string; input: string;
  env: NodeJS.ProcessEnv; timeoutMs: number; maxOutputBytes: number; signal?: AbortSignal;
}
// Trusted executable/argv only. This supervisor is NOT a filesystem sandbox or billing guard.
export function runBoundedProcess(request: ProcessRequest): Promise<{ stdout: string; code: number | null }> {
  if (!isAbsolute(request.executable) || /\.(cmd|bat|ps1)$/i.test(request.executable)) {
    return Promise.reject(new Error('EXECUTABLE_MUST_BE_ABSOLUTE_NATIVE_ENTRYPOINT'));
  }
  if (request.signal?.aborted) return Promise.reject(new Error('CANCELLED'));
  return new Promise((resolve, reject) => {
    const child = spawn(request.executable, request.args, { cwd: request.cwd, env: request.env,
      shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = ''; let bytes = 0; let failure: string | undefined; let killing: Promise<void> | undefined;
    const stop = (reason: string) => {
      if (failure) return;
      failure = reason;
      if (!child.pid) return;
      if (process.platform === 'win32') {
        const taskkill = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe');
        killing = new Promise<void>((done) => {
          const killer = spawn(taskkill, ['/PID', String(child.pid), '/T', '/F'], { shell: false, windowsHide: true, stdio: 'ignore' });
          killer.once('error', () => { child.kill(); done(); });
          killer.once('close', () => { child.kill(); done(); });
        });
      } else { child.kill('SIGKILL'); }
    };
    const timer = setTimeout(() => stop('TIMEOUT'), request.timeoutMs);
    const abort = () => stop('CANCELLED');
    request.signal?.addEventListener('abort', abort, { once: true });
    // Close the race between the pre-spawn check and event registration.
    if (request.signal?.aborted) stop('CANCELLED');
    const cleanup = () => { clearTimeout(timer); request.signal?.removeEventListener('abort', abort); };
    child.stdout.on('data', (data: Buffer) => {
      bytes += data.length;
      if (bytes > request.maxOutputBytes) stop('OUTPUT_LIMIT');
      else output += data.toString('utf8');
    });
    child.stderr.on('data', (data: Buffer) => {
      bytes += data.length;
      if (bytes > request.maxOutputBytes) stop('OUTPUT_LIMIT');
    });
    child.stdin.on('error', () => stop('STDIN_ERROR'));
    child.once('error', (error) => { cleanup(); reject(error); });
    child.once('close', (code) => {
      cleanup();
      void (killing ?? Promise.resolve()).then(() => {
        if (failure) reject(new Error(failure));
        else resolve({ stdout: output, code });
      });
    });
    child.stdin.end(request.input);
  });
}
